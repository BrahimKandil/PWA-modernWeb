"use client";
import { useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/auth";

type Message = { role: "moi" | "arp"; texte: string; suggestions?: string[] };

const SUGGESTIONS: Record<Role, string[]> = {
  etudiant: [
    "Quel est mon prochain cours ?",
    "Mes notes et ma moyenne",
    "Fais-moi un plan de compte rendu pour mon prochain CR",
    "Explique-moi une notion de BDD avec un exemple",
    "Propose-moi un QCM d'entraînement sur ALGO",
    "Comment contester une note ?",
  ],
  prof: [
    "Mon emploi du temps de la semaine",
    "État des notes de mes matières",
    "Combien d'absences sur mes matières ?",
    "Propose-moi une trame de séance pour DEVWEB",
    "Quels CR dois-je corriger ?",
    "Comment clôturer une matière ?",
  ],
  admin: [
    "Emploi du temps de la semaine",
    "État des notes de l'établissement",
    "Réclamations déposées",
    "Propose-moi une synthèse de la semaine à diffuser",
    "Notifications récentes",
    "Comment valider une matière ?",
  ],
};

export default function AssistantChat({ prenom, role }: { prenom: string; role: Role }) {
  const suggestions = SUGGESTIONS[role];
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "arp",
      texte: `Bonjour ${prenom} ! Je suis l'assistant ARP. Écris ta question avec tes mots : tes cours, notes et absences, mais aussi un plan de compte rendu, une fiche de révision ou une notion à expliquer. Je lis tes données sans jamais les modifier.`,
    },
  ]);
  const [question, setQuestion] = useState("");
  const [occupé, setOccupé] = useState(false);
  const [compteur, setCompteur] = useState<{ source: "ia" | "local"; restant: number | null } | null>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  /* scrollIntoView ne fonctionne pas dans un panneau `fixed`, et le défilement « smooth » dépend des
     images du navigateur : on pose directement la barre, sinon la réponse reste hors écran. */
  useEffect(() => {
    const zone = zoneRef.current;
    if (zone) zone.scrollTop = zone.scrollHeight - zone.clientHeight;
  }, [messages, occupé]);

  async function envoyer(texte: string) {
    const propre = texte.trim();
    if (!propre || occupé) return;
    setQuestion("");
    setMessages((m) => [...m, { role: "moi", texte: propre }]);
    setOccupé(true);
    try {
      const historique = messages.map((m) => ({ role: m.role === "moi" ? "user" : "model", texte: m.texte }));
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: propre, historique }),
      });
      const data = await res.json();
      const propositions: string[] = Array.isArray(data.suggestions) ? data.suggestions.slice(0, 3) : [];
      setMessages((m) => [...m, { role: "arp", texte: String(data.reponse ?? "Pas de réponse."), suggestions: propositions }]);
      if (data.source) setCompteur({ source: data.source, restant: data.restant ?? null });
    } catch {
      setMessages((m) => [...m, { role: "arp", texte: "Connexion perdue avec le serveur. Réessaie quand le réseau revient." }]);
    } finally {
      setOccupé(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      <div className="card !p-0 overflow-hidden flex flex-col flex-1 min-h-0">
        <div ref={zoneRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "moi" ? "flex justify-end" : "flex flex-col items-start gap-1.5"}>
              <div
                className={
                  m.role === "moi"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 text-white px-3 py-2 text-sm whitespace-pre-line"
                    : "max-w-[92%] rounded-2xl rounded-bl-sm bg-white border border-slate-200 px-3 py-2 text-sm whitespace-pre-line text-slate-800"
                }
              >
                {m.texte}
              </div>
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-1">
                  {m.suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => envoyer(s)}
                      disabled={occupé}
                      className="text-xs rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {/* Les questions de départ défilent avec la conversation : la zone de lecture garde toute la hauteur. */}
          <div className="pt-1">
            <p className="text-xs font-semibold text-slate-500">Questions prêtes à l&apos;emploi</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => envoyer(s)}
                  disabled={occupé}
                  className="text-xs rounded-full border border-slate-300 px-3 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {occupé && <div className="text-xs text-slate-500 pl-1">L'assistant cherche…</div>}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            envoyer(question);
          }}
          className="border-t border-slate-200 p-3 flex gap-2 bg-white"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ta question…"
            className="input flex-1"
            disabled={occupé}
          />
          <button className="btn" disabled={occupé || !question.trim()}>
            Envoyer
          </button>
        </form>
      </div>
      <p className="text-xs text-slate-500 shrink-0">
        {compteur?.source === "ia"
          ? `Réponse rédigée par le modèle Gemini d'après les données de ton compte${
              compteur.restant != null ? ` · ${compteur.restant} question(s) IA restante(s) aujourd'hui` : ""
            }.`
          : compteur?.source === "local"
            ? "Réponse calculée par les règles internes de l'application (modèle IA indisponible ou quota du jour atteint)."
            : "L'assistant lit uniquement les données accessibles à ton compte — jamais celles d'un autre élève."}{" "}
        Il a besoin du réseau : hors ligne, seule l&apos;emploi du temps enregistré reste consultable.
      </p>
    </div>
  );
}
