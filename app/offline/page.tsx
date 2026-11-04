export const dynamic = "force-dynamic";

import { getSession } from "@/lib/auth";
import { emploisDuCompte, semaineCourante } from "@/lib/hors-ligne";
import { libelle } from "@/lib/semaine";
import EmploiTableau from "@/components/EmploiTableau";
import HorsLigneSemaines from "@/components/HorsLigneSemaines";

// Ecran unique du mode hors ligne : l'emploi du temps du compte capture par le service worker.
export default async function OfflinePage() {
  const courante = semaineCourante();

  let session: any = null;
  let groupes: { classe: string; lignes: any[] }[] = [];
  try {
    session = await getSession();
    if (session) {
      const semaines = await emploisDuCompte(session);
      groupes = semaines.find((s) => s.semaine === courante)?.groupes ?? [];
    }
  } catch {
    // Base injoignable : la capture deja en memoire sur l'appareil reste consultable.
  }

  const titre =
    session?.role === "admin"
      ? "Tous les emplois du temps"
      : session?.role === "prof"
        ? "Mes cours"
        : "Mon emploi du temps";

  return (
    <div className="min-h-[70vh] py-6 px-3">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="card text-center space-y-2">
          <div className="text-4xl">📡</div>
          <h1 className="text-xl font-bold">Vous êtes hors ligne</h1>
          <p className="text-sm text-slate-500">
            Seul l&apos;emploi du temps est disponible sans connexion · <span className="font-semibold">{titre}</span>
            <span className="block font-semibold mt-1">{libelle(courante)}</span>
          </p>
        </div>

        {groupes.length === 0 ? (
          <div className="card text-center text-sm text-slate-500">
            Aucun cours enregistré pour cette semaine.
            {session?.role === "etudiant" && !session?.classe_id ? " Vous n'êtes affecté à aucune classe." : ""}
            {!session ? " Ouvre l'application connectée une fois : la capture se fera toute seule." : ""}
          </div>
        ) : (
          groupes.map((g) => (
            <div key={g.classe} className="card space-y-2">
              <h2 className="font-bold text-indigo-800">🏫 {g.classe}</h2>
              <div className="overflow-x-auto">
                <EmploiTableau lignes={g.lignes} />
              </div>
            </div>
          ))
        )}

        <HorsLigneSemaines courante={courante} />

        <p className="text-xs text-slate-400 text-center">
          La sauvegarde se fait automatiquement a chaque page ouverte connectee — aucun bouton a presser.
        </p>
        <div className="text-center">
          <a href="/" className="btn-primary inline-flex">Reconnexion — réessayer</a>
        </div>
      </div>
    </div>
  );
}
