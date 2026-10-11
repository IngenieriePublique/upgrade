// Fondations : liste des parcours et des kits, lecteur de kit (fiche, ressource, débat, cartes).
import { h, fill, zoneTexte, plural } from '../ui.js';
import { loadData } from '../data.js';
import { ID_NOTE, LIBELLES, notesParKit, statutKit, resumeParcours, ajouterCartesKit, prochainKit } from '../fondations.js';

const lien = (href, texte) => h('a', { href, target: '_blank', rel: 'noopener' }, texte);

export async function renderListe({ view, store }) {
  const [index, notes] = await Promise.all([loadData('fondations/index.json'), store.notes('kit')]);
  const parNote = notesParKit(notes);
  const resume = resumeParcours(index, notes);
  const suivant = prochainKit(index, notes, new Date().getDay());

  fill(view,
    h('h1', null, 'Fondations'),
    h('p', { class: 'chapo' }, 'Un kit = une fiche d\'une page, des cartes, une ressource à écouter ou lire, trois questions à débattre. Environ deux heures, à étaler sur la semaine.'),
    suivant ? h('p', null, 'Prochain kit conseillé aujourd\'hui : ', h('a', { href: `#/fondations/kit?id=${suivant.id}` }, suivant.titre)) : null,
    resume.map((p) => {
      const kits = index.kits.filter((k) => k.parcours === p.id).sort((a, b) => a.ordre - b.ordre);
      if (!kits.length) return null;
      return h('section', { class: 'carte' },
        h('h2', null, `${p.id}. ${p.titre}`),
        h('p', { class: 'stats' }, `${p.termines}/${p.total} terminé${p.termines > 1 ? 's' : ''}${p.encours ? ` · ${p.encours} en cours` : ''} · ${p.description}`),
        h('ul', { class: 'kits' }, kits.map((k) => {
          const st = statutKit(parNote.get(k.id));
          return h('li', { class: `kit ${st}` },
            h('span', { class: 'statut' }, LIBELLES[st]),
            h('a', { href: `#/fondations/kit?id=${k.id}` }, k.titre),
            h('span', { class: 'petit' }, ` ${k.nombre_cartes} cartes · ${k.duree_min} min${k.perissable ? ' · à recontrôler' : ''}`));
        })));
    }),
    h('p', { class: 'petit' }, 'Chaque kit cite ses sources et sa date de revue. Les faits qui changent (taux, noms, barèmes) sont signalés « à recontrôler ».'));
}

export async function renderKit({ view, store, decks, params }) {
  const [index, kit] = await Promise.all([loadData('fondations/index.json'), loadData(`fondations/${params.id}.json`)]);
  const parcours = index.parcours.find((p) => p.id === kit.parcours);
  const noteId = ID_NOTE(kit.id);
  let note = await store.getNote(noteId);
  const zone = h('div');
  view.append(zone);

  async function maj(patch) {
    const data = { ...(note?.data ?? {}), ...patch };
    note = await store.putNote(noteId, data);
  }

  async function commencer() {
    await maj({ startedAt: Date.now() });
    ajouterCartesKit(decks, parcours, kit);
    draw();
  }

  function draw() {
    const st = statutKit(note);
    const d = note?.data ?? {};
    const debat = d.debat ?? [];
    fill(zone,
      h('p', { class: 'petit' }, h('a', { href: '#/fondations' }, '← Fondations'), ` · ${parcours.id}. ${parcours.titre}`),
      h('h1', null, kit.titre),
      h('p', { class: 'chapo' }, kit.accroche),
      h('p', { class: 'stats' }, `${kit.duree_min} min · ${plural(kit.cartes.length, 'carte', 'cartes')} · revu le ${kit.revu}`),
      kit.perissable ? h('p', { class: 'alerte' }, `À recontrôler : ${kit.perissable_note}`) : null,
      h('div', { class: 'rangee' },
        st === 'a-faire'
          ? h('button', { class: 'bouton principal', onclick: commencer }, 'Commencer ce kit (ajoute les cartes à la révision)')
          : h('span', { class: 'statut' }, LIBELLES[st]),
        st === 'en-cours' ? h('button', { class: 'bouton', onclick: async () => { await maj({ doneAt: Date.now() }); draw(); } }, 'Marquer le kit comme terminé') : null,
        st === 'termine' ? h('button', { class: 'lien', onclick: async () => { await maj({ doneAt: null }); draw(); } }, 'Rouvrir') : null),

      h('section', { class: 'fiche' }, kit.fiche.map((s) => h('div', null,
        h('h2', null, s.titre), s.paragraphes.map((p) => h('p', null, p)),
        s.points ? h('ul', null, s.points.map((x) => h('li', null, x))) : null))),

      h('section', { class: 'carte' },
        h('h2', null, 'Ressource à suivre'),
        h('p', null, lien(kit.ressource.url, kit.ressource.titre), ` (${kit.ressource.type}${kit.ressource.duree ? `, ${kit.ressource.duree}` : ''})`),
        h('p', { class: 'petit' }, kit.ressource.pourquoi)),

      h('section', { class: 'carte' },
        h('h2', null, 'Trois questions à débattre'),
        h('p', { class: 'petit' }, 'À discuter avec quelqu\'un, ou à écrire en cinq lignes : défendre une position, c\'est ce qu\'on te demandera en entretien. Tes réponses restent dans ce navigateur.'),
        kit.debat.map((q, i) => zoneTexte({ id: `debat-${i}`, label: q, rows: 3, valeur: debat[i] ?? '',
          onSave: async (v) => { const nouveau = [...(note?.data?.debat ?? ['', '', ''])]; nouveau[i] = v; await maj({ debat: nouveau }); } }))),

      h('details', { class: 'sources' }, h('summary', null, `Les ${kit.cartes.length} cartes du kit`),
        h('ol', null, kit.cartes.map((c) => h('li', null, c.recto)))),
      h('details', { class: 'sources' }, h('summary', null, 'Sources du kit'),
        h('ul', null, kit.sources.map((s) => h('li', null, lien(s.url, s.titre)))),
        h('p', { class: 'petit' }, 'Texte reformulé à partir de ces sources ; les extraits de Wikipédia éventuels sont sous licence CC BY-SA.')),
      h('p', { class: 'petit droite' }, h('button', { class: 'lien', onclick: async (e) => { await store.addFlag(kit.id); e.target.textContent = 'Signalé'; e.target.disabled = true; } }, 'Signaler une erreur')));
  }
  draw();
}
