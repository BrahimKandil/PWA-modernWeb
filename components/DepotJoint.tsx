"use client";
import { useRef, useState } from "react";

/* Pièce jointe du dépôt d'un compte rendu. Le fichier est relutu côté serveur (/api/comptes-rendus/extraction)
   et son texte est versé dans la zone de réponse : l'étudiant relit puis corrige avant de déposer.
   Rien n'est enregistré pendant cette lecture : le binaire n'est stocké que si le formulaire est déposé. */
export default function DepotJoint({
  action,
  assignmentId,
  depotId,
  contenu,
  bouton,
  fichier,
}: {
  action: "depot" | "update_depot";
  assignmentId?: number;
  depotId?: number;
  contenu?: string;
  bouton: string;
  fichier?: string | null;
}) {
  const zone = useRef<HTMLTextAreaElement>(null);
  const entree = useRef<HTMLInputElement>(null);
  const [nom, setNom] = useState("");
  const [extrait, setExtrait] = useState("");
  const [info, setInfo] = useState("");
  const [charge, setCharge] = useState(false);
  const [vide, setVide] = useState(!contenu);

  function verser(texte: string) {
    if (zone.current) zone.current.value = texte;
    setVide(false);
    setExtrait("");
    setInfo("Texte du fichier inséré : relisez et complétez avant de déposer.");
  }

  async function lire() {
    const f = entree.current?.files?.[0];
    setExtrait("");
    setInfo("");
    setNom("");
    if (!f) return;
    setNom(f.name);
    setCharge(true);

    const corps = new FormData();
    corps.set("fichier", f);
    const res = await fetch("/api/comptes-rendus/extraction", { method: "post", body: corps }).catch(() => null);
    setCharge(false);
    if (!res) {
      setNom("");
      setInfo("Lecture impossible (réseau interrompu).");
      return;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNom("");
      setInfo(String(json.erreur ?? "Lecture du fichier impossible."));
      return;
    }

    const texte = String(json.texte ?? "").trim();
    if (!texte) {
      setInfo("Aucun texte récupérable (document scanné ?) : le fichier reste joint, rédigez votre réponse.");
      return;
    }
    if (String(zone.current?.value ?? "").trim() === "") verser(texte);
    else {
      setExtrait(texte);
      setInfo("Fichier joint ; son texte est prêt à être inséré.");
    }
  }

  function retirer() {
    if (entree.current) entree.current.value = "";
    setNom("");
    setExtrait("");
    setInfo("");
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="action" value={action} />
      {assignmentId != null && <input type="hidden" name="assignment_id" value={assignmentId} />}
      {depotId != null && <input type="hidden" name="id" value={depotId} />}

      <div>
        <label className="label">Votre compte rendu</label>
        <textarea
          ref={zone}
          className="input"
          name="contenu"
          rows={4}
          defaultValue={contenu}
          placeholder="Objectifs, étapes, résultats…"
          required
          onChange={(e) => setVide(e.target.value.trim() === "")}
        />
      </div>

      <div>
        <label className="label">Pièce jointe (facultatif — .docx ou .pdf, 4 Mo maximum)</label>
        <input ref={entree} className="input" type="file" name="fichier" accept=".docx,.pdf" onChange={lire} />
      </div>

      {fichier && <p className="text-xs text-slate-500">Fichier déjà joint : {fichier}</p>}
      {nom && <p className="text-xs text-slate-500">📎 {nom}{charge ? " — lecture…" : ""}</p>}
      {info && <p className="text-xs text-slate-500">{info}</p>}

      {nom && !charge && (
        <button type="button" className="btn-ghost text-xs" onClick={retirer}>
          Retirer le fichier
        </button>
      )}
      {extrait && !vide && (
        <button type="button" className="btn-ghost text-xs" onClick={() => verser(extrait)}>
          Reprendre le texte du fichier
        </button>
      )}

      <button className="btn-primary">{bouton}</button>
    </div>
  );
}
