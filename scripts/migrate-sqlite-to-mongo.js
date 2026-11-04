/* Migrates data/arp.db (SQLite) into MongoDB, keeping every numeric id so all foreign
   keys stay valid. Run once: node scripts/migrate-sqlite-to-mongo.js
   Refuses to overwrite a non-empty database unless --force. */
const path = require("path");
const fs = require("fs");
if (!globalThis.crypto) globalThis.crypto = require("crypto").webcrypto; // pilote MongoDB 7 sous Node 18
const Database = require("better-sqlite3");
const { MongoClient } = require("mongodb");

const DB_PATH = path.join(process.cwd(), "data", "arp.db");
const URL = process.env.MONGO_URL ?? "mongodb://127.0.0.1:27017";
const NAME = process.env.MONGO_DB ?? "arp_education";
const FORCE = process.argv.includes("--force");

const TABLES = [
  "classes", "users", "reset_tokens", "emails", "matieres", "salles", "emplois",
  "presences", "notes", "cr_assignments", "cr_depots", "reclamations", "notifications",
];

async function main() {
  await require("./ensure-mongo").demarrer();
  if (!fs.existsSync(DB_PATH)) throw new Error(`Introuvable : ${DB_PATH}`);
  const sqlite = new Database(DB_PATH, { readonly: true });
  const client = new MongoClient(URL, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(NAME);

  const deja = await db.collection("users").estimatedDocumentCount();
  if (deja > 0 && !FORCE) {
    await client.close();
    throw new Error(`La base ${NAME} contient deja ${deja} utilisateur(s). Relance avec --force pour la remplacer.`);
  }

  const total = {};
  for (const t of TABLES) {
    const rows = sqlite.prepare(`SELECT * FROM ${t}`).all();
    await db.collection(t).deleteMany({});
    // reset_tokens a pour cle primaire le token (colonne TEXT) : pas de colonne id,
    // on lui fabrique des ids numeriques pour rester coherent avec le reste de l'app.
    let fabriquer = 0;
    const docs = rows.map((r) => {
      const { id, ...rest } = r;
      return { _id: id === undefined ? ++fabriquer : id, ...rest };
    });
    if (docs.length) await db.collection(t).insertMany(docs);
    total[t] = docs.length;
    const max = docs.reduce((m, d) => Math.max(m, d._id || 0), 0);
    await db.collection("counters").updateOne({ _id: t }, { $set: { seq: max } }, { upsert: true });
  }

  await client.close();
  sqlite.close();
  console.log("Migre vers MongoDB (" + NAME + ") :");
  for (const [t, c] of Object.entries(total)) console.log(`  ${t.padEnd(15)} ${c}`);
}

main().catch((e) => {
  console.error("ECHEC :", e.message);
  console.error(e.stack);
  process.exit(1);
});
