import { NextRequest, NextResponse } from "next/server";
import { getSession, mondayOf } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildPdf, type PdfCell } from "@/lib/pdf";

export const dynamic = "force-dynamic";

const JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"];
const CRENEAUX: Record<number, [string, string]> = { 1: ["MATIN", "09h — 12h"], 2: ["APRÈS-MIDI", "13h — 16h"] };

function weekLabel(monday: string) {
  const d = new Date(monday);
  const f = (x: Date) => x.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const e = new Date(d);
  e.setDate(e.getDate() + 4);
  return `Semaine du ${f(d)} au ${f(e)}`;
}

export async function GET(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url), { status: 303 });

  const db = getDb();
  const q = req.nextUrl.searchParams;
  const semaine = /^\d{4}-\d{2}-\d{2}$/.test(q.get("semaine") ?? "") ? q.get("semaine")! : mondayOf();

  const classes = db.prepare(`SELECT * FROM classes ORDER BY nom`).all() as any[];
  const classeId =
    session.role === "etudiant"
      ? session.classe_id ?? -1
      : Number(q.get("classe_id")) || classes[0]?.id || -1;

  const classe = classes.find((c) => c.id === classeId);
  if (!classe) {
    return new NextResponse("Aucune classe", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const slots = db
    .prepare(
      `SELECT e.creneau, e.jour, e.heure_debut, e.heure_fin, m.code, m.nom matiere, m.statut, s.nom salle
       FROM emplois e JOIN matieres m ON m.id=e.matiere_id JOIN salles s ON s.id=e.salle_id
       WHERE e.classe_id=? AND e.semaine_debut=?`
    )
    .all(classe.id, semaine) as any[];

  const cell = (creneau: number, jour: string): PdfCell => {
    const c = slots.find((x) => x.jour === jour && x.creneau === creneau);
    if (!c) return [{ t: "Libre", gray: true, size: 9 }];
    return [
      { t: c.code, size: 11, bold: true },
      { t: c.matiere, size: 9 },
      { t: `${c.heure_debut} — ${c.heure_fin}`, size: 8.5, gray: true },
      { t: `Salle ${c.salle}`, size: 8.5, gray: true },
    ];
  };

  const profs = db
    .prepare(
      `SELECT DISTINCT u.prenom || ' ' || u.nom nom, m.code
       FROM emplois e JOIN matieres m ON m.id=e.matiere_id JOIN users u ON u.id=m.prof_id
       WHERE e.classe_id=? AND e.semaine_debut=? ORDER BY m.code`
    )
    .all(classe.id, semaine) as any[];

  const pdf = buildPdf({
    title: `Emploi du temps — ${classe.nom}`,
    subtitle: weekLabel(semaine),
    meta: [
      `Classe ${classe.nom} · ${slots.length} créneau(x) planifié(s) sur 5 jours · maximum 2 matières par jour, 3 h par créneau`,
      profs.length ? `Enseignants : ${profs.map((p) => `${p.code} ${p.nom}`).join("  ·  ")}` : "",
    ].filter(Boolean),
    table: {
      headers: ["Horaire", ...JOURS],
      rows: [1, 2].map((creneau) => [
        [{ t: CRENEAUX[creneau][0], size: 9, bold: true }, { t: CRENEAUX[creneau][1], size: 8.5, gray: true }],
        ...JOURS.map((jour) => cell(creneau, jour)),
      ]),
      widths: [86, 148, 148, 148, 148, 148],
    },
    footer: `Généré par ARP Éducation le ${new Date().toLocaleDateString("fr-FR")} pour ${session.prenom} ${session.nom} (${session.role})`,
  });

  const filename = `emploi-${classe.nom}-${semaine}.pdf`.replace(/[^A-Za-z0-9._-]/g, "-");
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "no-store",
    },
  });
}
