// Service worker : fonctionnement hors ligne. Les fichiers du site sont servis depuis le cache
// puis rafraîchis en arrière-plan (la version à jour apparaît au chargement suivant).
// Changer VERSION à chaque déploiement qui modifie la liste CORE.
const VERSION = 'upgrade-0.8.0';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon.svg',
  'js/app.js', 'js/version.js', 'js/srs.js', 'js/store.js', 'js/ui.js', 'js/router.js', 'js/timer.js', 'js/backup.js',
  'js/ia.js', 'js/data.js', 'js/territoires.js', 'js/carte-svg.js', 'js/fondations.js', 'js/candidature.js', 'js/recorder.js', 'js/dictee.js', 'js/atelier.js', 'js/bilan.js',
  'js/modules/aujourdhui.js', 'js/modules/brief.js', 'js/modules/cartes.js', 'js/modules/sauvegarde.js',
  'js/modules/sprint.js', 'js/modules/radar.js', 'js/modules/recit.js', 'js/modules/oral.js', 'js/modules/reseau.js', 'js/modules/choix.js', 'js/modules/territoires.js', 'js/modules/fondations.js', 'js/modules/dictee.js', 'js/modules/atelier.js', 'js/modules/portfolio.js', 'js/modules/bilan.js',
  'data/cartes/index.json', 'data/fondations/index.json', 'data/territoires/data.json', 'data/geo/france.json', 'data/brief/latest.json', 'data/brief/index.json',
  'data/dictees/dictees.json', 'data/dictees/regles.json', 'data/radar/employeurs.json', 'data/radar/note-carriere.json', 'data/oral/questions.json', 'data/oral/gabarits.json',
  'data/atelier/grille.json', 'data/atelier/notes.json', 'data/atelier/courts.json', 'data/atelier/portfolio.json', 'data/bilan/bilan.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(async (c) => {
    await c.addAll(CORE);
    // Les kits du curriculum sont lisibles hors ligne : on les met en cache d'après l'index (sans bloquer l'installation).
    try {
      const index = await (await fetch('data/fondations/index.json')).json();
      await c.addAll(index.kits.map((k) => `data/fondations/${k.fichier}`));
    } catch (err) { /* l'index est déjà en cache ; les kits seront mis en cache à la première lecture */ }
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Le Brief change chaque jour : le réseau d'abord, le cache en secours hors ligne.
  if (url.pathname.includes('/data/brief/')) {
    e.respondWith(caches.open(VERSION).then(async (cache) => {
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req, { ignoreSearch: true })) ?? Response.error();
      }
    }));
    return;
  }
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit ?? (await net) ?? (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
  }));
});
