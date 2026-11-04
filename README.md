# ARP Éducation — Application web (Next.js + MongoDB + PWA)

Application web installable (PWA) de type ARP éducation, développée en **Next.js** (front + back dans le même projet) avec la base de données **MongoDB** (serveur local `mongod`, base `arp_education`).

## Lancer l'application

**Une seule commande, la base se débrouille toute seule** :

```bash
npm install     # une seule fois
npm run dev     # mode développement → http://localhost:3000
```

`npm run dev` et `npm start` **démarrent MongoDB eux-mêmes** si `mongod` ne tourne pas (après un
redémarrage du PC, ou si la fenêtre a été fermée) : la première requête qui a besoin de la base
lance le serveur, attend qu'il réponde, puis exécute la requête. Un contrôle toutes les 20 secondes
relance aussi `mongod` s'il meurt pendant que l'application tourne. Rien à lancer à la main.

<details>
<summary>Ce que cela démarre (et comment le faire soi-même)</summary>

`scripts/ensure-mongo.js` cherche le binaire dans `C:\Users\USER\Tools\mongodb\mongodb-win32-*\bin\mongod.exe`
puis lance `mongod --config C:\Users\USER\Tools\mongod.cfg` : base sur `127.0.0.1:27017`,
données dans `C:\Users\USER\Tools\mongodb-data`, logs dans `C:\Users\USER\Tools\mongodb-log\mongod.log`.
Équivalent manuel : `npm run db:start` (ouvre une fenêtre réduite) ou `node scripts/ensure-mongo.js`.
Variables d'environnement si l'installation d'origine a bougé : `MONGO_URL`, `MONGOD_EXE`, `MONGOD_CFG`, `MONGO_TOOLS`.
Si une `MONGO_URL` pointe vers une base **distante** (Atlas, un autre serveur), aucun lancement local n'est tenté.

</details>

Pour la version de production :

```bash
npm run build
npm run start   # serveur HTTPS unique → https://localhost (port 443, sans numéro de port)
```

**Premiers lancement / reprise de l'ancienne base** :

```bash
npm run db:migrate   # scripts/migrate-sqlite-to-mongo.js : reprend data/arp.db (SQLite) dans MongoDB
                     # relancer avec --force pour remplacer la base par le contenu du fichier SQLite
```

Sans migration, le premier démarrage crée automatiquement les données de démonstration dans MongoDB.

**Regarder le contenu de la base** (comme un « SELECT * ») :

```bash
npm run db:tables        # les 13 collections, leurs champs et les 4 premiers documents
npm run db:tables -- 10  # 10 documents par collection
```

`scripts/show-collections.js` se branche sur `mongodb://127.0.0.1:27017` (variable `MONGO_URL`)
et masque le champ `mot_de_passe`. Il démarre `mongod` lui-même si besoin, comme l'application.

## Comptes de démonstration (mot de passe : `123456`)

Le compte **admin** a un mot de passe personnalisé (défini lors du durcissement de sécurité, non publié ici).

| Rôle        | Email                 |
|-------------|-----------------------|
| Admin       | admin@arp.edu         |
| Professeur  | sami.benali@arp.edu   |
| Étudiant    | ahmed.j@arp.edu       |

Seul le compte **admin** est fixe. Les comptes prof/étudiant sont créés par l'admin : un **email d'invitation** est envoyé (voir 📧 Emails envoyés dans le menu), le destinataire clique le lien `/reset` pour **définir son mot de passe**, puis peut se connecter.

## Droits par rôle

Une seule table fait autorité : **`lib/permissions.ts`** (`MATRICE`). Les pages l'appellent via
`exiger(module, verbe)` (redirection sinon) et chaque route API via `peut(role, module, verbe)` avant
d'écrire. L'écran et le serveur ne peuvent donc plus diverger.

