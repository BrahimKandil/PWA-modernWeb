/* Importe les chapitres de démonstration dans ARP Éducation.
   npm run db:cours        (serveur lancé : npm start)

   Le script ne touche la base qu'en lecture : il poste les .docx sur /api/cours comme le ferait le
   professeur. C'est le chemin réel — extraction du texte, contrôle des droits, indexation RAG — donc
   l'import valide en même temps l'écran Cours et la génération du quiz.

   Démarrage de la démo : BDD et DEVWEB ont leurs 5 chapitres terminés (le QCM global s'ouvre),
   les autres matières gardent le dernier chapitre en cours (quiz fermé, comme en vrai). */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
if (!globalThis.crypto) globalThis.crypto = crypto.webcrypto;

const { MongoClient } = require("mongodb");

const RACINE = process.cwd();
const BASE = process.env.ARP_URL ?? "https://127.0.0.1";
const DOSSIER = path.join(RACINE, "cours-demo");
const SECRET = fs.readFileSync(path.join(RACINE, ".tunnel-secret"), "utf8").trim();
const EN_COURS = { BDD: [], DEVWEB: [], COMPTA: [5], RESAPP: [5], ALGO: [4, 5] };

const cookie = (id) => `arp_session=${id}.${crypto.createHmac("sha256", SECRET).update(String(id)).digest("hex").slice(0, 16)}`;

// Le POST répond en 303 avec ?ok= ou ?error= dans l'URL : on lit l'en-tête sans suivre la redirection.
async function poster(query, corps, id) {
  const rep = await fetch(`${BASE}/api/cours?${query}`, {
    method: "POST",
    headers: { cookie: cookie(id) },
    body: corps,
    redirect: "manual",
  });
  const localisation = rep.headers.get("location") ?? "";
  const message = decodeURIComponent((localisation.match(/(?:[?&])(?:ok|error)=([^&]*)/) ?? [])[1] ?? "").replace(/\+/g, " ");
  return { statut: rep.status, erreur: localisation.includes("error="), message, localisation };
}

(async () => {
  if (!fs.existsSync(path.join(DOSSIER, "manifest.json"))) {
    throw new Error(`manifest introuvable : ${path.join(DOSSIER, "manifest.json")} (lance depuis la racine du projet)`);
  }
  const manifeste = JSON.parse(fs.readFileSync(path.join(DOSSIER, "manifest.json"), "utf8"));

  const client = new MongoClient("mongodb://127.0.0.1:27017");
  await client.connect();
  const db = client.db("arp_education");

  const matieres = await db.collection("matieres").find({}).toArray();
  const sante = await fetch(`${BASE}/login`).catch(() => null);
  if (!sante) {
    await client.close();
    throw new Error("serveur injoignable : lance npm start puis relance npm run db:cours");
  }

  let depots = 0, termines = 0, echecs = 0;
  for (const chap of manifeste) {
    const matiere = matieres.find((m) => m.code === chap.matiere);
    if (!matiere) {
      console.log(`  ! ${chap.matiere} absent de la base — chapitre ${chap.numero} ignoré`);
      echecs++;
      continue;
    }
    const fichier = path.join(DOSSIER, chap.fichier);
    if (!fs.existsSync(fichier)) {
      console.log(`  ! fichier manquant : ${chap.fichier}`);
      echecs++;
      continue;
    }

    const form = new FormData();
    form.append("action", "create");
    form.append("matiere_id", String(matiere._id));
    form.append("numero", String(chap.numero));
    form.append("titre", chap.titre);
    form.append("texte", "");
    form.append("fichier", new Blob([fs.readFileSync(fichier)], { type: chap.fichier.endsWith(".pdf") ? "application/pdf" : "application/octet-stream" }), path.basename(chap.fichier));

    const depot = await poster(`retour=matiere_id%3D${matiere._id}`, form, matiere.prof_id);
    if (depot.erreur) {
      const deja = /existe d/.test(depot.message);
      console.log(`  ${deja ? "-" : "!"} ${chap.matiere} chapitre ${chap.numero} : ${depot.message}`);
      if (!deja) echecs++;
      continue;
    }
    depots++;
    console.log(`  ok ${chap.matiere} ${chap.numero} — ${chap.titre} · ${depot.message}`);

    const doitFermer = !(EN_COURS[chap.matiere] ?? []).includes(chap.numero);
    if (!doitFermer) continue;
    const cours = await db.collection("cours").findOne({ matiere_id: matiere._id, numero: chap.numero });
    if (!cours) continue;
    const ferme = await poster(
      `retour=matiere_id%3D${matiere._id}`,
      new URLSearchParams({ action: "terminer", id: String(cours._id) }),
      matiere.prof_id
    );
    if (ferme.erreur) {
      console.log(`     ! ouverture du quiz refusée : ${ferme.message}`);
      echecs++;
    } else {
      termines++;
    }
  }

  console.log(`\nChapitres déposés : ${depots} · quiz ouverts : ${termines} · échecs : ${echecs}`);
  console.log(`${BASE}/cours côté professeur pour les relire, côté élève pour passer les quiz.`);
  await client.close();
})().catch((e) => {
  console.error(`Import interrompu : ${e.message}`);
  process.exit(1);
});
