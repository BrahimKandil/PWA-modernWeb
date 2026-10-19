import { clientOrigin } from "@/lib/origin";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const form = await req.formData();
  const action = String(form.get("action") ?? "create");
  const db = getDb();

  if (action === "create") {
    const nom = String(form.get("nom") ?? "").trim().toUpperCase();
    const batiment = String(form.get("batiment") ?? "").trim().toUpperCase();
    const capacite = Number(form.get("capacite"));
    const type = String(form.get("type") ?? "");
    if (!nom || !batiment || Number.isNaN(capacite) || capacite < 1 || !["salle", "amphi", "labo"].includes(type)) {
      return NextResponse.redirect(new URL("/salles?error=champs+incomplets", clientOrigin(req)), { status: 303 });
    }
    try {
      db.prepare(`INSERT INTO salles (nom, batiment, capacite, type) VALUES (?,?,?,?)`).run(nom, batiment, capacite, type);
    } catch {
      return NextResponse.redirect(new URL("/salles?error=nom+deja+utilise", clientOrigin(req)), { status: 303 });
    }
  }

  if (action === "delete") {
    try {
      db.prepare(`DELETE FROM salles WHERE id = ?`).run(Number(form.get("id")));
    } catch {
      return NextResponse.redirect(new URL("/salles?error=salle+utilisee+dans+un+emploi", clientOrigin(req)), { status: 303 });
    }
  }

  revalidatePath("/salles");
  revalidatePath("/emplois");
  return NextResponse.redirect(new URL("/salles", clientOrigin(req)), { status: 303 });
}
