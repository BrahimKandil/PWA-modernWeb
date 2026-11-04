# Utiliser ARP Éducation sur Android (installation + hors ligne)

Android n'autorise l'**installation d'une PWA** et le **mode hors ligne** que sur une origine
**HTTPS dont le certificat est fiable**. Un `http://…` ou un `https://…` au certificat non
reconnu ouvre la page mais **sans bouton « Installer »** et sans vrai hors ligne.

On sert donc l'app en HTTPS via un certificat local **mkcert**, sur le **port 443** →
l'URL est `https://<IP-du-PC>` **sans numéro de port**. Un seul serveur, un seul port.

## 0. Le réseau : ce qui marche et ce qui ne marche pas

Deux règles à retenir (vérifiées sur ce réseau) :

1. **Wi-Fi du campus (« esprit ») = piège.** Ce point d'accès **isole les clients**
   (client/AP isolation) : le téléphone ne peut PAS joindre le PC, même avec la bonne IP →
   « Le chargement a expiré (délai) ». **Ce réseau ne fonctionnera pas.**
2. **Utiliser le partage de connexion du téléphone** (le téléphone fait le point d'accès,
   le PC s'y connecte en Wi-Fi). Le PC et le téléphone sont alors sur le **même sous-réseau**,
   sans isolation → le téléphone atteint le PC. C'est la méthode fiable ci-dessous.

> Conséquence : quand le PC passe sur le hotspot du téléphone, son **IP Wi-Fi change**,
> il faut donc **régénérer le certificat** pour cette nouvelle IP (étape 2).

## 1. Sur le PC — une seule fois

Déjà fait si `certs/arp-root-ca.pem` existe. Sinon :

```powershell
powershell -ExecutionPolicy Bypass -File scripts\get-mkcert.ps1   # télécharge mkcert
```

Puis, **après** avoir connecté le PC au réseau visé (hotspot du téléphone), lancer l'app :

```bash
npm run build      # génère la version de production
npm start          # serveur HTTPS unique sur le port 443
```

Le PC écoute sur `https://localhost` et `https://<IP-du-PC>` (même port, aucune duplication).

## 2. Servir l'app (le certificat suit l'IP tout seul)

Le serveur HTTPS régénère son certificat tout seul quand le réseau change : lancer

```bash
npm run build && npm start        # ou : node server-https.js
```

et il affiche l'adresse du moment, par exemple :

```
   Adresse à utiliser au téléphone → https://192.168.43.x
```

Toutes les 30 secondes, `scripts/ensure-cert.js` compare les adresses IPv4 réelles du PC à celles
du certificat ; en cas de divergence il relance mkcert et applique le nouveau certificat **à chaud**
aucun redémarrage, aucune coupure. (Le raccourci `bash scripts/expose-phone.sh` reste disponible :
il fait la même chose, plus le redémarrage du serveur.)

Note : mkcert **réutilise le même CA racine** à chaque régénération. Le certificat d'IP
changera, mais **le CA installé sur le téléphone reste valide** — pas besoin de le
réinstaller à chaque fois, seulement de rouvrir la nouvelle URL.

## 3. Copier l'autorité de certification sur le téléphone (une seule fois)

Fichier à transférer (Bluetooth, Drive, câble…), **une seule fois** :

```
certs/arp-root-ca.pem
```

C'est la **clé publique** du CA local mkcert : sans elle Chrome refuse le certificat et
**refuse d'installer l'app**. Elle ne contient aucun secret. Le fichier `arp-lan-key.pem`
ne doit **jamais** quitter le PC.

## 4. Installer le CA sur Android (une seule fois)

`Paramètres → Sécurité → Autres paramètres de sécurité → Chiffrement et informations
d'identification → Installer un certificat → Certificat d'autorité` → choisir `arp-root-ca.pem`
→ accepter l'avertissement.

Selon la marque :
- **Samsung** : `Biométrie et sécurité → Autres paramètres de sécurité → Afficher les certificats → Installer`
- **Xiaomi** : `Paramètres → Empreinte, données et mots de passe → Chiffrement des données → Installer un certificat CA`

L'avertissement « risque pour la vie privée ? » est normal : c'est **ton** CA, il ne signe
que ton app locale.

## 5. Installer l'app

1. Téléphone sur le **hotspot**, PC connecté au même hotspot. Ouvrir **Chrome** sur
   l'URL donnée par `expose-phone.sh` (`https://<IP>`).
2. Il ne doit **pas** y avoir « La connexion n'est pas privée » → CA bon.
3. Menu `⋮` → **Installer l'application** (ou « Ajouter à l'écran d'accueil ») → icône ARP Éducation.
4. Se connecter, puis ouvrir n'importe quel écran (par exemple **Emploi du temps**) : la
   sauvegarde hors ligne est **automatique**, il n'y a **aucun bouton à toucher**. L'app
   enregistre l'emploi du temps de **toutes les semaines de l'année** pour le compte connecté.

## 6. Mode hors ligne depuis l'autre téléphone

Le hors ligne est **local à chaque téléphone** : chaque appareil ne peut ouvrir hors ligne
que **ce qu'il a lui-même mis en cache pendant qu'il était connecté**. Donc, sur le téléphone :

1. Être **en ligne** sur le hotspot, ouvrir l'app installée, se connecter.
2. Ouvrir l'app connectée une fois (n'importe quel écran) : la capture de l'année se fait seule.
3. **Couper le hotspot / mettre le téléphone en mode avion.**
4. Ouvrir l'icône **ARP Éducation** :
   - n'importe quelle URL tape sur **l'emploi du temps hors ligne**, avec toutes les semaines
     de l'année enregistrées (un sélecteur permet de changer de semaine sans connexion) ;
   - le compte resté connecté et son périmètre sont conservés : **admin** = toutes les classes,
     **professeur** = ses classes à séance, **étudiant** = sa classe ;
   - jamais ouvert, ou déconnecté depuis → repli sur l'écran de connexion ;
   - les écritures (appel, CR, notes) exigent la connexion : c'est voulu.

> Le serveur doit rester éteint ou allumé, peu importe : une fois les pages en cache sur le
> téléphone, le hors ligne ne dépend plus du PC ni du réseau.

## Si ça ne marche pas

| Symptôme | Cause et solution |
|---|---|
| « Le chargement a expiré » | le PC et le téléphone ne sont **pas** sur le même réseau, ou vous êtes sur le Wi-Fi campus « esprit » (isolation client) → utiliser le **hotspot du téléphone** |
| « La connexion n'est pas privée » | CA non installé (étape 4). L'IP qui change n'en est plus la cause : le serveur resigne le certificat tout seul, il suffit de rouvrir la nouvelle URL |
| pas d'option « Installer l'application » | CA absent (étape 4), ou vous êtes sur `http://` au lieu de `https://` ; Chrome doit être à jour |
| hors ligne = page blanche | la page n'a jamais été ouverte/préparée **en ligne** sur **ce** téléphone |

Astuce : sur le hotspot du téléphone, l'IP du PC est stable tant que le hotspot est actif ;
elle change seulement quand le téléphone redémarre le partage.
