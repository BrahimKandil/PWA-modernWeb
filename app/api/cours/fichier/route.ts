import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { findOne } from "@/lib/db";
import { peut } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const TYPE_MIME: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

/* Le support original (Word ou PDF) se télécharge, mais uniquement par le prof de la matière
   ou un élève de la classe à laquelle elle appartient. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !peut(session.role, "cours", "voir")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const id = Number(req.nextUrl.searchParams.get("id")) || 0;
  const cours = await findOne("cours", { id });
  if (!cours) return NextResponse.json({ error: "Chapitre introuvable" }, { status: 404 });

  const matiere = await findOne("matieres", { id: cours.matiere_id });
  if (!matiere) return NextResponse.json({ error: "Matière introuvable" }, { status: 404 });
  if (session.role === "prof" && matiere.prof_id !== session.id) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  if (session.role === "etudiant" && matiere.classe_id !== session.classe_id) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  if (!cours.fichier) return NextResponse.json({ error: "Aucun fichier joint à ce chapitre" }, { status: 404 });

  const binaire = cours.fichier as any;
  const brut = Buffer.isBuffer(binaire) ? binaire : Buffer.from(binaire.buffer ?? binaire);
  // Le nom vient du dépôt du prof : on ne laisse rien passer qui casserait l'en-tête.
  const nom = String(cours.fichier_nom ?? "chapitre").replace(/["\\\r\n]/g, "_");

  return new NextResponse(brut, {
    headers: {
      "content-type": TYPE_MIME[cours.fichier_type] ?? "application/octet-stream",
      "content-disposition": `attachment; filename="${nom}"`,
      "content-length": String(brut.length),
    },
  });
}
