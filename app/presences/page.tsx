import { findDocs } from "@/lib/db";
import { exiger, peut } from "@/lib/permissions";
import { actionFormulaire, anneesDe, classesDeAnnee, choixAnnee, nombre, pagination, periode, valeur, type Parametres } from "@/lib/filtres";
import Pagination from "@/components/Pagination";
import Stats from "@/components/Stats";
import ConfirmForm from "@/components/ConfirmForm";
import { BarreFiltres, NOTE_PERIODE, PeriodeFiltre, SelectFiltre } from "@/components/Filtres";

export const dynamic = "force-dynamic";

const STATUTS = ["present", "absent", "retard"];
const BADGE: Record<string, string> = { present: "badge-green", absent: "badge-red", retard: "badge-amber" };
const PAR_PAGE = 20;

const fmt = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : iso;

function taux(presentes: number, total: number) {
  return total === 0 ? "—" : `${Math.round((presentes / total) * 100)} %`;
}

export default async function PresencesPage({ searchParams }: { searchParams: Parametres }) {
  const session = await exiger("presences");
  const peutSaisir = peut(session.role, "presences", "creer"); // le prof seul fait l'appel
  const etudiant = session.role === "etudiant";

  const [presences, matieres, toutesClasses, eleves] = await Promise.all([
    findDocs("presences", {}, { sort: { date: -1 } }),
    findDocs("matieres", {}, { sort: { code: 1 } }),
    findDocs("classes", {}, { sort: { nom: 1 } }),
    findDocs("users", { role: "etudiant" }, { sort: { nom: 1, prenom: 1 } }),
  ]);
  const matiereParId = new Map((matieres as any[]).map((m) => [m.id, m]));
  const personneParId = new Map(eleves.map((u: any) => [u.id, u]));
  const classeDeLeve = (id: number) => personneParId.get(id)?.classe_id ?? 0;

  const annee = choixAnnee(searchParams, toutesClasses);
  let classesVue = classesDeAnnee(toutesClasses, annee);
  if (session.role === "prof") {
    classesVue = classesVue.filter((c: any) => matieres.some((m: any) => m.classe_id === c.id && m.prof_id === session.id));
  }
  if (etudiant) classesVue = classesVue.filter((c: any) => c.id === session.classe_id);

  const classeId = etudiant ? session.classe_id ?? 0 : nombre(searchParams, "classe_id");
  const classe = classesVue.find((c: any) => c.id === classeId);

  const matiereId = nombre(searchParams, "matiere_id");
  const statut = valeur(searchParams, "statut");
  const eleveFiltre = nombre(searchParams, "etudiant_id");
  const per = periode(searchParams);

  const matieresClasse = (matieres as any[]).filter((m) => m.classe_id === classeId);
  const elevesClasse = (eleves as any[]).filter((u) => u.classe_id === classeId && (!eleveFiltre || u.id === eleveFiltre) && (!etudiant || u.id === session.id));

  // Lignes retenues : classe obligatoire, matiere / periode / statut / etudiant en affinement.
  const lignes = (presences as any[])
    .filter((p) => classeId === 0 || classeDeLeve(p.etudiant_id) === classeId)
    .filter((p) => !matiereId || p.matiere_id === matiereId)
    .filter((p) => !statut || p.statut === statut)
    .filter((p) => !eleveFiltre || p.etudiant_id === eleveFiltre)
    .filter((p) => p.date >= per.debut && p.date <= per.fin)
    .map((p) => {
      const m = matiereParId.get(p.matiere_id);
      const e = personneParId.get(p.etudiant_id);
      return { ...p, code: m?.code ?? "?", matiere: m?.nom ?? "?", eleve: e ? `${e.prenom} ${e.nom}` : "—", matiereObj: m };
    });

  const compte = (liste: any[], s: string) => liste.filter((x) => x.statut === s).length;
  const presentes = compte(lignes, "present");
  const absences = compte(lignes, "absent");
  const retards = compte(lignes, "retard");

  const matieresDuFiltre = [...new Set(lignes.map((l) => l.matiere_id))]
    .map((id) => matiereParId.get(id))
    .filter(Boolean) as any[];
  const colonne = (idEleve: number, idMatiere: number) =>
    lignes.filter((l) => l.etudiant_id === idEleve && l.matiere_id === idMatiere);

  const total = lignes.length;
  const etat = pagination(total, searchParams, PAR_PAGE);
  const detail = lignes.slice(etat.saut, etat.saut + etat.parPage);

  // Appel du prof : une matiere qu'il enseigne, une date de seance.
  const matieresAppel = (matieres as any[]).filter((m) => m.classe_id === classeId && m.prof_id === session.id && m.statut === "en_cours");
  const matiereAppelId = nombre(searchParams, "appel_matiere_id") || matieresAppel[0]?.id || 0;
  const jourAppel = valeur(searchParams, "appel_date") || per.debut;
  const marques = (presences as any[]).filter((p) => p.matiere_id === matiereAppelId && p.date === jourAppel);
  const appel = (eleves as any[])
    .filter((u) => u.classe_id === classeId)
    .map((u: any) => ({ ...u, statut: marques.find((p) => p.etudiant_id === u.id)?.statut ?? null }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🕒 {peutSaisir ? "Présences et appel" : etudiant ? "Mes présences" : "Présences (consultation)"}</h1>
        <p className="text-sm text-slate-500">
          {peutSaisir
            ? "Choisissez une classe pour consulter l'historique filtré, puis relevez l'appel d'une séance en bas de page."
            : etudiant
              ? "Vos relevés d'appel, filtrés par matière et par période. Vous ne pouvez pas les modifier."
              : "Consultation seule : l'appel est relevé par les professeurs. Filtrez par année, classe, matière et période."}
        </p>
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {String(searchParams.error)}</div>}
      {searchParams.ok && <div className="badge-green w-fit">{String(searchParams.ok)}</div>}

      <BarreFiltres
        base="/presences"
        params={searchParams}
        note={classe ? `Classe ${classe.nom} · ${matieresClasse.length} matière(s) · ${elevesClasse.length} étudiant(s) retenu(s) · période ${per.dit}.` : "Aucune donnée affichée tant qu'aucune classe n'est sélectionnée."}
      >
        {!etudiant && (
          <SelectFiltre label="Année scolaire" name="annee" value={annee} options={anneesDe(toutesClasses).map((a) => ({ valeur: a, libelle: a }))} />
        )}
        {!etudiant && (
          <SelectFiltre
            label="Classe (obligatoire)"
            name="classe_id"
            value={classeId ? String(classeId) : ""}
            vide="— Choisir une classe —"
            requis
            options={classesVue.map((c: any) => ({ valeur: String(c.id), libelle: `${c.nom} — ${c.filiere}` }))}
            large
          />
        )}
        <SelectFiltre
          label="Matière"
          name="matiere_id"
          value={matiereId ? String(matiereId) : ""}
          vide="Toutes les matières"
          options={(etudiant ? matieres.filter((m: any) => m.classe_id === classeId) : matieresClasse).map((m: any) => ({ valeur: String(m.id), libelle: `${m.code} — ${m.nom}` }))}
          large
        />
        <PeriodeFiltre periode={per} />
        <SelectFiltre
          label="Statut"
          name="statut"
          value={statut}
          vide="Tous les statuts"
          options={STATUTS.map((s) => ({ valeur: s, libelle: s === "present" ? "Présents" : s === "absent" ? "Absents" : "Retards" }))}
        />
        {!etudiant && (
          <SelectFiltre
            label="Étudiant"
            name="etudiant_id"
            value={eleveFiltre ? String(eleveFiltre) : ""}
            vide="Tous les étudiants"
            options={elevesClasse.map((u: any) => ({ valeur: String(u.id), libelle: `${u.prenom} ${u.nom}` }))}
            large
          />
        )}
      </BarreFiltres>

      {!etudiant && !classe ? (
        <div className="card text-sm text-slate-500">
          Sélectionnez une classe pour afficher les présences. Aucune donnée n'est montrée par défaut, pour ne pas
          mélanger plusieurs promotions. ({NOTE_PERIODE})
        </div>
      ) : (
        <>
          <Stats
            cartes={[
              { label: etudiant ? "Séances relevées" : "Lignes relevées", valeur: total, ton: "bleu", detail: per.dit },
              { label: "Présences", valeur: presentes, ton: "vert", detail: `taux ${taux(presentes, total)}` },
              { label: "Absences", valeur: absences, ton: absences > 0 ? "rouge" : "neutre" },
              { label: "Retards", valeur: retards, ton: retards > 0 ? "ambre" : "neutre" },
            ]}
          />

          <div className="card overflow-x-auto">
            <h2 className="font-semibold mb-2">Chaque étudiant par matière</h2>
            <table className="data">
              <thead>
                <tr>
                  <th>Étudiant</th>
                  {matieresDuFiltre.map((m: any) => (
                    <th key={m.id}>{m.code}</th>
                  ))}
                  <th>Total</th>
                  <th>Taux de présence</th>
                </tr>
              </thead>
              <tbody>
                {elevesClasse.map((u: any) => {
                  const sesLignes = lignes.filter((l) => l.etudiant_id === u.id);
                  return (
                    <tr key={u.id}>
                      <td className="font-medium">
                        {u.prenom} {u.nom}
                      </td>
                      {matieresDuFiltre.map((m: any) => {
                        const c = colonne(u.id, m.id);
                        const a = compte(c, "absent");
                        const r = compte(c, "retard");
                        const p = compte(c, "present");
                        if (c.length === 0) return <td key={m.id} className="text-slate-300">—</td>;
                        return (
                          <td key={m.id}>
                            <span className="text-xs">
                              <span className="text-green-700">{p}✓</span>
                              {a > 0 && <span className="text-red-700"> {a}✗</span>}
                              {r > 0 && <span className="text-amber-700"> {r}!</span>}
                            </span>
                          </td>
                        );
                      })}
                      <td>{sesLignes.length}</td>
                      <td className={compte(sesLignes, "absent") > 0 ? "text-red-700 font-semibold" : "text-green-700"}>
                        {taux(compte(sesLignes, "present"), sesLignes.length)}
                      </td>
                    </tr>
                  );
                })}
                {elevesClasse.length === 0 && (
                  <tr>
                    <td colSpan={matieresDuFiltre.length + 3} className="text-center text-slate-400 py-4">
                      Aucun étudiant dans cette classe avec ces filtres.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="text-xs text-slate-500 mt-2">✓ présence · ✗ absence · ! retard, comptés sur la période choisie.</p>
          </div>

          <div className="card overflow-x-auto">
            <h2 className="font-semibold mb-2">Détail des relevés</h2>
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Matière</th>
                  {!etudiant && <th>Étudiant</th>}
                  <th>Statut</th>
                  <th>Relevé par</th>
                  {peutSaisir && <th>Correction</th>}
                </tr>
              </thead>
              <tbody>
                {detail.map((l) => (
                  <tr key={l.id}>
                    <td>{fmt(l.date)}</td>
                    <td>
                      <span className="badge-gray font-mono">{l.code}</span> {l.matiere}
                    </td>
                    {!etudiant && <td>{l.eleve}</td>}
                    <td>
                      <span className={BADGE[l.statut] ?? "badge-gray"}>{l.statut}</span>
                    </td>
                    <td className="text-xs text-slate-500">{l.prof_id === session.id ? "vous" : l.prof_id ? "professeur" : "administration"}</td>
                    {peutSaisir && (
                      <td>
                        {l.prof_id === session.id && l.matiereObj?.statut !== "valide" ? (
                          <ConfirmForm
                            action={actionFormulaire("/api/presences", searchParams)}
                            method="post"
                            className="inline"
                            message={`Retirer le relevé « ${l.statut} » de ${l.eleve} du ${fmt(l.date)} ?`}
                          >
                            <input type="hidden" name="action" value="delete" />
                            <input type="hidden" name="id" value={l.id} />
                            <button className="btn-danger text-xs">Retirer</button>
                          </ConfirmForm>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {detail.length === 0 && (
                  <tr>
                    <td colSpan={etudiant ? 4 : 5} className="text-center text-slate-400 py-4">
                      Aucun relevé sur cette période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <Pagination base="/presences" params={searchParams} etat={etat} />
          </div>
        </>
      )}

      {peutSaisir && classe && (
        <div className="card">
          <h2 className="font-semibold mb-1">Faire l&apos;appel — {classe.nom}</h2>
          <p className="text-xs text-slate-500 mb-3">
            Une matière que vous enseignez, la date de la séance, puis présent / absent / retard pour chaque étudiant.
            Enregistrer remplace le relevé de cette séance.
          </p>
          <form method="get" action="/presences" className="grid md:grid-cols-3 gap-3 items-end mb-3">
            <input type="hidden" name="annee" value={annee} />
            <input type="hidden" name="classe_id" value={classeId} />
            <PeriodeFiltre periode={per} cache />
            {matiereId > 0 && <input type="hidden" name="matiere_id" value={matiereId} />}
            {statut && <input type="hidden" name="statut" value={statut} />}
            {eleveFiltre > 0 && <input type="hidden" name="etudiant_id" value={eleveFiltre} />}
            <div>
              <label className="label">Matière (vos matières en cours)</label>
              <select className="input" name="appel_matiere_id" defaultValue={matiereAppelId}>
                {matieresAppel.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.nom}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Date de séance</label>
              <input className="input" type="date" name="appel_date" defaultValue={jourAppel} />
            </div>
            <button className="btn-primary">Charger l&apos;appel</button>
          </form>

          {matieresAppel.length === 0 ? (
            <p className="text-sm text-slate-500">Vous n&apos;avez aucune matière en cours dans cette classe : l&apos;appel n&apos;est pas possible ici.</p>
          ) : (
            <form action={actionFormulaire("/api/presences", searchParams)} method="post" className="space-y-3">
              <input type="hidden" name="action" value="save" />
              <input type="hidden" name="matiere_id" value={matiereAppelId} />
              <input type="hidden" name="date" value={jourAppel} />
              {appel.map((e: any) => (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2">
                  <span className="font-medium">
                    {e.prenom} {e.nom}
                  </span>
                  <div className="flex gap-2">
                    {STATUTS.map((s) => (
                      <label
                        key={s}
                        className={`cursor-pointer rounded-full border px-3 py-1 text-xs capitalize transition ${
                          (e.statut ?? "present") === s
                            ? s === "present"
                              ? "bg-green-100 border-green-400 text-green-800"
                              : s === "absent"
                                ? "bg-red-100 border-red-400 text-red-800"
                                : "bg-amber-100 border-amber-400 text-amber-800"
                            : "border-slate-200 text-slate-500 hover:border-slate-400"
                        }`}
                      >
                        <input type="radio" name={`statut_${e.id}`} value={s} defaultChecked={(e.statut ?? "present") === s} className="sr-only" />
                        {s}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {appel.length === 0 && <p className="text-slate-400 text-sm">Aucun étudiant dans cette classe.</p>}
              <button className="btn-primary">Enregistrer l&apos;appel</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
