/* Règle de la semaine d'emploi du temps : elle se tient du lundi au vendredi,
   et le samedi 00h la verrouille. Toutes les semaines futures sont modificables
   (remplir la semaine d'apres depuis le week-end courant est normal).
   Dates manipulées en fuseau LOCAL : `toISOString` décalerait d'un jour entre minuit et 1h. */

export function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function aujourdhui() {
  return isoLocal(new Date());
}

// Décale une semaine (lundi) de n jours, en gardant la forme AAAA-MM-JJ.
export function decale(semaine: string, jours: number) {
  const d = new Date(`${semaine}T00:00:00`);
  if (Number.isNaN(d.getTime())) return semaine;
  d.setDate(d.getDate() + jours);
  return isoLocal(d);
}

export const semainePrecedente = (semaine: string) => decale(semaine, -7);
export const semaineSuivante = (semaine: string) => decale(semaine, 7);

// Le samedi qui ferme la semaine : à partir de ce jour, plus aucune modification possible.
export const samediDe = (semaine: string) => decale(semaine, 5);

export const verrouillee = (semaine: string) => aujourdhui() >= samediDe(semaine);

const estDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(new Date(`${iso}T00:00:00`).getTime());

// Ramene n'importe quel jour au lundi de sa semaine (et a son dimanche) : sert aux filtres « du / au ».
export const lundiDe = (iso: string) =>
  estDate(iso) ? decale(iso, -((new Date(`${iso}T00:00:00`).getDay() + 6) % 7)) : iso;

export const dimancheDe = (iso: string) => (estDate(iso) ? decale(lundiDe(iso), 6) : iso);

export function libelle(semaine: string) {
  const f = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `Semaine du ${f(semaine)} au ${f(decale(semaine, 4))}`;
}
