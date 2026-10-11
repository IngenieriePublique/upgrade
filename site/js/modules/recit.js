// Récit : pitchs (30 s, 90 s, 3 min) et histoires STAR. Tout reste dans le navigateur et dans les sauvegardes.
import { h, fill, zoneTexte, copierTexte } from '../ui.js';
import { loadData } from '../data.js';
import { histoireUtilisable, pitchComplet } from '../candidature.js';
import { sousNav } from './sprint.js';

const MOTS_PAR_SECONDE = 2.2; // environ 130 mots par minute : une estimation, pas une mesure

export const compterMots = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export function promptRetour(titre, contenu) {
  return `Tu es un recruteur bienveillant mais exigeant dans l'administration publique territoriale.\n`
    + `Voici ${titre} d'un étudiant de master en développement territorial. Évalue-le selon quatre critères : `
    + `clarté, structure, preuves concrètes (chiffres, livrables) et lien avec le métier visé (évaluation et pilotage des politiques publiques). `
    + `Donne trois améliorations précises, sans réécrire le texte à ma place et sans inventer aucun fait.\n\n${contenu}`;
}

export async function render({ view, store, params }) {
  const [gab, notes] = await Promise.all([loadData('oral/gabarits.json'), store.notes()]);
  const parId = new Map(notes.map((n) => [n.id, n]));
  const v = params.v === 'star' ? 'star' : 'pitch';

  const onglets = h('div', { class: 'sous-onglets' },
    h('a', { href: '#/sprint/recit', class: v === 'pitch' ? 'actif' : '' }, 'Pitchs'),
    h('a', { href: '#/sprint/recit?v=star', class: v === 'star' ? 'actif' : '' }, 'Histoires STAR'));

  fill(view, h('h1', null, 'Pitch et histoires STAR'), sousNav('recit'),
    h('p', { class: 'chapo' }, gab.avertissement), onglets,
    v === 'pitch' ? pitchs(gab, parId, store, params.p) : star(gab, parId, store, params.s));
}

function pitchs(gab, parId, store, choisi) {
  const p = gab.pitchs.find((x) => x.id === choisi) ?? gab.pitchs[1];
  const note = parId.get(`pitch:${p.id}`);
  const champs = { ...(note?.data?.champs ?? {}) };
  const total = h('p', { class: 'petit', 'aria-live': 'polite' });
  const sortie = h('span');
  const statut = h('p', { class: 'petit', 'aria-live': 'polite' });

  const majTotal = () => {
    const mots = Object.values(champs).reduce((a, t) => a + compterMots(t ?? ''), 0);
    const sec = Math.round(mots / MOTS_PAR_SECONDE);
    total.textContent = `${mots} mots, environ ${sec} secondes à l'oral (estimation à 130 mots par minute) pour un objectif de ${p.secondes} secondes.`
      + (sec > p.secondes * 1.15 ? ' Trop long : coupe.' : '');
    statut.textContent = pitchComplet({ data: { champs } }, p)
      ? 'Tous les champs sont remplis. Passe maintenant à l\'enregistreur pour le dire à voix haute.'
      : 'Remplis tous les champs pour valider cette étape.';
  };
  majTotal();

  return h('div', null,
    h('div', { class: 'sous-onglets' }, gab.pitchs.map((x) => h('a', { href: `#/sprint/recit?p=${x.id}`, class: x.id === p.id ? 'actif' : '' }, x.titre))),
    h('p', null, p.usage),
    p.champs.map((c) => zoneTexte({ id: `pitch-${p.id}-${c.id}`, label: c.label, aide: c.aide, rows: 3, valeur: champs[c.id] ?? '',
      onSave: async (txt) => {
        champs[c.id] = txt;
        await store.putNote(`pitch:${p.id}`, { champs: { ...champs } });
        majTotal();
      } })),
    total,
    statut,
    h('div', { class: 'rangee' },
      h('a', { class: 'bouton', href: '#/sprint/oral?q=q-pres-01' }, 'Le dire à voix haute'),
      h('button', { class: 'bouton', onclick: () => copierTexte(promptRetour(`son pitch de ${p.secondes} secondes`,
        p.champs.map((c) => `${c.label} : ${champs[c.id] ?? ''}`).join('\n')), sortie) }, 'Copier un prompt de retour (à coller dans un chat)'),
      sortie),
    h('p', { class: 'petit' }, 'Le prompt contient ton texte : ne le colle que dans un chat où tu acceptes de partager ces informations.'));
}

function star(gab, parId, store, choisi) {
  const cfg = gab.star;
  const slot = cfg.emplacements.find((s) => s.id === choisi);
  if (!slot) {
    return h('div', null,
      h('ul', { class: 'conseils' }, cfg.conseils.map((c) => h('li', null, c))),
      h('div', { class: 'grille' }, cfg.emplacements.map((s) => {
        const n = parId.get(`star:${s.id}`);
        return h('article', { class: `carte${histoireUtilisable(n) ? ' fait' : ''}` },
          h('h3', null, h('a', { href: `#/sprint/recit?v=star&s=${s.id}` }, n?.data?.titre || s.titre)),
          h('p', { class: 'petit' }, s.question_type),
          h('p', { class: 'petit' }, histoireUtilisable(n) ? '✓ utilisable à l\'oral' : 'à écrire (situation, action, résultat)'));
      })),
      h('details', { class: 'sources' }, h('summary', null, 'Sources de la méthode'),
        h('ul', null, cfg.sources.map((s) => h('li', null, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.titre))))));
  }
  const note = parId.get(`star:${slot.id}`);
  const data = { titre: note?.data?.titre ?? '', champs: { ...(note?.data?.champs ?? {}) } };
  const sortie = h('span');
  const sauver = () => store.putNote(`star:${slot.id}`, { titre: data.titre, champs: { ...data.champs } });
  return h('div', null,
    h('p', null, h('a', { class: 'lien', href: '#/sprint/recit?v=star' }, '← Toutes les histoires')),
    h('p', { class: 'petit' }, `Question type : ${slot.question_type}`),
    zoneTexte({ id: 'star-titre', label: 'Titre de l\'histoire (pour la retrouver)', rows: 1, valeur: data.titre,
      aide: slot.titre, onSave: async (t) => { data.titre = t.replace(/\n/g, ' '); await sauver(); } }),
    cfg.champs.map((c) => zoneTexte({ id: `star-${c.id}`, label: c.label, aide: c.aide, rows: 4, valeur: data.champs[c.id] ?? '',
      onSave: async (t) => { data.champs[c.id] = t; await sauver(); } })),
    h('div', { class: 'rangee' },
      h('a', { class: 'bouton', href: '#/sprint/oral' }, 'La raconter à voix haute'),
      h('button', { class: 'bouton', onclick: () => copierTexte(promptRetour('une histoire racontée selon la méthode STAR',
        cfg.champs.map((c) => `${c.label} : ${data.champs[c.id] ?? ''}`).join('\n')), sortie) }, 'Copier un prompt de retour'),
      sortie));
}
