import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "arp.db");

export function hashPassword(password: string, salt?: string) {
  const s = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, s, 32).toString("hex");
  return `${s}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
}

type DatabaseType = InstanceType<typeof Database>;

let db: DatabaseType | null = null;

export function getDb(): DatabaseType {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const fresh = !fs.existsSync(DB_PATH);
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  if (fresh) seed(db);
  return db;
}

function initSchema(db: DatabaseType) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL UNIQUE,
    filiere TEXT NOT NULL,
    annee TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    mot_de_passe TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin','prof','etudiant')),
    classe_id INTEGER REFERENCES classes(id),
    actif INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS reset_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    cree_le TEXT NOT NULL,
    utilise INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    destinataire TEXT NOT NULL,
    sujet TEXT NOT NULL,
    contenu TEXT NOT NULL,
    lien TEXT,
    cree_le TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS matieres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    coefficient INTEGER NOT NULL DEFAULT 1,
    heures INTEGER NOT NULL DEFAULT 6,
    statut TEXT NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours','termine','valide')),
    prof_id INTEGER REFERENCES users(id),
    classe_id INTEGER NOT NULL REFERENCES classes(id)
  );
  CREATE TABLE IF NOT EXISTS salles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL UNIQUE,
    batiment TEXT NOT NULL,
    capacite INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('salle','amphi','labo'))
  );
  CREATE TABLE IF NOT EXISTS emplois (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    semaine_debut TEXT NOT NULL,
    jour TEXT NOT NULL CHECK (jour IN ('LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI')),
    creneau INTEGER NOT NULL CHECK (creneau IN (1,2)),
    heure_debut TEXT NOT NULL,
    heure_fin TEXT NOT NULL,
    classe_id INTEGER NOT NULL REFERENCES classes(id),
    matiere_id INTEGER NOT NULL REFERENCES matieres(id),
    salle_id INTEGER NOT NULL REFERENCES salles(id),
    UNIQUE (classe_id, semaine_debut, jour, creneau)
  );
  CREATE TABLE IF NOT EXISTS presences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    statut TEXT NOT NULL CHECK (statut IN ('present','absent','retard')),
    matiere_id INTEGER NOT NULL REFERENCES matieres(id),
    etudiant_id INTEGER NOT NULL REFERENCES users(id),
    prof_id INTEGER REFERENCES users(id),
    UNIQUE (date, matiere_id, etudiant_id)
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    valeur REAL NOT NULL CHECK (valeur BETWEEN 0 AND 20),
    type TEXT NOT NULL CHECK (type IN ('CC','TP','EXAM')),
    date TEXT NOT NULL,
    matiere_id INTEGER NOT NULL REFERENCES matieres(id),
    etudiant_id INTEGER NOT NULL REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS cr_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    consigne TEXT NOT NULL,
    matiere_id INTEGER NOT NULL REFERENCES matieres(id),
    prof_id INTEGER NOT NULL REFERENCES users(id),
    date_limite TEXT NOT NULL,
    cree_le TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cr_depots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL REFERENCES cr_assignments(id),
    etudiant_id INTEGER NOT NULL REFERENCES users(id),
    contenu TEXT NOT NULL,
    rendu_le TEXT NOT NULL,
    note REAL CHECK (note BETWEEN 0 AND 20),
    feedback TEXT,
    UNIQUE (assignment_id, etudiant_id)
  );
  CREATE TABLE IF NOT EXISTS reclamations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    objet TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('note','emploi','salle','autre')),
    statut TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert','en_cours','traite')),
    user_id INTEGER NOT NULL REFERENCES users(id),
    cree_le TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    message TEXT NOT NULL,
    lue INTEGER NOT NULL DEFAULT 0,
    cree_le TEXT NOT NULL
  );`);
}

function mondayOf(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}

