import { countDocs, findDocs } from "@/lib/db";
import { exiger } from "@/lib/permissions";
import { actionFormulaire, lien, pagination, valeur, type Parametres } from "@/lib/filtres";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import ConfirmForm from "@/components/ConfirmForm";
import { BarreFiltres } from "@/components/Filtres";

export const dynamic = "force-dynamic";

const ONGLETS = [
  { valeur: "etudiant", libelle: "Étudiants" },
  { valeur: "prof", libelle: "Professeurs" },
  { valeur: "admin", libelle: "Administrateurs" },
];
const PAR_PAGE = 10;

function ChampsCompte({ classes, compte }: { classes: any[]; compte?: any }) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <input type="hidden" name="action" value={compte ? "update" : "create"} />
      {compte && <input type="hidden" name="id" value={compte.id} />}
      <div>
        <label className="label">Prénom</label>
        <input className="input" name="prenom" defaultValue={compte?.prenom} required />
      </div>
      <div>
        <label className="label">Nom</label>
        <input className="input" name="nom" defaultValue={compte?.nom} required />
      </div>
      <div>
        <label className="label">Email</label>
        <input className="input" name="email" type="email" defaultValue={compte?.email} required />
      </div>
      <div>
        <label className="label">Rôle</label>
        <select className="input" name="role" defaultValue={compte?.role ?? "etudiant"} required>
          <option value="etudiant">Étudiant</option>
          <option value="prof">Professeur</option>
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="label">Classe (étudiant uniquement)</label>
        <select className="input" name="classe_id" defaultValue={compte?.classe_id ?? ""}>
          <option value="">— Aucune —</option>
          {classes.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.annee ? `${c.annee} · ` : ""}
              {c.nom} — {c.filiere}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">Laisser « Aucune » pour un professeur.</p>
      </div>
      <button className="btn-primary md:col-span-2 justify-center">
        {compte ? "Enregistrer le compte" : "Créer le compte et envoyer l'email d'activation"}
      </button>
    </div>
  );
}

