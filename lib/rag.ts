import { findDocs, insertDoc, removeDocs } from "./db";
import { decoupe } from "./cours";
import { vecteursGemini } from "./gemini";

/* RAG du module Cours : le texte d'un chapitre est découpé en passages, chaque passage reçoit un
   vecteur (Gemini embedding) et la recherche compare les vecteurs en JS — le mongod local ne
   connaît pas $vectorSearch. Sans clé ou hors réseau, les passages sont quand même stockés avec un
   vecteur vide et la recherche retombe sur le recouvrement de mots : le quiz reste ancré sur le
   texte réel du prof, jamais sur l'imagination du modèle. */

export type Passage = {
  id?: number;
  cours_id: number;
  matiere_id: number;
  index: number;
  texte: string;
  vecteur: number[];
};

const mots = (t: string) =>
  String(t)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3);

export function normaliseVecteur(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  if (!n) return v;
  const r = Math.sqrt(n);
  return v.map((x) => x / r);
}

function cosinus(a: number[], b: number[]): number {
  const taille = Math.min(a.length, b.length);
  if (!taille) return 0;
  let s = 0;
  for (let i = 0; i < taille; i++) s += a[i] * b[i];
  return s;
}

function recouvrement(question: string, passage: string): number {
  const q = new Set(mots(question));
  if (!q.size) return 0;
  const p = new Set(mots(passage));
  let commun = 0;
  for (const w of q) if (p.has(w)) commun++;
  return commun / q.size;
}

/* Indexe (ou ré-indexe) un chapitre : on repart du texte à chaque fois, donc une modification
   du prof ou du fichier remplace proprement les passages précédents. */
export async function indexerCours(cours: {
  id: number;
  matiere_id: number;
  texte: string;
}): Promise<{ passages: number; vecteurs: boolean }> {
  const blocs = decoupe(cours.texte);
  await removeDocs("cours_passages", { cours_id: cours.id });
  if (!blocs.length) return { passages: 0, vecteurs: false };

  const plongements = (await vecteursGemini(blocs))?.filter((v) => v.length > 0);
  const avecVecteurs = !!plongements && plongements.length === blocs.length;

  let n = 0;
  for (let i = 0; i < blocs.length; i++) {
    await insertDoc("cours_passages", {
      cours_id: cours.id,
      matiere_id: cours.matiere_id,
      index: i,
      texte: blocs[i],
      vecteur: normaliseVecteur(avecVecteurs ? plongements![i] : []),
    });
    n++;
  }
  return { passages: n, vecteurs: avecVecteurs };
}

export const passagesDeCours = (coursId: number) =>
  findDocs<Passage>("cours_passages", { cours_id: coursId }, { sort: { index: 1 } });

export const passagesDeMatiere = (matiereId: number) =>
  findDocs<Passage>("cours_passages", { matiere_id: matiereId }, { sort: { cours_id: 1, index: 1 } });

// Les passages avec vecteur servent la recherche sémantique ; les autres la recherche par mots.
export async function chercherPassages(question: string, passages: Passage[], k = 4): Promise<Passage[]> {
  if (!passages.length) return [];
  const semantique = passages.every((p) => p.vecteur?.length > 0);
  if (semantique) {
    const [v] = (await vecteursGemini([question])) ?? [];
    if (v?.length) {
      const q = normaliseVecteur(v);
      return passages
        .map((p) => ({ p, s: cosinus(q, p.vecteur) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, k)
        .map((x) => x.p);
    }
  }
  return passages
    .map((p) => ({ p, s: recouvrement(question, p.texte) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.p);
}

/* Tirage d'un quiz : on melange avec une graine propre a l eleve (deux eleves du meme chapitre
   ne tombent pas sur les memes passages), puis on prend au maximum un passage par chapitre quand
   le quiz est global, pour couvrir toute la matiere. */
export function melanger<T>(tableau: T[], graine: number): T[] {
  const sortie = [...tableau];
  let etat = graine >>> 0 || 1;
  const suite = () => {
    etat ^= etat << 13;
    etat ^= etat >>> 17;
    etat ^= etat << 5;
    return (etat >>> 0) / 4294967296;
  };
  for (let i = sortie.length - 1; i > 0; i--) {
    const j = Math.floor(suite() * (i + 1));
    [sortie[i], sortie[j]] = [sortie[j], sortie[i]];
  }
  return sortie;
}

export function passagesPourQuiz(passages: Passage[], nb: number, graine: number): Passage[] {
  const tires = melanger(passages, graine);
  const parCours = new Map<number, Passage[]>();
  for (const p of tires) {
    const liste = parCours.get(p.cours_id) ?? [];
    liste.push(p);
    parCours.set(p.cours_id, liste);
  }
  // rotation chapitre par chapitre : un passage de chaque chapitre avant de reprendre
  const sortie: Passage[] = [];
  const tours = Math.max(...[...parCours.values()].map((l) => l.length), 0);
  for (let t = 0; t < tours && sortie.length < nb; t++) {
    for (const liste of parCours.values()) if (liste[t]) sortie.push(liste[t]);
  }
  return sortie.slice(0, nb);
}
