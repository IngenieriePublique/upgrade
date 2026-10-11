import { openStore } from './store.js';
import { createRouter } from './router.js';
import { initTimer } from './timer.js';
import { h } from './ui.js';
import { VERSION } from './version.js';
import * as aujourdhui from './modules/aujourdhui.js';
import * as cartes from './modules/cartes.js';
import * as brief from './modules/brief.js';
import * as sauvegarde from './modules/sauvegarde.js';

async function loadJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} : HTTP ${r.status}`);
  return r.json();
}

async function loadDecks() {
  const index = await loadJson('data/cartes/index.json');
  return Promise.all(index.paquets.map(async (p) => {
    const d = await loadJson(`data/cartes/${p.fichier}`);
    return { ...p, cartes: d.cartes.map((c) => ({ ...c, deck: p.id, deckTitre: p.titre })) };
  }));
}

async function main() {
  const outlet = document.getElementById('app');
  document.getElementById('version').textContent = `v${VERSION}`;
  initTimer(document.getElementById('timer'));

  let store;
  let decks;
  try {
    store = await openStore();
    decks = await loadDecks();
  } catch (e) {
    outlet.replaceChildren(h('div', { class: 'carte erreur' }, h('h1', null, 'Impossible de démarrer'), h('p', null, String(e.message ?? e)),
      h('p', { class: 'petit' }, 'Vérifie que le navigateur autorise le stockage du site (pas de navigation privée) et recharge la page.')));
    return;
  }

  const routes = [
    { path: '/', render: aujourdhui.render },
    { path: '/brief', render: brief.render },
    { path: '/cartes', render: cartes.renderListe },
    { path: '/cartes/reviser', render: cartes.renderRevision },
    { path: '/sauvegarde', render: sauvegarde.render },
    { path: '*', render: ({ view }) => view.append(h('h1', null, 'Page introuvable'), h('a', { href: '#/' }, 'Retour')) },
  ];
  await createRouter(routes, outlet, { store, decks })();
  window.upgrade = { store, decks }; // pratique pour le débogage dans la console

  // En développement local (localhost), le cache hors ligne gêne : on ne l'active qu'avec ?sw.
  const dev = ['localhost', '127.0.0.1'].includes(location.hostname) && !location.search.includes('sw');
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !dev) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker', e));
  }
}

main();
