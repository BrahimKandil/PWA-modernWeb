import type { NextRequest } from "next/server";

/**
 * Next renseigne req.nextUrl.origin avec son propre hostname (localhost), y compris
 * derrière un serveur personnalisé : toute redirection construite dessus enverrait un
 * téléphone sur son propre localhost. On garde le protocole détecté mais on reprend
 * l'autorité réellement demandée par le client.
 */
export function clientOrigin(req: NextRequest): string {
  const host = req.headers.get("host");
  return host ? `${req.nextUrl.protocol}//${host}` : req.nextUrl.origin;
}
