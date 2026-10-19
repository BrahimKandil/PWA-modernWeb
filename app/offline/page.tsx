export const dynamic = "force-dynamic";

import { getDb } from "@/lib/db";
import { getSession, mondayOf } from "@/lib/auth";

const JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"];
const CREAUX: Record<number, string> = { 1: "09:00 – 12:00", 2: "13:00 – 16:00" };

export default async function OfflinePage() {
  // Si un utilisateur connecté avait consulté son emploi avant la coupure,
  // la page /offline mise en cache peut avoir été régénérée avec son calendrier ;
  // sinon on affiche une semaine type vide.
  let session = null;
  let emplois: any[] = [];
  try {
    session = getSession();
    if (session) {
      const db = getDb();
      const filtre = session.role === "etudiant" ? "AND e.classe_id = ?" : "";
      const params = session.role === "etudiant" ? [mondayOf(), session.classe_id ?? -1] : [mondayOf()];
      emplois = db
        .prepare(
          `SELECT e.jour, e.creneau, m.code, m.nom, s.nom salle, c.nom classe
           FROM emplois e JOIN matieres m ON m.id=e.matiere_id JOIN salles s ON s.id=e.salle_id JOIN classes c ON c.id=e.classe_id
           WHERE e.semaine_debut=? ${filtre}`
        )
        .all(...params) as any[];
    }
  } catch {
    // hors ligne pur : cookies/DB indisponibles, on garde la semaine type vide
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="card w-full max-w-2xl text-center space-y-4">
        <div className="text-5xl">📡</div>
        <h1 className="text-xl font-bold">Vous êtes hors ligne</h1>
        <p className="text-sm text-slate-500">
          Cette page fonctionne sans connexion. Voici le calendrier de la semaine :
          <span className="block font-semibold mt-1">{mondayOf()}</span>
        </p>

        <div className="overflow-x-auto text-left">
          <table className="data">
            <thead>
              <tr><th></th>{JOURS.map((j) => <th key={j}>{j.slice(0, 3)}</th>)}</tr>
            </thead>
            <tbody>
              {[1, 2].map((cr) => (
                <tr key={cr}>
                  <td className="whitespace-nowrap text-xs font-semibold text-slate-500">{CREAUX[cr]}</td>
                  {JOURS.map((j) => {
                    const c = emplois.find((e) => e.jour === j && e.creneau === cr);
                    return (
                      <td key={j} className="align-top">
                        {c ? (
                          <div>
                            <div className="font-semibold text-xs">{c.code}</div>
                            <div className="text-[10px] text-slate-500">{c.classe} · {c.salle}</div>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">Libre</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-400">
          Les pages consultées avec une connexion (emploi du temps, notes, présences…) restent accessibles hors ligne.
        </p>
        <a href="/" className="btn-primary inline-flex">Reconnexion — réessayer</a>
      </div>
    </div>
  );
}
