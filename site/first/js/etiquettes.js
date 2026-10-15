// Placement d'étiquettes sans chevauchement sur une carte. Calcul pur (aucun accès au DOM), testé par tests/first.test.js.
// Un rectangle est { x0, y0, x1, y1 } dans les unités du viewBox. Chaque étiquette propose des positions candidates, par ordre
// de préférence ; on retient la première qui ne touche ni un obstacle (pastille, pin, légende) ni une étiquette déjà placée,
// à défaut celle qui chevauche le moins.

// Largeur approchée d'un texte (la police n'est pas mesurable avant l'affichage) : un peu large, pour garder de l'air.
export const largeur = (texte, taille, gras = false) => texte.length * taille * (gras ? 0.6 : 0.54);

export const rectCentre = (cx, cy, w, h) => ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 });

export function aireCommune(a, b, marge = 0) {
  const w = Math.min(a.x1, b.x1 + marge) - Math.max(a.x0, b.x0 - marge);
  const h = Math.min(a.y1, b.y1 + marge) - Math.max(a.y0, b.y0 - marge);
  return w > 0 && h > 0 ? w * h : 0;
}

export const chevauche = (a, b, marge = 0) => aireCommune(a, b, marge) > 0;

// Centres candidats d'une étiquette (w × h) autour d'un rectangle (pin ou pastille) : droite, gauche, dessus, dessous, puis les
// diagonales, puis des couronnes de plus en plus éloignées (zones denses).
export function candidatsAutour(rect, w, h, ecart) {
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const dx = (rect.x1 - rect.x0) / 2 + w / 2;
  const dy = (rect.y1 - rect.y0) / 2 + h / 2;
  const liste = [];
  for (const k of [1, 2.6, 4.8, 7.5, 11, 16, 24, 34, 48, 64]) {
    const e = ecart * k;
    liste.push(
      { cx: cx + dx + e, cy },
      { cx: cx - dx - e, cy },
      { cx, cy: cy - dy - e },
      { cx, cy: cy + dy + e },
      { cx: cx + dx * 0.75 + e, cy: cy - dy * 0.9 - e },
      { cx: cx - dx * 0.75 - e, cy: cy - dy * 0.9 - e },
      { cx: cx + dx * 0.75 + e, cy: cy + dy * 0.9 + e },
      { cx: cx - dx * 0.75 - e, cy: cy + dy * 0.9 + e },
    );
  }
  return liste;
}

// Centres candidats d'une étiquette de zone : d'abord le centre de la zone, puis des décalages croissants.
export function candidatsCentre(cx, cy, pas) {
  const liste = [{ cx, cy }];
  for (const k of [1, 2, 3, 4]) {
    liste.push({ cx, cy: cy + pas * k }, { cx, cy: cy - pas * k }, { cx: cx + pas * 2 * k, cy }, { cx: cx - pas * 2 * k, cy },
      { cx: cx + pas * 2 * k, cy: cy + pas * k }, { cx: cx - pas * 2 * k, cy: cy + pas * k },
      { cx: cx + pas * 2 * k, cy: cy - pas * k }, { cx: cx - pas * 2 * k, cy: cy - pas * k });
  }
  return liste;
}

// items : [{ id, w, h, candidats: [{ cx, cy }] }], dans l'ordre de priorité. Renvoie Map id -> { cx, cy, rect, cout } (cout 0 : aucun recouvrement).
// obstacles : rectangles à éviter. bornes : rectangle dans lequel les étiquettes doivent rester (facultatif).
// reparations : nombre de passes de réparation après le placement glouton : une étiquette qui en recouvre une autre est replacée,
// les autres restant en place, à un endroit qui recouvre moins. Pendant ces passes, une étiquette peut aussi prendre l'une des positions
// de repli de son item (candidatsRepli, par exemple dans la marge de mer), au plus `repliMax` fois en tout : le résultat porte alors `repli: true`.
export function placer(items, { obstacles = [], bornes = null, marge = 1, reparations = 0, repliMax = 0 } = {}) {
  const coutDe = (it, rect, autres) => {
    let cout = 0;
    for (const o of obstacles) cout += aireCommune(rect, o, marge);
    for (const o of autres) cout += aireCommune(rect, o, marge);
    if (bornes) cout += 4 * (it.w * it.h - aireCommune(rect, bornes));
    return cout;
  };
  const meilleurePlace = (it, autres, repli = false) => {
    let meilleur = null;
    for (const c of repli && it.candidatsRepli ? [...it.candidats, ...it.candidatsRepli] : it.candidats) {
      const rect = rectCentre(c.cx, c.cy, it.w, it.h);
      const cout = coutDe(it, rect, autres);
      if (!meilleur || cout < meilleur.cout) meilleur = { ...c, rect, cout };
      if (cout === 0) break;
    }
    return meilleur;
  };
  const resultat = new Map();
  const places = [];
  for (const it of items) {
    const meilleur = meilleurePlace(it, places);
    resultat.set(it.id, meilleur);
    places.push(meilleur.rect);
  }
  for (let passe = 0; passe < reparations; passe++) {
    let change = false;
    for (const it of items) {
      if (resultat.get(it.id).cout === 0) continue;
      const autres = items.filter((x) => x !== it).map((x) => resultat.get(x.id).rect);
      const nbRepli = [...resultat.values()].filter((r) => r.repli).length;
      const nouveau = meilleurePlace(it, autres, nbRepli < repliMax || !!resultat.get(it.id).repli);
      if (nouveau.cout < resultat.get(it.id).cout) { resultat.set(it.id, nouveau); change = true; }
    }
    // les étiquettes ont bougé : on recalcule le recouvrement de chacune
    for (const it of items) resultat.get(it.id).cout = coutDe(it, resultat.get(it.id).rect, items.filter((x) => x !== it).map((x) => resultat.get(x.id).rect));
    if (!change) break;
  }
  return resultat;
}

