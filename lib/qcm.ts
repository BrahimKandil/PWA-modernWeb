import { jsonAvecGemini } from "./gemini";
import { melanger, type Passage } from "./rag";

/* QCM ancré sur le cours : le modèle ne reçoit que des passages du chapitre déposé par le prof et
   doit en citer un. Aucun fait inventé n'entre dans le quiz. Sans clé, sans réseau, ou si la réponse
   est invalide, on fabrique les mêmes questions par règles : une phrase du cours contre des phrases
   d'autres passages — l'élève reconnaît ce qui appartient au chapitre. */

export type Question = {
  enonce: string;
  options: string[];
  bonne: number;
  passage: number; // index du passage d'origine, pour la correction affichée
};

export type QcmGenere = { questions: Question[]; source: "ia" | "local" };

const propre = (s: string) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();

const cle = (s: string) =>
  propre(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

export const sansReponse = (q: Question) => ({
  enonce: q.enonce,
  options: q.options,
  passage: q.passage,
});

function phrases(texte: string): string[] {
  return texte
    .split(/(?<=[.!?;:])\s+|\n+/)
    .map(propre)
    .filter((p) => p.length >= 40 && p.length <= 220 && /[a-zà-ÿ]/i.test(p));
}

/* Une question à partir d'une phrase du chapitre : la bonne réponse est cette phrase,
   les leurres sont des phrases d'autres passages (elles sont vraies ailleurs, pas ici). */
function questionLocale(phrase: string, leurres: string[], index: number): Question | null {
  const autres = melanger(
    leurres.filter((l) => cle(l) !== cle(phrase)).slice(0, 12),
    cle(phrase).length * 7 + 13
  ).slice(0, 3);
  if (autres.length < 3) return null;

  const sujet = phrase.match(/^\s*(?:L'|Le |La |Les )?([A-ZÀ-Ý][\wà-ÿ' -]{2,40}?)\s+(?:est|sont|désigne|regroupe|permet|oblige|vise|correspond)/);
  const terme = sujet ? propre(sujet[1]) : "";
  const enonce = terme
    ? `D'après le chapitre, que dit-on à propos de « ${terme} » ?`
    : `Quelle affirmation appartient à ce chapitre ?`;

  const options = melanger([phrase, ...autres], cle(phrase).length + index).slice(0, 4);
  const bonne = options.indexOf(phrase);
  if (bonne < 0 || new Set(options.map(cle)).size !== options.length) return null;
  return { enonce, options, bonne, passage: index };
}

function qcmLocal(passages: Passage[]): Question[] {
  const groupe = passages.map((p, i) => ({ i, liste: phrases(p.texte) })).filter((x) => x.liste.length > 0);
  const questions: Question[] = [];
  const vues = new Set<string>();

  for (const { i, liste } of groupe) {
    const leurres = groupe.filter((g) => g.i !== i).flatMap((g) => g.liste);
    for (const phrase of melanger(liste, i + 1)) {
      const q = questionLocale(phrase, leurres, i);
      if (!q) continue;
      const marque = cle(q.enonce);
      if (vues.has(marque)) continue;
      vues.add(marque);
      questions.push(q);
      break; // une question par passage : le quiz balaie le chapitre au lieu de le répéter
    }
  }
  return questions;
}

/* Le modèle doit répondre par un tableau JSON strictement validé : toute question douteuse
   (moins de 4 options, réponse hors bornes, énoncé recopié du prompt) est jetée, pas corrigée. */
async function qcmGemini(passages: Passage[], contexte: string): Promise<Question[]> {
  const corpus = passages
    .map((p, i) => `[P${i}] ${propre(p.texte).slice(0, 900)}`)
    .join("\n\n");

  const brut = await jsonAvecGemini(
    `Tu es un enseignant qui prépare un QCM pour l'application ARP. Tu ne réponds QUE avec un JSON, sans commentaire.
Tu n'utilises QUE les passages du cours fournis. N'invente aucun fait, aucun sigle, aucun chiffre.
Format exact : {"questions":[{"enonce":"...","options":["...","...","...","..."],"bonne":0,"passage":0}]}
Règles : 4 options par question, une seule correcte ; "bonne" = index de l'option correcte (0 à 3) ;
"passage" = le numéro [Pn] du passage qui justifie la réponse ; les leurres doivent être plausibles mais fausses d'après le cours.
${contexte}`,
    `Passages du cours :\n${corpus}\n\nRédige 8 questions.`
  );

  const liste = Array.isArray(brut?.questions) ? brut.questions : [];
  const sorties: Question[] = [];
  const vues = new Set<string>();

  for (const q of liste) {
    const enonce = propre(q?.enonce);
    const options: string[] = Array.isArray(q?.options) ? q.options.map((x: unknown) => propre(String(x))) : [];
    const bonne = Number(q?.bonne);
    const passage = Number(q?.passage);
    if (enonce.length < 15) continue;
    if (options.length !== 4 || options.some((o) => o.length < 2)) continue;
    if (!Number.isInteger(bonne) || bonne < 0 || bonne > 3) continue;
    if (options.some((o) => !/[\u00c0-\u024f\w]/.test(o))) continue;
    if (new Set(options.map(cle)).size !== 4) continue;
    if (vues.has(cle(enonce))) continue;
    vues.add(cle(enonce));
    sorties.push({
      enonce,
      options,
      bonne,
      passage: Number.isInteger(passage) && passage >= 0 && passage < passages.length ? passage : 0,
    });
  }
  return sorties;
}

export async function genererQcm(passages: Passage[], contexte: string, nb: number): Promise<QcmGenere> {
  if (passages.length === 0) return { questions: [], source: "local" };
  const ia = await qcmGemini(passages, contexte);
  if (ia.length >= Math.min(3, nb)) {
    return { questions: melanger(ia, passages.length * 31 + nb).slice(0, nb), source: "ia" };
  }
  const local = qcmLocal(passages);
  if (!local.length) return { questions: [], source: "local" };
  // l'IA n'a pas donné assez de questions exploitables : on complète avec le moteur de règles
  const fusion = [...ia, ...melanger(local.filter((l) => !ia.some((x) => cle(x.enonce) === cle(l.enonce))), nb)];
  return { questions: fusion.slice(0, nb), source: ia.length ? "ia" : "local" };
}

export type Correction = { justes: number; total: number; note: number; lignes: { question: Question; choisie: number | null; juste: boolean }[] };

/* Note sur 20, arrondie au quart de point. Elle ne rejoint jamais la collection « notes » :
   le quiz mesure une compétence, il ne participe pas à la moyenne de la matière. */
export function corriger(questions: Question[], reponses: (number | null)[]): Correction {
  let justes = 0;
  const lignes = questions.map((question, i) => {
    const choisie = reponses[i];
    const juste = choisie === question.bonne;
    if (juste) justes++;
    return { question, choisie: typeof choisie === "number" ? choisie : null, juste };
  });
  const total = questions.length;
  const note = total ? Math.round((justes / total) * 80) / 4 : 0;
  return { justes, total, note, lignes };
}
