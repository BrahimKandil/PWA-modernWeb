import { NextRequest } from "next/server";
import { getSession, type SessionUser } from "@/lib/auth";
import { findOne, findDocs, insertDoc, updateDoc, isDup, nowLocal } from "@/lib/db";
import { peut } from "@/lib/permissions";
import { routeurRetour } from "@/lib/retour";
import { passagesDeCours, passagesDeMatiere, passagesPourQuiz } from "@/lib/rag";
import { genererQcm, corriger, type Question } from "@/lib/qcm";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

// Un QCM de chapitre compte 6 questions, le QCM global 8 : assez pour noter, pas assez pour épuiser.
const NB_CHAPITRE = 6;
const NB_GLOBAL = 8;

const cle = (form: FormData, nom: string) => String(form.get(nom) ?? "").trim();

/* Un quiz = un chapitre, ou la matière entière quand le prof a terminé tous ses chapitres.
   La « cle » est l'empreinte unique qui interdit la seconde tentative. */
type Cible = { cle: string; matiere_id: number; cours_id: number | null; nb: number; titre: string };

async function resoudreCible(session: SessionUser, form: FormData): Promise<{ cible: Cible } | { erreur: string }> {
  const matiereId = Number(form.get("matiere_id")) || 0;
  const coursId = Number(form.get("cours_id")) || 0;
  const global = cle(form, "global") === "1";

  const matiere = matiereId ? await findOne("matieres", { id: matiereId }) : null;
  if (!matiere) return { erreur: "matière introuvable" };

  // L'élève ne travaille que la matière de SA classe.
  if (session.role === "etudiant" && matiere.classe_id !== session.classe_id) {
    return { erreur: "cette matière ne fait pas partie de votre classe" };
  }

  if (global) {
    const chapitres = await findDocs("cours", { matiere_id: matiere.id }, { sort: { numero: 1 } });
    if (!chapitres.length) return { erreur: "aucun chapitre déposé pour cette matière" };
    if (chapitres.some((c: any) => !c.terme)) {
      return { erreur: "le QCM global s'ouvre quand le professeur a terminé tous les chapitres" };
    }
    return {
      cible: {
        cle: `global:${matiere.id}`,
        matiere_id: matiere.id,
        cours_id: null,
        nb: NB_GLOBAL,
        titre: `QCM global — ${matiere.code} (${chapitres.length} chapitres)`,
      },
    };
  }

  const cours = coursId ? await findOne("cours", { id: coursId }) : null;
  if (!cours) return { erreur: "chapitre introuvable" };
  if (cours.matiere_id !== matiere.id) return { erreur: "chapitre hors de cette matière" };
  if (!cours.terme) return { erreur: "le professeur n'a pas encore terminé ce chapitre" };
  return {
    cible: {
      cle: `chapitre:${cours.id}`,
      matiere_id: matiere.id,
      cours_id: cours.id,
      nb: NB_CHAPITRE,
      titre: `Chapitre ${cours.numero} — ${cours.titre}`,
    },
  };
}

