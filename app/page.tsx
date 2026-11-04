import { findDocs } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { aujourdhui as cejour, lundiDe } from "@/lib/semaine";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: { erreur?: string } }) {
  const session = await requireSession();
  const semaine = lundiDe(cejour());
  const aujourdhui = cejour();

  const [usagers, classes, matieres, toutesEmplois, salles, presences, reclamations, devoirs, rendus, notifs] = await Promise.all([
    findDocs("users"),
    findDocs("classes"),
    findDocs("matieres"),
    findDocs("emplois"),
    findDocs("salles"),
    findDocs("presences"),
    findDocs("reclamations"),
    findDocs("cr_assignments"),
    findDocs("cr_depots"),
    findDocs("notifications", {}, { sort: { cree_le: -1 }, limit: 3 }),
  ]);
  const devoirParId = new Map(devoirs.map((a: any) => [a.id, a]));
  const matiereParId = new Map(matieres.map((m: any) => [m.id, m]));
  const salleParId = new Map(salles.map((s: any) => [s.id, s]));
  const classeParId = new Map(classes.map((c: any) => [c.id, c]));

  const cards: { icon: string; label: string; value: string | number; href?: string; accent?: string }[] = [];

  if (session.role === "admin") {
    const nbEtudiants = usagers.filter((u: any) => u.role === "etudiant" && u.actif === 1).length;
    const nbProfs = usagers.filter((u: any) => u.role === "prof" && u.actif === 1).length;
    const nbClasses = classes.length;
    const aValider = matieres.filter((m: any) => m.statut === "termine").length;
    const nonActive = usagers.filter((u: any) => !u.mot_de_passe && u.role !== "admin").length;
    cards.push(
      { icon: "🎓", label: "Étudiants", value: nbEtudiants, href: "/users" },
      { icon: "👔", label: "Professeurs", value: nbProfs, href: "/users" },
      { icon: "🏫", label: "Classes", value: nbClasses, href: "/classes" },
      { icon: "⏳", label: "Matières à valider", value: aValider, href: "/matieres", accent: aValider > 0 ? "text-amber-600" : "" },
      { icon: "📧", label: "Comptes non activés", value: nonActive, href: "/emails", accent: nonActive > 0 ? "text-red-600" : "" }
    );
  } else if (session.role === "prof") {
    const miennes = matieres.filter((m: any) => m.prof_id === session.id);
    const mesMatieres = miennes.length;
    const mesClasses = new Set(miennes.map((m: any) => m.classe_id));
    const aCorriger = rendus.filter((d: any) => {
      const a = devoirParId.get(d.assignment_id);
      return d.note == null && a?.prof_id === session.id && a.date_limite < aujourdhui;
    }).length;
    const mesEleves = usagers.filter((u: any) => u.role === "etudiant" && u.actif === 1 && mesClasses.has(u.classe_id)).length;
    const clôturées = miennes.filter((m: any) => m.statut !== "en_cours").length;
    cards.push(
      { icon: "📚", label: "Mes matières", value: mesMatieres, href: "/matieres" },
      { icon: "🎓", label: "Mes étudiants", value: mesEleves },
      { icon: "✍️", label: "CR à corriger", value: aCorriger, href: "/comptes-rendus", accent: aCorriger > 0 ? "text-amber-600" : "" },
      { icon: "🔒", label: "Matières clôturées", value: clôturées, href: "/notes" }
    );
  } else {
    const nbAbsences = presences.filter((p: any) => p.etudiant_id === session.id && p.statut === "absent").length;
    const mesMatieres = matieres.filter((m: any) => m.classe_id === (session.classe_id ?? -1)).length;
    const mesRendus = new Set(rendus.filter((d: any) => d.etudiant_id === session.id).map((d: any) => d.assignment_id));
    const crOuverts = devoirs.filter((a: any) => {
      const m = matiereParId.get(a.matiere_id);
      return m?.classe_id === (session.classe_id ?? -1) && a.date_limite >= aujourdhui && !mesRendus.has(a.id);
    }).length;
    const mesReclamations = reclamations.filter((r: any) => r.user_id === session.id).length;
    cards.push(
      { icon: "📚", label: "Mes matières", value: mesMatieres, href: "/matieres" },
      { icon: "🕒", label: "Absences", value: nbAbsences, href: "/presences", accent: nbAbsences > 0 ? "text-red-600" : "" },
      { icon: "📄", label: "CR à déposer", value: crOuverts, href: "/comptes-rendus", accent: crOuverts > 0 ? "text-amber-600" : "" },
      { icon: "⚠️", label: "Mes réclamations", value: mesReclamations, href: "/reclamations" }
    );
  }

  // Emploi de la semaine (visible tous rôles — aussi servi hors ligne)
  const emplois = (
    session.role === "etudiant"
      ? toutesEmplois.filter((e: any) => e.classe_id === (session.classe_id ?? -1))
      : toutesEmplois
  )
    .filter((e: any) => e.semaine_debut === semaine)
    .map((e: any) => ({
      jour: e.jour,
      creneau: e.creneau,
      heure_debut: e.heure_debut,
      heure_fin: e.heure_fin,
      code: matiereParId.get(e.matiere_id)?.code ?? "?",
      nom: matiereParId.get(e.matiere_id)?.nom ?? "?",
      salle: salleParId.get(e.salle_id)?.nom ?? "?",
      classe: classeParId.get(e.classe_id)?.nom ?? "?",
    }))
    .sort((a: any, b: any) => String(a.jour).localeCompare(String(b.jour)) || a.creneau - b.creneau);
  const jours = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"];

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

      <div className="card flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-52">
          <h2 className="font-semibold">📴 Mode hors ligne</h2>
          <p className="text-sm text-slate-500">
            L&apos;emploi du temps de ton compte est enregistré sur l&apos;appareil automatiquement, a chaque page
            ouverte en ligne — semaine courante et toutes les semaines de l&apos;annee. Aucun bouton a presser.
          </p>
        </div>
        <Link href="/offline" className="btn-ghost">Voir la capture</Link>
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