export default async function UsersPage({ searchParams }: { searchParams: Parametres }) {
  const session = await exiger("utilisateurs");

  const roleDemande = valeur(searchParams, "role");
  const role = ONGLETS.some((o) => o.valeur === roleDemande) ? roleDemande : "etudiant";
  const q = valeur(searchParams, "q");
  const motif = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const filtre: any = { role };
  if (motif) {
    const rx = { $regex: motif, $options: "i" };
    filtre.$or = [{ nom: rx }, { prenom: rx }, { email: rx }];
  }

  const total = await countDocs("users", filtre);
  const etat = pagination(total, searchParams, PAR_PAGE);
  const [usagers, classes, comptesParRole] = await Promise.all([
    findDocs("users", filtre, { sort: { nom: 1, prenom: 1 }, skip: etat.saut, limit: etat.parPage }),
    findDocs("classes", {}, { sort: { annee: -1, nom: 1 } }),
    Promise.all(ONGLETS.map((o) => countDocs("users", { role: o.valeur }))),
  ]);

  const nomClasse = new Map(classes.map((c: any) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">👥 Gestion des utilisateurs</h1>
          <p className="text-sm text-slate-500">
            Un onglet par type de compte, {PAR_PAGE} comptes par page. À la création, un email d&apos;activation est
            envoyé : l&apos;utilisateur définit son mot de passe avant sa première connexion.
          </p>
        </div>
        <Modal
          titre="Créer un compte (prof ou étudiant)"
          bouton="＋ Créer un utilisateur"
          confirmation="Créer ce compte et envoyer l'email d'activation maintenant ?"
        >
          <form action={actionFormulaire("/api/users", searchParams)} method="post">
            <ChampsCompte classes={classes} />
          </form>
        </Modal>
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {String(searchParams.error)}</div>}
      {searchParams.ok && <div className="badge-green w-fit">{String(searchParams.ok)}</div>}

      <div className="flex flex-wrap gap-2">
        {ONGLETS.map((o, i) =>
          o.valeur === role ? (
            <span key={o.valeur} className="badge-blue px-3 py-1 text-sm">
              {o.libelle} ({comptesParRole[i]})
            </span>
          ) : (
            <a key={o.valeur} href={lien("/users", {}, { role: o.valeur })} className="btn-ghost text-sm">
              {o.libelle} ({comptesParRole[i]})
            </a>
          )
        )}
      </div>

      <BarreFiltres base="/users" params={searchParams} caches={{ role }} note="Recherche par nom, prénom ou email.">
        <div className="min-w-[220px] grow">
          <label className="label">Recherche</label>
          <input className="input" name="q" defaultValue={q} placeholder="ex. Diallo, aïcha, @arp.edu" />
        </div>
      </BarreFiltres>

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Classe</th>
              <th>Année</th>
              <th>Mot de passe</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {usagers.map((u: any) => {
              const classe = nomClasse.get(u.classe_id);
              const protege = u.role === "admin" || u.id === session.id;
              return (
                <tr key={u.id}>
                  <td className="font-medium">
                    {u.prenom} {u.nom}
                    {u.id === session.id && <span className="badge-gray ml-2">vous</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>{classe?.nom ?? "—"}</td>
                  <td>{classe?.annee ?? "—"}</td>
                  <td>
                    {u.mot_de_passe ? (
                      <span className="badge-green">défini</span>
                    ) : (
                      <span className="badge-amber">à définir (email envoyé)</span>
                    )}
                  </td>
                  <td>
                    <span className={u.actif ? "badge-green" : "badge-red"}>{u.actif ? "Actif" : "Désactivé"}</span>
                  </td>
                  <td>
                    {protege ? (
                      <span className="badge-gray">protégé</span>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        <Modal
                          titre={`Modifier ${u.prenom} ${u.nom}`}
                          bouton="Modifier"
                          className="btn-ghost text-xs"
                          confirmation="Modifier ce compte ?"
                        >
                          <form action={actionFormulaire("/api/users", searchParams)} method="post">
                            <ChampsCompte classes={classes} compte={u} />
                          </form>
                        </Modal>
                        <form action={actionFormulaire("/api/users", searchParams)} method="post">
                          <input type="hidden" name="action" value="renvoyer" />
                          <input type="hidden" name="id" value={u.id} />
                          <button className="btn-ghost text-xs">
                            {u.mot_de_passe ? "Nouveau mot de passe" : "Renvoyer l'email"}
                          </button>
                        </form>
                        <ConfirmForm
                          action={actionFormulaire("/api/users", searchParams)}
                          method="post"
                          className="inline"
                          message={`${u.actif ? "Désactiver" : "Activer"} le compte de ${u.prenom} ${u.nom} ?`}
                        >
                          <input type="hidden" name="action" value="toggle" />
                          <input type="hidden" name="id" value={u.id} />
                          <button className="btn-ghost text-xs">{u.actif ? "Désactiver" : "Activer"}</button>
                        </ConfirmForm>
                        <ConfirmForm
                          action={actionFormulaire("/api/users", searchParams)}
                          method="post"
                          className="inline"
                          message={`Supprimer définitivement ${u.prenom} ${u.nom} ? Ses présences, notes et dépôts seront supprimés avec lui.`}
                        >
                          <input type="hidden" name="action" value="delete" />
                          <input type="hidden" name="id" value={u.id} />
                          <button className="btn-danger text-xs">Supprimer</button>
                        </ConfirmForm>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {usagers.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-400 py-4">
                  Aucun compte dans cet onglet{q ? ` pour « ${q} »` : ""}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination base="/users" params={{ ...searchParams, role }} etat={etat} />
      <p className="text-xs text-slate-500">
        Un compte administrateur, et le vôtre, sont marqués « protégé » : ni modification ni suppression, pour ne jamais
        perdre l&apos;accès à l&apos;application.
      </p>
    </div>
  );
}
