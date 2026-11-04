import { lien, type EtatPagination } from "@/lib/filtres";

/* Liens purs, donc Server Component : la page suivante est juste ?page=3. */
export default function Pagination({
  base,
  params,
  etat,
}: {
  base: string;
  params: Record<string, string | string[] | undefined>;
  etat: EtatPagination;
}) {
  if (etat.total === 0) return null;
  const pageVers = (n: number) => lien(base, params, { page: n <= 1 ? "" : String(n) });
  const a = Math.max(1, Math.min(etat.page - 2, etat.pages - 4));
  const b = Math.min(etat.pages, a + 4);
  const numerotrees: number[] = [];
  for (let n = a; n <= b; n++) numerotrees.push(n);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-500">
        {etat.de}–{etat.a} sur {etat.total}
      </span>
      {etat.page > 1 && (
        <a href={pageVers(etat.page - 1)} className="btn-ghost text-xs">
          ←
        </a>
      )}
      {a > 1 && (
        <>
          <a href={pageVers(1)} className="btn-ghost text-xs">
            1
          </a>
          <span className="text-slate-400">…</span>
        </>
      )}
      {numerotrees.map((n) =>
        n === etat.page ? (
          <span key={n} className="badge-blue">
            {n}
          </span>
        ) : (
          <a key={n} href={pageVers(n)} className="btn-ghost text-xs">
            {n}
          </a>
        )
      )}
      {b < etat.pages && (
        <>
          <span className="text-slate-400">…</span>
          <a href={pageVers(etat.pages)} className="btn-ghost text-xs">
            {etat.pages}
          </a>
        </>
      )}
      {etat.page < etat.pages && (
        <a href={pageVers(etat.page + 1)} className="btn-ghost text-xs">
          →
        </a>
      )}
    </div>
  );
}
