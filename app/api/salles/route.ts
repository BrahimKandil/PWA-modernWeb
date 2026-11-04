import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { findDocs, findOne, insertDoc, updateDoc, removeDocs, isDup } from "@/lib/db";
import { peut } from "@/lib/permissions";
import { routeurRetour } from "@/lib/retour";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const { erreur, ok, refus } = routeurRetour(req, "/salles");
  const session = await getSession();
  if (!session || !peut(session.role, "salles", "creer")) return refus();
  const form = await req.formData();
  const action = String(form.get("action") ?? "create");

  if (action === "create" || action === "update") {
    const nom = String(form.get("nom") ?? "").trim();
    const batiment = String(form.get("batiment") ?? "").trim();
    const capacite = Number(form.get("capacite"));
    const type = String(form.get("type") ?? "salle");
    if (!nom || !batiment || !Number.isInteger(capacite) || capacite < 1) return erreur("champs incomplets");
    if (!["salle", "amphi", "labo"].includes(type)) return erreur("type de salle inconnu");
    const id = Number(form.get("id"));
    try {
      if (action === "create") {
        await insertDoc("salles", { nom, batiment, capacite, type });
      } else {
        const cible = await findOne("salles", { id });
        if (!cible) return erreur("salle introuvable");
        await updateDoc("salles", { id }, { nom, batiment, capacite, type });
      }
    } catch (err) {
      if (isDup(err)) return erreur("ce nom de salle existe déjà");
      throw err;
    }
    revalidatePath("/salles");
    return ok(action === "create" ? "salle ajoutée" : "salle modifiée");
  }

  if (action === "delete") {
    const id = Number(form.get("id"));
    const utilisee = (await findDocs("emplois", { salle_id: id }, { limit: 1 })).length > 0;
    if (utilisee) return erreur("salle encore utilisée dans un emploi du temps : la retirer d'abord");
    await removeDocs("salles", { id });
    revalidatePath("/salles");
    revalidatePath("/emplois");
    return ok("salle supprimée");
  }

  return erreur("action inconnue");
}