| Module | Admin | Prof | Étudiant |
|--------|-------|------|----------|
| Utilisateurs | créer · modifier · supprimer · voir | — ( inaccessible) | — (inaccessible) |
| Classes | tout | voir | voir (sa classe) |
| Emails envoyés | tout | voir | voir (les siens) |
| Salles | tout | voir | voir |
| Matières | tout | voir | voir (sa classe) |
| Emploi du temps | créer · modifier · voir | voir | voir (sa semaine) |
| Présences | voir | **saisir** l'appel + voir | voir (les siennes) |
| Notes | voir | **saisir** CC/TP/examen + voir | voir (les siennes) |
| Comptes rendus | voir | créer · corriger · noter | déposer · modifier · retirer (le sien) |
| Réclamations | **voir** (le statut appartient à l'auteur) | créer · modifier · supprimer (les siennes) | créer · modifier · supprimer (les siennes) |
| Notifications | tout | voir | voir |
| Assistant | lire | lire | lire |
| Cours | — (inaccessible) | **créer · modifier · supprimer** ses chapitres + marquer terminé | voir (sa classe) · **passer son quiz** (une seule tentative) |

## Modules (selon le cahier des charges)

Conventions communes à tous les écrans : filtres en `<form method="get">` (URL partageable, bouton
précédent fonctionnel, zéro JS), **pagination** serveur (`lib/filtres.ts::pagination` + `components/Pagination`),
création/modification **en popup avec confirmation** (`components/Modal`), toute **date est une période du→au**
qui s'étend à la semaine complète (`periode()` : un jour choisi ramène au lundi, la fin au dimanche), et
retour sur la vue filtrée après écriture grâce au paramètre `?retour=` (`lib/retour.ts`).

1. **Utilisateurs** (admin seul) — trois onglets (étudiants / professeurs / admin) paginés + recherche ; « ＋ Créer un utilisateur » en popup avec confirmation ; modification en popup ; activation/désactivation, renvoi d'email, suppression. Le compte admin et votre propre compte sont marqués « protégés ».
2. **Classes** — admin : vue d'ensemble **filtrée par année**, plusieurs classes côte à côte (grille), flèches ◀ ▶ pour parcourir, popup de création, affectation des étudiants ; prof : uniquement les classes où il enseigne (lecture seule) ; étudiant : sa classe.
3. **Salles** — visibles par tous ; admin seul crée/modifie/supprime (popup de création, filtre bâtiment/type, usage par l'emploi du temps).
4. **Matières** — admin : année **puis classe obligatoire**, puis « ＋ Ajouter une matière » (popup, email d'affectation au prof) ; prof : année/classe obligatoires puis ses matières ; étudiant : les matières de sa classe. Cycle de vie `en_cours` → **clôture prof** (examen) → `termine` → **validation admin** → `valide` (publié aux étudiants).
5. **Emploi du temps** — admin **seul** crée/modifie : le formulaire de semaine est une **popup ouverte par un bouton à côté de « Imprimer »** ; les autres consultent par semaine (filtres année/classe/semaine/salle). PDF A4 via `/api/emplois/pdf` + bouton « Imprimer ». **Règle de semaine** (`lib/semaine.ts`) : toute semaine future préparable, verrouillée à partir du **samedi 00h** qui la clôt ; le serveur refuse toute écriture sur une semaine verrouillée ; confirmation avant d'écraser une semaine déjà remplie.
6. **Présences** — le **prof saisit l'appel** par séance (present/absent/retard) ; admin **consultation seule** avec statistiques ; étudiant voit ses relevés. Filtres année / classe (obligatoire, sinon aucune donnée) / matière / période / statut / étudiant, matrice « chaque étudiant par matière » et détail paginé.
7. **Notes** — le **prof saisit** CC/TP puis clôture avec l'examen (filtres année/classe/matière, uniquement ses matières) ; admin **consulte** (filtres + étudiant) ; étudiant voit ses notes par matière, la moyenne et la **moyenne générale pondérée par coefficient**. Bandeaux de stats et moyennes affichés selon le rôle.
8. **Comptes rendus** — filtres année/classe/matière/étudiant pour tous ; admin **consulte** ; prof **crée** (bouton en popup) et **note + feedback** chaque dépôt des ses CR ; étudiant voit ses CR assignés (filtre matière + déposés/non déposés) et peut **déposer, modifier, retirer** son rendu tant que la matière est en cours et la date limite non dépassée.
9. **Réclamations** — **les créent/modifient/suppriment** : prof et étudiant, uniquement les leurs (ils en pilotent le statut) ; **admin consulte** (filtres année + personne). En lecture seule, l'administration ne touche plus au statut.
10. **Notifications** — créées/modifiées/supprimées uniquement par l'admin ; **visibles par tous** ; filtre par année, pagination.
11. **Assistant** (les trois rôles) — **bulle flottante en bas à droite, sur tous les écrans** (plus d'onglet dans la sidebar ; `components/AssistantFlottant.tsx` monté par `app/layout.tsx`, masqué sur `/offline` et sans session). Chatbox à **deux étages** :
    - **Moteur IA (Gemini)** si une clé est configurée — **libre** : aucune liste de questions imposées, toute formulation est acceptée. Deux regimes : (A) la scolarité du compte, réponse ancrée **uniquement** sur le snapshot du rôle (`lib/assistant-contexte.ts`) — un objet non envoyé ne peut pas être dévoilé ; (B) travail **académique** (plan de compte rendu, fiche de révision, explication d'une notion, reformulation, QCM d'entraînement), où le modèle s'appuie sur ses propres connaissances tout en citant les matières/coefficients réels. Il produit une **trame de rédaction**, jamais un devoir rendu tel quel.
    - Chaque réponse IA se termine par **3 questions cliquables** proposées par le modèle (ligne `PROPOSITIONS:` retirée du texte, exposée par l'API et affichée sous la bulle). Des questions de départ restent affichées sous la zone de saisie, par rôle.
    - **Moteur local par mots-clés** (`lib/assistant.ts`) quand la clé manque, que Google refuse (400/404/429/5xx → modèle suivant de la liste), que le modèle dépasse 45 s ou que le quota du jour est atteint — l'app fonctionne donc aussi sans IA.
    - **Accès limité** : `LIMITE_JOUR` questions d'IA par compte et par jour (défaut 40, variable `ASSISTANT_QUOTA`), comptées dans la collection `assistant_usage` ; le reste des questions est affiché sous la réponse.
    - **Refus déterministes avant même l'appel réseau** (`refusConnu`) : altérer l'application ou ses droits, soutirer des identifiants, qu'un étudiant change ses notes/absences, qu'un prof change son rôle ou ses affectations, ou qu'un étudiant demande les données d'autrui / d'une autre classe. Des questions prêtes à l'emploi sont proposées par rôle (ex. « Combien d'absences ai-je au total ? »).
12. **Cours** (prof et étudiant **seulement** — l'admin n'y a pas accès) — un chapitre = une matière + un numéro, avec son support **`.docx` ou `.pdf`** téléchargeable.
    - **Prof** : « ＋ Déposer un chapitre » en popup (année → classe → matière obligatoires), modification, et **« Marquer terminé »** qui ouvre le quiz de ce chapitre à la classe. Il ne touche que les matières qu'il enseigne ; un chapitre déjà évalué ne peut être ni rouvert ni supprimé.
    - **Étudiant** : consulte les chapitres de sa classe, lit le texte, télécharge le support, et passe le **QCM de compétence** — **6 questions par chapitre**, **8 pour le QCM global**, **une seule tentative** (index unique `etudiant_id + cle`), note **sur 20** qui n'entre **jamais** dans la moyenne de la matière (collection `notes` intacte).
    - **RAG** : le texte du support est découpé en passages (`lib/cours.ts::decoupe`), plongés par `gemini-embedding-001` en 768 dimensions et stockés dans `cours_passages`. Le QCM est **généré à la volée pour chaque élève** (`lib/qcm.ts`) à partir de tirages différents de ces passages : deux élèves du même chapitre n'ont pas les mêmes questions. La clé de correction reste côté serveur, jamais envoyée au navigateur.
    - **Sans IA** (clé absente, réseau coupé, quota) : les questions sont fabriquées par règles à partir des phrases du chapitre — le quiz reste ancré sur le cours déposé, jamais inventé.
    - **Un PDF sans texte** (scan) est stocké et téléchargeable, mais l'écran demande de **coller le texte** du chapitre (`MIN_TEXTE_CHAPITRE = 300`) : on n'invente jamais un cours.

### Activer l'assistant IA (Gemini, clé gratuite)

1. Ouvrir **https://aistudio.google.com/api-keys** (le lien `/api-key` renvoie un 404) avec un compte Google.
   S'il affiche « No Cloud Projects Available », cliquer d'abord **Créer un projet** (un nom suffit) puis **Créer une clé** ;
   copier la clé (les clés récentes commencent par `AQ...`, les anciennes par `AIza...`).
2. Créer le fichier `arp/.assistant-secret` (2 lignes, aucun dépôt ni commit : il est dans `.gitignore`) :
   ```
   ta_cle_complete
   gemini-3.5-flash
   ```
   La 2ᵉ ligne est facultative — sans elle l'app essaie `gemini-3.5-flash`, puis `gemini-3.1-flash-lite`, puis `gemini-2.5-flash`.
   Ces identifiants ont été vérifiés avec une clé gratuite : `gemini-2.0-flash` et `gemini-2.5-flash` sont refusés (404) par les
   nouveaux comptes, et `gemini-flash-latest` met plusieurs minutes → ils ne sont pas en tête de liste.
3. Relancer `npm start` (la clé est lue une seule fois au démarrage). Alternative : variable d'environnement `GEMINI_API_KEY`, prioritaire sur le fichier.
4. Vérification : une question libre sur l'écran Assistant répond en phrases rédigées et le pied de page indique « Réponse rédigée par le modèle Gemini » avec le nombre de questions restantes.

**Ce que la clé ne donne pas** : l'assistant reste en lecture seule, côté serveur, avec le périmètre du rôle connecté. La clé n'est jamais envoyée au navigateur ni stockée en base.

### Les chapitres de démonstration (`cours-demo/`)

Le dossier `cours-demo/` contient **25 vrais `.docx`** (5 matières × 5 chapitres) et leur `manifest.json`, écrits par
`scripts/gen-docx.py` (`npm run cours:gen`, nécessite python-docx).

```
npm start                # serveur lancé
npm run db:cours         # dépose les 25 chapitres comme le ferait le professeur
```

L'import **passe par `/api/cours`** (cookie de session du prof de la matière) et non par la base : il exerce donc le
vrai chemin — lecture du `.docx`, contrôle des droits, découpage en passages, plongements Gemini. `BDD` et `DEVWEB`
sont marqués **terminés** (QCM de chapitre + QCM global ouverts) ; `COMPTA`, `RESAPP` et `ALGO` gardent leurs derniers
chapitres **en cours** pour montrer l'autre état. Relancer l'import avec les mêmes numéros refuse les doublons
(`le chapitre N existe déjà`) : utile pour re-indexer un chapitre, le supprimer d'abord depuis l'écran Cours.

## PWA : installation PC et téléphone

- **PC (Chrome/Edge)** : ouvrir `http://localhost:3000`, icône « Installer » dans la barre d'adresse → application standalone sur le bureau.
- **Android/Chrome** : nécessite **HTTPS** → lancer `npm start` puis suivre **`README-ANDROID.md`** (certificat local mkcert + CA à installer sur le téléphone). Ensuite menu ⋮ → « Installer l'application » : icône sur l'écran d'accueil et vrai mode hors ligne.
- **iPhone (Safari)** : Partager → « Sur l'écran d'accueil ».
- **Responsive** : barre latérale sur PC, navigation basse sur mobile.

### Servir l'app en HTTPS sur le réseau local

```bash
powershell -ExecutionPolicy Bypass -File scripts\get-mkcert.ps1   # une seule fois
npm run build
node server-https.js           # → https://<IP-du-PC>  (port 443, sans numéro de port)
```

`server-https.js` démarre l'application avec le certificat mkcert ; `lib/origin.ts` fait que les
redirections de formulaires suivent l'hôte réellement demandé (sinon le téléphone serait renvoyé
vers son propre `localhost`). `certs/` est exclu du dépôt : la clé privée reste sur le PC, seul
`certs/arp-root-ca.pem` se transfère sur le téléphone.

**Le certificat suit le réseau tout seul.** `scripts/ensure-cert.js` liste les adresses IPv4 privées
des vraies cartes réseau (Wi-Fi, Ethernet — les cartes virtuelles sont ignorées), signe le certificat
pour ces adresses, puis revérifie toutes les 30 secondes : dès que l'IP change (box, hotspot, Wi-Fi
de l'école), il relance mkcert et remplace le certificat **à chaud**, sans redémarrer et sans coupure.
Rien à taper, à condition que le serveur tourne (`npm start`). Le mkcert rootCA ne change jamais, donc
**aucune réinstallation sur le téléphone** — par contre l'URL porte la nouvelle IP, et un raccourci PWA
créé sur l'ancienne adresse est à recréer depuis la nouvelle.

Le secret qui signe le cookie de session est lu dans `arp/.tunnel-secret` (exclu du dépôt) par
`server-https.js`, variable d'environnement `ARP_SECRET` prioritaire. Sans ce fichier l'application
retombe sur le secret de démonstration : à créer une seule fois, par exemple
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" > .tunnel-secret`.

## Mode hors ligne

- **Seul l'emploi du temps** est disponible sans connexion : toute navigation hors ligne retombe sur `/offline` (service worker `public/sw.js`, cache `arp-v6`).
- **Aucun bouton** : dès qu'une page est ouverte en ligne (`/`, `/emplois`, `/offline`…), le service worker rafraîchit tout seul la capture — l'HTML de `/offline` et le JSON de `/api/offline-data` (throttle 30 s). La capture est aussi faite à l'installation du SW.
- La capture **conserve le compte connecté** et son périmètre : l'admin obtient **toutes les classes**, le professeur **toutes les classes où il a une séance**, l'étudiant **sa classe** — et pour **toutes les semaines de l'année scolaire en cours**, pas seulement la semaine courante.
- Hors ligne, `/offline` affiche la semaine courante et le sélecteur de semaines recharge les autres semaines depuis le JSON mis en cache (`components/HorsLigneSemaines` + `components/EmploiTableau`). Déconnecté → l'ancienne capture est effacée et on retombe sur `/login`.
- Les écritures (appel, CR, réclamation…) et l'assistant `/assistant` nécessitent une connexion.

## Structure

- `app/` — pages (App Router) ; `app/api/` — routes back-end (formulaires POST, redirect 303)
- `lib/permissions.ts` — **matrice unique des droits** (`MATRICE`), lue par les pages (`exiger`) et les API (`peut`)
- `lib/filtres.ts` — briques communes de tous les filtres : valeurs de query, **période du→au (semaine)**, année scolaire, pagination, `lien`/`actionFormulaire`
- `lib/retour.ts` — `routeurRetour` : après une écriture, renvoie le clic sur exactement la vue filtrée (`?retour=`)
- `lib/db.ts` — accès MongoDB (collections, compteurs d'ids numériques, index uniques, `findDocs` avec tri/limite/saut, seed de démonstration)
- `lib/auth.ts` — session cookie signée, invitations, réinitialisation mot de passe
- `lib/assistant.ts` — moteur local de la chatbox (mots-clés → requêtes sur les collections) + `refusConnu`, les garde-fous de refus par rôle
- `lib/assistant-contexte.ts` — snapshot **limité au compte appelant** donné au modèle IA (emploi du temps, matières, notes, pointages, CR, réclamations, notifications)
- `lib/assistant-ia.ts` — orchestration : refus → quota quotidien → Gemini → repli local
- `lib/gemini.ts` — appel REST du modèle (clé lue dans `.assistant-secret` ou `GEMINI_API_KEY`, jamais exposée au navigateur) ; `jsonAvecGemini` pour une sortie JSON validée et `vecteursGemini` pour les plongements du RAG
- `lib/cours.ts` — **lecture des supports sans dépendance** : `texteDocx` (ZIP → `word/document.xml`), `textePdf` (flux décompressés + tables ToUnicode), `decoupe` (passages de ~800 caractères qui coupent aux phrases) et le seuil `MIN_TEXTE_CHAPITRE`
- `lib/rag.ts` — indexation des passages (`cours_passages`, vecteur de 768 dimensions), recherche en cosinus **calculée en JS** (le `mongod` local ne connaît pas `$vectorSearch`, réservé à Atlas), repli par recouvrement de mots, tirage des passages d'un quiz avec une graine propre à l'élève
- `lib/qcm.ts` — génération du QCM ancré sur les passages (JSON strict validé question par question, rejet de tout ce qui est douteux) + moteur de règles de repli, et `corriger` qui donne la note sur 20 au quart de point
- `lib/semaine.ts` — règle de la semaine d'emploi du temps : calcul du lundi/dimanche/samedi, verrouillage, libellés
- `lib/pdf.ts` — générateur PDF maison (aucune dépendance) utilisé par `/api/emplois/pdf`
- `lib/mail.ts` — emails simulés (collection `emails`, consultables par l'admin ; en production : SMTP/nodemailer)
- `lib/hors-ligne.ts` — contenu de la capture hors ligne : **toutes les semaines de l'année scolaire**, groupées semaine → classes, réduites au périmètre du rôle
- `scripts/migrate-sqlite-to-mongo.js` — reprise de l'ancienne base `data/arp.db` vers MongoDB
- `scripts/show-collections.js` — console de lecture : les collections et leur contenu (`npm run db:tables`)
- `scripts/import-cours.js` — dépose les 25 chapitres de démonstration **via `/api/cours`** (`npm run db:cours`), donc sans écriture directe en base
- `scripts/gen-docx.py` — régénère `cours-demo/` (les `.docx` + `manifest.json`) à partir de `scripts/cours-contenu.json`
- `scripts/start-mongod.bat` — démarre le serveur MongoDB local sur `127.0.0.1:27017` (facultatif : l'app le fait seule)
- `scripts/ensure-mongo.js` — détecte `mongod`, le lance si le port est fermé, le relance s'il meurt en cours de session
- `scripts/ensure-cert.js` — certificat TLS auto-adaptatif : IP du réseau → mkcert, puis resignation à chaud toutes les 30 s
- `scripts/make-cert.ps1` — l'ancienne génération manuelle, désormais facultative (le serveur la fait seul)
- `components/` — briques réutilisables : `Modal` (popup + confirmation, seul JS d'écriture), `ConfirmForm`, `Filtres` (`BarreFiltres`/`SelectFiltre`/`PeriodeFiltre`), `Pagination`, `Stats`, `Sidebar`, `AssistantFlottant` (bulle + panneau) et `AssistantChat` (le message, les suggestions, le compteur de quota)
- `middleware.ts` — exige une session valide pour toute page/API hors login/reset/offline ; **les droits par rôle sont appliqués par `exiger()` (pages) et `peut()` (API)**, pas par le middleware
- `public/` — manifest PWA, service worker, icône

## Notes techniques

- Base de données : **MongoDB Community Server** en local (`mongodb://127.0.0.1:27017`, base `arp_education`), pilote `mongodb`. Les variables `MONGO_URL` et `MONGO_DB` peuvent être surchargées par l'environnement.
- mongod tournant en **standalone**, les écritures multi-documents sont séquentielles (pas de transactions) ; l'unicité est garantie par des index uniques, comme les contraintes `UNIQUE` du schéma d'origine.
- Les ids restent **numériques et auto-incrémentés** via la collection `counters`, ce qui conserve le format des formulaires et des redirections.
- Supprimer la base `arp_education` (ou la vidanger) réinitialise toutes les données de démonstration au premier démarrage.
- Projet compatible **Node 18** (Next.js 13.5).
