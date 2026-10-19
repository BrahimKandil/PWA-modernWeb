import { getDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ROLE_BADGE: Record<string, string> = { admin: "badge-blue", prof: "badge-amber", etudiant: "badge-green" };
const ROLE_LABEL: Record<string, string> = { admin: "Administrateur", prof: "Professeur", etudiant: "Étudiant" };

export default async function UsersPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = requireRole("admin");
  const db = getDb();
  const users = db
    .prepare(`SELECT u.*, c.nom classe FROM users u LEFT JOIN classes c ON c.id=u.classe_id ORDER BY u.role, u.nom, u.prenom`)
    .all() as any[];
  const classes = db.prepare(`SELECT * FROM classes ORDER BY nom`).all() as any[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">👥 Gestion des utilisateurs</h1>
        <p className="text-sm text-slate-500">
          Création des comptes prof/étudiant par l&apos;admin. Un email d&apos;activation est envoyé : l&apos;utilisateur définit son mot de passe avant la première connexion.
        </p>
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {searchParams.error}</div>}

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Classe</th><th>Mot de passe</th><th>Statut</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.prenom} {u.nom}</td>
                <td>{u.email}</td>
                <td><span className={ROLE_BADGE[u.role]}>{ROLE_LABEL[u.role]}</span></td>
                <td>{u.classe ?? "—"}</td>
                <td>
                  {u.role === "admin" ? (
                    <span className="badge-gray">fixe</span>
                  ) : u.mot_de_passe ? (
                    <span className="badge-green">défini</span>
                  ) : (
                    <span className="badge-amber">à définir (email envoyé)</span>
                  )}
                </td>
                <td><span className={u.actif ? "badge-green" : "badge-red"}>{u.actif ? "Actif" : "Désactivé"}</span></td>
                <td>
                  {u.role !== "admin" && u.id !== session.id && (
                    <div className="flex gap-2 flex-wrap">
                      {!u.mot_de_passe && (
                        <form action="/api/users" method="post">
                          <input type="hidden" name="action" value="renvoyer" />
                          <input type="hidden" name="id" value={u.id} />
                          <button className="btn-ghost text-xs">Renvoyer l&apos;email</button>
                        </form>
                      )}
                      <form action="/api/users" method="post">
                        <input type="hidden" name="action" value="toggle" />
                        <input type="hidden" name="id" value={u.id} />
                        <button className="btn-ghost text-xs">{u.actif ? "Désactiver" : "Activer"}</button>
                      </form>
                      <form action="/api/users" method="post">
                        <input type="hidden" name="action" value="delete" />
                        <input type="hidden" name="id" value={u.id} />
                        <button className="btn-danger text-xs">Supprimer</button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-1">Créer un compte (prof ou étudiant)</h2>
        <p className="text-xs text-slate-500 mb-3">Le compte admin est fixe et ne peut pas être créé ici.</p>
        <form action="/api/users" method="post" className="grid md:grid-cols-3 gap-3">
          <input type="hidden" name="action" value="create" />
          <div><label className="label">Prénom</label><input className="input" name="prenom" required /></div>
          <div><label className="label">Nom</label><input className="input" name="nom" required /></div>
          <div><label className="label">Email</label><input className="input" name="email" type="email" required /></div>
          <div>
            <label className="label">Rôle</label>
            <select className="input" name="role" required>
              <option value="etudiant">Étudiant</option>
              <option value="prof">Professeur</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Classe (étudiant uniquement)</label>
            <select className="input" name="classe_id">
              <option value="">— Aucune —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.nom} · {c.filiere}</option>)}
            </select>
          </div>
          <button className="btn-primary md:col-span-3 justify-center">Créer le compte et envoyer l&apos;email d&apos;activation</button>
        </form>
      </div>
    </div>
  );
}
