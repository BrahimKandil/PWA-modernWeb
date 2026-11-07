import { MongoClient, Db, Document } from "mongodb";
import crypto from "crypto";

// Node 18 n'expose pas de `crypto` global, dont le pilote MongoDB 7 se sert pour ses UUID de session.
if (!(globalThis as any).crypto) (globalThis as any).crypto = (crypto as any).webcrypto;

export const MONGO_URL = process.env.MONGO_URL ?? "mongodb://127.0.0.1:27017";
export const MONGO_DB = process.env.MONGO_DB ?? "arp_education";

// Serverless : chaque instance chaude garde sa propre connection. Sans plafond bas, une
// trentaine d'eleves simultanes sature un cluster mutualise (Atlas M0 ≈ 100 connections).
const POOL_MAX = Number(process.env.MONGO_POOL ?? 5);
const BASE_LOCALE = /(127\.0\.0\.1|localhost)[:/]/.test(MONGO_URL);

const COLLECTIONS = [
  "classes", "users", "reset_tokens", "emails", "matieres", "salles", "emplois",
  "presences", "notes", "cr_assignments", "cr_depots", "reclamations", "notifications",
  "assistant_usage", "cours", "cours_passages", "quiz_passations",
] as const;
export type CollName = (typeof COLLECTIONS)[number];

let client: MongoClient | null = null;
let database: Db | null = null;

export async function getDb(): Promise<Db> {
  if (database) return database;
  return ouvrir();
}

async function ouvrir(): Promise<Db> {
  // autoSelectFamily=false : activé par le pilote, mal géré par Node 18.13 (poste local), il fait
  // échouer le handshake TLS vers Atlas. Sans effet sur Node 20/22, où Vercel exécute l'application.
  client = new MongoClient(MONGO_URL, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: POOL_MAX,
    autoSelectFamily: false,
  });
  try {
    await client.connect();
  } catch (e) {
    await client.close().catch(() => {});
    client = null;
    throw e;
  }
  database = client.db(MONGO_DB);
  const db = database;
  await ensureIndexes(db);
  // Les comptes de demonstration (mot de passe 123456) n'ont rien a faire sur une base publiee.
  if (BASE_LOCALE && (await db.collection("users").estimatedDocumentCount()) === 0) await seed(db);
  return db;
}

// Miroir des contraintes UNIQUE du schema SQLite d origine.
async function ensureIndexes(db: Db) {
  const unique = (c: string, k: Document, name: string) => db.collection(c).createIndex(k, { unique: true, name });
  await Promise.all([
    unique("classes", { nom: 1 }, "uclasse_nom"),
    unique("users", { email: 1 }, "uuser_email"),
    unique("matieres", { code: 1 }, "umatiere_code"),
    unique("salles", { nom: 1 }, "usalle_nom"),
    unique("emplois", { classe_id: 1, semaine_debut: 1, jour: 1, creneau: 1 }, "uemploi_creneau"),
    unique("presences", { date: 1, matiere_id: 1, etudiant_id: 1 }, "upresence_ligne"),
    unique("cr_depots", { assignment_id: 1, etudiant_id: 1 }, "udepot_cr"),
    unique("cours", { matiere_id: 1, numero: 1 }, "ucours_chapitre"),
    // Un eleve ne passe un quiz qu'une seule fois : « cle » vaut "chapitre:<id>" ou "global:<matiere_id>".
    unique("quiz_passations", { etudiant_id: 1, cle: 1 }, "uquiz_une_fois"),
    db.collection("emplois").createIndex({ semaine_debut: 1 }, { name: "xemploi_semaine" }),
    db.collection("notes").createIndex({ matiere_id: 1, etudiant_id: 1 }, { name: "xnote_matieres" }),
    db.collection("presences").createIndex({ etudiant_id: 1 }, { name: "xpresence_etudiant" }),
    db.collection("cours_passages").createIndex({ cours_id: 1 }, { name: "xcours_passages" }),
    db.collection("cours_passages").createIndex({ matiere_id: 1 }, { name: "xcours_passages_matiere" }),
    db.collection("quiz_passations").createIndex({ matiere_id: 1 }, { name: "xquiz_matiere" }),
  ]);
}

