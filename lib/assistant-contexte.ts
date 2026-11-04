import { findDocs } from "./db";
import type { SessionUser } from "./auth";
import { aujourdhui, lundiDe } from "./semaine";

/* Snapshot des donnees accessibles AU COMPTE APPELANT. C'est la seule chose que le modele voit :
   un objet qu'il ne recoit pas ne peut pas etre devoile. Budget ~4000 caracteres. */

function nom(u: any) {
  return `${u.prenom} ${u.nom}`;
}

async function semaine(session: SessionUser, debut: string) {
  const [emplois, matieres, salles, classes, usagers] = await Promise.all([
    findDocs("emplois", { semaine_debut: debut }),
    findDocs("matieres"),
    findDocs("salles"),
    findDocs("classes"),
    findDocs("users"),
  ]);
  const mp = new Map(matieres.map((m) => [m.id, m]));
  const sp = new Map(salles.map((s) => [s.id, s]));
  const cp = new Map(classes.map((c) => [c.id, c]));
  const up = new Map(usagers.map((u) => [u.id, u]));

  const lignes = emplois
    .filter((e) => {
      const m = mp.get(e.matiere_id);
      if (!m) return false;
      if (session.role === "prof") return m.prof_id === session.id;
      if (session.role === "etudiant") return m.classe_id === session.classe_id;
      return true;
    })
    .map((e) => {
      const m = mp.get(e.matiere_id);
      const prof = m?.prof_id ? up.get(m.prof_id) : null;
      return `  ${String(e.jour).slice(0, 3)} ${e.heure_debut}-${e.heure_fin} ${m!.code}${
        session.role === "admin" ? ` (${cp.get(e.classe_id)?.nom ?? "?"})` : ""
      } salle ${sp.get(e.salle_id)?.nom ?? "?"}${prof ? ` prof ${nom(prof)}` : ""}`;
    })
    .slice(0, 60);
  return { lignes, matieres, salles, classes, usagers, emplois };
}

