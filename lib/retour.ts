import { NextRequest, NextResponse } from "next/server";
import { clientOrigin } from "./origin";

/* Redirection 303 vers la vue d'ou vient le clic. Les formulaires POST sent leur
   etat de filtres dans l'URL d'action (?retour=...), donc « page 3 + onglet etudiants
   + recherche Dialle » survit a l'enregistrement. */
export function routeurRetour(req: NextRequest, chemin: string) {
  const brute = req.nextUrl.searchParams.get("retour") ?? "";
  const vers = (query = "") => {
    const url = new URL(chemin, clientOrigin(req));
    for (const [cle, valeur] of new URLSearchParams(brute)) url.searchParams.set(cle, valeur);
    for (const [cle, valeur] of new URLSearchParams(query)) url.searchParams.set(cle, valeur);
    return NextResponse.redirect(url, { status: 303 });
  };
  return {
    vers,
    erreur: (motif: string) => vers(`?error=${encodeURIComponent(motif)}`),
    ok: (motif: string) => vers(`?ok=${encodeURIComponent(motif)}`),
    refus: () => NextResponse.json({ error: "Accès refusé" }, { status: 403 }),
  };
}

export type Routeur = ReturnType<typeof routeurRetour>;
