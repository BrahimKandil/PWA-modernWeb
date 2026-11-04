import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { findOne, findDocs, insertDoc, removeDocs } from "@/lib/db";
import { peut } from "@/lib/permissions";
import { routeurRetour } from "@/lib/retour";
import { revalidatePath } from "next/cache";
import { samediDe, semainePrecedente, verrouillee } from "@/lib/semaine";

const JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"];
const times: Record<number, [string, string]> = { 1: ["09:00", "12:00"], 2: ["13:00", "16:00"] };

async function ecrireSemaine(classeId: number, semaine: string, slots: { jour: string; creneau: number; matiere: number; salle: number }[]) {
  await removeDocs("emplois", { classe_id: classeId, semaine_debut: semaine });
  for (const s of slots) {
    await insertDoc("emplois", {
      semaine_debut: semaine, jour: s.jour, creneau: s.creneau,
      heure_debut: times[s.creneau][0], heure_fin: times[s.creneau][1],
      classe_id: classeId, matiere_id: s.matiere, salle_id: s.salle,
    });
  }
}

export async function POST(req: NextRequest) {
  const route = routeurRetour(req, "/emplois");
  const { erreur, ok, refus } = route;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  if (!peut(session.role, "emplois", "creer")) return refus();
  const form = await req.formData();
  const action = String(form.get("action") ?? "");
  const classeId = Number(form.get("classe_id"));
  const semaine = String(form.get("semaine_debut") ?? "");
  const retourSemaine = `?semaine=${encodeURIComponent(semaine)}&classe_id=${classeId}`;

  // Une semaine est figée dès le samedi 00h qui la clôt ; le passé reste consultable, pas modifiable.
  if ((action === "save-week" || action === "copy-prev") && /^\d{4}-\d{2}-\d{2}$/.test(semaine) && verrouillee(semaine)) {
    return erreur(`semaine verrouillée depuis le samedi ${samediDe(semaine)}`);
  }

  if (action === "save-week") {
    if (!classeId || !/^\d{4}-\d{2}-\d{2}$/.test(semaine)) return erreur("classe et semaine requises");
    const slots: { jour: string; creneau: number; matiere: number; salle: number }[] = [];
    for (const jour of JOURS) {
      for (const creneau of [1, 2]) {
        const matiere = Number(form.get(`${jour}_${creneau}_matiere`) || 0);
        if (!matiere) continue;
        const salle = Number(form.get(`${jour}_${creneau}_salle`) || 0);
        slots.push({ jour, creneau, matiere, salle });
      }
    }
    if (slots.some((s) => !s.salle)) return erreur("choisir une salle pour chaque créneau");
    if (!(await findOne("classes", { id: classeId }))) return erreur("classe introuvable");
    for (const s of slots) {
      if (!(await findOne("matieres", { id: s.matiere, classe_id: classeId })) || !(await findOne("salles", { id: s.salle }))) {
        return erreur("matière ou salle non valide pour cette classe");
      }
    }
    await ecrireSemaine(classeId, semaine, slots);
  }

  if (action === "copy-prev") {
    if (!classeId || !/^\d{4}-\d{2}-\d{2}$/.test(semaine)) return erreur("classe et semaine requises");
    const prevSem = semainePrecedente(semaine);
    const rows = await findDocs("emplois", { classe_id: classeId, semaine_debut: prevSem });
    if (rows.length === 0) return erreur("aucun créneau à copier dans la semaine précédente");
    await ecrireSemaine(classeId, semaine, rows.map((r) => ({ jour: r.jour, creneau: r.creneau, matiere: r.matiere_id, salle: r.salle_id })));
  }

  revalidatePath("/emplois");
  revalidatePath("/");
  return route.vers(`${retourSemaine}&ok=${encodeURIComponent(action === "copy-prev" ? "semaine copiée" : "semaine enregistrée")}`);
}
