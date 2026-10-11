// Concours ou contractuel : note de décision (sourcée) et décision provisoire personnelle.
import { h, fill, zoneTexte } from '../ui.js';
import { loadData } from '../data.js';
import { sousNav } from './sprint.js';

function section(s) {
  return h('section', { class: `carte${s.avis ? ' avis' : ''}` },
    h('h2', null, s.titre),
    s.avis ? h('p', { class: 'etiquette' }, 'Avis, pas un fait') : null,
    (s.paragraphes ?? []).map((p) => h('p', null, p)),
    s.puces?.length ? h('ul', null, s.puces.map((p) => h('li', null, p))) : null,
    s.tableau ? h('div', { class: 'defile' }, h('table', null,
      h('thead', null, h('tr', null, s.tableau.entetes.map((e) => h('th', { scope: 'col' }, e)))),
      h('tbody', null, s.tableau.lignes.map((l) => h('tr', null, l.map((c, i) => (i === 0 ? h('th', { scope: 'row' }, c) : h('td', null, c)))))))) : null,
    s.sources?.length ? h('details', { class: 'sources' }, h('summary', null, `Sources (${s.sources.length})`),
      h('ul', null, s.sources.map((x) => h('li', null, h('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.titre))))) : null);
}

export async function render({ view, store }) {
  const [note, decision] = await Promise.all([loadData('radar/note-carriere.json'), store.getNote('decision')]);
  const data = { texte: decision?.data?.texte ?? '', revision: decision?.data?.revision ?? '' };
  const sauver = () => store.putNote('decision', { ...data });

  fill(view,
    h('h1', null, note.titre),
    sousNav('choix'),
    h('p', { class: 'chapo' }, note.resume),
    h('p', { class: 'alerte' }, `Faits périssables (rémunérations, calendriers, règles) : lus le ${note.revu}. Vérifie chaque date sur le site de l'organisateur avant de t'organiser.`),
    note.sections.map(section),
    h('section', { class: 'carte' },
      h('h2', null, 'Ma décision provisoire'),
      zoneTexte({ id: 'decision-texte', label: 'En une ou deux phrases', rows: 3, valeur: data.texte,
        aide: 'Exemple : « Je candidate en contractuel d\'étude pour mars et je prépare l\'attaché territorial en parallèle. » Cette décision n\'engage que toi et se révise.',
        onSave: async (t) => { data.texte = t; await sauver(); } }),
      h('label', { class: 'filtre' }, 'Date de révision',
        h('input', { type: 'date', value: data.revision, onchange: async (e) => { data.revision = e.target.value; await sauver(); } }))),
    h('details', { class: 'sources' }, h('summary', null, 'Toutes les sources de la note'),
      h('ul', null, note.sources.map((x) => h('li', null, h('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.titre))))));
}
