import { clientOrigin } from "@/lib/origin";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
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
    const code = String(form.get("code") ?? "").trim().toUpperCase();
    const nom = String(form.get("nom") ?? "").trim();
    const coefficient = Number(form.get("coefficient") ?? 1);
    const heures = Number(form.get("heures") ?? 0);
    const profId = Number(form.get("prof_id")) || null;
    const classeId = Number(form.get("classe_id")) || 0;
    if (!code || !nom || !coefficient || !heures || !classeId) {
      return NextResponse.redirect(new URL("/matieres?error=champs+incomplets", clientOrigin(req)), { status: 303 });
    }
    try {
      db.prepare(`INSERT INTO matieres (code, nom, coefficient, heures, prof_id, classe_id) VALUES (?,?,?,?,?,?)`)
        .run(code, nom, coefficient, heures, profId, classeId);
      if (profId) {
        const prof = db.prepare(`SELECT prenom, nom, email FROM users WHERE id=?`).get(profId) as any;
        const classe = db.prepare(`SELECT nom cn FROM classes WHERE id=?`).get(classeId) as any;
        if (prof) {
          sendEmail(
            prof.email,
            `Nouvelle affectation : ${code}`,
            `Bonjour ${prof.prenom}, la matière ${nom} (${code}, ${heures}h, coef ${coefficient}) vous est affectée pour la classe ${classe?.cn ?? ""}. Consultez vos affectations dans l'application.`,
            "/notes"
          );
        }
      }
    } catch {
      return NextResponse.redirect(new URL("/matieres?error=code+deja+utilise", clientOrigin(req)), { status: 303 });
    }
  }

  if (action === "valider") {
    const id = Number(form.get("id"));
    db.prepare(`UPDATE matieres SET statut='valide' WHERE id=? AND statut='termine'`).run(id);
    sendEmail("tous@arp.edu", "Matière clôturée et validée", "Les notes d'examen final d'une matière sont désormais visibles par les étudiants.", "/notes");
  }

  if (action === "delete") {
    try {
      db.prepare(`DELETE FROM matieres WHERE id = ?`).run(Number(form.get("id")));
    } catch {
      return NextResponse.redirect(new URL("/matieres?error=matiere+liee+a+des+donnees", clientOrigin(req)), { status: 303 });
    }
  }

  revalidatePath("/matieres");
  revalidatePath("/notes");
  revalidatePath("/emails");
  return NextResponse.redirect(new URL("/matieres", clientOrigin(req)), { status: 303 });
}
