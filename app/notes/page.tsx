import { findDocs } from "@/lib/db";
import { exiger, peut } from "@/lib/permissions";
import { actionFormulaire, anneesDe, classesDeAnnee, choixAnnee, nombre, pagination, periode, valeur, type Parametres } from "@/lib/filtres";
import { aujourdhui } from "@/lib/semaine";
import Modal from "@/components/Modal";
import ConfirmForm from "@/components/ConfirmForm";
import Pagination from "@/components/Pagination";
import Stats from "@/components/Stats";
import { BarreFiltres, NOTE_PERIODE, PeriodeFiltre, SelectFiltre } from "@/components/Filtres";

export const dynamic = "force-dynamic";

const TYPES = ["CC", "TP", "EXAM"];
const TYPE_LABEL: Record<string, string> = { CC: "Contrôle continu", TP: "TP", EXAM: "Examen" };
const STATUT_BADGE: Record<string, string> = { en_cours: "badge-blue", termine: "badge-amber", valide: "badge-green" };
const STATUT_LABEL: Record<string, string> = { en_cours: "En cours — saisie ouverte", termine: "Clôturée — en attente de validation", valide: "Validée — publiée aux étudiants" };
const PAR_PAGE = 20;

const fmt = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : iso;

const moyenneDe = (liste: any[]) => (liste.length ? liste.reduce((s, n) => s + Number(n.valeur), 0) / liste.length : null);
const ton = (m: number | null): "vert" | "rouge" | "neutre" => (m == null ? "neutre" : m >= 10 ? "vert" : "rouge");

