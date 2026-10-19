import { getDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ClassesPage({ searchParams }: { searchParams: { error?: string; id?: string } }) {
  requireRole("admin");
  const db = getDb();
  const classes = db
    .prepare(`SELECT c.*, (SELECT COUNT(*) FROM users u WHERE u.classe_id=c.id AND u.role='etudiant') nb FROM classes c ORDER BY c.nom`)
    .all() as any[];
  const selected = classes.find((c) => String(c.id) === searchParams.id) ?? classes[0];
  const membres = selected
    ? (db.prepare(`SELECT * FROM users WHERE role='etudiant' AND classe_id=? ORDER BY nom, prenom`).all(selected.id) as any[])
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🎒 Gestion des classes</h1>
        <p className="text-sm text-slate-500">Chaque année, l&apos;admin crée les classes et y affecte les comptes étudiants.</p>
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {searchParams.error}</div>}

      <div className="flex gap-2 flex-wrap">
        {classes.map((c) => (
          <a key={c.id} href={`/classes?id=${c.id}`} className={selected && c.id === selected.id ? "badge-blue" : "badge-gray"}>
            {c.nom} ({c.nb})
          </a>
        ))}
      </div>

      {selected && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card">
            <h2 className="font-semibold mb-1">Membres — {selected.nom}</h2>
            <p className="text-xs text-slate-500 mb-3">Filière {selected.filiere} · Année {selected.annee}</p>
            <form action="/api/classes" method="post" className="space-y-3">
              <input type="hidden" name="action" value="affecter" />
              <input type="hidden" name="classe_id" value={selected.id} />
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y">
                {db.prepare(`SELECT * FROM users WHERE role='etudiant' ORDER BY nom, prenom`).all().map((u: any) => (
                  <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      name="etudiant_ids"
                      value={u.id}
                      defaultChecked={u.classe_id === selected.id}
                    />
                    {u.prenom} {u.nom}
                    {u.classe_id && u.classe_id !== selected.id && <span className="text-xs text-amber-600">(déjà dans une autre classe)</span>}
                  </label>
                ))}
              </div>
              <button className="btn-primary">Enregistrer l&apos;affectation</button>
            </form>
          </div>
          <div className="space-y-4">
            <div className="card">
              <h3 className="font-semibold mb-2">Effectif actuel : {membres.length}</h3>
              <ul className="text-sm space-y-1">
                {membres.map((m) => <li key={m.id}>• {m.prenom} {m.nom} {m.mot_de_passe ? "" : <span className="badge-amber">non activé</span>}</li>)}
                {membres.length === 0 && <li className="text-slate-500">Aucun étudiant.</li>}
              </ul>
            </div>
            <div className="card">
              <h3 className="font-semibold mb-2">Nouvelle classe</h3>
              <form action="/api/classes" method="post" className="grid grid-cols-2 gap-2">
                <input type="hidden" name="action" value="create" />
                <div><label className="label">Nom (ex: INFO-3A)</label><input className="input" name="nom" required /></div>
                <div><label className="label">Filière</label><input className="input" name="filiere" required /></div>
                <div><label className="label">Année</label><input className="input" name="annee" placeholder="2026-2027" required /></div>
                <div className="col-span-2"><button className="btn-primary justify-center w-full">Créer</button></div>
              </form>
            </div>
            <form action="/api/classes" method="post" className="flex gap-2">
              <input type="hidden" name="action" value="delete" />
              <input type="hidden" name="id" value={selected.id} />
              <button className="btn-danger text-xs">Supprimer la classe {selected.nom}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
