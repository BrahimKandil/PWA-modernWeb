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
    // Seuls les admins créent des notifications (visibles par tous)
    if (session.role !== "admin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const titre = String(form.get("titre") ?? "").trim();
    const message = String(form.get("message") ?? "").trim();
    if (!titre || !message) {
      return NextResponse.redirect(new URL("/notifications?error=champs+incomplets", clientOrigin(req)), { status: 303 });
    }
    db.prepare(`INSERT INTO notifications (titre, message, cree_le) VALUES (?,?,datetime('now','localtime'))`).run(titre, message);
    revalidatePath("/notifications");
    return NextResponse.redirect(new URL("/notifications", clientOrigin(req)), { status: 303 });
  }

  if (action === "delete") {
    if (session.role !== "admin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    db.prepare(`DELETE FROM notifications WHERE id=?`).run(Number(form.get("id")));
    revalidatePath("/notifications");
    return NextResponse.redirect(new URL("/notifications", clientOrigin(req)), { status: 303 });
  }

  return NextResponse.redirect(new URL("/notifications", clientOrigin(req)), { status: 303 });
}