function ChampsNote({ note, eleves, matiereId }: { note?: any; eleves: any[]; matiereId: number }) {
  const types = note ? TYPES : ["CC", "TP"];
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <input type="hidden" name="action" value={note ? "update" : "create"} />
      <input type="hidden" name="matiere_id" value={note?.matiere_id ?? matiereId} />
      {note && <input type="hidden" name="id" value={note.id} />}
      {!note && (
        <div>
          <label className="label">Étudiant</label>
          <select className="input" name="etudiant_id" defaultValue="" required>
            <option value="">— Choisir —</option>
            {eleves.map((e: any) => (
              <option key={e.id} value={e.id}>
                {e.prenom} {e.nom}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="label">Type de note</label>
        <select className="input" name="type" defaultValue={note?.type ?? "CC"}>
          {types.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Valeur /20</label>
        <input className="input" type="number" name="valeur" min="0" max="20" step="0.25" defaultValue={note?.valeur} required />
      </div>
      <div>
        <label className="label">Date</label>
        <input className="input" type="date" name="date" defaultValue={note?.date ?? aujourdhui()} max={aujourdhui()} required />
      </div>
      <button className="btn-primary md:col-span-2 justify-center">{note ? "Enregistrer la note" : "Ajouter la note"}</button>
    </div>
  );
}

export default async function NotesPage({ searchParams }: { searchParams: Parametres }) {
  const session = await exiger("notes");
  const peutEditer = peut(session.role, "notes", "creer"); // le prof seul saisit les notes
  const etudiant = session.role === "etudiant";

  const [notes, matieres, toutesClasses, usagers] = await Promise.all([
    findDocs("notes", {}, { sort: { date: 1 } }),
    findDocs("matieres", {}, { sort: { code: 1 } }),
    findDocs("classes", {}, { sort: { nom: 1 } }),
    findDocs("users"),
  ]);
  const personneParId = new Map((usagers as any[]).map((u) => [u.id, u]));
  const parNom = (a: any, b: any) => String(a.nom).localeCompare(String(b.nom)) || String(a.prenom).localeCompare(String(b.prenom));

  const annee = choixAnnee(searchParams, toutesClasses);
  let classesVue = classesDeAnnee(toutesClasses, annee);
  if (session.role === "prof") classesVue = classesVue.filter((c: any) => matieres.some((m: any) => m.classe_id === c.id && m.prof_id === session.id));
  if (etudiant) classesVue = classesVue.filter((c: any) => c.id === session.classe_id);

  const classeId = etudiant ? session.classe_id ?? 0 : nombre(searchParams, "classe_id");
  const classe = classesVue.find((c: any) => c.id === classeId);

  const matieresClasse = (matieres as any[])
    .filter((m) => m.classe_id === classeId)
    .filter((m) => (session.role === "prof" ? m.prof_id === session.id : true));

  const matiereId = nombre(searchParams, "matiere_id");
  const eleveFiltre = nombre(searchParams, "etudiant_id");
  const brutDebut = valeur(searchParams, "debut");
  const brutFin = valeur(searchParams, "fin");
  const per = periode(searchParams);
  const filtreDate = !!(brutDebut || brutFin);

  const elevesTous = (usagers as any[]).filter((u) => u.role === "etudiant" && u.classe_id === classeId && u.actif === 1).sort(parNom);
  const elevesClasse = elevesTous.filter((u) => !eleveFiltre || u.id === eleveFiltre);

  // Notes retenues après période/étudiant ; pour l'étudiant on ne garde que les siennes.
  const notesScope = (notes as any[])
    .filter((n) => !filtreDate || (String(n.date) >= per.debut && String(n.date) <= per.fin))
    .filter((n) => !eleveFiltre || n.etudiant_id === eleveFiltre)
    .filter((n) => !etudiant || n.etudiant_id === session.id);

  const matiere = matieresClasse.find((m) => m.id === matiereId) ?? (etudiant ? null : matieresClasse[0] ?? null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">📝 {etudiant ? "Mes notes" : peutEditer ? "Saisie des notes" : "Notes (consultation)"}</h1>
          <p className="text-sm text-slate-500">
            {etudiant
              ? "Vos notes publiées après validation de chaque matière par l'administration. Filtrez par année, matière et période."
              : peutEditer
                ? "Ajoutez CC/TP, clôturez la matière avec les notes d'examen : l'administration valide, puis vos étudiants voient leurs notes."
                : "Consultation seule : la saisie appartient aux professeurs. Filtrez par année, classe, matière et étudiant."}
          </p>
        </div>
        {classe && peutEditer && matiere?.statut === "en_cours" && (
          <Modal titre={`Ajouter une note — ${matiere.code}`} bouton="＋ Ajouter une note" confirmation="Ajouter cette note à la matière ?">
            <form action={actionFormulaire("/api/notes", searchParams)} method="post">
              <ChampsNote eleves={elevesTous} matiereId={matiere.id} />
            </form>
          </Modal>
        )}
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {String(searchParams.error)}</div>}
      {searchParams.ok && <div className="badge-green w-fit">{String(searchParams.ok)}</div>}

      <BarreFiltres
        base="/notes"
        params={searchParams}
        note={
          classe
            ? `Classe ${classe.nom} · ${matieresClasse.length} matière(s) · ${elevesClasse.length} étudiant(s). ${filtreDate ? `Période ${per.dit}.` : "Toute la période (réduisez avec les dates)."}`
            : etudiant
              ? "Votre compte n'est rattaché à aucune classe."
              : `Aucune donnée tant qu'une classe n'est pas sélectionnée. ${NOTE_PERIODE}`
        }
      >
        <SelectFiltre label="Année scolaire" name="annee" value={annee} options={anneesDe(toutesClasses).map((a) => ({ valeur: a, libelle: a }))} />
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
          vide={etudiant ? "Toutes mes matières" : "Toutes les matières"}
          options={matieresClasse.map((m: any) => ({ valeur: String(m.id), libelle: `${m.code} — ${m.nom}` }))}
          large
        />
        {!etudiant && (
          <SelectFiltre
            label="Étudiant"
            name="etudiant_id"
            value={eleveFiltre ? String(eleveFiltre) : ""}
            vide="Tous les étudiants"
            options={elevesTous.map((u: any) => ({ valeur: String(u.id), libelle: `${u.prenom} ${u.nom}` }))}
            large
          />
        )}
        <PeriodeFiltre periode={filtreDate ? per : { debut: "", fin: "", dit: "" }} />
      </BarreFiltres>

      {/* Étudiant : ses moyennes par matière validée + moyenne générale pondérée par coefficient. */}
      {etudiant &&
        (classe ? (
          (() => {
            const valider = matieresClasse.filter((m) => m.statut === "valide");
            const enAttente = matieresClasse.filter((m) => m.statut !== "valide");
            let sum = 0;
            let coef = 0;
            for (const m of valider) {
              const moyenne = moyenneDe(notesScope.filter((n) => n.matiere_id === m.id));
              if (moyenne != null) {
                sum += moyenne * (Number(m.coefficient) || 1);
                coef += Number(m.coefficient) || 1;
              }
            }
            const gen = coef ? sum / coef : null;
            const cartes = (matiere ? valider.filter((m) => m.id === matiere.id) : valider);
            return (
              <div className="space-y-6">
                <Stats
                  cartes={[
                    { label: "Moyenne générale", valeur: gen == null ? "—" : `${gen.toFixed(2)}/20`, ton: ton(gen), detail: "matières validées, pondérée par coefficient" },
                    { label: "Matières validées", valeur: valider.length, ton: "bleu" },
                    { label: "Notes affichées", valeur: notesScope.length, detail: filtreDate ? per.dit : "toute la période" },
                  ]}
                />
                {cartes.map((m) => {
                  const siennes = notesScope.filter((n) => n.matiere_id === m.id);
                  const moyenne = moyenneDe(siennes);
                  return (
                    <div key={m.id} className="card space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h2 className="font-semibold">
                            {m.code} — {m.nom}
                          </h2>
                          <p className="text-xs text-slate-500">Coefficient {m.coefficient} · {classe.nom}</p>
                        </div>
                        <span className={`badge-${moyenne == null ? "gray" : moyenne >= 10 ? "green" : "red"}`}>Moyenne : {moyenne == null ? "—" : `${moyenne.toFixed(2)}/20`}</span>
                      </div>
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Valeur</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {siennes.map((n) => (
                            <tr key={n.id}>
                              <td>
                                <span className="badge-blue">{n.type}</span>
                              </td>
                              <td className="font-semibold">{n.valeur}/20</td>
                              <td>{fmt(String(n.date))}</td>
                            </tr>
                          ))}
                          {siennes.length === 0 && (
                            <tr>
                              <td colSpan={3} className="text-center text-slate-400 py-3">
                                Aucune note sur cette matière.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
                {cartes.length === 0 && <div className="card text-sm text-slate-500">Aucune matière validée pour l&apos;instant — vos notes apparaîtront après clôture et validation.</div>}
                {enAttente.length > 0 && !matiere && (
                  <div className="card">
                    <h2 className="font-semibold mb-2 text-sm">En attente de publication</h2>
                    <div className="flex flex-wrap gap-2">
                      {enAttente.map((m) => (
                        <span key={m.id} className={`badge-${m.statut === "termine" ? "amber" : "gray"}`}>
                          {m.code} — {m.statut === "termine" ? "clôturée, en attente de validation" : "en cours"}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <div className="card text-sm text-slate-500">Votre compte n&apos;est rattaché à aucune classe. Contactez l&apos;administration.</div>
        ))}

      {/* Admin / prof : une matière à la fois, grille par étudiant + détail des notes. */}
      {!etudiant && !classe && (
        <div className="card text-sm text-slate-500">
          Choisissez une année puis une classe pour afficher les notes. Aucune donnée n&apos;est mélangée entre promotions.
        </div>
      )}

      {!etudiant && classe && matieresClasse.length === 0 && (
        <div className="card text-sm text-slate-500">
          {session.role === "prof" ? "Aucune matière ne vous est attribuée dans cette classe." : "Aucune matière pour cette classe."}
        </div>
      )}

      {!etudiant && matiere &&
        (() => {
          const notesMatiere = notesScope.filter((n) => n.matiere_id === matiere.id);
          const noteOf = (etId: number, type: string) => notesMatiere.find((n) => n.etudiant_id === etId && n.type === type)?.valeur;
          const moyennesEleves = elevesClasse
            .map((e) => moyenneDe(notesMatiere.filter((n) => n.etudiant_id === e.id)))
            .filter((x): x is number => x != null);
          const moyenneClasse = moyennesEleves.length ? moyennesEleves.reduce((s, x) => s + x, 0) / moyennesEleves.length : null;
          const gel = matiere.statut !== "en_cours";
          const saisieProf = peutEditer && !gel;

          const detail = notesMatiere
            .map((n) => {
              const e: any = personneParId.get(n.etudiant_id);
              return { ...n, eleve: e ? `${e.prenom} ${e.nom}` : "—" };
            })
            .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.eleve).localeCompare(String(b.eleve)));
          const etat = pagination(detail.length, searchParams, PAR_PAGE);
          const page = detail.slice(etat.saut, etat.saut + etat.parPage);

          return (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">
                  {matiere.code} — {matiere.nom} · coef {matiere.coefficient} ·{" "}
                  <span className={STATUT_BADGE[matiere.statut] ?? "badge-gray"}>{STATUT_LABEL[matiere.statut] ?? matiere.statut}</span>
                </h2>
              </div>

              <Stats
                cartes={[
                  { label: "Étudiants suivis", valeur: elevesClasse.length, ton: "bleu" },
                  { label: "Notes relevées", valeur: notesMatiere.length, detail: filtreDate ? per.dit : "toute la matière" },
                  { label: "Moyenne de la matière", valeur: moyenneClasse == null ? "—" : `${moyenneClasse.toFixed(2)}/20`, ton: ton(moyenneClasse) },
                  { label: "Saisie", valeur: gel ? "fermée" : "ouverte", detail: gel ? STATUT_LABEL[matiere.statut] : "CC/TP + examen autorisés" },
                ]}
              />

              <div className="card overflow-x-auto">
                <h3 className="font-semibold mb-3">Notes par étudiant</h3>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Étudiant</th>
                      <th>CC</th>
                      <th>TP</th>
                      <th>Examen</th>
                      <th>Moyenne matière</th>
                    </tr>
                  </thead>
                  <tbody>
                    {elevesClasse.map((e: any) => {
                      const moyenne = moyenneDe(notesMatiere.filter((n) => n.etudiant_id === e.id));
                      return (
                        <tr key={e.id}>
                          <td className="font-medium">
                            {e.prenom} {e.nom}
                          </td>
                          <td>{noteOf(e.id, "CC") != null ? `${noteOf(e.id, "CC")}/20` : "—"}</td>
                          <td>{noteOf(e.id, "TP") != null ? `${noteOf(e.id, "TP")}/20` : "—"}</td>
                          <td>{noteOf(e.id, "EXAM") != null ? `${noteOf(e.id, "EXAM")}/20` : "—"}</td>
                          <td className={moyenne != null && moyenne < 10 ? "text-red-700 font-semibold" : "text-green-700"}>{moyenne == null ? "—" : `${moyenne.toFixed(2)}/20`}</td>
                        </tr>
                      );
                    })}
                    {elevesClasse.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-slate-400 py-3">
                          Aucun étudiant dans cette classe avec ces filtres.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {saisieProf && elevesTous.length > 0 && (
                <div className="card border-2 border-amber-300">
                  <h3 className="font-semibold mb-1">🔒 Clôture de la matière — notes d&apos;examen final</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    Attribuez la note d&apos;examen de chaque étudiant puis clôturez. L&apos;administration devra valider avant publication.
                  </p>
                  <ConfirmForm
                    action={actionFormulaire("/api/notes", searchParams)}
                    method="post"
                    message={`Clôturer ${matiere.code} et l'envoyer en validation ? Les notes actuelles ne seront plus modifiables.`}
                  >
                    <input type="hidden" name="action" value="cloturer" />
                    <input type="hidden" name="matiere_id" value={matiere.id} />
                    <div className="grid md:grid-cols-2 gap-3 mb-3">
                      {elevesTous.map((e: any) => (
                        <div key={e.id} className="flex items-center gap-3">
                          <span className="flex-1 text-sm font-medium">
                            {e.prenom} {e.nom}
                          </span>
                          <input className="input w-24" type="number" name={`note_${e.id}`} min="0" max="20" step="0.25" placeholder="/20" defaultValue={noteOf(e.id, "EXAM") ?? ""} />
                        </div>
                      ))}
                    </div>
                    <button className="btn-danger">Clôturer et envoyer à validation</button>
                  </ConfirmForm>
                </div>
              )}

              <div className="card overflow-x-auto">
                <h3 className="font-semibold mb-2">Détail des notes</h3>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Date</th>
                      {!etudiant && <th>Étudiant</th>}
                      <th>Type</th>
                      <th>Valeur</th>
                      {saisieProf && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {page.map((n) => (
                      <tr key={n.id}>
                        <td>{fmt(String(n.date))}</td>
                        {!etudiant && <td>{n.eleve}</td>}
                        <td>
                          <span className="badge-blue">{n.type}</span>
                        </td>
                        <td className="font-semibold">{n.valeur}/20</td>
                        {saisieProf && (
                          <td>
                            <div className="flex gap-2 flex-wrap">
                              <Modal titre={`Modifier la note ${n.type}`} bouton="Modifier" className="btn-ghost text-xs" confirmation="Enregistrer cette modification de note ?">
                                <form action={actionFormulaire("/api/notes", searchParams)} method="post">
                                  <ChampsNote note={n} eleves={elevesTous} matiereId={matiere.id} />
                                </form>
                              </Modal>
                              <ConfirmForm
                                action={actionFormulaire("/api/notes", searchParams)}
                                method="post"
                                className="inline"
                                message={`Supprimer la note ${n.type} de ${n.eleve} ?`}
                              >
                                <input type="hidden" name="action" value="delete" />
                                <input type="hidden" name="id" value={n.id} />
                                <button className="btn-danger text-xs">Retirer</button>
                              </ConfirmForm>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {page.length === 0 && (
                      <tr>
                        <td colSpan={saisieProf ? 5 : 4} className="text-center text-slate-400 py-3">
                          Aucune note sur cette matière et cette période.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <Pagination base="/notes" params={searchParams} etat={etat} />
              </div>
            </div>
          );
        })()}
    </div>
  );
}
