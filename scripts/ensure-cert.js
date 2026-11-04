/* Certificat TLS auto-adaptatif pour le serveur LAN de ARP Éducation.
   L'appareil change de réseau (box, hotspot, Wi-Fi de l'école) → l'IP du PC change →
   il suffisait avant de relancer scripts/make-cert.ps1 à la main. Ici le serveur HTTPS
   vérifie tout seul, et resign + remplace le certificat sans redémarrer.
   Le mkcert rootCA ne change pas, donc rien à réinstaller sur le téléphone. */
const { networkInterfaces } = require("node:os");
const { execFileSync } = require("node:child_process");
const { readFileSync, writeFileSync, renameSync, copyFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { X509Certificate } = require("node:crypto");

const RACINE = join(__dirname, "..");
const CERTS = join(RACINE, "certs");
const PEM = join(CERTS, "arp-lan.pem");
const CLE = join(CERTS, "arp-lan-key.pem");
const CA = join(CERTS, "arp-root-ca.pem");
const MKCERT = join(process.env.USERPROFILE || require("node:os").homedir(), "Tools", "mkcert.exe");

const PRIVEE = (ip) => /^(192\.168\.|172\.1[6-9]\.|172\.2[0-9]\.|172\.3[01]\.|10\.)/.test(ip);
const VIRTUEL = (alias) => /vmware|vethernet|hyper-v|virtualbox|loopback|tunnel|wsl|bluetooth|apipa/i.test(alias);

// Toutes les adresses IPv4 privées des vraies cartes réseau (box, hotspot, Ethernet…).
function ipReseau() {
  const ips = [];
  for (const [alias, liste] of Object.entries(networkInterfaces())) {
    if (VIRTUEL(alias)) continue;
    for (const n of liste ?? []) if (n.family === "IPv4" && !n.internal && PRIVEE(n.address)) ips.push(n.address);
  }
  const wifi = (process.env.WIFI_IP ?? "").trim();
  return [...new Set(wifi && PRIVEE(wifi) ? [wifi, ...ips] : ips)];
}

// L'IP à montrer dans l'URL : la Wi-Fi en priorité, sinon la première privée trouvée.
function ipAffichee() {
  const ips = ipReseau();
  for (const [alias, liste] of Object.entries(networkInterfaces()))
    if (/wi-?fi|wlan/i.test(alias)) {
      const n = (liste ?? []).find((x) => x.family === "IPv4" && !x.internal && PRIVEE(x.address));
      if (n) return n.address;
    }
  return ips[0] ?? null;
}

function ipDansCertificat() {
  if (!existsSync(PEM)) return [];
  try {
    const san = new X509Certificate(readFileSync(PEM)).subjectAltName ?? "";
    return [...san.matchAll(/IP Address:([\d.]+)/g)].map((m) => m[1]);
  } catch {
    return [];
  }
}

function aBesoinDUnNouveauCert() {
  const souhaite = ipReseau();
  if (souhaite.length === 0) return false;
  if (!existsSync(PEM) || !existsSync(CLE)) return true;
  // 127.0.0.1 (et les adresses APIPA) sont dans le certificat sans etre des adresses reseau : on les ignore.
  const actuelles = ipDansCertificat().filter(PRIVEE);
  // On resign dès que la liste diverge (nouvelle IP gagnée, ancienne IP perdue) :
  // le certificat reste exactement le miroir des adresses du moment.
  return souhaite.some((ip) => !actuelles.includes(ip)) || actuelles.some((ip) => !souhaite.includes(ip));
}

function generer(hotes) {
  const ips = ipReseau();
  if (ips.length === 0) throw new Error("aucune IP privée détectée");
  const noms = [...new Set([].concat(hotes).filter(Boolean))];
  const tmpPem = join(CERTS, `.tmp-arp-lan-${process.pid}.pem`);
  const tmpCle = join(CERTS, `.tmp-arp-lan-${process.pid}-key.pem`);
  execFileSync(MKCERT, ["-cert-file", tmpPem, "-key-file", tmpCle, ...ips, "127.0.0.1", "localhost", ...noms], { stdio: "pipe" });
  renameSync(tmpPem, PEM);
  renameSync(tmpCle, CLE);
  const caroot = execFileSync(MKCERT, ["-CAROOT"], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
  copyFileSync(join(caroot, "rootCA.pem"), CA);
  return ips;
}

// À l'appel : crée le certificat si nécessaire et rend la paire clé/certifikat prête à servir.
function materiel(hotes) {
  if (aBesoinDUnNouveauCert() || !existsSync(PEM) || !existsSync(CLE)) {
    const ips = generer(hotes);
    console.log(`Certificat généré pour : ${ips.join(", ")}`);
  }
  return { key: readFileSync(CLE), cert: readFileSync(PEM) };
}

// En cours de service : resign et applique à chaud (aucun redémarrage, aucune coupure).
function surveille(server, hotes, intervalleMs = 30000) {
  let dernier = 0;
  return setInterval(() => {
    if (Date.now() - dernier < 60000 || !aBesoinDUnNouveauCert()) return;
    dernier = Date.now();
    try {
      const ips = generer(hotes);
      server.setSecureContext({ key: readFileSync(CLE), cert: readFileSync(PEM) });
      console.log(`Réseau changé → certificat resigné à chaud pour : ${ips.join(", ")}`);
      console.log(`  Nouvelle adresse : https://${ipAffichee() ?? "<IP-du-PC>"}`);
    } catch (e) {
      console.error("Resignation du certificat échouée :", e.message);
    }
  }, intervalleMs);
}

module.exports = { ipReseau, ipAffichee, materiel, surveille, aBesoinDUnNouveauCert, PEM, CLE, CA, MKCERT };
