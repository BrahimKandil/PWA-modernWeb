const { createServer } = require("node:https");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { hostname } = require("node:os");
const Next = require("next");
const tls = require("./scripts/ensure-cert");
const mongo = require("./scripts/ensure-mongo");

// Le secret de session n'est jamais commité : sans lui les cookies retomberaient sur le repli de démo.
if (!process.env.ARP_SECRET) {
  try {
    process.env.ARP_SECRET = readFileSync(join(process.cwd(), ".tunnel-secret"), "utf8").trim();
  } catch {}
}

// La base doit tourner avant la première page : on la démarre ici plutôt que de la faire attendre à l'utilisateur.
// Ce serveur est le seul chemin d'exécution local : c'est donc ici, et plus dans lib/db.ts, que vit la veille mongod
// (lib/db.ts est chargée sur Vercel, où il n'y a aucun mongod à lancer ni à surveiller).
mongo.demarrer().catch((e) => console.error("MongoDB pas démarré :", e.message));
mongo.surveille();

// Port unique et fixe : 443 → l'URL est juste https://<IP> (aucun numéro de port à taper).
const PORT = Number(process.env.HTTPS_PORT ?? 443);
const app = Next({ dev: process.env.HTTPS_DEV === "1", port: PORT });
const handler = app.getRequestHandler();

// Certificat : signé pour les IP réellement présentes, regénéré tout seul si le réseau change.
const hotes = [hostname(), process.env.COMPUTERNAME].filter(Boolean);
let options;
try {
  options = tls.materiel(hotes);
} catch (e) {
  console.error(`Impossible de préparer le certificat TLS (${e.message}).`);
  console.error("mkcert manque ? → powershell -ExecutionPolicy Bypass -File scripts/get-mkcert.ps1");
  process.exit(1);
}

app.prepare().then(() => {
  const serveur = createServer(options, (req, res) => handler(req, res));
  serveur
    .on("error", (e) => {
      console.error(`Impossible de démarrer sur le port ${PORT} (${e.code}).`);
      console.error("Arrête l'autre serveur, puis relance : npm run build && npm start");
      process.exit(1);
    })
    .listen(PORT, "0.0.0.0", () => {
      console.log(`ARP Éducation (HTTPS) — un seul serveur, un seul port (${PORT}) :`);
      console.log(`  Adresse à utiliser au téléphone → https://${tls.ipAffichee() ?? "<IP-du-PC>"}`);
      console.log(`  Certificat couvrant : ${tls.ipReseau().join(", ")}`);
      console.log("  Le certificat se régénère tout seul quand le réseau change (contrôle toutes les 30 s).");
      tls.surveille(serveur, hotes);
    });
});
