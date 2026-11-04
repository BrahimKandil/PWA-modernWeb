import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import AssistantFlottant from "@/components/AssistantFlottant";
import PwaRegister from "@/components/PwaRegister";
import { getSession } from "@/lib/auth";
import { peut } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "ARP Éducation",
  description: "Application ARP éducation : présences, emplois, notes, compte rendus, réclamations, notifications",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ARP Éducation",
  },
  icons: {
    icon: "/icons/icon.png",
    apple: "/icons/icon.png",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  return (
    <html lang="fr">
      <head>
        <meta name="theme-color" content="#4f46e5" />
      </head>
      <body>
        <PwaRegister />
        <div className="flex min-h-screen">
          <Sidebar user={user ? { nom: user.nom, prenom: user.prenom, role: user.role } : null} />
          <main className="flex-1 p-4 pb-20 md:p-8 md:pb-8 max-w-6xl">{children}</main>
        </div>
        {user && peut(user.role, "assistant") && <AssistantFlottant prenom={user.prenom} role={user.role} />}
      </body>
    </html>
  );
}
