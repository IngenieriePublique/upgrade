// Icônes en tracés simples (grille 24 × 24, trait = currentColor). `icone(nom)` renvoie un élément SVG autonome.
const NS = 'http://www.w3.org/2000/svg';

const TRACES = {
  territoires: 'M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Z M9 4v13.5 M15 6.5V20',
  cartes: 'M3 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z M8 6V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3',
  brief: 'M5 4h11a1 1 0 0 1 1 1v14H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Z M17 8h3v9a2 2 0 0 1-2 2 M7.5 8h6 M7.5 11.5h6 M7.5 15h4',
  lecture: 'M12 6.5C10.5 5 8 4.5 4 4.5v13c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-13c-4 0-6.5.5-8 2Z M12 6.5v13',
  retour: 'M15 5 8 12l7 7',
  externe: 'M14 4h6v6 M20 4 11 13 M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4',
  suivant: 'M9 5l7 7-7 7',
  precedent: 'M15 5 8 12l7 7',
  coche: 'M5 12.5l4.5 4.5L19 7.5',
  bas: 'M6 9.5l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  croix: 'M6 6l12 12M18 6 6 18',
  jouer: 'M7 4.5v15l12-7.5Z',
  pause: 'M8 5v14M16 5v14',
  stop: 'M6.5 6.5h11v11h-11Z',
  tip: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3Z',
  liste: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
};

export function trace(nom) {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', TRACES[nom]);
  return p;
}

