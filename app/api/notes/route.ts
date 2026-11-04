import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { findOne, findDocs, insertDoc, updateDoc, removeDocs } from "@/lib/db";
import { peut } from "@/lib/permissions";
import { routeurRetour } from "@/lib/retour";
import { aujourdhui } from "@/lib/semaine";
import { revalidatePath } from "next/cache";

const estDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso);

export async function POST(req: NextRequest) {
  const { erreur, ok, refus } = routeurRetour(req, "/notes");
  const session = await getSession();
  // La saisie des notes appartient au professeur ; l'administration consulte seulement.
  if (!session || !peut(session.role, "notes", "creer")) return refus();
  const form = await req.formData();
  const action = String(form.get("action") ?? "create");

  if (action === "create" || action === "update") {
    const brut = String(form.get("valeur") ?? "");
    const valeur = Number(brut);
    const type = String(form.get("type") ?? "");
    const date = String(form.get("date") ?? "");
    const matiereId = Number(form.get("matiere_id"));
    const autorises = action === "create" ? ["CC", "TP"] : ["CC", "TP", "EXAM"];
    if (brut.trim() === "" || !Number.isFinite(valeur) || valeur < 0 || valeur > 20 || !autorises.includes(type) || !estDate(date)) {
      return erreur("note invalide (0-20, type et date requis)");
    }
    const m = await findOne("matieres", { id: matiereId });
    if (!m || m.prof_id !== session.id) return refus();
    if (m.statut !== "en_cours") return erreur("matière clôturée ou validée : saisie terminée");
    if (date > aujourdhui()) return erreur("pas de note datée dans le futur");

    if (action === "create") {
      const etudiantId = Number(form.get("etudiant_id"));
      const eleve = await findOne("users", { id: etudiantId, role: "etudiant", classe_id: m.classe_id, actif: 1 });
      if (!eleve) return erreur("étudiant hors de la classe de la matière");
      await insertDoc("notes", { valeur, type, date, matiere_id: matiereId, etudiant_id: etudiantId });
      revalidatePath("/notes");
      revalidatePath("/");
      return ok("note ajoutée");
    }

    const id = Number(form.get("id"));
    const n = await findOne("notes", { id });
    if (!n || n.matiere_id !== matiereId) return erreur("note introuvable pour cette matière");
    await updateDoc("notes", { id }, { valeur, type, date });
    revalidatePath("/notes");
    return ok("note mise à jour");
  }

  if (action === "cloturer") {
    const matiereId = Number(form.get("matiere_id"));
    const m = await findOne("matieres", { id: matiereId });
    if (!m || m.prof_id !== session.id) return refus();
    if (m.statut !== "en_cours") return erreur("matière déjà clôturée");
    const eleves = await findDocs("users", { role: "etudiant", classe_id: m.classe_id, actif: 1 });
    const date = aujourdhui();
    await removeDocs("notes", { matiere_id: matiereId, type: "EXAM" });
    let nb = 0;
    for (const e of eleves) {
      const brut = String(form.get(`note_${e.id}`) ?? "");
      const v = Number(brut);
      if (brut.trim() !== "" && Number.isFinite(v) && v >= 0 && v <= 20) {
        await insertDoc("notes", { valeur: v, type: "EXAM", date, matiere_id: matiereId, etudiant_id: e.id });
        nb++;
      }
    }
    await updateDoc("matieres", { id: matiereId }, { statut: "termine" });
    revalidatePath("/notes");
    revalidatePath("/matieres");
    return ok(`matière clôturée — ${nb} note(s) d'examen, en attente de validation`);
  }

  if (action === "delete") {
    const id = Number(form.get("id"));
    const n = await findOne("notes", { id });
    if (!n) return erreur("note introuvable");
    const m = await findOne("matieres", { id: n.matiere_id });
    if (!m || m.prof_id !== session.id) return refus();
    if (m.statut === "valide") return erreur("notes gelées après validation admin");
    await removeDocs("notes", { id });
    revalidatePath("/notes");
    return ok("note supprimée");
  }

  return erreur("action inconnue");
}
