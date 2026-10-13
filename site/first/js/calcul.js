// Calcul mental : une question à la fois, sans fin. On tape la réponse et on valide avec Entrée ; une bonne réponse enchaîne
// aussitôt, une mauvaise (ou Entrée sur un champ vide) montre la solution. L'ampoule donne une astuce de méthode au survol.
// Le niveau se choisit en haut et est retenu d'une visite à l'autre.
import { h } from '../../js/ui.js';
import { cadre, filtres } from './cadre.js';
import { icone } from './icones.js';
import { lire, ecrire } from './lus.js';
import { NIVEAUX, question, lireReponse, nombre } from './calcul-mental.js';

const CLE_NIVEAU = 'first-calcul-niveau';

export async function render({ view, store, params }) {
  let niveau = Number(params.n);
  if (!NIVEAUX[niveau]) niveau = Number(await lire(store, CLE_NIVEAU, 1));
  if (!NIVEAUX[niveau]) niveau = 1;
  ecrire(store, CLE_NIVEAU, niveau);

  let courante = null;
  let revelee = false;
  let justes = 0;
  let total = 0;
  let relance = null;

  const elQuestion = h('p', { class: 'calcul-question' });
  const champ = h('input', { class: 'calcul-reponse', type: 'text', inputmode: 'numeric', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    enterkeyhint: 'done', 'aria-label': 'Réponse' });
  const elSolution = h('p', { class: 'calcul-solution', 'aria-live': 'polite' });
  const suivant = h('button', { type: 'button', class: 'secondaire', hidden: true, onclick: () => suivante() }, 'Suivant');
  const bulle = h('div', { class: 'tip-bulle', id: 'calcul-astuce', role: 'tooltip' });
  const compteur = h('span', { class: 'compteur', title: 'Bonnes réponses', 'aria-label': 'Bonnes réponses' }, '0 / 0');

  function suivante() {
    courante = question(niveau, Math.random, courante);
    revelee = false;
    elQuestion.textContent = courante.texte;
    bulle.textContent = courante.astuce;
    champ.value = '';
    champ.readOnly = false;
    champ.classList.remove('juste', 'faux');
    elSolution.textContent = '';
    suivant.hidden = true;
    requestAnimationFrame(() => champ.focus({ preventScroll: true })); // la page n'est rattachée qu'après le rendu
  }

  const majCompteur = () => { compteur.textContent = `${justes} / ${total}`; };

  function montrerSolution() {
    revelee = true;
    total++;
    majCompteur();
    champ.readOnly = true;
    champ.classList.add('faux');
    elSolution.textContent = `= ${nombre(courante.reponse)}`;
    suivant.hidden = false;
  }

  function valider() {
    if (revelee) { suivante(); return; }
    if (!champ.value.trim()) { montrerSolution(); return; }
    const r = lireReponse(champ.value);
    if (Number.isNaN(r)) return; // ni nombre ni vide : on laisse corriger
    if (r === courante.reponse) {
      justes++;
      total++;
      majCompteur();
      champ.readOnly = true;
      champ.classList.add('juste');
      relance = setTimeout(suivante, 280);
    } else {
      montrerSolution();
    }
  }

  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (!champ.readOnly || revelee) valider(); }
  });

  const astuce = h('div', { class: 'calcul-tip' },
    h('button', { type: 'button', class: 'tip-bouton', 'aria-label': 'Astuce de calcul', 'aria-describedby': 'calcul-astuce' }, icone('tip', { taille: 20 })),
    bulle);

  view.append(cadre({
    titre: 'Calcul mental',
    nom: 'calcul',
    outils: [filtres('/calcul', 'n', NIVEAUX, String(niveau)), compteur],
    corps: h('div', { class: 'calcul' },
      h('div', { class: 'calcul-zone' }, astuce, elQuestion, champ, elSolution, suivant)),
  }));
  suivante();
  return () => clearTimeout(relance);
}
