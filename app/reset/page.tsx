import { getResetUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: { token?: string; error?: string } }) {
  const user = searchParams.token ? await getResetUser(searchParams.token) : null;

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-bold text-indigo-700 mb-1">Définir mon mot de passe</h1>

        {!searchParams.token && <p className="text-sm text-red-600">Lien d&apos;activation manquant.</p>}
        {searchParams.token && !user && (
          <p className="text-sm text-red-600">Ce lien d&apos;activation est invalide ou a déjà été utilisé. Demandez un renvoi à l&apos;administration.</p>
        )}
        {searchParams.error === "mdp" && <p className="text-sm text-red-600">Mot de passe trop court (6 caractères min.) ou les deux saisies diffèrent.</p>}

        {user && (
          <>
            <p className="text-sm text-slate-500 mb-4">
              Compte créé pour <span className="font-semibold">{user.prenom} {user.nom}</span> ({user.email}). Choisissez votre mot de passe.
            </p>
            <form action="/api/auth/reset" method="post" className="space-y-4">
              <input type="hidden" name="token" value={searchParams.token} />
              <div><label className="label">Nouveau mot de passe</label><input className="input" type="password" name="password" minLength={6} required /></div>
              <div><label className="label">Confirmer</label><input className="input" type="password" name="confirm" minLength={6} required /></div>
              <button className="btn-primary w-full justify-center py-2.5">Valider et activer mon compte</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
