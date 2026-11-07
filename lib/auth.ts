import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPassword, hashPassword, findOne, insertDoc, updateDoc, nowLocal } from "./db";
import { readFileSync } from "fs";
import path from "path";
import crypto from "crypto";

export type Role = "admin" | "prof" | "etudiant";

export interface SessionUser {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  role: Role;
  classe_nom: string | null;
  classe_id: number | null;
}

/* Le depot etant public, aucun secret ne peut etre codé en dur : avec « arp-education-demo-secret »
   n'importe qui aurait pu fabriquer un cookie d'admin. Variable d'environnement (Vercel), sinon le
   fichier hors depot deja lu par server-https.js (npm run dev ne passe pas par ce serveur). */
function secret(): string {
  const varEnv = (process.env.ARP_SECRET ?? "").trim();
  if (varEnv) return varEnv;
  try {
    return readFileSync(path.join(process.cwd(), ".tunnel-secret"), "utf8").trim();
  } catch {
    return "";
  }
}

function sign(userId: number) {
  const s = secret();
  if (!s) throw new Error("ARP_SECRET absent : definir la variable d'environnement ou creer .tunnel-secret");
  return crypto.createHmac("sha256", s).update(String(userId)).digest("hex").slice(0, 16);
}

export async function login(email: string, password: string): Promise<SessionUser | null> {
  const user = await findOne("users", { email: email.trim().toLowerCase(), actif: 1 });
  if (!user || !verifyPassword(password, user.mot_de_passe)) return null;
  return toSession(user);
}

async function toSession(user: any): Promise<SessionUser> {
  const classe = user.classe_id ? await findOne("classes", { id: user.classe_id }) : null;
  return {
    id: user.id,
    nom: user.nom,
    prenom: user.prenom,
    email: user.email,
    role: user.role as Role,
    classe_nom: classe?.nom ?? null,
    classe_id: user.classe_id,
  };
}

export async function createInvitation(userId: number): Promise<string> {
  const token = crypto.randomBytes(24).toString("hex");
  await insertDoc("reset_tokens", { token, user_id: userId, cree_le: nowLocal(), utilise: 0 });
  return token;
}

export async function getResetUser(token: string): Promise<SessionUser | null> {
  const row = await findOne("reset_tokens", { token, utilise: 0 });
  if (!row) return null;
  const user = await findOne("users", { id: row.user_id });
  return user ? toSession(user) : null;
}

export async function setPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
  const row = await findOne("reset_tokens", { token, utilise: 0 });
  if (!row) return false;
  await updateDoc("users", { id: row.user_id }, { mot_de_passe: hashPassword(newPassword) });
  await updateDoc("reset_tokens", { token }, { utilise: 1 });
  return true;
}

export function setSessionCookie(user: SessionUser) {
  cookies().set("arp_session", `${user.id}.${sign(user.id)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie() {
  cookies().delete("arp_session");
}

export async function getSession(): Promise<SessionUser | null> {
  const raw = cookies().get("arp_session")?.value;
  if (!raw) return null;
  const [idStr, sig] = raw.split(".");
  const id = Number(idStr);
  if (!Number.isInteger(id) || sig !== sign(id)) return null;
  const user = await findOne("users", { id, actif: 1 });
  if (!user) return null;
  return toSession(user);
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!roles.includes(session.role)) redirect("/?erreur=acces+refuse");
  return session;
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function mondayOf(d = new Date()) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

