import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get("arp_session")?.value;

  if (pathname === "/login" || pathname === "/offline" || pathname === "/reset" || pathname === "/api/auth/login" || pathname === "/api/auth/reset") {
    return NextResponse.next();
  }

  if (!session || !/^\d+\.[0-9a-f]{16}$/.test(session)) {
    if (pathname === "/api/emplois/pdf") return NextResponse.next();
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons|sw.js|manifest.webmanifest|favicon.ico).*)"],
};
