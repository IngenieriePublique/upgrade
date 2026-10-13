// Cadre commun d'une page d'activité : barre du haut (retour en hexagone, titre, outils) et corps qui ne défile pas.
import { h } from '../../js/ui.js';
import { icone } from './icones.js';

const NS = 'http://www.w3.org/2000/svg';

export const pointsHexagone = (rayon, cx = 0, cy = 0) => Array.from({ length: 6 }, (_, k) => {
  const a = (Math.PI / 180) * (60 * k - 30);
  return `${(cx + rayon * Math.cos(a)).toFixed(2)},${(cy + rayon * Math.sin(a)).toFixed(2)}`;
}).join(' ');

function boutonRetour(href = '#/', titre = 'Accueil') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-20 -20 40 40');
  svg.setAttribute('width', 40);
  svg.setAttribute('height', 40);
  svg.setAttribute('aria-hidden', 'true');
  const poly = document.createElementNS(NS, 'polygon');
  poly.setAttribute('points', pointsHexagone(18));
  poly.setAttribute('class', 'retour-hex');
  svg.append(poly);
  const ico = icone('retour', { taille: 18 });
  ico.setAttribute('x', -9);
  ico.setAttribute('y', -9);
  svg.append(ico);
  return h('a', { class: 'retour', href, 'aria-label': `Retour : ${titre}`, title: titre }, svg);
}

// outils : éléments placés à droite du titre (filtres, compteurs). retour : { href, titre } d'une sous-page (par défaut l'accueil).
export function cadre({ titre, nom, outils = [], corps, retour = { href: '#/', titre: 'Accueil' } }) {
  return h('section', { class: `activite activite-${nom}` },
    h('header', { class: 'barre' },
      boutonRetour(retour.href, retour.titre),
      h('h1', null, titre),
      h('div', { class: 'outils' }, outils)),
    h('div', { class: 'corps' }, corps));
}

// Rangée de filtres (liens de la même page avec un paramètre) : la page active porte aria-current.
export function filtres(base, cle, options, courant) {
  return h('nav', { class: 'filtres', 'aria-label': 'Filtres' },
    Object.entries(options).map(([k, titre]) => h('a', {
      class: `filtre${k === courant ? ' actif' : ''}`,
      href: `#${base}?${cle}=${k}`,
      'aria-current': k === courant ? 'true' : null,
    }, titre)));
}

export function melanger(tab, rng = Math.random) {
  const a = [...tab];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pastille « lu » : un petit cercle vide qu'on coche quand on a lu l'article (rempli et coché ensuite).
// onChange(lu) est appelé après chaque clic avec le nouvel état ; le clic ne se propage pas (la pastille peut flotter sur un article cliquable).
export function pastilleLu({ lu = false, onChange, objet = 'cet article' }) {
  const b = h('button', { type: 'button', class: 'pastille-lu' });
  const maj = (etat) => {
    b.classList.toggle('lu', etat);
    b.setAttribute('aria-pressed', String(etat));
    b.setAttribute('aria-label', etat ? `Lu : ${objet} (cliquer pour décocher)` : `Marquer ${objet} comme lu`);
    b.title = etat ? 'Lu (cliquer pour décocher)' : 'Marquer comme lu';
    b.replaceChildren(...(etat ? [icone('coche', { taille: 14 })] : []));
  };
  let etat = lu;
  maj(etat);
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    etat = !etat;
    maj(etat);
    await onChange?.(etat);
  });
  return b;
}
