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
// diagonales, puis une seconde couronne plus éloignée.
export function candidatsAutour(rect, w, h, ecart) {
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const dx = (rect.x1 - rect.x0) / 2 + w / 2;
  const dy = (rect.y1 - rect.y0) / 2 + h / 2;
  const liste = [];
  for (const k of [1, 2.6, 4.8, 7.5]) {
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
  for (const k of [1, 2]) {
    liste.push({ cx, cy: cy + pas * k }, { cx, cy: cy - pas * k }, { cx: cx + pas * 2 * k, cy }, { cx: cx - pas * 2 * k, cy },
      { cx: cx + pas * 2 * k, cy: cy + pas * k }, { cx: cx - pas * 2 * k, cy: cy + pas * k },
      { cx: cx + pas * 2 * k, cy: cy - pas * k }, { cx: cx - pas * 2 * k, cy: cy - pas * k });
  }
  return liste;
}

// items : [{ id, w, h, candidats: [{ cx, cy }] }], dans l'ordre de priorité. Renvoie Map id -> { cx, cy, rect }.
// obstacles : rectangles à éviter. bornes : rectangle dans lequel les étiquettes doivent rester (facultatif).
export function placer(items, { obstacles = [], bornes = null, marge = 1 } = {}) {
  const places = [];
  const resultat = new Map();
  for (const it of items) {
    let meilleur = null;
    let mini = Infinity;
    for (const c of it.candidats) {
      const rect = rectCentre(c.cx, c.cy, it.w, it.h);
      let cout = 0;
      for (const o of obstacles) cout += aireCommune(rect, o, marge);
      for (const o of places) cout += aireCommune(rect, o, marge);
      if (bornes) {
        const dedans = aireCommune(rect, bornes);
        cout += 4 * (it.w * it.h - dedans);
      }
      if (cout < mini) { mini = cout; meilleur = { cx: c.cx, cy: c.cy, rect }; }
      if (cout === 0) break;
    }
    resultat.set(it.id, meilleur);
    places.push(meilleur.rect);
  }
  return resultat;
}
