import { findDocs } from "@/lib/db";
import { exiger, peut } from "@/lib/permissions";
import { actionFormulaire, anneesDe, classesDeAnnee, choixAnnee, lien, valeur, type Parametres } from "@/lib/filtres";
import { aujourdhui, libelle, lundiDe, samediDe, semainePrecedente, semaineSuivante, verrouillee } from "@/lib/semaine";
import Modal from "@/components/Modal";
import ConfirmForm from "@/components/ConfirmForm";
import PrintButton from "@/components/PrintButton";
import { BarreFiltres, SelectFiltre } from "@/components/Filtres";

export const dynamic = "force-dynamic";

const JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"];

export default async function EmploisPage({ searchParams }: { searchParams: Parametres }) {
  const session = await exiger("emplois");
  const peutEcrire = peut(session.role, "emplois", "creer");

  const [toutesClasses, emplois, toutesMatieres, salles] = await Promise.all([
    findDocs("classes", {}, { sort: { nom: 1 } }),
    findDocs("emplois"),
    findDocs("matieres"),
    findDocs("salles", {}, { sort: { nom: 1 } }),
  ]);

  const annee = choixAnnee(searchParams, toutesClasses);
  let classesVue = classesDeAnnee(toutesClasses, annee);
  if (session.role === "etudiant") classesVue = classesVue.filter((c: any) => c.id === session.classe_id);

  // Une semaine se designe par son lundi : un jour choisi au milieu est ramene au debut de la semaine.
  const semaine = lundiDe(valeur(searchParams, "semaine") || aujourdhui());
  const classeId = session.role === "etudiant" ? session.classe_id ?? -1 : Number(valeur(searchParams, "classe_id")) || classesVue[0]?.id || -1;
  const salleFiltre = Number(valeur(searchParams, "salle_id")) || 0;

  const codeMatiere = new Map(toutesMatieres.map((m: any) => [m.id, m]));
  const nomSalle = new Map(salles.map((s: any) => [s.id, s.nom]));
  const classe = classesVue.find((c: any) => c.id === classeId) ?? toutesClasses.find((c: any) => c.id === classeId);

  const tous = (emplois as any[]).filter((e) => e.classe_id === classeId && e.semaine_debut === semaine);
  const slots = (salleFiltre ? tous.filter((e) => e.salle_id === salleFiltre) : tous).map((e: any) => ({
    ...e,
    code: codeMatiere.get(e.matiere_id)?.code ?? "?",
    matiere: codeMatiere.get(e.matiere_id)?.nom ?? "?",
    salle: nomSalle.get(e.salle_id) ?? "?",
  }));
  const get = (jour: string, creneau: number) => slots.find((x) => x.jour === jour && x.creneau === creneau);

  const matieresClasse = (toutesMatieres as any[])
    .filter((m) => m.classe_id === classeId)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));

  // Regle de semaine : modifiable jusqu'au vendredi, figee par le samedi de la semaine concernee.
  const verrou = verrouillee(semaine);
  const dejaRemplie = tous.length > 0;
  const samedi = new Date(`${samediDe(semaine)}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const messageConfirmation = `Confirmer la modification de l'emploi du temps de ${classe?.nom ?? "cette classe"} — ${libelle(semaine)} ?\n\nLes ${tous.length} créneau(x) déjà enregistré(s) seront remplacés par ceux-ci.`;

  const champs = (
    <>
      <input type="hidden" name="action" value="save-week" />
      <input type="hidden" name="classe_id" value={classeId} />
      <input type="hidden" name="semaine_debut" value={semaine} />
      <div className="grid md:grid-cols-5 gap-3">
        {JOURS.map((jour) => (
          <div key={jour} className="border border-slate-200 rounded-lg p-2">
            <h3 className="font-bold text-xs text-indigo-700 mb-2">{jour}</h3>
            {[1, 2].map((creneau) => {
              const c = get(jour, creneau);
              return (
                <div key={creneau} className="mb-2">
                  <label className="label">{creneau === 1 ? "Matin 9h-12h" : "Après-midi 13h-16h"}</label>
                  <select className="input mb-1" name={`${jour}_${creneau}_matiere`} defaultValue={c?.matiere_id ?? ""}>
                    <option value="">Libre</option>
                    {matieresClasse.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code}
                      </option>
                    ))}
                  </select>
                  <select className="input" name={`${jour}_${creneau}_salle`} defaultValue={c?.salle_id ?? ""}>
                    <option value="">Salle…</option>
                    {salles.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.nom}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Maximum 2 matières par jour (matin 3 h / après-midi 3 h). Laisser vide = jour libre.
      </p>
      <button className="btn-primary">Enregistrer la semaine</button>
    </>
  );

  const formAction = actionFormulaire("/api/emplois", searchParams);

  return (
    <div className="space-y-4 print:bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🗓️ Emploi du temps — {classe?.nom ?? "Aucune classe"}</h1>
          <p className="text-sm text-slate-500">
            {libelle(semaine)} · 2 matières max par jour, 3 h par matière ·{" "}
            {peutEcrire ? "modifiable jusqu'au vendredi, figée par le samedi" : "consultation"} · export PDF (nécessite une connexion)
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          {peutEcrire && classe && !verrou && (
            <Modal
              titre={`Définir l'emploi de la semaine — ${classe.nom}`}
              bouton="✏️ Créer / modifier la semaine"
              confirmation={dejaRemplie ? messageConfirmation : undefined}
            >
              <form action={formAction} method="post" className="space-y-3">
                {champs}
              </form>
              <form action={formAction} method="post" className="mt-3">
                <input type="hidden" name="action" value="copy-prev" />
                <input type="hidden" name="classe_id" value={classeId} />
                <input type="hidden" name="semaine_debut" value={semaine} />
                <button className="btn-ghost text-xs">Copier la semaine précédente</button>
              </form>
            </Modal>
          )}
          <a className="btn-primary" href={`/api/emplois/pdf?classe_id=${classeId}&semaine=${semaine}`} download>
            ⬇️ Télécharger en PDF
          </a>
          <PrintButton />
        </div>
      </div>

      {searchParams.error && <div className="badge-red w-fit print:hidden">Erreur : {String(searchParams.error)}</div>}
      {searchParams.ok && <div className="badge-green w-fit print:hidden">{String(searchParams.ok)}</div>}

      {session.role === "etudiant" && !session.classe_id && (
        <p className="text-sm text-amber-700">Vous n&apos;êtes affecté à aucune classe. Contactez l&apos;administration.</p>
      )}

      <BarreFiltres
        base="/emplois"
        params={searchParams}
        caches={session.role === "etudiant" ? { classe_id: String(classeId) } : {}}
        note={
          <span className="flex flex-wrap gap-2 items-center">
            <a className="btn-ghost text-xs" href={lien("/emplois", searchParams, { semaine: semainePrecedente(semaine) })}>
              ← semaine d&apos;avant
            </a>
            <a className="btn-ghost text-xs" href={lien("/emplois", searchParams, { semaine: semaineSuivante(semaine) })}>
              semaine d&apos;après →
            </a>
            <span>Choisir n&apos;importe quel jour d&apos;une semaine ramène à son lundi.</span>
          </span>
        }
      >
        <SelectFiltre label="Année" name="annee" value={annee} options={anneesDe(toutesClasses).map((a) => ({ valeur: a, libelle: a }))} />
        {session.role !== "etudiant" && (
          <SelectFiltre
            label="Classe"
            name="classe_id"
            value={String(classeId)}
            options={classesVue.map((c: any) => ({ valeur: String(c.id), libelle: c.nom }))}
          />
        )}
        <div className="min-w-[170px] grow md:grow-0">
          <label className="label">Semaine</label>
          <input className="input" type="date" name="semaine" defaultValue={semaine} />
        </div>
        <SelectFiltre
          label="Salle (filtrage)"
          name="salle_id"
          value={salleFiltre ? String(salleFiltre) : ""}
          vide="Toutes les salles"
          options={salles.map((s: any) => ({ valeur: String(s.id), libelle: s.nom }))}
        />
      </BarreFiltres>

      <div className="card overflow-x-auto">
        <table className="data w-full">
          <thead>
            <tr>
              <th className="w-28">Horaire</th>
              {JOURS.map((j) => (
                <th key={j}>{j}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2].map((creneau) => (
              <tr key={creneau}>
                <td className="font-semibold text-slate-600">{creneau === 1 ? "09:00 – 12:00" : "13:00 – 16:00"}</td>
                {JOURS.map((jour) => {
                  const c = get(jour, creneau);
                  return (
                    <td key={jour} className="align-top min-w-36">
                      {c ? (
                        <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-2 text-xs">
                          <div className="font-bold text-indigo-800">{c.code}</div>
                          <div>{c.matiere}</div>
                          <div className="text-slate-500">Salle {c.salle}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {salleFiltre && (
          <p className="text-xs text-slate-500 mt-2">
            Filtré sur la salle {nomSalle.get(salleFiltre)} : {slots.length} créneau(x) cette semaine.
          </p>
        )}
      </div>

      {peutEcrire && classe && verrou && (
        <div className="card print:hidden">
          <h2 className="font-semibold mb-1">🔒 Week-end commencé — emploi du temps verrouillé</h2>
          <p className="text-sm text-slate-600">
            {libelle(semaine)} est figée depuis le {samedi} : la semaine est finie, on peut la consulter et la
            télécharger en PDF, mais plus la modifier.
          </p>
          <p className="text-sm text-slate-600 mt-2">
            <a
              className="btn-primary"
              href={lien("/emplois", searchParams, { semaine: semaineSuivante(semaine) })}
            >
              Préparer la semaine d&apos;après →
            </a>
          </p>
        </div>
      )}

      {!peutEcrire && (
        <p className="text-xs text-slate-500 print:hidden">
          Consultation seule : seul l&apos;administration définit les emplois du temps. Changez de semaine avec les
          flèches pour voir la suite.
        </p>
      )}
    </div>
  );
}
