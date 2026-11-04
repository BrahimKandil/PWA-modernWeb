"use client";
import { ReactNode, useRef } from "react";

/* Bouton -> fenetre -> formulaire. Le fond de page reste le pattern du projet :
   un simple <form method="post"> qui renvoie un 303. Le modal n'ajoute que l'affichage,
   et `confirmation` fait passer la soumission par un « oui » explicite. */
export default function Modal({
  titre,
  bouton,
  children,
  confirmation,
  className = "btn-primary",
}: {
  titre: string;
  bouton: ReactNode;
  children: ReactNode;
  confirmation?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const ouvrir = () => ref.current?.showModal();
  const fermer = () => ref.current?.close();

  return (
    <>
      <button type="button" className={className} onClick={ouvrir}>
        {bouton}
      </button>
      <dialog
        ref={ref}
        className="rounded-2xl bg-transparent p-0 backdrop:bg-slate-900/60"
        onClick={(e) => {
          if (e.target === ref.current) fermer();
        }}
      >
        <div
          className="bg-white border border-slate-200 rounded-2xl shadow-xl w-[min(94vw,660px)] max-h-[86vh] overflow-y-auto"
          onSubmitCapture={
            confirmation
              ? (e) => {
                  if (!window.confirm(confirmation)) e.preventDefault();
                }
              : undefined
          }
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 sticky top-0 bg-white">
            <h2 className="font-semibold">{titre}</h2>
            <button type="button" className="btn-ghost text-xs" onClick={fermer}>
              ✕ Fermer
            </button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </dialog>
    </>
  );
}
