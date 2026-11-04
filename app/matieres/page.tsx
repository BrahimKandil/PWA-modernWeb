import { findDocs } from "@/lib/db";
import { exiger, peut } from "@/lib/permissions";
import { actionFormulaire, classesDeAnnee, choixAnnee, anneesDe, nombre, valeur, type Parametres } from "@/lib/filtres";
import Modal from "@/components/Modal";
import ConfirmForm from "@/components/ConfirmForm";
import Stats from "@/components/Stats";
import { BarreFiltres, SelectFiltre } from "@/components/Filtres";

export const dynamic = "force-dynamic";

const STATUT_BADGE: Record<string, string> = { en_cours: "badge-blue", termine: "badge-amber", valide: "badge-green" };
const STATUT_LABEL: Record<string, string> = { en_cours: "En cours", termine: "Clôturée — à valider", valide: "Validée" };
const STATUTS = ["en_cours", "termine", "valide"];

function ChampsMatiere({ matiere, classes, profs, classeId }: { matiere?: any; classes: any[]; profs: any[]; classeId: number }) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <input type="hidden" name="action" value={matiere ? "update" : "create"} />
      {matiere && <input type="hidden" name="id" value={matiere.id} />}
      <div>
        <label className="label">Code</label>
        <input className="input" name="code" defaultValue={matiere?.code} placeholder="ALGO" required />
      </div>
      <div>
        <label className="label">Nom</label>
        <input className="input" name="nom" defaultValue={matiere?.nom} placeholder="Algorithmique" required />
      </div>
      <div>
        <label className="label">Classe</label>
        <select className="input" name="classe_id" defaultValue={matiere?.classe_id ?? classeId ?? ""} required>
          <option value="">— Choisir —</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.annee} · {c.nom}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Professeur</label>
        <select className="input" name="prof_id" defaultValue={matiere?.prof_id ?? ""}>
          <option value="">— Aucun —</option>
          {profs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.prenom} {p.nom}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Coefficient</label>
        <input className="input" type="number" name="coefficient" min="1" max="6" defaultValue={matiere?.coefficient ?? 3} required />
      </div>
      <div>
        <label className="label">Nombre d&apos;heures</label>
        <input className="input" type="number" name="heures" min="1" defaultValue={matiere?.heures ?? 18} required />
      </div>
      <button className="btn-primary md:col-span-2 justify-center">
        {matiere ? "Enregistrer la matière" : "Créer la matière et notifier le professeur"}
      </button>
    </div>
  );
}

