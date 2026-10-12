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
};

export function trace(nom) {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', TRACES[nom]);
  return p;
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
