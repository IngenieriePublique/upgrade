// Candidature : page d'accueil du sprint (avant mi-novembre) et navigation entre ses écrans.
import { h, fill } from '../ui.js';
import { loadData } from '../data.js';
import { etapes, prochaineEtape, joursRestants, sprintActif } from '../candidature.js';

const ONGLETS = [
  { id: 'accueil', label: 'Sprint', href: '#/sprint' },
  { id: 'radar', label: 'Radar', href: '#/sprint/radar' },
  { id: 'recit', label: 'Pitch et STAR', href: '#/sprint/recit' },
  { id: 'oral', label: 'Oral', href: '#/sprint/oral' },
  { id: 'reseau', label: 'Réseau', href: '#/sprint/reseau' },
  { id: 'choix', label: 'Concours ou contrat', href: '#/sprint/choix' },
];

export function sousNav(actif) {
  return h('nav', { class: 'onglets', 'aria-label': 'Sprint candidature' },
    ONGLETS.map((o) => h('a', { href: o.href, class: o.id === actif ? 'actif' : '', 'aria-current': o.id === actif ? 'page' : null }, o.label)));
}

const CARTES = [
  { id: 'radar', titre: 'Radar employeurs', texte: 'Une trentaine d\'employeurs sourcés, un statut à toi pour chacun, et les portails où trouver les offres.' },
  { id: 'recit', titre: 'Pitch et histoires STAR', texte: 'Trois pitchs (30 s, 90 s, 3 min) et huit histoires tirées de tes stages : la matière de tout entretien.' },
  { id: 'oral', titre: 'Entraînement à l\'oral', texte: '82 questions, un enregistreur qui reste dans ton navigateur et une grille d\'auto-évaluation.' },
  { id: 'reseau', titre: 'Réseau', texte: 'Entretiens d\'information : message modèle, questions, suivi. Un contact humain par semaine.' },
  { id: 'choix', titre: 'Concours ou contractuel', texte: 'Ce que disent les sources, une grille de comparaison et ta décision provisoire.' },
];

export async function render({ view, store }) {
  const [gabarits, notes] = await Promise.all([loadData('oral/gabarits.json'), store.notes()]);
  const liste = etapes(notes, gabarits);
  const faites = liste.filter((e) => e.fait).length;
  const suivante = prochaineEtape(liste);
  const jours = joursRestants();

  fill(view,
    h('h1', null, 'Sprint candidature'),
    sousNav('accueil'),
    h('p', { class: 'chapo' }, sprintActif()
      ? `Il reste ${jours} jour${jours > 1 ? 's' : ''} avant le 15 novembre : les stages de mars se publient de novembre à février, mieux vaut être prêt avant.`
      : 'Le 15 novembre est passé : le sprint est fini, mais le radar, le récit et le réseau restent utiles toute l\'année.'),
    suivante
      ? h('div', { class: 'carte prochaine' },
        h('p', { class: 'etiquette' }, 'Prochaine étape'),
        h('h2', null, suivante.titre),
        h('a', { class: 'bouton principal', href: suivante.lien }, 'Y aller'))
      : h('div', { class: 'carte prochaine' }, h('h2', null, 'Les six étapes sont faites.'),
        h('p', null, 'Continue l\'entraînement oral et le contact hebdomadaire.')),
    h('h2', { class: 'rubrique' }, `Progression : ${faites} sur ${liste.length}`),
    h('ol', { class: 'etapes' }, liste.map((e) => h('li', { class: e.fait ? 'fait' : '' },
      h('span', { class: 'case', 'aria-hidden': 'true' }, e.fait ? '✓' : ''),
      h('a', { href: e.lien }, e.titre),
      h('span', { class: 'petit' }, ` · ${e.detail}`)))),
    h('div', { class: 'grille' }, CARTES.map((c) => h('section', { class: 'carte' },
      h('h2', null, h('a', { href: `#/sprint/${c.id}` }, c.titre)),
      h('p', null, c.texte)))),
    h('p', { class: 'petit' }, 'Tout ce que tu écris ici (pitch, histoires, notes sur les employeurs, contacts) reste dans ton navigateur et dans tes sauvegardes, jamais dans le dépôt public.'));
}
