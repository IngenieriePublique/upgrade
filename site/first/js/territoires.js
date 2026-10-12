// Jeu des territoires : dix questions à la fois (départements, régions, préfectures), à jouer quand on veut.
// Utilise la logique et la répétition espacée d'Upgrade (site/js/territoires.js, srs.js) : la progression est conservée.
import { h, fill } from '../../js/ui.js';
import { loadData } from '../../js/data.js';
import { creerCarte, chargerGeo } from '../../js/carte-svg.js';
import { MODES, creerItems, creerQuestion, noterReponse } from '../../js/territoires.js';
import { cadre, filtres, melanger } from './cadre.js';

const TAILLE_SERIE = 10;

const FILTRES = {
  melange: { titre: 'Mélange', modes: ['placer-dep', 'nom-dep', 'placer-reg', 'pref-dep', 'dep-pref', 'chef-reg'] },
  dep: { titre: 'Départements', modes: ['placer-dep', 'nom-dep', 'num-code'] },
  reg: { titre: 'Régions', modes: ['placer-reg', 'region-de'] },
  pref: { titre: 'Préfectures', modes: ['pref-dep', 'dep-pref', 'chef-reg'] },
};

// Éléments dus aujourd'hui d'abord, puis des éléments jamais vus tirés au hasard.
export function fileDeSerie(pool, states, now, taille = TAILLE_SERIE, rng = Math.random) {
  const fin = new Date(now).setHours(24, 0, 0, 0);
  const dus = [];
  const neufs = [];
  for (const it of pool) {
    const s = states.get(it.id);
    if (!s) neufs.push(it);
    else if (s.due < fin) dus.push({ it, due: s.due });
  }
  dus.sort((a, b) => a.due - b.due);
  return [...dus.map((x) => x.it), ...melanger(neufs, rng)].slice(0, taille);
}

export async function render({ view, store, params }) {
  const cle = FILTRES[params.m] ? params.m : 'melange';
  const [data, geo] = await Promise.all([loadData('territoires/data.json'), chargerGeo()]);
  const items = creerItems(data).filter((i) => FILTRES[cle].modes.includes(i.mode));
  const states = await store.states();

  const jeu = h('div', { class: 'jeu' });
  const compteur = h('span', { class: 'compteur', 'aria-live': 'polite' });
  view.append(cadre({
    titre: 'Jeu des territoires',
    nom: 'territoires',
    outils: [compteur, filtres('/territoires', 'm', Object.fromEntries(Object.entries(FILTRES).map(([k, f]) => [k, f.titre])), cle)],
    corps: jeu,
  }));

  let file = [];
  let total = 0;
  let bilan = { reponses: 0, justes: 0 };
  let courant = null;
  let verrou = false;
  const reposees = new Set();

  function nouvelleSerie() {
    file = fileDeSerie(items, states, Date.now());
    total = file.length;
    bilan = { reponses: 0, justes: 0 };
    reposees.clear();
    suivante();
  }

  function fin() {
    courant = null;
    compteur.textContent = '';
    const vide = total === 0;
    fill(jeu, h('div', { class: 'panneau centre' },
      h('p', { class: 'grand' }, vide ? 'Rien à voir ici pour le moment.' : `${bilan.justes} sur ${bilan.reponses}`),
      h('p', { class: 'discret' }, vide ? 'Tout est à jour : essaie un autre filtre, ou reviens plus tard.'
        : (bilan.justes === bilan.reponses ? 'Sans faute.' : 'Les questions ratées reviendront bientôt.')),
      h('div', { class: 'rangee' },
        vide ? null : h('button', { id: 'rejouer', onclick: nouvelleSerie }, `${TAILLE_SERIE} de plus`),
        h('a', { class: 'bouton secondaire', href: '#/' }, 'Accueil'))));
    document.getElementById('rejouer')?.focus();
  }

  function suivante() {
    if (!file.length) { fin(); return; }
    verrou = false;
    const item = file.shift();
    const q = creerQuestion(item, data);
    const debut = Date.now();
    const surClic = q.type === 'clic' ? (code) => repondreClic(code) : null;
    const carte = q.couche ? creerCarte(geo, { couche: q.couche, fond: q.couche === 'departements' ? 'regions' : null, onClic: surClic }) : null;
    if (carte && q.surbrillance) carte.marquer(q.surbrillance, 'cible');
    const retour = h('div', { class: 'retour-jeu', 'aria-live': 'polite' });
    const reponses = h('div', { class: q.type === 'qcm' ? 'choix' : 'rangee' });
    courant = { q };
    compteur.textContent = `${Math.min(total, total - file.length)} / ${total}`;

    async function repondre(juste, extra) {
      if (verrou) return;
      verrou = true;
      const etat = await store.review(item.id, noterReponse(juste, Date.now() - debut), Date.now());
      states.set(item.id, etat);
      bilan.reponses++;
      if (juste) bilan.justes++;
      else if (!reposees.has(item.id)) { reposees.add(item.id); file.push(item); }
      fill(retour,
        h('p', { class: juste ? 'juste' : 'rate' }, juste ? 'Juste.' : 'Pas tout à fait.'),
        h('p', null, q.explication), extra,
        h('button', { id: 'suivant', onclick: suivante }, file.length ? 'Suivante' : 'Terminer', h('kbd', null, 'Entrée')));
      document.getElementById('suivant')?.focus();
    }

    function repondreClic(code) {
      if (verrou) return;
      const juste = code === q.cible;
      if (!juste) carte.marquer(code, 'faux');
      carte.marquer(q.cible, 'ok');
      repondre(juste);
    }

    if (q.type === 'qcm') {
      q.choix.forEach((c, i) => {
        const b = h('button', { class: 'choix-btn secondaire', 'data-valeur': c.valeur, onclick: () => {
          if (verrou) return;
          const juste = c.valeur === q.bonne;
          b.classList.add(juste ? 'ok' : 'faux');
          reponses.querySelectorAll('button').forEach((x) => { x.disabled = true; if (x.dataset.valeur === q.bonne) x.classList.add('ok'); });
          repondre(juste);
        } }, h('span', null, c.libelle), h('kbd', null, String(i + 1)));
        reponses.append(b);
      });
    } else {
      reponses.append(h('button', { class: 'secondaire', onclick: () => {
        if (verrou) return;
        carte.marquer(q.cible, 'ok');
        repondre(false);
      } }, 'Je ne sais pas'));
    }

    fill(jeu,
      carte ? h('div', { class: 'jeu-carte' }, carte.el) : null,
      h('div', { class: `panneau${carte ? '' : ' centre'}` },
        h('div', { class: 'progression', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.max(0, Math.round(100 * (total - file.length - 1) / total))}%` })),
        h('p', { class: 'etiquette' }, MODES[item.mode].titre),
        h('p', { class: 'consigne' }, q.consigne),
        reponses,
        retour));
    jeu.classList.toggle('sans-carte', !carte);
  }

  function surTouche(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !courant) return;
    if (!verrou && courant.q.type === 'qcm' && ['1', '2', '3', '4'].includes(e.key)) {
      const b = jeu.querySelectorAll('.choix-btn')[Number(e.key) - 1];
      if (b) { e.preventDefault(); b.click(); }
    } else if (verrou && e.key === 'Enter') {
      const s = document.getElementById('suivant');
      if (s && document.activeElement !== s) { e.preventDefault(); s.click(); }
    }
  }
  document.addEventListener('keydown', surTouche);
  nouvelleSerie();
  return () => document.removeEventListener('keydown', surTouche);
}
