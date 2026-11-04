import { clientOrigin } from "@/lib/origin";
import { NextRequest, NextResponse } from "next/server";
import { login, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const user = await login(email, password);
  if (!user) {
    const url = new URL("/login?error=1", clientOrigin(req));
    return NextResponse.redirect(url, { status: 303 });
  }
  setSessionCookie(user);
  return NextResponse.redirect(new URL("/", clientOrigin(req)), { status: 303 });
}

