"use client";
import { useEffect, useState } from "react";
import EmploiTableau from "./EmploiTableau";
import type { SemaineEmploi } from "@/lib/hors-ligne";

type Compte = { prenom: string; nom: string; role: string; classe_nom: string | null };

type Capture = {
  captured_le: string;
  compte: Compte;
  semaine_courante: string;
  semaines: SemaineEmploi[];
};

const ROLE: Record<string, string> = { admin: "Administrateur", prof: "Professeur", etudiant: "Étudiant" };

export default function HorsLigneSemaines({ courante }: { courante: string }) {
  const [capture, setCapture] = useState<Capture | null>(null);
  const [choisie, setChoisie] = useState(courante);
  const [rien, setRien] = useState(false);

  useEffect(() => {
    let vivant = true;
    // En ligne la requête part au serveur ; sans connexion le service worker renvoie la capture.
    fetch("/api/offline-data", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivant) return;
        if (j?.semaines?.length) {
          setCapture(j);
          setChoisie(j.semaine_courante ?? courante);
        } else {
          setRien(true);
        }
      })
      .catch(() => vivant && setRien(true));
    return () => {
      vivant = false;
    };
  }, [courante]);

  if (rien) {
    return (
      <div className="card text-sm text-slate-500">
        Aucune capture sur cet appareil. Ouvre l&apos;application connectée (Wi-Fi activé) : l&apos;emploi du temps
        s&apos;enregistre tout seul, sans bouton.
      </div>
    );
  }

  if (!capture) return null;

  const nbCreneaux = capture.semaines.reduce(
    (n, s) => n + s.groupes.reduce((k, g) => k + g.lignes.length, 0),
    0
  );
  const autre = capture.semaines.find((s) => s.semaine === choisie);

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">📴 Capture enregistrée sur l&apos;appareil</h2>
          <p className="text-xs text-slate-500 mt-1">
            Compte conservé : <span className="font-semibold">{capture.compte.prenom} {capture.compte.nom}</span> ·{" "}
            {ROLE[capture.compte.role] ?? capture.compte.role}
            {capture.compte.classe_nom ? ` · ${capture.compte.classe_nom}` : ""} — sauvegardé le {capture.captured_le}
          </p>
        </div>
        <label className="text-xs text-slate-500">
          Semaine
          <select className="input mt-1" value={choisie} onChange={(e) => setChoisie(e.target.value)}>
            {capture.semaines.map((s) => (
              <option key={s.semaine} value={s.semaine}>
                {s.libelle_semaine}
                {s.semaine === capture.semaine_courante ? " (courante)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-500">
        {capture.semaines.length} semaine(s) de l&apos;année scolaire · {nbCreneaux} créneau(x) · consultable sans
        connexion.
      </p>

      {autre && choisie !== capture.semaine_courante && (
        <div className="space-y-3">
          {autre.groupes.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun cours planifié cette semaine-là.</p>
          ) : (
            autre.groupes.map((g) => (
              <div key={g.classe} className="space-y-2">
                <h3 className="font-bold text-indigo-800">🏫 {g.classe}</h3>
                <div className="overflow-x-auto">
                  <EmploiTableau lignes={g.lignes} />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
