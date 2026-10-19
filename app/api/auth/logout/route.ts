import { clientOrigin } from "@/lib/origin";
import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  clearSessionCookie();
  return NextResponse.redirect(new URL("/login", clientOrigin(req)), { status: 303 });
}
