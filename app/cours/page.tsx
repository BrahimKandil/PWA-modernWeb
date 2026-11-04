import Link from "next/link";
import { findDocs, countDocs } from "@/lib/db";
import { exiger } from "@/lib/permissions";
import { actionFormulaire, classesDeAnnee, choixAnnee, anneesDe, nombre, type Parametres } from "@/lib/filtres";
import Modal from "@/components/Modal";
import ConfirmForm from "@/components/ConfirmForm";
import Stats from "@/components/Stats";
import { BarreFiltres, SelectFiltre } from "@/components/Filtres";

export const dynamic = "force-dynamic";

const note = (v: any) => (v == null ? "—" : `${v}/20`);

function ChampsChapitre({ chapitres, matiere, classeNom }: { chapitres: any[]; matiere: any; classeNom: string }) {
  return (
    <div className="grid gap-3">
      <input type="hidden" name="action" value={matiere.__chapitre ? "update" : "create"} />
      {matiere.__chapitre && <input type="hidden" name="id" value={matiere.__chapitre.id} />}
      <input type="hidden" name="matiere_id" value={matiere.id} />
      <p className="text-xs text-slate-500">
        {matiere.code} · {matiere.nom} — classe {classeNom}. Le support peut être un .docx ou un .pdf : le texte est lu et
        découpé pour servir de base au quiz.
      </p>
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="label">N° de chapitre</label>
          <input
            className="input"
            type="number"
            name="numero"
            min="1"
            max="30"
            defaultValue={matiere.__chapitre?.numero ?? ""}
            placeholder={String(chapitres.length + 1)}
            required
          />
          <p className="text-xs text-slate-500 mt-1">
            {chapitres.length ? `Numéros déjà pris : ${chapitres.map((c) => c.numero).sort((a, b) => a - b).join(", ")}` : "Aucun chapitre déposé pour l’instant."}
          </p>
        </div>
        <div className="md:col-span-2">
          <label className="label">Titre</label>
          <input className="input" name="titre" defaultValue={matiere.__chapitre?.titre} placeholder="Transactions et ACID" required />
        </div>
      </div>
      <div>
        <label className="label">Support de cours (.docx ou .pdf)</label>
        <input className="input" type="file" name="fichier" accept=".docx,.pdf,application/pdf" />
        {matiere.__chapitre?.fichier_nom && (
          <p className="text-xs text-slate-500 mt-1">
            Fichier actuel : {matiere.__chapitre.fichier_nom} — il reste en place si tu n’en déposes pas un autre.
          </p>
        )}
      </div>
      <div>
        <label className="label">Texte du chapitre (facultatif, obligatoire si le fichier ne contient pas de texte)</label>
        <textarea
          className="input min-h-[180px] font-mono text-xs"
          name="texte"
          defaultValue={matiere.__chapitre ? String(matiere.__chapitre.texte ?? "").slice(0, 4000) : ""}
          placeholder="Colle ici le contenu du chapitre si le PDF est un scan : le quiz ne peut être généré qu’à partir d’un texte réel."
        />
      </div>
      <button className="btn-primary justify-center">
        {matiere.__chapitre ? "Enregistrer le chapitre et ré-indexer" : "Déposer le chapitre"}
      </button>
    </div>
  );
}

