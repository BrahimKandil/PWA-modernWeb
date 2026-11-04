import Link from "next/link";
import { notFound } from "next/navigation";
import { findOne, findDocs } from "@/lib/db";
import { exiger } from "@/lib/permissions";
import { actionFormulaire, type Parametres } from "@/lib/filtres";
import Modal from "@/components/Modal";
import ConfirmForm from "@/components/ConfirmForm";
import { MIN_TEXTE_CHAPITRE } from "@/lib/cours";

export const dynamic = "force-dynamic";

export default async function ChapitrePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Parametres;
}) {
  const session = await exiger("cours");
  const prof = session.role === "prof";
  const id = Number(params.id);
  const cours = id ? await findOne("cours", { id }) : null;
  if (!cours) notFound();

  const matiere = await findOne("matieres", { id: cours.matiere_id });
  if (!matiere) notFound();
  if (prof && matiere.prof_id !== session.id) notFound();
  if (!prof && matiere.classe_id !== session.classe_id) notFound();

  const [chapitres, passages, copie] = await Promise.all([
    findDocs("cours", { matiere_id: matiere.id }, { sort: { numero: 1 } }),
    findDocs("cours_passages", { cours_id: cours.id }, { sort: { index: 1 } }),
    findOne("quiz_passations", { etudiant_id: session.id, cle: `chapitre:${cours.id}` }),
  ]);
  const rang = chapitres.findIndex((c: any) => c.id === cours.id);
  const prec = chapitres[rang - 1];
  const suivi = chapitres[rang + 1];
  const semantique = passages.some((p: any) => (p.vecteur?.length ?? 0) > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">
            <Link href={`/cours?matiere_id=${matiere.id}`} className="hover:underline">
              📗 Cours
            </Link>{" "}
            · {matiere.code} — {matiere.nom}
          </p>
          <h1 className="text-2xl font-bold mt-1">
            Chapitre {cours.numero} — {cours.titre}
          </h1>
          <p className="text-sm text-slate-500">
            <span className={cours.terme ? "badge-green" : "badge-amber"}>{cours.terme ? "Chapitre terminé — quiz ouvert" : "Chapitre en cours — quiz fermé"}</span>
            <span className="ml-2">
              {passages.length} passage(s) indexé(s) · recherche {semantique ? "sémantique (index Gemini)" : "par mots-clés"}
            </span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {cours.fichier_nom && (
            <a href={`/api/cours/fichier?id=${cours.id}`} className="btn-ghost">
              ⬇️ {cours.fichier_type === "pdf" ? "PDF" : "Word"}
            </a>
          )}
          {prof && (
            <>
              <Modal titre={`Modifier le chapitre ${cours.numero}`} bouton="✏️ Modifier" confirmation="Enregistrer et ré-indexer ce chapitre ?">
                <form action={actionFormulaire("/api/cours", { matiere_id: String(matiere.id) })} method="post" encType="multipart/form-data">
                  <input type="hidden" name="action" value="update" />
                  <input type="hidden" name="id" value={cours.id} />
                  <input type="hidden" name="matiere_id" value={matiere.id} />
                  <input type="hidden" name="numero" value={cours.numero} />
                  <div className="grid gap-3">
                    <div>
                      <label className="label">Titre</label>
                      <input className="input" name="titre" defaultValue={cours.titre} required />
                    </div>
                    <div>
                      <label className="label">Nouveau support (.docx ou .pdf)</label>
                      <input className="input" type="file" name="fichier" accept=".docx,.pdf" />
                      <p className="text-xs text-slate-500 mt-1">Actuel : {cours.fichier_nom ?? "texte collé"}. Laisse vide pour garder le fichier.</p>
                    </div>
                    <div>
                      <label className="label">Texte du chapitre</label>
                      <textarea className="input min-h-[240px] font-mono text-xs" name="texte" defaultValue={String(cours.texte ?? "").slice(0, 4000)} />
                      <p className="text-xs text-slate-500 mt-1">
                        Minimum {MIN_TEXTE_CHAPITRE} caractères pour que le quiz puisse être généré.
                      </p>
                    </div>
                    <button className="btn-primary justify-center">Enregistrer et ré-indexer</button>
                  </div>
                </form>
              </Modal>
              <ConfirmForm
                action={actionFormulaire("/api/cours", { matiere_id: String(matiere.id) })}
                method="post"
                className="inline"
                message={cours.terme ? "Rouvrir ce chapitre ? Son quiz sera fermé." : "Marquer ce chapitre terminé et ouvrir son quiz à la classe ?"}
              >
                <input type="hidden" name="action" value={cours.terme ? "rouvrir" : "terminer"} />
                <input type="hidden" name="id" value={cours.id} />
                <button className={cours.terme ? "btn-ghost" : "btn-primary"}>{cours.terme ? "Rouvrir le chapitre" : "Marquer terminé"}</button>
              </ConfirmForm>
            </>
          )}
        </div>
      </div>

      {searchParams.error && <div className="badge-red w-fit">Erreur : {String(searchParams.error)}</div>}

      {!prof && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-indigo-200">
          <div>
            <h2 className="font-semibold">🎯 Quiz de compétence — chapitre {cours.numero}</h2>
            <p className="text-xs text-slate-500">
              6 questions fabriquées à partir de ce chapitre, une seule tentative, note sur 20 sans effet sur la moyenne de {matiere.code}.
              {copie?.soumis ? ` Ta note : ${copie.note}/20 (${copie.justes}/${copie.total} bonnes réponses).` : ""}
            </p>
          </div>
          {copie?.soumis ? (
            <Link href={`/cours/quiz?matiere_id=${matiere.id}&cours_id=${cours.id}`} className="btn-ghost">
              Revoir ma copie
            </Link>
          ) : cours.terme ? (
            <Link href={`/cours/quiz?matiere_id=${matiere.id}&cours_id=${cours.id}`} className="btn-primary">
              {copie ? "Reprendre le quiz" : "Passer le quiz"}
            </Link>
          ) : (
            <span className="badge-amber">Quiz fermé</span>
          )}
        </div>
      )}

      <article className="card whitespace-pre-wrap text-[0.925rem] leading-relaxed max-h-[70vh] overflow-y-auto">{cours.texte}</article>

      <div className="flex justify-between gap-2 text-sm">
        {prec ? (
          <Link href={`/cours/${prec.id}?matiere_id=${matiere.id}`} className="btn-ghost">
            ← Chapitre {prec.numero}
          </Link>
        ) : (
          <span />
        )}
        {suivi ? (
          <Link href={`/cours/${suivi.id}?matiere_id=${matiere.id}`} className="btn-ghost">
            Chapitre {suivi.numero} →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
