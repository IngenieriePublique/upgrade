// Carte SVG des territoires, construite à partir de data/geo/france.json (tracés précalculés par scripts/build_geo.py).
// Les couches : « departements », « regions », « anciennes ». Chaque territoire est un <path data-code="…">.
import { loadData } from './data.js';

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  return el;
}

export const chargerGeo = () => loadData('geo/france.json');

// Renvoie { el, marquer(code, classe), retirer(classe), chemin(code) }.
//   couche : couche cliquable ; fond : couche dessinée en contour par-dessus (ou null) ;
//   onClic(code) : appelé au clic sur un territoire (absent : carte non interactive) ;
//   niveaux : Map code -> 0..3 (carte de maîtrise) ; noms : Map code -> nom (titres au survol).
export function creerCarte(geo, { couche = 'departements', fond = null, onClic = null, niveaux = null, noms = null, etiquettes = true } = {}) {
  const racine = svg('svg', { viewBox: geo.viewBox, class: 'carte-svg', role: 'img', 'aria-label': 'Carte de la France' });
  const g = svg('g', { class: 'territoires' });
  const chemins = new Map();
  for (const [code, t] of Object.entries(geo[couche])) {
    const p = svg('path', { d: t.d, class: `t${niveaux ? ` m${niveaux.get(code) ?? 0}` : ''}${onClic ? ' cliquable' : ''}`, 'data-code': code });
    if (noms?.has(code)) { const titre = svg('title'); titre.textContent = noms.get(code); p.append(titre); }
    if (onClic) p.addEventListener('click', () => onClic(code));
    g.append(p);
    chemins.set(code, p);
  }
  racine.append(g);
  if (fond && fond !== couche) {
    const contour = svg('g', { class: 'contour-fond', 'pointer-events': 'none' });
    for (const t of Object.values(geo[fond])) contour.append(svg('path', { d: t.d }));
    racine.append(contour);
  }
  if (couche !== 'anciennes' && etiquettes) {
    for (const c of geo.cadres) {
      const rect = svg('rect', { x: c.x, y: c.y, width: c.w, height: c.h, class: 'cadre', rx: 4, 'pointer-events': 'none' });
      const txt = svg('text', { x: c.x + c.w / 2, y: c.y + c.h - 6, class: 'cadre-nom', 'text-anchor': 'middle', 'pointer-events': 'none' });
      txt.textContent = c.nom;
      racine.insertBefore(rect, g);
      racine.append(txt);
    }
  }
  return {
    el: racine,
    chemin: (code) => chemins.get(code),
    marquer(code, classe) {
      const p = chemins.get(code);
      if (p) { p.classList.add(classe); p.parentNode.append(p); } // au premier plan : son contour reste visible
    },
    retirer(classe) { for (const p of chemins.values()) p.classList.remove(classe); },
  };
}
