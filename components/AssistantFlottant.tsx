"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AssistantChat from "./AssistantChat";
import type { Role } from "@/lib/auth";

/* L'assistant n'est plus un onglet : une bulle toujours visible, ouverte sur n'importe quel écran.
   Masquée sur /offline (hors connexion il ne peut pas répondre) et absente sans session. */
export default function AssistantFlottant({ prenom, role }: { prenom: string; role: Role }) {
  const pathname = usePathname();
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (pathname === "/offline") return null;

  return (
    <>
      {ouvert && (
        <section
          className="fixed z-40 inset-x-0 top-[6vh] bottom-0 rounded-t-2xl border border-slate-200 bg-white shadow-2xl
                     md:inset-x-auto md:right-6 md:bottom-24 md:w-[46rem] md:max-w-[calc(100vw-3rem)] md:rounded-2xl flex flex-col"
          aria-label="Assistant"
        >
          <header className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-200">
            <div>
              <h2 className="font-bold text-indigo-800">💬 Assistant</h2>
              <p className="text-xs text-slate-500">
                Lecture seule · {role === "etudiant" ? "ta classe et ton compte, jamais les autres" : "les données de ton compte"}
              </p>
            </div>
            <button
              onClick={() => setOuvert(false)}
              className="text-2xl leading-none text-slate-400 hover:text-slate-700 px-2"
              aria-label="Fermer l'assistant"
            >
              ×
            </button>
          </header>
          <div className="flex-1 min-h-0 flex flex-col p-3">
            <AssistantChat prenom={prenom} role={role} />
          </div>
        </section>
      )}
      <button
        onClick={() => setOuvert((v) => !v)}
        className={`fixed z-50 right-4 bottom-20 md:right-6 md:bottom-6 w-14 h-14 rounded-full bg-indigo-600 text-white text-2xl shadow-lg hover:bg-indigo-700 ${
          ouvert ? "hidden md:flex items-center justify-center" : "flex items-center justify-center"
        }`}
        aria-label={ouvert ? "Fermer l'assistant" : "Ouvrir l'assistant"}
      >
        {ouvert ? "×" : "💬"}
      </button>
    </>
  );
}