async function nextId(coll: CollName): Promise<number> {
  const c = (await getDb()).collection("counters");
  const doc = await c.findOneAndUpdate({ _id: coll as any }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  return (doc as any).seq as number;
}

// Les pages lisaient une colonne `id` : on expose _id sous ce nom, et on retraduit `id`
// en `_id` dans les filtres pour garder les requetes aussi lisibles qu en SQL.
function hydrate<T>(doc: Document | null): T | null {
  if (!doc) return null;
  const { _id, ...rest } = doc as any;
  return { ...rest, id: _id } as T;
}

function denormalize(filter: Document): Document {
  const { id, ...rest } = filter as any;
  return id === undefined ? rest : { ...rest, _id: id };
}

export async function findDocs<T = any>(
  coll: CollName,
  filter: Document = {},
  opts: { sort?: Document; limit?: number; skip?: number } = {}
): Promise<T[]> {
  const cur = (await getDb()).collection(coll).find(denormalize(filter), opts.sort ? { sort: opts.sort } : {});
  if (opts.skip) cur.skip(opts.skip);
  if (opts.limit) cur.limit(opts.limit);
  return (await cur.toArray()).map((d) => hydrate<T>(d)!);
}

export async function findOne<T = any>(coll: CollName, filter: Document = {}): Promise<T | null> {
  return hydrate<T>(await (await getDb()).collection(coll).findOne(denormalize(filter)));
}

export async function countDocs(coll: CollName, filter: Document = {}): Promise<number> {
  return (await getDb()).collection(coll).countDocuments(denormalize(filter));
}

// Insere avec un id numerique auto-incrementé (comme AUTOINCREMENT) et renvoie cet id.
export async function insertDoc(coll: CollName, doc: Document): Promise<number> {
  const _id = (doc as any).id ?? (await nextId(coll));
  const { id, ...rest } = doc as any;
  const res = await (await getDb()).collection(coll).insertOne({ _id, ...rest });
  return res.insertedId as unknown as number;
}

export async function updateDoc(coll: CollName, filter: Document, set: Document): Promise<number> {
  const res = await (await getDb()).collection(coll).updateOne(denormalize(filter), { $set: set });
  return res.matchedCount;
}

export async function removeDocs(coll: CollName, filter: Document): Promise<number> {
  const res = await (await getDb()).collection(coll).deleteMany(denormalize(filter));
  return res.deletedCount;
}

export function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function isDup(err: any): boolean {
  return !!err && (err.code === 11000 || err.codeName === "DuplicateKey");
}

function mondayOf(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

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

// Base de demonstration : memes donnees que l ancien seed SQLite.
async function seed(db: Db) {
  const now = nowLocal();
  const semaine = mondayOf(new Date());
  const semainePrec = mondayOf(new Date(Date.now() - 7 * 864e5));
  const pwd = hashPassword("123456");

  const add = async (coll: CollName, doc: Document) => {
    const n = await nextId(coll);
    await db.collection(coll).insertOne({ _id: n, ...(doc as any) });
    return n;
  };

  const info2a = await add("classes", { nom: "INFO-2A", filiere: "Informatique", annee: "2026-2027" });
  const gest2a = await add("classes", { nom: "GEST-2A", filiere: "Gestion", annee: "2026-2027" });

  const user = (nom: string, prenom: string, email: string, role: string, classe_id: number | null) =>
    add("users", { nom, prenom, email: email.toLowerCase(), mot_de_passe: pwd, role, classe_id, actif: 1 });

  await user("Admin", "Systeme", "admin@arp.edu", "admin", null);
  const profInfo = await user("Ben Ali", "Sami", "sami.benali@arp.edu", "prof", null);
  const profGestion = await user("Trabelsi", "Nadia", "nadia.trabelsi@arp.edu", "prof", null);
  const profRes = await user("Karoui", "Mehdi", "mehdi.karoui@arp.edu", "prof", null);
  const e1 = await user("Jlassi", "Ahmed", "ahmed.j@arp.edu", "etudiant", info2a);
  const e2 = await user("Mansour", "Yasmine", "yasmine.m@arp.edu", "etudiant", info2a);
  const e3 = await user("Cisse", "Ibrahim", "ibrahim.c@arp.edu", "etudiant", info2a);
  const e4 = await user("Daoud", "Lina", "lina.d@arp.edu", "etudiant", gest2a);
  const e5 = await user("Farhi", "Omar", "omar.f@arp.edu", "etudiant", gest2a);

  const matiere = (code: string, nom: string, coefficient: number, heures: number, prof_id: number, classe_id: number) =>
    add("matieres", { code, nom, coefficient, heures, statut: "en_cours", prof_id, classe_id });
  const mWeb = await matiere("DEVWEB", "Developpement Web", 4, 24, profInfo, info2a);
  const mBdd = await matiere("BDD", "Bases de Donnees", 3, 18, profInfo, info2a);
  const mComp = await matiere("COMPTA", "Comptabilite Generale", 4, 20, profGestion, gest2a);
  await matiere("RESAPP", "Reseaux Appliques", 3, 15, profRes, info2a);

  const sA12 = await add("salles", { nom: "A12", batiment: "A", capacite: 40, type: "salle" });
  const sB01 = await add("salles", { nom: "B01", batiment: "B", capacite: 100, type: "amphi" });
  const sLab = await add("salles", { nom: "Lab-Info", batiment: "C", capacite: 25, type: "labo" });

  const creneau = (sem: string, jour: string, cr: number, hb: string, hf: string, classe_id: number, matiere_id: number, salle_id: number) =>
    add("emplois", { semaine_debut: sem, jour, creneau: cr, heure_debut: hb, heure_fin: hf, classe_id, matiere_id, salle_id });

  for (const sem of [semainePrec, semaine]) {
    await creneau(sem, "LUNDI", 1, "09:00", "12:00", info2a, mWeb, sLab);
    await creneau(sem, "LUNDI", 2, "13:00", "16:00", info2a, mBdd, sA12);
    await creneau(sem, "MARDI", 1, "09:00", "12:00", info2a, mBdd, sA12);
    await creneau(sem, "MARDI", 2, "13:00", "16:00", info2a, mWeb, sLab);
    await creneau(sem, "MERCREDI", 1, "09:00", "12:00", gest2a, mComp, sB01);
    await creneau(sem, "JEUDI", 1, "09:00", "12:00", gest2a, mComp, sB01);
    await creneau(sem, "JEUDI", 2, "13:00", "16:00", gest2a, mComp, sB01);
  }

  const presence = (statut: string, etudiant_id: number, prof_id: number) =>
    add("presences", { date: semainePrec, statut, matiere_id: mWeb, etudiant_id, prof_id });
  await presence("present", e1, profInfo);
  await presence("absent", e3, profInfo);
  await presence("retard", e2, profInfo);

  const note = (valeur: number, type: string, date: string, matiere_id: number, etudiant_id: number) =>
    add("notes", { valeur, type, date, matiere_id, etudiant_id });
  await note(14.5, "CC", "2026-10-05", mWeb, e1);
  await note(12, "CC", "2026-10-05", mWeb, e2);
  await note(16.75, "CC", "2026-10-05", mWeb, e3);
  await note(13, "TP", "2026-10-08", mBdd, e1);
  await note(11, "TP", "2026-10-08", mBdd, e2);
  await note(15, "TP", "2026-10-08", mBdd, e3);
  await note(15, "CC", "2026-10-06", mComp, e4);
  await note(10.5, "CC", "2026-10-06", mComp, e5);

  const crBdd = await add("cr_assignments", {
    titre: "CR TP MongoDB",
    consigne: "Compte rendu de creation du schema et des requetes.",
    matiere_id: mBdd, prof_id: profInfo, date_limite: "2026-10-12", cree_le: now,
  });
  await add("cr_assignments", {
    titre: "CR TP JavaScript",
    consigne: "Redigez le compte rendu du TP DOM et evenements (objectif, etapes, resultats).",
    matiere_id: mWeb, prof_id: profInfo, date_limite: "2026-10-20", cree_le: now,
  });
  await add("cr_depots", {
    assignment_id: crBdd, etudiant_id: e2, contenu: "J ai cree les tables et teste les jointures...",
    rendu_le: "2026-10-11 14:20", note: 15, feedback: "Bon travail.",
  });
  await add("cr_depots", {
    assignment_id: crBdd, etudiant_id: e1, contenu: "Schema relationnel, cles etrangeres et requetes...",
    rendu_le: "2026-10-11 18:05", note: null, feedback: null,
  });

  await add("reclamations", {
    objet: "Erreur de note", message: "Ma note de DEVWEB ne correspond pas au bareme publie.",
    type: "note", statut: "ouvert", user_id: e1, cree_le: now,
  });
  await add("reclamations", {
    objet: "Salle trop petite", message: "Lab-Info est juste pour l effectif du groupe.",
    type: "salle", statut: "traite", user_id: profInfo, cree_le: now,
  });

  await add("notifications", { titre: "Rentree 2026-2027", message: "Les emplois du temps de la semaine sont disponibles.", lue: 0, cree_le: now });
  await add("notifications", { titre: "Maintenance", message: "Une maintenance est prevue samedi matin.", lue: 0, cree_le: now });

  await add("emails", {
    destinataire: "yasmine.m@arp.edu", sujet: "Bienvenue sur ARP Education",
    contenu: "Votre compte a ete cree. Definissez votre mot de passe.", lien: "/reset?token=exemple", cree_le: now,
  });
}
