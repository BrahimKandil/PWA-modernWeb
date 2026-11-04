import { findDocs } from "@/lib/db";
import { exiger, peut } from "@/lib/permissions";
import { actionFormulaire, anneesDeDates, pagination, valeur, type Parametres } from "@/lib/filtres";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import ConfirmForm from "@/components/ConfirmForm";
import { BarreFiltres, SelectFiltre } from "@/components/Filtres";

export const dynamic = "force-dynamic";

const PAR_PAGE = 8;

function ChampsNotification({ notice }: { notice?: any }) {
  return (
    <div className="space-y-3">
      <input type="hidden" name="action" value={notice ? "update" : "create"} />
      {notice && <input type="hidden" name="id" value={notice.id} />}
      <div>
        <label className="label">Titre</label>
        <input className="input" name="titre" defaultValue={notice?.titre} placeholder="Ex. Report du partiel BDD" required />
      </div>
      <div>
        <label className="label">Message</label>
        <textarea className="input" name="message" defaultValue={notice?.message} rows={4} placeholder="Détail de l'annonce…" required />
      </div>
      <button className="btn-primary">{notice ? "Enregistrer la modification" : "Publier à tous"}</button>
    </div>
  );
}

export default async function NotificationsPage({ searchParams }: { searchParams: Parametres }) {
  const session = await exiger("notifications");
  const admin = peut(session.role, "notifications", "creer");

  const toutes = await findDocs("notifications", {}, { sort: { cree_le: -1 } });
  const annees = anneesDeDates(toutes);
  const cetteAnnee = String(new Date().getFullYear());
  const annee = valeur(searchParams, "annee") || (annees.includes(cetteAnnee) ? cetteAnnee : annees[0] ?? "");

  const total = toutes.filter((n: any) => !annee || String(n.cree_le).slice(0, 4) === annee).length;
  const etat = pagination(total, searchParams, PAR_PAGE);
  const notifications = (toutes as any[]).slice(etat.saut, etat.saut + etat.parPage);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🔔 Notifications</h1>
          <p className="text-sm text-slate-500">
            {admin
              ? "Annonces publiées par l'administration, visibles par tous les comptes."
              : "Annonces envoyées par l'administration. Vous ne pouvez pas les modifier."}
          </p>
        </div>
        {admin && (
          <Modal titre="Nouvelle notification" bouton="＋ Publier une notification" confirmation="Publier cette notification à tous les utilisateurs ?">
            <form action={actionFormulaire("/api/notifications", searchParams)} method="post">
              <ChampsNotification />
            </form>
          </Modal>
        )}
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {String(searchParams.error)}</div>}
      {searchParams.ok && <div className="badge-green w-fit">{String(searchParams.ok)}</div>}

      <BarreFiltres base="/notifications" params={searchParams} note="Une annonce reste consultable après coup, filtrée par année de publication.">
        <SelectFiltre
          label="Année"
          name="annee"
          value={annee}
          vide="Toutes les années"
          options={annees.map((a) => ({ valeur: a, libelle: a }))}
        />
      </BarreFiltres>

      <div className="space-y-3">
        {notifications.length === 0 && <div className="card text-slate-500 text-sm">Aucune notification{annee ? ` en ${annee}` : ""}.</div>}
        {notifications.map((n: any) => (
          <div key={n.id} className="card flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-[240px] grow">
              <h2 className="font-semibold">{n.titre}</h2>
              <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{n.message}</p>
              <p className="text-xs text-slate-400 mt-1">{n.cree_le}</p>
            </div>
            {admin && (
              <div className="flex gap-2 flex-wrap">
                <Modal titre="Modifier la notification" bouton="Modifier" className="btn-ghost text-xs" confirmation="Modifier cette annonce visible par tous ?">
                  <form action={actionFormulaire("/api/notifications", searchParams)} method="post">
                    <ChampsNotification notice={n} />
                  </form>
                </Modal>
                <ConfirmForm
                  action={actionFormulaire("/api/notifications", searchParams)}
                  method="post"
                  className="inline"
                  message={`Supprimer la notification « ${n.titre} » ?`}
                >
                  <input type="hidden" name="action" value="delete" />
                  <input type="hidden" name="id" value={n.id} />
                  <button className="btn-danger text-xs">Supprimer</button>
                </ConfirmForm>
              </div>
            )}
          </div>
        ))}
      </div>

      <Pagination base="/notifications" params={searchParams} etat={etat} />
    </div>
  );
}
