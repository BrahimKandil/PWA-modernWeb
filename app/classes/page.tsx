import { findDocs } from "@/lib/db";
import { exiger, peut } from "@/lib/permissions";
import { actionFormulaire, classesDeAnnee, choixAnnee, anneesDe, lien, pagination, valeur, type Parametres } from "@/lib/filtres";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import ConfirmForm from "@/components/ConfirmForm";
import { BarreFiltres, SelectFiltre } from "@/components/Filtres";

export const dynamic = "force-dynamic";

const PAR_PAGE = 6;

function CarteClasse({ classe, active, hrefOuvrir }: { classe: any; active: boolean; hrefOuvrir: string }) {
  return (
    <div className={`card !p-0 overflow-hidden ${active ? "ring-2 ring-indigo-500" : ""}`}>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-lg leading-tight">{classe.nom}</h3>
          <span className={active ? "badge-blue" : "badge-gray"}>{classe.nb} élèves</span>
        </div>
        <p className="text-xs text-slate-500">
          {classe.filiere} · {classe.annee}
        </p>
        <div className="flex flex-wrap gap-1 mt-2">
          {classe.matieres.slice(0, 4).map((m: any) => (
            <span key={m.id} className="badge-gray">
              {m.code}
            </span>
          ))}
          {classe.matieres.length > 4 && <span className="badge-gray">+{classe.matieres.length - 4}</span>}
          {classe.matieres.length === 0 && <span className="text-xs text-slate-400">aucune matière</span>}
        </div>
      </div>
      <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex gap-2 flex-wrap">
        <a href={`/emplois?classe_id=${classe.id}`} className="btn-ghost text-xs">
          Emploi du temps
        </a>
        {active ? (
          <span className="badge-green">sélectionnée</span>
        ) : (
          <a href={hrefOuvrir} className="btn-ghost text-xs">
            Ouvrir
          </a>
        )}
      </div>
    </div>
  );
}

