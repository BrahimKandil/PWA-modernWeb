import { readFileSync } from "fs";
import path from "path";

/* Cle lue hors du depot : .assistant-secret a la racine (1re ligne = cle, 2e ligne = modele optionnel),
   ou la variable d'environnement GEMINI_API_KEY. Sans cle l'assistant reste sur le moteur local. */

/* Liste vérifiée avec une clé gratuite (octobre 2026) : les identifiants 2.0/2.5 « flash » sont refusés
   (404) aux nouveaux comptes et « gemini-flash-latest » met ~3 minutes à répondre — éliminés.
   « gemini-flash-lite-latest » rejette thinking_budget (400). 3.5-flash ≈ 2,5 s, 3.1-flash-lite ≈ 5 s. */
const MODELES_PAR_DEFAUT = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"];
const DELAI_MS = 45000;

type Config = { cle: string; modeles: string[] };

let config: Config | null | undefined;

export function cleGemini(): Config | null {
  if (config !== undefined) return config;
  const cle = (process.env.GEMINI_API_KEY ?? "").trim();
  if (cle) {
    config = { cle, modeles: MODELES_PAR_DEFAUT };
    return config;
  }
  try {
    const lignes = readFileSync(path.join(process.cwd(), ".assistant-secret"), "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lignes.length) {
      config = {
        cle: lignes[0],
        modeles: lignes[1] ? [lignes[1], ...MODELES_PAR_DEFAUT.filter((m) => m !== lignes[1])] : MODELES_PAR_DEFAUT,
      };
      return config;
    }
  } catch {
    // pas de fichier : hors IA
  }
  config = null;
  return config;
}

export function reinitialiserCle() {
  config = undefined;
}

type Message = { role: "user" | "model"; texte: string };

type OptionsAppel = { temperature?: number; maxTokens?: number; json?: boolean };

async function appeler(
  modele: string,
  cle: string,
  system: string,
  historiques: Message[],
  opts: OptionsAppel = {}
): Promise<Response> {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": cle },
    signal: AbortSignal.timeout(DELAI_MS),
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: historiques.map((m) => ({ role: m.role, parts: [{ text: m.texte }] })),
      generation_config: {
        temperature: opts.temperature ?? 0.5,
        max_output_tokens: opts.maxTokens ?? 1600,
        /* Les Flash « pensent » par défaut : sans plafond, ces tokens remplissent max_output_tokens
           et la réponse part en MAX_TOKENS, coupée avant la ligne PROPOSITIONS. */
        thinking_config: { thinking_budget: 0 },
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
      },
      safety_settings: [],
    }),
  });
}

/* Renvoie la reponse du modele, ou null : pas de cle, tous les modeles epuises, reponse vide.
   400 (parametre refuse), 404 (modele ferme), 429 et 5xx (modele sature) font passer au modele suivant. */
export async function repondreAvecGemini(system: string, historiques: Message[]): Promise<string | null> {
  const cfg = cleGemini();
  if (!cfg) return null;
  const debut = Date.now();

  for (const modele of cfg.modeles) {
    if (Date.now() - debut > DELAI_MS) break; // au-dela l'eleve attend trop : le moteur local reprend
    let res: Response;
    try {
      res = await appeler(modele, cfg.cle, system, historiques);
    } catch {
      continue; // delai depasse ou reseau instable : on tente l'autre modele
    }
    if (res.status === 400 || res.status === 404 || res.status === 429 || res.status >= 500) continue;
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const texte = json?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text ?? "")
      .join("")
      .trim();
    if (texte) return texte;
    // modele joignable mais incapable (filtre/safety) : on laisse le moteur local reprendre
    return null;
  }
  return null;
}

/* même parcours que repondreAvecGemini, mais sortie attendue en JSON strict (le QCM).
   On renvoie l'objet déjà parsé, ou null : l'appelant retombe alors sur ses règles locales. */
export async function jsonAvecGemini(
  system: string,
  question: string,
  opts: OptionsAppel = {}
): Promise<any | null> {
  const cfg = cleGemini();
  if (!cfg) return null;
  const debut = Date.now();

  for (const modele of cfg.modeles) {
    if (Date.now() - debut > DELAI_MS) break;
    let res: Response;
    try {
      res = await appeler(modele, cfg.cle, system, [{ role: "user", texte: question }], {
        temperature: 0.7,
        maxTokens: 2400,
        json: true,
        ...opts,
      });
    } catch {
      continue;
    }
    if (res.status === 400 || res.status === 404 || res.status === 429 || res.status >= 500) continue;
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const texte = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("").trim();
    if (!texte) continue;
    try {
      return JSON.parse(texte.replace(/^```json\s*|```$/g, ""));
    } catch {
      continue; // réponse trop coupée ou hors format : modèle suivant
    }
  }
  return null;
}

/* Plongements (RAG) : gemini-embedding-001 rend 3072 dimensions, on demande 768 (le modèle est
   « Matryoshka » : les premières dimensions restent pertinentes) pour que la base locale reste légère.
   Le mongod d'ici ne connaît pas $vectorSearch (réservé à Atlas) : la comparaison cosinus se fait en JS. */
const MODELE_PLONGEMENT = process.env.GEMINI_EMBEDDING ?? "gemini-embedding-001";
const DIMENSIONS = Number(process.env.GEMINI_DIMENSIONS ?? 768);

export async function vecteursGemini(textes: string[]): Promise<number[][] | null> {
  const cfg = cleGemini();
  if (!cfg || textes.length === 0) return null;
  const sortie: number[][] = [];

  for (let i = 0; i < textes.length; i += 16) {
    const groupe = textes.slice(i, i + 16);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELE_PLONGEMENT}:batchEmbedContents`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": cfg.cle },
        signal: AbortSignal.timeout(DELAI_MS),
        body: JSON.stringify({
          requests: groupe.map((t) => ({
            model: `models/${MODELE_PLONGEMENT}`,
            content: { parts: [{ text: t.slice(0, 8000) }] },
            outputDimensionality: DIMENSIONS,
          })),
        })
      }
    ).catch(() => null);
    if (!res?.ok) return sortie.length ? sortie : null;
    const json = await res.json().catch(() => null);
    const plongements = json?.embeddings;
    if (!Array.isArray(plongements)) return sortie.length ? sortie : null;
    for (const e of plongements) sortie.push(Array.isArray(e?.values) ? e.values.map(Number) : []);
  }
  return sortie;
}
