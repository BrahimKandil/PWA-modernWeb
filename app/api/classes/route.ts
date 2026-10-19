import { clientOrigin } from "@/lib/origin";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
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
    const nom = String(form.get("nom") ?? "").trim().toUpperCase();
    const filiere = String(form.get("filiere") ?? "").trim();
    const annee = String(form.get("annee") ?? "").trim();
    if (!nom || !filiere || !annee) {
      return NextResponse.redirect(new URL("/classes?error=champs+incomplets", clientOrigin(req)), { status: 303 });
    }
    try {
      db.prepare(`INSERT INTO classes (nom, filiere, annee) VALUES (?,?,?)`).run(nom, filiere, annee);
    } catch {
      return NextResponse.redirect(new URL("/classes?error=classe+deja+existante", clientOrigin(req)), { status: 303 });
    }
  }

  if (action === "affecter") {
    const classeId = Number(form.get("classe_id"));
    const ids = form.getAll("etudiant_ids").map(Number).filter(Number.isInteger);
    const tx = db.transaction(() => {
      db.prepare(`UPDATE users SET classe_id=NULL WHERE classe_id=?`).run(classeId);
      const upd = db.prepare(`UPDATE users SET classe_id=? WHERE id=? AND role='etudiant'`);
      for (const id of ids) upd.run(classeId, id);
    });
    tx();
  }

  if (action === "delete") {
    try {
      db.prepare(`DELETE FROM classes WHERE id=?`).run(Number(form.get("id")));
    } catch {
      return NextResponse.redirect(new URL("/classes?error=classe+utilisee+(matieres+ou+etudiants)", clientOrigin(req)), { status: 303 });
    }
  }

  revalidatePath("/classes");
  return NextResponse.redirect(new URL("/classes", clientOrigin(req)), { status: 303 });
}
