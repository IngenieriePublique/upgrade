// Portfolio : 3 à 5 mini-évaluations publiables sur données ouvertes. Upgrade cadre, l'utilisateur analyse et publie.
// Données personnelles : notes « portfolio:<projet> » { etapes: { id: horodatage }, notes: { id: texte }, url, controles }.
import { h, fill, zoneTexte } from '../ui.js';
import { loadData } from '../data.js';
import { avancementProjet, projetPublie, prochaineEtapeProjet, projetCourant, resumePortfolio, ID_PROJET } from '../atelier.js';
import { sousNav } from './atelier.js';

const NIVEAUX = { 1: 'niveau 1 : accessible', 2: 'niveau 2 : intermédiaire', 3: 'niveau 3 : exigeant' };

async function charger(store) {
  const [portfolio, notes, index] = await Promise.all([loadData('atelier/portfolio.json'), store.notes('portfolio'), loadData('fondations/index.json')]);
  return { portfolio, notes, parId: new Map(notes.map((n) => [n.id, n])), kits: index.kits };
}

export async function renderListe({ view, store }) {
  const { portfolio, notes, parId } = await charger(store);
  const r = resumePortfolio(notes, portfolio.projets);
  const courant = projetCourant(notes, portfolio.projets);
  fill(view,
    h('h1', null, 'Portfolio'),
    sousNav('portfolio'),
    h('p', { class: 'chapo' }, 'Un livrable publié, construit sur des données ouvertes et relu par une personne du métier, répond mieux au doute « mes analyses n\'ont pas de valeur » que dix heures de lecture. Choisis un projet et mène-le jusqu\'à la publication.'),
    h('div', { class: 'alerte' }, portfolio.avertissement),
    courant ? h('div', { class: 'carte prochaine' }, h('p', { class: 'etiquette' }, courant.a.faites ? 'Projet en cours' : 'Projet conseillé pour commencer'),
      h('h2', null, courant.p.titre),
      h('p', null, courant.a.faites ? `Étape suivante : ${prochaineEtapeProjet(courant.note, courant.p)?.titre ?? 'terminé'}.` : courant.p.question),
      h('a', { class: 'bouton principal', href: `#/atelier/projet?id=${courant.p.id}` }, courant.a.faites ? 'Continuer' : 'Commencer')) : null,
    h('p', { class: 'stats' }, `${r.publies} publié${r.publies > 1 ? 's' : ''} · ${r.commences} commencé${r.commences > 1 ? 's' : ''} · ${r.total} proposés (objectif : un livrable publié d'ici trois mois)`),
    h('div', { class: 'grille' }, portfolio.projets.map((p) => {
      const note = parId.get(ID_PROJET(p.id));
      const a = avancementProjet(note, p);
      const pub = projetPublie(note, p);
      return h('section', { class: `carte${pub ? ' fait' : ''}` },
        h('h2', null, h('a', { href: `#/atelier/projet?id=${p.id}` }, p.titre)),
        h('p', null, p.question),
        h('p', { class: 'petit' }, `${NIVEAUX[p.niveau]} · environ ${p.duree_h} h`),
        h('div', { class: 'barre', role: 'img', 'aria-label': `${a.faites} étapes sur ${a.total}` }, h('div', { style: `width:${(a.faites / a.total) * 100}%` })),
        h('p', { class: 'petit' }, pub ? '✓ publié' : `${a.faites} étape${a.faites > 1 ? 's' : ''} sur ${a.total}`));
    })),
    h('h2', { class: 'rubrique' }, 'Principes'),
    h('ul', null, portfolio.principes.map((p) => h('li', null, p))));
}

