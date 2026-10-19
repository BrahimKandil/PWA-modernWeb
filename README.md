# ARP Éducation — Application web (Next.js + SQLite + PWA)

Application web installable (PWA) de type ARP éducation, développée en **Next.js** (front + back dans le même projet) avec la base de données intégrée **SQLite** (fichier `data/arp.db`, équivalent Node.js de H2).

## Lancer l'application

```bash
npm install     # une seule fois
npm run dev     # mode développement → http://localhost:3000
```

Pour la version de production :

```bash
npm run build
npm run start   # → http://localhost:3000
```

## Comptes de démonstration (mot de passe : `123456`)

| Rôle        | Email                 |
|-------------|-----------------------|
| Admin       | admin@arp.edu         |
| Professeur  | sami.benali@arp.edu   |
| Étudiant    | ahmed.j@arp.edu       |

Seul le compte **admin** est fixe. Les comptes prof/étudiant sont créés par l'admin : un **email d'invitation** est envoyé (voir 📧 Emails envoyés dans le menu), le destinataire clique le lien `/reset` pour **définir son mot de passe**, puis peut se connecter.

## Modules (selon le cahier des charges)

1. **Gestion des utilisateurs** — admin crée profs/étudiants (invitation email + mot de passe à définir), activation/désactivation, renvoi de l'email, suppression
2. **Classes** (admin) — création de classes par année, sélection des étudiants dans une classe à tout moment
3. **Salles** (admin) — nom, bâtiment, capacité, type (salle/amphi/labo)
4. **Matières** (admin) — code, nom, coefficient, nombre d'heures, classe, professeur → email d'affectation envoyé au prof
   - Cycle de vie : `en_cours` → le prof **clôture** (notes d'examen) → `termine` → l'admin **valide** → `valide` (visible des étudiants)
5. **Emploi du temps hebdomadaire** (admin) — max **2 matières par jour** (09h–12h / 13h–16h), choisissez classe + semaine, copier la semaine précédente, **téléchargement PDF** (le serveur génère un vrai fichier `.pdf` A4 paysage via `/api/emplois/pdf`, plus un bouton « Imprimer »)
6. **Présences** — le prof (ou l'admin) fait l'appel par séance (present/absent/retard) ; l'étudiant consulte son historique et son compteur d'absences
7. **Notes** — le prof saisit CC/TP sur ses matières ; à la fin du cours il soumet la **clôture avec les notes d'examen final** ; après validation admin, l'étudiant voit ses notes par matière, la moyenne et la **moyenne générale pondérée par coefficient**
8. **Comptes rendus** — le prof crée un CR avec **date limite** ; l'étudiant dépose avant la limite ; après expiration le prof consulte les dépôts et **note + feedback**
9. **Réclamations** — créées uniquement par prof/étudiant, **visibles par tous** ; l'admin change le statut (ouvert/en cours/traité)
10. **Notifications** — créées uniquement par l'admin, **visibles par tous**

## PWA : installation PC et téléphone

- **PC (Chrome/Edge)** : ouvrir `http://localhost:3000`, icône « Installer » dans la barre d'adresse → application standalone sur le bureau.
- **Android/Chrome** : nécessite **HTTPS** → lancer `npm run start:https` puis suivre **`README-ANDROID.md`** (certificat local mkcert + CA à installer sur le téléphone). Ensuite menu ⋮ → « Installer l'application » : icône sur l'écran d'accueil et vrai mode hors ligne.
- **iPhone (Safari)** : Partager → « Sur l'écran d'accueil ».
- **Responsive** : barre latérale sur PC, navigation basse sur mobile.

### Servir l'app en HTTPS sur le réseau local

```bash
powershell -ExecutionPolicy Bypass -File scripts\get-mkcert.ps1   # une seule fois
powershell -ExecutionPolicy Bypass -File scripts\make-cert.ps1    # à relancer si l'IP Wi-Fi change
npm run build && npm run start:https                              # https://192.168.100.10:3443
```

`server-https.js` démarre l'application avec le certificat mkcert ; `lib/origin.ts` fait que les
redirections de formulaires suivent l'hôte réellement demandé (sinon le téléphone serait renvoyé
vers son propre `localhost`). `certs/` est exclu du dépôt : la clé privée reste sur le PC, seul
`certs/arp-root-ca.pem` se transfère sur le téléphone.

## Mode hors ligne

- Les pages **déjà consultées** restent accessibles sans connexion (service worker `public/sw.js`, cache `arp-v2`).
- La page `/offline` affiche le **calendrier de la semaine** (grille 5 jours × 2 créneaux) même sans réseau, avec les cours de la semaine si elle a été chargée une fois en ligne.
- Les écritures (donner l'appel, déposer un CR…) nécessitent une connexion.

## Structure

- `app/` — pages (App Router) ; `app/api/` — routes back-end (formulaires POST, redirect 303)
- `lib/db.ts` — schéma SQLite + données de démonstration (recréées si `data/arp.db` supprimé)
- `lib/auth.ts` — session cookie signée, invitations, réinitialisation mot de passe
- `lib/pdf.ts` — générateur PDF maison (aucune dépendance) utilisé par `/api/emplois/pdf`
- `lib/mail.ts` — emails simulés (table `emails`, consultables par l'admin ; en production : SMTP/nodemailer)
- `middleware.ts` — protection des pages et des API selon le rôle
- `public/` — manifest PWA, service worker, icône

## Notes techniques

- H2 étant une base Java, elle n'est pas utilisable dans un projet Node.js : **SQLite** a été choisi comme base intégrée équivalente (fichier local, zéro serveur).
- Supprimer `data/arp.db` réinitialise toutes les données de démonstration.
- Projet compatible **Node 18** (Next.js 13.5).
