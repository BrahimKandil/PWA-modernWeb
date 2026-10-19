import { clientOrigin } from "@/lib/origin";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { revalidatePath } from "next/cache";

const JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"];

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const form = await req.formData();
  const action = String(form.get("action") ?? "");
  const db = getDb();
  const classeId = Number(form.get("classe_id"));
  const semaine = String(form.get("semaine_debut") ?? "");

  if (action === "save-week") {
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    if (!classeId || !/^\d{4}-\d{2}-\d{2}$/.test(semaine)) {
      return NextResponse.redirect(new URL("/emplois?error=classe+et+semaine+requises", clientOrigin(req)), { status: 303 });
    }
    const slots: { jour: string; creneau: number; matiere: number; salle: number }[] = [];
    for (const jour of JOURS) {
      for (const creneau of [1, 2]) {
        const matiere = Number(form.get(`${jour}_${creneau}_matiere`) || 0);
        if (!matiere) continue;
        const salle = Number(form.get(`${jour}_${creneau}_salle`) || 0);
        slots.push({ jour, creneau, matiere, salle });
      }
    }
    if (slots.some((s) => !s.salle)) {
      return NextResponse.redirect(new URL("/emplois?error=choisir+une+salle+pour+chaque+creneau", clientOrigin(req)), { status: 303 });
    }
    const classe = db.prepare(`SELECT id FROM classes WHERE id=?`).get(classeId) as any;
    if (!classe) {
      return NextResponse.redirect(new URL("/emplois?error=classe+introuvable", clientOrigin(req)), { status: 303 });
    }
    for (const s of slots) {
      const dansClasse = db.prepare(`SELECT id FROM matieres WHERE id=? AND classe_id=?`).get(s.matiere, classeId) as any;
      const salleOk = db.prepare(`SELECT id FROM salles WHERE id=?`).get(s.salle) as any;
      if (!dansClasse || !salleOk) {
        return NextResponse.redirect(new URL("/emplois?error=matiere+ou+salle+non+valide+pour+cette+classe", clientOrigin(req)), { status: 303 });
      }
    }
    const times: Record<number, [string, string]> = { 1: ["09:00", "12:00"], 2: ["13:00", "16:00"] };
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM emplois WHERE classe_id=? AND semaine_debut=?`).run(classeId, semaine);
      const ins = db.prepare(
        `INSERT INTO emplois (semaine_debut, jour, creneau, heure_debut, heure_fin, classe_id, matiere_id, salle_id) VALUES (?,?,?,?,?,?,?,?)`
      );
      for (const s of slots) ins.run(semaine, s.jour, s.creneau, times[s.creneau][0], times[s.creneau][1], classeId, s.matiere, s.salle);
    });
    tx();
  }

  if (action === "copy-prev") {
    if (session.role !== "admin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const prev = new Date(semaine);
    prev.setDate(prev.getDate() - 7);
    const prevSem = prev.toISOString().slice(0, 10);
    const rows = db.prepare(`SELECT * FROM emplois WHERE classe_id=? AND semaine_debut=?`).all(classeId, prevSem) as any[];
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM emplois WHERE classe_id=? AND semaine_debut=?`).run(classeId, semaine);
      const ins = db.prepare(
        `INSERT INTO emplois (semaine_debut, jour, creneau, heure_debut, heure_fin, classe_id, matiere_id, salle_id) VALUES (?,?,?,?,?,?,?,?)`
      );
      for (const r of rows) ins.run(semaine, r.jour, r.creneau, r.heure_debut, r.heure_fin, classeId, r.matiere_id, r.salle_id);
    });
    tx();
  }

  revalidatePath("/emplois");
  return NextResponse.redirect(new URL(`/emplois?classe_id=${classeId}&semaine=${semaine}`, clientOrigin(req)), { status: 303 });
}
