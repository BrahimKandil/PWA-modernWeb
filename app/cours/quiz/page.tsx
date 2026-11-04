import Link from "next/link";
import { redirect } from "next/navigation";
import { findOne } from "@/lib/db";
import { exiger } from "@/lib/permissions";
import { actionFormulaire, type Parametres } from "@/lib/filtres";
import { corriger, type Question } from "@/lib/qcm";

export const dynamic = "force-dynamic";

export default async function QuizPage({ searchParams }: { searchParams: Parametres }) {
  const session = await exiger("cours");
  // Le quiz se passe une seule fois : personne d'autre qu'un élève n'a d'affichage ici.
  if (session.role !== "etudiant") redirect("/cours");

  const matiereId = Number(searchParams.matiere_id) || 0;
  const coursId = Number(searchParams.cours_id) || 0;
  const global = String(searchParams.global ?? "") === "1";

  const matiere = matiereId ? await findOne("matieres", { id: matiereId }) : null;
  if (!matiere || matiere.classe_id !== session.classe_id) redirect("/cours");
  const cours = coursId && !global ? await findOne("cours", { id: coursId }) : null;
  if (coursId && !global && (!cours || cours.matiere_id !== matiere.id)) redirect("/cours");

  const cle = global ? `global:${matiere.id}` : `chapitre:${cours!.id}`;
  const titre = global ? `QCM global — ${matiere.code}` : `Chapitre ${cours!.numero} — ${cours!.titre}`;
  const retour = global ? `/cours?matiere_id=${matiere.id}` : `/cours/${cours!.id}?matiere_id=${matiere.id}`;

  const copie = await findOne("quiz_passations", { etudiant_id: session.id, cle });
  const questions = ((copie?.questions ?? []) as Question[]).map((q) => ({ ...q }));
  const filtres = { matiere_id: String(matiere.id), cours_id: String(coursId || ""), global: global ? "1" : "" };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        <Link href={retour} className="hover:underline">
          ← {global ? "Cours" : "Chapitre"}
        </Link>{" "}
        · {matiere.code} — {matiere.nom}
      </p>
      <h1 className="text-2xl font-bold">🎯 {titre}</h1>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {String(searchParams.error)}</div>}

      {!copie && (
        <div className="card space-y-3 max-w-2xl">
          <p className="text-sm">
            Le questionnaire est fabriqué à partir des passages indexés de ce chapitre — ni l’IA ni les règles ne sortent du cours
            déposé par ton professeur. Une fois lancé, tu ne peux le rendre qu’une seule fois.
          </p>
          <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
            <li>{global ? 8 : 6} questions à réponse unique</li>
            <li>Note sur 20, visible tout de suite avec le détail des réponses</li>
            <li>Aucune incidence sur la moyenne de {matiere.code} : ce quiz mesure une compétence</li>
          </ul>
          <form action={actionFormulaire("/api/cours/quiz", filtres)} method="post">
            <input type="hidden" name="action" value="demarrer" />
            <input type="hidden" name="matiere_id" value={matiere.id} />
            <input type="hidden" name="cours_id" value={coursId || ""} />
            <input type="hidden" name="global" value={global ? "1" : ""} />
            <button className="btn-primary">Commencer le quiz</button>
          </form>
        </div>
      )}

      {copie && !copie.soumis && (
        <form action={actionFormulaire("/api/cours/quiz", filtres)} method="post" className="space-y-4">
          <input type="hidden" name="action" value="soumettre" />
          <input type="hidden" name="matiere_id" value={matiere.id} />
          <input type="hidden" name="cours_id" value={coursId || ""} />
          <input type="hidden" name="global" value={global ? "1" : ""} />
          <div className="card !p-0 overflow-hidden">
            {questions.map((q, i) => (
              <fieldset key={i} className="p-4 border-b border-slate-100 last:border-0">
                <legend className="font-medium text-sm">
                  {i + 1}. {q.enonce}
                </legend>
                <div className="mt-2 space-y-1.5">
                  {q.options.map((o, j) => (
                    <label key={j} className="flex gap-2 items-start text-sm rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                      <input type="radio" name={`reponse_${i}`} value={j} className="mt-1" />
                      <span>{o}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <button className="btn-primary">Rendre ma copie</button>
            <span className="text-xs text-slate-500">
              Copie prête ({copie.source === "ia" ? "questions rédigées par le modèle d’après ton cours" : "questions construites sur les phrases du cours"}) —
              aucune question ne sort du chapitre.
            </span>
          </div>
        </form>
      )}

      {copie?.soumis &&
        (() => {
          const resultat = corriger(questions, copie.reponses ?? []);
          return (
            <>
              <div className="card flex flex-wrap items-center gap-4">
                <div className="text-3xl font-bold">{resultat.note}/20</div>
                <div className="text-sm text-slate-600">
                  {resultat.justes} bonne(s) réponse(s) sur {resultat.total} · rendu le {copie.fini_le ?? copie.cree_le}
                  <div className="text-xs text-slate-400">Note de compétence, jamais mélangée aux notes de {matiere.code}.</div>
                </div>
                <span className={resultat.note >= 12 ? "badge-green" : "badge-amber"}>
                  {resultat.note >= 12 ? "Chapitre maîtrisé" : "Reprends le chapitre, puis le cours reste consultable"}
                </span>
              </div>

              <div className="card !p-0 overflow-hidden">
                {resultat.lignes.map((l, i) => (
                  <div key={i} className="p-4 border-b border-slate-100 last:border-0">
                    <p className="font-medium text-sm">
                      {i + 1}. {l.question.enonce}
                    </p>
                    <div className="mt-2 space-y-1 text-sm">
                      {l.question.options.map((o, j) => {
                        const estBonne = j === l.question.bonne;
                        const estChoisie = j === l.choisie;
                        return (
                          <div
                            key={j}
                            className={
                              estBonne
                                ? "rounded-lg bg-green-50 border border-green-200 px-3 py-1.5"
                                : estChoisie
                                  ? "rounded-lg bg-red-50 border border-red-200 px-3 py-1.5"
                                  : "px-3 py-1.5 text-slate-600"
                            }
                          >
                            {estBonne ? "✅ " : estChoisie ? "❌ " : ""}
                            {o}
                            {estChoisie && !estBonne && <span className="text-xs text-slate-500"> (ta réponse)</span>}
                          </div>
                        );
                      })}
                      {l.choisie == null && <p className="text-xs text-amber-600 px-3">Sans réponse.</p>}
                    </div>
                  </div>
                ))}
              </div>
              <Link href={retour} className="btn-ghost">
                ← Retour au cours
              </Link>
            </>
          );
        })()}
    </div>
  );
}
