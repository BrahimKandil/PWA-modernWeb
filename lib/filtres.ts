import { aujourdhui, decale, dimancheDe, lundiDe } from "./semaine";

/* Briques communes de tous les filtres d'ecran : valeurs de query string, periode
   du-deja au-deja, annee scolaire, pagination. Les pages restent des Server Components :
   chaque filtre est un simple <form method="get">, aucun JS n'est necessaire. */

export type Parametres = Record<string, string | string[] | undefined>;

export function valeur(p: Parametres, nom: string): string {
  const brute = p?.[nom];
  const txt = Array.isArray(brute) ? brute[0] : brute;
  return typeof txt === "string" ? txt.trim() : "";
}

export function nombre(p: Parametres, nom: string): number {
  const n = Number(valeur(p, nom));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* ---- periode : toute date choisie est etendue a la semaine complete qui la contient ----
   Le 19/10 (jeudi) seul donne 19/10 -> meme semaine : lundi 19/10 .. dimanche 25/10.
   debut = lundi(debut choisi), fin = dimanche(fin choisie). */

export type Periode = { debut: string; fin: string; dit: string };

function forme(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export const libellePeriode = (debut: string, fin: string) =>
  debut === fin ? forme(debut) : `du ${forme(debut)} au ${forme(fin)}`;

export function periode(p: Parametres): Periode {
  const d = valeur(p, "debut");
  const f = valeur(p, "fin");
  let debut: string;
  let fin: string;
  if (d && f) { debut = lundiDe(d); fin = dimancheDe(f); }
  else if (d) { debut = lundiDe(d); fin = dimancheDe(d); }
  else if (f) { debut = lundiDe(f); fin = dimancheDe(f); }
  else { const a = aujourdhui(); debut = lundiDe(a); fin = dimancheDe(a); }
  if (fin < debut) fin = debut;
  return { debut, fin, dit: libellePeriode(debut, fin) };
}

// Filtre Mongo pret a passer a findDocs sur une colonne de date AAAA-MM-JJ.
export function parPeriode(per: Periode, champ = "date") {
  return { [champ]: { $gte: per.debut, $lte: per.fin } };
}

// Colonnes « AAAA-MM-JJ HH:mm » (emails, notifications, reclamations, depots) : sans borne
// horaire, le $lte egal a la date du jour exclurait tout ce qui est pose apres minuit.
export function parPeriodeComplete(per: Periode, champ = "cree_le") {
  return { [champ]: { $gte: per.debut, $lte: `${per.fin} 23:59` } };
}

// Filtre Mongo sur une annee civile (colonne texte commence par « 2026 »).
export function parAnnee(annee: string, champ = "cree_le") {
  return annee ? { [champ]: { $gte: `${annee}-01-01`, $lte: `${annee}-12-31 23:59` } } : {};
}

export function anneesDeDates(documents: { cree_le?: string }[]): string[] {
  const trouvees = new Set<string>();
  for (const d of documents) {
    const a = String(d.cree_le ?? "").slice(0, 4);
    if (/^\d{4}$/.test(a)) trouvees.add(a);
  }
  return [...trouvees].sort().reverse();
}

// Une semaine d'emploi du temps se designe par son lundi : on garde le meme ancrage.
export const semaineDe = (iso: string) => lundiDe(iso);
export const joursDePeriode = (per: Periode) => {
  const liste: string[] = [];
  for (let j = 0; j < 7; j++) {
    const iso = decale(per.debut, j);
    if (iso > per.fin) break;
    liste.push(iso);
  }
  return liste;
};

/* ---- annee scolaire ----
   Seule source aujourd'hui : classes.annee ("2026-2027"). Tout le reste s'y rattache
   par classe_id, donc filtrer par annee = filtrer l'ensemble des classes de cette annee. */

export function anneesDe(classes: { annee?: string | null }[]): string[] {
  const trouvees = new Set<string>();
  for (const c of classes) if (c.annee) trouvees.add(c.annee);
  return [...trouvees].sort().reverse();
}

export function anneeCourante(): string {
  const y = new Date().getFullYear();
  // Une annee commence en aout/septembre : en janvier on est encore dans 2025-2026.
  const base = new Date().getMonth() >= 7 ? y : y - 1;
  return `${base}-${base + 1}`;
}

export function choixAnnee(p: Parametres, classes: { annee?: string | null }[]): string {
  const choisi = valeur(p, "annee");
  if (choisi) return choisi;
  const dispo = anneesDe(classes);
  const cetteAnnee = anneeCourante();
  if (dispo.includes(cetteAnnee)) return cetteAnnee;
  return dispo[0] ?? "";
}

export function classesDeAnnee<T extends { annee?: string | null }>(classes: T[], annee: string): T[] {
  return annee ? classes.filter((c) => c.annee === annee) : classes;
}

/* ---- pagination ---- */

export type EtatPagination = {
  page: number;
  pages: number;
  parPage: number;
  total: number;
  saut: number;
  de: number;
  a: number;
};

export function pagination(total: number, p: Parametres, parPage = 12): EtatPagination {
  const pages = Math.max(1, Math.ceil(total / parPage));
  const voulue = Number(valeur(p, "page")) || 1;
  const page = Math.min(Math.max(1, voulue), pages);
  return {
    page,
    pages,
    parPage,
    total,
    saut: (page - 1) * parPage,
    de: total === 0 ? 0 : (page - 1) * parPage + 1,
    a: Math.min(total, page * parPage),
  };
}

/* Reconstruit une URL de filtre en ne changeant que ce qu'on passe : les autres
   filtres survivent au clic sur « page suivante » ou sur un onglet. */
export function lien(base: string, p: Parametres, mods: Parametres = {}): string {
  const url = new URLSearchParams();
  for (const [cle, brute] of Object.entries({ ...p, ...mods })) {
    const txt = Array.isArray(brute) ? brute[0] : brute;
    if (txt && String(txt).trim() !== "") url.set(cle, String(txt).trim());
  }
  const q = url.toString();
  return q ? `${base}?${q}` : base;
}

/* URL d'action d'un formulaire POST : l'etat des filtres voyage jusqu'a l'API, qui renvoie
   ensuite le clic sur exactement la meme vue (onglet, recherche, page). */
export function actionFormulaire(api: string, p: Parametres): string {
  const u = new URLSearchParams();
  for (const [cle, brute] of Object.entries(p)) {
    const txt = Array.isArray(brute) ? brute[0] : brute;
    if (cle === "error" || cle === "ok") continue;
    if (txt && String(txt).trim() !== "") u.set(cle, String(txt).trim());
  }
  const q = u.toString();
  return q ? `${api}?retour=${encodeURIComponent(q)}` : api;
}
