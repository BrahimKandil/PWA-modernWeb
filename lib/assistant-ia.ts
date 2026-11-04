import { findDocs, insertDoc, updateDoc, nowLocal } from "./db";
import type { SessionUser } from "./auth";
import { contexte } from "./assistant-contexte";
import { cleGemini, repondreAvecGemini } from "./gemini";
import { repondre, refusConnu } from "./assistant";

export const LIMITE_JOUR = Number(process.env.ASSISTANT_QUOTA ?? 40);

function aujourdhui() {
  return nowLocal().slice(0, 10);
}

async function usage(session: SessionUser) {
  const jour = aujourdhui();
  const [ligne] = await findDocs("assistant_usage", { user_id: session.id, jour });
  return { jour, nb: ligne?.nb ?? 0, id: ligne?.id ?? null };
}

export async function restantQuota(session: SessionUser) {
  if (!cleGemini()) return null;
  const { nb } = await usage(session);
  return Math.max(0, LIMITE_JOUR - nb);
}

async function consommer(session: SessionUser) {
  const { jour, nb, id } = await usage(session);
  if (id == null) await insertDoc("assistant_usage", { user_id: session.id, jour, nb: 1 });
  else await updateDoc("assistant_usage", { id }, { nb: nb + 1 });
  return Math.max(0, LIMITE_JOUR - nb - 1);
}

const PROFIL = (role: SessionUser["role"]) =>
  role === "admin"
    ? "Tu parles a un administrateur : il a acces a tout l etablissement."
    : role === "prof"
      ? "Tu parles a un professeur : il ne voit que ses matieres, ses etudiants et ses creneaux."
      : "Tu parles a un etudiant : il ne voit que SA classe, SES notes, SES absences, SES comptes rendus.";

function consignes(session: SessionUser, donnees: string) {
  return [
    "Tu es l'assistant de ARP Education, une application de gestion scolaire (emplois du temps, presences, notes, comptes rendus, reclamations). Tu es un tuteur calme et pedagogue, pas un formulaire.",
    "Tu reponds en francais. N'IMPORTE QUELLE question de l'utilisateur est legitime : ne la ramene jamais a une liste de questions autorisees et ne demande pas de reformuler. Longueur : 3 a 8 phrases, ou un plan structure si la question le merite (titres courts, puces).",
    "PROFIL : " + PROFIL(session.role),
    "",
    "DEUX TYPES DE DEMANDES :",
    "A) Question sur la scolarite de CE compte (horaires, salle, note, moyenne, absence, CR a rendre, reclamation, fonctionnement de l'app) : repond exclusivement a partir des DONNEES ci-dessous. Une donnee absente n'existe pas : dis en une phrase ce qui manque et vers quel ecran aller.",
    "B) Travail academique (resumer un cours, construire un plan de compte rendu, faire une fiche de revision, expliquer une notion, reformuler un paragraphe, proposer des questions d'entrainement ou un QCM, verifier une methode de calcul) : la tu peux utiliser tes propres connaissances, meme hors des donnees. Appuie-toi sur les matieres, coefficients et statistiques visibles ci-dessous pour contextualiser (exemple : « en BDD, coef 3, tu as 11.4 : concentre-toi sur les jointures »). Produis un brouillon, une trame, une demarche : l'etudiant doit rédiger lui-meme le texte rendu.",
    "",
    "REGLES ABSOLUES :",
    "1) Lecture seule : tu n'ecris rien dans l'application, tu ne modifie aucune note, absence, droit, matiere, salle, code ou base. Si on te le demande, explique en une phrase qui peut le faire et dans quel ecran.",
    "2) Tu ne demandes et ne communiques jamais un mot de passe, un identifiant, un jeton ou une cle.",
    "3) Hors " + (session.role === "admin" ? "de l etablissement : " : "du perimetre de ce compte : ") + "jamais les données d'autres etudiants, d'autres classes ou d'autres professeurs que ceux presents ci-dessous. Refuse poliment et rappelle le perimetre.",
    "4) N'invente jamais un fait chiffré sur ce compte (note, date, salle, coefficient) qui ne figure pas dans les donnees.",
    "5) Hors scolarite et hors academique pur (politique, vie privee, code malveillant, contenu a caractere officiel) : une phrase de rappel de ton role, puis propose une question scolaire.",
    "",
    "FORMAT DE FIN DE REPONSE (obligatoire) : apres ta reponse, ajoute une derniere ligne exacte :",
    "PROPOSITIONS: question 1 | question 2 | question 3",
    "Ces trois questions sont des suggestions que l'utilisateur peut cliquer : courte (moins de 60 caracteres chacune), formulee a la premiere personne, dans la continuation logique de sa demande, et melant donnees personnelles et travail academique. Exemple : PROPOSITIONS: quel est mon prochain cours ? | fais une fiche de revision sur les jointures | comment contester une note ?",
    "",
    "DONNEES DE CE COMPTE : " + donnees,
  ].join("\n");
}

/* Tolère le gras markdown (« **PROPOSITIONS :** … ») que le modèle ajoute parfois. */
const LIGNE_PROPOSITIONS = /^\s*[*_#\s>]*PROPOSITIONS\s*[:\-–—]?\s*(.+)\s*$/im;

function nettoyer(texte: string): { reponse: string; suggestions: string[] } {
  const m = texte.match(LIGNE_PROPOSITIONS);
  const suggestions = (m?.[1] ?? "")
    .split("|")
    .map((s) => s.replace(/^[-*\u2022\s]+/, "").replace(/[*_\s]+$/, "").replace(/[?!.]\s*$/, "?").trim())
    .filter((s) => s.length > 3 && s.length < 80)
    .slice(0, 3);
  const reponse = texte.replace(LIGNE_PROPOSITIONS, "").trim();
  return { reponse, suggestions };
}

/* Trois etages : refus deterministe (meme sans reseau) → Gemini avec contexte limite au role →
   moteur local a mots-cles si la cle manque, que Google refuse ou que le quota est epuise. */
export async function reponseAssistant(
  session: SessionUser,
  question: string,
  historique: { role: "user" | "model"; texte: string }[] = []
): Promise<{ reponse: string; suggestions: string[]; source: "ia" | "local"; restant: number | null }> {
  const refus = refusConnu(session, question);
  if (refus) return { reponse: refus, suggestions: [], source: "local", restant: await restantQuota(session) };

  if (cleGemini()) {
    const { nb } = await usage(session);
    if (nb < LIMITE_JOUR) {
      const donnees = await contexte(session);
      const texte = await repondreAvecGemini(consignes(session, donnees), [
        ...historique.slice(-6),
        { role: "user", texte: question.slice(0, 300) },
      ]);
      if (texte) {
        const { reponse, suggestions } = nettoyer(texte);
        return { reponse, suggestions, source: "ia", restant: await consommer(session) };
      }
    } else {
      return {
        reponse:
          `Quota IA atteint pour aujourd'hui (${LIMITE_JOUR} questions par compte). ` +
          "Je reponds avec mes regles internes, sans modele. " +
          (await repondre(session, question)).replace(/^Je n'ai pas reconnu ta question\.\s*/, ""),
        suggestions: [],
        source: "local",
        restant: 0,
      };
    }
  }

  return { reponse: await repondre(session, question), suggestions: [], source: "local", restant: null };
}
