// Écran de révision du format « pays » : la carte du continent occupe tout l'écran, avec le nom de chaque pays (blanc) et sa capitale
// (bleu, plus petite), sans qu'une étiquette en recouvre une autre ; une petite carte du monde indique le continent dans un coin libre.
// Calculs sans accès au DOM, sauf le dessin (poserRevisionPays, miniMonde) ; testés par tests/first.test.js.
import { GOUTTE, rectPin, svg } from './carte-first.js';
import { candidatsAutour, candidatsCentre, distancePointRect, largeur, placerRecuit } from './etiquettes.js';

// Corps du texte en pixels écran : on cherche le plus grand corps (nom des pays) qui évite tout recouvrement, entre `debut` et `fin` ;
// une capitale a `capitale` fois ce corps. `penaliteRepli` : ce que coûte, dans le calcul de placement, une étiquette reportée dans la marge
// de mer (reliée à son pays par un trait) : elle n'y va qu'en dernier recours ; `renvois` : le nombre d'étiquettes ainsi reportées qu'on
// accepte avant de préférer un corps plus petit ; `longueurTrait` : longueur maximale (unités du viewBox) d'un trait.
export const PX = { debut: 13, fin: 7.5, pas: 0.75, capitale: 0.8, penaliteRepli: 400, renvois: 10, longueurTrait: 260 };

// ---------- cadrage ----------

// viewBox du fichier ({ x, y, w, h } = 0 0 W H) agrandi, par de la mer autour, à la forme de la zone d'affichage (largeurPx × hauteurPx) :
// la carte remplit la zone, et la marge sert aux titres et à la mini-carte.
export function vueEtendue(viewBox, largeurPx, hauteurPx) {
  const [, , W, H] = viewBox.split(' ').map(Number);
  if (!(largeurPx > 0 && hauteurPx > 0)) return { x: 0, y: 0, w: W, h: H };
  const ratio = largeurPx / hauteurPx;
  if (ratio > W / H) { const w = H * ratio; return { x: (W - w) / 2, y: 0, w, h: H }; }
  const h = W / ratio;
  return { x: 0, y: (H - h) / 2, w: W, h };
}

export const vueEnTexte = (v) => `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`;

// ---------- emplacement libre pour la mini-carte ----------

const CACHE = new WeakMap();

