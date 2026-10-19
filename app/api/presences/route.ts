import { clientOrigin } from "@/lib/origin";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || session.role === "etudiant") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const form = await req.formData();
  const action = String(form.get("action") ?? "save");
  const db = getDb();

  if (action === "save") {
    const matiereId = Number(form.get("matiere_id"));
    const date = String(form.get("date") ?? "");
    const m = db.prepare(`SELECT * FROM matieres WHERE id=?`).get(matiereId) as any;
    if (!m || (session.role === "prof" && m.prof_id !== session.id)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    if (m.statut !== "en_cours") {
      return NextResponse.redirect(new URL("/presences?error=matiere+cloturee+ou+validee", clientOrigin(req)), { status: 303 });
    }
    if (!date) {
      return NextResponse.redirect(new URL("/presences?error=date+manquante", clientOrigin(req)), { status: 303 });
    }
    const etudiants = db
      .prepare(`SELECT id FROM users WHERE role='etudiant' AND classe_id=? AND actif=1`)
      .all(m.classe_id) as any[];
    const upsert = db.prepare(
      `INSERT INTO presences (date, statut, matiere_id, etudiant_id, prof_id) VALUES (?,?,?,?,?)
       ON CONFLICT (date, matiere_id, etudiant_id) DO UPDATE SET statut=excluded.statut, prof_id=excluded.prof_id`
    );
    db.transaction(() => {
      for (const e of etudiants) {
        const statut = String(form.get(`statut_${e.id}`) ?? "present");
        if (["present", "absent", "retard"].includes(statut)) {
          upsert.run(date, statut, matiereId, e.id, session.id);
        }
      }
    })();
    revalidatePath("/presences");
    return NextResponse.redirect(new URL(`/presences?matiere_id=${matiereId}&date=${date}&ok=1`, clientOrigin(req)), { status: 303 });
  }

  if (action === "delete") {
    const id = Number(form.get("id"));
    const row = db.prepare(`SELECT * FROM presences WHERE id=?`).get(id) as any;
    if (row && session.role === "prof") {
      const m = db.prepare(`SELECT prof_id FROM matieres WHERE id=?`).get(row.matiere_id) as any;
      if (!m || m.prof_id !== session.id) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    db.prepare(`DELETE FROM presences WHERE id=?`).run(id);
  }

  revalidatePath("/presences");
  return NextResponse.redirect(new URL("/presences", clientOrigin(req)), { status: 303 });
}
