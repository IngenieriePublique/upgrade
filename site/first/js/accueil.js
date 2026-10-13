// Accueil : quatre hexagones autour d'un hexagone central (suivi de la méthode de travail) ; le nom apparaît au survol.
import { h } from '../../js/ui.js';
import { detaillee } from './icones.js';
import { pointsHexagone } from './cadre.js';

const NS = 'http://www.w3.org/2000/svg';
const R = 100;                 // rayon d'un hexagone (unités du viewBox)
const PAS = Math.sqrt(3) * R;  // distance entre deux centres voisins d'une même rangée

export const ACTIVITES = [
  { id: 'territoires', titre: 'Jeu des territoires', icone: 'territoires', x: -PAS / 2, y: -1.5 * R },
  { id: 'cartes', titre: 'Cartes de culture', icone: 'cartes', x: PAS / 2, y: -1.5 * R },
  { id: 'brief', titre: 'Brief d\'actualité', icone: 'brief', x: -PAS / 2, y: 1.5 * R },
  { id: 'lecture', titre: 'Lecture territoriale', icone: 'lecture', x: PAS / 2, y: 1.5 * R },
  { id: 'methode', titre: 'Méthode de travail', icone: 'methode', x: 0, y: 0, centre: true },
  { id: 'calcul', titre: 'Calcul mental', icone: 'calcul', x: PAS, y: 0 },
];

function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function hexagone(a, rang) {
  const lien = el('a', { href: `#/${a.id}`, class: `hex${a.centre ? ' hex-centre' : ''}`, 'aria-label': a.titre, style: `--rang:${rang}` });
  const g = el('g', { transform: `translate(${a.x.toFixed(2)} ${a.y.toFixed(2)})` });
  const corps = el('g', { class: 'hex-corps' });
  corps.append(el('polygon', { points: pointsHexagone(R * 0.94) }));
  const ico = el('svg', { viewBox: '0 0 48 48', x: -45, y: -50, width: 90, height: 90, class: 'ico' });
  ico.append(detaillee(a.icone));
  corps.append(ico);
  const legende = el('text', { class: 'hex-nom', y: 63, 'text-anchor': 'middle' });
  legende.textContent = a.titre;
  corps.append(legende);
  g.append(corps);
  lien.append(g);
  return lien;
}

export function render({ view }) {
  const demi = 1.5 * PAS + 10;
  const svg = el('svg', { class: 'ruche', viewBox: `${-demi} -255 ${2 * demi} 510`, role: 'group', 'aria-label': 'Activités' });
  ACTIVITES.forEach((a, i) => svg.append(hexagone(a, i)));

  const bulle = h('div', { class: 'bulle-ruche', role: 'tooltip', hidden: true });
  const place = (x, y) => { bulle.style.left = `${x + 16}px`; bulle.style.top = `${y + 18}px`; };
  const montre = (a, x, y) => { bulle.textContent = a.titre; bulle.hidden = false; place(x, y); };
  svg.querySelectorAll('a.hex').forEach((lien, i) => {
    const a = ACTIVITES[i];
    lien.addEventListener('pointerenter', (e) => montre(a, e.clientX, e.clientY));
    lien.addEventListener('pointermove', (e) => place(e.clientX, e.clientY));
    lien.addEventListener('pointerleave', () => { bulle.hidden = true; });
    lien.addEventListener('focus', () => {
      const r = lien.getBoundingClientRect();
      montre(a, r.left + r.width / 2 - 16, r.top + r.height / 2);
    });
    lien.addEventListener('blur', () => { bulle.hidden = true; });
  });

  view.append(h('main', { class: 'accueil' },
    h('p', { class: 'marque' }, 'First Upgrade'),
    h('div', { class: 'ruche-zone' }, svg),
    bulle));
}
