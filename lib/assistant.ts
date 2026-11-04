import { findDocs } from "./db";
import { mondayOf, todayISO } from "./auth";
import type { SessionUser } from "./auth";

const JOURS = ["DIMANCHE", "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];
const ORDRE = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE"];

const idx = (jour: string) => {
  const i = ORDRE.indexOf(String(jour).toUpperCase());
  return i === -1 ? 99 : i;
};

type Ligne = {
  jour: string;
  creneau: number;
  heure_debut: string;
  heure_fin: string;
  code: string;
  matiere: string;
  prof: string;
  classe: string;
  salle: string;
  salle_id: number;
  matiere_id: number;
};

async function mesLignes(session: SessionUser, semaine: string): Promise<Ligne[]> {
  const [emplois, matieres, salles, classes, usagers] = await Promise.all([
    findDocs("emplois", { semaine_debut: semaine }),
    findDocs("matieres"),
    findDocs("salles"),
    findDocs("classes"),
    findDocs("users"),
  ]);
  const mp = new Map(matieres.map((m) => [m.id, m]));
  const sp = new Map(salles.map((s) => [s.id, s]));
  const cp = new Map(classes.map((c) => [c.id, c]));
  const up = new Map(usagers.map((u) => [u.id, u]));

  return emplois
    .filter((e) => {
      const matiere = mp.get(e.matiere_id);
      if (!matiere) return false;
      if (session.role === "prof") return matiere.prof_id === session.id;
      if (session.role === "etudiant") return matiere.classe_id === session.classe_id;
      return true;
    })
    .map((e) => {
      const matiere = mp.get(e.matiere_id);
      const prof = matiere?.prof_id ? up.get(matiere.prof_id) : null;
      return {
        jour: String(e.jour).toUpperCase(),
        creneau: e.creneau,
        heure_debut: e.heure_debut,
        heure_fin: e.heure_fin,
        code: matiere.code,
        matiere: matiere.nom,
        prof: prof ? `${prof.prenom} ${prof.nom}` : "Non assigné",
        classe: cp.get(e.classe_id)?.nom ?? "—",
        salle: sp.get(e.salle_id)?.nom ?? "Non attribuée",
        salle_id: e.salle_id,
        matiere_id: e.matiere_id,
      };
    })
    .sort((a, b) => idx(a.jour) - idx(b.jour) || a.creneau - b.creneau);
}

function grille(lignes: Ligne[], titreClasse: boolean): string {
  if (lignes.length === 0) return "Aucun cours planifié pour toi cette semaine.";
  const jours = [...new Set(lignes.map((l) => l.jour))];
  return jours
    .map(
      (j) =>
        `${j}\n` +
        lignes
          .filter((l) => l.jour === j)
          .map(
            (l) =>
              `  ${l.heure_debut}-${l.heure_fin} · ${l.code} ${l.matiere}${
                titreClasse ? ` (${l.classe})` : ""
              } · salle ${l.salle}`
          )
          .join("\n")
    )
    .join("\n\n");
}

async function prochaineSeance(session: SessionUser): Promise<string> {
  const maintenant = new Date();
  const aujourdhui = JOURS[maintenant.getDay()];
  const hhmm = `${String(maintenant.getHours()).padStart(2, "0")}:${String(
    maintenant.getMinutes()
  ).padStart(2, "0")}`;
  const lignes = await mesLignes(session, mondayOf());

  const enCours = lignes.find((l) => l.jour === aujourdhui && l.heure_debut <= hhmm && hhmm < l.heure_fin);
  if (enCours) {
    return `Tu devrais être en cours maintenant :\n${enCours.heure_debut}-${enCours.heure_fin} · ${enCours.code} ${enCours.matiere}\nSalle ${enCours.salle} · ${enCours.prof}`;
  }

  const suite = lignes
    .filter((l) => idx(l.jour) > idx(aujourdhui) || (l.jour === aujourdhui && l.heure_debut > hhmm))
    .slice(0, 3);
  if (suite.length) {
    const [p, ...rest] = suite;
    const head = `Prochain cours : ${p.jour} ${p.heure_debut}-${p.heure_fin}\n${p.code} — ${p.matiere}\nSalle ${p.salle} · ${p.prof}${
      session.role === "admin" ? ` · classe ${p.classe}` : ""
    }`;
    return rest.length
      ? `${head}\n\nEnsuite :\n${rest.map((l) => `  ${l.jour} ${l.heure_debut}-${l.heure_fin} · ${l.code} · salle ${l.salle}`).join("\n")}`
      : head;
  }

  const prochaine = await mesLignes(session, mondayOf(new Date(Date.now() + 7 * 864e5)));
  return prochaine.length
    ? `Plus de cours cette semaine. La semaine prochaine commence par :\n  ${prochaine[0].jour} ${prochaine[0].heure_debut}-${prochaine[0].heure_fin} · ${prochaine[0].code} ${prochaine[0].matiere} · salle ${prochaine[0].salle}`
    : "Plus de cours cette semaine, et rien de planifié pour la suivante.";
}

async function notesAnswer(session: SessionUser): Promise<string> {
  const [matieres, notes] = await Promise.all([findDocs("matieres"), findDocs("notes")]);
  const mp = new Map(matieres.map((m) => [m.id, m]));

  if (session.role === "etudiant") {
    const miennes = notes.filter((n) => n.etudiant_id === session.id);
    if (miennes.length === 0) return "Aucune note publiée pour l'instant. Elles arrivent après la clôture et la validation de chaque matière.";
    const parMatiere = new Map<number, number[]>();
    for (const n of miennes) {
      if (!parMatiere.has(n.matiere_id)) parMatiere.set(n.matiere_id, []);
      parMatiere.get(n.matiere_id)!.push(n.valeur);
    }
    let sum = 0;
    let coef = 0;
    const lignes: string[] = [];
    for (const [matiereId, valeurs] of parMatiere) {
      const m = mp.get(matiereId);
      const moyenne = valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
      lignes.push(
        `  ${m?.code ?? "?"} ${m?.nom ?? "matière"} : ${moyenne.toFixed(2)}/20 (${detailNotes(valeurs)})${
          m?.statut === "valide" ? "" : " · non validée"
        }`
      );
      if (m?.statut === "valide") {
        sum += moyenne * m.coefficient;
        coef += m.coefficient;
      }
    }
    const gen = coef ? `Moyenne générale (matières validées) : ${(sum / coef).toFixed(2)}/20` : "Moyenne générale pas encore calculable (aucune matière validée).";
    return `Tes notes publiées :\n${lignes.join("\n")}\n\n${gen}`;
  }

  const mesMatieres = matieres.filter((m) => (session.role === "prof" ? m.prof_id === session.id : true));
  if (mesMatieres.length === 0) return "Aucune matière ne t'est attribuée.";
  const lignes = mesMatieres.map((m) => {
    const ns = notes.filter((n) => n.matiere_id === m.id);
    if (!ns.length) return `  ${m.code} : aucune note saisie`;
    const moyenne = ns.reduce((s, n) => s + n.valeur, 0) / ns.length;
    const sous10 = new Set(ns.filter((n) => n.valeur < 10).map((n) => n.etudiant_id)).size;
    return `  ${m.code} (${m.statut}) : moyenne ${moyenne.toFixed(2)}/20 · ${sous10} étudiant(s) sous 10`;
  });
  return `État des notes de tes matières :\n${lignes.join("\n")}\n\nPublie une moyenne en clôturant la matière (page Notes) puis l'administration la valide.`;
}

function detailNotes(valeurs: number[]) {
  return valeurs.map((v) => `${v}`).join(", ");
}

async function presencesAnswer(session: SessionUser): Promise<string> {
  const presences = await findDocs("presences");
  const matieres = await findDocs("matieres");
  const mp = new Map(matieres.map((m) => [m.id, m]));

  if (session.role === "etudiant") {
    const miennes = presences.filter((p) => p.etudiant_id === session.id);
    if (!miennes.length) return "Aucune pointage enregistré pour toi pour l'instant.";
    const count = (statut: string) => miennes.filter((p) => p.statut === statut).length;
    return (
      `Tes pointages : ${miennes.length} séance(s)\n` +
      `  présents : ${count("present")}\n  retards : ${count("retard")}\n  absents : ${count("absent")}\n\n` +
      `Une absence doit être justifiée auprès de l'administration via une réclamation (page Réclamations).`
    );
  }

  const mesMatieres = new Set(matieres.filter((m) => session.role === "prof" ? m.prof_id === session.id : true).map((m) => m.id));
  const vues = presences.filter((p) => mesMatieres.has(p.matiere_id));
  if (!vues.length) return "Aucune présence pointée sur tes matières.";
  const today = todayISO();
  const duJour = vues.filter((p) => p.date === today);
  return (
    `${vues.length} pointages enregistrés sur tes matières (dernier jour pointé : ${today} → ${duJour.length}).\n` +
    `  présents : ${vues.filter((p) => p.statut === "present").length}\n` +
    `  retards : ${vues.filter((p) => p.statut === "retard").length}\n` +
    `  absents : ${vues.filter((p) => p.statut === "absent").length}\n\n` +
    `Pour pointer : page Présences, choisis la matière puis le statut de chaque étudiant.`
  );
}

async function crAnswer(session: SessionUser): Promise<string> {
  const [assignments, depots, matieres] = await Promise.all([
    findDocs("cr_assignments"),
    findDocs("cr_depots"),
    findDocs("matieres"),
  ]);
  const mp = new Map(matieres.map((m) => [m.id, m]));
  const aujourdhui = todayISO();

  if (session.role === "etudiant") {
    const mesMatieres = new Set(matieres.filter((m) => m.classe_id === session.classe_id).map((m) => m.id));
    const miens = assignments.filter((c) => mesMatieres.has(c.matiere_id));
    if (!miens.length) return "Aucun compte rendu à rendre pour le moment.";
    const lignes = miens.map((c) => {
      const depot = depots.find((d) => d.assignment_id === c.id && d.etudiant_id === session.id);
      const retarde = !depot && c.date_limite < aujourdhui;
      return `  ${c.titre} (${mp.get(c.matiere_id)?.code ?? "?"}) — limite ${c.date_limite}${retarde ? " · RETARD" : ""}${
        depot ? (depot.note == null ? " · rendu, en attente de note" : ` · rendu, note ${depot.note}/20`) : " · pas encore rendu"
      }`;
    });
    return `Comptes rendus de ta classe :\n${lignes.join("\n")}\n\nTu déposes ton texte dans la page Compte rendus.`;
  }

  const miens = assignments.filter((c) => (session.role === "prof" ? c.prof_id === session.id : true));
  if (!miens.length) return "Aucun compte rendu créé pour l'instant.";
  const lignes = miens.map((c) => {
    const ns = depots.filter((d) => d.assignment_id === c.id);
    return `  ${c.titre} (${mp.get(c.matiere_id)?.code ?? "?"}) — limite ${c.date_limite} · ${ns.length} dépôt(s), ${
      ns.filter((d) => d.note == null).length
    } à noter`;
  });
  return `Tes comptes rendus :\n${lignes.join("\n")}`;
}

async function matieresAnswer(session: SessionUser): Promise<string> {
  const [matieres, usagers] = await Promise.all([findDocs("matieres"), findDocs("users")]);
  const up = new Map(usagers.map((u) => [u.id, u]));
  const cibles = matieres.filter((m) =>
    session.role === "prof" ? m.prof_id === session.id : session.role === "etudiant" ? m.classe_id === session.classe_id : true
  );
  if (!cibles.length) return "Aucune matière inscrite pour toi pour l'instant.";
  return `Tes matières :\n${cibles
    .map((m) => {
      const prof = m.prof_id ? up.get(m.prof_id) : null;
      return `  ${m.code} — ${m.nom} · coef ${m.coefficient} · ${m.heures} h · ${
        prof ? `${prof.prenom} ${prof.nom}` : "prof à assigner"
      } · ${statut(m.statut)}`;
    })
    .join("\n")}`;
}

function statut(s: string) {
  return s === "valide" ? "validée (notes publiées)" : s === "termine" ? "clôturée, en attente de validation" : "en cours";
}

async function reclamationsAnswer(session: SessionUser): Promise<string> {
  if (session.role === "admin") {
    const [toutes, usagers] = await Promise.all([findDocs("reclamations", {}, { sort: { cree_le: -1 } }), findDocs("users")]);
    if (!toutes.length) return "Aucune réclamation déposée dans l'établissement pour le moment.";
    const up = new Map(usagers.map((u) => [u.id, u]));
    const par = (s: string) => toutes.filter((r) => r.statut === s).length;
    const lignes = toutes
      .slice(0, 6)
      .map((r) => {
        const u = up.get(r.user_id);
        return `  [${r.statut}] ${r.objet} — ${u ? `${u.prenom} ${u.nom}` : "auteur inconnu"}`;
      });
    return (
      `Réclamations récentes (${toutes.length} au total)\n` +
      `  ouverts : ${par("ouvert")} · en cours : ${par("en_cours")} · traités : ${par("traite")}\n${lignes.join("\n")}\n\n` +
      `En administration, tu les consultes (page Réclamations) : le statut reste la responsabilité de l'auteur.`
    );
  }
  const miennes = (await findDocs("reclamations", { user_id: session.id })).sort((a, b) =>
    String(b.cree_le).localeCompare(String(a.cree_le))
  );
  const aide =
    "Une réclamation s'écrit dans la page Réclamations : choisis le type (note, salle, emploi du temps, autre), un objet clair et ton message. C'est toi qui pilotes son statut (bouton Modifier).";
  if (!miennes.length) return `Tu n'as pas encore déposé de réclamation.\n\n${aide}`;
  return (
    `Tes réclamations :\n${miennes
      .slice(0, 5)
      .map((r) => `  [${r.statut}] ${r.objet} — ${r.cree_le}`)
      .join("\n")}\n\n${aide}`
  );
}

async function notificationsAnswer(session: SessionUser): Promise<string> {
  const notifs = (await findDocs("notifications", {}, { sort: { cree_le: -1 } })).slice(0, 3);
  if (!notifs.length) return "Aucune notification pour le moment.";
  return `Dernières notifications :\n${notifs.map((n) => `  ${n.titre} — ${n.message} (${n.cree_le})`).join("\n")}`;
}

async function salleAnswer(session: SessionUser, mot: string): Promise<string> {
  const [salles, emplois, matieres] = await Promise.all([findDocs("salles"), findDocs("emplois"), findDocs("matieres")]);
  if (mot) {
    const trouve = salles.find((s) => String(s.nom).toLowerCase().includes(mot));
    if (!trouve) return `Je ne trouve pas de salle « ${mot} ». Salles disponibles : ${salles.map((s) => s.nom).join(", ")}.`;
    const ocupees = emplois.filter((e) => e.salle_id === trouve.id && e.semaine_debut === mondayOf());
    const mp = new Map(matieres.map((m) => [m.id, m]));
    return `Salle ${trouve.nom} (${trouve.batiment}, ${trouve.capacite} places, ${trouve.type}):\n${
      ocupees.length
        ? ocupees.map((e) => `  ${e.jour} créneau ${e.creneau} · ${mp.get(e.matiere_id)?.code ?? "?"}`).join("\n")
        : "  libre cette semaine"
    }`;
  }
  const lignes = await mesLignes(session, mondayOf());
  if (!lignes.length) return "Aucune salle planifiée pour toi cette semaine.";
  return `Tes salles de la semaine :\n${lignes.map((l) => `  ${l.jour} ${l.heure_debut}-${l.heure_fin} · ${l.code} → ${l.salle}`).join("\n")}`;
}

const AIDE = `Je réponds à partir des données de ton compte ARP. Tu peux demander :\n  · « quel est mon prochain cours ? »\n  · « mon emploi du temps de la semaine »\n  · « mes notes / ma moyenne »\n  · « mes absences »\n  · « quels CR rendre ? »\n  · « mes matières »\n  · « salle A12 »\n  · « mes réclamations »\n  · « comment changer mon mot de passe ? »\n\nÉcris avec tes mots : je comprends les phrases complètes.`;

const COMPTE = `Compte et connexion :\n  · tu te connectes avec l'email de ton invitation et le mot de passe défini depuis le lien reçu\n  · mot de passe oublié : demande à l'administration de renvoyer une invitation, le lien /reset te permet d'en fixer un nouveau\n  · compte bloqué (actif = non) : seul un administrateur peut le réactiver\n  · l'application s'installe sur ton téléphone depuis l'icône PWA, mais nécessite la connexion réseau`;

const BUTS = ["de", "du", "des", "la", "le", "les", "mon", "ma", "mes", "pour", "quel", "quelle", "quels", "est", "au", "aux", "que", "qui", "y", "a", "ce", "cet", "this"];

/* Garde-fous. L'assistant est en lecture seule : il ne écrit rien, ne sort jamais du périmètre
   du compte appelant, et refuse explicitement les demandes qui violent les droits de ce rôle. */
const REFUS_APP =
  "Je suis en lecture seule : je ne peux ni modifier, ni contourner, ni administrer l'application elle-même (code, base, sécurité, droits). Ces actions se font dans les écrans réservés, jamais par moi.";
const REFUS_CRED =
  "Je ne demande et je ne communique jamais de mot de passe, d'identifiant, de jeton ou de clé. Pour ton propre accès : écran de connexion, ou « mot de passe oublié » en demandant un renvoi d'invitation à l'administration.";
const REFUS_ETUDIANT =
  "Tu ne peux pas modifier tes notes ni tes absences : elles sont saisies par les professeurs puis validées par l'administration. Pour contester une note ou justifier une absence, ouvre une réclamation (page Réclamations).";
const REFUS_PROF =
  "Je ne peux pas changer ton rôle, ni les classes ou matières qui te sont confiées : c'est l'administration qui affecte (pages Utilisateurs et Matières). Toi, tu saisis notes et présences de ce que tu enseignes déjà.";
const REFUS_PERIMETRE =
  "Je m'en tiens au périmètre de ton compte : je n'affiche pas les données d'autres étudiants ni d'une autre classe. Ta promotion et tes matières, oui ; le reste, non.";


export function refusConnu(session: SessionUser, question: string): string | null {
  const q = normaliser(question);
  const a = (...m: string[]) => m.some((w) => q.includes(w));

  // Refus : altérer l'application ou ses droits.
  if (a("pirat", "hack", "backdoor", "vulnerabilite", "code source", "base de donnees", "contourn", "escalad", "acces root", "change le code", "changer le code", "modifie l application", "modifier l application", "changer l application", "les droits de", "admin du site")) return REFUS_APP;

  // Refus : soutirer des identifiants (sauf aide légitime sur son propre compte).
  const demandeCred = a("mot de passe", "motdepasse", "mdp", "password", "identifiants", "token", "jeton", "cle api", "api key", "pass admin", "compte admin", "acces admin");
  const aideCompte = a("mon mot de passe", "mon motdepasse", "changer mon mot", "mot de passe oublie", "oubli", "reinitialise mon", "me connecter", "se connecter", "connexion", "invitation", "activer mon", "mon compte");
  if (demandeCred && !aideCompte) return REFUS_CRED;

  // Refus : un étudiant veut modifier des données qui ne lui appartiennent pas (notes / présences).
  const verbeEcriture = a("modifie", "modifier", "changer", "change", "enleve", "enlever", "efface", "effacer", "supprime", "supprimer", "ajoute", "ajouter", "falsifie", "invente", "fausse", "remplace", "reinitialise");
  const donneesProtegees = a("note", "moyenne", "absence", "absent", "retard", "pointage", "bulletin", "resultat");
  if (session.role === "etudiant" && verbeEcriture && donneesProtegees) return REFUS_ETUDIANT;

  // Refus : un professeur veut changer son rôle ou ses affectations.
  if (session.role === "prof" && a("change mon role", "changer mon role", "mon role", "deviens admin", "promouvoir", "change ma classe", "changer ma classe", "nouvelle classe", "affecte moi", "ajoute moi une classe", "donne moi une classe", "m affecter", "reaffecte", "les autres professeurs", "autre professeur", "tous les professeurs")) return REFUS_PROF;

  // Refus : un étudiant veut voir d'autres étudiants ou une autre classe.
  if (session.role === "etudiant" && a("autre etudiant", "autres etudiants", "un autre etudiant", "les autres", "des autres", "d autres eleve", "autre eleve", "autres eleve", "une autre classe", "autre classe", "tous les etudiants", "tous les eleves", "toute la classe", "toute la promotion", "toute la promo", "toutes les classes", "eleve appele", "etudiant appele", "notes d un", "bulletin d un", "d un autre eleve", "d une autre")) return REFUS_PERIMETRE;

  return null;
}

function normaliser(question: string) {
  return String(question)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function repondre(session: SessionUser, question: string): Promise<string> {
  const q = normaliser(question);
  const mots = q.split(" ");
  const a = (...m: string[]) => m.some((w) => q.includes(w));
  const dit = (...m: string[]) => m.some((w) => mots.includes(w));

  if (!q) return AIDE;
  if (dit("bonjour", "salut", "coucou", "hello", "hey", "bonsoir"))
    return `Bonjour ${session.prenom} ! ${
      session.role === "etudiant" ? "Je te renseigne sur tes cours, notes et comptes rendus." : "Je te renseigne sur tes cours, matières et pointages."
    } ${AIDE}`;
  if (dit("merci")) return "Avec plaisir. Pose une autre question si besoin.";

  const refus = refusConnu(session, question);
  if (refus) return refus;

  const salleNomme = (q.match(/salle ([a-z0-9][a-z0-9.-]*)/) || [])[1];
  if (salleNomme && !BUTS.includes(salleNomme)) return await salleAnswer(session, salleNomme);

  if (dit("cr") || a("compte rendu", "compte-rendu", "devoir", "a rendre", "dois je rendre", "date limite", "depot", "rendu le"))
    return await crAnswer(session);
  if (a("reclamation", "recours", "litige", "contester", "justificatif", "justifier")) return await reclamationsAnswer(session);
  if (a("notification", "annonce", "message de lecole", "info de lecole")) return await notificationsAnswer(session);
  if (a("mot de passe", "motdepasse", "mdp", "password", "connexion", "connecter", "invitation", "activation", "activer", "compte bloque", "identifiant", "e-mail", "email"))
    return COMPTE;
  if (a("note", "moyenne", "rattrapage", "resultat", "bulletin", "sur 20")) return await notesAnswer(session);
  if (a("absence", "absent", "presence", "present", "pointage", "pointe", "retard")) return await presencesAnswer(session);
  if (a("matiere", "coefficient", "coef", "professeur", "prof de", "enseign")) return await matieresAnswer(session);
  if (a("salle", "amphi", "labo") && a("prochain", "aujourd", "demain", "cours", "heure")) return await prochaineSeance(session);
  if (a("emploi", "planning", "semaine", "horaire", "programme", "grille", "cours", "seance", "reunion")) {
    if (a("prochain", "aujourd", "demain", "maintenant", "next", "quelle heure", "ai je", "est ce que j")) return await prochaineSeance(session);
    return grille(await mesLignes(session, mondayOf()), session.role === "admin");
  }
  if (a("aide", "help", "que peux", "quoi faire", "qui es", "tu es", "comment marche")) return AIDE;
  return `Je n'ai pas reconnu ta question. ${AIDE}`;
}
