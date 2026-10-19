import { getDb } from "@/lib/db";
import { getSession, todayISO } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ComptesRendusPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = getSession()!;
  const db = getDb();
  const today = todayISO();

  if (session.role === "etudiant") {
    const depots: any[] = db
      .prepare(
        `SELECT a.id, a.titre, a.consigne, a.date_limite, m.code matiere_code, m.nom matiere_nom,
          (SELECT d.contenu FROM cr_depots d WHERE d.assignment_id=a.id AND d.etudiant_id=? ) mon_contenu,
          (SELECT d.rendu_le FROM cr_depots d WHERE d.assignment_id=a.id AND d.etudiant_id=? ) mon_rendu,
          (SELECT d.note FROM cr_depots d WHERE d.assignment_id=a.id AND d.etudiant_id=? ) ma_note,
          (SELECT d.feedback FROM cr_depots d WHERE d.assignment_id=a.id AND d.etudiant_id=? ) mon_feedback
         FROM cr_assignments a
         JOIN matieres m ON m.id = a.matiere_id
         WHERE m.classe_id = ?
         ORDER BY a.date_limite DESC`
      )
      .all(session.id, session.id, session.id, session.id, session.classe_id ?? -1);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">📄 Mes comptes rendus</h1>
          <p className="text-sm text-slate-500">Déposez vos comptes rendus avant la date limite, suivez vos notes.</p>
        </div>
        {searchParams.error && <div className="badge-red w-fit">Erreur : {searchParams.error}</div>}

        {depots.map((a) => {
          const ouvert = a.date_limite >= today;
          const rendu = a.mon_contenu != null;
          return (
            <div key={a.id} className="card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{a.titre}</h2>
                  <p className="text-xs text-slate-500">{a.matiere_code} — {a.matiere_nom} · limite : {a.date_limite}</p>
                </div>
                <span className={`badge-${ouvert ? (rendu ? "green" : "blue") : rendu ? "green" : "red"}`}>
                  {ouvert ? (rendu ? "Déposé ✅" : "Ouvert — à déposer") : rendu ? "Déposé" : "Expired sans dépôt"}
                </span>
              </div>
              <p className="text-sm text-slate-600">{a.consigne}</p>

              {a.ma_note != null && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm">
                  <span className="font-bold">Note : {a.ma_note}/20</span>
                  {a.mon_feedback && <p className="text-slate-600 mt-1">Retour : {a.mon_feedback}</p>}
                </div>
              )}

              {ouvert && !rendu && (
                <form action="/api/comptes-rendus" method="post" className="space-y-2">
                  <input type="hidden" name="action" value="depot" />
                  <input type="hidden" name="assignment_id" value={a.id} />
                  <textarea className="input" name="contenu" rows={4} placeholder="Votre compte rendu (objectifs, étapes, résultats)…" required />
                  <button className="btn-primary">Déposer</button>
                </form>
              )}
              {rendu && (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
                  <p className="text-xs text-slate-400 mb-1">Votre dépôt du {a.mon_rendu} :</p>
                  <p className="whitespace-pre-wrap">{a.mon_contenu}</p>
                </div>
              )}
            </div>
          );
        })}
        {depots.length === 0 && <div className="card text-slate-500 text-sm">Aucun compte rendu assigné pour votre classe.</div>}
      </div>
    );
  }

  // admin / prof
  const assignments =
    session.role === "admin"
      ? (db.prepare(
          `SELECT a.*, m.code matiere_code, m.nom matiere_nom, u.prenom prof_prenom, u.nom prof_nom,
            (SELECT COUNT(*) FROM cr_depots d WHERE d.assignment_id=a.id) nb_depots
           FROM cr_assignments a JOIN matieres m ON m.id=a.matiere_id LEFT JOIN users u ON u.id=a.prof_id
           ORDER BY a.date_limite DESC`
        ).all() as any[])
      : (db.prepare(
          `SELECT a.*, m.code matiere_code, m.nom matiere_nom,
            (SELECT COUNT(*) FROM cr_depots d WHERE d.assignment_id=a.id) nb_depots
           FROM cr_assignments a JOIN matieres m ON m.id=a.matiere_id
           WHERE a.prof_id=? ORDER BY a.date_limite DESC`
        ).all(session.id) as any[]);

  const mesMatieres =
    session.role === "admin"
      ? (db.prepare(`SELECT m.*, c.nom classe_nom FROM matieres m JOIN classes c ON c.id=m.classe_id ORDER BY m.code`).all() as any[])
      : (db.prepare(`SELECT m.*, c.nom classe_nom FROM matieres m JOIN classes c ON c.id=m.classe_id WHERE m.prof_id=? ORDER BY m.code`).all(session.id) as any[]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">📄 Comptes rendus</h1>
        <p className="text-sm text-slate-500">
          {session.role === "admin" ? "Vue globale des comptes rendus de l&apos;établissement." : "Créez des CR avec date limite, corrigez les dépôts après expiration."}
        </p>
      </div>
      {searchParams.error && <div className="badge-red w-fit">Erreur : {searchParams.error}</div>}

      <div className="card">
        <h2 className="font-semibold mb-3">Nouveau compte rendu à rendre</h2>
        <form action="/api/comptes-rendus" method="post" className="grid md:grid-cols-2 gap-3">
          <input type="hidden" name="action" value="create" />
          <div><label className="label">Titre</label><input className="input" name="titre" placeholder="CR TP …" required /></div>
          <div>
            <label className="label">Matière</label>
            <select className="input" name="matiere_id" required>
              {mesMatieres.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.nom} ({m.classe_nom})</option>)}
            </select>
          </div>
          <div><label className="label">Date limite de dépôt</label><input className="input" type="date" name="date_limite" min={today} required /></div>
          <div className="md:col-span-2"><label className="label">Consigne</label><textarea className="input" name="consigne" rows={3} placeholder="Ce que les étudiants doivent rédiger…" required /></div>
          <button className="btn-primary md:col-span-2 justify-center">Créer</button>
        </form>
      </div>

      {assignments.map((a) => {
        const expired = a.date_limite < today;
        const depots = expired || a.nb_depots > 0
          ? (db.prepare(
              `SELECT d.*, u.prenom, u.nom FROM cr_depots d JOIN users u ON u.id=d.etudiant_id WHERE d.assignment_id=? ORDER BY d.note IS NOT NULL, u.nom`
            ).all(a.id) as any[])
          : [];
        return (
          <div key={a.id} className="card space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{a.titre}</h2>
                <p className="text-xs text-slate-500">
                  {a.matiere_code} — {a.matiere_nom}
                  {session.role === "admin" && a.prof_prenom ? ` · ${a.prof_prenom} ${a.prof_nom}` : ""}
                  {" · limite : "}{a.date_limite} · {a.nb_depots} dépôt(s)
                </p>
              </div>
              <span className={`badge-${expired ? "amber" : "blue"}`}>{expired ? "Expiration — correction" : "En cours de dépôt"}</span>
            </div>
            <p className="text-sm text-slate-600">{a.consigne}</p>

            {depots.length > 0 && (
              <div className="space-y-3">
                {depots.map((d) => (
                  <div key={d.id} className="rounded-lg border border-slate-200 p-3 text-sm space-y-2">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-semibold">{d.prenom} {d.nom}</span>
                      <span className="text-xs text-slate-400">Rendu le {d.rendu_le}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-slate-600">{d.contenu}</p>
                    {d.note != null ? (
                      <div className="badge-green w-fit">Note : {d.note}/20{d.feedback ? ` — ${d.feedback}` : ""}</div>
                    ) : expired ? (
                      (session.role === "admin" || a.prof_id === session.id) && (
                        <form action="/api/comptes-rendus" method="post" className="flex flex-wrap gap-2 items-end">
                          <input type="hidden" name="action" value="noter" />
                          <input type="hidden" name="depot_id" value={d.id} />
                          <div>
                            <label className="label">Note /20</label>
                            <input className="input w-24" type="number" name="note" min="0" max="20" step="0.5" required />
                          </div>
                          <div className="flex-1 min-w-40">
                            <label className="label">Retour (optionnel)</label>
                            <input className="input" name="feedback" placeholder="Bon travail, pensez à…" />
                          </div>
                          <button className="btn-primary text-xs">Noter</button>
                        </form>
                      )
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {expired && depots.length === 0 && <p className="text-xs text-slate-400">Aucun dépôt.</p>}

            {session.role === "admin" && (
              <form action="/api/comptes-rendus" method="post">
                <input type="hidden" name="action" value="delete" />
                <input type="hidden" name="id" value={a.id} />
                <button className="btn-danger text-xs">Supprimer le CR</button>
              </form>
            )}
          </div>
        );
      })}
      {assignments.length === 0 && (
        <div className="card text-slate-500 text-sm">Aucun compte rendu créé pour le moment.</div>
      )}
    </div>
  );
}
