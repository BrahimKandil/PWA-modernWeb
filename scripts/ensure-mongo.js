/* Démarre MongoDB local tout seul quand la base ne répond pas.
   Le PC redémarre → mongod n'est plus lancé → l'app affichait une erreur de connexion.
   Ici la moindre requête qui échoue sur une base injoignable relance mongod, puis retente.
   Utilisé par lib/db.ts (à l'exécution) et server-https.js (au démarrage, pour éviter
   que la première page attende), et directement en commande : node scripts/ensure-mongo.js */
const { spawn } = require("node:child_process");
const { createConnection } = require("node:net");
const { existsSync, mkdirSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { homedir } = require("node:os");

const URL = process.env.MONGO_URL ?? "mongodb://127.0.0.1:27017";
const m = /^mongodb(?:\+srv)?:\/\/([^/?]+)(?:\?|$)/.exec(URL) ?? [];
const HOTE = (m[1] ?? "127.0.0.1").split("@").pop().split(":")[0];
const PORT = Number((m[1] ?? "").split("@").pop().split(":")[1] ?? 27017) || 27017;
const LOCALE = HOTE === "127.0.0.1" || HOTE === "localhost" || HOTE === "::1";

// Le binaire vit dans C:\Users\<user>\Tools\mongodb\mongodb-win32-<...>\bin, version comprise.
const OUTILS = process.env.MONGO_TOOLS ?? join(homedir(), "Tools");
const NOM_EXE = process.platform === "win32" ? "mongod.exe" : "mongod";

function binaire() {
  const donnee = process.env.MONGOD_EXE;
  if (donnee && existsSync(donnee)) return donnee;
  for (const dossier of [join(OUTILS, "mongodb"), OUTILS]) {
    let noms = [];
    try {
      noms = readdirSync(dossier);
    } catch {
      continue;
    }
    for (const nom of noms) {
      const candidat = join(dossier, nom, "bin", NOM_EXE);
      if (existsSync(candidat)) return candidat;
    }
  }
  return null;
}

function configuration() {
  const donnee = process.env.MONGOD_CFG;
  if (donnee && existsSync(donnee)) return donnee;
  const defaut = join(OUTILS, "mongod.cfg");
  return existsSync(defaut) ? defaut : null;
}

// true si le port accepte une connexion TCP (la base est déjà en marche).
function enMarche(delaiMs = 700) {
  if (!LOCALE) return Promise.resolve(true); // base distante : ce n'est pas à nous de la lancer
  return new Promise((res) => {
    const socket = createConnection({ host: HOTE, port: PORT });
    socket.setTimeout(delaiMs);
    const fini = (v) => {
      socket.destroy();
      res(v);
    };
    socket.on("connect", () => fini(true));
    socket.on("timeout", () => fini(false));
    socket.on("error", () => fini(false));
  });
}

let enCours = null;

async function lancer() {
  const exe = binaire();
  if (!exe) throw new Error(`mongod introuvable sous ${join(OUTILS, "mongodb")} — installer MongoDB ou renseigner MONGOD_EXE.`);
  const cfg = configuration();
  if (!cfg) throw new Error(`configuration introuvable (${join(OUTILS, "mongod.cfg")}) — renseigner MONGOD_CFG.`);
  for (const dossier of ["mongodb-data", "mongodb-log"]) {
    const p = join(OUTILS, dossier);
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }
  spawn(exe, ["--config", cfg], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  const limite = Date.now() + 25000;
  while (Date.now() < limite) {
    if (await enMarche()) {
      console.log(`MongoDB demarre tout seul : ${exe}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`MongoDB ne repond toujours pas sur ${HOTE}:${PORT} — lire ${join(OUTILS, "mongodb-log", "mongod.log")}`);
}

// Idempotent et partagé : plusieurs requêtes simultanées ne déclenchent qu'un seul mongod.
function demarrer() {
  if (!LOCALE) return Promise.resolve();
  return enMarche().then((deja) => {
    if (deja) return;
    if (!enCours)
      enCours = lancer().finally(() => {
        enCours = null;
      });
    return enCours;
  });
}

if (require.main === module) {
  enMarche()
    .then((deja) => {
      if (!deja) return demarrer();
      console.log(`MongoDB deja en marche sur ${HOTE}:${PORT}`);
    })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("ECHEC :", e.message);
      process.exit(1);
    });
}

// En cours de service : si mongod tombe (fenetre fermee, plantage), on le relance sans toucher a rien.
// Le pilote MongoDB se reconnecte seul des que le port repond a nouveau.
function surveille(intervalleMs = 20000) {
  if (!LOCALE) return null;
  let echecs = 0;
  const minuteur = setInterval(async () => {
    if (await enMarche()) {
      echecs = 0;
      return;
    }
    try {
      await demarrer();
    } catch (e) {
      if (++echecs >= 3) {
        clearInterval(minuteur);
        console.error("Arret du controle automatique de MongoDB apres 3 echecs :", e.message);
      } else {
        console.error(`MongoDB pas relance (${echecs}/3) :`, e.message);
      }
    }
  }, intervalleMs);
  minuteur.unref?.();
  return minuteur;
}

module.exports = { enMarche, demarrer, surveille, HOTE, PORT, OUTILS, binaire, configuration };
