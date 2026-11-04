import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { findOne, insertDoc, updateDoc, removeDocs, nowLocal } from "@/lib/db";
import { peut } from "@/lib/permissions";
import { routeurRetour } from "@/lib/retour";
import { aujourdhui } from "@/lib/semaine";
import { revalidatePath } from "next/cache";

const estDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso);

export async function POST(req: NextRequest) {
  const { erreur, ok, refus } = routeurRetour(req, "/comptes-rendus");
  const session = await getSession();
  // L'administration consulte uniquement : ni création, ni correction, ni suppression.
  if (!session || !peut(session.role, "comptes_rendus", "creer")) return refus();
  const form = await req.formData();
  const action = String(form.get("action") ?? "");

  // --- Professeur : créer un compte rendu sur une de SES matières en cours ---
  if (action === "create") {
    if (session.role !== "prof") return refus();
    const titre = String(form.get("titre") ?? "").trim();
    const consigne = String(form.get("consigne") ?? "").trim();
    const dateLimite = String(form.get("date_limite") ?? "");
    const matiereId = Number(form.get("matiere_id"));
    const m = await findOne("matieres", { id: matiereId });
    if (!titre || !consigne || !estDate(dateLimite)) return erreur("champs incomplets");
    if (!m || m.prof_id !== session.id || m.statut !== "en_cours") return erreur("matière introuvable, clôturée ou qui ne vous appartient pas");
    await insertDoc("cr_assignments", { titre, consigne, matiere_id: matiereId, prof_id: m.prof_id, date_limite: dateLimite, cree_le: nowLocal() });
    revalidatePath("/comptes-rendus");
    return ok("compte rendu créé");
  }

  // --- Professeur : supprimer son compte rendu et ses dépôts ---
  if (action === "delete") {
    if (session.role !== "prof") return refus();
    const id = Number(form.get("id"));
    const a = await findOne("cr_assignments", { id });
    if (!a || a.prof_id !== session.id) return refus();
    await removeDocs("cr_depots", { assignment_id: id });
    await removeDocs("cr_assignments", { id });
    revalidatePath("/comptes-rendus");
    return ok("compte rendu supprimé");
  }

  // --- Professeur : attribuer / actualiser la note d'un dépôt ---
  if (action === "noter") {
    if (session.role !== "prof") return refus();
    const depotId = Number(form.get("depot_id"));
    const brut = String(form.get("note") ?? "");
    const note = Number(brut);
    const feedback = String(form.get("feedback") ?? "").trim();
    if (brut.trim() === "" || !Number.isFinite(note) || note < 0 || note > 20) return erreur("note invalide (0-20)");
    const d = await findOne("cr_depots", { id: depotId });
    if (!d) return erreur("dépôt introuvable");
    const a = await findOne("cr_assignments", { id: d.assignment_id });
    if (!a || a.prof_id !== session.id) return refus();
    await updateDoc("cr_depots", { id: depotId }, { note, feedback: feedback || null });
    revalidatePath("/comptes-rendus");
    return ok("note enregistrée");
  }

  // --- Étudiant : déposer son compte rendu ---
  if (action === "depot") {
    if (session.role !== "etudiant") return refus();
    const assignmentId = Number(form.get("assignment_id"));
    const contenu = String(form.get("contenu") ?? "").trim();
    if (!contenu) return erreur("dépôt vide");
    const a = await findOne("cr_assignments", { id: assignmentId });
    if (!a) return erreur("compte rendu introuvable");
    const m = await findOne("matieres", { id: a.matiere_id });
    if (!m || m.classe_id !== session.classe_id) return refus();
    if (m.statut !== "en_cours") return erreur("matière clôturée : dépôt bloqué");
    if (a.date_limite < aujourdhui()) return erreur("délai dépassé : dépôt fermé");
    if (await findOne("cr_depots", { assignment_id: assignmentId, etudiant_id: session.id })) return erreur("déjà déposé — modifiez votre dépôt");
    await insertDoc("cr_depots", { assignment_id: assignmentId, etudiant_id: session.id, contenu, rendu_le: nowLocal(), note: null, feedback: null });
    revalidatePath("/comptes-rendus");
    return ok("compte rendu déposé");
  }

  // --- Étudiant : modifier son dépôt (tant que matière en cours et délai non dépassé) ---
  if (action === "update_depot") {
    if (session.role !== "etudiant") return refus();
    const id = Number(form.get("id"));
    const contenu = String(form.get("contenu") ?? "").trim();
    if (!contenu) return erreur("dépôt vide");
    const d = await findOne("cr_depots", { id });
    if (!d || d.etudiant_id !== session.id) return refus();
    if (d.note != null) return erreur("dépôt déjà noté : non modifiable");
    const a = await findOne("cr_assignments", { id: d.assignment_id });
    const m = a ? await findOne("matieres", { id: a.matiere_id }) : null;
    if (!m || m.statut !== "en_cours") return erreur("matière clôturée : modification bloquée");
    if (a && a.date_limite < aujourdhui()) return erreur("délai dépassé : modification fermée");
    await updateDoc("cr_depots", { id }, { contenu, rendu_le: nowLocal() });
    revalidatePath("/comptes-rendus");
    return ok("dépôt mis à jour");
  }

  // --- Étudiant : retirer son dépôt (jamais après notation) ---
  if (action === "delete_depot") {
    if (session.role !== "etudiant") return refus();
    const id = Number(form.get("id"));
    const d = await findOne("cr_depots", { id });
    if (!d || d.etudiant_id !== session.id) return refus();
    if (d.note != null) return erreur("dépôt noté : non supprimable");
    const a = await findOne("cr_assignments", { id: d.assignment_id });
    const m = a ? await findOne("matieres", { id: a.matiere_id }) : null;
    if (!m || m.statut !== "en_cours") return erreur("matière clôturée : retrait bloqué");
    if (a && a.date_limite < aujourdhui()) return erreur("délai dépassé : retrait fermé");
    await removeDocs("cr_depots", { id });
    revalidatePath("/comptes-rendus");
    return ok("dépôt retiré");
  }

  return erreur("action inconnue");
}