function seed(db: DatabaseType) {
  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  const semaine = mondayOf(new Date());
  const pwd = hashPassword("123456");

  const insClasse = db.prepare(`INSERT INTO classes (nom, filiere, annee) VALUES (?,?,?)`);
  const info2a = insClasse.run("INFO-2A", "Informatique", "2026-2027").lastInsertRowid as number;
  const gest2a = insClasse.run("GEST-2A", "Gestion", "2026-2027").lastInsertRowid as number;

  const insUser = db.prepare(
    `INSERT INTO users (nom, prenom, email, mot_de_passe, role, classe_id) VALUES (?,?,?,?,?,?)`
  );
  const mk = (nom: string, prenom: string, email: string, role: string, classe: number | null) =>
    insUser.run(nom, prenom, email, pwd, role, classe).lastInsertRowid as number;

  mk("Admin", "Systeme", "admin@arp.edu", "admin", null);
  const profInfo = mk("Ben Ali", "Sami", "sami.benali@arp.edu", "prof", null);
  const profGestion = mk("Trabelsi", "Nadia", "nadia.trabelsi@arp.edu", "prof", null);
  const profRes = mk("Karoui", "Mehdi", "mehdi.karoui@arp.edu", "prof", null);
  const e1 = mk("Jlassi", "Ahmed", "ahmed.j@arp.edu", "etudiant", info2a);
  const e2 = mk("Mansour", "Yasmine", "yasmine.m@arp.edu", "etudiant", info2a);
  const e3 = mk("Cissé", "Ibrahim", "ibrahim.c@arp.edu", "etudiant", info2a);
  const e4 = mk("Daoud", "Lina", "lina.d@arp.edu", "etudiant", gest2a);
  const e5 = mk("Farhi", "Omar", "omar.f@arp.edu", "etudiant", gest2a);

  const insMat = db.prepare(
    `INSERT INTO matieres (code, nom, coefficient, heures, statut, prof_id, classe_id) VALUES (?,?,?,?,?,?,?)`
  );
  const mWeb = insMat.run("DEVWEB", "Développement Web", 4, 24, "en_cours", profInfo, info2a).lastInsertRowid as number;
  const mBdd = insMat.run("BDD", "Bases de Données", 3, 18, "en_cours", profInfo, info2a).lastInsertRowid as number;
  const mComp = insMat.run("COMPTA", "Comptabilité Générale", 4, 20, "en_cours", profGestion, gest2a).lastInsertRowid as number;
  insMat.run("RESAPP", "Réseaux Appliqués", 3, 15, "en_cours", profRes, info2a);

  const insSalle = db.prepare(`INSERT INTO salles (nom, batiment, capacite, type) VALUES (?,?,?,?)`);
  const sA12 = insSalle.run("A12", "A", 40, "salle").lastInsertRowid as number;
  const sB01 = insSalle.run("B01", "B", 100, "amphi").lastInsertRowid as number;
  const sLab = insSalle.run("Lab-Info", "C", 25, "labo").lastInsertRowid as number;

  const insEmploi = db.prepare(
    `INSERT INTO emplois (semaine_debut, jour, creneau, heure_debut, heure_fin, classe_id, matiere_id, salle_id) VALUES (?,?,?,?,?,?,?,?)`
  );
  const semainePrec = mondayOf(new Date(Date.now() - 7 * 864e5));
  for (const sem of [semainePrec, semaine]) {
    insEmploi.run(sem, "LUNDI", 1, "09:00", "12:00", info2a, mWeb, sLab);
    insEmploi.run(sem, "LUNDI", 2, "13:00", "16:00", info2a, mBdd, sA12);
    insEmploi.run(sem, "MARDI", 1, "09:00", "12:00", info2a, mBdd, sA12);
    insEmploi.run(sem, "MARDI", 2, "13:00", "16:00", info2a, mWeb, sLab);
    insEmploi.run(sem, "MERCREDI", 1, "09:00", "12:00", gest2a, mComp, sB01);
    insEmploi.run(sem, "JEUDI", 1, "09:00", "12:00", gest2a, mComp, sB01);
    insEmploi.run(sem, "JEUDI", 2, "13:00", "16:00", gest2a, mComp, sB01);
  }

  const insPres = db.prepare(
    `INSERT INTO presences (date, statut, matiere_id, etudiant_id, prof_id) VALUES (?,?,?,?,?)`
  );
  insPres.run(semainePrec, "present", mWeb, e1, profInfo);
  insPres.run(semainePrec, "absent", mWeb, e3, profInfo);
  insPres.run(semainePrec, "retard", mWeb, e2, profInfo);

  const insNote = db.prepare(`INSERT INTO notes (valeur, type, date, matiere_id, etudiant_id) VALUES (?,?,?,?,?)`);
  [e1, e2, e3].forEach((e, i) => {
    insNote.run([14.5, 12, 16.75][i], "CC", "2026-10-05", mWeb, e);
    insNote.run([13, 11, 15][i], "TP", "2026-10-08", mBdd, e);
  });
  [e4, e5].forEach((e, i) => insNote.run([15, 10.5][i], "CC", "2026-10-06", mComp, e));

  const insCrA = db.prepare(
    `INSERT INTO cr_assignments (titre, consigne, matiere_id, prof_id, date_limite, cree_le) VALUES (?,?,?,?,?,?)`
  );
  const crWeb = insCrA.run("CR TP JavaScript", "Rédigez le compte rendu du TP DOM et événements (objectif, étapes, résultats).", mWeb, profInfo, "2026-10-20", now).lastInsertRowid as number;
  const crBdd = insCrA.run("CR TP SQLite", "Compte rendu de création du schéma et requêtes JOIN.", mBdd, profInfo, "2026-10-12", now).lastInsertRowid as number;

  const insDepot = db.prepare(
    `INSERT INTO cr_depots (assignment_id, etudiant_id, contenu, rendu_le) VALUES (?,?,?,?)`
  );
  insDepot.run(crBdd, e2, "J'ai créé les tables et testé les jointures…", "2026-10-11 14:20");
  insDepot.run(crBdd, e1, "Schéma relationnel, clés étrangères et requêtes…", "2026-10-11 18:05");
  db.prepare(`UPDATE cr_depots SET note=15, feedback='Bon travail.' WHERE assignment_id=? AND etudiant_id=?`).run(crBdd, e2);

  const insRec = db.prepare(
    `INSERT INTO reclamations (objet, message, type, statut, user_id, cree_le) VALUES (?,?,?,?,?,?)`
  );
  insRec.run("Erreur de note", "Ma note de DEVWEB ne correspond pas au barème publié.", "note", "ouvert", e1, now);
  insRec.run("Salle trop petite", "Lab-Info est juste pour l'effectif du groupe.", "salle", "traite", profInfo, now);

  const insNotif = db.prepare(`INSERT INTO notifications (titre, message, lue, cree_le) VALUES (?,?,0,?)`);
  insNotif.run("Rentrée 2026-2027", "Les emplois du temps de la semaine sont disponibles.", now);
  insNotif.run("Maintenance", "Une maintenance est prévue samedi matin.", now);

  const insMail = db.prepare(`INSERT INTO emails (destinataire, sujet, contenu, lien, cree_le) VALUES (?,?,?,?,?)`);
  insMail.run("yasmine.m@arp.edu", "Bienvenue sur ARP Éducation", "Votre compte a été créé. Définissez votre mot de passe.", "/reset?token=exemple", now);
}
