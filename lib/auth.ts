import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, verifyPassword, hashPassword } from "./db";
import crypto from "crypto";

const SECRET = process.env.ARP_SECRET ?? "arp-education-demo-secret";

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

function sign(userId: number) {
  return crypto.createHmac("sha256", SECRET).update(String(userId)).digest("hex").slice(0, 16);
}

export function login(email: string, password: string): SessionUser | null {
  const user = getDb()
    .prepare(`SELECT * FROM users WHERE email = ? AND actif = 1`)
    .get(email.trim().toLowerCase()) as any;
  if (!user || !verifyPassword(password, user.mot_de_passe)) return null;
  return toSession(user);
}

function toSession(user: any): SessionUser {
  const classe = user.classe_id
    ? (getDb().prepare(`SELECT nom FROM classes WHERE id=?`).get(user.classe_id) as any)
    : null;
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

export function createInvitation(userId: number): string {
  const token = crypto.randomBytes(24).toString("hex");
  getDb()
    .prepare(`INSERT INTO reset_tokens (token, user_id, cree_le) VALUES (?,?,datetime('now','localtime'))`)
    .run(token, userId);
  return token;
}

export function getResetUser(token: string): SessionUser | null {
  const row = getDb()
    .prepare(`SELECT u.*, t.utilise FROM reset_tokens t JOIN users u ON u.id=t.user_id WHERE t.token=? AND t.utilise=0`)
    .get(token) as any;
  return row ? toSession(row) : null;
}

export function setPasswordWithToken(token: string, newPassword: string): boolean {
  const db = getDb();
  const row = db.prepare(`SELECT user_id, utilise FROM reset_tokens WHERE token=? AND utilise=0`).get(token) as any;
  if (!row) return false;
  db.prepare(`UPDATE users SET mot_de_passe=? WHERE id=?`).run(hashPassword(newPassword), row.user_id);
  db.prepare(`UPDATE reset_tokens SET utilise=1 WHERE token=?`).run(token);
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

export function getSession(): SessionUser | null {
  const raw = cookies().get("arp_session")?.value;
  if (!raw) return null;
  const [idStr, sig] = raw.split(".");
  const id = Number(idStr);
  if (!Number.isInteger(id) || sig !== sign(id)) return null;
  const user = getDb().prepare(`SELECT * FROM users WHERE id = ? AND actif = 1`).get(id) as any;
  if (!user) return null;
  return toSession(user);
}

export function requireRole(...roles: Role[]): SessionUser {
  const session = getSession();
  if (!session) redirect("/login");
  if (!roles.includes(session.role)) redirect("/?erreur=acces+refuse");
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
