import { findDocs } from "@/lib/db";
import { exiger, peut } from "@/lib/permissions";
import { actionFormulaire, anneesDeDates, nombre, pagination, valeur, type Parametres } from "@/lib/filtres";
import Modal from "@/components/Modal";
import ConfirmForm from "@/components/ConfirmForm";
import Pagination from "@/components/Pagination";
import Stats from "@/components/Stats";
import { BarreFiltres, SelectFiltre } from "@/components/Filtres";

export const dynamic = "force-dynamic";

const PAR_PAGE = 8;
const TYPES: [string, string][] = [
  ["note", "📝 Concerne une note"],
  ["emploi", "🗓️ Emploi du temps"],
  ["salle", "🏫 Salle"],
  ["autre", "💬 Autre"],
];
const STATUT_BADGE: Record<string, string> = { ouvert: "badge-red", en_cours: "badge-amber", traite: "badge-green" };
const STATUT_LABEL: Record<string, string> = { ouvert: "Ouvert", en_cours: "En cours", traite: "Traité" };

function ChampsReclamation({ ligne }: { ligne?: any }) {
  return (
    <div className="space-y-3">
      <input type="hidden" name="action" value={ligne ? "update" : "create"} />
      {ligne && <input type="hidden" name="id" value={ligne.id} />}
      <div>
        <label className="label">Objet</label>
        <input className="input" name="objet" defaultValue={ligne?.objet} placeholder="Ex. Erreur de note en BDD" required />
      </div>
      <div>
        <label className="label">Type</label>
        <select className="input" name="type" defaultValue={ligne?.type ?? "note"}>
          {TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {ligne && (
        <div>
          <label className="label">Statut (vous seul le pilotez)</label>
          <select className="input" name="statut" defaultValue={ligne?.statut ?? "ouvert"}>
            <option value="ouvert">Ouvert</option>
            <option value="en_cours">En cours</option>
            <option value="traite">Traité</option>
          </select>
        </div>
      )}
      <div>
        <label className="label">Message</label>
        <textarea className="input" name="message" defaultValue={ligne?.message} rows={4} placeholder="Décrivez votre réclamation…" required />
      </div>
      <button className="btn-primary">{ligne ? "Enregistrer les modifications" : "Envoyer la réclamation"}</button>
    </div>
  );
}

export default async function ReclamationsPage({ searchParams }: { searchParams: Parametres }) {
  const session = await exiger("reclamations");
  const admin = session.role === "admin";
  const peutGerer = peut(session.role, "reclamations", "creer"); // prof et étudiant : uniquement les leurs

  const [lignes, usagers] = await Promise.all([findDocs("reclamations", {}, { sort: { cree_le: -1 } }), findDocs("users")]);
  const auteurParId = new Map((usagers as any[]).map((u) => [u.id, u]));

  const annees = anneesDeDates(lignes);
  const cetteAnnee = String(new Date().getFullYear());
  const annee = valeur(searchParams, "annee") || (annees.includes(cetteAnnee) ? cetteAnnee : annees[0] ?? "");
  const personneFiltre = nombre(searchParams, "user_id");

  // L'administration voit tout (sans jamais modifier) ; chaque compte ne voit que ses propres réclamations.
  const perimetre = (lignes as any[]).filter((r) => admin || r.user_id === session.id);
  const vues = perimetre
    .filter((r) => !annee || String(r.cree_le).slice(0, 4) === annee)
    .filter((r) => (admin && personneFiltre ? r.user_id === personneFiltre : true))
    .map((r) => {
      const u = auteurParId.get(r.user_id);
      return { ...r, auteur: u ? `${u.prenom} ${u.nom}` : "—", role: u?.role ?? "—" };
    });

  const etat = pagination(vues.length, searchParams, PAR_PAGE);
  const page = vues.slice(etat.saut, etat.saut + etat.parPage);

  const auteurs = [...new Set((lignes as any[]).map((r) => r.user_id))]
    .map((id) => auteurParId.get(id))
    .filter(Boolean) as any[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">⚠️ {admin ? "Réclamations (consultation)" : "Mes réclamations"}</h1>
          <p className="text-sm text-slate-500">
            {admin
              ? "Réclamations des professeurs et des étudiants, filtrées par année et par personne. L'administration consulte uniquement : le statut appartient à l'auteur."
              : "Créez, modifiez et supprimez vos propres réclamations. C'est vous qui en pilotez le statut."}
          </p>
        </div>
        {peutGerer && (
          <Modal titre="Nouvelle réclamation" bouton="＋ Nouvelle réclamation" confirmation="Envoyer cette réclamation à l'administration ?">
            <form action={actionFormulaire("/api/reclamations", searchParams)} method="post">
              <ChampsReclamation />
            </form>
          </Modal>
        )}
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {String(searchParams.error)}</div>}
      {searchParams.ok && <div className="badge-green w-fit">{String(searchParams.ok)}</div>}

      <BarreFiltres
        base="/reclamations"
        params={searchParams}
        note={admin ? "Chaque réclamation reste la propriété de son auteur ; l'administration ne la modifie pas." : "Vous voyez uniquement vos propres réclamations."}
      >
        <SelectFiltre label="Année" name="annee" value={annee} vide="Toutes les années" options={annees.map((a) => ({ valeur: a, libelle: a }))} />
        {admin && (
          <SelectFiltre
            label="Personne"
            name="user_id"
            value={personneFiltre ? String(personneFiltre) : ""}
            vide="Toutes les personnes"
            options={auteurs.map((u) => ({ valeur: String(u.id), libelle: `${u.prenom} ${u.nom} (${u.role})` }))}
            large
          />
        )}
      </BarreFiltres>

      <Stats
        cartes={[
          { label: "Ouvertes", valeur: vues.filter((r) => r.statut === "ouvert").length, ton: "rouge" },
          { label: "En cours", valeur: vues.filter((r) => r.statut === "en_cours").length, ton: "ambre" },
          { label: "Traitées", valeur: vues.filter((r) => r.statut === "traite").length, ton: "vert" },
          { label: "Total affiché", valeur: vues.length, ton: "bleu" },
        ]}
      />

      <div className="space-y-4">
        {page.map((r) => (
          <div key={r.id} className="card space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{r.objet}</h2>
                <p className="text-xs text-slate-500">
                  {admin ? `Par ${r.auteur} (${r.role}) · ` : ""}
                  {TYPES.find((t) => t[0] === r.type)?.[1] ?? r.type} · {r.cree_le}
                </p>
              </div>
              <span className={STATUT_BADGE[r.statut] ?? "badge-gray"}>{STATUT_LABEL[r.statut] ?? r.statut}</span>
            </div>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{r.message}</p>
            {peutGerer && r.user_id === session.id && (
              <div className="flex gap-2 flex-wrap pt-1">
                <Modal titre="Modifier ma réclamation" bouton="Modifier" className="btn-ghost text-xs" confirmation="Enregistrer les modifications de cette réclamation ?">
                  <form action={actionFormulaire("/api/reclamations", searchParams)} method="post">
                    <ChampsReclamation ligne={r} />
                  </form>
                </Modal>
                <ConfirmForm action={actionFormulaire("/api/reclamations", searchParams)} method="post" className="inline" message={`Supprimer la réclamation « ${r.objet} » ?`}>
                  <input type="hidden" name="action" value="delete" />
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn-danger text-xs">Supprimer</button>
                </ConfirmForm>
              </div>
            )}
          </div>
        ))}
        {vues.length === 0 && (
          <div className="card text-sm text-slate-500">{admin ? `Aucune réclamation${annee ? ` en ${annee}` : ""}.` : "Vous n'avez pas encore déposé de réclamation."}</div>
        )}
      </div>

      <Pagination base="/reclamations" params={searchParams} etat={etat} />
    </div>
  );
}
