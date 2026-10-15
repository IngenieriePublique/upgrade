// Cartes du jeu des territoires de First Upgrade : cadrage sur une région, pins et étiquettes de la révision, carte des villes.
// S'appuie sur creerCarte (site/js/carte-svg.js) ; les fonctions de calcul (vueDe, optionsCarte) n'utilisent pas le DOM.
import { creerCarte } from '../../js/carte-svg.js';
import { candidatsAutour, candidatsCentre, largeur, placer } from './etiquettes.js';

const NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  return el;
}

// Rectangle englobant des tracés « M x y L x y … Z » (coordonnées absolues).
export function bornes(geo, couche, codes) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const code of codes) {
    const nombres = geo[couche][code].d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    for (let i = 0; i + 1 < nombres.length; i += 2) {
      x0 = Math.min(x0, nombres[i]); x1 = Math.max(x1, nombres[i]);
      y0 = Math.min(y0, nombres[i + 1]); y1 = Math.max(y1, nombres[i + 1]);
    }
  }
  return { x0, y0, x1, y1 };
}

const enVue = ({ x0, y0, x1, y1 }, marge) => {
  const m = Math.max(x1 - x0, y1 - y0) * marge;
  return `${(x0 - m).toFixed(1)} ${(y0 - m).toFixed(1)} ${(x1 - x0 + 2 * m).toFixed(1)} ${(y1 - y0 + 2 * m).toFixed(1)}`;
};

// viewBox qui cadre les territoires `codes` de la couche, avec une marge relative.
export const vueDe = (geo, couche, codes, marge = 0.07) => enVue(bornes(geo, couche, codes), marge);

