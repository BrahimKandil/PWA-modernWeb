/* Affiche les collections de la base MongoDB comme des tableaux SQLite.
   node scripts/show-collections.js [nombreDeLignes]   (défaut : 4)
   Le champ mot_de_passe est masqué : les hashes ne doivent pas sortir dans un terminal. */
globalThis.crypto = globalThis.crypto || require("crypto").webcrypto;
const { MongoClient } = require("mongodb");

const URL = process.env.MONGO_URL ?? "mongodb://127.0.0.1:27017";
const NAME = process.env.MONGO_DB ?? "arp_education";
const MAX = Number(process.argv[2] ?? 4);
const MASQUES = ["mot_de_passe"];

function texte(v) {
  if (v === undefined || v === null || v === "") return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}
function pad(s, n) {
  if (s.length > n) s = s.slice(0, n - 1) + "…";
  return s + " ".repeat(Math.max(0, n - s.length));
}
function table(rows, cols) {
  const LARGEUR_MAX = 38; // sans plafond, texte/vecteur/fichier font des lignes de 3000 caracteres
  const widths = cols.map((c) => Math.min(LARGEUR_MAX, Math.max(c.length, ...rows.map((r) => texte(r[c]).length))));
  const border = "+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+";
  const line = (vals) => "| " + vals.map((v, i) => pad(texte(v), widths[i])).join(" | ") + " |";
  return [border, line(cols), border, ...rows.map((r) => line(cols.map((c) => r[c]))), border].join("\n");
}

(async () => {
  await require("./ensure-mongo").demarrer();
  const client = await MongoClient.connect(URL, { serverSelectionTimeoutMS: 5000 });
  const db = client.db(NAME);
  const names = (await db.listCollections().toArray()).map((c) => c.name).sort();

  console.log(`Base ${NAME} sur ${URL} — ${names.length} collections\n`);
  const recap = [];
  for (const name of names) {
    const docs = await db.collection(name).find({}, { limit: MAX }).toArray();
    const count = await db.collection(name).countDocuments();
    const keys = [...new Set(docs.flatMap((d) => Object.keys(d)))].filter((k) => k !== "_id" && !MASQUES.includes(k));
    const cols = ["_id", ...keys];
    const rows = docs.map((d) => Object.fromEntries(cols.map((c) => [c, d[c]])));
    recap.push({ collection: name, documents: count, champs: keys.join(",") });
    console.log(`### ${name} — ${count} document(s)`);
    console.log(rows.length ? table(rows, cols) : "(vide)");
    console.log();
  }
  console.log("=== Récapitulatif ===");
  console.log(table(recap, ["collection", "documents", "champs"]));
  await client.close();
})().catch((e) => {
  console.error("ERREUR :", e.message);
  console.error("MongoDB local ne repond pas : verifier C:\\Users\\USER\\Tools\\mongodb-log\\mongod.log");
  process.exit(1);
});
