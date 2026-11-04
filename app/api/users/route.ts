import { NextRequest } from "next/server";
import { getSession, createInvitation } from "@/lib/auth";
import { findOne, findDocs, insertDoc, updateDoc, removeDocs, isDup } from "@/lib/db";
import { sendEmail } from "@/lib/mail";
import { peut } from "@/lib/permissions";
import { routeurRetour } from "@/lib/retour";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const { erreur, ok, refus } = routeurRetour(req, "/users");
  const session = await getSession();
  // Un seul tableau de droits pour l'ecran et l'API : « utilisateurs » est reserve a l'admin.
  if (!session || !peut(session.role, "utilisateurs", "creer")) return refus();
  const form = await req.formData();
  const action = String(form.get("action") ?? "create");

  const lectureCompte = () => {
    const nom = String(form.get("nom") ?? "").trim();
    const prenom = String(form.get("prenom") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const role = String(form.get("role") ?? "");
    const classeId = Number(form.get("classe_id")) || null;
    return { nom, prenom, email, role, classeId };
  };

  if (action === "create" || action === "update") {
    const { nom, prenom, email, role, classeId } = lectureCompte();
    if (!nom || !prenom || !email || !["prof", "etudiant"].includes(role)) return erreur("champs incomplets");
    if (role === "etudiant" && !classeId) return erreur("choisir une classe pour l'étudiant");

    const id = Number(form.get("id"));
    if (action === "create") {
      try {
        const nouveau = await insertDoc("users", {
          nom, prenom, email, mot_de_passe: null, role, classe_id: role === "etudiant" ? classeId : null, actif: 1,
        });
        const token = await createInvitation(nouveau);
        await sendEmail(
          email,
          "ARP Éducation — Activation de votre compte",
          `Bonjour ${prenom} ${nom}, un compte ${role} a été créé pour vous sur ARP Éducation. Cliquez sur le lien d'activation pour définir votre mot de passe.`,
          `/reset?token=${token}`
        );
      } catch (err) {
        if (isDup(err)) return erreur("email déjà utilisé");
        throw err;
      }
    } else {
      const cible = await findOne("users", { id });
      if (!cible) return erreur("compte introuvable");
      if (cible.role === "admin" || id === session.id) return erreur("compte protégé : un administrateur ou vous-même");
      try {
        await updateDoc("users", { id }, {
          nom, prenom, email, role, classe_id: role === "etudiant" ? classeId : null,
        });
      } catch (err) {
        if (isDup(err)) return erreur("email déjà utilisé");
        throw err;
      }
    }
  }

  if (action === "renvoyer") {
    const id = Number(form.get("id"));
    const user = await findOne("users", { id });
    if (user && user.role !== "admin" && id !== session.id) {
      const token = await createInvitation(user.id);
      await sendEmail(
        user.email,
        "ARP Éducation — Activation de votre compte (rappel)",
        `Bonjour ${user.prenom}, définissez votre mot de passe pour activer votre compte.`,
        `/reset?token=${token}`
      );
    } else if (user) {
      return erreur("compte protégé : un administrateur ou vous-même");
    }
  }

  if (action === "toggle") {
    const id = Number(form.get("id"));
    const user = await findOne("users", { id, role: { $ne: "admin" } });
    if (!user) return erreur("compte introuvable");
    if (id === session.id) return erreur("compte protégé : un administrateur ou vous-même");
    await updateDoc("users", { id }, { actif: user.actif ? 0 : 1 });
  }

  if (action === "delete") {
    const id = Number(form.get("id"));
    const cible = await findOne("users", { id });
    if (!cible) return erreur("compte introuvable");
    if (cible.role === "admin" || id === session.id) return erreur("compte protégé : un administrateur ou vous-même");
    // On ne supprime pas un prof encore attache a des comptes rendus : ses notes d'etudiants suivent.
    const cr = await findDocs("cr_assignments", { prof_id: id }, { limit: 1 });
    if (cr.length > 0) return erreur("ce professeur a des comptes rendus en cours : les supprimer d'abord");
    await updateDoc("matieres", { prof_id: id }, { prof_id: null });
    await removeDocs("reset_tokens", { user_id: id });
    await removeDocs("presences", { etudiant_id: id });
    await removeDocs("notes", { etudiant_id: id });
    await removeDocs("cr_depots", { etudiant_id: id });
    await removeDocs("reclamations", { user_id: id });
    await removeDocs("users", { id, role: { $ne: "admin" } });
  }

  revalidatePath("/users");
  revalidatePath("/emails");
  return ok(action === "delete" ? "compte supprimé" : "compte enregistré");
}

