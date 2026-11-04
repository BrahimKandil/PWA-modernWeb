import { countDocs, findDocs } from "@/lib/db";
import { exiger, peut } from "@/lib/permissions";
import { actionFormulaire, pagination, parPeriodeComplete, periode, valeur, type Parametres } from "@/lib/filtres";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import ConfirmForm from "@/components/ConfirmForm";
import { BarreFiltres, NOTE_PERIODE, PeriodeFiltre, SelectFiltre } from "@/components/Filtres";

export const dynamic = "force-dynamic";

const PAR_PAGE = 10;

export default async function EmailsPage({ searchParams }: { searchParams: Parametres }) {
  const session = await exiger("emails");
  const admin = peut(session.role, "emails", "supprimer");

  const per = periode(searchParams);
  const destinataire = valeur(searchParams, "destinataire");

  // Chacun ne lit que sa propre boîte : l'admin seul voit l'ensemble de la file d'envoi.
  const filtre: any = admin ? {} : { destinataire: session.email };
  if (admin && destinataire) filtre.destinataire = destinataire;
  Object.assign(filtre, parPeriodeComplete(per));

  const total = await countDocs("emails", filtre);
  const etat = pagination(total, searchParams, PAR_PAGE);
  const [courrier, usagers] = await Promise.all([
    findDocs("emails", filtre, { sort: { cree_le: -1 }, skip: etat.saut, limit: etat.parPage }),
    admin ? findDocs("users", {}, { sort: { nom: 1, prenom: 1 } }) : Promise.resolve([]),
  ]);
  const adresses = [...new Set((usagers as any[]).map((u) => u.email))].sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">📧 Emails envoyés</h1>
          <p className="text-sm text-slate-500">
            {admin
              ? "File d'envoi complète de l'application (invitations, affectations de matières, validations). Démonstration : en production un serveur SMTP livrerait ces messages."
              : `Vous voyez ici les emails adressés à ${session.email}. Cliquez sur « Ouvrir le lien » pour activer votre compte comme le ferait l'email.`}
          </p>
        </div>
        {admin && (
          <Modal titre="Envoyer un email maintenant" bouton="＋ Envoyer un email" confirmation="Envoyer cet email à la personne choisie ?">
            <form action={actionFormulaire("/api/emails", searchParams)} method="post" className="space-y-3">
              <input type="hidden" name="action" value="send" />
              <div>
                <label className="label">Destinataire</label>
                <select className="input" name="destinataire" required>
                  <option value="tous@arp.edu">Tous (annonce générale)</option>
                  {adresses.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Sujet</label>
                <input className="input" name="sujet" placeholder="Ex. Rattrapage de cours" required />
              </div>
              <div>
                <label className="label">Message</label>
                <textarea className="input" name="contenu" rows={4} required />
              </div>
              <div>
                <label className="label">Lien optionnel</label>
                <input className="input" name="lien" placeholder="/notifications" />
              </div>
              <button className="btn-primary">Ajouter à la file d&apos;envoi</button>
            </form>
          </Modal>
        )}
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {String(searchParams.error)}</div>}
      {searchParams.ok && <div className="badge-green w-fit">{String(searchParams.ok)}</div>}

      <BarreFiltres base="/emails" params={searchParams} note={admin ? NOTE_PERIODE : `Période affichée : ${per.dit}.`}>
        <PeriodeFiltre periode={per} />
        {admin && (
          <SelectFiltre
            label="Destinataire"
            name="destinataire"
            value={destinataire}
            vide="Tous les destinataires"
            options={adresses.map((a) => ({ valeur: a, libelle: a }))}
            large
          />
        )}
      </BarreFiltres>

      <div className="space-y-3">
        {courrier.length === 0 && (
          <div className="card text-sm text-slate-500">
            Aucun email sur cette période{admin ? "" : " pour votre adresse"}.
          </div>
        )}
        {courrier.map((m: any) => (
          <div key={m.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{m.sujet}</h3>
                <p className="text-xs text-slate-500">
                  À : {m.destinataire} · {m.cree_le}
                </p>
              </div>
              <div className="flex gap-2 items-center">
                {m.lien && (
                  <a className="btn-primary text-xs" href={m.lien}>
                    Ouvrir le lien
                  </a>
                )}
                {admin && (
                  <ConfirmForm
                    action={actionFormulaire("/api/emails", searchParams)}
                    method="post"
                    className="inline"
                    message="Retirer cet email de la file d'envoi ? Le destinataire ne le verra plus dans sa boîte."
                  >
                    <input type="hidden" name="action" value="delete" />
                    <input type="hidden" name="id" value={m.id} />
                    <button className="btn-danger text-xs">Retirer</button>
                  </ConfirmForm>
                )}
              </div>
            </div>
            <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{m.contenu}</p>
            {m.lien && <p className="text-xs text-slate-400 mt-1 break-all">{m.lien}</p>}
          </div>
        ))}
      </div>

      <Pagination base="/emails" params={searchParams} etat={etat} />
    </div>
  );
}
