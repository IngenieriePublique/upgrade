// Radar employeurs : liste filtrable, fiche détaillée, statut et notes personnelles (jamais dans le dépôt).
import { h, fill, zoneTexte } from '../ui.js';
import { loadData } from '../data.js';
import { STATUTS_RADAR, statutRadar } from '../candidature.js';
import { sousNav } from './sprint.js';

const ECHELONS = { national: 'National', 'régional': 'Régional', local: 'Local' };
const labelStatut = (id) => STATUTS_RADAR.find((s) => s.id === id)?.label ?? id;

export const correspond = (e, f, statut) =>
  (!f.echelon || e.echelon === f.echelon)
  && (!f.priorite || e.priorite === f.priorite)
  && (!f.statut || statut === f.statut)
  && (!f.q || `${e.nom} ${e.sigle} ${e.type} ${e.lieu} ${e.mission}`.toLowerCase().includes(f.q.toLowerCase()));

export async function render({ view, store, params }) {
  const [data, notes] = await Promise.all([loadData('radar/employeurs.json'), store.notes('radar')]);
  const parId = new Map(notes.map((n) => [n.id, n]));
  if (params.id) {
    const e = data.employeurs.find((x) => x.id === params.id);
    if (e) return fiche(view, store, e, parId.get(`radar:${e.id}`));
  }
  liste(view, data, parId);
}

function liste(view, data, parId) {
  const f = { echelon: '', priorite: '', statut: '', q: '' };
  const zone = h('div');

  const select = (nom, options, label) => h('label', { class: 'filtre' }, label,
    h('select', { onchange: (ev) => { f[nom] = ev.target.value; dessiner(); } },
      h('option', { value: '' }, 'Tous'), options.map(([v, l]) => h('option', { value: v }, l))));

  function dessiner() {
    const statutDe = (e) => statutRadar(parId.get(`radar:${e.id}`));
    const vus = data.employeurs.filter((e) => correspond(e, f, statutDe(e)));
    const ordre = { A: 0, B: 1, C: 2 };
    vus.sort((a, b) => ordre[a.priorite] - ordre[b.priorite] || a.nom.localeCompare(b.nom, 'fr'));
    fill(zone,
      h('p', { class: 'petit' }, `${vus.length} employeur${vus.length > 1 ? 's' : ''} sur ${data.employeurs.length}.`),
      h('div', { class: 'grille' }, vus.map((e) => {
        const st = statutDe(e);
        return h('article', { class: `carte emp${st === 'ecarte' ? ' ecarte' : ''}` },
          h('div', { class: 'brief-tete' },
            h('h3', null, h('a', { href: `#/sprint/radar?id=${e.id}` }, e.sigle ? `${e.sigle} · ${e.nom}` : e.nom)),
            h('span', { class: `puce prio-${e.priorite}`, title: 'Priorité (jugement Upgrade, pas un fait)' }, e.priorite)),
          h('p', { class: 'petit' }, [e.type, ECHELONS[e.echelon], e.lieu].filter(Boolean).join(' · ')),
          h('p', null, extrait(e.mission)),
          h('p', { class: 'petit' }, `Statut : ${labelStatut(st)}`));
      })));
  }

  fill(view,
    h('h1', null, 'Radar employeurs'),
    sousNav('radar'),
    h('p', { class: 'chapo' }, 'Chaque fiche reformule des sources citées. Priorité A, B, C = ordre de travail proposé par Upgrade, à ajuster. Le statut et les notes sont à toi.'),
    portails(data.portails),
    h('div', { class: 'filtres' },
      select('echelon', Object.entries(ECHELONS), 'Échelon'),
      select('priorite', [['A', 'A'], ['B', 'B'], ['C', 'C']], 'Priorité'),
      select('statut', STATUTS_RADAR.map((s) => [s.id, s.label]), 'Statut'),
      h('label', { class: 'filtre' }, 'Recherche',
        h('input', { type: 'search', oninput: (ev) => { f.q = ev.target.value; dessiner(); } }))),
    zone);
  dessiner();
}

const extrait = (t, n = 190) => (t.length > n ? `${t.slice(0, t.lastIndexOf(' ', n))}…` : t);

function portails(liste) {
  return h('details', { class: 'carte' },
    h('summary', null, h('strong', null, 'Où trouver les offres'), ` (${liste.length} portails)`),
    h('ul', null, liste.map((p) => h('li', null,
      h('a', { href: p.url, target: '_blank', rel: 'noopener' }, p.titre), ` : ${p.description}`))));
}

function fiche(view, store, e, note) {
  let st = statutRadar(note);
  const sauver = (patch) => {
    note = { ...(note ?? { id: `radar:${e.id}` }), data: { ...(note?.data ?? {}), ...patch } };
    return store.putNote(`radar:${e.id}`, note.data);
  };

  const sources = h('details', { class: 'sources' },
    h('summary', null, `Sources (${e.sources.length})`),
    h('ul', null, e.sources.map((s) => h('li', null, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.titre)))),
    h('p', { class: 'petit' }, `Revu le ${e.revu}${e.perissable ? ' · faits périssables, à recontrôler avant de t\'en servir' : ''}.`));

  fill(view,
    h('p', null, h('a', { class: 'lien', href: '#/sprint/radar' }, '← Tous les employeurs')),
    h('h1', null, e.sigle ? `${e.sigle} : ${e.nom}` : e.nom),
    h('p', { class: 'petit' }, [e.type, ECHELONS[e.echelon], e.lieu, `priorité ${e.priorite}`].filter(Boolean).join(' · ')),
    e.a_verifier ? h('p', { class: 'alerte' }, h('strong', null, 'À vérifier : '), e.a_verifier) : null,
    h('section', { class: 'carte' }, h('h2', null, 'Ce qu\'ils font'), h('p', null, e.mission)),
    h('section', { class: 'carte' }, h('h2', null, 'Pourquoi sur ton radar'), h('p', null, e.pourquoi),
      h('p', { class: 'petit' }, 'La partie « Lecture Upgrade » est un avis de travail, pas un fait sourcé.')),
    h('section', { class: 'carte' }, h('h2', null, 'Candidater'),
      e.voies?.length ? h('p', null, `Voies citées par les sources : ${e.voies.join(', ')}.`) : null,
      h('ul', null, e.candidater.map((c) => h('li', null, h('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.titre)))),
      sources),
    h('section', { class: 'carte' }, h('h2', null, 'Mon suivi (reste dans ton navigateur)'),
      h('label', { class: 'filtre' }, 'Statut',
        h('select', { onchange: async (ev) => { st = ev.target.value; await sauver({ statut: st }); } },
          STATUTS_RADAR.map((s) => h('option', { value: s.id, selected: s.id === st }, s.label)))),
      zoneTexte({ id: 'note-radar', label: 'Mes notes', rows: 5, valeur: note?.data?.notes ?? '',
        aide: 'Ce que tu as lu, la personne à contacter, la date limite, ce que tu dirais en entretien.',
        onSave: (v) => sauver({ notes: v }) }),
      h('p', null, h('a', { class: 'bouton', href: `#/sprint/reseau?radar=${e.id}` }, 'Ajouter un contact pour cet employeur'))));
}
