import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = getSession()!;
  const isAdmin = session.role === "admin";
  const db = getDb();

  const notifications = db.prepare(`SELECT * FROM notifications ORDER BY cree_le DESC LIMIT 100`).all() as any[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🔔 Notifications</h1>
        <p className="text-sm text-slate-500">
          {isAdmin ? "Créez des annonces visibles par tous les utilisateurs." : "Annonces envoyées par l&apos;administration."}
        </p>
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {searchParams.error}</div>}

      {isAdmin && (
        <div className="card">
          <h2 className="font-semibold mb-3">Nouvelle notification</h2>
          <form action="/api/notifications" method="post" className="space-y-3">
            <input type="hidden" name="action" value="create" />
            <div><label className="label">Titre</label><input className="input" name="titre" placeholder="Ex. Report du partiel BDD" required /></div>
            <div><label className="label">Message</label><textarea className="input" name="message" rows={3} placeholder="Détail de l'annonce…" required /></div>
            <button className="btn-primary">Publier à tous</button>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {notifications.map((n) => (
          <div key={n.id} className="card flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{n.titre}</h2>
              <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{n.message}</p>
              <p className="text-xs text-slate-400 mt-1">{n.cree_le}</p>
            </div>
            {isAdmin && (
              <form action="/api/notifications" method="post">
                <input type="hidden" name="action" value="delete" />
                <input type="hidden" name="id" value={n.id} />
                <button className="btn-danger text-xs">Supprimer</button>
              </form>
            )}
          </div>
        ))}
        {notifications.length === 0 && <div className="card text-slate-500 text-sm">Aucune notification pour le moment.</div>}
      </div>
    </div>
  );
}
