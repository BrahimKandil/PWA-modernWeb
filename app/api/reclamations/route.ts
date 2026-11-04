import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { findOne, insertDoc, updateDoc, removeDocs, nowLocal } from "@/lib/db";
import { peut } from "@/lib/permissions";
import { routeurRetour } from "@/lib/retour";
import { revalidatePath } from "next/cache";

const TYPES = ["note", "emploi", "salle", "autre"];
const STATUTS = ["ouvert", "en_cours", "traite"];

export async function POST(req: NextRequest) {
  const { erreur, ok, refus } = routeurRetour(req, "/reclamations");
  const session = await getSession();
  // L'administration consulte uniquement : elle ne crée ni ne modifie aucune réclamation.
  if (!session || !peut(session.role, "reclamations", "creer")) return refus();
  const form = await req.formData();
  const action = String(form.get("action") ?? "create");

  if (action === "create") {
    const objet = String(form.get("objet") ?? "").trim();
    const message = String(form.get("message") ?? "").trim();
    const type = String(form.get("type") ?? "");
    if (!objet || !message || !TYPES.includes(type)) return erreur("champs incomplets");
    await insertDoc("reclamations", { objet, message, type, statut: "ouvert", user_id: session.id, cree_le: nowLocal() });
    revalidatePath("/reclamations");
    return ok("réclamation envoyée");
  }

  if (action === "update" || action === "delete") {
    const id = Number(form.get("id"));
    const r = await findOne("reclamations", { id });
    if (!r) return erreur("réclamation introuvable");
    if (r.user_id !== session.id) return refus(); // on ne touche que les siennes

    if (action === "delete") {
      await removeDocs("reclamations", { id });
      revalidatePath("/reclamations");
      return ok("réclamation supprimée");
    }

    const objet = String(form.get("objet") ?? "").trim();
    const message = String(form.get("message") ?? "").trim();
    const type = String(form.get("type") ?? "");
    const statut = String(form.get("statut") ?? r.statut);
    if (!objet || !message || !TYPES.includes(type) || !STATUTS.includes(statut)) return erreur("champs incomplets");
    await updateDoc("reclamations", { id }, { objet, message, type, statut });
    revalidatePath("/reclamations");
    return ok("réclamation mise à jour");
  }

  return erreur("action inconnue");
}
