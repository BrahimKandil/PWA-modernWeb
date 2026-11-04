import { redirect } from "next/navigation";
import { getSession, type Role } from "./auth";

/* Une seule table de droits pour tout l'application : les pages appellent exiger(),
   les routes API appellent peut() avant d'ecrire. La propriete (un prof ne touche que
   SES matieres, un etudiant QUE son propre depot) est verifiee en plus, action par action. */

export type Module =
  | "utilisateurs" | "classes" | "emails" | "salles" | "matieres" | "emplois"
  | "presences" | "notes" | "comptes_rendus" | "reclamations" | "notifications" | "assistant" | "cours";

export type Verbe = "voir" | "creer" | "modifier" | "supprimer";

type Droits = Partial<Record<Verbe, true>>;

const TOUT: Droits = { voir: true, creer: true, modifier: true, supprimer: true };
const CONSULTER: Droits = { voir: true };
const CREER_MODIFIER: Droits = { voir: true, creer: true, modifier: true };
// L'eleve « cree » sur ce module : uniquement sa passation de quiz, jamais le chapitre lui-meme.
const CONSULTER_DEPOSER: Droits = { voir: true, creer: true };

export const MATRICE: Record<Role, Record<Module, Droits>> = {
  admin: {
    utilisateurs: TOUT,
    classes: TOUT,
    emails: TOUT,
    salles: TOUT,
    matieres: TOUT,
    emplois: CREER_MODIFIER,
    notifications: TOUT,
    reclamations: CONSULTER,
    presences: CONSULTER,
    notes: CONSULTER,
    comptes_rendus: CONSULTER,
    assistant: CONSULTER,
    cours: {}, // les supports de cours ne regardent que les profs et les eleves
  },
  prof: {
    comptes_rendus: TOUT,
    reclamations: TOUT,
    cours: TOUT,
    presences: CREER_MODIFIER,
    notes: CREER_MODIFIER,
    classes: CONSULTER,
    emails: CONSULTER,
    salles: CONSULTER,
    matieres: CONSULTER,
    emplois: CONSULTER,
    notifications: CONSULTER,
    assistant: CONSULTER,
    utilisateurs: {},
  },
  etudiant: {
    comptes_rendus: TOUT,
    reclamations: TOUT,
    cours: CONSULTER_DEPOSER,
    presences: CONSULTER,
    notes: CONSULTER,
    classes: CONSULTER,
    emails: CONSULTER,
    salles: CONSULTER,
    matieres: CONSULTER,
    emplois: CONSULTER,
    notifications: CONSULTER,
    assistant: CONSULTER,
    utilisateurs: {},
  },
};

export function peut(role: Role, module: Module, verbe: Verbe = "voir"): boolean {
  return !!MATRICE[role]?.[module]?.[verbe];
}

export const peutVoir = (role: Role, module: Module) => peut(role, module, "voir");

// Garde d ecran : connecté + droit sur ce module, sinon retour a l accueil avec le motif.
export async function exiger(module: Module, verbe: Verbe = "voir") {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!peut(session.role, module, verbe)) redirect("/?erreur=acces+refuse");
  return session;
}

// Ce que le role a le droit de faire sur un ecran, pour l'afficher en toutes lettres.
export function resumeDroits(role: Role, module: Module): string {
  const verbs = (["creer", "modifier", "supprimer"] as Verbe[]).filter((v) => peut(role, module, v));
  return verbs.length === 0 ? "consultation" : verbs.join(" · ");
}
