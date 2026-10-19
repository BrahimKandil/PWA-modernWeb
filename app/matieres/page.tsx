import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const STATUT_BADGE: Record<string, string> = { en_cours: "badge-blue", termine: "badge-amber", valide: "badge-green" };
const STATUT_LABEL: Record<string, string> = { en_cours: "En cours", termine: "Clôturée — à valider", valide: "Validée" };

export default async function MatieresPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = getSession()!;
  const isAdmin = session.role === "admin";
  const isProf = session.role === "prof";
  const db = getDb();

  const matieres = (isAdmin || isProf
    ? db.prepare(
        `SELECT m.*, c.nom classe, u.prenom pp, u.nom pn
         FROM matieres m JOIN classes c ON c.id=m.classe_id LEFT JOIN users u ON u.id=m.prof_id
         ${isProf ? "WHERE m.prof_id=" + session.id : ""} ORDER BY c.nom, m.code`
      ).all()
    : db.prepare(
        `SELECT m.*, c.nom classe, u.prenom pp, u.nom pn
         FROM matieres m JOIN classes c ON c.id=m.classe_id LEFT JOIN users u ON u.id=m.prof_id
         WHERE m.classe_id=? ORDER BY m.code`
      ).all(session.classe_id ?? -1)) as any[];

  const classes = db.prepare(`SELECT * FROM classes ORDER BY nom`).all() as any[];
  const profs = db.prepare(`SELECT * FROM users WHERE role='prof' AND actif=1 ORDER BY nom`).all() as any[];
  const aValider = isAdmin ? (db.prepare(`SELECT * FROM matieres WHERE statut='termine'`).all() as any[]) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">📚 Gestion des matières</h1>
        <p className="text-sm text-slate-500">
          {isAdmin ? "L'admin définit coefficient, heures, professeur responsable et classe. Un email est envoyé au professeur."
            : isProf ? "Vos affectations (matières dont vous êtes responsable)."
            : "Les matières de votre classe."}
        </p>
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {searchParams.error}</div>}

      {aValider.length > 0 && (
        <div className="card border-amber-300">
          <h2 className="font-semibold mb-2">⏳ Matières clôturées par les profs — en attente de votre validation</h2>
          {aValider.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 py-1">
              <span className="text-sm">{m.code} — {m.nom}</span>
              <form action="/api/matieres" method="post">
                <input type="hidden" name="action" value="valider" />
                <input type="hidden" name="id" value={m.id} />
                <button className="btn-primary text-xs">Valider et publier aux étudiants</button>
              </form>
            </div>
          ))}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr><th>Code</th><th>Matière</th><th>Classe</th><th>Coef</th><th>Heures</th><th>Professeur</th><th>Statut</th>{isAdmin && <th>Actions</th>}</tr>
          </thead>
          <tbody>
            {matieres.map((m) => (
              <tr key={m.id}>
                <td className="font-mono font-semibold">{m.code}</td>
                <td>{m.nom}</td>
                <td>{m.classe}</td>
                <td>{m.coefficient}</td>
                <td>{m.heures}h</td>
                <td>{m.pp ? `${m.pp} ${m.pn}` : "—"}</td>
                <td><span className={STATUT_BADGE[m.statut]}>{STATUT_LABEL[m.statut]}</span></td>
                {isAdmin && (
                  <td>
                    <form action="/api/matieres" method="post">
                      <input type="hidden" name="action" value="delete" />
                      <input type="hidden" name="id" value={m.id} />
                      <button className="btn-danger text-xs">Supprimer</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {matieres.length === 0 && <tr><td colSpan={8} className="text-slate-500">Aucune matière.</td></tr>}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <div className="card">
          <h2 className="font-semibold mb-3">Nouvelle matière</h2>
          <form action="/api/matieres" method="post" className="grid md:grid-cols-6 gap-3 items-end">
            <input type="hidden" name="action" value="create" />
            <div><label className="label">Code</label><input className="input" name="code" placeholder="ALGO" required /></div>
            <div><label className="label">Nom</label><input className="input" name="nom" placeholder="Algorithmique" required /></div>
            <div>
              <label className="label">Classe</label>
              <select className="input" name="classe_id" required>
                <option value="">—</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <div><label className="label">Coef</label><input className="input" type="number" name="coefficient" min="1" max="6" defaultValue={3} required /></div>
            <div><label className="label">Heures</label><input className="input" type="number" name="heures" min="1" defaultValue={18} required /></div>
            <div>
              <label className="label">Professeur</label>
              <select className="input" name="prof_id">
                <option value="">— Aucun —</option>
                {profs.map((p) => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
              </select>
            </div>
            <button className="btn-primary md:col-span-6 justify-center">Créer et notifier le professeur</button>
          </form>
        </div>
      )}
    </div>
  );
}
