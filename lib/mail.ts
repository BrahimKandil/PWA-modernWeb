import { insertDoc, nowLocal } from "./db";

export async function sendEmail(destinataire: string, sujet: string, contenu: string, lien?: string) {
  await insertDoc("emails", { destinataire, sujet, contenu, lien: lien ?? null, cree_le: nowLocal() });
}
