import { clientOrigin } from "@/lib/origin";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { revalidatePath } from "next/cache";

function isResponsible(db: any, session: any, matiereId: number) {
  if (session.role === "admin") return true;
  const m = db.prepare(`SELECT prof_id FROM matieres WHERE id=?`).get(matiereId) as any;
  return !!m && m.prof_id === session.id;
}

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || session.role === "etudiant") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const form = await req.formData();
  const action = String(form.get("action") ?? "create");
  const db = getDb();

  if (action === "create") {
    const valeur = Number(form.get("valeur"));
    const type = String(form.get("type") ?? "");
    const date = String(form.get("date") ?? "");
    const matiereId = Number(form.get("matiere_id"));
    const etudiantId = Number(form.get("etudiant_id"));
    if (Number.isNaN(valeur) || valeur < 0 || valeur > 20 || !["CC", "TP"].includes(type) || !date || !matiereId || !etudiantId) {
      return NextResponse.redirect(new URL("/notes?error=note+invalide+(0-20)", clientOrigin(req)), { status: 303 });
    }
    if (!isResponsible(db, session, matiereId)) {
      return NextResponse.redirect(new URL("/notes?error=vous+ne+responsabilisez+pas+cette+matiere", clientOrigin(req)), { status: 303 });
    }
    const matiere = db.prepare(`SELECT * FROM matieres WHERE id=?`).get(matiereId) as any;
    if (matiere.statut !== "en_cours") {
      return NextResponse.redirect(new URL("/notes?error=matiere+cloturee+ou+validee", clientOrigin(req)), { status: 303 });
    }
    const eleve = db.prepare(`SELECT id FROM users WHERE id=? AND role='etudiant' AND classe_id=? AND actif=1`)
      .get(etudiantId, matiere.classe_id) as any;
    if (!eleve) {
      return NextResponse.redirect(new URL("/notes?error=etudiant+hors+de+la+classe+de+la+matiere", clientOrigin(req)), { status: 303 });
    }
    db.prepare(`INSERT INTO notes (valeur, type, date, matiere_id, etudiant_id) VALUES (?,?,?,?,?)`)
      .run(valeur, type, date, matiereId, etudiantId);
  }

  if (action === "cloturer") {
    const matiereId = Number(form.get("matiere_id"));
    if (!isResponsible(db, session, matiereId)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    const mat = db.prepare(`SELECT * FROM matieres WHERE id=?`).get(matiereId) as any;
    if (!mat || mat.statut !== "en_cours") {
      return NextResponse.redirect(new URL("/notes?error=matiere+deja+cloturee", clientOrigin(req)), { status: 303 });
    }
    if (session.role === "admin" && mat.prof_id) {
      return NextResponse.redirect(new URL("/notes?error=cloture+reservee+au+professeur", clientOrigin(req)), { status: 303 });
    }
    const etudiants = db.prepare(`SELECT id FROM users WHERE role='etudiant' AND classe_id=?`).all(mat.classe_id) as any[];
    const date = new Date().toISOString().slice(0, 10);
    const tx = db.transaction(() => {
      const del = db.prepare(`DELETE FROM notes WHERE matiere_id=? AND type='EXAM'`);
      const ins = db.prepare(`INSERT INTO notes (valeur, type, date, matiere_id, etudiant_id) VALUES (?, 'EXAM', ?, ?, ?)`);
      del.run(matiereId);
      for (const e of etudiants) {
        const v = Number(form.get(`note_${e.id}`));
        if (!Number.isNaN(v) && v >= 0 && v <= 20) ins.run(v, date, matiereId, e.id);
      }
      db.prepare(`UPDATE matieres SET statut='termine' WHERE id=?`).run(matiereId);
    });
    tx();
  }

  if (action === "delete") {
    const id = Number(form.get("id"));
    const n = db.prepare(`SELECT * FROM notes WHERE id=?`).get(id) as any;
    if (n && !isResponsible(db, session, n.matiere_id)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    if (n) {
      const m = db.prepare(`SELECT statut FROM matieres WHERE id=?`).get(n.matiere_id) as any;
      if (m?.statut === "valide") {
        return NextResponse.redirect(new URL("/notes?error=notes+gelees+apres+validation+admin", clientOrigin(req)), { status: 303 });
      }
    }
    db.prepare(`DELETE FROM notes WHERE id = ?`).run(Number(form.get("id")));
  }

  revalidatePath("/notes");
  revalidatePath("/matieres");
  return NextResponse.redirect(new URL("/notes", clientOrigin(req)), { status: 303 });
}
