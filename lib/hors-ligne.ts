import type { SessionUser } from "@/lib/auth";
import { findDocs } from "@/lib/db";
import { anneeCourante } from "@/lib/filtres";
import { aujourdhui, libelle, lundiDe } from "@/lib/semaine";

export type LigneEmploi = {
  jour: string;
  creneau: number;
  code: string;
  matiere: string;
  salle: string;
  prof: string | null;
};

export type GroupeEmploi = { classe: string; lignes: LigneEmploi[] };

export type SemaineEmploi = {
  semaine: string;
  libelle_semaine: string;
  groupes: GroupeEmploi[];
};

// La semaine courante se calcule en fuseau local : toISOString la décalerait d'un jour.
export const semaineCourante = () => lundiDe(aujourdhui());

// Fenetre de l'annee scolaire : du lundi qui suit la rentree (aout) au 31 juillet suivant.
function bornesAnneeScolaire(annee: string) {
  const debut = Number(annee.slice(0, 4));
  return { mini: lundiDe(`${debut}-08-01`), maxi: `${debut + 1}-07-31` };
}

// Tous les creneaux que le compte a le droit de voir, regroupes par semaine puis par classe.
export async function emploisDuCompte(session: SessionUser): Promise<SemaineEmploi[]> {
  const [emplois, matieres, salles, classes, usagers] = await Promise.all([
    findDocs("emplois"),
    findDocs("matieres"),
    findDocs("salles"),
    findDocs("classes"),
    findDocs("users"),
  ]);
  const matiereParId = new Map(matieres.map((m: any) => [m.id, m]));
  const nomSalle = new Map(salles.map((s: any) => [s.id, s.nom]));
  const classeParId = new Map(classes.map((c: any) => [c.id, c]));
  const nomProf = new Map(usagers.map((u: any) => [u.id, `${u.prenom} ${u.nom}`]));

  const annee = anneeCourante();
  const { mini, maxi } = bornesAnneeScolaire(annee);

  const lignes = (emplois as any[])
    .filter((e) => String(e.semaine_debut) >= mini && String(e.semaine_debut) <= maxi)
    .map((e: any) => {
      const m = matiereParId.get(e.matiere_id);
      const classe = classeParId.get(e.classe_id);
      return {
        semaine: String(e.semaine_debut),
        classeNom: classe?.nom ?? "?",
        classe_id: e.classe_id,
        prof_id: m?.prof_id ?? null,
        annee_classe: classe?.annee ?? annee,
        ligne: {
          jour: e.jour,
          creneau: e.creneau,
          code: m?.code ?? "?",
          matiere: m?.nom ?? "?",
          salle: nomSalle.get(e.salle_id) ?? "?",
          prof: m?.prof_id ? nomProf.get(m.prof_id) ?? null : null,
        } as LigneEmploi,
      };
    })
    .filter((l) => {
      if (l.annee_classe !== annee) return false;
      if (session.role === "etudiant") return l.classe_id === (session.classe_id ?? -1);
      if (session.role === "prof") return l.prof_id === session.id;
      return true;
    });

  const parSemaine = new Map<string, Map<string, LigneEmploi[]>>();
  for (const l of lignes) {
    if (!parSemaine.has(l.semaine)) parSemaine.set(l.semaine, new Map());
    const groupes = parSemaine.get(l.semaine)!;
    if (!groupes.has(l.classeNom)) groupes.set(l.classeNom, []);
    groupes.get(l.classeNom)!.push(l.ligne);
  }

  const semaines = [...parSemaine.keys()];
  const courante = semaineCourante();
  if (!semaines.includes(courante)) semaines.push(courante);

  return semaines
    .sort()
    .map((semaine) => ({
      semaine,
      libelle_semaine: libelle(semaine),
      groupes: [...(parSemaine.get(semaine) ?? new Map<string, LigneEmploi[]>()).entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([classe, lignesClasse]) => ({ classe, lignes: lignesClasse })),
    }));
}
