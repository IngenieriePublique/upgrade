// Réseau : entretiens d'information (guide, message modèle, suivi des contacts). Les contacts restent dans le navigateur.
import { h, fill, zoneTexte, copierTexte } from '../ui.js';
import { loadData } from '../data.js';
import { STATUTS_CONTACT } from '../candidature.js';
import { sousNav } from './sprint.js';

const labelStatut = (id) => STATUTS_CONTACT.find((s) => s.id === id)?.label ?? id;
const SEMAINE = 7 * 86400000;

// Nombre d'entretiens faits sur les 7 derniers jours (règle : un contact humain par semaine).
export const contactsDeLaSemaine = (contacts, now = Date.now()) =>
  contacts.filter((c) => c.data?.statut === 'fait' && now - (c.data.faitLe ?? 0) <= SEMAINE).length;

export async function render({ view, store, params }) {
  const [gab, banque, radar, notes] = await Promise.all([
    loadData('oral/gabarits.json'), loadData('oral/questions.json'), loadData('radar/employeurs.json'), store.notes('contact')]);
  const info = gab.entretien_info;
  const questions = banque.questions.filter((q) => q.categorie === 'reseau');
  const contacts = notes;
  const zone = h('div');
  const sortie = h('span');
  let formulaire = !!params.radar;

  async function enregistrer(c, patch) {
    c.data = { ...c.data, ...patch };
    c.updatedAt = Date.now();
    await store.putNote(c.id, c.data);
  }

  function carteContact(c) {
    const d = c.data;
    const emp = radar.employeurs.find((e) => e.id === d.radar);
    return h('article', { class: 'carte contact' },
      h('div', { class: 'brief-tete' },
        h('h3', null, d.nom || 'Contact sans nom'),
        h('button', { class: 'lien', onclick: async () => {
          if (!confirm('Supprimer ce contact ?')) return;
          await store.deleteNote(c.id);
          contacts.splice(contacts.indexOf(c), 1);
          dessiner();
        } }, 'Supprimer')),
      h('p', { class: 'petit' }, [d.structure, emp ? `radar : ${emp.sigle || emp.nom}` : null].filter(Boolean).join(' · ')),
      h('div', { class: 'rangee' },
        h('label', { class: 'filtre' }, 'Statut',
          h('select', { onchange: async (ev) => {
            const statut = ev.target.value;
            await enregistrer(c, { statut, ...(statut === 'fait' ? { faitLe: Date.now() } : {}) });
            dessiner();
          } }, STATUTS_CONTACT.map((s) => h('option', { value: s.id, selected: s.id === d.statut }, s.label)))),
        h('label', { class: 'filtre' }, 'Date du rendez-vous',
          h('input', { type: 'date', value: d.date ?? '', onchange: (ev) => enregistrer(c, { date: ev.target.value }) }))),
      zoneTexte({ id: `contact-${c.id.replace(':', '-')}`, label: 'Notes (ce qu\'on m\'a dit, conseils, personne suivante, remerciement envoyé ?)', rows: 3,
        valeur: d.notes ?? '', onSave: (v) => enregistrer(c, { notes: v }) }));
  }

  function formAjout() {
    const champ = { nom: '', structure: '', radar: params.radar ?? '' };
    return h('form', { class: 'carte', onsubmit: async (ev) => {
      ev.preventDefault();
      const id = `contact:${Date.now()}`;
      const data = { nom: champ.nom.trim(), structure: champ.structure.trim(), radar: champ.radar, statut: 'a-contacter', notes: '' };
      await store.putNote(id, data);
      contacts.push({ id, kind: 'contact', data, updatedAt: Date.now() });
      formulaire = false;
      dessiner();
    } },
      h('h3', null, 'Nouveau contact'),
      h('label', { class: 'filtre' }, 'Nom (ou « un ancien du master »)', h('input', { required: true, oninput: (e) => { champ.nom = e.target.value; } })),
      h('label', { class: 'filtre' }, 'Structure et fonction', h('input', { oninput: (e) => { champ.structure = e.target.value; } })),
      h('label', { class: 'filtre' }, 'Employeur du radar (facultatif)',
        h('select', { onchange: (e) => { champ.radar = e.target.value; } },
          h('option', { value: '' }, '—'),
          radar.employeurs.map((e) => h('option', { value: e.id, selected: e.id === champ.radar }, e.sigle ? `${e.sigle} · ${e.nom}` : e.nom)))),
      h('div', { class: 'rangee' }, h('button', { class: 'bouton principal', type: 'submit' }, 'Ajouter'),
        h('button', { class: 'bouton', type: 'button', onclick: () => { formulaire = false; dessiner(); } }, 'Annuler')));
  }

  function dessiner() {
    const sem = contactsDeLaSemaine(contacts);
    const tries = [...contacts].sort((a, b) => b.updatedAt - a.updatedAt);
    fill(zone,
      h('p', { class: sem ? 'chapo' : 'alerte' }, sem ? `${sem} entretien${sem > 1 ? 's' : ''} fait${sem > 1 ? 's' : ''} sur les 7 derniers jours. Objectif tenu.`
        : 'Aucun entretien d\'information fait cette semaine. Objectif : un contact humain par semaine.'),
      h('div', { class: 'rangee' }, h('button', { class: 'bouton principal', onclick: () => { formulaire = true; dessiner(); } }, 'Ajouter un contact')),
      formulaire ? formAjout() : null,
      tries.length ? tries.map(carteContact) : h('p', { class: 'petit' }, 'Aucun contact pour le moment. Commence par une personne que tu connais déjà : un ancien du master, un tuteur de stage.'));
  }

  fill(view,
    h('h1', null, 'Réseau'),
    sousNav('reseau'),
    h('p', { class: 'chapo' }, info.principe),
    h('section', { class: 'carte' }, h('h2', null, 'Comment faire'),
      h('ol', null, info.etapes.map((e) => h('li', null, e)))),
    h('details', { class: 'carte' }, h('summary', null, h('strong', null, 'Message modèle')),
      h('pre', { class: 'ia-texte' }, info.message_modele),
      h('div', { class: 'rangee' }, h('button', { class: 'bouton', onclick: () => copierTexte(info.message_modele, sortie) }, 'Copier le message'), sortie)),
    h('details', { class: 'carte' }, h('summary', null, h('strong', null, `Questions à poser (${questions.length})`)),
      h('ul', null, questions.map((q) => h('li', null, h('strong', null, q.question), ' ', h('span', { class: 'petit' }, q.piste))))),
    h('details', { class: 'carte' }, h('summary', null, h('strong', null, 'Où trouver des contacts')),
      h('ul', null,
        h('li', null, 'Les anciens et les enseignants du master, puis leurs contacts (demande toujours « Connaissez-vous quelqu\'un ? »).'),
        h('li', null, h('a', { href: 'https://www.sfe-asso.fr/qui-sommes-nous/', target: '_blank', rel: 'noopener' }, 'Société française de l\'évaluation'),
          ' : groupes thématiques, clubs régionaux, réseau de jeunes évaluateurs (JEEunes), webinaires.'),
        h('li', null, h('a', { href: 'https://u-bordeaux.fr/download_file/force/eb8a90d2-ef33-48ad-b43a-6af764968945/6633', target: '_blank', rel: 'noopener' },
          'Guide de l\'enquête métier de l\'Université de Bordeaux'), ' (Espace Orientation Carrières).'),
        h('li', null, 'Les employeurs du radar : une personne par structure, sur le poste qui t\'intéresse.')),
      h('details', { class: 'sources' }, h('summary', null, 'Sources du guide'),
        h('ul', null, info.sources.map((s) => h('li', null, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.titre)))))),
    h('h2', { class: 'rubrique' }, `Mes contacts (${contacts.length})`),
    zone);
  dessiner();
}