export async function POST(req: NextRequest) {
  const { erreur, ok, refus } = routeurRetour(req, "/cours/quiz");
  const session = await getSession();
  // Seul l'élève « cree » ici : sa propre copie de quiz.
  if (!session || !peut(session.role, "cours", "creer")) return refus();

  const form = await req.formData();
  const action = cle(form, "action");

  if (action === "demarrer") {
    const resolve = await resoudreCible(session, form);
    if ("erreur" in resolve) return erreur(resolve.erreur);
    const cible = resolve.cible;

    const deja = await findOne("quiz_passations", { etudiant_id: session.id, cle: cible.cle });
    if (deja) return erreur("quiz déjà passé : une seule tentative par élève");

    const passages = cible.cours_id
      ? await passagesDeCours(cible.cours_id)
      : await passagesDeMatiere(cible.matiere_id);
    if (passages.length === 0) return erreur("chapitre non indexé : le professeur doit le ré-enregistrer");

    // Graine propre à l'élève + à l'instant : deux élèves du même chapitre ne reçoivent pas le même QCM.
    const graine = (session.id * 2654435761 + Date.now()) >>> 0;
    const tires = passagesPourQuiz(passages, cible.nb, graine);
    const matiere = await findOne("matieres", { id: cible.matiere_id });
    const gen = await genererQcm(
      tires,
      `Contexte : chapitre « ${cible.titre} » de la matière ${matiere?.nom ?? ""} (classe ${session.classe_nom ?? ""}). Niveau : débutants.`,
      cible.nb
    );
    if (gen.questions.length < 3) return erreur("trop peu de contenu exploitable pour générer un quiz");

    try {
      await insertDoc("quiz_passations", {
        etudiant_id: session.id,
        matiere_id: cible.matiere_id,
        cours_id: cible.cours_id,
        cle: cible.cle,
        titre: cible.titre,
        questions: gen.questions,
        reponses: [],
        note: null,
        soumis: 0,
        source: gen.source,
        cree_le: nowLocal(),
      });
    } catch (err) {
      if (isDup(err)) return erreur("quiz déjà passé : une seule tentative par élève");
      throw err;
    }
    revalidatePath("/cours/quiz");
    return ok(gen.source === "ia" ? "quiz préparé à partir de ton chapitre" : "quiz préparé à partir des phrases de ton chapitre");
  }

  if (action === "soumettre") {
    const resolve = await resoudreCible(session, form);
    if ("erreur" in resolve) return erreur(resolve.erreur);
    const copie = await findOne("quiz_passations", { etudiant_id: session.id, cle: resolve.cible.cle });
    if (!copie) return erreur("commence le quiz avant de répondre");
    if (copie.soumis) return erreur("quiz déjà rendu : une seule tentative par élève");

    const questions = (copie.questions ?? []) as Question[];
    const reponses: (number | null)[] = questions.map((_, i) => {
      const brute = cle(form, `reponse_${i}`);
      if (brute === "") return null;
      const n = Number(brute);
      return Number.isInteger(n) && n >= 0 && n < (questions[i].options.length || 4) ? n : null;
    });

    const resultat = corriger(questions, reponses);
    // { soumis: 0 } dans le filtre : deux onglets ouverts, un seul rend la copie.
    const modifies = await updateDoc(
      "quiz_passations",
      { id: copie.id, soumis: 0 },
      { reponses, note: resultat.note, justes: resultat.justes, total: resultat.total, soumis: 1, fini_le: nowLocal() }
    );
    if (!modifies) return erreur("quiz déjà rendu");

    revalidatePath("/cours");
    revalidatePath("/cours/quiz");
    return ok(`quiz terminé — ${resultat.note}/20 (non compté dans la moyenne de la matière)`);
  }

  return erreur("action inconnue");
}

// Ce qu'une copie a le droit de montrer au navigateur : le résultat, jamais les réponses.
const metadata = (c: any) => ({
  id: c.id,
  etudiant_id: c.etudiant_id,
  titre: c.titre,
  note: c.note,
  justes: c.justes,
  total: c.total,
  soumis: c.soumis,
  source: c.source,
  cree_le: c.cree_le,
});

/* Le prof consulte les copies : la liste des passations d'un chapitre ou d'une matière, sans
   donnée d'un autre élève que le sien. */
export async function GET(req: NextRequest) {
  const { refus } = routeurRetour(req, "/cours/quiz");
  const session = await getSession();
  if (!session || !peut(session.role, "cours", "voir")) return refus();
  const coursId = Number(req.nextUrl.searchParams.get("cours_id")) || 0;
  const matiereId = Number(req.nextUrl.searchParams.get("matiere_id")) || 0;

  if (session.role === "etudiant") {
    const filtre = coursId ? { cours_id: coursId, etudiant_id: session.id } : { matiere_id: matiereId, etudiant_id: session.id };
    // Jamais les questions ni la clé de correction en JSON : l'élève n'a que son résultat.
    const copies = await findDocs("quiz_passations", filtre);
    return Response.json({ passations: copies.map((c: any) => metadata(c)) });
  }
  const matiere = matiereId ? await findOne("matieres", { id: matiereId }) : null;
  if (session.role === "prof" && matiere && matiere.prof_id !== session.id) return refus();
  const filtre = coursId ? { cours_id: coursId } : { matiere_id: matiereId };
  const copies = await findDocs("quiz_passations", filtre, { sort: { cree_le: -1 } });
  return Response.json({ passations: copies.map((c: any) => metadata(c)) });
}
