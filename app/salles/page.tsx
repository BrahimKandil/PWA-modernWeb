import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SallesPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = getSession()!;
  const isAdmin = session.role === "admin";
  const db = getDb();

  const salles = db
    .prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM emplois e WHERE e.salle_id = s.id) nb_creneaux
       FROM salles s ORDER BY s.batiment, s.nom`
    )
    .all() as any[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🏫 Gestion des salles</h1>
        <p className="text-sm text-slate-500">
          {isAdmin ? "Définissez les salles disponibles pour les emplois du temps." : "Salles utilisées dans les emplois du temps."}
        </p>
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {searchParams.error}</div>}

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr><th>Nom</th><th>Bâtiment</th><th>Capacité</th><th>Type</th><th>Créneaux utilisés</th>{isAdmin && <th>Actions</th>}</tr>
          </thead>
          <tbody>
            {salles.map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">{s.nom}</td>
                <td>{s.batiment}</td>
                <td>{s.capacite} places</td>
                <td>
                  <span className={`badge-${s.type === "labo" ? "blue" : s.type === "amphi" ? "amber" : "gray"}`}>
                    {s.type}
                  </span>
                </td>
                <td>{s.nb_creneaux}</td>
                {isAdmin && (
                  <td>
                    <form action="/api/salles" method="post">
                      <input type="hidden" name="action" value="delete" />
                      <input type="hidden" name="id" value={s.id} />
                      <button className="btn-danger text-xs">Supprimer</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {salles.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-400 py-4">Aucune salle enregistrée.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <div className="card">
          <h2 className="font-semibold mb-3">Nouvelle salle</h2>
          <form action="/api/salles" method="post" className="grid md:grid-cols-5 gap-3 items-end">
            <input type="hidden" name="action" value="create" />
            <div><label className="label">Nom</label><input className="input" name="nom" placeholder="A13" required /></div>
            <div><label className="label">Bâtiment</label><input className="input" name="batiment" placeholder="A" required /></div>
            <div><label className="label">Capacité</label><input className="input" type="number" name="capacite" min="1" max="500" defaultValue={30} required /></div>
            <div>
              <label className="label">Type</label>
              <select className="input" name="type" defaultValue="salle">
                <option value="salle">Salle</option>
                <option value="amphi">Amphithéâtre</option>
                <option value="labo">Laboratoire</option>
              </select>
            </div>
            <button className="btn-primary justify-center">Ajouter</button>
          </form>
        </div>
      )}
    </div>
  );
}
