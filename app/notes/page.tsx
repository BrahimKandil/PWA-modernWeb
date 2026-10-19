import { getDb } from "@/lib/db";
import { getSession, todayISO } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NotesPage({ searchParams }: { searchParams: { error?: string; ok?: string; matiere_id?: string } }) {
  const session = getSession()!;
  const db = getDb();

  if (session.role === "etudiant") {
    const matieres = db
      .prepare(
        `SELECT m.*, c.nom classe_nom FROM matieres m JOIN classes c ON c.id=m.classe_id
         WHERE m.classe_id=? AND m.statut='valide' ORDER BY m.code`
      )
      .all(session.classe_id ?? -1) as any[];
    const enCours = db
      .prepare(
        `SELECT m.*, c.nom classe_nom FROM matieres m JOIN classes c ON c.id=m.classe_id
         WHERE m.classe_id=? AND m.statut!='valide' ORDER BY m.code`
      )
      .all(session.classe_id ?? -1) as any[];

    let moyenneGenerale = { sum: 0, coef: 0 };
    const fiches = matieres.map((m) => {
      const notes: any[] = db
        .prepare(`SELECT * FROM notes WHERE matiere_id=? AND etudiant_id=? ORDER BY date`)
        .all(m.id, session.id);
      const moyenne = notes.length ? notes.reduce((s, n) => s + n.valeur, 0) / notes.length : null;
      if (moyenne != null) {
        moyenneGenerale.sum += moyenne * m.coefficient;
        moyenneGenerale.coef += m.coefficient;
      }
      return { m, notes, moyenne };
    });
    const gen = moyenneGenerale.coef ? moyenneGenerale.sum / moyenneGenerale.coef : null;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">📝 Mes notes</h1>
          <p className="text-sm text-slate-500">Notes publiées après validation par l&apos;administration.</p>
        </div>

        {gen != null && (
          <div className="card flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Moyenne générale (matières validées)</p>
              <p className={`text-3xl font-bold ${gen >= 10 ? "text-green-600" : "text-red-600"}`}>{gen.toFixed(2)}/20</p>
            </div>
            <span className="text-4xl">🎓</span>
          </div>
        )}

        {fiches.map(({ m, notes, moyenne }) => (
          <div key={m.id} className="card space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{m.code} — {m.nom}</h2>
                <p className="text-xs text-slate-500">Coefficient {m.coefficient} · {m.classe_nom}</p>
              </div>
              <span className={`badge-${moyenne == null ? "gray" : moyenne >= 10 ? "green" : "red"}`}>
                Moyenne : {moyenne == null ? "—" : `${moyenne.toFixed(2)}/20`}
              </span>
            </div>
            <table className="data">
              <thead><tr><th>Type</th><th>Valeur</th><th>Date</th></tr></thead>
              <tbody>
                {notes.map((n) => (
                  <tr key={n.id}>
                    <td><span className="badge-blue">{n.type}</span></td>
                    <td className="font-semibold">{n.valeur}/20</td>
                    <td>{n.date}</td>
                  </tr>
                ))}
                {notes.length === 0 && <tr><td colSpan={3} className="text-center text-slate-400 py-3">Aucune note publiée.</td></tr>}
              </tbody>
            </table>
          </div>
        ))}
        {fiches.length === 0 && <div className="card text-slate-500 text-sm">Aucune matière validée pour l&apos;instant — vos notes apparaîtront ici après clôture et validation.</div>}

        {enCours.length > 0 && (
          <div className="card">
            <h2 className="font-semibold mb-2 text-sm">En attente de publication</h2>
            <div className="flex flex-wrap gap-2">
              {enCours.map((m) => (
                <span key={m.id} className={`badge-${m.statut === "termine" ? "amber" : "gray"}`}>
                  {m.code} {m.statut === "termine" ? "— clôturée, en attente de validation" : "— en cours"}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // admin / prof
  const matieres =
    session.role === "admin"
      ? (db.prepare(`SELECT m.*, c.nom classe_nom, u.prenom prof_prenom, u.nom prof_nom FROM matieres m JOIN classes c ON c.id=m.classe_id LEFT JOIN users u ON u.id=m.prof_id ORDER BY m.statut, m.code`).all() as any[])
      : (db.prepare(`SELECT m.*, c.nom classe_nom FROM matieres m JOIN classes c ON c.id=m.classe_id WHERE m.prof_id=? ORDER BY m.code`).all(session.id) as any[]);

  const matiereId = Number(searchParams.matiere_id ?? matieres.find((m) => m.statut === "en_cours")?.id ?? matieres[0]?.id ?? 0);
  const matiere = matieres.find((m) => m.id === matiereId) ?? null;
  const canEdit = matiere && (session.role === "admin" || matiere.prof_id === session.id);

  const etudiants = matiere
    ? (db.prepare(`SELECT id, prenom, nom FROM users WHERE role='etudiant' AND classe_id=? AND actif=1 ORDER BY nom, prenom`).all(matiere.classe_id) as any[])
    : [];
  const notes = matiere
    ? (db.prepare(`SELECT * FROM notes WHERE matiere_id=?`).all(matiere.id) as any[])
    : [];
  const noteOf = (etId: number, type: string) => notes.find((n) => n.etudiant_id === etId && n.type === type)?.valeur;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">📝 Gestion des notes</h1>
        <p className="text-sm text-slate-500">
          {session.role === "admin" ? "Vue globale — validez les matières clôturées dans Matières." : "Saisissez CC/TP, puis clôturez la matière avec les notes d&apos;examen."}
        </p>
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {searchParams.error}</div>}
      {searchParams.ok && <div className="badge-green w-fit">✅ Enregistré.</div>}

      <div className="card">
        <form className="grid md:grid-cols-2 gap-4 items-end" method="get">
          <div>
            <label className="label">Matière</label>
            <select className="input" name="matiere_id">
              {matieres.map((m) => (
                <option key={m.id} value={m.id} selected={m.id === matiere?.id}>
                  {m.code} — {m.nom} ({m.classe_nom}){m.statut !== "en_cours" ? ` [${m.statut}]` : ""}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary justify-center">Afficher</button>
        </form>
      </div>

      {matiere && (
        <>
          <div className="card overflow-x-auto">
            <h2 className="font-semibold mb-3">
              {matiere.code} — {matiere.nom} · coef {matiere.coefficient} ·{" "}
              <span className={`badge-${matiere.statut === "valide" ? "green" : matiere.statut === "termine" ? "amber" : "blue"}`}>
                {matiere.statut === "en_cours" ? "En cours" : matiere.statut === "termine" ? "Clôturée — en attente de validation admin" : "Validée — publiée aux étudiants"}
              </span>
            </h2>
            <table className="data">
              <thead><tr><th>Étudiant</th><th>CC</th><th>TP</th><th>Examen</th></tr></thead>
              <tbody>
                {etudiants.map((e) => (
                  <tr key={e.id}>
                    <td className="font-medium">{e.prenom} {e.nom}</td>
                    <td>{noteOf(e.id, "CC") ?? "—"} {noteOf(e.id, "CC") != null ? "/20" : ""}</td>
                    <td>{noteOf(e.id, "TP") ?? "—"} {noteOf(e.id, "TP") != null ? "/20" : ""}</td>
                    <td>{noteOf(e.id, "EXAM") ?? "—"} {noteOf(e.id, "EXAM") != null ? "/20" : ""}</td>
                  </tr>
                ))}
                {etudiants.length === 0 && <tr><td colSpan={4} className="text-center text-slate-400 py-3">Aucun étudiant dans cette classe.</td></tr>}
              </tbody>
            </table>
          </div>

          {canEdit && matiere.statut === "en_cours" && (
            <div className="card">
              <h2 className="font-semibold mb-3">Ajouter une note CC / TP</h2>
              <form action="/api/notes" method="post" className="grid md:grid-cols-5 gap-3 items-end">
                <input type="hidden" name="action" value="create" />
                <input type="hidden" name="matiere_id" value={matiere.id} />
                <div>
                  <label className="label">Étudiant</label>
                  <select className="input" name="etudiant_id" required>
                    {etudiants.map((e) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Type</label>
                  <select className="input" name="type" defaultValue="CC">
                    <option value="CC">CC</option>
                    <option value="TP">TP</option>
                  </select>
                </div>
                <div><label className="label">Valeur /20</label><input className="input" type="number" name="valeur" min="0" max="20" step="0.25" required /></div>
                <div><label className="label">Date</label><input className="input" type="date" name="date" defaultValue={todayISO()} max={todayISO()} required /></div>
                <button className="btn-primary justify-center">Ajouter</button>
              </form>
            </div>
          )}

          {session.role === "prof" && matiere.statut === "en_cours" && etudiants.length > 0 && (
            <div className="card border-2 border-amber-300">
              <h2 className="font-semibold mb-1">🔒 Clôture de la matière — notes d&apos;examen final</h2>
              <p className="text-sm text-slate-500 mb-4">
                À la fin du cours ({matiere.heures}h prévues), attribuez la note d&apos;examen de chaque étudiant puis clôturez.
                L&apos;administration devra valider avant que les étudiants voient leurs notes.
              </p>
              <form action="/api/notes" method="post" className="space-y-3">
                <input type="hidden" name="action" value="cloturer" />
                <input type="hidden" name="matiere_id" value={matiere.id} />
                <div className="grid md:grid-cols-2 gap-3">
                  {etudiants.map((e) => (
                    <div key={e.id} className="flex items-center gap-3">
                      <span className="flex-1 text-sm font-medium">{e.prenom} {e.nom}</span>
                      <input className="input w-24" type="number" name={`note_${e.id}`} min="0" max="20" step="0.25" placeholder="/20" defaultValue={noteOf(e.id, "EXAM") ?? ""} required />
                    </div>
                  ))}
                </div>
                <button className="btn-danger">Clôturer la matière et envoyer à validation</button>
              </form>
            </div>
          )}
        </>
      )}
      {!matiere && <div className="card text-slate-500 text-sm">Aucune matière {session.role === "prof" ? "ne vous est attribuée" : "n&apos;existe"} — créez-en une dans Matières.</div>}
    </div>
  );
}
