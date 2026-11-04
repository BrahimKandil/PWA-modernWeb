import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { findDocs, findOne, insertDoc, updateDoc, removeDocs, isDup } from "@/lib/db";
import { peut } from "@/lib/permissions";
import { routeurRetour } from "@/lib/retour";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const { erreur, ok, refus } = routeurRetour(req, "/classes");
  const session = await getSession();
  if (!session || !peut(session.role, "classes", "creer")) return refus();
  const form = await req.formData();
  const action = String(form.get("action") ?? "create");

  if (action === "create" || action === "update") {
    const nom = String(form.get("nom") ?? "").trim().toUpperCase();
    const filiere = String(form.get("filiere") ?? "").trim();
    const nouvelleAnnee = String(form.get("nouvelle_annee") ?? "").trim();
    if (!nom || !filiere || !nouvelleAnnee) return erreur("champs incomplets");
    const id = Number(form.get("id"));
    try {
      if (action === "create") {
        await insertDoc("classes", { nom, filiere, annee: nouvelleAnnee });
      } else {
        const cible = await findOne("classes", { id });
        if (!cible) return erreur("classe introuvable");
        await updateDoc("classes", { id }, { nom, filiere, annee: nouvelleAnnee });
      }
    } catch (err) {
      if (isDup(err)) return erreur("ce nom de classe existe déjà");
      throw err;
    }
  }

  if (action === "affecter") {
    const classeId = Number(form.get("classe_id"));
    const ids = form.getAll("etudiant_ids").map(Number).filter(Number.isInteger);
    await updateDoc("users", { classe_id: classeId, role: "etudiant" }, { classe_id: null });
    const eleves = await findDocs("users", { id: { $in: ids }, role: "etudiant" });
    for (const e of eleves) await updateDoc("users", { id: e.id }, { classe_id: classeId });
  }

  if (action === "delete") {
    const id = Number(form.get("id"));
    const utilisee =
      (await findDocs("matieres", { classe_id: id }, { limit: 1 })).length > 0 ||
      (await findDocs("users", { classe_id: id }, { limit: 1 })).length > 0 ||
      (await findDocs("emplois", { classe_id: id }, { limit: 1 })).length > 0;
    if (utilisee) return erreur("classe utilisée par des matières, des étudiants ou un emploi du temps");
    await removeDocs("classes", { id });
  }

  revalidatePath("/classes");
  revalidatePath("/emplois");
  return ok(action === "delete" ? "classe supprimée" : "classe enregistrée");
}
