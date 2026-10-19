import { getDb } from "@/lib/db";
import { getSession, mondayOf } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: { erreur?: string } }) {
  const session = getSession()!;
  const db = getDb();
  const semaine = mondayOf();

  const cards: { icon: string; label: string; value: string | number; href?: string; accent?: string }[] = [];

  if (session.role === "admin") {
    const nbEtudiants = (db.prepare(`SELECT COUNT(*) c FROM users WHERE role='etudiant' AND actif=1`).get() as any).c;
    const nbProfs = (db.prepare(`SELECT COUNT(*) c FROM users WHERE role='prof' AND actif=1`).get() as any).c;
    const nbClasses = (db.prepare(`SELECT COUNT(*) c FROM classes`).get() as any).c;
    const aValider = (db.prepare(`SELECT COUNT(*) c FROM matieres WHERE statut='termine'`).get() as any).c;
    const nonActive = (db.prepare(`SELECT COUNT(*) c FROM users WHERE mot_de_passe IS NULL AND role!='admin'`).get() as any).c;
    cards.push(
      { icon: "🎓", label: "Étudiants", value: nbEtudiants, href: "/users" },
      { icon: "👔", label: "Professeurs", value: nbProfs, href: "/users" },
      { icon: "🏫", label: "Classes", value: nbClasses, href: "/classes" },
      { icon: "⏳", label: "Matières à valider", value: aValider, href: "/matieres", accent: aValider > 0 ? "text-amber-600" : "" },
      { icon: "📧", label: "Comptes non activés", value: nonActive, href: "/emails", accent: nonActive > 0 ? "text-red-600" : "" }
    );
  } else if (session.role === "prof") {
    const mesMatieres = (db.prepare(`SELECT COUNT(*) c FROM matieres WHERE prof_id=?`).get(session.id) as any).c;
    const aCorriger = (db.prepare(
      `SELECT COUNT(*) c FROM cr_depots d JOIN cr_assignments a ON a.id=d.assignment_id
       WHERE a.prof_id=? AND d.note IS NULL AND a.date_limite < date('now','localtime')`
    ).get(session.id) as any).c;
    const mesEleves = (db.prepare(
      `SELECT COUNT(DISTINCT u.id) c FROM users u JOIN matieres m ON m.classe_id=u.classe_id
       WHERE m.prof_id=? AND u.role='etudiant' AND u.actif=1`
    ).get(session.id) as any).c;
    const clôturées = (db.prepare(`SELECT COUNT(*) c FROM matieres WHERE prof_id=? AND statut!='en_cours'`).get(session.id) as any).c;
    cards.push(
      { icon: "📚", label: "Mes matières", value: mesMatieres, href: "/matieres" },
      { icon: "🎓", label: "Mes étudiants", value: mesEleves },
      { icon: "✍️", label: "CR à corriger", value: aCorriger, href: "/comptes-rendus", accent: aCorriger > 0 ? "text-amber-600" : "" },
      { icon: "🔒", label: "Matières clôturées", value: clôturées, href: "/notes" }
    );
  } else {
    const nbAbsences = (db.prepare(`SELECT COUNT(*) c FROM presences WHERE etudiant_id=? AND statut='absent'`).get(session.id) as any).c;
    const mesMatieres = (db.prepare(`SELECT COUNT(*) c FROM matieres WHERE classe_id=?`).get(session.classe_id ?? -1) as any).c;
    const crOuverts = (db.prepare(
      `SELECT COUNT(*) c FROM cr_assignments a JOIN matieres m ON m.id=a.matiere_id
       WHERE m.classe_id=? AND a.date_limite >= date('now','localtime')
       AND NOT EXISTS (SELECT 1 FROM cr_depots d WHERE d.assignment_id=a.id AND d.etudiant_id=?)`
    ).get(session.classe_id ?? -1, session.id) as any).c;
    const mesReclamations = (db.prepare(`SELECT COUNT(*) c FROM reclamations WHERE user_id=?`).get(session.id) as any).c;
    cards.push(
      { icon: "📚", label: "Mes matières", value: mesMatieres, href: "/matieres" },
      { icon: "🕒", label: "Absences", value: nbAbsences, href: "/presences", accent: nbAbsences > 0 ? "text-red-600" : "" },
      { icon: "📄", label: "CR à déposer", value: crOuverts, href: "/comptes-rendus", accent: crOuverts > 0 ? "text-amber-600" : "" },
      { icon: "⚠️", label: "Mes réclamations", value: mesReclamations, href: "/reclamations" }
    );
  }

  // Emploi de la semaine (visible tous rôles — aussi servi hors ligne)
  const classeFiltre = session.role === "etudiant" ? "AND e.classe_id = ?" : "";
  const params = session.role === "etudiant" ? [semaine, session.classe_id ?? -1] : [semaine];
  const emplois = db
    .prepare(
      `SELECT e.jour, e.creneau, e.heure_debut, e.heure_fin, m.code, m.nom, s.nom salle, c.nom classe
       FROM emplois e JOIN matieres m ON m.id=e.matiere_id JOIN salles s ON s.id=e.salle_id JOIN classes c ON c.id=e.classe_id
       WHERE e.semaine_debut=? ${classeFiltre} ORDER BY e.jour, e.creneau`
    )
    .all(...params) as any[];
  const jours = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"];

  const notifs = db.prepare(`SELECT * FROM notifications ORDER BY cree_le DESC LIMIT 3`).all() as any[];

  return (
    <div className="space-y-6">
      {searchParams.erreur && (
        <div className="badge-red w-fit">⛔ Accès refusé : cette page est réservée à l&apos;administration.</div>
      )}
      <div>
        <h1 className="text-2xl font-bold">Bonjour {session.prenom} 👋</h1>
        <p className="text-sm text-slate-500">
          {session.role === "admin" ? "Tableau de bord administration" : session.role === "prof" ? "Vos affectations et travaux à corriger" : `Classe ${session.classe_nom ?? "—"} — votre semaine en un coup d&apos;œil (aussi disponible hors ligne).`}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href ?? "#"} className={`card hover:border-indigo-300 transition ${c.href ? "" : "pointer-events-none"}`}>
            <div className="text-2xl">{c.icon}</div>
            <div className={`text-2xl font-bold mt-1 ${c.accent ?? ""}`}>{c.value}</div>
            <div className="text-xs text-slate-500">{c.label}</div>
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">🗓️ Emploi du temps de la semaine</h2>
          <Link href="/emplois" className="text-sm text-indigo-600 hover:underline">Voir tout →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="data min-w-150">
            <thead><tr><th></th>{jours.map((j) => <th key={j}>{j.slice(0, 3)}</th>)}</tr></thead>
            <tbody>
              {[1, 2].map((cr) => (
                <tr key={cr}>
                  <td className="whitespace-nowrap text-xs font-semibold text-slate-500">{cr === 1 ? "09:00–12:00" : "13:00–16:00"}</td>
                  {jours.map((j) => {
                    const c = emplois.find((e) => e.jour === j && e.creneau === cr);
                    return (
                      <td key={j}>
                        {c ? (
                          <div>
                            <span className="font-semibold">{c.code}</span>
                            <div className="text-xs text-slate-500">{c.classe} · {c.salle}</div>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {emplois.length === 0 && <p className="text-sm text-slate-400 mt-2">Aucun cours planifié cette semaine.</p>}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">🔔 Dernières notifications</h2>
          <Link href="/notifications" className="text-sm text-indigo-600 hover:underline">Tout voir →</Link>
        </div>
        <div className="space-y-2">
          {notifs.map((n) => (
            <div key={n.id} className="border-b border-slate-100 pb-2 last:border-0">
              <p className="font-medium text-sm">{n.titre}</p>
              <p className="text-xs text-slate-500">{n.message} · {n.cree_le}</p>
            </div>
          ))}
          {notifs.length === 0 && <p className="text-sm text-slate-400">Aucune notification.</p>}
        </div>
      </div>
    </div>
  );
}
