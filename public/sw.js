/* Service worker ARP Éducation : seul l'emploi du temps reste consultable sans connexion.
   La capture se fait TOUTE SEULE des qu'une page s'affiche connectee (aucun bouton).
   Le nom du cache est reprise dans app/offline/page.tsx en commentaire. */
const CACHE = "arp-v6";
const CORE = ["/manifest.webmanifest", "/icons/icon.png", "/login"];
const CAPTURE = "/offline";
const DONNEES = "/api/offline-data";

async function reseau(url) {
  try {
    return await fetch(url, { credentials: "same-origin", cache: "no-store" });
  } catch {
    return null;
  }
}

/* Le compte alors connecte dicte la capture. Des qu'il n'y a plus de session on retire la
   capture precedente : l'appareil ne doit pas garder l'emploi du temps d'un autre usager. */
async function capturer() {
  const cache = await caches.open(CACHE);
  const data = await reseau(DONNEES);
  if (!data) return "hors-ligne";
  if (data.status === 401) {
    await Promise.all([cache.delete(CAPTURE), cache.delete(DONNEES)]);
    return "deconnecte";
  }
  if (!data.ok) return "erreur";
  const page = await reseau(CAPTURE);
  if (!page || !page.ok) return "erreur";
  await Promise.all([cache.put(DONNEES, data.clone()), cache.put(CAPTURE, page.clone())]);
  return "enregistre";
}

let dernier = 0;
async function capturerSiBesoin() {
  if (Date.now() - dernier < 30000) return;
  dernier = Date.now();
  await capturer();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(CORE.map((u) => cache.add(u))))
      .then(() => capturer())
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => capturer())
  );
});

// Le bouton « Enregistrer maintenant » de l'ecran hors ligne force une capture immediate.
self.addEventListener("message", (event) => {
  if (event.data === "reset-cache") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
  if (event.data === "capturer") {
    dernier = Date.now();
    event.waitUntil(capturer());
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Les donnees de la capture : reseau d'abord, cache sans connexion.
  if (url.pathname === DONNEES) {
    event.respondWith(
      (async () => {
        const res = await reseau(DONNEES);
        if (res) {
          if (res.ok) {
            const copy = res.clone();
            const cache = await caches.open(CACHE);
            await cache.put(DONNEES, copy);
          }
          return res;
        }
        const cache = await caches.open(CACHE);
        const memoire = await cache.match(DONNEES);
        return (
          memoire ||
          new Response('{"erreur":"aucune capture sur cet appareil"}', {
            status: 504,
            headers: { "content-type": "application/json" },
          })
        );
      })()
    );
    return;
  }

  // Les autres API (ecritures, PDF generez) : toujours le réseau, jamais le cache.
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Chaque page ouverte en ligne renouvelle la capture du compte connecte.
          if (res.ok) {
            event.waitUntil(capturerSiBesoin());
            if (url.pathname === CAPTURE) {
              event.waitUntil(
                caches.open(CACHE).then((cache) => cache.put(CAPTURE, res.clone())).catch(() => {})
              );
            }
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (await cache.match(CAPTURE)) || (await cache.match("/login"));
        })
    );
    return;
  }

  // Ressources statiques : cache d'abord, mise en cache a la volee.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
