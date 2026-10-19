import { clientOrigin } from "@/lib/origin";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const form = await req.formData();
  const action = String(form.get("action") ?? "");
  const db = getDb();

  if (action === "create") {
    if (session.role === "etudiant") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const titre = String(form.get("titre") ?? "").trim();
    const consigne = String(form.get("consigne") ?? "").trim();
    const dateLimite = String(form.get("date_limite") ?? "");
    const matiereId = Number(form.get("matiere_id"));
    const m = db.prepare(`SELECT * FROM matieres WHERE id=?`).get(matiereId) as any;
    if (!titre || !consigne || !dateLimite || !m || m.statut !== "en_cours" || (session.role === "prof" && m.prof_id !== session.id)) {
      return NextResponse.redirect(new URL("/comptes-rendus?error=champs+incomplets+ou+matiere+cloturee", clientOrigin(req)), { status: 303 });
    }
    db.prepare(
      `INSERT INTO cr_assignments (titre, consigne, matiere_id, prof_id, date_limite, cree_le) VALUES (?,?,?,?,?,datetime('now','localtime'))`
    ).run(titre, consigne, matiereId, m.prof_id ?? session.id, dateLimite);
    revalidatePath("/comptes-rendus");
    return NextResponse.redirect(new URL("/comptes-rendus", clientOrigin(req)), { status: 303 });
  }

  if (action === "depot") {
    if (session.role !== "etudiant") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const assignmentId = Number(form.get("assignment_id"));
    const contenu = String(form.get("contenu") ?? "").trim();
    const a = db.prepare(`SELECT * FROM cr_assignments WHERE id=?`).get(assignmentId) as any;
    if (!a || !contenu || a.date_limite < new Date().toISOString().slice(0, 10)) {
      return NextResponse.redirect(new URL("/comptes-rendus?error=depot+impossible+(delasse+ou+vide)", clientOrigin(req)), { status: 303 });
    }
    const m = db.prepare(`SELECT classe_id, statut FROM matieres WHERE id=?`).get(a.matiere_id) as any;
    if (m?.classe_id !== session.classe_id) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (m?.statut !== "en_cours") {
      return NextResponse.redirect(new URL("/comptes-rendus?error=matiere+cloturee+depot+bloque", clientOrigin(req)), { status: 303 });
    }
    try {
      db.prepare(
        `INSERT INTO cr_depots (assignment_id, etudiant_id, contenu, rendu_le) VALUES (?,?,?,datetime('now','localtime'))`
      ).run(assignmentId, session.id, contenu);
    } catch {
      return NextResponse.redirect(new URL("/comptes-rendus?error=deja+depose", clientOrigin(req)), { status: 303 });
    }
    revalidatePath("/comptes-rendus");
    return NextResponse.redirect(new URL("/comptes-rendus", clientOrigin(req)), { status: 303 });
  }

  if (action === "noter") {
    if (session.role === "etudiant") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const depotId = Number(form.get("depot_id"));
    const note = Number(form.get("note"));
    const feedback = String(form.get("feedback") ?? "").trim();
    const d = db
      .prepare(`SELECT dp.*, a.date_limite, a.prof_id FROM cr_depots dp JOIN cr_assignments a ON a.id=dp.assignment_id WHERE dp.id=?`)
      .get(depotId) as any;
    if (!d || (session.role === "prof" && d.prof_id !== session.id)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (Number.isNaN(note) || note < 0 || note > 20) {
      return NextResponse.redirect(new URL("/comptes-rendus?error=note+invalide+(0-20)", clientOrigin(req)), { status: 303 });
    }
    db.prepare(`UPDATE cr_depots SET note=?, feedback=? WHERE id=?`).run(note, feedback || null, depotId);
    revalidatePath("/comptes-rendus");
    revalidatePath("/notes");
    return NextResponse.redirect(new URL("/comptes-rendus", clientOrigin(req)), { status: 303 });
  }

  if (action === "delete") {
    if (session.role === "etudiant") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const a = db.prepare(`SELECT * FROM cr_assignments WHERE id=?`).get(Number(form.get("id"))) as any;
    if (a && session.role === "prof" && a.prof_id !== session.id) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    db.prepare(`DELETE FROM cr_depots WHERE assignment_id=?`).run(a?.id);
    db.prepare(`DELETE FROM cr_assignments WHERE id=?`).run(Number(form.get("id")));
    revalidatePath("/comptes-rendus");
    return NextResponse.redirect(new URL("/comptes-rendus", clientOrigin(req)), { status: 303 });
  }

  return NextResponse.redirect(new URL("/comptes-rendus", clientOrigin(req)), { status: 303 });
}
