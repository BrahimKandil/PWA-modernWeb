# Utiliser ARP Éducation sur Android (installation + hors ligne)

Android exige **HTTPS** pour autoriser l'installation d'une PWA et le mode hors ligne
`http://192.168.100.10:3000` fonctionne dans le navigateur, mais sans install ni hors ligne.
On utilise donc un certificat local mkcert, servi sur le port **3443**.

## 1. Sur le PC (une seule fois)

Déjà fait si `certs/arp-lan.pem` existe. Sinon :

```powershell
powershell -ExecutionPolicy Bypass -File scripts\get-mkcert.ps1   # telecharge mkcert
powershell -ExecutionPolicy Bypass -File scripts\make-cert.ps1    # CA local + certificat de l'IP Wi-Fi
```

Puis lancer l'app en HTTPS :

```bash
npm run build
npm run start:https
```

Le PC écoute sur `https://localhost:3443` et `https://192.168.100.10:3443`.
(Le pare-feu Windows autorise déjà `node.exe` en entrée, rien à changer.)

## 2. Copier l'autorité de certification sur le téléphone

Le fichier à transférer (Bluetooth, Drive, câble, ce que tu veux) :

```
certs/arp-root-ca.pem
```

C'est la **clé publique** de ton CA local : sans elle, Chrome refusera le certificat et
refusera d'installer l'app. Elle ne contient aucun secret. Le fichier `arp-lan-key.pem`,
lui, ne doit **jamais** quitter le PC.

## 3. Installer le CA sur Android

`Paramètres → Sécurité → Autres paramètres de sécurité → Chiffrement et informations
d'identification → Installer un certificat → Certificat d'autorité` → choisir `arp-root-ca.pem`
→ accepter l'avertissement.

Selon la marque le chemin est un peu différent :
- **Samsung** : `Biométrie et sécurité → Autres paramètres de sécurité → Afficher les certificats → Installer`
- **Xiaomi** : `Paramètres → Empreinte, données et mots de passe → Chiffrement des données → Installer un certificat CA`

Android affichera un avertissement (« risque pour la vie privée ? ») : c'est normal, c'est
**ton** CA créé par mkcert, il ne signe que ton app locale.

> Si tu supprimes `C:\Users\USER\AppData\Local\mkcert` sur le PC, il faudra refaire
> l'étape 2 et 3 avec le nouveau `rootCA.pem`.

## 4. Installer l'app

1. Sur le téléphone (même Wi-Fi que le PC), ouvrir **Chrome** et aller sur
   `https://192.168.100.10:3443`
2. Il ne doit **pas** y avoir d'avertissement « La connexion n'est pas privée » → le CA est bon.
3. Menu `⋮` → **Installer l'application** (ou « Ajouter à l'écran d'accueil ») → icône ARP Éducation.
4. Se connecter et **consulter les pages qu'on veut garder hors ligne**, en particulier
   **Emploi du temps** (le calendrier de la semaine).

## 5. Tester le hors ligne

Mode avion (ou Wi-Fi coupé) → ouvrir l'icône :
- les pages déjà vues s'affichent, y compris le **calendrier de la semaine** ;
- une page jamais vue affiche « Vous êtes hors ligne » avec quand même la grille de la semaine ;
- les écritures (donner l'appel, déposer un CR, saisir une note) demandent la connexion : c'est voulu.

## Si ça ne marche pas

| Symptôme | Cause et solution |
|---|---|
| « La connexion n'est pas privée » | CA non installé (étape 3), ou certificat généré pour une autre IP → relancer `scripts\make-cert.ps1` |
| rien ne s'affiche / timeout | téléphone sur un autre réseau que le PC, ou PC endormi ; vérifier l'IP : `ipconfig` → la ligne Wi-Fi doit être celle du certificat |
| pas d'option « Installer l'application » | CA absent, ou Chrome WebView désactivé, ou tu es passé par `http://…:3000` au lieu de `https://…:3443` |
| hors ligne = page blanche | la page n'a jamais été ouverte en ligne ; le service worker ne peut pas deviner ce que tu n'as pas vu |
| l'IP du PC a changé au bout de quelques jours | relancer `scripts\make-cert.ps1` (il détecte la nouvelle IP), redémarrer `npm run start:https`, et sur le téléphone rouvrir l'URL avec la nouvelle IP |

Astuce pour éviter les changements d'IP : Fixer l'adresse DHCP du PC dans l'interface de la
box (TOPNET_D214), ou réserver un bail à son adresse MAC.