// Générateur pseudo-aléatoire à graine (résultats reproductibles).
function alea(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Plus petite distance entre un point et un rectangle (0 si le point est dedans).
export const distancePointRect = (x, y, r) => Math.hypot(Math.min(Math.max(x, r.x0), r.x1) - x, Math.min(Math.max(y, r.y0), r.y1) - y);

// Placement par recuit simulé : part du placement glouton puis déplace des étiquettes au hasard parmi leurs positions candidates
// (item.candidats, puis item.candidatsRepli, de moins en moins volontiers), en acceptant parfois une dégradation qui diminue avec la
// « température ». Le coût est le recouvrement (avec une pénalité fixe par recouvrement, pour viser zéro), plus l'éloignement de
// l'étiquette à son ancre (item.ancre = { x, y }) et une pénalité par position de repli. Renvoie la même chose que placer
// (Map id -> { cx, cy, rect, cout, repli? }) ; cout = recouvrement seul, 0 si l'étiquette est libre.
export function placerRecuit(items, { obstacles = [], bornes = null, marge = 1, iterations = 16000, penaliteRepli = 300, poidsDistance = 0.4, graine = 7 } = {}) {
  const n = items.length;
  const PEN = 1500; // un recouvrement, même petit, coûte plus cher que toute distance ou position de repli
  const depart = placer(items, { obstacles, bornes, marge });
  const cx = items.map((it) => depart.get(it.id).cx);
  const cy = items.map((it) => depart.get(it.id).cy);
  const repli = items.map((it) => !!depart.get(it.id).repli);
  const rects = items.map((it, i) => rectCentre(cx[i], cy[i], it.w, it.h));
  const listes = items.map((it) => [...it.candidats, ...(it.candidatsRepli ?? [])]);
  const nLocal = items.map((it) => it.candidats.length);

  const recouvre = (i, rect) => {
    let c = 0;
    for (const o of obstacles) { const a = aireCommune(rect, o, marge); if (a > 0) c += a + PEN; }
    for (let j = 0; j < n; j++) { if (j !== i) { const a = aireCommune(rect, rects[j], marge); if (a > 0) c += a + PEN; } }
    if (bornes) { const dehors = items[i].w * items[i].h - aireCommune(rect, bornes); if (dehors > 0.01) c += 4 * dehors + PEN; }
    return c;
  };
  const cout = (i, rect, estRepli) => recouvre(i, rect) + poidsDistance * distancePointRect(items[i].ancre.x, items[i].ancre.y, rect) + (estRepli ? penaliteRepli : 0);

  let total = 0;
  for (let i = 0; i < n; i++) total += cout(i, rects[i], repli[i]);
  let meilleurTotal = total;
  let meilleur = { cx: [...cx], cy: [...cy], repli: [...repli] };
  const rnd = alea(graine);
  let enCollision = [];
  const T0 = 160;
  for (let k = 0; k < iterations; k++) {
    if (k % 400 === 0) enCollision = items.map((_, i) => i).filter((i) => recouvre(i, rects[i]) > 0);
    const i = enCollision.length && rnd() < 0.6 ? enCollision[Math.floor(rnd() * enCollision.length)] : Math.floor(rnd() * n);
    const liste = listes[i];
    if (!liste.length) continue;
    const idx = rnd() < 0.5 ? Math.floor(rnd() * rnd() * liste.length) : Math.floor(rnd() * liste.length);
    const c = liste[idx];
    const estRepli = idx >= nLocal[i];
    const rect = rectCentre(c.cx, c.cy, items[i].w, items[i].h);
    const delta = cout(i, rect, estRepli) - cout(i, rects[i], repli[i]);
    const T = T0 * (1 - k / iterations) ** 2 + 0.01;
    if (delta <= 0 || rnd() < Math.exp(-delta / T)) {
      cx[i] = c.cx; cy[i] = c.cy; repli[i] = estRepli; rects[i] = rect;
      total += delta;
      if (total < meilleurTotal - 1e-9) { meilleurTotal = total; meilleur = { cx: [...cx], cy: [...cy], repli: [...repli] }; }
    }
  }
  // résultat : le meilleur état rencontré
  for (let i = 0; i < n; i++) { cx[i] = meilleur.cx[i]; cy[i] = meilleur.cy[i]; repli[i] = meilleur.repli[i]; rects[i] = rectCentre(cx[i], cy[i], items[i].w, items[i].h); }
  const resultat = new Map();
  items.forEach((it, i) => resultat.set(it.id, { cx: cx[i], cy: cy[i], rect: rects[i], cout: recouvre(i, rects[i]), ...(repli[i] ? { repli: true } : {}) }));
  return resultat;
}
