import { NextRequest, NextResponse } from "next/server";
import { getSession, mondayOf } from "@/lib/auth";
import { findDocs, findOne } from "@/lib/db";
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
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", req.url), { status: 303 });

  const q = req.nextUrl.searchParams;
  const semaine = /^\d{4}-\d{2}-\d{2}$/.test(q.get("semaine") ?? "") ? q.get("semaine")! : mondayOf();

  const classes = await findDocs("classes", {}, { sort: { nom: 1 } });
  const classeId =
    session.role === "etudiant"
      ? session.classe_id ?? -1
      : Number(q.get("classe_id")) || classes[0]?.id || -1;

  const classe = classes.find((c) => c.id === classeId) ?? (await findOne("classes", { id: classeId }));
  if (!classe) {
    return new NextResponse("Aucune classe", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const [matieres, salles, emplois] = await Promise.all([
    findDocs("matieres"),
    findDocs("salles"),
    findDocs("emplois", { classe_id: classe.id, semaine_debut: semaine }),
  ]);
  const matiere = new Map(matieres.map((m) => [m.id, m]));
  const salle = new Map(salles.map((s) => [s.id, s]));

  const slots = emplois.map((e) => {
    const m = matiere.get(e.matiere_id);
    return {
      creneau: e.creneau, jour: e.jour, heure_debut: e.heure_debut, heure_fin: e.heure_fin,
      code: m?.code ?? "?", matiere: m?.nom ?? "?", statut: m?.statut ?? "en_cours",
      salle: salle.get(e.salle_id)?.nom ?? "?", matiere_id: e.matiere_id,
    };
  });

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

  const users = await findDocs("users");
  const nomUser = new Map(users.map((u) => [u.id, `${u.prenom} ${u.nom}`]));
  const codesParProf = new Map<number, string[]>();
  for (const s of slots) {
    const m = matiere.get(s.matiere_id);
    if (!m?.prof_id) continue;
    codesParProf.set(m.prof_id, [...(codesParProf.get(m.prof_id) ?? []), m.code]);
  }

  const pdf = buildPdf({
    title: `Emploi du temps — ${classe.nom}`,
    subtitle: weekLabel(semaine),
    meta: [
      `Classe ${classe.nom} · ${slots.length} créneau(x) planifié(s) sur 5 jours · maximum 2 matières par jour, 3 h par créneau`,
      codesParProf.size
        ? `Enseignants : ${[...codesParProf.entries()].map(([pid, codes]) => `${[...new Set(codes)].join("/")} ${nomUser.get(pid) ?? "?"}`).join("  ·  ")}`
        : "",
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

