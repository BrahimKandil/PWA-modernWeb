import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { findOne } from "@/lib/db";
import { peut } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const TYPE_MIME: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

/* Le support d'un dépôt se télécharge par son auteur, par le professeur qui a créé le compte rendu
   et par l'administration en consultation — jamais par un autre étudiant. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !peut(session.role, "comptes_rendus", "voir")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const id = Number(req.nextUrl.searchParams.get("id")) || 0;
  const depot = await findOne("cr_depots", { id });
  if (!depot) return NextResponse.json({ error: "Dépôt introuvable" }, { status: 404 });
  if (session.role === "etudiant" && depot.etudiant_id !== session.id) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const a = await findOne("cr_assignments", { id: depot.assignment_id });
  if (!a) return NextResponse.json({ error: "Compte rendu introuvable" }, { status: 404 });
  if (session.role === "prof" && a.prof_id !== session.id) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  if (!depot.fichier) return NextResponse.json({ error: "Aucun fichier joint à ce dépôt" }, { status: 404 });

  const binaire = depot.fichier as any;
  const brut = Buffer.isBuffer(binaire) ? binaire : Buffer.from(binaire.buffer ?? binaire);
  // Le nom vient du dépôt de l'étudiant : on ne laisse rien passer qui casserait l'en-tête.
  const nom = String(depot.fichier_nom ?? "depot").replace(/["\\r\n]/g, "_");

  return new NextResponse(brut, {
    headers: {
      "content-type": TYPE_MIME[depot.fichier_type] ?? "application/octet-stream",
      "content-disposition": `attachment; filename="${nom}"`,
      "content-length": String(brut.length),
    },
  });
}
