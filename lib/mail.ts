import { getDb } from "./db";

export function sendEmail(destinataire: string, sujet: string, contenu: string, lien?: string) {
  getDb()
    .prepare(`INSERT INTO emails (destinataire, sujet, contenu, lien, cree_le) VALUES (?,?,?,?,datetime('now','localtime'))`)
    .run(destinataire, sujet, contenu, lien ?? null);
}
