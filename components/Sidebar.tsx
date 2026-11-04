"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SidebarUser {
  nom: string;
  prenom: string;
  role: "admin" | "prof" | "etudiant";
}

const LINKS: { href: string; label: string; icon: string; roles?: string[] }[] = [
  { href: "/", label: "Tableau de bord", icon: "🏠" },
  { href: "/users", label: "Utilisateurs", icon: "👥", roles: ["admin"] },
  { href: "/classes", label: "Classes", icon: "🎒" },
  { href: "/emails", label: "Emails envoyés", icon: "📧" },
  { href: "/presences", label: "Présences", icon: "✅" },
  { href: "/emplois", label: "Emploi du temps", icon: "🗓️" },
  { href: "/matieres", label: "Matières", icon: "📚" },
  { href: "/cours", label: "Cours", icon: "📗", roles: ["prof", "etudiant"] },
  { href: "/salles", label: "Salles", icon: "🏫" },
  { href: "/notes", label: "Notes", icon: "🎓" },
  { href: "/comptes-rendus", label: "Compte rendus", icon: "📄" },
  { href: "/reclamations", label: "Réclamations", icon: "📣" },
  { href: "/notifications", label: "Notifications", icon: "🔔" },
];

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrateur",
  prof: "Professeur",
  etudiant: "Étudiant",
};

export default function Sidebar({ user }: { user: SidebarUser | null }) {
  const pathname = usePathname();
  if (!user) return null;

  const links = LINKS.filter((l) => !l.roles || l.roles.includes(user.role));

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-slate-900 text-slate-100 flex overflow-x-auto">
        {links.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] whitespace-nowrap ${
                active ? "text-indigo-400" : "text-slate-300"
              }`}
            >
              <span className="text-base">{l.icon}</span>
              {l.label.split(" ")[0]}
            </Link>
          );
        })}
        <form action="/api/auth/logout" method="post" className="flex flex-col items-center justify-center px-3 py-2">
          <button className="text-[10px] text-slate-300">⎋<br/>Quitter</button>
        </form>
      </nav>
      <aside className="w-60 shrink-0 bg-slate-900 text-slate-100 flex-col hidden md:flex sticky top-0 h-screen">
      <div className="p-4 border-b border-slate-700">
        <div className="text-lg font-bold text-white">ARP Éducation</div>
        <div className="text-xs text-slate-400 mt-1">
          {user.prenom} {user.nom} · {ROLE_LABEL[user.role]}
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {links.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                active ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span>{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </nav>
      <form action="/api/auth/logout" method="post" className="p-3 border-t border-slate-700">
        <button className="w-full rounded-lg bg-slate-800 hover:bg-slate-700 py-2 text-sm text-slate-200">
          Déconnexion
        </button>
      </form>
    </aside>
    </>
  );
}
