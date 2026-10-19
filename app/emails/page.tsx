import { getDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function EmailsPage() {
  requireRole("admin");
  const emails = getDb().prepare(`SELECT * FROM emails ORDER BY cree_le DESC LIMIT 100`).all() as any[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">📧 Boîte d&apos;envoi (emails)</h1>
        <p className="text-sm text-slate-500">
          Démonstration : les emails envoyés par l&apos;application apparaissent ici. En production, cette file serait branchée sur un serveur SMTP (nodemailer).
          Cliquez sur « Ouvrir le lien » pour simuler le clic de l&apos;utilisateur dans son email.
        </p>
      </div>

      <div className="space-y-3">
        {emails.length === 0 && <p className="text-sm text-slate-500">Aucun email envoyé.</p>}
        {emails.map((m) => (
          <div key={m.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{m.sujet}</h3>
                <p className="text-xs text-slate-500">À : {m.destinataire} · {m.cree_le}</p>
              </div>
              {m.lien && <a className="btn-primary text-xs" href={m.lien}>Ouvrir le lien</a>}
            </div>
            <p className="text-sm text-slate-600 mt-2">{m.contenu}</p>
            {m.lien && <p className="text-xs text-slate-400 mt-1 break-all">{m.lien}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
