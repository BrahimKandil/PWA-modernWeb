import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { findOne, findDocs, insertDoc, updateDoc, removeDocs, isDup } from "@/lib/db";
import { sendEmail } from "@/lib/mail";
import { peut } from "@/lib/permissions";
import { routeurRetour } from "@/lib/retour";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const { erreur, ok, refus } = routeurRetour(req, "/matieres");
  const session = await getSession();
  if (!session || !peut(session.role, "matieres", "creer")) return refus();
  const form = await req.formData();
  const action = String(form.get("action") ?? "create");

  if (action === "create" || action === "update") {
    const code = String(form.get("code") ?? "").trim().toUpperCase();
    const nom = String(form.get("nom") ?? "").trim();
    const coefficient = Number(form.get("coefficient") ?? 1);
    const heures = Number(form.get("heures") ?? 0);
    const profId = Number(form.get("prof_id")) || null;
    const classeId = Number(form.get("classe_id")) || 0;
    if (!code || !nom || !coefficient || !heures || !classeId) return erreur("champs incomplets");
    if (!(await findOne("classes", { id: classeId }))) return erreur("classe introuvable");
    if (profId && !(await findOne("users", { id: profId, role: "prof" }))) return erreur("professeur introuvable");

    const id = Number(form.get("id"));
    const ancienne = action === "update" ? await findOne("matieres", { id }) : null;
    if (action === "update" && !ancienne) return erreur("matière introuvable");
    if (ancienne?.statut === "valide") return erreur("matière validée : les étudiants ont déjà leurs notes, on ne la modifie plus");

    try {
      if (action === "create") {
        await insertDoc("matieres", { code, nom, coefficient, heures, statut: "en_cours", prof_id: profId, classe_id: classeId });
      } else {
        await updateDoc("matieres", { id }, { code, nom, coefficient, heures, prof_id: profId, classe_id: classeId });
      }
    } catch (err) {
      if (isDup(err)) return erreur("ce code de matière existe déjà");
      throw err;
    }

    // Une affectation changeante previent le professeur concerne, l'ancien comme le nouveau.
    if (profId) {
      const prof = await findOne("users", { id: profId });
      const classe = await findOne("classes", { id: classeId });
      if (prof) {
        await sendEmail(
          prof.email,
          `${action === "create" ? "Nouvelle affectation" : "Affectation modifiée"} : ${code}`,
          `Bonjour ${prof.prenom}, la matière ${nom} (${code}, ${heures}h, coef ${coefficient}) vous est ${action === "create" ? "affectée" : "à nouveau affectée"} pour la classe ${classe?.nom ?? ""}.`,
          "/notes"
        );
      }
    }
    if (ancienne && profId && ancienne.prof_id && ancienne.prof_id !== profId) {
      const ancien = await findOne("users", { id: ancienne.prof_id });
      if (ancien) {
        await sendEmail(
          ancien.email,
          `Retrait d'affectation : ${code}`,
          `Bonjour ${ancien.prenom}, la matière ${nom} (${code}) ne vous est plus affectée.`,
          "/notes"
        );
      }
    }
    revalidatePath("/matieres");
    revalidatePath("/notes");
    return ok(action === "create" ? "matière créée" : "matière modifiée");
  }

  if (action === "valider") {
    const id = Number(form.get("id"));
    const cible = await findOne("matieres", { id, statut: "termine" });
    if (!cible) return erreur("matière à valider introuvable (elle doit être clôturée par son professeur)");
    await updateDoc("matieres", { id }, { statut: "valide" });
    await sendEmail("tous@arp.edu", "Matière clôturée et validée", "Les notes d'examen final d'une matière sont désormais visibles par les étudiants.", "/notes");
    revalidatePath("/matieres");
    revalidatePath("/notes");
    revalidatePath("/emails");
    return ok("matière validée, notes publiées");
  }

  if (action === "delete") {
    const id = Number(form.get("id"));
    const liee =
      (await findDocs("notes", { matiere_id: id }, { limit: 1 })).length > 0 ||
      (await findDocs("emplois", { matiere_id: id }, { limit: 1 })).length > 0 ||
      (await findDocs("presences", { matiere_id: id }, { limit: 1 })).length > 0 ||
      (await findDocs("cr_assignments", { matiere_id: id }, { limit: 1 })).length > 0;
    if (liee) return erreur("matière liée à des notes, présences, créneaux ou comptes rendus");
    await removeDocs("matieres", { id });
    revalidatePath("/matieres");
    return ok("matière supprimée");
  }

  return erreur("action inconnue");
}
