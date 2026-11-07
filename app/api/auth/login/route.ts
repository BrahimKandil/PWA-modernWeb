import { clientOrigin } from "@/lib/origin";
import { NextRequest, NextResponse } from "next/server";
import { login, setSessionCookie } from "@/lib/auth";
import { CHAMP_JETON, recaptchaActif, verifierRecaptcha } from "@/lib/recaptcha";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const url = new URL("/login?error=1", clientOrigin(req));

  if (recaptchaActif()) {
    // x-forwarded-for : derrière Vercel ou Cloudflare c'est la seule source exploitable de l'IP cliente.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const v = await verifierRecaptcha(String(form.get(CHAMP_JETON) ?? ""), ip);
    if (!v.ok) {
      // Le motif reste côté serveur : l'afficher aiderait un robot à ajuster sa méthode.
      console.warn(`reCAPTCHA refusé (${email}) : ${v.motif}`);
      return NextResponse.redirect(new URL("/login?captcha=1", clientOrigin(req)), { status: 303 });
    }
  }

  const user = await login(email, password);
  if (!user) return NextResponse.redirect(url, { status: 303 });
  setSessionCookie(user);
  return NextResponse.redirect(new URL("/", clientOrigin(req)), { status: 303 });
}