export default async function CoursPage({ searchParams }: { searchParams: Parametres }) {
  const session = await exiger("cours");
  const prof = session.role === "prof";

  const [toutesClasses, toutesMatieres, tousCours] = await Promise.all([
    findDocs("classes", {}, { sort: { nom: 1 } }),
    findDocs("matieres", {}, { sort: { code: 1 } }),
    findDocs("cours", {}, { sort: { numero: 1 } }),
  ]);

  const annee = choixAnnee(searchParams, toutesClasses);
  let classesVue = classesDeAnnee(toutesClasses, annee);
  if (prof) classesVue = classesVue.filter((c: any) => toutesMatieres.some((m: any) => m.classe_id === c.id && m.prof_id === session.id));
  if (!prof) classesVue = classesVue.filter((c: any) => c.id === session.classe_id);

  const classeId = !prof ? session.classe_id ?? 0 : nombre(searchParams, "classe_id");
  const matieresVue = (toutesMatieres as any[]).filter(
    (m) => m.classe_id === classeId && (prof ? m.prof_id === session.id : true)
  );
  const matiereId = nombre(searchParams, "matiere_id");
  const matiere = matieresVue.find((m) => m.id === matiereId);
  const classe = toutesClasses.find((c: any) => c.id === classeId) as any;

  const chapitres = (tousCours as any[]).filter((c) => c.matiere_id === matiereId);
  const copies = matiere ? await findDocs("quiz_passations", { matiere_id: matiere.id }) : [];
  const maCopie = (cle: string) => copies.find((c: any) => c.etudiant_id === session.id && c.cle === cle);

  const comptePassages = async (coursId: number) => countDocs("cours_passages", { cours_id: coursId });
  const nbPassages = new Map<number, number>();
  for (const c of chapitres) nbPassages.set(c.id, await comptePassages(c.id));

  const termines = chapitres.filter((c) => c.terme).length;
  const globalOuvert = chapitres.length > 0 && termines === chapitres.length;
  const copieGlobale = matiere ? maCopie(`global:${matiere.id}`) : undefined;

  const moyenne = (coursId: number) => {
    const liste = copies.filter((k: any) => k.cours_id === coursId && k.soumis && typeof k.note === "number");
    if (!liste.length) return null;
    return Math.round((liste.reduce((s, k: any) => s + k.note, 0) / liste.length) * 10) / 10;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">📗 Cours</h1>
          <p className="text-sm text-slate-500">
            {prof
              ? "Dépose un chapitre par matière (.docx ou .pdf). Quand tu le marques terminé, son quiz s’ouvre pour tes élèves."
              : "Consulte les chapitres déposés par ton professeur et teste-toi : la note du quiz est sur 20 et ne compte pas dans la moyenne de la matière."}
          </p>
        </div>
        {prof && matiere && (
          <Modal
            titre={`Nouveau chapitre — ${matiere.code}`}
            bouton="＋ Déposer un chapitre"
            confirmation="Déposer ce chapitre et l’indexer pour le quiz ?"
          >
            <form action={actionFormulaire("/api/cours", searchParams)} method="post" encType="multipart/form-data">
              <ChampsChapitre chapitres={chapitres} matiere={{ ...matiere }} classeNom={classe?.nom ?? "—"} />
            </form>
          </Modal>
        )}
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {String(searchParams.error)}</div>}
      {searchParams.ok && <div className="badge-green w-fit">{String(searchParams.ok)}</div>}

      <BarreFiltres
        base="/cours"
        params={searchParams}
        note={
          matiere
            ? `Année ${annee} · ${classe?.nom ?? "?"} · ${matiere.code} — ${matiere.nom}.`
            : "Choisis l’année, la classe puis la matière : les chapitres déposés s’affichent ensuite."
        }
      >
        <SelectFiltre label="Année scolaire" name="annee" value={annee} options={anneesDe(toutesClasses).map((a) => ({ valeur: a, libelle: a }))} />
        <SelectFiltre
          label="Classe"
          name="classe_id"
          value={classeId ? String(classeId) : ""}
          vide={prof ? "— Choisir une classe —" : undefined}
          requis={prof}
          options={classesVue.map((c: any) => ({ valeur: String(c.id), libelle: `${c.nom} — ${c.filiere}` }))}
        />
        <SelectFiltre
          label="Matière"
          name="matiere_id"
          value={matiereId ? String(matiereId) : ""}
          vide="— Choisir une matière —"
          requis
          options={matieresVue.map((m: any) => ({ valeur: String(m.id), libelle: `${m.code} — ${m.nom}` }))}
          large
        />
      </BarreFiltres>

      {!matiere ? (
        <div className="card text-sm text-slate-500">
          {classeId ? "Aucune matière dans cette classe" : "Aucune matière sélectionnée."}
        </div>
      ) : (
        <>
          <Stats
            cartes={[
              { label: "Chapitres", valeur: chapitres.length },
              { label: "Terminés", valeur: `${termines}/${chapitres.length || 0}`, ton: globalOuvert ? "vert" : "ambre" },
              { label: "Passages de quiz", valeur: copies.filter((c: any) => c.soumis).length, ton: "bleu" },
              { label: "QCM global", valeur: globalOuvert ? "ouvert" : "fermé", detail: globalOuvert ? "8 questions" : "tous les chapitres doivent être terminés" },
            ]}
          />

          <div className="card overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Chapitre</th>
                  <th>Support</th>
                  <th>Statut</th>
                  {prof ? <th>Quiz (copies · moyenne)</th> : <th>Mon quiz</th>}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {chapitres.map((c) => {
                  const copie = maCopie(`chapitre:${c.id}`);
                  const moyenneClasse = moyenne(c.id);
                  const nbCopies = copies.filter((k: any) => k.cours_id === c.id && k.soumis).length;
                  return (
                    <tr key={c.id}>
                      <td className="font-semibold">{c.numero}</td>
                      <td>
                        <Link href={`/cours/${c.id}?matiere_id=${c.matiere_id}`} className="font-medium text-indigo-700 hover:underline">
                          {c.titre}
                        </Link>
                        <div className="text-xs text-slate-400">{nbPassages.get(c.id) ?? 0} passage(s) indexé(s)</div>
                      </td>
                      <td className="text-xs">
                        {c.fichier_nom ? (
                          <a href={`/api/cours/fichier?id=${c.id}`} className="text-indigo-700 hover:underline">
                            {c.fichier_type === "pdf" ? "📕 " : "📄 "}
                            {String(c.fichier_nom).slice(0, 26)}
                          </a>
                        ) : (
                          "texte collé"
                        )}
                      </td>
                      <td>
                        <span className={c.terme ? "badge-green" : "badge-amber"}>{c.terme ? "Terminé — quiz ouvert" : "En cours"}</span>
                      </td>
                      <td className="text-xs">
                        {prof ? (
                          <>
                            {nbCopies} copie(s)
                            {moyenneClasse != null ? ` · ${moyenneClasse}/20` : ""}
                          </>
                        ) : copie?.soumis ? (
                          <span className={copie.note >= 12 ? "badge-green" : "badge-amber"}>{note(copie.note)}</span>
                        ) : copie ? (
                          <span className="badge-blue">commencé</span>
                        ) : c.terme ? (
                          <span className="text-slate-500">une seule tentative</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <div className="flex gap-2 flex-wrap items-center">
                          <Link href={`/cours/${c.id}?matiere_id=${c.matiere_id}`} className="btn-ghost text-xs">
                            Ouvrir
                          </Link>
                          {!prof && c.terme && !copie && (
                            <Link href={`/cours/quiz?matiere_id=${c.matiere_id}&cours_id=${c.id}`} className="btn-primary text-xs">
                              Passer le quiz
                            </Link>
                          )}
                          {prof && (
                            <>
                              <Modal
                                titre={`Modifier le chapitre ${c.numero}`}
                                bouton="Modifier"
                                className="btn-ghost text-xs"
                                confirmation="Enregistrer et ré-indexer ce chapitre ?"
                              >
                                <form action={actionFormulaire("/api/cours", searchParams)} method="post" encType="multipart/form-data">
                                  <ChampsChapitre chapitres={chapitres} matiere={{ ...matiere, __chapitre: c }} classeNom={classe?.nom ?? "—"} />
                                </form>
                              </Modal>
                              <ConfirmForm
                                action={actionFormulaire("/api/cours", searchParams)}
                                method="post"
                                className="inline"
                                message={
                                  c.terme
                                    ? "Remettre ce chapitre en cours ? Son quiz sera refermé."
                                    : "Marquer ce chapitre terminé ? Le quiz du chapitre s’ouvre alors pour toute la classe."
                                }
                              >
                                <input type="hidden" name="action" value={c.terme ? "rouvrir" : "terminer"} />
                                <input type="hidden" name="id" value={c.id} />
                                <button className="btn-ghost text-xs">{c.terme ? "Rouvrir" : "Marquer terminé"}</button>
                              </ConfirmForm>
                              <ConfirmForm
                                action={actionFormulaire("/api/cours", searchParams)}
                                method="post"
                                className="inline"
                                message={`Supprimer « ${c.titre} » et ses passages indexés ? Impossible si des élèves ont déjà passé le quiz.`}
                              >
                                <input type="hidden" name="action" value="delete" />
                                <input type="hidden" name="id" value={c.id} />
                                <button className="btn-danger text-xs">Supprimer</button>
                              </ConfirmForm>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {chapitres.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-slate-400 py-4">
                      Aucun chapitre pour {matiere.code}. {prof ? "Dépose le premier avec le bouton ci-dessus." : "Reviens quand ton professeur en aura déposé."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {globalOuvert && (
            <div className="card flex flex-wrap items-center justify-between gap-3 border-indigo-200">
              <div>
                <h2 className="font-semibold">🧭 QCM global de {matiere.code}</h2>
                <p className="text-xs text-slate-500">
                  8 questions puisées dans les {chapitres.length} chapitres terminés. Une seule tentative, note sur 20, jamais mélangée aux notes de la matière.
                  {copieGlobale?.soumis ? ` Ta note : ${copieGlobale.note}/20.` : ""}
                </p>
              </div>
              {!prof &&
                (copieGlobale?.soumis ? (
                  <span className={copieGlobale.note >= 12 ? "badge-green" : "badge-amber"}>{note(copieGlobale.note)}</span>
                ) : (
                  <Link href={`/cours/quiz?matiere_id=${matiere.id}&global=1`} className="btn-primary">
                    {copieGlobale ? "Reprendre le QCM global" : "Passer le QCM global"}
                  </Link>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
