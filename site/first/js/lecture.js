// Lecture territoriale : une lecture à la fois (article scientifique, rapport, article de presse, 2020-2026), choisie pour le jour,
// avec un bouton « Une autre ». Contenu : content/lectures/lectures.json. Les lectures lues sont notées dans ce navigateur.
import { h, fill } from '../../js/ui.js';
import { loadData } from '../../js/data.js';
import { dayKey } from '../../js/srs.js';
import { cadre, filtres } from './cadre.js';
import { icone } from './icones.js';

const CLE_LUES = 'first-lectures-lues';
const TYPES = { article: 'Article', rapport: 'Rapport', presse: 'Presse' };

// Lecture du jour : un article ou un rapport non lu (la presse seulement à défaut), la même toute la journée.
export function lectureDuJour(pool, lues, jour) {
  const choix = (liste) => { const nonLues = liste.filter((l) => !lues.has(l.id)); return nonLues.length ? nonLues : liste; };
  const savantes = pool.filter((l) => l.type !== 'presse');
  const base = choix(savantes.length ? savantes : pool);
  const graine = Number(jour.replaceAll('-', ''));
  return base[graine % base.length];
}

export function lectureAutre(pool, lues, courante, rng = Math.random) {
  const autres = pool.filter((l) => l.id !== courante);
  const nonLues = autres.filter((l) => !lues.has(l.id));
  const base = nonLues.length ? nonLues : autres;
  return base.length ? base[Math.floor(rng() * base.length)] : null;
}

export async function render({ view, store, params }) {
  const donnees = await loadData('lectures/lectures.json');
  const themes = { tout: 'Tout', ...donnees.themes };
  const cle = themes[params.t] ? params.t : 'tout';
  const pool = donnees.lectures.filter((l) => cle === 'tout' || l.theme === cle);
  const lues = new Set(await store.getMeta(CLE_LUES, []));

  const zone = h('div', { class: 'lecture-zone' });
  view.append(cadre({
    titre: 'Lecture territoriale',
    nom: 'lecture',
    outils: [filtres('/lecture', 't', themes, cle)],
    corps: zone,
  }));

  const courante = pool.find((l) => l.id === params.id) ?? lectureDuJour(pool, lues, dayKey(Date.now()));
  if (!courante) { fill(zone, h('p', { class: 'discret' }, 'Aucune lecture dans ce thème.')); return; }

  async function basculerLue(bouton) {
    if (lues.has(courante.id)) lues.delete(courante.id); else lues.add(courante.id);
    await store.setMeta(CLE_LUES, [...lues]);
    majBouton(bouton);
    majCompte();
  }
  const majBouton = (b) => {
    const lue = lues.has(courante.id);
    b.classList.toggle('actif', lue);
    b.setAttribute('aria-pressed', String(lue));
    fill(b, lue ? icone('coche', { taille: 16 }) : null, lue ? 'Lue' : 'Marquer comme lue');
  };
  const compte = h('span', { class: 'discret' });
  const majCompte = () => { compte.textContent = `${pool.filter((l) => lues.has(l.id)).length} lue${pool.filter((l) => lues.has(l.id)).length > 1 ? 's' : ''} sur ${pool.length}`; };

  const bLue = h('button', { class: 'secondaire bascule', onclick: () => basculerLue(bLue) });
  const autre = lectureAutre(pool, lues, courante.id);
  majBouton(bLue);
  majCompte();

  const meta = [courante.auteurs, courante.source, courante.annee, courante.pages ? `${courante.pages} pages` : null].filter(Boolean).join(' · ');
  fill(zone, h('article', { class: 'lecture' },
    h('p', { class: 'etiquette' }, `${TYPES[courante.type]} · ${donnees.themes[courante.theme]}`),
    h('h2', null, courante.titre),
    h('p', { class: 'meta' }, meta),
    h('p', { class: 'resume' }, courante.resume),
    h('div', { class: 'rangee' },
      h('a', { class: 'bouton', href: courante.url, target: '_blank', rel: 'noopener noreferrer' }, 'Lire', icone('externe', { taille: 16 })),
      courante.doi ? h('a', { class: 'bouton secondaire', href: courante.doi, target: '_blank', rel: 'noopener noreferrer' }, 'Version de l\'éditeur') : null,
      autre ? h('a', { class: 'bouton secondaire', href: `#/lecture?t=${cle}&id=${autre.id}` }, 'Une autre lecture') : null,
      bLue),
    h('p', { class: 'pied-lecture' }, compte, courante.libre ? h('span', { class: 'discret' }, 'Texte en accès libre') : null)));
}
