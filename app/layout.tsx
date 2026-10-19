import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import PwaRegister from "@/components/PwaRegister";
import { getSession } from "@/lib/auth";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const user = getSession();
  return (
    <html lang="fr">
      <body>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#4f46e5" />
        <PwaRegister />
        <div className="flex min-h-screen">
          <Sidebar user={user ? { nom: user.nom, prenom: user.prenom, role: user.role } : null} />
          <main className="flex-1 p-4 pb-20 md:p-8 md:pb-8 max-w-6xl">{children}</main>
        </div>
      </body>
    </html>
  );
}