export async function contexte(session: SessionUser): Promise<string> {
  const aujourd = aujourdhui();
  const cetteSemaine = lundiDe(aujourd);
  const block: string[] = [];

  block.push(
    `COMPTE QUI PARLE : ${nom(session)} · role ${session.role} · id ${session.id}` +
      (session.classe_id ? ` · sa classe id ${session.classe_id}` : "") +
      ` · nous sommes le ${aujourd}`
  );

  const [semaineCourante, notes, presences, devoirs, depots, reclamations, notifications] = await Promise.all([
    semaine(session, cetteSemaine),
    findDocs("notes"),
    findDocs("presences"),
    findDocs("cr_assignments"),
    findDocs("cr_depots"),
    findDocs("reclamations", {}, { sort: { cree_le: -1 }, limit: 40 }),
    findDocs("notifications", {}, { sort: { cree_le: -1 }, limit: 5 }),
  ]);
  const { matieres, salles, classes, usagers, lignes } = semaineCourante;
  const mp = new Map(matieres.map((m) => [m.id, m]));
  const cp = new Map(classes.map((c) => [c.id, c]));

  block.push(
    `EMPLOI DU TEMPS semaine du ${cetteSemaine} (aujourdhui ${aujourd}):\n${
      lignes.length ? lignes.join("\n") : "  aucun cours"
    }`
  );

  const mesMatieres = matieres.filter((m) =>
    session.role === "prof" ? m.prof_id === session.id : session.role === "etudiant" ? m.classe_id === session.classe_id : true
  );
  block.push(
    `MATIERES accessibles (${mesMatieres.length}):\n` +
      mesMatieres
        .slice(0, 30)
        .map(
          (m) =>
            `  ${m.code} ${m.nom} · coef ${m.coefficient} · ${m.heures}h · ${cp.get(m.classe_id)?.nom ?? "classe ?"} · statut ${m.statut} · prof ${
              m.prof_id ? nom(usagers.find((u) => u.id === m.prof_id) ?? { prenom: "?", nom: "" }) : "non assigne"
            }`
        )
        .join("\n")
  );

  if (session.role === "etudiant") {
    const miennes = notes.filter((n) => n.etudiant_id === session.id);
    const par = new Map<number, number[]>();
    for (const n of miennes) par.set(n.matiere_id, [...(par.get(n.matiere_id) ?? []), n.valeur]);
    const valides = [...par.entries()].filter(([id]) => mp.get(id)?.statut === "valide");
    const moyenne = valides.length
      ? valides.reduce((s, [id, v]) => s + (v.reduce((a, b) => a + b, 0) / v.length) * (mp.get(id)?.coefficient ?? 1), 0) /
        valides.reduce((s, [id]) => s + (mp.get(id)?.coefficient ?? 1), 0)
      : null;
    const mesPts = presences.filter((p) => p.etudiant_id === session.id);
    block.push(
      `MES NOTES : ${[...par.entries()].map(([id, v]) => `${mp.get(id)?.code ?? "?"} ${v.join("/")}${mp.get(id)?.statut === "valide" ? "" : " (non validee)"}`).join(" · ") || "aucune note publiee"}` +
        `\nMA MOYENNE GENERALE (matieres validees) : ${moyenne == null ? "pas encore calculable" : moyenne.toFixed(2) + "/20"}` +
        `\nMES POINTAGES : ${mesPts.length} seances · present ${mesPts.filter((p) => p.statut === "present").length} · retard ${mesPts.filter((p) => p.statut === "retard").length} · absent ${mesPts.filter((p) => p.statut === "absent").length}`
    );
  } else if (session.role === "prof") {
    const ids = new Set(mesMatieres.map((m) => m.id));
    const vues = notes.filter((n) => ids.has(n.matiere_id));
    const pts = presences.filter((p) => ids.has(p.matiere_id));
    block.push(
      `NOTES SAISIES SUR MES MATIERES : ${[...ids]
        .map((id) => {
          const ns = vues.filter((n) => n.matiere_id === id);
          return `${mp.get(id)?.code} ${ns.length ? (ns.reduce((s, n) => s + n.valeur, 0) / ns.length).toFixed(2) : "-"}`;
        })
        .join(" · ")}` +
        `\nPOINTAGES SUR MES MATIERES : ${pts.length} · present ${pts.filter((p) => p.statut === "present").length} · retard ${pts.filter((p) => p.statut === "retard").length} · absent ${pts.filter((p) => p.statut === "absent").length} · dernier jour ${pts.map((p) => p.date).sort().pop() ?? "aucun"}`
    );
  } else {
    block.push(
      `Etablissement : ${usagers.filter((u) => u.role === "etudiant").length} etudiants · ${
        usagers.filter((u) => u.role === "prof").length
      } professeurs · ${usagers.filter((u) => u.role === "admin").length} admins · ${classes.length} classes · ${
        matieres.length
      } matieres · ${salles.length} salles · ${notes.length} notes · ${presences.length} pointages`
    );
  }

  const ciblesDevoirs = devoirs.filter((c) =>
    session.role === "prof" ? c.prof_id === session.id : session.role === "etudiant" ? mesMatieres.some((m) => m.id === c.matiere_id) : true
  );
  block.push(
    `COMPTES RENDUS (${ciblesDevoirs.length}):\n` +
      (ciblesDevoirs
        .slice(0, 20)
        .map((c) => {
          const ns = depots.filter((d) => d.assignment_id === c.id);
          const mien = session.role === "etudiant" ? ns.find((d) => d.etudiant_id === session.id) : null;
          return `  ${c.titre} (${mp.get(c.matiere_id)?.code ?? "?"}) limite ${c.date_limite}${c.date_limite < aujourd ? " · DEPASSEE" : ""}${
            session.role === "etudiant" ? (mien ? ` · rendu${mien.note == null ? "" : " note " + mien.note}` : " · PAS RENDU") : ` · ${ns.length} depot(s)`
          }`;
        })
        .join("\n") || "  aucun")
  );

  const miennes = session.role === "admin" ? reclamations : reclamations.filter((r) => r.user_id === session.id);
  block.push(
    `RECLAMATIONS (${miennes.length}):\n` +
      (miennes
        .slice(0, 12)
        .map((r) => `  [${r.statut}] ${r.objet} (${r.type}) le ${r.cree_le}${session.role === "admin" ? ` par ${nom(usagers.find((u) => u.id === r.user_id) ?? { prenom: "?", nom: "" })}` : ""}`)
        .join("\n") || "  aucune")
  );

  block.push(`NOTIFICATIONS:\n${notifications.map((n) => `  ${n.titre} — ${n.message} (${n.cree_le})`).join("\n") || "  aucune"}`);
  if (session.role === "admin") {
    block.push(`SALLES:\n${salles.map((s) => `  ${s.nom} (${s.batiment}, ${s.capacite} places, ${s.type})`).join("\n")}`);
  }

  return block.join("\n\n").slice(0, 4200);
}
