import { openStore } from './store.js';
import { createRouter } from './router.js';
import { initTimer } from './timer.js';
import { h } from './ui.js';
import { VERSION } from './version.js';
import * as aujourdhui from './modules/aujourdhui.js';
import * as cartes from './modules/cartes.js';
import * as brief from './modules/brief.js';
import * as sauvegarde from './modules/sauvegarde.js';
import * as sprint from './modules/sprint.js';
import * as radar from './modules/radar.js';
import * as recit from './modules/recit.js';
import * as oral from './modules/oral.js';
import * as reseau from './modules/reseau.js';
import * as choix from './modules/choix.js';
import * as territoires from './modules/territoires.js';
import * as fondations from './modules/fondations.js';
import * as dictee from './modules/dictee.js';
import { categoriesActives, ajouterRegles } from './dictee.js';
import { notesParKit, ajouterCartesKit } from './fondations.js';

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

// Les cartes des kits « commencés » rejoignent la révision (un paquet Fondations par parcours).
async function ajouterCartesDesKits(store, decks) {
  const index = await loadJson('data/fondations/index.json');
  const ouverts = [...notesParKit(await store.notes('kit'))].filter(([, n]) => n.data?.startedAt).map(([id]) => id);
  for (const id of ouverts) {
    const meta = index.kits.find((k) => k.id === id);
    if (!meta) continue; // kit retiré du curriculum : sa note reste, ses cartes disparaissent
    const kit = await loadJson(`data/fondations/${meta.fichier}`);
    ajouterCartesKit(decks, index.parcours.find((p) => p.id === kit.parcours), kit);
  }
}

// Les règles des catégories où l'utilisateur a marqué des fautes de dictée rejoignent la révision.
async function ajouterReglesDeDictee(store, decks) {
  const actives = categoriesActives(await store.notes('regle'));
  if (actives.size) ajouterRegles(decks, await loadJson('data/dictees/regles.json'), actives);
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
    await ajouterCartesDesKits(store, decks);
    await ajouterReglesDeDictee(store, decks);
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
    { path: '/fondations', render: fondations.renderListe },
    { path: '/fondations/kit', render: fondations.renderKit },
    { path: '/dictee', render: dictee.renderMenu },
    { path: '/dictee/ecrire', render: dictee.renderEcrire },
    { path: '/dictee/corriger', render: dictee.renderCorriger },
    { path: '/territoires', render: territoires.renderMenu },
    { path: '/territoires/jeu', render: territoires.renderJeu },
    { path: '/territoires/plusmoins', render: territoires.renderPlusMoins },
    { path: '/territoires/qui', render: territoires.renderQui },
    { path: '/territoires/fiches', render: territoires.renderFiches },
    { path: '/territoires/fiche', render: territoires.renderFiche },
    { path: '/sprint', render: sprint.render },
    { path: '/sprint/radar', render: radar.render },
    { path: '/sprint/recit', render: recit.render },
    { path: '/sprint/oral', render: oral.render },
    { path: '/sprint/reseau', render: reseau.render },
    { path: '/sprint/choix', render: choix.render },
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
