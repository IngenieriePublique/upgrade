// First Upgrade : point d'entrée. Quatre activités sans obligation, qui réutilisent le noyau d'Upgrade (site/js/).
import { openStore } from '../../js/store.js';
import { createRouter } from '../../js/router.js';
import { newState, schedule } from '../../js/srs.js';
import { h } from '../../js/ui.js';
import * as accueil from './accueil.js';
import * as territoires from './territoires.js';
import * as cartes from './cartes.js';
import * as brief from './brief.js';
import * as lecture from './lecture.js';
import * as methode from './methode.js';
import * as seances from './seances.js';
import * as calcul from './calcul.js';

// Sans stockage disponible (navigation privée), les activités restent jouables : la progression vit en mémoire.
function magasinMemoire() {
  const etats = new Map();
  const meta = new Map();
  return {
    memoire: true,
    states: async () => new Map(etats),
    review: async (id, grade, now = Date.now()) => {
      const suivant = schedule(etats.get(id) ?? newState(id), grade, now);
      etats.set(id, suivant);
      return suivant;
    },
    getMeta: async (cle, defaut = null) => (meta.has(cle) ? meta.get(cle) : defaut),
    setMeta: async (cle, valeur) => { meta.set(cle, valeur); },
  };
}

// Le service worker de l'ancien système (Upgrade) garde d'anciens fichiers en cache : First Upgrade n'en a pas besoin.
async function oublierAncienCache() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    if (!regs.length) return;
    await Promise.all(regs.map((r) => r.unregister()));
    if (window.caches) for (const k of await caches.keys()) if (k.startsWith('upgrade-')) await caches.delete(k);
  } catch { /* sans conséquence */ }
}

async function main() {
  const sortie = document.getElementById('app');
  let store;
  try { store = await openStore(); } catch (e) { console.warn('stockage indisponible', e); store = magasinMemoire(); }

  const routes = [
    { path: '/', render: accueil.render },
    { path: '/territoires', render: territoires.render },
    { path: '/cartes', render: cartes.render },
    { path: '/brief', render: brief.render },
    { path: '/lecture', render: lecture.render },
    { path: '/calcul', render: calcul.render },
    { path: '/methode', render: methode.render },
    { path: '/methode/seances', render: seances.render },
    { path: '*', render: ({ view }) => view.append(h('main', { class: 'perdu' }, h('p', null, 'Page introuvable.'), h('a', { href: '#/' }, 'Retour à l\'accueil'))) },
  ];
  await createRouter(routes, sortie, { store })();
  window.firstUpgrade = { store }; // pratique pour le débogage dans la console
  oublierAncienCache();
}

main();
