import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { findOne, removeDocs } from "@/lib/db";
import { sendEmail } from "@/lib/mail";
import { peut } from "@/lib/permissions";
import { routeurRetour } from "@/lib/retour";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const { erreur, ok, refus } = routeurRetour(req, "/emails");
  const session = await getSession();
  // La file d'envoi n'est modifiable que par l'admin ; prof et etudiant consultent la leur.
  if (!session || !(peut(session.role, "emails", "creer") || peut(session.role, "emails", "supprimer"))) return refus();
  const form = await req.formData();
  const action = String(form.get("action") ?? "");

  if (action === "send") {
    if (!peut(session.role, "emails", "creer")) return refus();
    const destinataire = String(form.get("destinataire") ?? "").trim().toLowerCase();
    const sujet = String(form.get("sujet") ?? "").trim();
    const contenu = String(form.get("contenu") ?? "").trim();
    const lien = String(form.get("lien") ?? "").trim();
    if (!destinataire || !sujet || !contenu) return erreur("champs incomplets");
    if (lien && !lien.startsWith("/")) return erreur("le lien doit commencer par /");
    await sendEmail(destinataire, sujet, contenu, lien || undefined);
  }

  if (action === "delete") {
    if (!peut(session.role, "emails", "supprimer")) return refus();
    const id = Number(form.get("id"));
    const cible = await findOne("emails", { id });
    if (!cible) return erreur("email introuvable");
    await removeDocs("emails", { id });
    return ok("email retiré de la file d'envoi");
  }

  revalidatePath("/emails");
  return ok("email ajouté à la file d'envoi");
}