export default async function MatieresPage({ searchParams }: { searchParams: Parametres }) {
  const session = await exiger("matieres");
  const admin = peut(session.role, "matieres", "creer");

  const [toutes, toutesClasses, usagers] = await Promise.all([
    findDocs("matieres", {}, { sort: { code: 1 } }),
    findDocs("classes", {}, { sort: { nom: 1 } }),
    findDocs("users"),
  ]);
  const parId = new Map(usagers.map((u: any) => [u.id, u]));
  const nomClasse = new Map(toutesClasses.map((c: any) => [c.id, c.nom]));
  const profs = (usagers as any[]).filter((u) => u.role === "prof" && u.actif === 1).sort((a, b) => String(a.nom).localeCompare(String(b.nom)));

  const annee = choixAnnee(searchParams, toutesClasses);
  let classesVue = classesDeAnnee(toutesClasses, annee);
  if (session.role === "prof") {
    classesVue = classesVue.filter((c: any) => toutes.some((m: any) => m.classe_id === c.id && m.prof_id === session.id));
  }
  if (session.role === "etudiant") {
    classesVue = classesVue.filter((c: any) => c.id === session.classe_id);
  }

  const statut = valeur(searchParams, "statut");
  // L'etudiant a une classe imposee ; admin et prof doivent la choisir avant de voir quoi que ce soit.
  const classeId = session.role === "etudiant" ? session.classe_id ?? 0 : nombre(searchParams, "classe_id");
  const classe = classesVue.find((c: any) => c.id === classeId);

  const matieres = (toutes as any[])
    .filter((m) => m.classe_id === classeId)
    .filter((m) => (admin ? true : session.role === "prof" ? m.prof_id === session.id : true))
    .filter((m) => !statut || m.statut === statut)
    .map((m) => {
      const p = parId.get(m.prof_id);
      return { ...m, pp: p ? `${p.prenom} ${p.nom}` : "—" };
    });

  const enAttente = (toutes as any[]).filter((m) => m.statut === "termine");
  const heuresTotales = matieres.reduce((s, m) => s + (Number(m.heures) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">📚 Matières</h1>
          <p className="text-sm text-slate-500">
            {admin
              ? "Choisissez l'année puis la classe : les matières de cette classe s'affichent, et vous pouvez en ajouter."
              : session.role === "prof"
                ? "Choisissez l'année puis une classe où vous enseignez : seules vos matières apparaissent."
                : "Les matières de votre classe, avec leur statut et votre enseignant."}
          </p>
        </div>
        {admin && (
          <Modal titre="Nouvelle matière" bouton="＋ Ajouter une matière" confirmation="Créer cette matière et envoyer l'email d'affectation au professeur ?">
            <form action={actionFormulaire("/api/matieres", searchParams)} method="post">
              <ChampsMatiere classes={classesDeAnnee(toutesClasses, annee)} profs={profs} classeId={classeId} />
            </form>
          </Modal>
        )}
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {String(searchParams.error)}</div>}
      {searchParams.ok && <div className="badge-green w-fit">{String(searchParams.ok)}</div>}

      <BarreFiltres
        base="/matieres"
        params={searchParams}
        note={classe ? `Année ${annee} · classe ${classe.nom} (${classe.filiere}).` : "La sélection de la classe est obligatoire pour afficher les matières."}
      >
        <SelectFiltre label="Année scolaire" name="annee" value={annee} options={anneesDe(toutesClasses).map((a) => ({ valeur: a, libelle: a }))} />
        <SelectFiltre
          label="Classe (obligatoire)"
          name="classe_id"
          value={classeId ? String(classeId) : ""}
          vide="— Choisir une classe —"
          requis={session.role !== "etudiant"}
          options={classesVue.map((c: any) => ({ valeur: String(c.id), libelle: `${c.nom} — ${c.filiere}` }))}
          large
        />
        <SelectFiltre
          label="Statut"
          name="statut"
          value={statut}
          vide="Tous les statuts"
          options={STATUTS.map((s) => ({ valeur: s, libelle: STATUT_LABEL[s] }))}
        />
      </BarreFiltres>

      {admin && enAttente.length > 0 && (
        <div className="card border-amber-300">
          <h2 className="font-semibold mb-2">⏳ Clôturées par les profs — en attente de validation ({enAttente.length})</h2>
          {enAttente.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
              <span className="text-sm">
                {m.code} — {m.nom} · {nomClasse.get(m.classe_id) ?? "?"}
              </span>
              <ConfirmForm
                action={actionFormulaire("/api/matieres", searchParams)}
                method="post"
                className="inline"
                message={`Valider ${m.code} et publier ses notes d'examen aux étudiants ? La matière deviendra non modifiable.`}
              >
                <input type="hidden" name="action" value="valider" />
                <input type="hidden" name="id" value={m.id} />
                <button className="btn-primary text-xs">Valider et publier</button>
              </ConfirmForm>
            </div>
          ))}
        </div>
      )}

      {!classe ? (
        <div className="card text-sm text-slate-500">
          {session.role === "etudiant"
            ? "Votre compte n'est rattaché à aucune classe. Contactez l'administration."
            : "Aucune classe sélectionnée : choisissez une année puis une classe dans la barre de filtres."}
        </div>
      ) : (
        <>
          <Stats
            cartes={[
              { label: "Matières affichées", valeur: matieres.length, ton: "bleu" },
              { label: "Heures cumulées", valeur: `${heuresTotales} h` },
              { label: "En cours", valeur: matieres.filter((m) => m.statut === "en_cours").length, ton: "bleu" },
              { label: "Validées", valeur: matieres.filter((m) => m.statut === "valide").length, ton: "vert" },
            ]}
          />

          <div className="card overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Matière</th>
                  <th>Coef</th>
                  <th>Heures</th>
                  <th>Enseignant</th>
                  <th>Statut</th>
                  {admin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {matieres.map((m) => (
                  <tr key={m.id}>
                    <td className="font-mono font-semibold">{m.code}</td>
                    <td>{m.nom}</td>
                    <td>{m.coefficient}</td>
                    <td>{m.heures} h</td>
                    <td>{m.pp}</td>
                    <td>
                      <span className={STATUT_BADGE[m.statut] ?? "badge-gray"}>{STATUT_LABEL[m.statut] ?? m.statut}</span>
                    </td>
                    {admin && (
                      <td>
                        <div className="flex gap-2 flex-wrap">
                          <Modal titre={`Modifier ${m.code}`} bouton="Modifier" className="btn-ghost text-xs" confirmation={`Enregistrer les modifications de ${m.code} ?`}>
                            <form action={actionFormulaire("/api/matieres", searchParams)} method="post">
                              <ChampsMatiere matiere={m} classes={classesDeAnnee(toutesClasses, annee)} profs={profs} classeId={classeId} />
                            </form>
                          </Modal>
                          <ConfirmForm
                            action={actionFormulaire("/api/matieres", searchParams)}
                            method="post"
                            className="inline"
                            message={`Supprimer ${m.code} ? Elle ne doit contenir ni notes, ni présences, ni créneau d'emploi du temps.`}
                          >
                            <input type="hidden" name="action" value="delete" />
                            <input type="hidden" name="id" value={m.id} />
                            <button className="btn-danger text-xs">Supprimer</button>
                          </ConfirmForm>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {matieres.length === 0 && (
                  <tr>
                    <td colSpan={admin ? 7 : 6} className="text-center text-slate-400 py-4">
                      Aucune matière pour cette classe{session.role === "prof" ? " sous votre responsabilité" : ""}
                      {statut ? ` en statut « ${statut} »` : ""}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
