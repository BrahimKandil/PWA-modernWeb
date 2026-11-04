import { findDocs } from "@/lib/db";
import { exiger, peut } from "@/lib/permissions";
import { actionFormulaire, lien, valeur, type Parametres } from "@/lib/filtres";
import Modal from "@/components/Modal";
import ConfirmForm from "@/components/ConfirmForm";
import { BarreFiltres, SelectFiltre } from "@/components/Filtres";

export const dynamic = "force-dynamic";

const TYPES = ["salle", "amphi", "labo"];
const TON: Record<string, string> = { labo: "badge-blue", amphi: "badge-amber", salle: "badge-gray" };

function ChampsSalle({ salle }: { salle?: any }) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <input type="hidden" name="action" value={salle ? "update" : "create"} />
      {salle && <input type="hidden" name="id" value={salle.id} />}
      <div>
        <label className="label">Nom</label>
        <input className="input" name="nom" defaultValue={salle?.nom} placeholder="A13" required />
      </div>
      <div>
        <label className="label">Bâtiment</label>
        <input className="input" name="batiment" defaultValue={salle?.batiment} placeholder="A" required />
      </div>
      <div>
        <label className="label">Capacité</label>
        <input className="input" type="number" name="capacite" min="1" max="500" defaultValue={salle?.capacite ?? 30} required />
      </div>
      <div>
        <label className="label">Type</label>
        <select className="input" name="type" defaultValue={salle?.type ?? "salle"}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "salle" ? "Salle" : t === "amphi" ? "Amphithéâtre" : "Laboratoire"}
            </option>
          ))}
        </select>
      </div>
      <button className="btn-primary md:col-span-2 justify-center">{salle ? "Enregistrer" : "Ajouter la salle"}</button>
    </div>
  );
}

export default async function SallesPage({ searchParams }: { searchParams: Parametres }) {
  const session = await exiger("salles");
  const admin = peut(session.role, "salles", "creer");

  const [brutes, emplois, matieres, classes] = await Promise.all([
    findDocs("salles", {}, { sort: { batiment: 1, nom: 1 } }),
    findDocs("emplois"),
    findDocs("matieres"),
    findDocs("classes"),
  ]);

  const codeMatiere = new Map(matieres.map((m: any) => [m.id, m.code]));
  const nomClasse = new Map(classes.map((c: any) => [c.id, c.nom]));
  const occupees = new Map<number, string[]>();
  const compte = new Map<number, number>();
  for (const e of emplois) {
    compte.set(e.salle_id, (compte.get(e.salle_id) ?? 0) + 1);
    const liste = occupees.get(e.salle_id) ?? [];
    const libelle = `${nomClasse.get(e.classe_id) ?? "?"} · ${codeMatiere.get(e.matiere_id) ?? "?"}`;
    if (!liste.includes(libelle)) occupees.set(e.salle_id, [...liste, libelle]);
  }

  const batiments = [...new Set(brutes.map((s: any) => s.batiment))].sort();
  const batiment = valeur(searchParams, "batiment");
  const type = valeur(searchParams, "type");
  const salles = (brutes as any[])
    .map((s) => ({ ...s, nb_creneaux: compte.get(s.id) ?? 0, utilise_par: (occupees.get(s.id) ?? []).slice(0, 3) }))
    .filter((s) => (!batiment || s.batiment === batiment) && (!type || s.type === type));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🏫 Salles</h1>
          <p className="text-sm text-slate-500">
            {admin
              ? "Salles disponibles pour les emplois du temps, avec leur utilisation réelle."
              : "Les salles de vos cours, avec leur bâtiment et leur capacité. Consultation seule."}
          </p>
        </div>
        {admin && (
          <Modal titre="Nouvelle salle" bouton="＋ Créer une salle" confirmation="Ajouter cette salle à la liste des salles disponibles ?">
            <form action={actionFormulaire("/api/salles", searchParams)} method="post">
              <ChampsSalle />
            </form>
          </Modal>
        )}
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {String(searchParams.error)}</div>}
      {searchParams.ok && <div className="badge-green w-fit">{String(searchParams.ok)}</div>}

      <BarreFiltres base="/salles" params={searchParams} note={`${salles.length} salle(s) affichée(s) sur ${brutes.length}.`}>
        <SelectFiltre
          label="Bâtiment"
          name="batiment"
          value={batiment}
          vide="Tous les bâtiments"
          options={batiments.map((b) => ({ valeur: String(b), libelle: String(b) }))}
        />
        <SelectFiltre
          label="Type"
          name="type"
          value={type}
          vide="Tous les types"
          options={TYPES.map((t) => ({ valeur: t, libelle: t }))}
        />
      </BarreFiltres>

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Bâtiment</th>
              <th>Capacité</th>
              <th>Type</th>
              <th>Créneaux utilisés</th>
              <th>Utilisée par</th>
              {admin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {salles.map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">{s.nom}</td>
                <td>{s.batiment}</td>
                <td>{s.capacite} places</td>
                <td>
                  <span className={TON[s.type] ?? "badge-gray"}>{s.type}</span>
                </td>
                <td>
                  <a href={lien("/emplois", { salle_id: String(s.id) })} className="text-indigo-600 underline">
                    {s.nb_creneaux}
                  </a>
                </td>
                <td className="text-xs text-slate-500">{s.utilise_par.join(" · ") || "—"}</td>
                {admin && (
                  <td>
                    <div className="flex gap-2 flex-wrap">
                      <Modal titre={`Modifier la salle ${s.nom}`} bouton="Modifier" className="btn-ghost text-xs" confirmation="Modifier cette salle ?">
                        <form action={actionFormulaire("/api/salles", searchParams)} method="post">
                          <ChampsSalle salle={s} />
                        </form>
                      </Modal>
                      <ConfirmForm
                        action={actionFormulaire("/api/salles", searchParams)}
                        method="post"
                        className="inline"
                        message={`Supprimer la salle ${s.nom} ? Elle ne doit plus être utilisée dans un emploi du temps.`}
                      >
                        <input type="hidden" name="action" value="delete" />
                        <input type="hidden" name="id" value={s.id} />
                        <button className="btn-danger text-xs">Supprimer</button>
                      </ConfirmForm>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {salles.length === 0 && (
              <tr>
                <td colSpan={admin ? 7 : 6} className="text-center text-slate-400 py-4">
                  Aucune salle avec ces filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
