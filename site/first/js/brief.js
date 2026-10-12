// Brief d'actualité politico-économique : titres, source et chapô des articles du jour (flux RSS de presse déjà collectés
// par scripts/build_brief.py). Liste paginée : le nombre d'articles par page s'adapte à la hauteur disponible.
import { h, fill } from '../../js/ui.js';
import { cadre, filtres } from './cadre.js';
import { icone } from './icones.js';

const RUBRIQUES = { tout: 'Tout', france: 'France', monde: 'Monde', action_publique: 'Action publique' };
const HAUTEUR_ARTICLE = 118; // px : titre sur deux lignes, chapô sur deux lignes, source

export function ilYa(iso, now = Date.now()) {
  const min = Math.round((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(min) || min < 0) return '';
  if (min < 60) return 'il y a moins d\'une heure';
  if (min < 1440) return `il y a ${Math.floor(min / 60)} h`;
  return `il y a ${Math.floor(min / 1440)} j`;
}

async function chargerBrief() {
  const r = await fetch('data/brief/latest.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Brief : HTTP ${r.status}`);
  return r.json();
}

export async function render({ view, params }) {
  const cle = RUBRIQUES[params.r] ? params.r : 'tout';
  let brief;
  try { brief = await chargerBrief(); } catch (e) {
    view.append(cadre({ titre: 'Brief d\'actualité', nom: 'brief', corps: h('div', { class: 'panneau centre' },
      h('p', { class: 'grand' }, 'Le Brief n\'est pas disponible.'), h('p', { class: 'discret' }, String(e.message ?? e))) }));
    return;
  }
  const articles = brief.items.filter((i) => cle === 'tout' || i.rubrique === cle);
  const date = new Date(...brief.date.split('-').map((n, k) => (k === 1 ? n - 1 : +n)));
  const jour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);

  const liste = h('div', { class: 'brief-liste' });
  const pied = h('div', { class: 'brief-pied' });
  let page = 0;
  let parPage = 4;

  const article = (it) => h('article', { class: 'brief-article' },
    h('h2', null, h('a', { href: it.lien, target: '_blank', rel: 'noopener noreferrer' }, it.titre, icone('externe', { taille: 14 }))),
    h('p', { class: 'meta' }, [it.source, ilYa(it.date), it.payant ? 'abonnement possible' : null].filter(Boolean).join(' · ')),
    it.chapo ? h('p', { class: 'chapo' }, it.chapo) : null);

  function dessiner() {
    const pages = Math.max(1, Math.ceil(articles.length / parPage));
    page = Math.min(page, pages - 1);
    fill(liste, articles.length
      ? articles.slice(page * parPage, (page + 1) * parPage).map(article)
      : h('p', { class: 'discret' }, 'Rien dans cette rubrique aujourd\'hui.'));
    fill(pied,
      h('span', { class: 'discret' }, `Brief du ${jour}`),
      pages > 1 ? h('div', { class: 'pagination' },
        h('button', { class: 'rond secondaire', 'aria-label': 'Page précédente', disabled: page === 0, onclick: () => { page--; dessiner(); } }, icone('precedent')),
        h('span', null, `${page + 1} / ${pages}`),
        h('button', { class: 'rond secondaire', 'aria-label': 'Page suivante', disabled: page >= pages - 1, onclick: () => { page++; dessiner(); } }, icone('suivant'))) : null);
  }

  function ajuster() {
    const n = Math.max(2, Math.min(6, Math.floor(liste.clientHeight / HAUTEUR_ARTICLE)));
    if (n !== parPage) { parPage = n; dessiner(); }
  }

  view.append(cadre({
    titre: 'Brief d\'actualité',
    nom: 'brief',
    outils: [filtres('/brief', 'r', RUBRIQUES, cle)],
    corps: h('div', { class: 'brief' }, liste, pied),
  }));
  dessiner();
  requestAnimationFrame(ajuster);
  window.addEventListener('resize', ajuster);
  return () => window.removeEventListener('resize', ajuster);
}