export default async function ClassesPage({ searchParams }: { searchParams: Parametres }) {
  const session = await exiger("classes");
  const peutEcrire = peut(session.role, "classes", "creer");

  const [toutes, eleves, matieres] = await Promise.all([
    findDocs("classes", {}, { sort: { nom: 1 } }),
    findDocs("users", { role: "etudiant" }, { sort: { nom: 1, prenom: 1 } }),
    findDocs("matieres", {}, { sort: { code: 1 } }),
  ]);

  const annee = choixAnnee(searchParams, toutes);
  const enrichies = classesDeAnnee(toutes, annee).map((c: any) => ({
    ...c,
    nb: eleves.filter((u: any) => u.classe_id === c.id).length,
    matieres: matieres.filter((m: any) => m.classe_id === c.id),
  }));

  // Perimetre de lecture : l'admin voit tout, le prof ses classes d'enseignement, l'etudiant la sienne.
  let visibles = enrichies;
  if (session.role === "prof") {
    visibles = enrichies.filter((c: any) => c.matieres.some((m: any) => m.prof_id === session.id));
  }
  if (session.role === "etudiant") {
    visibles = enrichies.filter((c: any) => c.id === session.classe_id);
  }

  const etat = pagination(visibles.length, searchParams, PAR_PAGE);
  const pages = visibles.slice(etat.saut, etat.saut + etat.parPage);
  const idChoisi = Number(valeur(searchParams, "id"));
  const choisie = visibles.find((c: any) => c.id === idChoisi) ?? pages[0] ?? visibles[0];
  const position = choisie ? visibles.findIndex((c: any) => c.id === choisie.id) : -1;
  const avant = position > 0 ? visibles[position - 1] : null;
  const apres = position >= 0 && position < visibles.length - 1 ? visibles[position + 1] : null;

  const membres = choisie ? eleves.filter((u: any) => u.classe_id === choisie.id) : [];
  const horsClasse = eleves.filter((u: any) => !u.classe_id);
  const annees = anneesDe(toutes);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🎒 {peutEcrire ? "Gestion des classes" : "Classes"}</h1>
          <p className="text-sm text-slate-500">
            {peutEcrire
              ? "Filtrez par année scolaire, puis ouvrez une classe pour y affecter les comptes étudiants."
              : session.role === "prof"
                ? "Les classes où vous enseignez cette année. Consultation seule."
                : "Votre classe. Consultation seule."}
          </p>
        </div>
        {peutEcrire && (
          <Modal
            titre="Nouvelle classe"
            bouton="＋ Créer une classe"
            confirmation="Créer cette classe maintenant ?"
          >
            <form action={actionFormulaire("/api/classes", searchParams)} method="post" className="grid md:grid-cols-2 gap-3">
              <input type="hidden" name="action" value="create" />
              <div>
                <label className="label">Nom (ex: INFO-3A)</label>
                <input className="input" name="nom" required />
              </div>
              <div>
                <label className="label">Filière</label>
                <input className="input" name="filiere" required />
              </div>
              <div className="md:col-span-2">
                <label className="label">Année scolaire</label>
                <input className="input" name="nouvelle_annee" defaultValue={annee || "2026-2027"} placeholder="2026-2027" required />
              </div>
              <button className="btn-primary md:col-span-2 justify-center">Créer la classe</button>
            </form>
          </Modal>
        )}
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {String(searchParams.error)}</div>}
      {searchParams.ok && <div className="badge-green w-fit">{String(searchParams.ok)}</div>}

      <BarreFiltres
        base="/classes"
        params={searchParams}
        caches={{ id: choisie ? String(choisie.id) : "" }}
        note="Le filtre d'année change la liste des classes affichées ; les flèches font défiler les classes une à une."
      >
        <SelectFiltre
          label="Année scolaire"
          name="annee"
          value={annee}
          options={annees.map((a) => ({ valeur: a, libelle: a }))}
        />
        {peutEcrire && (
          <SelectFiltre
            label="Contenu affiché"
            name="vue"
            value={valeur(searchParams, "vue") || "grille"}
            options={[
              { valeur: "grille", libelle: "Plusieurs classes côte à côte" },
              { valeur: "liste", libelle: "Une classe par ligne" },
            ]}
          />
        )}
      </BarreFiltres>

      {visibles.length === 0 && (
        <div className="card text-sm text-slate-500">
          {session.role === "prof"
            ? "Aucune classe cette année : vous n'êtes affecté à aucune matière de l'année choisie."
            : session.role === "etudiant"
              ? "Aucune classe trouvée pour votre compte."
              : `Aucune classe pour l'année ${annee || "—"}.`}
        </div>
      )}

      {visibles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              {avant ? (
                <a href={lien("/classes", searchParams, { id: String(avant.id) })} className="btn-ghost">
                  ← {avant.nom}
                </a>
              ) : (
                <span className="btn-ghost opacity-40">←</span>
              )}
              {apres ? (
                <a href={lien("/classes", searchParams, { id: String(apres.id) })} className="btn-ghost">
                  {apres.nom} →
                </a>
              ) : (
                <span className="btn-ghost opacity-40">→</span>
              )}
            </div>
            <span className="text-xs text-slate-500">
              classe {position + 1} sur {visibles.length} · {etat.de}–{etat.a} affichées
            </span>
          </div>

          <div className={valeur(searchParams, "vue") === "liste" ? "space-y-3" : "grid md:grid-cols-2 xl:grid-cols-3 gap-3"}>
            {pages.map((c: any) => (
              <CarteClasse
                key={c.id}
                classe={c}
                active={choisie?.id === c.id}
                hrefOuvrir={lien("/classes", searchParams, { id: String(c.id), page: "" })}
              />
            ))}
          </div>

          <Pagination base="/classes" params={{ ...searchParams, annee }} etat={etat} />
        </div>
      )}

      {choisie && peutEcrire && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card">
            <h2 className="font-semibold mb-1">Membres — {choisie.nom}</h2>
            <p className="text-xs text-slate-500 mb-3">
              Filière {choisie.filiere} · Année {choisie.annee} · {choisie.matieres.length} matière(s)
            </p>
            <ConfirmForm
              action={actionFormulaire("/api/classes", searchParams)}
              method="post"
              className="space-y-3"
              message={`Affecter ces ${membres.length} étudiant(s) à ${choisie.nom} ? Les autres seront sortis de cette classe.`}
            >
              <input type="hidden" name="action" value="affecter" />
              <input type="hidden" name="classe_id" value={choisie.id} />
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y">
                {eleves.map((u: any) => (
                  <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" name="etudiant_ids" value={u.id} defaultChecked={u.classe_id === choisie.id} />
                    {u.prenom} {u.nom}
                    {u.classe_id && u.classe_id !== choisie.id && (
                      <span className="text-xs text-amber-600">(déjà dans une autre classe)</span>
                    )}
                  </label>
                ))}
                {eleves.length === 0 && <p className="text-sm text-slate-500 p-3">Aucun compte étudiant créé.</p>}
              </div>
              {horsClasse.length > 0 && (
                <p className="text-xs text-slate-500">
                  {horsClasse.length} étudiant(s) sans classe pour le moment.
                </p>
              )}
              <button className="btn-primary">Enregistrer l&apos;affectation</button>
            </ConfirmForm>
          </div>

          <div className="space-y-4">
            <div className="card">
              <h3 className="font-semibold mb-2">Effectif : {choisie.nb}</h3>
              <ul className="text-sm space-y-1">
                {membres.map((m: any) => (
                  <li key={m.id}>
                    • {m.prenom} {m.nom} {!m.mot_de_passe && <span className="badge-amber">non activé</span>}
                  </li>
                ))}
                {membres.length === 0 && <li className="text-slate-500">Aucun étudiant.</li>}
              </ul>
            </div>
            <div className="card">
              <h3 className="font-semibold mb-2">Modifier la classe</h3>
              <form action={actionFormulaire("/api/classes", searchParams)} method="post" className="grid grid-cols-2 gap-2">
                <input type="hidden" name="action" value="update" />
                <input type="hidden" name="id" value={choisie.id} />
                <div>
                  <label className="label">Nom</label>
                  <input className="input" name="nom" defaultValue={choisie.nom} required />
                </div>
                <div>
                  <label className="label">Filière</label>
                  <input className="input" name="filiere" defaultValue={choisie.filiere} required />
                </div>
                <div className="col-span-2">
                  <label className="label">Année scolaire</label>
                  <input className="input" name="nouvelle_annee" defaultValue={choisie.annee} required />
                </div>
                <div className="col-span-2 flex gap-2">
                  <button className="btn-primary">Enregistrer</button>
                </div>
              </form>
            </div>
            <ConfirmForm
              action={actionFormulaire("/api/classes", searchParams)}
              method="post"
              className="flex gap-2"
              message={`Supprimer la classe ${choisie.nom} ? Elle ne doit plus contenir d'étudiant, de matière ni de créneau.`}
            >
              <input type="hidden" name="action" value="delete" />
              <input type="hidden" name="id" value={choisie.id} />
              <button className="btn-danger text-xs">Supprimer la classe {choisie.nom}</button>
            </ConfirmForm>
          </div>
        </div>
      )}

      {choisie && !peutEcrire && (
        <div className="card">
          <h2 className="font-semibold mb-1">{choisie.nom} — {choisie.filiere}</h2>
          <p className="text-xs text-slate-500 mb-3">
            Année {choisie.annee}
            {session.role === "etudiant" ? ` · ${choisie.nb} élèves dans votre classe` : ` · ${choisie.nb} élèves`}
          </p>
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Matière</th>
                <th>Coefficient</th>
                <th>Heures</th>
                <th>Statut</th>
                {session.role === "prof" && <th>Enseignant</th>}
              </tr>
            </thead>
            <tbody>
              {choisie.matieres
                .filter((m: any) => session.role !== "prof" || m.prof_id === session.id)
                .map((m: any) => (
                  <tr key={m.id}>
                    <td className="font-semibold">{m.code}</td>
                    <td>{m.nom}</td>
                    <td>{m.coefficient}</td>
                    <td>{m.heures} h</td>
                    <td>
                      <span className={m.statut === "valide" ? "badge-green" : m.statut === "termine" ? "badge-amber" : "badge-gray"}>
                        {m.statut}
                      </span>
                    </td>
                    {session.role === "prof" && <td className="text-xs text-slate-500">vous</td>}
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500 mt-2">
            Les noms des autres étudiants ne sont pas affichés ici : chaque compte ne voit que son propre périmètre.
          </p>
        </div>
      )}
    </div>
  );
}
