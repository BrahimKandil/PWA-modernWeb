import { clientOrigin } from "@/lib/origin";
import { NextRequest, NextResponse } from "next/server";
import { getSession, createInvitation } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendEmail } from "@/lib/mail";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const form = await req.formData();
  const action = String(form.get("action") ?? "create");
  const db = getDb();

  if (action === "create") {
    const nom = String(form.get("nom") ?? "").trim();
    const prenom = String(form.get("prenom") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const role = String(form.get("role") ?? "");
    const classeId = Number(form.get("classe_id")) || null;
    if (!nom || !prenom || !email || !["prof", "etudiant"].includes(role)) {
      return NextResponse.redirect(new URL("/users?error=champs+incomplets", clientOrigin(req)), { status: 303 });
    }
    if (role === "etudiant" && !classeId) {
      return NextResponse.redirect(new URL("/users?error=choisir+une+classe+pour+l+etudiant", clientOrigin(req)), { status: 303 });
    }
    try {
      const id = db
        .prepare(`INSERT INTO users (nom, prenom, email, mot_de_passe, role, classe_id) VALUES (?,?,?,?,?,?)`)
        .run(nom, prenom, email, null, role, role === "etudiant" ? classeId : null).lastInsertRowid as number;
      const token = createInvitation(id);
      sendEmail(
        email,
        "ARP Éducation — Activation de votre compte",
        `Bonjour ${prenom} ${nom}, un compte ${role} a été créé pour vous sur ARP Éducation. Cliquez sur le lien d'activation pour définir votre mot de passe.`,
        `/reset?token=${token}`
      );
    } catch {
      return NextResponse.redirect(new URL("/users?error=email+deja+utilise", clientOrigin(req)), { status: 303 });
    }
  }

  if (action === "renvoyer") {
    const id = Number(form.get("id"));
    const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(id) as any;
    if (user && user.role !== "admin") {
      const token = createInvitation(id);
      sendEmail(
        user.email,
        "ARP Éducation — Activation de votre compte (rappel)",
        `Bonjour ${user.prenom}, définissez votre mot de passe pour activer votre compte.`,
        `/reset?token=${token}`
      );
    }
  }

  if (action === "toggle") {
    db.prepare(`UPDATE users SET actif = 1 - actif WHERE id = ? AND role != 'admin'`).run(Number(form.get("id")));
  }

  if (action === "delete") {
    try {
      const id = Number(form.get("id"));
      db.prepare(`DELETE FROM reset_tokens WHERE user_id=?`).run(id);
      db.prepare(`DELETE FROM presences WHERE etudiant_id=?`).run(id);
      db.prepare(`DELETE FROM notes WHERE etudiant_id=?`).run(id);
      db.prepare(`DELETE FROM cr_depots WHERE etudiant_id=?`).run(id);
      db.prepare(`DELETE FROM reclamations WHERE user_id=?`).run(id);
      db.prepare(`DELETE FROM users WHERE id = ? AND role != 'admin'`).run(id);
    } catch {
      return NextResponse.redirect(new URL("/users?error=utilisateur+lie+a+des+donnees", clientOrigin(req)), { status: 303 });
    }
  }

  revalidatePath("/users");
  revalidatePath("/emails");
  return NextResponse.redirect(new URL("/users", clientOrigin(req)), { status: 303 });
}