// Hexagone à pointe en haut (même orientation que les hexagones de l'accueil), pour les nids d'abeille.
const hexagone = (cx, cy, r) => 'M' + Array.from({ length: 6 }, (_, k) => {
  const a = (Math.PI / 180) * (60 * k - 30);
  return `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
}).join('L') + 'Z';

const nid = () => {
  const r = 6.4;
  const w = Math.sqrt(3) * r;
  const centres = [[24, 24], [24 - w, 24], [24 + w, 24], [24 - w / 2, 24 - 1.5 * r], [24 + w / 2, 24 - 1.5 * r], [24 - w / 2, 24 + 1.5 * r], [24 + w / 2, 24 + 1.5 * r]];
  return centres.map(([x, y], i) => `<path d="${hexagone(x, y, r - 0.6)}"${i === 0 ? ' class="plein"' : ' class="fin"'}/>`).join('');
};

// Icônes détaillées (grille 48 × 48) de l'accueil et du choix de format : traits pleins pour la forme, traits
// atténués (« fin ») pour le détail, « plein » = remplissage de la couleur de la carte, « pt » = point plein.
const DETAILLEES = {
  territoires: `<path d="M6 12 18 7l12 5 12-5v29l-12 5-12-5-12 5Z"/><path class="fin" d="M18 7v29M30 12v29"/>
    <path class="fin" d="M9.5 20.5 14.5 18M9.5 25.5l5-2.5M21 15.5l5 2.5M21 21.5l5 2.5M33 20l5-2M33 25.5l5-2"/>
    <path class="fin dash" d="M9 35c3.5-5 7-1.5 9.5-4.5s5-3 7.5 0"/>
    <path class="plein" d="M35 29.5c-3.7-4.1-5.6-6.7-5.6-9.5a5.6 5.6 0 0 1 11.2 0c0 2.8-1.9 5.4-5.6 9.5Z"/><circle class="pt" cx="35" cy="20" r="1.9"/>`,
  cartes: `<rect class="fin" x="12" y="9" width="26" height="31" rx="3.5" transform="rotate(-11 25 24.5) translate(-4 0)"/>
    <rect class="fin" x="12" y="9" width="26" height="31" rx="3.5" transform="rotate(9 25 24.5) translate(4 0)"/>
    <rect class="plein" x="12" y="9" width="26" height="31" rx="3.5"/>
    <path d="M21.2 20.6a3.8 3.8 0 1 1 5.9 3.1c-1.5 1-2.1 1.7-2.1 3.3"/><circle class="pt" cx="25" cy="31.6" r="1.1"/>
    <path class="fin" d="M17 15.5h6M28 36h5"/>`,
  brief: `<path class="plein" d="M9 10h28v27a3 3 0 0 0 3 3H12a3 3 0 0 1-3-3Z"/><path d="M37 18h4v19a3 3 0 0 1-3 3"/>
    <rect x="13" y="14" width="20" height="5" rx="1"/>
    <rect class="fin" x="13" y="23" width="9" height="8" rx="1"/><path class="fin" d="m13 31 3.2-3.2 2.4 2.4 1.5-1.5 1.9 2.3"/>
    <path class="fin" d="M25 24h8M25 27.5h8M25 31h8M13 35h20"/>`,
  lecture: `<path class="plein" d="M24 12c-3.6-2.8-8.6-3.6-15-3.1v26.2c6.4-.5 11.4.3 15 3.2 3.6-2.9 8.6-3.7 15-3.2V8.9c-6.4-.5-11.4.3-15 3.1Z"/>
    <path d="M24 12v26.3"/><path class="fin" d="M13 16.5c2.8 0 5.2.5 7.5 1.6M13 21.2c2.8 0 5.2.5 7.5 1.6M13 25.9c2.8 0 5.2.5 7.5 1.6M13 30.6c2.8 0 5.2.5 7.5 1.6M35 21.2c-2.8 0-5.2.5-7.5 1.6M35 25.9c-2.8 0-5.2.5-7.5 1.6M35 30.6c-2.8 0-5.2.5-7.5 1.6"/>
    <path d="M31.5 9.4v9.6l2.7-2.2 2.7 2.2V9.2"/><path class="fin" d="M10 42h28"/>`,
  calcul: `<rect class="plein" x="9" y="6" width="30" height="36" rx="4"/><rect class="fin" x="13" y="10" width="22" height="9" rx="1.5"/>
    <path d="M17 26.5h6M20 23.5v6M28.5 26.5h6"/><path d="M17.5 33.5l5 5M22.5 33.5l-5 5"/><path d="M28.5 36h6"/><circle class="pt" cx="31.5" cy="33" r="1.1"/><circle class="pt" cx="31.5" cy="39" r="1.1"/>`,
  methode: `<circle class="plein" cx="24" cy="27" r="15"/><path d="M20 6h8M24 6v6M36 13l3-3"/>
    <path d="M24 27V18.5M24 27l6 3.5"/><circle class="pt" cx="24" cy="27" r="1.9"/>
    <path class="fin" d="M24 15.5v2M24 36.5v2M12.5 27h2M33.5 27h2"/><path class="fin dash" d="M31.2 17.8a11.5 11.5 0 0 1 3.6 7.2"/>`,
  regions: `<path class="plein" d="M24 6.5 33 8l8 4.5 1.5 8.5-3 8.5L31.5 42H19l-9.5-6.5L6.5 25l3-9.5L16 9.5Z"/>
    <path class="fin" d="M24 6.5 21.5 20 6.5 25M21.5 20l11-2.5L41 21M21.5 20 25 33.5 31.5 42M25 33.5l-12.5 2M25 33.5l14-4.5"/>`,
  departements: nid(),
  villes: `<path class="plein" d="M8 41V23h8v18M16 41V11.5h10V41M26 41V26h7v15M33 41V18h8v23"/><path d="M5 41h38"/>
    <path class="fin" d="M19 16h4M19 21h4M19 26h4M19 31h4M11 28h2M11 33h2M29 31h1.5M29 36h1.5M36 24h2M36 29h2M36 34h2"/>`,
  pays: `<circle class="plein" cx="24" cy="24" r="17"/><path class="fin" d="M7 24h34M24 7c-8 8.5-8 25.5 0 34M24 7c8 8.5 8 25.5 0 34M10.5 14.5c9 3.5 18 3.5 27 0M10.5 33.5c9-3.5 18-3.5 27 0"/>
    <path d="M17 16.5c2.5-1 4.5 0 5 2s-2 3-1.5 5.5 3 2 3 4.5-3.5 4.5-4.5 2.5-3-3.5-3.5-6.5.5-6.5 1.5-8Z"/><circle class="pt" cx="33" cy="20" r="1.6"/>`,
};

// Éléments SVG d'une icône détaillée, à placer dans un <svg viewBox="0 0 48 48"> ; contenu statique, défini ci-dessus.
export function detaillee(nom) {
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', `detail detail-${nom}`);
  g.innerHTML = DETAILLEES[nom];
  return g;
}

export function iconeDetaillee(nom, { taille = 48 } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('width', taille);
  svg.setAttribute('height', taille);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icone-detail');
  svg.append(detaillee(nom));
  return svg;
}

export function icone(nom, { taille = 20 } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', taille);
  svg.setAttribute('height', taille);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icone');
  svg.append(trace(nom));
  return svg;
}
