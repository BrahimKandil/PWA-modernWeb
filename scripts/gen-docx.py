# Génère les 25 chapitres de démonstration en vrais .docx (python-docx) + le manifest lu par l'import.
import io, json, os, sys
from docx import Document
from docx.shared import Pt

SRC = os.path.dirname(os.path.abspath(__file__))
CIBLE = r"C:\Users\USER\OneDrive\Desktop\test\arp\cours-demo"
contenu = json.loads(io.open(os.path.join(SRC, "cours-contenu.json"), encoding="utf-8").read())

manifeste = []
for code, chapitres in contenu.items():
    dossier = os.path.join(CIBLE, code)
    os.makedirs(dossier, exist_ok=True)
    for numero, chap in enumerate(chapitres, 1):
        doc = Document()
        doc.add_heading(f"Chapitre {numero} — {chap['titre']}", level=1)
        doc.add_paragraph(chap["intro"])
        for i, bloc in enumerate(chap["points"], 1):
            titre = bloc.split(":")[0][:60]
            p = doc.add_paragraph()
            r = p.add_run(f"{numero}.{i} {titre}. ")
            r.bold = True
            p.add_run(bloc)
        fin = doc.add_paragraph()
        r = fin.add_run(chap["conclu"])
        r.italic = True
        nom = f"chapitre-{numero}.docx"
        doc.save(os.path.join(dossier, nom))

        texte = "\n\n".join([f"Chapitre {numero} — {chap['titre']}", chap["intro"], *chap["points"], chap["conclu"]])
        manifeste.append({"matiere": code, "numero": numero, "titre": chap["titre"],
                          "fichier": f"{code}/{nom}", "texte": texte})

io.open(os.path.join(CIBLE, "manifest.json"), "w", encoding="utf-8").write(
    json.dumps(manifeste, ensure_ascii=False, indent=1))
print(f"{len(manifeste)} chapitres .docx écrits dans {CIBLE}")
