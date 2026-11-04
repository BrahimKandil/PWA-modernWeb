import { inflateRawSync, inflateSync, constants as Z } from "zlib";

/* Lecture des supports de cours deposés par le prof, sans dépendance externe.
   Un .docx est un ZIP : on relit le répertoire central pour retrouver word/document.xml.
   Un .pdf est traité au plus simple (flux décompressés + opérateurs Tj/TJ) : si le texte
   récupéré est trop court, l'écran demande de coller le texte — on n'invente jamais un cours. */

export type Fichier = "docx" | "pdf";

const estZip = (b: Buffer) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

// nom de membre -> contenu décompressé
export function membresZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  if (!estZip(buf)) return out;

  let eocd = -1; // signature de fin de répertoire central, cherchée en remontant depuis la fin
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;

  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < total && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const methode = buf.readUInt16LE(p + 10);
    const comprime = buf.readUInt32LE(p + 20);
    const nonComprime = buf.readUInt32LE(p + 24);
    const nomLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commLen = buf.readUInt16LE(p + 32);
    const entete = buf.readUInt32LE(p + 42);
    const nom = buf.toString("utf8", p + 46, p + 46 + nomLen);
    p += 46 + nomLen + extraLen + commLen;

    if (nom.endsWith("/") || entete + 30 > buf.length) continue;
    if (buf.readUInt32LE(entete) !== 0x04034b50) continue;
    // l'en-tête local a sa propre taille d'extra : on la relit à l'en-tête local, pas au central
    const debut = entete + 30 + buf.readUInt16LE(entete + 26) + buf.readUInt16LE(entete + 28);
    const brut = buf.subarray(debut, debut + (methode === 0 ? nonComprime : comprime));
    try {
      out.set(nom, methode === 8 ? inflateRawSync(brut) : Buffer.from(brut));
    } catch {
      // membre tronqué ou compression exotique : on l'ignore, le reste du fichier reste lisible
    }
  }
  return out;
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

