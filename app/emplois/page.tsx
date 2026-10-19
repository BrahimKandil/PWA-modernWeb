import { getDb } from "@/lib/db";
import { getSession, mondayOf } from "@/lib/auth";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"];

function weekLabel(monday: string) {
  const d = new Date(monday);
  const f = (x: Date) => x.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const e = new Date(d);
  e.setDate(e.getDate() + 4);
  return `Semaine du ${f(d)} au ${f(e)}`;
}

export default async function EmploisPage({ searchParams }: { searchParams: { error?: string; classe_id?: string; semaine?: string } }) {
  const session = getSession()!;
  const db = getDb();
  const isAdmin = session.role === "admin";
  const isEtudiant = session.role === "etudiant";

  const classes = db.prepare(`SELECT * FROM classes ORDER BY nom`).all() as any[];
  const semaine = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.semaine ?? "") ? searchParams.semaine! : mondayOf();
  const classeId = isEtudiant
    ? session.classe_id ?? -1
    : Number(searchParams.classe_id) || classes[0]?.id || -1;

  const slots = db
    .prepare(
      `SELECT e.*, m.code, m.nom matiere, s.nom salle FROM emplois e
       JOIN matieres m ON m.id=e.matiere_id JOIN salles s ON s.id=e.salle_id
       WHERE e.classe_id=? AND e.semaine_debut=?`
    )
    .all(classeId, semaine) as any[];
  const get = (jour: string, creneau: number) => slots.find((x) => x.jour === jour && x.creneau === creneau);

  const matieresClasse = db.prepare(`SELECT * FROM matieres WHERE classe_id=? ORDER BY code`).all(classeId) as any[];
  const salles = db.prepare(`SELECT * FROM salles ORDER BY nom`).all() as any[];
  const classe = classes.find((c) => c.id === classeId);

  return (
    <div className="space-y-4 print:bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🗓️ Emploi du temps — {classe?.nom ?? "Aucune classe"}</h1>
          <p className="text-sm text-slate-500">{weekLabel(semaine)} · 2 matières max par jour, 3h par matière · accessible hors ligne après consultation, export PDF (nécessite une connexion)</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <a
            className="btn-primary"
            href={`/api/emplois/pdf?classe_id=${classeId}&semaine=${semaine}`}
            download
          >
            ⬇️ Télécharger en PDF
          </a>
          <PrintButton />
        </div>
      </div>

      {searchParams.error && <div className="badge-red w-fit print:hidden">Erreur : {searchParams.error}</div>}

      {isEtudiant && !session.classe_id && (
        <p className="text-sm text-amber-700">Vous n&apos;êtes affecté à aucune classe. Contactez l&apos;administration.</p>
      )}

      <form method="get" action="/emplois" className="flex flex-wrap gap-3 items-end print:hidden">
        {!isEtudiant && (
          <div>
            <label className="label">Classe</label>
            <select className="input" name="classe_id" defaultValue={classeId}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
        )}
        <div><label className="label">Semaine (lundi)</label><input className="input" type="date" name="semaine" value={semaine} /></div>
        <button className="btn-ghost">Afficher</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="data w-full">
          <thead>
            <tr><th className="w-28">Horaire</th>{JOURS.map((j) => <th key={j}>{j}</th>)}</tr>
          </thead>
          <tbody>
            {[1, 2].map((creneau) => (
              <tr key={creneau}>
                <td className="font-semibold text-slate-600">{creneau === 1 ? "09:00 – 12:00" : "13:00 – 16:00"}</td>
                {JOURS.map((jour) => {
                  const c = get(jour, creneau);
                  return (
                    <td key={jour} className="align-top min-w-36">
                      {c ? (
                        <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-2 text-xs">
                          <div className="font-bold text-indigo-800">{c.code}</div>
                          <div>{c.matiere}</div>
                          <div className="text-slate-500">Salle {c.salle}</div>
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
      </div>

      {isAdmin && classe && (
        <div className="card print:hidden">
          <h2 className="font-semibold mb-1">Définir l&apos;emploi de la semaine — {classe.nom}</h2>
          <p className="text-xs text-slate-500 mb-3">Maximum 2 matières par jour (matin 3h / après-midi 3h). Laissez vide = jour libre.</p>
          <form action="/api/emplois" method="post" className="space-y-3">
            <input type="hidden" name="action" value="save-week" />
            <input type="hidden" name="classe_id" value={classeId} />
            <input type="hidden" name="semaine_debut" value={semaine} />
            <div className="grid md:grid-cols-5 gap-3">
              {JOURS.map((jour) => (
                <div key={jour} className="border border-slate-200 rounded-lg p-2">
                  <h3 className="font-bold text-xs text-indigo-700 mb-2">{jour}</h3>
                  {[1, 2].map((creneau) => {
                    const c = get(jour, creneau);
                    return (
                      <div key={creneau} className="mb-2">
                        <label className="label">{creneau === 1 ? "Matin 9h-12h" : "Après-midi 13h-16h"}</label>
                        <select className="input mb-1" name={`${jour}_${creneau}_matiere`} defaultValue={c?.matiere_id ?? ""}>
                          <option value="">Libre</option>
                          {matieresClasse.map((m) => <option key={m.id} value={m.id}>{m.code}</option>)}
                        </select>
                        <select className="input" name={`${jour}_${creneau}_salle`} defaultValue={c?.salle_id ?? ""}>
                          <option value="">Salle…</option>
                          {salles.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button className="btn-primary">Enregistrer la semaine</button>
            </div>
          </form>
          <form action="/api/emplois" method="post" className="mt-2">
            <input type="hidden" name="action" value="copy-prev" />
            <input type="hidden" name="classe_id" value={classeId} />
            <input type="hidden" name="semaine_debut" value={semaine} />
            <button className="btn-ghost text-xs">Copier la semaine précédente</button>
          </form>
        </div>
      )}
    </div>
  );
}
