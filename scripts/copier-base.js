/* Copie la base MongoDB locale vers une base distante (Atlas), collection par collection, en
   gardant les _id numériques : toutes les clés étrangères restent valides.
   Utilisation : MONGO_URL="mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net" npm run db:copy
   Option : --source=mongodb://127.0.0.1:27017 --source-db=arp_education
   Remplace mongodump/mongorestore, absents de ce poste. */
if (!globalThis.crypto) globalThis.crypto = require("crypto").webcrypto; // pilote MongoDB 7 sous Node 18
const { MongoClient } = require("mongodb");

const SOURCE_URL = arg("--source") ?? "mongodb://127.0.0.1:27017";
const SOURCE_DB = arg("--source-db") ?? "arp_education";
const CIBLE_URL = process.env.MONGO_URL ?? arg("--target");
const CIBLE_DB = process.env.MONGO_DB ?? "arp_education";

const COLLECTIONS = [
  "classes", "users", "reset_tokens", "emails", "matieres", "salles", "emplois",
  "presences", "notes", "cr_assignments", "cr_depots", "reclamations", "notifications",
  "assistant_usage", "cours", "cours_passages", "quiz_passations", "counters",
];

const LOT = 200;

function arg(nom) {
  const prefix = nom + "=";
  const trouve = process.argv.find((a) => a.startsWith(prefix));
  return trouve ? trouve.slice(prefix.length) : undefined;
}

async function main() {
  if (!CIBLE_URL) throw new Error("Cible absente : MONGO_URL (ou --source=) doit pointer la base de destination.");
  if (CIBLE_URL === SOURCE_URL && CIBLE_DB === SOURCE_DB) throw new Error("La cible et la source sont la même base : rien à copier.");

  const source = new MongoClient(SOURCE_URL, { serverSelectionTimeoutMS: 5000 });
  // autoSelectFamily=false : le pilote l'active par défaut, mais Node 18.13 (ce poste) ne sait pas
  // l'utiliser et le handshake TLS vers Atlas est réinitialisé (ECONNRESET) sans ce retrait.
  const cible = new MongoClient(CIBLE_URL, { serverSelectionTimeoutMS: 15000, autoSelectFamily: false });
  await source.connect();
  try {
    await cible.connect();
  } catch (e) {
    await source.close();
    throw new Error(
      `Connexion à la cible refusée (${e.message}). Sur Atlas : Network Access doit autoriser 0.0.0.0/0 ` +
        "et le mot de passe de l'utilisateur doit être encodé dans l'URL."
    );
  }

  const src = source.db(SOURCE_DB);
  const dst = cible.db(CIBLE_DB);
  console.log(`${SOURCE_URL}/${SOURCE_DB}  →  ${CIBLE_URL.replace(/:[^:@/]+@/, ":***@")}/${CIBLE_DB}`);

  let total = 0;
  for (const nom of COLLECTIONS) {
    const docs = await src.collection(nom).find({}).toArray();
    await dst.collection(nom).deleteMany({});
    for (let i = 0; i < docs.length; i += LOT) {
      await dst.collection(nom).insertMany(docs.slice(i, i + LOT), { ordered: true });
    }
    total += docs.length;
    console.log(`  ${nom.padEnd(18)} ${String(docs.length).padStart(6)} document(s)`);
  }

  console.log(`Total copié : ${total} document(s). Vérification par comptage distant :`);
  await verifer(src, dst);

  await cible.close();
  await source.close();
}

// Le nombre de documents côté cible doit correspondre exactement à la source.
async function verifer(src, dst) {
  let ko = 0;
  for (const nom of COLLECTIONS) {
    const [a, b] = await Promise.all([
      src.collection(nom).estimatedDocumentCount(),
      dst.collection(nom).countDocuments({}),
    ]);
    if (a !== b) {
      ko++;
      console.error(`  ${nom} : ${a} en source, ${b} en cible`);
    }
  }
  if (ko) throw new Error(`${ko} collection(s) ne correspondent pas : la copie est incomplète.`);
  console.log("  toutes les collections correspondent");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
