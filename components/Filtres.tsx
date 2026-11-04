import { ReactNode } from "react";
import { lien, type Parametres, type Periode } from "@/lib/filtres";

/* Les filtres de tous les ecrans : un <form method="get"> qui relit la page.
   Aucune logique cliente, le select et les deux dates vivent dans l URL, donc le
   bouton precedent / un lien partage fonctionne. */

export function BarreFiltres({
  base,
  params,
  caches = {},
  note,
  children,
}: {
  base: string;
  params: Parametres;
  caches?: Record<string, string>;
  note?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <form method="get" action={base} className="card space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        {Object.entries(caches).map(([cle, valeur]) => (
          <input key={cle} type="hidden" name={cle} value={valeur} />
        ))}
        {children}
        <div className="flex items-end gap-2">
          <button className="btn-primary">Filtrer</button>
          <a href={lien(base, {})} className="btn-ghost">
            Réinitialiser
          </a>
        </div>
      </div>
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </form>
  );
}

export function SelectFiltre({
  label,
  name,
  options,
  value,
  vide,
  requis,
  large,
}: {
  label: string;
  name: string;
  options: { valeur: string; libelle: string }[];
  value?: string;
  vide?: string;
  requis?: boolean;
  large?: boolean;
}) {
  return (
    <div className={large ? "min-w-[260px] grow" : "min-w-[170px] grow md:grow-0"}>
      <label className="label">{label}</label>
      <select name={name} className="input" defaultValue={value ?? ""} required={requis}>
        {vide !== undefined && <option value="">{vide}</option>}
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
    </div>
  );
}

export function PeriodeFiltre({ periode, cache }: { periode: Periode; cache?: boolean }) {
  return (
    <>
      {cache && <input type="hidden" name="debut" value={periode.debut} />}
      {cache && <input type="hidden" name="fin" value={periode.fin} />}
      {!cache && (
        <div className="flex items-end gap-2 min-w-[240px]">
          <div className="grow">
            <label className="label">Du</label>
            <input className="input" type="date" name="debut" defaultValue={periode.debut} />
          </div>
          <div className="grow">
            <label className="label">Au</label>
            <input className="input" type="date" name="fin" defaultValue={periode.fin} />
          </div>
        </div>
      )}
    </>
  );
}

export const NOTE_PERIODE =
  "Les dates filtrent sur la semaine complète : choisir un jour ramène automatiquement au lundi, la fin au dimanche.";
