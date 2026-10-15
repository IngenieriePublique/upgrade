// Drapeaux des pays du jeu (images de Wikimedia Commons, site/data/drapeaux/<code ISO en minuscules>.png).
// Purement décoratifs : un drapeau suit le nom d'un pays dans les consignes, les réponses et les explications, mais n'est jamais demandé.
import { h } from '../../js/ui.js';

const DOSSIER = new URL('../../data/drapeaux/', import.meta.url);

export const adresseDrapeau = (code) => new URL(`${code.toLowerCase()}.png`, DOSSIER).href;

// <img> décoratif ; une image qui ne charge pas disparaît sans laisser de trou.
export function drapeau(code) {
  return h('img', { class: 'drapeau', src: adresseDrapeau(code), alt: '', 'aria-hidden': 'true', decoding: 'async', onerror: (e) => e.target.remove() });
}

// Nœuds d'un texte où le drapeau du pays `code` suit la première mention de `nom` (le texte seul si le nom n'y figure pas).
// Une espace insécable relie le nom et le drapeau, pour qu'ils ne se séparent pas en fin de ligne.
export function texteAvecDrapeau(texte, nom, code) {
  const i = code && nom ? texte.indexOf(nom) : -1;
  if (i < 0) return [texte];
  const fin = i + nom.length;
  return [texte.slice(0, fin), '\u00a0', drapeau(code), texte.slice(fin)].filter((x) => x !== '');
}
