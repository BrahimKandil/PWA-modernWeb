import { NextRequest } from "next/server";
import { getSession, type SessionUser } from "@/lib/auth";
import { findOne, findDocs, insertDoc, updateDoc, removeDocs, isDup, nowLocal } from "@/lib/db";
import { peut } from "@/lib/permissions";
import { routeurRetour } from "@/lib/retour";
import { texteDepuisFichier, texteSuffisant } from "@/lib/cours";
import { indexerCours } from "@/lib/rag";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
// Plongements Gemini a l'import d'un support : 300 s de marge, sinon la fonction retombe a 10 s.
export const maxDuration = 300;

// Plafond imposé par l'hébergement : une fonction serverless refuse tout corps de requête
// (envoi comme réponse) au-delà de 4,5 Mo. Le téléchargement d'un support passe par la même limite.
const TAILLE_MAX = 4 * 1024 * 1024;

const champ = (form: FormData, nom: string) => String(form.get(nom) ?? "").trim();

/* Un prof n'écrit que dans SES matières. L'élève a le droit « creer » sur le module cours,
   mais uniquement pour sa passation de quiz (route /api/cours/quiz) : jamais un chapitre. */
async function matiereAutorisee(session: SessionUser, matiereId: number): Promise<{ matiere: any } | { erreur: string }> {
  const matiere = matiereId ? await findOne("matieres", { id: matiereId }) : null;
  if (!matiere) return { erreur: "matière introuvable" } as const;
  if (session.role === "prof" && matiere.prof_id !== session.id) {
    return { erreur: "vous n'enseignez pas cette matière" } as const;
  }
  return { matiere };
}

async function chapitreAutorise(session: SessionUser, id: number): Promise<{ cours: any } | { erreur: string }> {
  const cours = id ? await findOne("cours", { id }) : null;
  if (!cours) return { erreur: "chapitre introuvable" } as const;
  const ok = await matiereAutorisee(session, cours.matiere_id);
  if ("erreur" in ok) return { erreur: ok.erreur };
  return { cours };
}

export async function POST(req: NextRequest) {
  const { erreur, ok, refus } = routeurRetour(req, "/cours");
  const session = await getSession();
  if (!session || session.role !== "prof" || !peut(session.role, "cours", "creer")) return refus();

  const form = await req.formData();
  const action = champ(form, "action") || "create";

  if (action === "create" || action === "update") {
    if (!peut(session.role, "cours", action === "create" ? "creer" : "modifier")) return refus();
    const cible = await matiereAutorisee(session, Number(form.get("matiere_id")));
    if ("erreur" in cible) return erreur(cible.erreur);
    const matiere = cible.matiere;

    const numero = Number(form.get("numero"));
    const titre = champ(form, "titre");
    const texteCollé = champ(form, "texte");
    if (!numero || numero < 1 || numero > 30 || !titre) return erreur("numéro de chapitre et titre obligatoires");

    // Le fichier passe d'abord ; le texte collé ne sert que si le PDF ne rend rien (scan, pages en image).
    const depot = form.get("fichier");
    let texte = texteCollé;
    let fichierNom: string | null = null;
    let fichierType: string | null = null;
    let fichier: Buffer | null = null;

    if (depot && typeof (depot as File).arrayBuffer === "function" && (depot as File).size > 0) {
      const bytes = Buffer.from(await (depot as File).arrayBuffer());
      if (bytes.length > TAILLE_MAX) return erreur("fichier trop lourd (4 Mo maximum)");
      const lu = texteDepuisFichier((depot as File).name, bytes);
      if (!lu) return erreur("format non pris en charge : .docx ou .pdf uniquement");
      fichierNom = (depot as File).name;
      fichierType = lu.type;
      fichier = bytes;
      if (texteSuffisant(lu.texte)) texte = lu.texte;
    }

    const id = Number(form.get("id"));
    if (action === "update") {
      const ancien = await chapitreAutorise(session, id);
      if ("erreur" in ancien) return erreur(ancien.erreur);
      // texte vide + fichier illisible : on garde le texte déjà stocké, on ne l'efface pas
      if (!texte) texte = String(ancien.cours.texte ?? "");
    }

    if (!texteSuffisant(texte)) {
      return erreur(
        fichierNom
          ? `aucun texte exploitable dans ${fichierNom} (peut-être un scan) : collez le texte du chapitre`
          : "le chapitre doit contenir assez de texte pour générer un quiz"
      );
    }

    const doc: any = { matiere_id: matiere!.id, numero, titre, texte, modifie_le: nowLocal() };
    // sans nouveau dépôt, le fichier déjà stocké reste en place
    if (fichierNom) {
      doc.fichier_nom = fichierNom;
      doc.fichier_type = fichierType;
      doc.fichier = fichier;
      doc.taille_octets = fichier!.length;
    }

    let idCours = id;
    try {
      if (action === "create") {
        Object.assign(doc, { fichier_nom: fichierNom, fichier_type: fichierType, fichier, taille_octets: fichier?.length ?? 0 });
        idCours = await insertDoc("cours", { ...doc, terme: 0, cree_par: session.id, cree_le: nowLocal() });
      } else {
        await updateDoc("cours", { id }, doc);
      }
    } catch (err) {
      if (isDup(err)) return erreur(`le chapitre ${numero} existe déjà pour ${matiere!.code}`);
      throw err;
    }

    // RAG : les passages suivent le texte, sinon le quiz porterait sur l'ancienne version du chapitre.
    const index = await indexerCours({ id: idCours, matiere_id: matiere!.id, texte });

    revalidatePath("/cours");
    revalidatePath(`/cours/${idCours}`);
    return ok(
      `${action === "create" ? "chapitre créé" : "chapitre modifié"} — ${index.passages} passage(s) indexé(s)${
        index.vecteurs ? "" : " (index par mots-clés : index sémantique indisponible sans modèle)"
      }`
    );
  }

  if (action === "terminer" || action === "rouvrir") {
    if (!peut(session.role, "cours", "modifier")) return refus();
    const cible = await chapitreAutorise(session, Number(form.get("id")));
    if ("erreur" in cible) return erreur(cible.erreur);

    const termine = action === "terminer" ? 1 : 0;
    if (!termine) {
      const deja = await findDocs("quiz_passations", { cours_id: cible.cours.id }, { limit: 1 });
      if (deja.length) return erreur("des élèves ont déjà passé ce quiz : on ne le rouvre pas");
    }
    await updateDoc("cours", { id: cible.cours.id }, { terme: termine, modifie_le: nowLocal() });
    revalidatePath("/cours");
    revalidatePath(`/cours/${cible.cours.id}`);
    return ok(termine ? "chapitre terminé : son quiz est ouvert aux élèves" : "chapitre remis en cours : son quiz est refermé");
  }

  if (action === "delete") {
    if (!peut(session.role, "cours", "supprimer")) return refus();
    const cible = await chapitreAutorise(session, Number(form.get("id")));
    if ("erreur" in cible) return erreur(cible.erreur);
    const deja = await findDocs("quiz_passations", { cours_id: cible.cours.id }, { limit: 1 });
    if (deja.length) return erreur("suppression refusée : ce chapitre a déjà été évalué par des élèves");
    await removeDocs("cours_passages", { cours_id: cible.cours.id });
    await removeDocs("cours", { id: cible.cours.id });
    revalidatePath("/cours");
    return ok("chapitre supprimé");
  }

  return erreur("action inconnue");
}