// Polygones (anneaux) de tous les tracés d'un fichier de continent, avec leur rectangle englobant.
function polygones(geo) {
  if (CACHE.has(geo)) return CACHE.get(geo);
  const liste = [];
  for (const t of Object.values(geo.pays)) {
    if (!t.d) continue;
    for (const sous of t.d.split('M').slice(1)) {
      const n = sous.match(/-?\d+(?:\.\d+)?/g).map(Number);
      const pts = [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      liste.push({ pts, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
    }
  }
  CACHE.set(geo, liste);
  return liste;
}

function dans(x, y, pts) {
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

// Part d'un rectangle { x0, y0, x1, y1 } recouverte par des terres (échantillon régulier de pas × pas points), entre 0 et 1.
export function fractionTerre(geo, r, pas = 8) {
  const polys = polygones(geo);
  let n = 0;
  for (let i = 0; i < pas; i++) {
    for (let j = 0; j < pas; j++) {
      const x = r.x0 + ((r.x1 - r.x0) * (i + 0.5)) / pas;
      const y = r.y0 + ((r.y1 - r.y0) * (j + 0.5)) / pas;
      if (polys.some((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1 && dans(x, y, p.pts))) n++;
    }
  }
  return n / (pas * pas);
}

// Rectangle (w × h) dans le coin de la vue qui recouvre le moins de terres et de repères (centres des pays, capitales) ; en cas d'égalité,
// l'ordre est : haut gauche, haut droit, bas gauche, bas droit.
export function choisirCoin(geo, vue, w, h, points = [], marge = 8) {
  const coins = [[vue.x + marge, vue.y + marge], [vue.x + vue.w - w - marge, vue.y + marge], [vue.x + marge, vue.y + vue.h - h - marge], [vue.x + vue.w - w - marge, vue.y + vue.h - h - marge]];
  let meilleur = null;
  for (const [x, y] of coins) {
    const r = { x0: x, y0: y, x1: x + w, y1: y + h };
    const cout = fractionTerre(geo, r) * 100 + points.filter((p) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1).length * 10;
    if (!meilleur || cout < meilleur.cout) meilleur = { r, cout };
  }
  return meilleur.r;
}

// ---------- mini-carte du monde ----------

const BORD = 6; // marge du cadre, en unités de la mini-carte

// Hauteur d'une mini-carte de largeur w (cadre compris).
export const hauteurMini = (mini, w) => {
  const [, , mw, mh] = mini.viewBox.split(' ').map(Number);
  return ((mh + 2 * BORD) * w) / (mw + 2 * BORD);
};

// Planisphère minuscule dans un cadre de largeur w posé en (x, y) ; le continent `code` est en bleu (un cercle le repère s'il est minuscule).
export function miniMonde(mini, code, { x, y, w }) {
  const [, , mw, mh] = mini.viewBox.split(' ').map(Number);
  const k = w / (mw + 2 * BORD);
  const g = svg('g', { class: 'mini-monde', 'pointer-events': 'none', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(4)})` });
  g.append(svg('rect', { class: 'mini-cadre', width: mw + 2 * BORD, height: mh + 2 * BORD, rx: 5 }));
  const monde = svg('g', { transform: `translate(${BORD} ${BORD})` });
  if (mini.autres) monde.append(svg('path', { d: mini.autres, class: 'mini-terre' }));
  for (const [c, f] of Object.entries(mini.continents)) if (c !== code) monde.append(svg('path', { d: f.d, class: 'mini-terre' }));
  const cible = mini.continents[code];
  monde.append(svg('path', { d: cible.d, class: 'mini-cible' }));
  if (cible.repere) monde.append(svg('circle', { class: 'mini-repere', cx: cible.repere[0], cy: cible.repere[1], r: 9 }));
  g.append(monde);
  return g;
}

// ---------- noms des pays et capitales ----------

// Emplacements dans la marge de mer autour de la carte (la vue est plus grande que le fichier du continent), collés à la carte, du plus
// proche de l'ancre au plus lointain ; l'étiquette y est reliée à son pays par un trait.
function candidatsMarge(ancre, w, h, vue, W, H) {
  const bords = [];
  if (-vue.x > w + 14) bords.push({ x0: vue.x + 6, x1: -4, y0: vue.y + 4, y1: vue.y + vue.h - 4, cote: 'g' });
  if (vue.x + vue.w - W > w + 14) bords.push({ x0: W + 4, x1: vue.x + vue.w - 6, y0: vue.y + 4, y1: vue.y + vue.h - 4, cote: 'd' });
  if (-vue.y > h + 10) bords.push({ x0: vue.x + 4, x1: vue.x + vue.w - 4, y0: vue.y + 6, y1: -4, cote: 'h' });
  if (vue.y + vue.h - H > h + 10) bords.push({ x0: vue.x + 4, x1: vue.x + vue.w - 4, y0: H + 4, y1: vue.y + vue.h - 6, cote: 'b' });
  const liste = [];
  for (const b of bords) {
    if (b.cote === 'g' || b.cote === 'd') {
      const cx = b.cote === 'g' ? b.x1 - w / 2 : b.x0 + w / 2;
      for (let cy = b.y0 + h / 2; cy <= b.y1 - h / 2; cy += h * 1.05) liste.push({ cx, cy, repli: true });
    } else {
      const cy = b.cote === 'h' ? b.y1 - h / 2 : b.y0 + h / 2;
      for (let cx = b.x0 + w / 2; cx <= b.x1 - w / 2; cx += w * 0.55) liste.push({ cx, cy, repli: true });
    }
  }
  return liste.filter((c) => Math.hypot(c.cx - ancre.x, c.cy - ancre.y) <= PX.longueurTrait)
    .sort((a, b) => Math.hypot(a.cx - ancre.x, a.cy - ancre.y) - Math.hypot(b.cx - ancre.x, b.cy - ancre.y));
}

// Calcule les emplacements des étiquettes pour un nom de pays de `taille` unités (la capitale : PX.capitale fois). Chaque pays a UNE étiquette
// de deux lignes (le nom en blanc, la capitale en bleu dessous) posée sur le pays, un pin marquant l'emplacement de la capitale. Un pays trop
// petit pour son nom (pastille) a son étiquette à côté de la pastille, sans pin. Un pays dont la capitale porte son nom n'a qu'une ligne.
// pays : [{ id, nom, capitale, petit, x, y }] (x, y : la capitale) ; geo : fichier du continent ; bornes : rectangle de la vue ;
// evite : rectangles à laisser libres (mini-carte) ; vue : sert à trouver la marge de mer.
export function planifier(geo, pays, { taille, evite = [], bornes, vue = null }) {
  const tc = taille * PX.capitale;
  const hPin = tc * 1.5;
  const rayon = geo.rayon;
  const [, , W, H] = geo.viewBox.split(' ').map(Number);
  const obstacles = [...evite];
  const items = [];
  const pins = [];
  for (const p of pays) {
    const t = geo.pays[p.id];
    const deuxLignes = p.capitale !== p.nom;
    const l1 = taille * 1.2;
    const l2 = deuxLignes ? tc * 1.2 : 0;
    const w = Math.max(largeur(p.nom, taille, true), deuxLignes ? largeur(p.capitale, tc) : 0) + taille * 0.4;
    const h = l1 + l2 + taille * 0.1;
    const ancre = { x: t.c[0], y: t.c[1] };
    let candidats;
    if (p.petit) {
      const r = { x0: t.c[0] - rayon, y0: t.c[1] - rayon, x1: t.c[0] + rayon, y1: t.c[1] + rayon };
      obstacles.push(r);
      candidats = candidatsAutour(r, w, h, taille * 0.12);
      ancre.rect = r;
      ancre.seuil = taille * 1.1;
    } else {
      candidats = candidatsCentre(t.c[0], t.c[1], taille * 1.1);
      ancre.seuil = Math.max(taille * 1.4, h * 0.8);
      const r = rectPin(p.x, p.y, hPin);
      obstacles.push(r);
      pins.push({ id: p.id, x: p.x, y: p.y, h: hPin });
    }
    items.push({ id: p.id, w, h, l1, l2, nom: p.nom, capitale: deuxLignes ? p.capitale : '', petit: !!p.petit, candidats, ancre,
      candidatsRepli: vue ? candidatsMarge(ancre, w, h, vue, W, H) : [] });
  }
  const places = placerRecuit(items, { obstacles, bornes, penaliteRepli: PX.penaliteRepli });
  const collisions = items.filter((it) => places.get(it.id).cout > 0).map((it) => it.id);
  const renvois = items.filter((it) => places.get(it.id).repli).length;
  return { items, places, pins, collisions, renvois, taille, tc };
}


function dessiner(racine, plan) {
  const g = svg('g', { class: 'revision', 'pointer-events': 'none' });
  for (const p of plan.pins) {
    const pin = svg('g', { class: 'pin', transform: `translate(${p.x} ${p.y}) scale(${p.h.toFixed(2)})`, 'data-id': p.id });
    pin.append(svg('path', { d: GOUTTE }), svg('circle', { class: 'trou', cx: 0, cy: -0.7, r: 0.15 }));
    g.append(pin);
  }
  // Une étiquette repoussée loin de son pays (zone dense, marge de mer) y reste reliée par un trait fin, terminé par un point.
  for (const it of plan.items) {
    const { rect } = plan.places.get(it.id);
    const a = it.ancre;
    if (distancePointRect(a.x, a.y, rect) <= a.seuil) continue;
    const nx = Math.min(Math.max(a.x, rect.x0), rect.x1);
    const ny = Math.min(Math.max(a.y, rect.y0), rect.y1);
    g.append(svg('line', { class: 'repere', x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: nx.toFixed(1), y2: ny.toFixed(1), 'stroke-width': (plan.taille * 0.07).toFixed(2) }));
    if (!it.petit) g.append(svg('circle', { class: 'repere-pt', cx: a.x.toFixed(1), cy: a.y.toFixed(1), r: (plan.taille * 0.14).toFixed(2) }));
  }
  for (const it of plan.items) {
    const c = plan.places.get(it.id);
    const haut = c.cy - it.h / 2;
    const ligne = (texte, y, classe, corps) => {
      const t = svg('text', { x: c.cx.toFixed(1), y: y.toFixed(1), class: classe, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': corps.toFixed(1), 'data-id': it.id });
      t.textContent = texte;
      g.append(t);
    };
    ligne(it.nom, haut + it.l1 / 2 + plan.taille * 0.05, 'etiq', plan.taille);
    if (it.capitale) ligne(it.capitale, haut + it.l1 + it.l2 / 2 + plan.taille * 0.05, 'etiq sous', plan.tc);
  }
  racine.append(g);
}

// Pose les noms et les capitales sur la carte (élément <svg>) : le plus grand corps de texte sans aucun recouvrement, entre PX.debut et
// PX.fin pixels (en reportant au plus PX.renvois étiquettes dans la marge de mer, avec un trait vers leur pays) ; à défaut, le corps qui en laisse le moins.
// echelle : pixels écran par unité du viewBox. Renvoie { px, renvois, collisions: [ids] }.
export function poserRevisionPays(racine, geo, pays, { vue, echelle, evite = [] }) {
  const bornes = { x0: vue.x, y0: vue.y, x1: vue.x + vue.w, y1: vue.y + vue.h };
  let meilleur = null;
  for (let px = PX.debut; px >= PX.fin - 1e-9; px -= PX.pas) {
    const plan = planifier(geo, pays, { taille: px / echelle, evite, bornes, vue });
    plan.px = px;
    if (!meilleur || plan.collisions.length < meilleur.collisions.length) meilleur = plan;
    if (!plan.collisions.length && plan.renvois <= PX.renvois) { meilleur = plan; break; }
  }
  dessiner(racine, meilleur);
  return { px: meilleur.px, renvois: meilleur.renvois, collisions: meilleur.collisions };
}
