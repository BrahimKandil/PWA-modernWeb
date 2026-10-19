export default function LoginPage({ searchParams }: { searchParams: { error?: string; reset?: string } }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-bold text-indigo-700 mb-1">ARP Éducation</h1>
        <p className="text-sm text-slate-500 mb-6">Connectez-vous pour accéder à vos modules.</p>
        {searchParams.error && (
          <div className="badge-red mb-4 w-full">Email ou mot de passe incorrect (ou compte non activé — voir l&apos;email d&apos;activation).</div>
        )}
        {searchParams.reset && (
          <div className="badge-green mb-4 w-full">Mot de passe défini avec succès. Vous pouvez vous connecter.</div>
        )}
        <form action="/api/auth/login" method="post" className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required placeholder="admin@arp.edu" />
          </div>
          <div>
            <label className="label" htmlFor="password">Mot de passe</label>
            <input className="input" id="password" name="password" type="password" required placeholder="••••••" />
          </div>
          <button className="btn-primary w-full justify-center py-2.5">Se connecter</button>
        </form>
        <div className="mt-6 text-xs text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-200">
          <p className="font-semibold mb-1">Comptes de démonstration (mot de passe : <code>123456</code>)</p>
          <p>Admin : <code>admin@arp.edu</code></p>
          <p>Prof : <code>sami.benali@arp.edu</code></p>
          <p>Étudiant : <code>ahmed.j@arp.edu</code></p>
        </div>
      </div>
    </div>
  );
}
