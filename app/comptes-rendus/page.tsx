import { findDocs } from "@/lib/db";
import { exiger } from "@/lib/permissions";
import { actionFormulaire, anneesDe, classesDeAnnee, choixAnnee, nombre, valeur, type Parametres } from "@/lib/filtres";
import { aujourdhui } from "@/lib/semaine";
import Modal from "@/components/Modal";
import ConfirmForm from "@/components/ConfirmForm";
import Stats from "@/components/Stats";
import { BarreFiltres, SelectFiltre } from "@/components/Filtres";

export const dynamic = "force-dynamic";

const parNom = (a: any, b: any) => String(a.nom).localeCompare(String(b.nom)) || String(a.prenom).localeCompare(String(b.prenom));

function ChampsDepot({ assignmentId, contenu }: { assignmentId: number; contenu?: string }) {
  return (
    <>
      <input type="hidden" name="action" value="depot" />
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <textarea className="input" name="contenu" rows={4} defaultValue={contenu} placeholder="Votre compte rendu (objectifs, étapes, résultats)…" required />
      <button className="btn-primary">Déposer</button>
    </>
  );
}

export default async function ComptesRendusPage({ searchParams }: { searchParams: Parametres }) {
  const session = await exiger("comptes_rendus");
  const estAdmin = session.role === "admin";
  const estProf = session.role === "prof";
  const estudiant = session.role === "etudiant";
  const today = aujourdhui();

  const [assignments, depots, matieres, toutesClasses, usagers] = await Promise.all([
    findDocs("cr_assignments", {}, { sort: { date_limite: -1 } }),
    findDocs("cr_depots"),
    findDocs("matieres", {}, { sort: { code: 1 } }),
    findDocs("classes", {}, { sort: { nom: 1 } }),
    findDocs("users"),
  ]);
  const matiereParId = new Map((matieres as any[]).map((m) => [m.id, m]));
  const personneParId = new Map((usagers as any[]).map((u) => [u.id, u]));

  const annee = choixAnnee(searchParams, toutesClasses);
  let classesVue = classesDeAnnee(toutesClasses, annee);
  if (estProf) classesVue = classesVue.filter((c: any) => matieres.some((m: any) => m.classe_id === c.id && m.prof_id === session.id));
  if (estudiant) classesVue = classesVue.filter((c: any) => c.id === session.classe_id);

  const classeId = estudiant ? session.classe_id ?? 0 : nombre(searchParams, "classe_id");
  const classe = classesVue.find((c: any) => c.id === classeId);

  const matiereId = nombre(searchParams, "matiere_id");
  const eleveFiltre = nombre(searchParams, "etudiant_id");
  const etatFiltre = valeur(searchParams, "etat");

  const matieresClasse = (matieres as any[]).filter((m) => m.classe_id === classeId).filter((m) => (estProf ? m.prof_id === session.id : true));
  const elevesTous = (usagers as any[]).filter((u) => u.role === "etudiant" && u.classe_id === classeId && u.actif === 1).sort(parNom);

  const mesDepots = (idAss: number) => depots.filter((d: any) => d.assignment_id === idAss && (!eleveFiltre || d.etudiant_id === eleveFiltre));
  const monDepot = (idAss: number) => (depots as any[]).find((d) => d.assignment_id === idAss && d.etudiant_id === session.id);

  let visibles = (assignments as any[])
    .filter((a) => {
      const m = matiereParId.get(a.matiere_id);
      return m && m.classe_id === classeId && (!matiereId || a.matiere_id === matiereId);
    })
    .filter((a) => (estProf ? a.prof_id === session.id : true))
    .map((a) => ({ ...a, matiere: matiereParId.get(a.matiere_id), prof: personneParId.get(a.prof_id) }));

  if (estudiant) {
    visibles = visibles.filter((a) => {
      const dep = !!monDepot(a.id);
      if (etatFiltre === "rendu") return dep;
      if (etatFiltre === "non_rendu") return !dep;
      return true;
    });
  } else if (etatFiltre === "rendu" || etatFiltre === "non_rendu") {
    visibles = visibles.filter((a) => (etatFiltre === "rendu" ? mesDepots(a.id).length > 0 : mesDepots(a.id).length === 0));
  }

  const totalDepots = visibles.reduce((s, a) => s + (estudiant ? (monDepot(a.id) ? 1 : 0) : mesDepots(a.id).length), 0);
  const notesDonnees = visibles.reduce((s, a) => s + (estudiant ? (monDepot(a.id)?.note != null ? 1 : 0) : mesDepots(a.id).filter((d) => d.note != null).length), 0);

  const mesMatieresProf = (matieres as any[]).filter((m) => m.prof_id === session.id && m.statut === "en_cours").sort(parNom);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">📄 {estudiant ? "Mes comptes rendus" : estProf ? "Comptes rendus" : "Comptes rendus (consultation)"}</h1>
          <p className="text-sm text-slate-500">
            {estudiant
              ? "Déposez, modifiez ou retirez votre rendu tant que la matière est en cours et la date limite non dépassée. Vous voyez la note et le retour du professeur."
              : estProf
                ? "Créez des comptes rendus sur vos matières, corrigez les dépôts et attribuez une note à chaque travail."
                : "Consultation seule des comptes rendus et des dépôts. Filtrez par année, classe, matière et étudiant."}
          </p>
        </div>
        {estProf && mesMatieresProf.length > 0 && (
          <Modal titre="Nouveau compte rendu" bouton="＋ Créer un compte rendu" confirmation="Créer ce compte rendu et l'ouvrir aux dépôts ?">
            <form action={actionFormulaire("/api/comptes-rendus", searchParams)} method="post" className="space-y-3">
              <input type="hidden" name="action" value="create" />
              <div>
                <label className="label">Titre</label>
                <input className="input" name="titre" placeholder="CR TP…" required />
              </div>
              <div>
                <label className="label">Matière (une de vos matières en cours)</label>
                <select className="input" name="matiere_id" defaultValue={matiereId || mesMatieresProf[0]?.id} required>
                  {mesMatieresProf.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.code} — {m.nom}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Date limite de dépôt</label>
                <input className="input" type="date" name="date_limite" min={today} defaultValue={today} required />
              </div>
              <div>
                <label className="label">Consigne</label>
                <textarea className="input" name="consigne" rows={3} placeholder="Ce que les étudiants doivent rédiger…" required />
              </div>
              <button className="btn-primary">Créer</button>
            </form>
          </Modal>
        )}
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {String(searchParams.error)}</div>}
      {searchParams.ok && <div className="badge-green w-fit">{String(searchParams.ok)}</div>}

      <BarreFiltres
        base="/comptes-rendus"
        params={searchParams}
        note={
          estudiant
            ? "Filtrez vos comptes rendus par matière et par dépôt effectué ou non."
            : classe
              ? `Classe ${classe.nom} · ${visibles.length} compte(s) rendu(s) · ${totalDepots} dépôt(s).`
              : "Aucune donnée tant qu'une classe n'est pas sélectionnée."
        }
      >
        {!estudiant && <SelectFiltre label="Année scolaire" name="annee" value={annee} options={anneesDe(toutesClasses).map((a) => ({ valeur: a, libelle: a }))} />}
        {!estudiant && (
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
          options={matieresClasse.map((m: any) => ({ valeur: String(m.id), libelle: `${m.code} — ${m.nom}` }))}
          large
        />
        {!estudiant && (
          <SelectFiltre
            label="Étudiant"
            name="etudiant_id"
            value={eleveFiltre ? String(eleveFiltre) : ""}
            vide="Tous les étudiants"
            options={elevesTous.map((u: any) => ({ valeur: String(u.id), libelle: `${u.prenom} ${u.nom}` }))}
            large
          />
        )}
        <SelectFiltre
          label={estudiant ? "Dépôt" : "Comptes rendus"}
          name="etat"
          value={etatFiltre}
          vide={estudiant ? "Tous" : "Tous les CR"}
          options={estudiant ? [
            { valeur: "rendu", libelle: "Déposés" },
            { valeur: "non_rendu", libelle: "Non déposés" },
          ] : [
            { valeur: "rendu", libelle: "Ayant au moins un dépôt" },
            { valeur: "non_rendu", libelle: "Sans dépôt" },
          ]}
        />
      </BarreFiltres>

      {!estudiant && !classe && (
        <div className="card text-sm text-slate-500">Choisissez une année puis une classe pour afficher les comptes rendus.</div>
      )}

      {estudiant && !classe && <div className="card text-sm text-slate-500">Votre compte n&apos;est rattaché à aucune classe. Contactez l&apos;administration.</div>}

      {(estudiant ? classe : classe) && (
        <Stats
          cartes={[
            { label: "Comptes rendus", valeur: visibles.length, ton: "bleu" },
            { label: estudiant ? "Mes dépôts" : "Dépôts reçus", valeur: totalDepots, ton: "vert" },
            { label: estudiant ? "Notes reçues" : "Dépôts notés", valeur: notesDonnees },
            { label: "À rendre", valeur: estudiant ? visibles.filter((a) => !monDepot(a.id) && a.date_limite >= today).length : visibles.filter((a) => a.date_limite >= today).length, ton: "ambre" },
          ]}
        />
      )}

      <div className="space-y-4">
        {estudiant &&
          visibles.map((a) => {
            const d = monDepot(a.id);
            const ouvert = a.date_limite >= today && a.matiere?.statut === "en_cours";
            return (
              <div key={a.id} className="card space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{a.titre}</h2>
                    <p className="text-xs text-slate-500">
                      {a.matiere?.code} — {a.matiere?.nom} · limite : {a.date_limite}
                    </p>
                  </div>
                  <span className={`badge-${d ? "green" : ouvert ? "blue" : "red"}`}>{d ? "Déposé ✅" : ouvert ? "Ouvert — à déposer" : "Expiré sans dépôt"}</span>
                </div>
                <p className="text-sm text-slate-600">{a.consigne}</p>

                {d?.note != null && (
                  <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm">
                    <span className="font-bold">Note : {d.note}/20</span>
                    {d.feedback && <p className="text-slate-600 mt-1">Retour : {d.feedback}</p>}
                  </div>
                )}

                {!d && ouvert && (
                  <form action={actionFormulaire("/api/comptes-rendus", searchParams)} method="post" className="space-y-2">
                    <ChampsDepot assignmentId={a.id} />
                  </form>
                )}
                {!d && !ouvert && <p className="text-sm text-slate-400">Dépôt fermé (date limite dépassée ou matière clôturée).</p>}

                {d && (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm space-y-2">
                    <p className="text-xs text-slate-400">Votre dépôt du {d.rendu_le} :</p>
                    <p className="whitespace-pre-wrap">{d.contenu}</p>
                    {ouvert && d.note == null && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Modal titre="Modifier mon dépôt" bouton="Modifier" className="btn-ghost text-xs" confirmation="Remplacer le contenu de votre dépôt ?">
                          <form action={actionFormulaire("/api/comptes-rendus", searchParams)} method="post" className="space-y-2">
                            <input type="hidden" name="action" value="update_depot" />
                            <input type="hidden" name="id" value={d.id} />
                            <textarea className="input" name="contenu" rows={4} defaultValue={d.contenu} required />
                            <button className="btn-primary">Enregistrer</button>
                          </form>
                        </Modal>
                        <ConfirmForm action={actionFormulaire("/api/comptes-rendus", searchParams)} method="post" className="inline" message="Retirer votre dépôt ?">
                          <input type="hidden" name="action" value="delete_depot" />
                          <input type="hidden" name="id" value={d.id} />
                          <button className="btn-danger text-xs">Retirer le dépôt</button>
                        </ConfirmForm>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

        {!estudiant &&
          visibles.map((a) => {
            const siens = mesDepots(a.id).slice().sort(parNom);
            const expired = a.date_limite < today;
            const corrige = estProf && a.prof_id === session.id;
            return (
              <div key={a.id} className="card space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{a.titre}</h2>
                    <p className="text-xs text-slate-500">
                      {a.matiere?.code} — {a.matiere?.nom}
                      {estAdmin && a.prof ? ` · ${a.prof.prenom} ${a.prof.nom}` : ""} · limite : {a.date_limite} · {mesDepots(a.id).length} dépôt(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge-${expired ? "amber" : "blue"}`}>{expired ? "Expiration — correction" : "En cours de dépôt"}</span>
                    {corrige && (
                      <ConfirmForm action={actionFormulaire("/api/comptes-rendus", searchParams)} method="post" className="inline" message={`Supprimer « ${a.titre} » et tous ses dépôts ?`}>
                        <input type="hidden" name="action" value="delete" />
                        <input type="hidden" name="id" value={a.id} />
                        <button className="btn-danger text-xs">Supprimer le CR</button>
                      </ConfirmForm>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-600">{a.consigne}</p>

                {siens.map((d: any) => {
                  const u = personneParId.get(d.etudiant_id);
                  return (
                    <div key={d.id} className="rounded-lg border border-slate-200 p-3 text-sm space-y-2">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-semibold">
                          {u?.prenom} {u?.nom}
                        </span>
                        <span className="text-xs text-slate-400">Rendu le {d.rendu_le}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-slate-600">{d.contenu}</p>
                      {d.note != null ? (
                        <div className="badge-green w-fit">
                          Note : {d.note}/20{d.feedback ? ` — ${d.feedback}` : ""}
                        </div>
                      ) : corrige ? (
                        <form action={actionFormulaire("/api/comptes-rendus", searchParams)} method="post" className="flex flex-wrap gap-2 items-end">
                          <input type="hidden" name="action" value="noter" />
                          <input type="hidden" name="depot_id" value={d.id} />
                          <div>
                            <label className="label">Note /20</label>
                            <input className="input w-24" type="number" name="note" min="0" max="20" step="0.5" required />
                          </div>
                          <div className="flex-1 min-w-40">
                            <label className="label">Retour (optionnel)</label>
                            <input className="input" name="feedback" placeholder="Bon travail, pensez à…" />
                          </div>
                          <button className="btn-primary text-xs">Noter</button>
                        </form>
                      ) : (
                        <span className="text-xs text-slate-400">Non noté</span>
                      )}
                    </div>
                  );
                })}
                {siens.length === 0 && <p className="text-xs text-slate-400">{eleveFiltre ? "Aucun dépôt pour cet étudiant." : "Aucun dépôt."}</p>}
              </div>
            );
          })}

        {visibles.length === 0 && (
          <div className="card text-sm text-slate-500">
            {classe ? `Aucun compte rendu pour cette classe${matiereId ? " et cette matière" : ""}.` : "Sélectionnez une classe pour voir les comptes rendus."}
          </div>
        )}
      </div>
    </div>
  );
}