export function texteDocx(buf: Buffer): string {
  const doc = membresZip(buf).get("word/document.xml");
  if (!doc) return "";
  return decodeXml(doc.toString("utf8"))
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p\s*>/g, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// les littéraux PDF échappent le backslash, les parenthèses et les codes octaux
function decodeLitteralPdf(s: string) {
  return s
    .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1");
}

type TableGlyphes = { map: Map<number, string>; octets: number };

/* Les polices incorporées (Chrome, LibreOffice) n'écrivent pas du texte mais des numéros de glyphe.
   La table ToUnicode du PDF dit quel caractère correspond à chaque numéro : sans elle, on ne
   récupère que du bruit. Largeur par défaut : 2 octets (Identity-H). */
function lireCMap(contenu: string): TableGlyphes | null {
  if (!/begincmap/.test(contenu)) return null;
  const map = new Map<number, string>();
  let octets = 2;
  const espace = contenu.match(/begincodespacerange([\s\S]*?)endcodespacerange/);
  if (espace) {
    const premier = espace[1].match(/<([0-9A-Fa-f\s]+)>/);
    if (premier) octets = Math.max(1, Math.round(premier[1].replace(/\s/g, "").length / 2));
  }
  const hexVersString = (hex: string) => {
    const clean = hex.replace(/\s/g, "");
    let s = "";
    for (let i = 0; i + 4 <= clean.length; i += 4) s += String.fromCharCode(parseInt(clean.slice(i, i + 4), 16));
    if (!clean.length || clean.length % 4) s += String.fromCharCode(parseInt(clean, 16));
    return s.replace(/\0+$/, "");
  };
  const bfchar = contenu.match(/beginbfchar([\s\S]*?)endbfchar/g) || [];
  for (const bloc of bfchar) {
    for (const [, src, dst] of bloc.matchAll(/<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>/g)) {
      map.set(parseInt(src.replace(/\s/g, ""), 16), hexVersString(dst));
    }
  }
  const bfrange = contenu.match(/beginbfrange([\s\S]*?)endbfrange/g) || [];
  for (const bloc of bfrange) {
    for (const [, lo, hi, dst] of bloc.matchAll(/<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>/g)) {
      const debut = parseInt(lo.replace(/\s/g, ""), 16);
      const fin = parseInt(hi.replace(/\s/g, ""), 16);
      const base = parseInt(dst.replace(/\s/g, ""), 16);
      for (let c = debut; c <= fin && c - debut < 600; c++) map.set(c, String.fromCharCode(base + (c - debut)));
    }
  }
  return map.size ? { map, octets } : { map, octets };
}

// Un PDF mêle souvent plusieurs polices, chacune avec sa table : on cherche le glyphe dans toutes.
function decoderHex(hex: string, tables: TableGlyphes[]): string {
  const clean = hex.replace(/\s/g, "");
  const table = tables[0] ?? null;
  if (!table || !table.map.size) {
    // pas de table : on suppose de l'UTF-16BE brut (cas des PDF simples)
    let s = "";
    for (let i = 0; i + 4 <= clean.length; i += 4) s += String.fromCharCode(parseInt(clean.slice(i, i + 4), 16));
    return s;
  }
  const pas = table.octets * 2;
  let s = "";
  for (let i = 0; i + pas <= clean.length; i += pas) {
    const code = parseInt(clean.slice(i, i + pas), 16);
    let trouve: string | undefined;
    for (const t of tables) {
      trouve = t.map.get(code);
      if (trouve) break;
    }
    s += trouve ?? (code >= 32 && code < 127 ? String.fromCharCode(code) : "");
  }
  return s;
}

// un flux, décompressé comme il vient : zlib (78 9c…), raw deflate, ou texte brut
function decompresseFlux(zone: Buffer): string {
  for (const essai of [
    () => inflateSync(zone),
    () => inflateRawSync(zone, { finishFlush: Z.Z_SYNC_FLUSH }),
    () => zone,
  ]) {
    try {
      return Buffer.from(essai()).toString("latin1");
    } catch {
      // format suivant
    }
  }
  return "";
}

/* Extraction : chaque flux est décompressé, on garde les tables ToUnicode puis les flux de
   contenu (ceux qui contiennent BT + Tj/TJ). Un scan ou un PDF sans texte donne une chaîne vide,
   et l'écran Cours demande alors de coller le texte du chapitre. */
export function textePdf(buf: Buffer): string {
  const flux: string[] = [];
  const brut = buf.toString("latin1");
  // « stream » ne doit pas être la fin de « endstream » : sinon chaque fin de flux en crée un faux
  const chercheur = /(?<!end)stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = chercheur.exec(brut))) {
    const debut = m.index + m[0].length;
    const fin = brut.indexOf("endstream", debut);
    if (fin < 0) break;
    chercheur.lastIndex = fin;
    const contenu = decompresseFlux(buf.subarray(debut, fin));
    if (contenu) flux.push(contenu);
  }

  const tables = flux
    .map(lireCMap)
    .filter((t): t is TableGlyphes => !!t && t.map.size > 0)
    .sort((a, b) => b.map.size - a.map.size);

  const lignes: string[] = [];
  for (const contenu of flux) {
    if (!/\bBT\b/.test(contenu) || !/\bTj\b|\bTJ\b/.test(contenu)) continue;

    // une ligne = un objet texte (BT … ET) ; Td/TD séparent des glyphes, pas des lignes
    for (const segment of contenu.split(/\bBT\b/)) {
      // une seule passe : un littéral suivi d'un hex doit rester dans l'ordre de la page
      const chaines = /\(((?:[^()\\]|\\.)*)\)|<([0-9A-Fa-f\s]+)>/g;
      const bouts: string[] = [];
      let c: RegExpExecArray | null;
      while ((c = chaines.exec(segment))) {
        if (c[1] !== undefined) bouts.push(decodeLitteralPdf(c[1]));
        else if (c[2].length >= 2) bouts.push(decoderHex(c[2], tables));
      }
      const ligne = bouts.join("").replace(/\s{2,}/g, " ").trim();
      if (ligne) lignes.push(ligne);
    }
  }
  return lignes
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function texteDepuisFichier(nom: string, buf: Buffer): { type: Fichier; texte: string } | null {
  const n = String(nom).toLowerCase();
  if (n.endsWith(".docx") || estZip(buf)) return { type: "docx", texte: texteDocx(buf) };
  if (n.endsWith(".pdf") || buf.subarray(0, 4).toString("latin1") === "%PDF") return { type: "pdf", texte: textePdf(buf) };
  return null;
}

/* Découpage pour le RAG : ~800 caractères, coupes aux fins de phrase, et un léger recouvrement
   pour ne pas couper une notion en deux entre deux passages. */
export function decoupe(texte: string, taille = 800, recouvrement = 120): string[] {
  const propre = String(texte).replace(/\r/g, "").trim();
  if (propre.length <= taille) return propre ? [propre] : [];
  const phrases = propre.split(/(?<=[.!?;:])\s+|\n+/).filter((p) => p.trim().length > 0);
  const blocs: string[] = [];
  let courant = "";
  for (const ph of phrases) {
    if (courant.length + ph.length > taille && courant) {
      blocs.push(courant.trim());
      courant = courant.slice(-recouvrement) + " " + ph;
    } else {
      courant = courant ? `${courant} ${ph}` : ph;
    }
    if (courant.length > taille * 1.6) {
      blocs.push(courant.slice(0, taille).trim());
      courant = courant.slice(taille - recouvrement);
    }
  }
  if (courant.trim()) blocs.push(courant.trim());
  return blocs.filter((b) => b.length > 40);
}

// Un chapitre doit porter assez de texte pour que le quiz soit ancré sur quelque chose de réel.
export const MIN_TEXTE_CHAPITRE = 300;
export function texteSuffisant(texte: string) {
  return String(texte).replace(/\s+/g, " ").trim().length >= MIN_TEXTE_CHAPITRE;
}
