const CLE_SITE = (process.env.RECAPTCHA_SITE_KEY ?? "").trim();
const CLE_SECRET = (process.env.RECAPTCHA_SECRET ?? "").trim();
const URL_VERIF = "https://www.google.com/recaptcha/api/siteverify";

// Le widget v2 dépose lui-même son jeton dans ce champ, ajoutée par api.js à l'intérieur du formulaire.
export const CHAMP_JETON = "g-recaptcha-response";

export const recaptchaActif = () => !!(CLE_SITE && CLE_SECRET);
export const cleSitePublique = () => CLE_SITE;

export type Verification = { ok: true } | { ok: false; motif: string };

/* reCAPTCHA v2 « Je ne suis pas un robot » : le visiteur coche une case, Google livre un jeton
   à usage unique que le formulaire POSTe. Pas de score ici (c'était le propre de la v3),
   seulement success + code d'erreur. Sans clés configurées, tout est désactivé
   (l'écran de connexion redevient exactement celui d'avant). */
export async function verifierRecaptcha(token: string, ip: string | null): Promise<Verification> {
  if (!recaptchaActif()) return { ok: true };
  if (!token) return { ok: false, motif: "aucun jeton — case cochée, ou domaine absent de la liste Google ?" };

  try {
    // secret + response + remoteip : c'est tout ce que la v2 documente pour siteverify. « origin » et
    // « action » sont propres à la v3, donc rien n'est envoyé ici.
    const corps = new URLSearchParams({ secret: CLE_SECRET, response: token });
    if (ip) corps.set("remoteip", ip);
    const res = await fetch(URL_VERIF, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: corps.toString(),
      cache: "no-store",
    });
    const json = await res.json();

    if (!json.success) {
      const codes = Array.isArray(json["error-codes"]) ? json["error-codes"].join(",") : "inconnu";
      // Base64url sans casse : un jeton intact ne contient ni espace, ni saut de ligne, ni « % ».
      const propre = /^[A-Za-z0-9\-_]+$/.test(token);
      const formes = token.match(/[A-Za-z0-9\-_]{20,}/g) ?? [];
      return {
        ok: false,
        motif: `jeton refusé (${codes}) — ${token.length} caractères, base64url propre=${propre}, ${formes.length} bloc(s) continu(s), ` +
          `début « ${token.slice(0, 8)} », fin « ${token.slice(-8)} »`,
      };
    }
    return { ok: true };
  } catch {
    // Google injoignable : on refuse la connexion. Tolérer l'échec rendrait le captcha inutile.
    return { ok: false, motif: "siteverify injoignable" };
  }
}
