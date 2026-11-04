import type { LigneEmploi } from "@/lib/hors-ligne";

const JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"];
const CREAUX: Record<number, string> = { 1: "09:00 – 12:00", 2: "13:00 – 16:00" };

export default function EmploiTableau({ lignes }: { lignes: LigneEmploi[] }) {
  const trouve = (jour: string, creneau: number) => lignes.find((e) => e.jour === jour && e.creneau === creneau);
  return (
    <table className="data w-full">
      <thead>
        <tr>
          <th className="w-28">Horaire</th>
          {JOURS.map((j) => (
            <th key={j}>{j.slice(0, 3)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[1, 2].map((creneau) => (
          <tr key={creneau}>
            <td className="font-semibold text-xs text-slate-500 whitespace-nowrap">{CREAUX[creneau]}</td>
            {JOURS.map((jour) => {
              const c = trouve(jour, creneau);
              return (
                <td key={jour} className="align-top">
                  {c ? (
                    <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-2 text-xs">
                      <div className="font-bold text-indigo-800">{c.code}</div>
                      <div>{c.matiere}</div>
                      <div className="text-slate-500">
                        Salle {c.salle}
                        {c.prof ? ` · ${c.prof}` : ""}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
