import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { peut } from "@/lib/permissions";
import { texteDepuisFichier } from "@/lib/cours";

export const dynamic = "force-dynamic";

// Même plafond que le dépôt : au-delà, la fonction serverless refuserait la requête avant notre code.
const TAILLE_MAX = 4 * 1024 * 1024;

/* Étape intermédiaire du dépôt avec pièce jointe : le navigateur demande le texte du fichier
   pour le montrer dans la zone de réponse. Aucune écriture en base ici — le dépôt, lui,
   enregistrera le binaire. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !peut(session.role, "comptes_rendus", "creer")) {
    return NextResponse.json({ erreur: "Accès refusé" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const depot = form?.get("fichier");
  if (!depot || typeof (depot as File).arrayBuffer !== "function" || (depot as File).size === 0) {
    return NextResponse.json({ erreur: "Aucun fichier reçu" }, { status: 400 });
  }

  const nom = String((depot as File).name ?? "");
  const bytes = Buffer.from(await (depot as File).arrayBuffer());
  if (bytes.length > TAILLE_MAX) return NextResponse.json({ erreur: "Fichier trop lourd (4 Mo maximum)" }, { status: 413 });

  const lu = texteDepuisFichier(nom, bytes);
  if (!lu) return NextResponse.json({ erreur: "Format non pris en charge : .docx ou .pdf uniquement" }, { status: 415 });

  return NextResponse.json({ nom, taille: bytes.length, type: lu.type, texte: lu.texte });
}
