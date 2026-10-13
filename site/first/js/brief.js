// Brief d'actualité politico-économique : titres, source et chapô des articles du jour (flux RSS de presse déjà collectés
// par scripts/build_brief.py). Chaque article est un accordéon : le titre seul, ou le chapô, la question à se poser et le lien
// quand on l'ouvre. Une pastille en haut de chaque article se coche quand on l'a lu ; la mémoire est conservée dans le navigateur.
// Liste paginée : le nombre d'articles par page s'adapte à la hauteur disponible.
import { h, fill } from '../../js/ui.js';
import { cadre, filtres, pastilleLu } from './cadre.js';
import { CLE_BRIEF, ecrire, elaguer, lire } from './lus.js';
import { icone } from './icones.js';

const THEMES = { decentralisation: 'décentralisation', finances: 'finances publiques', amenagement: 'aménagement', evaluation: 'évaluation', inegalites: 'inégalités', intercommunalite: 'intercommunalités' };
const RUBRIQUES = { tout: 'Tout', france: 'France', monde: 'Monde', action_publique: 'Action publique' };
const HAUTEUR_ARTICLE = 72; // px : un article fermé (titre sur deux lignes au plus, source) et l'écart entre deux articles

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

export async function render({ view, store, params }) {
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

  const lus = elaguer(await lire(store, CLE_BRIEF, {}), brief.date);
  const memoriser = (it, lu) => {
    if (lu) lus[it.id] = brief.date; else delete lus[it.id];
    return ecrire(store, CLE_BRIEF, lus);
  };
  const compte = () => articles.filter((it) => lus[it.id]).length;
  const liste = h('div', { class: 'brief-liste' });
  const pied = h('div', { class: 'brief-pied' });
  let page = 0;
  let parPage = 4;

  // Un article : le titre ouvre ou ferme son contenu (le lien vers l'original reste dans le contenu).
  const ouverts = new Set();
  function article(it) {
    const corps = h('div', { class: 'brief-corps', id: `brief-${it.id}`, hidden: !ouverts.has(it.id) },
      it.chapo ? h('p', { class: 'chapo' }, it.chapo) : h('p', { class: 'discret' }, 'Pas de chapô dans le flux de cette source.'),
      it.question ? h('p', { class: 'a-se-demander' }, h('span', { class: 'etiquette' }, `À se demander${THEMES[it.theme] ? ` · ${THEMES[it.theme]}` : ''}`), it.question) : null,
      h('div', { class: 'rangee' },
        h('a', { class: 'bouton', href: it.lien, target: '_blank', rel: 'noopener noreferrer' }, "Lire l'article", icone('externe', { taille: 16 })),
        it.reprises > 1 ? h('span', { class: 'discret' }, `Repris par ${it.reprises} sources`) : null),
      it.payant ? h('p', { class: 'meta' }, "Cette source peut demander un abonnement pour l'article complet.") : null);
    const tete = h('button', { class: 'brief-tete', type: 'button', 'aria-expanded': String(ouverts.has(it.id)), 'aria-controls': corps.id },
      h('span', { class: 'brief-titre' },
        h('span', { class: 'brief-h' }, it.titre),
        h('span', { class: 'meta' }, [it.source, ilYa(it.date)].filter(Boolean).join(' · '))),
      icone('bas', { taille: 20 }));
    const pastille = pastilleLu({ lu: Boolean(lus[it.id]), objet: 'cet article', onChange: async (lu) => {
      el.classList.toggle('lu', lu);
      await memoriser(it, lu);
      majCompte();
    } });
    const el = h('article', { class: `brief-article${ouverts.has(it.id) ? ' ouvert' : ''}${lus[it.id] ? ' lu' : ''}` },
      h('div', { class: 'brief-ligne' }, pastille, tete), corps);
    tete.addEventListener('click', () => {
      const ouvre = corps.hidden;
      corps.hidden = !ouvre;
      tete.setAttribute('aria-expanded', String(ouvre));
      el.classList.toggle('ouvert', ouvre);
      if (ouvre) ouverts.add(it.id); else ouverts.delete(it.id);
      if (ouvre) requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    });
    return el;
  }

  const resume = h('span', null);
  const majCompte = () => { const n = compte(); resume.textContent = `${n} lu${n > 1 ? 's' : ''} sur ${articles.length}`; };

  function dessiner() {
    majCompte();
    const pages = Math.max(1, Math.ceil(articles.length / parPage));
    page = Math.min(page, pages - 1);
    fill(liste, articles.length
      ? articles.slice(page * parPage, (page + 1) * parPage).map(article)
      : h('p', { class: 'discret' }, 'Rien dans cette rubrique aujourd\'hui.'));
    fill(pied,
      h('span', { class: 'discret' }, `Brief du ${jour} · `, resume),
      pages > 1 ? h('div', { class: 'pagination' },
        h('button', { class: 'rond secondaire', 'aria-label': 'Page précédente', disabled: page === 0, onclick: () => { page--; dessiner(); } }, icone('precedent')),
        h('span', null, `${page + 1} / ${pages}`),
        h('button', { class: 'rond secondaire', 'aria-label': 'Page suivante', disabled: page >= pages - 1, onclick: () => { page++; dessiner(); } }, icone('suivant'))) : null);
  }

  function ajuster() {
    const n = Math.max(3, Math.min(8, Math.floor(liste.clientHeight / HAUTEUR_ARTICLE)));
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
