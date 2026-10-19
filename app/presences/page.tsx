import { getDb } from "@/lib/db";
import { getSession, todayISO } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PresencesPage({
  searchParams,
}: {
  searchParams: { matiere_id?: string; date?: string; ok?: string; error?: string };
}) {
  const session = getSession()!;
  const db = getDb();
  const isEtudiant = session.role === "etudiant";
  const date = searchParams.date || todayISO();
  const statutBadge: Record<string, string> = { present: "green", absent: "red", retard: "amber" };

  if (isEtudiant) {
    const historique: any[] = db
      .prepare(
        `SELECT p.*, m.code matiere_code, m.nom matiere_nom, u.prenom prof_prenom, u.nom prof_nom
         FROM presences p
         JOIN matieres m ON m.id = p.matiere_id
         LEFT JOIN users u ON u.id = p.prof_id
         WHERE p.etudiant_id = ? ORDER BY p.date DESC, m.code`
      )
      .all(session.id);
    const nbAbsents = historique.filter((h) => h.statut === "absent").length;
    const nbRetards = historique.filter((h) => h.statut === "retard").length;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">🕒 Mes présences</h1>
          <p className="text-sm text-slate-500">Consultez vos absences et retards relevés par vos professeurs.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="card text-center"><div className="text-3xl font-bold">{historique.length}</div><div className="text-sm text-slate-500">Séances suivies</div></div>
          <div className="card text-center"><div className="text-3xl font-bold text-red-600">{nbAbsents}</div><div className="text-sm text-slate-500">Absences</div></div>
          <div className="card text-center"><div className="text-3xl font-bold text-amber-600">{nbRetards}</div><div className="text-sm text-slate-500">Retards</div></div>
        </div>

        <div className="card overflow-x-auto">
          <table className="data">
            <thead><tr><th>Date</th><th>Matière</th><th>Statut</th><th>Professeur</th></tr></thead>
            <tbody>
              {historique.map((p) => (
                <tr key={p.id}>
                  <td>{p.date}</td>
                  <td><span className="font-mono font-semibold">{p.matiere_code}</span> — {p.matiere_nom}</td>
                  <td><span className={`badge-${statutBadge[p.statut]}`}>{p.statut}</span></td>
                  <td>{p.prof_prenom ? `${p.prof_prenom} ${p.prof_nom}` : "—"}</td>
                </tr>
              ))}
              {historique.length === 0 && (
                <tr><td colSpan={4} className="text-center text-slate-400 py-4">Aucune présence enregistrée pour le moment.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // admin / prof
  const matieres =
    session.role === "admin"
      ? (db.prepare(`SELECT m.*, c.nom classe_nom FROM matieres m JOIN classes c ON c.id=m.classe_id WHERE m.statut!='valide' ORDER BY m.code`).all() as any[])
      : (db.prepare(`SELECT m.*, c.nom classe_nom FROM matieres m JOIN classes c ON c.id=m.classe_id WHERE m.prof_id=? ORDER BY m.code`).all(session.id) as any[]);

  const matiereId = Number(searchParams.matiere_id ?? matieres[0]?.id ?? 0);
  const matiere = matieres.find((m) => m.id === matiereId) ?? matieres[0] ?? null;

  let etudiants: any[] = [];
  if (matiere) {
    const rows = db
      .prepare(
        `SELECT u.id, u.prenom, u.nom,
          (SELECT p.statut FROM presences p WHERE p.etudiant_id=u.id AND p.matiere_id=? AND p.date=?) statut
         FROM users u WHERE u.role='etudiant' AND u.classe_id=? AND u.actif=1 ORDER BY u.nom, u.prenom`
      )
      .all(matiere.id, date, matiere.classe_id) as any[];
    etudiants = rows;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🕒 Signaler les présences</h1>
        <p className="text-sm text-slate-500">
          {session.role === "admin" ? "Relevé d&apos;appel pour n&apos;importe quelle matière active." : "Relevé d&apos;appel pour vos matières."}
        </p>
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {searchParams.error}</div>}
      {searchParams.ok && <div className="badge-green w-fit">✅ Présences enregistrées.</div>}

      <div className="card">
        <form className="grid md:grid-cols-2 gap-4 items-end" method="get">
          <div>
            <label className="label">Matière</label>
            <select className="input" name="matiere_id">
              {matieres.map((m) => (
                <option key={m.id} value={m.id} selected={m.id === matiere?.id}>{m.code} — {m.nom} ({m.classe_nom})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date de séance</label>
            <input className="input" type="date" name="date" defaultValue={date} max={todayISO()} />
          </div>
          <button className="btn-primary md:col-span-2 justify-center">Charger l&apos;appel</button>
        </form>
      </div>

      {matiere && (
        <div className="card">
          <h2 className="font-semibold mb-1">Appel : {matiere.code} — {matiere.nom}</h2>
          <p className="text-sm text-slate-500 mb-4">Classe {matiere.classe_nom} · {date}</p>
          <form action="/api/presences" method="post" className="space-y-3">
            <input type="hidden" name="action" value="save" />
            <input type="hidden" name="matiere_id" value={matiere.id} />
            <input type="hidden" name="date" value={date} />
            {etudiants.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2">
                <span className="font-medium">{e.prenom} {e.nom}</span>
                <div className="flex gap-2">
                  {(["present", "absent", "retard"] as const).map((s) => (
                    <label key={s} className={`cursor-pointer rounded-full border px-3 py-1 text-xs capitalize transition ${
                      (e.statut ?? "present") === s
                        ? s === "present" ? "bg-green-100 border-green-400 text-green-800"
                          : s === "absent" ? "bg-red-100 border-red-400 text-red-800"
                          : "bg-amber-100 border-amber-400 text-amber-800"
                        : "border-slate-200 text-slate-500 hover:border-slate-400"
                    }`}>
                      <input type="radio" name={`statut_${e.id}`} value={s} defaultChecked={(e.statut ?? "present") === s} className="sr-only" />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {etudiants.length === 0 && <p className="text-slate-400 text-sm">Aucun étudiant dans cette classe.</p>}
            <button className="btn-primary">Enregistrer l&apos;appel</button>
          </form>
        </div>
      )}
      {!matiere && <div className="card text-slate-500 text-sm">Créez d&apos;abord une matière pour pouvoir faire l&apos;appel.</div>}
    </div>
  );
}
