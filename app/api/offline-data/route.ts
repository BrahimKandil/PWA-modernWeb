import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { nowLocal } from "@/lib/db";
import { emploisDuCompte, semaineCourante } from "@/lib/hors-ligne";

export const dynamic = "force-dynamic";

// La capture hors ligne : les emplois que ce compte a le droit de voir, pour toute l'annee scolaire.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const semaines = await emploisDuCompte(session);
  return NextResponse.json(
    {
      captured_le: nowLocal(),
      compte: { prenom: session.prenom, nom: session.nom, role: session.role, classe_nom: session.classe_nom },
      semaine_courante: semaineCourante(),
      semaines,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
