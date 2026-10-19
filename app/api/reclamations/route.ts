import { clientOrigin } from "@/lib/origin";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const form = await req.formData();
  const action = String(form.get("action") ?? "create");
  const db = getDb();

  if (action === "create") {
    // Seuls profs et étudiants peuvent créer une réclamation
    if (session.role === "admin") {
      return NextResponse.redirect(new URL("/reclamations?error=admin+ne+peut+pas+creer", clientOrigin(req)), { status: 303 });
    }
    const objet = String(form.get("objet") ?? "").trim();
    const message = String(form.get("message") ?? "").trim();
    const type = String(form.get("type") ?? "");
    if (!objet || !message || !["note", "emploi", "salle", "autre"].includes(type)) {
      return NextResponse.redirect(new URL("/reclamations?error=champs+incomplets", clientOrigin(req)), { status: 303 });
    }
    db.prepare(
      `INSERT INTO reclamations (objet, message, type, user_id, cree_le) VALUES (?,?,?,?,datetime('now','localtime'))`
    ).run(objet, message, type, session.id);
    revalidatePath("/reclamations");
    return NextResponse.redirect(new URL("/reclamations", clientOrigin(req)), { status: 303 });
  }

  if (action === "statut") {
    // Seul l'admin change le statut
    if (session.role !== "admin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const statut = String(form.get("statut") ?? "");
    if (!["ouvert", "en_cours", "traite"].includes(statut)) {
      return NextResponse.redirect(new URL("/reclamations?error=statut+invalide", clientOrigin(req)), { status: 303 });
    }
    db.prepare(`UPDATE reclamations SET statut=? WHERE id=?`).run(statut, Number(form.get("id")));
    revalidatePath("/reclamations");
    return NextResponse.redirect(new URL("/reclamations", clientOrigin(req)), { status: 303 });
  }

  if (action === "delete") {
    if (session.role !== "admin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    db.prepare(`DELETE FROM reclamations WHERE id=?`).run(Number(form.get("id")));
    revalidatePath("/reclamations");
    return NextResponse.redirect(new URL("/reclamations", clientOrigin(req)), { status: 303 });
  }

  return NextResponse.redirect(new URL("/reclamations", clientOrigin(req)), { status: 303 });
}