// viewBox qui cadre les encarts d'outre-mer.
export function vueEncarts(geo, marge = 0.03) {
  const b = geo.cadres.reduce((a, c) => ({ x0: Math.min(a.x0, c.x), y0: Math.min(a.y0, c.y), x1: Math.max(a.x1, c.x + c.w), y1: Math.max(a.y1, c.y + c.h) }),
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  return enVue(b, marge);
}

// Options de creerCarte pour un format de jeu. groupe : { deps, outreMer } pour les départements d'une région.
export function optionsCarte(geo, data, format, groupe = null, { legendes = false } = {}) {
  const metro = new Set(data.departements.filter((d) => !d.outre_mer).map((d) => d.code));
  if (format === 'departements' && groupe) {
    if (groupe.outreMer) return { visibles: new Set(groupe.deps), vue: vueEncarts(geo), cadres: true, legendes };
    return { visibles: metro, actifs: new Set(groupe.deps), vue: vueDe(geo, 'departements', groupe.deps), cadres: false };
  }
  if (format === 'villes') return { visibles: metro, vue: vueDe(geo, 'departements', [...metro], 0.02), cadres: false };
  return { legendes }; // régions : toute la France, avec les encarts
}

export const largeurVue = (carte) => Number(carte.el.getAttribute('viewBox').split(' ')[2]);
const bornesVue = (carte) => { const [x, y, w, h] = carte.el.getAttribute('viewBox').split(' ').map(Number); return { x0: x, y0: y, x1: x + w, y1: y + h }; };

// ---------- pins et étiquettes de la révision ----------

// Contour d'un pin (goutte dont la pointe est sur le lieu), de hauteur 1.
export const GOUTTE = 'M0 0C-.28-.42-.36-.58-.36-.7a.36.36 0 1 1 .72 0C.36-.58.28-.42 0 0Z';

// Rectangle occupé par un pin de hauteur h planté sur (x, y).
export const rectPin = (x, y, h) => ({ x0: x - h * 0.38, y0: y - h, x1: x + h * 0.38, y1: y });

// Pose, sur une carte, les étiquettes de zones (nom d'une région ou d'un département, au centre de la zone) et les pins de
// préfecture avec leur nom, de façon qu'aucune étiquette n'en recouvre une autre ni un pin.
//   zones : [{ id, x, y, texte }]    pins : [{ id, x, y, nom, echelle?, taille? }]    taille : corps du texte (unités du viewBox)
//   evite : rectangles supplémentaires à éviter (légendes des encarts d'outre-mer)
// Renvoie Map id de pin -> élément du pin (pour le survol).
export function poserRevision(carte, { zones = [], pins = [], taille, evite = [] }) {
  const hPin = taille * 1.5;
  const rects = new Map(pins.map((p) => [p.id, rectPin(p.x, p.y, hPin * (p.echelle ?? 1))]));
  const items = [];
  for (const z of zones) {
    items.push({ id: `z:${z.id}`, w: largeur(z.texte, taille, true) + taille * 0.4, h: taille * 1.3, candidats: candidatsCentre(z.x, z.y, taille * 1.1) });
  }
  for (const p of pins) {
    const t = p.taille ?? taille * 1.0;
    const w = largeur(p.nom, t) + t * 0.4;
    const h = t * 1.3;
    items.push({ id: `p:${p.id}`, w, h, candidats: candidatsAutour(rects.get(p.id), w, h, t * 0.12) });
  }
  const places = placer(items, { obstacles: [...rects.values(), ...evite], bornes: bornesVue(carte) });

  const g = svg('g', { class: 'revision', 'pointer-events': 'none' });
  const elements = new Map();
  for (const p of pins) {
    const h = hPin * (p.echelle ?? 1);
    const pin = svg('g', { class: 'pin', transform: `translate(${p.x} ${p.y}) scale(${h.toFixed(2)})`, 'data-id': p.id });
    pin.append(svg('path', { d: GOUTTE }), svg('circle', { class: 'trou', cx: 0, cy: -0.7, r: 0.15 }));
    g.append(pin);
    elements.set(p.id, pin);
  }
  // Un nom repoussé loin de son pin (zone dense, comme la petite couronne de Paris) y reste relié par un trait fin.
  for (const p of pins) {
    const r = places.get(`p:${p.id}`).rect;
    const h = hPin * (p.echelle ?? 1);
    const px = p.x;
    const py = p.y - h * 0.7;
    const nx = Math.min(Math.max(px, r.x0), r.x1);
    const ny = Math.min(Math.max(py, r.y0), r.y1);
    if (Math.hypot(nx - px, ny - py) > taille * 1.1) {
      g.append(svg('line', { class: 'repere', x1: px.toFixed(1), y1: py.toFixed(1), x2: nx.toFixed(1), y2: ny.toFixed(1), 'stroke-width': (taille * 0.07).toFixed(2) }));
    }
  }
  const ecrire = (cle, texte, classe, corps) => {
    const c = places.get(cle);
    const t = svg('text', { x: c.cx.toFixed(1), y: c.cy.toFixed(1), class: classe, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': corps.toFixed(1) });
    t.textContent = texte;
    g.append(t);
  };
  for (const z of zones) ecrire(`z:${z.id}`, z.texte, 'etiq', taille);
  for (const p of pins) ecrire(`p:${p.id}`, p.nom, 'etiq sous', p.taille ?? taille * 1.0);
  carte.el.append(g);
  return elements;
}

// Rectangles des légendes d'outre-mer (texte au bas de chaque encadré) : à éviter quand elles sont affichées.
export const legendesEncarts = (geo) => geo.cadres.map((c) => {
  const w = largeur(c.nom, 11);
  return { x0: c.x + c.w / 2 - w / 2, x1: c.x + c.w / 2 + w / 2, y0: c.y + c.h - 14, y1: c.y + c.h - 1 };
});

// ---------- carte des villes ----------

const rayonPopulation = (pop, max, taille) => taille * (0.3 + 0.75 * Math.sqrt(pop / max));

// Carte des villes : tous les départements de métropole en fond, un point par ville.
//   population : la taille de chaque pastille suit le nombre d'habitants (écran de révision) ; sinon pastilles identiques (jeu).
// Renvoie la même interface que creerCarte : { el, marquer, retirer, chemin } + nommer(id) / nommerTout().
export function carteVilles(geo, data, villes, { onClic = null, population = false } = {}) {
  const base = creerCarte(geo, { couche: 'departements', ...optionsCarte(geo, data, 'villes') });
  base.el.setAttribute('aria-label', 'Carte des principales villes de France');
  const taille = largeurVue(base) / 62;
  const max = Math.max(...villes.map((v) => v.population ?? 0), 1);
  const rayon = (v) => (population && v.population ? rayonPopulation(v.population, max, taille) : taille * 0.42);

  const pts = svg('g', { class: 'villes' });
  const points = new Map();
  for (const v of villes) {
    const g = svg('g', { class: `ville${onClic ? ' cliquable' : ''}`, 'data-id': v.id, transform: `translate(${v.x} ${v.y})` });
    g.append(svg('circle', { class: 'zone', r: Math.max(taille * 1.15, rayon(v)).toFixed(1) }), svg('circle', { class: 'pt', r: rayon(v).toFixed(1) }));
    if (population && v.population) {
      const t = svg('title');
      t.textContent = `${v.nom} : ${v.population.toLocaleString('fr-FR')} habitants (Wikidata)`;
      g.append(t);
    }
    if (onClic) g.addEventListener('click', () => onClic(v.id));
    pts.append(g);
    points.set(v.id, g);
  }
  base.el.append(pts);

  // Emplacement de chaque nom, calculé une fois pour toutes les villes (les plus peuplées d'abord) ; affiché à la demande.
  const t = taille * 0.95;
  const rects = new Map(villes.map((v) => [v.id, { x0: v.x - rayon(v), y0: v.y - rayon(v), x1: v.x + rayon(v), y1: v.y + rayon(v) }]));
  const places = placer(villes.map((v) => {
    const w = largeur(v.nom, t, true) + t * 0.3;
    const h = t * 1.3;
    return { id: v.id, w, h, candidats: candidatsAutour(rects.get(v.id), w, h, t * 0.1) };
  }), { obstacles: [...rects.values()], bornes: bornesVue(base) });
  const noms = new Map();
  function etiquette(v) {
    if (noms.has(v.id)) return;
    const c = places.get(v.id);
    const texte = svg('text', { x: (c.cx - v.x).toFixed(1), y: (c.cy - v.y).toFixed(1), class: 'etiq', 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': t.toFixed(1), 'pointer-events': 'none' });
    texte.textContent = v.nom;
    points.get(v.id).append(texte);
    noms.set(v.id, texte);
  }
  return {
    el: base.el,
    chemin: (id) => points.get(id),
    marquer(id, classe) { const g = points.get(id); if (g) { g.classList.add(classe); g.parentNode.append(g); } },
    retirer(classe) { for (const g of points.values()) g.classList.remove(classe); },
    nommer(id) { const v = villes.find((x) => x.id === id); if (v) etiquette(v); },
    nommerTout() { villes.forEach(etiquette); },
  };
}

// ---------- carte des pays d'un continent ----------

// geo : site/data/geo/monde-<continent>.json ({ viewBox, rayon, pays: { ISO: { d, c, petit?, cap? } } }) ; actifs : Set des pays du jeu (les autres
// sont dessinés en contexte) ; noms : Map ISO -> nom français. Un pays trop petit pour être cliqué reçoit une pastille (`petit`).
// Renvoie la même interface que creerCarte : { el, marquer, retirer, chemin } + nommer(code) / nommerTout() ; chemin(code) est le <g> du pays.
// vue : viewBox à employer à la place de celui du fichier (une marge de mer autour du continent, pour la révision) ; les noms gardent leur taille.
export function cartePays(geo, actifs, noms, { onClic = null, vue = null } = {}) {
  const racine = svg('svg', { viewBox: vue ?? geo.viewBox, class: 'carte-svg', role: 'img', 'aria-label': 'Carte des pays du continent' });
  const fond = svg('g', { class: 'territoires' });
  const groupes = new Map();
  const entrees = Object.entries(geo.pays).sort(([a, ta], [b, tb]) => (actifs.has(a) ? 1 + (ta.petit ? 1 : 0) : 0) - (actifs.has(b) ? 1 + (tb.petit ? 1 : 0) : 0));
  for (const [code, t] of entrees) {
    const actif = actifs.has(code);
    const grp = svg('g', { class: `pays${actif ? '' : ' hors'}${actif && onClic ? ' cliquable' : ''}`, 'data-code': code });
    if (t.d) grp.append(svg('path', { d: t.d, class: `t${actif ? '' : ' hors'}` }));
    if (actif && t.petit) grp.append(svg('circle', { class: 'pt', cx: t.c[0], cy: t.c[1], r: geo.rayon }));
    if (actif && onClic) grp.addEventListener('click', () => onClic(code));
    fond.append(grp);
    if (actif) groupes.set(code, grp);
  }
  racine.append(fond);

  // Un nom se pose à la demande, à côté de la pastille du pays s'il est petit, sinon au centre du pays, en évitant les pastilles et les noms déjà posés.
  const taille = Number(geo.viewBox.split(' ')[2]) / 60;
  const h = taille * 1.3;
  const rects = new Map();
  for (const [code, t] of Object.entries(geo.pays)) if (actifs.has(code) && t.petit) rects.set(code, { x0: t.c[0] - geo.rayon, y0: t.c[1] - geo.rayon, x1: t.c[0] + geo.rayon, y1: t.c[1] + geo.rayon });
  const ordre = [...groupes.keys()].sort((a, b) => Number(!!geo.pays[a].petit) - Number(!!geo.pays[b].petit));
  const etiquettes = svg('g', { class: 'noms', 'pointer-events': 'none' });
  racine.append(etiquettes);
  const poses = new Set();
  const occupes = [];
  function nommer(code) {
    if (poses.has(code) || !groupes.has(code)) return;
    poses.add(code);
    const t = geo.pays[code];
    const w = largeur(noms.get(code) ?? '', taille, true) + taille * 0.3;
    const c = placer([{ id: code, w, h, candidats: t.petit ? candidatsAutour(rects.get(code), w, h, taille * 0.1) : candidatsCentre(t.c[0], t.c[1], taille * 1.1) }],
      { obstacles: [...rects.values(), ...occupes], bornes: bornesVue({ el: racine }) }).get(code);
    occupes.push(c.rect);
    const texte = svg('text', { x: c.cx.toFixed(1), y: c.cy.toFixed(1), class: 'etiq', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': taille.toFixed(1) });
    texte.textContent = noms.get(code);
    etiquettes.append(texte);
  }
  return {
    el: racine,
    chemin: (code) => groupes.get(code),
    marquer(code, classe) { const g = groupes.get(code); if (g) { g.classList.add(classe); g.parentNode.append(g); } },
    retirer(classe) { for (const g of groupes.values()) g.classList.remove(classe); },
    nommer,
    nommerTout() { ordre.forEach(nommer); },
  };
}

// ---------- carte du monde centrée sur les territoires français ----------

// geo : site/data/geo/monde-om.json ({ viewBox, pays, marqueurs: [{ code, nom, x, y }] }). Chaque marqueur est un département
// d'outre-mer (code « 971 »…) ou la métropole ; chemin(code) accepte aussi le code de la région d'outre-mer correspondante.
export function carteMonde(geo, data) {
  const racine = svg('svg', { viewBox: geo.viewBox, class: 'carte-svg carte-monde', role: 'img', 'aria-label': 'Position des territoires français dans le monde' });
  const fond = svg('g', { class: 'territoires' });
  for (const [code, t] of Object.entries(geo.pays)) fond.append(svg('path', { d: t.d, class: code === 'FR' ? 't fr' : 't hors', 'pointer-events': 'none' }));
  racine.append(fond);
  const taille = largeurVue({ el: racine }) / 30;
  const rayon = taille * 0.4;
  const rects = geo.marqueurs.map((m) => ({ x0: m.x - rayon, y0: m.y - rayon, x1: m.x + rayon, y1: m.y + rayon }));
  const places = placer(geo.marqueurs.map((m, i) => {
    const w = largeur(m.nom, taille) + taille * 0.3;
    const h = taille * 1.3;
    return { id: m.code, w, h, candidats: candidatsAutour(rects[i], w, h, taille * 0.1) };
  }), { obstacles: rects, bornes: bornesVue({ el: racine }) });
  const par = new Map();
  const reperes = svg('g', { class: 'reperes-om', 'pointer-events': 'none' });
  for (const m of geo.marqueurs) {
    const g = svg('g', { class: 'om', 'data-code': m.code });
    g.append(svg('circle', { cx: m.x, cy: m.y, r: rayon.toFixed(1) }));
    const c = places.get(m.code);
    const t = svg('text', { x: c.cx.toFixed(1), y: c.cy.toFixed(1), class: 'etiq sous', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': taille.toFixed(1) });
    t.textContent = m.nom;
    g.append(t);
    reperes.append(g);
    par.set(m.code, g);
  }
  racine.append(reperes);
  for (const r of data.regions.filter((x) => x.outre_mer)) par.set(r.code, par.get(r.departements[0]));
  return { el: racine, chemin: (code) => par.get(code) };
}
