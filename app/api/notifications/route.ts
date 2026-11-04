import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { findOne, insertDoc, updateDoc, removeDocs, nowLocal } from "@/lib/db";
import { peut } from "@/lib/permissions";
import { routeurRetour } from "@/lib/retour";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const { erreur, ok, refus } = routeurRetour(req, "/notifications");
  const session = await getSession();
  if (!session || !peut(session.role, "notifications", "creer")) return refus();
  const form = await req.formData();
  const action = String(form.get("action") ?? "create");

  if (action === "create" || action === "update") {
    const titre = String(form.get("titre") ?? "").trim();
    const message = String(form.get("message") ?? "").trim();
    if (!titre || !message) return erreur("champs incomplets");
    const id = Number(form.get("id"));
    if (action === "create") {
      await insertDoc("notifications", { titre, message, lue: 0, cree_le: nowLocal() });
    } else {
      const cible = await findOne("notifications", { id });
      if (!cible) return erreur("notification introuvable");
      await updateDoc("notifications", { id }, { titre, message });
    }
    revalidatePath("/notifications");
    return ok(action === "create" ? "notification publiée" : "notification modifiée");
  }

  if (action === "delete") {
    await removeDocs("notifications", { id: Number(form.get("id")) });
    revalidatePath("/notifications");
    return ok("notification supprimée");
  }

  return erreur("action inconnue");
}
