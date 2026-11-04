import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { findOne, findDocs, insertDoc, updateDoc, removeDocs } from "@/lib/db";
import { peut } from "@/lib/permissions";
import { routeurRetour } from "@/lib/retour";
import { aujourdhui } from "@/lib/semaine";
import { revalidatePath } from "next/cache";

const STATUTS = ["present", "absent", "retard"];

export async function POST(req: NextRequest) {
  const { erreur, ok, refus } = routeurRetour(req, "/presences");
  const session = await getSession();
  // L'appel est saisi par le professeur ; l'administration consulte seulement.
  if (!session || !peut(session.role, "presences", "creer")) return refus();
  const form = await req.formData();
  const action = String(form.get("action") ?? "save");

  if (action === "save") {
    const matiereId = Number(form.get("matiere_id"));
    const date = String(form.get("date") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return erreur("date de séance manquante ou invalide");
    const m = await findOne("matieres", { id: matiereId });
    if (!m || m.prof_id !== session.id) return refus();
    if (m.statut !== "en_cours") return erreur("matière clôturée ou validée : l'appel n'est plus saisissable");
    if (date > aujourdhui()) return erreur("pas d'appel pour une séance future");

    const etudiants = await findDocs("users", { role: "etudiant", classe_id: m.classe_id, actif: 1 });
    if (etudiants.length === 0) return erreur("aucun étudiant dans cette classe");
    let ecrits = 0;
    for (const e of etudiants) {
      const statut = String(form.get(`statut_${e.id}`) ?? "present");
      if (!STATUTS.includes(statut)) continue;
      const existante = await findOne("presences", { date, matiere_id: matiereId, etudiant_id: e.id });
      if (existante) await updateDoc("presences", { id: existante.id }, { statut, prof_id: session.id });
      else await insertDoc("presences", { date, statut, matiere_id: matiereId, etudiant_id: e.id, prof_id: session.id });
      ecrits++;
    }
    revalidatePath("/presences");
    revalidatePath("/");
    return ok(`${ecrits} étudiant(s) relevé(s) le ${date}`);
  }

  if (action === "delete") {
    const id = Number(form.get("id"));
    const ligne = await findOne("presences", { id });
    if (!ligne) return erreur("relevé introuvable");
    const m = await findOne("matieres", { id: ligne.matiere_id });
    if (!m || m.prof_id !== session.id) return refus();
    if (m.statut === "valide") return erreur("matière validée : les présences sont figées");
    await removeDocs("presences", { id });
    revalidatePath("/presences");
    return ok("relevé supprimé");
  }

  return erreur("action inconnue");
}
