type Carte = {
  label: string;
  valeur: string | number;
  detail?: string;
  ton?: "vert" | "rouge" | "ambre" | "bleu" | "neutre";
};

const TONS: Record<string, string> = {
  vert: "text-green-600",
  rouge: "text-red-600",
  ambre: "text-amber-600",
  bleu: "text-indigo-600",
  neutre: "text-slate-700",
};

// Petit bandeau de chiffres au-dessus des tableaux : moyenne, taux de présence, compteur de dépôts.
export default function Stats({ cartes }: { cartes: Carte[] }) {
  const utiles = cartes.filter((c) => c !== undefined);
  if (utiles.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {utiles.map((c) => (
        <div key={c.label} className="card flex-1 min-w-[140px] py-3">
          <p className="label !mb-0">{c.label}</p>
          <p className={`text-2xl font-bold ${TONS[c.ton ?? "neutre"]}`}>{c.valeur}</p>
          {c.detail && <p className="text-xs text-slate-500">{c.detail}</p>}
        </div>
      ))}
    </div>
  );
}
