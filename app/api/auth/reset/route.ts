import { clientOrigin } from "@/lib/origin";
import { NextRequest, NextResponse } from "next/server";
import { setPasswordWithToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const base = clientOrigin(req);

  if (password.length < 6 || password !== confirm) {
    return NextResponse.redirect(new URL(`/reset?token=${token}&error=mdp`, base), { status: 303 });
  }
  if (!setPasswordWithToken(token, password)) {
    return NextResponse.redirect(new URL(`/reset?token=${token}&error=invalide`, base), { status: 303 });
  }
  return NextResponse.redirect(new URL("/login?reset=1", base), { status: 303 });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  return NextResponse.redirect(new URL(`/reset?token=${token}`, clientOrigin(req)));
}
