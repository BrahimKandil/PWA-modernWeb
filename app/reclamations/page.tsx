import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ReclamationsPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = getSession()!;
  const db = getDb();

  // Visibles par tous les rôles
  const reclamations = db
    .prepare(
      `SELECT r.*, u.prenom, u.nom, u.role
       FROM reclamations r JOIN users u ON u.id = r.user_id
       ORDER BY CASE r.statut WHEN 'ouvert' THEN 0 WHEN 'en_cours' THEN 1 ELSE 2 END, r.cree_le DESC`
    )
    .all() as any[];

  const statutBadge: Record<string, string> = { ouvert: "red", en_cours: "amber", traite: "green" };
  const typeLabel: Record<string, string> = { note: "📝 Note", emploi: "🗓️ Emploi", salle: "🏫 Salle", autre: "💬 Autre" };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">⚠️ Réclamations</h1>
        <p className="text-sm text-slate-500">
          {session.role === "admin"
            ? "Réclamations des professeurs et étudiants — traitez-les ici."
            : "Créez une réclamation ; elle est visible par toute l&apos;administration."}
        </p>
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {searchParams.error}</div>}

      {session.role !== "admin" && (
        <div className="card">
          <h2 className="font-semibold mb-3">Nouvelle réclamation</h2>
          <form action="/api/reclamations" method="post" className="grid md:grid-cols-2 gap-3">
            <input type="hidden" name="action" value="create" />
            <div><label className="label">Objet</label><input className="input" name="objet" placeholder="Ex. Erreur de note en BDD" required /></div>
            <div>
              <label className="label">Type</label>
              <select className="input" name="type" defaultValue="note">
                <option value="note">Concerne une note</option>
                <option value="emploi">Concerne l&apos;emploi du temps</option>
                <option value="salle">Concerne une salle</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <div className="md:col-span-2"><label className="label">Message</label><textarea className="input" name="message" rows={3} placeholder="Décrivez votre réclamation…" required /></div>
            <button className="btn-primary md:col-span-2 justify-center">Envoyer</button>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {reclamations.map((r) => (
          <div key={r.id} className="card space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{r.objet}</h2>
                <p className="text-xs text-slate-500">
                  Par {r.prenom} {r.nom} ({r.role}) · {typeLabel[r.type]} · {r.cree_le}
                </p>
              </div>
              <span className={`badge-${statutBadge[r.statut]}`}>{r.statut.replace("_", " ")}</span>
            </div>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{r.message}</p>
            {session.role === "admin" && (
              <div className="flex flex-wrap gap-2 items-center pt-1">
                <form action="/api/reclamations" method="post" className="flex gap-2 items-center">
                  <input type="hidden" name="action" value="statut" />
                  <input type="hidden" name="id" value={r.id} />
                  <select className="input text-xs w-36" name="statut" defaultValue={r.statut}>
                    <option value="ouvert">Ouvert</option>
                    <option value="en_cours">En cours</option>
                    <option value="traite">Traité</option>
                  </select>
                  <button className="btn-ghost text-xs">Mettre à jour</button>
                </form>
                <form action="/api/reclamations" method="post">
                  <input type="hidden" name="action" value="delete" />
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn-danger text-xs">Supprimer</button>
                </form>
              </div>
            )}
          </div>
        ))}
        {reclamations.length === 0 && <div className="card text-slate-500 text-sm">Aucune réclamation.</div>}
      </div>
    </div>
  );
}
