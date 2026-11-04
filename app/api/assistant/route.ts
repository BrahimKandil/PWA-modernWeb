import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { peut } from "@/lib/permissions";
import { reponseAssistant } from "@/lib/assistant-ia";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ reponse: "Connecte-toi pour parler à l'assistant." }, { status: 401 });
  if (!peut(session.role, "assistant")) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const question = String(body?.question ?? "").slice(0, 300);
  const historique = (Array.isArray(body?.historique) ? body.historique : [])
    .slice(-6)
    .map((m: any) => ({
      role: m?.role === "model" ? ("model" as const) : ("user" as const),
      texte: String(m?.texte ?? "").slice(0, 400),
    }))
    .filter((m: any) => m.texte);

  try {
    const { reponse, suggestions, source, restant } = await reponseAssistant(session, question, historique);
    return NextResponse.json({ reponse, suggestions, source, restant });
  } catch {
    return NextResponse.json({
      reponse: "Le serveur de données est injoignable pour l'instant. Vérifie ta connexion, puis réessaie.",
      suggestions: [],
      source: "local",
      restant: null,
    });
  }
}
