// Cartes de culture : sigles, territoires, fonction publique… dix cartes à la fois, répétition espacée d'Upgrade (srs.js).
import { h, fill } from '../../js/ui.js';
import { loadData } from '../../js/data.js';
import { GRADES, GRADE_LABELS, schedule, newState, formatDelay } from '../../js/srs.js';
import { cadre, filtres, melanger } from './cadre.js';

const TAILLE_SERIE = 10;

// Les paquets (data/cartes) et les kits (data/fondations) qui composent chaque thème.
const THEMES = {
  tout: { titre: 'Tout', paquet: () => true, kit: () => true },
  territoires: {
    titre: 'Territoires',
    paquet: (p) => p.id === 'geographie',
    kit: (k) => ['a03', 'a04', 'a05', 'a06', 'a07', 'a08', 'a09'].includes(k.id.slice(0, 3)),
  },
  sigles: { titre: 'Sigles', paquet: (p) => p.id === 'sigles', kit: () => false },
  fonction: { titre: 'Fonction publique', paquet: () => false, kit: (k) => ['a01', 'a02', 'f01'].includes(k.id.slice(0, 3)) },
  finances: { titre: 'Finances et évaluation', paquet: () => false, kit: (k) => /^[bc]\d/.test(k.id) },
};

async function chargerCartes(cle) {
  const t = THEMES[cle];
  const [paquets, kits] = await Promise.all([loadData('cartes/index.json'), loadData('fondations/index.json')]);
  const lots = await Promise.all([
    ...paquets.paquets.filter(t.paquet).map(async (p) => {
      const d = await loadData(`cartes/${p.fichier}`);
      return d.cartes.map((c) => ({ ...c, rubrique: p.titre }));
    }),
    ...kits.kits.filter(t.kit).map(async (k) => {
      const d = await loadData(`fondations/${k.fichier}`);
      return d.cartes.map((c) => ({ ...c, rubrique: k.titre }));
    }),
  ]);
  return lots.flat();
}

// Cartes dues aujourd'hui d'abord, puis cartes jamais vues tirées au hasard.
export function fileDeSerie(cartes, states, now, taille = TAILLE_SERIE, rng = Math.random) {
  const fin = new Date(now).setHours(24, 0, 0, 0);
  const dues = [];
  const neuves = [];
  for (const c of cartes) {
    const s = states.get(c.id);
    if (!s) neuves.push(c);
    else if (s.due < fin) dues.push({ c, due: s.due });
  }
  dues.sort((a, b) => a.due - b.due);
  return [...dues.map((x) => x.c), ...melanger(neuves, rng)].slice(0, taille);
}

export async function render({ view, store, params }) {
  const cle = THEMES[params.t] ? params.t : 'tout';
  const [cartes, states] = await Promise.all([chargerCartes(cle), store.states()]);
  const zone = h('div', { class: 'cartes-zone' });
  const compteur = h('span', { class: 'compteur', 'aria-live': 'polite' });
  view.append(cadre({
    titre: 'Cartes de culture',
    nom: 'cartes',
    outils: [compteur, filtres('/cartes', 't', Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, t.titre])), cle)],
    corps: zone,
  }));

  let file = [];
  let total = 0;
  let vues = 0;
  let bien = 0;
  let montree = false;
  let occupe = false;

  function nouvelleSerie() {
    file = fileDeSerie(cartes, states, Date.now());
    total = file.length;
    vues = 0;
    bien = 0;
    suivante();
  }

  function fin() {
    compteur.textContent = '';
    const vide = total === 0;
    fill(zone, h('div', { class: 'panneau centre' },
      h('p', { class: 'grand' }, vide ? 'Rien à revoir ici.' : `${vues} carte${vues > 1 ? 's' : ''} vue${vues > 1 ? 's' : ''}`),
      h('p', { class: 'discret' }, vide ? 'Toutes les cartes de ce thème sont à jour. Essaie un autre thème.'
        : `${bien} réponse${bien > 1 ? 's' : ''} « Bien » ou « Facile ». Les cartes difficiles reviendront bientôt.`),
      h('div', { class: 'rangee' },
        vide ? null : h('button', { id: 'rejouer', onclick: nouvelleSerie }, `${TAILLE_SERIE} de plus`),
        h('a', { class: 'bouton secondaire', href: '#/' }, 'Accueil'))));
    document.getElementById('rejouer')?.focus();
  }

  function suivante() {
    montree = false;
    occupe = false;
    dessiner();
  }

  function dessiner() {
    if (!file.length) { fin(); return; }
    const carte = file[0];
    const etat = states.get(carte.id) ?? newState(carte.id);
    const now = Date.now();
    compteur.textContent = `${Math.min(total, vues + 1)} / ${total}`;
    const lignes = carte.verso.split('\n');
    const verso = h('div', { class: 'verso' },
      h('p', { class: 'verso-titre' }, lignes[0]),
      lignes.slice(1).map((l) => h('p', null, l)),
      h('p', { class: 'sources' }, carte.sources.slice(0, 3).map((s) => h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', title: s.titre }, s.titre.replace(/ — Wikipédia.*|\s*\(CC BY-SA.*\)/, '')))));
    fill(zone, h('div', { class: 'carte-culture' },
      h('div', { class: 'progression', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.round(100 * vues / total)}%` })),
      h('p', { class: 'etiquette' }, carte.rubrique),
      h('p', { class: 'recto' }, carte.recto),
      montree ? verso : null,
      montree
        ? h('div', { class: 'notes', role: 'group', 'aria-label': 'Ta note' },
          GRADE_LABELS.map((nom, g) => h('button', { class: `note n${g}`, onclick: () => noter(g) },
            h('span', null, nom), h('small', null, formatDelay(now, schedule(etat, g, now).due)), h('kbd', null, String(g + 1)))))
        : h('div', { class: 'rangee' }, h('button', { id: 'reveler', onclick: reveler }, 'Afficher la réponse', h('kbd', null, 'Espace')))));
    document.getElementById('reveler')?.focus();
  }

  function reveler() { montree = true; dessiner(); }

  async function noter(g) {
    if (occupe || !montree) return;
    occupe = true;
    const carte = file.shift();
    states.set(carte.id, await store.review(carte.id, g, Date.now()));
    vues++;
    if (g >= GRADES.BIEN) bien++;
    if (g === GRADES.ENCORE) file.push(carte);
    suivante();
  }

  function surTouche(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !file.length) return;
    if (!montree && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveler(); }
    else if (montree && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); noter(Number(e.key) - 1); }
  }
  document.addEventListener('keydown', surTouche);
  nouvelleSerie();
  return () => document.removeEventListener('keydown', surTouche);
}