export async function renderProjet({ view, store, params }) {
  const { portfolio, parId, kits } = await charger(store);
  const p = portfolio.projets.find((x) => x.id === params.id);
  if (!p) { location.hash = '#/atelier/portfolio'; return; }
  const data = { etapes: {}, notes: {}, controles: {}, ...(parId.get(ID_PROJET(p.id))?.data ?? {}) };
  data.etapes = { ...data.etapes }; data.notes = { ...data.notes }; data.controles = { ...data.controles };
  const sauver = () => store.putNote(ID_PROJET(p.id), { etapes: { ...data.etapes }, notes: { ...data.notes }, controles: { ...data.controles }, ...(data.url ? { url: data.url } : {}) });
  const zone = h('div');

  function dessiner() {
    const note = { data };
    const a = avancementProjet(note, p);
    const suivante = prochaineEtapeProjet(note, p);
    const pub = projetPublie(note, p);
    const toutControle = portfolio.publication.every((_, i) => data.controles[i]);
    fill(zone,
      h('div', { class: 'carte prochaine' }, h('p', { class: 'etiquette' }, pub ? 'Projet publié' : 'Prochaine étape'),
        h('h2', null, pub ? 'Bravo : ce livrable est publié.' : suivante ? suivante.titre : 'Toutes les étapes sont cochées : note l\'adresse de publication.'),
        suivante ? h('p', null, suivante.detail) : null,
        h('div', { class: 'barre' }, h('div', { style: `width:${(a.faites / a.total) * 100}%` })),
        h('p', { class: 'petit' }, `${a.faites} étape${a.faites > 1 ? 's' : ''} sur ${a.total}`)),
      h('h2', { class: 'rubrique' }, 'Étapes'),
      h('ol', { class: 'etapes projet-etapes' }, p.etapes.map((e) => {
        const fait = Number.isFinite(data.etapes[e.id]);
        return h('li', { class: fait ? 'fait' : '' },
          h('div', { class: 'etape-corps' },
            h('label', null,
              h('input', { type: 'checkbox', checked: fait, onchange: async (ev) => {
                if (ev.target.checked) data.etapes[e.id] = Date.now(); else delete data.etapes[e.id];
                await sauver(); dessiner();
              } }), ' ', h('strong', null, e.titre)),
            h('p', { class: 'petit' }, e.detail),
            e.id === 'publier' ? null : zoneTexte({ id: `pf-${p.id}-${e.id}`, label: 'Mes notes sur cette étape', rows: 3, valeur: data.notes[e.id] ?? '',
              onSave: async (t) => { data.notes[e.id] = t; await sauver(); } })));
      })),
      h('h2', { class: 'rubrique' }, 'Avant de publier'),
      h('ul', { class: 'cases' }, portfolio.publication.map((c, i) => h('li', null, h('label', null,
        h('input', { type: 'checkbox', checked: !!data.controles[i], onchange: async (ev) => { data.controles[i] = ev.target.checked; await sauver(); dessiner(); } }), ` ${c}`)))),
      h('div', { class: 'champ' }, h('label', { for: 'pf-url' }, 'Adresse du livrable publié'),
        h('p', { class: 'petit' }, toutControle ? 'Tous les contrôles sont faits : tu peux publier et noter l\'adresse.' : 'Passe d\'abord tous les contrôles ci-dessus.'),
        h('input', { id: 'pf-url', type: 'url', value: data.url ?? '', placeholder: 'https://…', disabled: !toutControle && !data.url,
          onchange: async (ev) => { data.url = ev.target.value.trim(); await sauver(); dessiner(); } })),
      pub ? null : h('p', { class: 'petit' }, 'Le projet compte comme publié quand toutes les étapes sont cochées et que l\'adresse est notée.'));
  }

  const kitsLies = (p.kits ?? []).map((k) => kits.find((x) => x.id.startsWith(`${k}-`))).filter(Boolean);
  fill(view,
    h('p', null, h('a', { class: 'lien', href: '#/atelier/portfolio' }, '← Portfolio')),
    h('h1', null, p.titre),
    h('p', { class: 'chapo' }, p.question),
    h('p', { class: 'petit' }, `${NIVEAUX[p.niveau]} · environ ${p.duree_h} h`),
    h('div', { class: 'carte' }, h('h2', null, 'Ce que ça prouve'), h('p', null, p.preuve)),
    h('div', { class: 'carte' }, h('h2', null, 'Données'),
      h('ul', null, p.donnees.map((d) => h('li', null, h('a', { href: d.url, target: '_blank', rel: 'noopener' }, d.titre), ` (${d.licence}). ${d.note}`))),
      h('p', { class: 'petit' }, h('strong', null, 'Outil : '), p.outil)),
    h('div', { class: 'carte' }, h('h2', null, `Livrable : ${p.livrable.format}`),
      h('ol', null, p.livrable.sections.map((s) => h('li', null, s))),
      h('p', { class: 'petit' }, `Pièges : ${p.pieges.join(' ')}`)),
    kitsLies.length ? h('p', { class: 'petit' }, 'Kits utiles : ', kitsLies.map((k, i) => [i ? ', ' : null, h('a', { href: `#/fondations/kit?id=${k.id}` }, k.titre)])) : null,
    zone);
  dessiner();
}
