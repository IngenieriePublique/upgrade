// Brief : 13 items au plus, chacun avec une question à poser ; dossier de la semaine ; truc du jour.
import { h, fill, plural } from '../ui.js';
import { dayKey } from '../srs.js';
import { FOURNISSEURS, lireConfig, ecrireConfig, promptBrief, demander, IaError } from '../ia.js';

const RUBRIQUES = { france: 'France', monde: 'Monde', action_publique: 'Action publique' };
const JOURS_PERIME = 2;

export function ilYa(iso, now = Date.now()) {
  const min = Math.round((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(min) || min < 0) return '';
  if (min < 60) return 'il y a moins d\'une heure';
  if (min < 1440) return `il y a ${Math.floor(min / 60)} h`;
  return `il y a ${Math.floor(min / 1440)} j`;
}

export function joursDepuis(dateIso, now = Date.now()) {
  const [a, m, j] = dateIso.split('-').map(Number);
  const d0 = Date.UTC(a, m - 1, j);
  const [a2, m2, j2] = dayKey(now).split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, j2) - d0) / 86400000);
}

async function chargerJson(chemin) {
  const r = await fetch(chemin, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${chemin} : HTTP ${r.status}`);
  return r.json();
}

const lien = (it, onclick) => h('a', { href: it.lien, target: '_blank', rel: 'noopener noreferrer', onclick }, it.titre);

export async function render({ view, store, params }) {
  const now = Date.now();
  let brief;
  let index = null;
  try {
    index = await chargerJson('data/brief/index.json').catch(() => null);
    brief = await chargerJson(params.date ? `data/brief/archive/${encodeURIComponent(params.date)}.json` : 'data/brief/latest.json');
  } catch (e) {
    fill(view, h('h1', null, 'Brief'),
      h('div', { class: 'carte erreur' }, h('p', null, 'Le Brief n\'est pas disponible pour le moment.'),
        h('p', { class: 'petit' }, String(e.message ?? e)),
        h('p', { class: 'petit' }, 'Hors ligne ? Le Brief déjà lu reste consultable. Sinon : python -I scripts/build_brief.py puis relancer le site.')));
    return;
  }

  const rec = await store.getDay(brief.date);
  const lus = new Set(rec.briefLus ?? []);
  const ancien = Boolean(params.date);
  const age = joursDepuis(brief.date, now);
  const total = brief.items.length;
  const zone = h('div');
  view.append(zone);

  async function marquer(id, on) {
    if (on) lus.add(id); else lus.delete(id);
    await store.patchDay(brief.date, { briefLus: [...lus] });
    maj();
  }

  async function terminer() {
    await store.patchDay(dayKey(now), { done: { brief: true } });
    location.hash = '#/';
  }

  const barre = h('div', { class: 'barre', 'aria-hidden': 'true' }, h('div'));
  const compteur = h('span');
  const boutonFin = h('button', { class: 'bouton principal large', onclick: terminer }, 'Brief terminé');

  function maj() {
    compteur.textContent = `${lus.size}/${total} lus`;
    barre.firstChild.style.width = `${total ? Math.round(100 * lus.size / total) : 0}%`;
    boutonFin.textContent = lus.size >= total ? 'Brief terminé' : `Brief terminé (${total - lus.size} non lus)`;
    document.querySelectorAll('.brief-item').forEach((el) => el.classList.toggle('lu', lus.has(el.dataset.id)));
  }

  function carte(it) {
    return h('article', { class: 'carte brief-item', 'data-id': it.id },
      h('div', { class: 'brief-tete' },
        h('h3', null, lien(it, () => marquer(it.id, true))),
        h('label', { class: 'lu-case' }, h('input', { type: 'checkbox', checked: lus.has(it.id),
          onchange: (e) => marquer(it.id, e.target.checked) }), ' lu')),
      h('p', { class: 'petit' }, [it.source, ilYa(it.date, now), it.payant ? 'abonnement possible' : null,
        it.reprises > 1 ? `repris par ${it.reprises} médias` : null].filter(Boolean).join(' · ')),
      it.chapo ? h('p', null, it.chapo) : null,
      h('p', { class: 'question' }, h('strong', null, 'À poser : '), it.question));
  }

  function sections() {
    return Object.entries(RUBRIQUES).map(([cle, titre]) => {
      const items = brief.items.filter((i) => i.rubrique === cle);
      return items.length ? h('section', null, h('h2', { class: 'rubrique' }, titre), items.map(carte)) : null;
    });
  }

  const dossier = brief.dossier && h('section', null,
    h('h2', { class: 'rubrique' }, 'Dossier de la semaine'),
    h('article', { class: 'carte' },
      h('h3', null, lien(brief.dossier)),
      h('p', { class: 'petit' }, `${brief.dossier.source} · ${ilYa(brief.dossier.date, now)}`),
      brief.dossier.chapo ? h('p', null, brief.dossier.chapo) : null,
      h('p', { class: 'question' }, h('strong', null, 'À poser : '), brief.dossier.question),
      h('p', { class: 'petit' }, 'À lire dans le bloc profond de la semaine, pas dans les 8 minutes du Brief.')));

  const truc = brief.truc && h('section', null,
    h('h2', { class: 'rubrique' }, 'Le truc du jour'),
    h('article', { class: 'carte' },
      h('h3', null, brief.truc.titre),
      brief.truc.extrait ? h('p', null, brief.truc.extrait) : null,
      h('p', { class: 'petit' }, h('a', { href: brief.truc.lien, target: '_blank', rel: 'noopener noreferrer' }, 'Article Wikipédia'),
        ` · ${brief.truc.source}, ${brief.truc.licence}`)));

  const voisins = index?.dates ?? [];
  const i = voisins.indexOf(brief.date);
  const precedent = i >= 0 ? voisins[i + 1] : null;
  const suivant = i > 0 ? voisins[i - 1] : null;

  fill(zone,
    h('p', { class: 'date' }, new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      .format(new Date(...brief.date.split('-').map((n, k) => (k === 1 ? n - 1 : +n))))),
    h('h1', null, 'Brief'),
    age > JOURS_PERIME && !ancien ? h('p', { class: 'alerte' },
      `Ce Brief date d'il y a ${plural(age, 'jour', 'jours')} : la mise à jour automatique semble arrêtée. ` +
      'Repli : lancer python -I scripts/build_brief.py puis publier (voir docs/brief.md).') : null,
    brief.sources.echecs.length > brief.sources.total / 3 ? h('p', { class: 'alerte' },
      `${brief.sources.echecs.length} sources sur ${brief.sources.total} n'ont pas répondu : le Brief est incomplet.`) : null,
    h('div', { class: 'entete-rev' }, compteur, h('span', null, `${plural(total, 'item', 'items')} · lecture : 8 min`)),
    barre,
    total ? sections() : h('p', null, 'Aucun item aujourd\'hui.'),
    dossier, truc,
    ancien ? null : boutonFin,
    h('nav', { class: 'rangee petit', 'aria-label': 'Autres jours' },
      precedent ? h('a', { href: `#/brief?date=${precedent}` }, `← ${precedent}`) : null,
      ancien && suivant ? h('a', { href: `#/brief?date=${suivant}` }, `${suivant} →` ) : null,
      ancien ? h('a', { href: '#/brief' }, 'Brief du jour') : null),
    sectionIa(brief));
  maj();
}

function sectionIa(brief) {
  const sortie = h('div', { class: 'ia-sortie' });
  const etat = h('p', { class: 'petit', 'aria-live': 'polite' });
  let cfg = lireConfig();
  const sel = h('select', { id: 'ia-four' }, Object.entries(FOURNISSEURS).map(([k, f]) => h('option', { value: k, selected: cfg?.fournisseur === k }, f.nom)));
  const cle = h('input', { type: 'password', id: 'ia-cle', autocomplete: 'off', placeholder: 'Clé API (reste dans ce navigateur)', value: cfg?.cle ?? '' });
  const modele = h('input', { type: 'text', id: 'ia-modele', placeholder: 'Modèle (laisser vide = défaut)', value: cfg?.modele ?? '' });

  async function copier() {
    const texte = promptBrief(brief);
    try {
      await navigator.clipboard.writeText(texte);
      etat.textContent = 'Prompt copié. Colle-le dans un chat (claude.ai, Gemini…).';
    } catch {
      fill(sortie, h('textarea', { rows: 10, readonly: true, 'aria-label': 'Prompt à copier' }, texte));
      etat.textContent = 'Copie automatique impossible : sélectionne le texte ci-dessous.';
    }
  }

  async function interroger() {
    cfg = lireConfig();
    if (!cfg?.cle) { etat.textContent = 'Enregistre d\'abord une clé, ou utilise le prompt à coller.'; return; }
    etat.textContent = 'Demande en cours…';
    try {
      const texte = await demander(cfg, promptBrief(brief));
      fill(sortie, h('div', { class: 'carte' }, h('p', { class: 'petit' }, 'Texte généré par une IA à partir des seuls titres et chapôs ci-dessus : à vérifier avant de le répéter.'),
        h('pre', { class: 'ia-texte' }, texte)));
      etat.textContent = '';
    } catch (e) {
      etat.textContent = e instanceof IaError && e.quota
        ? 'Quota gratuit atteint. Utilise « Copier le prompt » dans un chat gratuit.'
        : `L'IA n'a pas répondu (${e.message}). Utilise « Copier le prompt ».`;
    }
  }

  function enregistrer() {
    const ok = cle.value.trim()
      ? ecrireConfig({ fournisseur: sel.value, cle: cle.value.trim(), modele: modele.value.trim() })
      : ecrireConfig(null);
    etat.textContent = ok ? (cle.value.trim() ? 'Clé enregistrée dans ce navigateur.' : 'Clé effacée.') : 'Stockage local indisponible.';
  }

  return h('details', { class: 'carte ia' },
    h('summary', null, 'Aller plus loin avec une IA (facultatif)'),
    h('p', { class: 'petit' }, 'Résumé et angle de conversation pour chaque item. Seuls les titres et chapôs publics sont envoyés. Jamais obligatoire.'),
    h('div', { class: 'rangee' }, h('button', { class: 'bouton', onclick: copier }, 'Copier le prompt prêt à coller'),
      h('button', { class: 'bouton', onclick: interroger }, 'Demander à l\'IA configurée')),
    etat, sortie,
    h('details', null, h('summary', { class: 'petit' }, 'Configurer une clé personnelle'),
      h('div', { class: 'ia-form' },
        h('label', { for: 'ia-four' }, 'Fournisseur'), sel,
        h('label', { for: 'ia-cle' }, 'Clé API'), cle,
        h('label', { for: 'ia-modele' }, 'Modèle'), modele,
        h('p', { class: 'petit' }, 'La clé est gardée dans le stockage local de ce navigateur (jamais dans la sauvegarde ni dans le dépôt). ' +
          'Quotas, conditions et modèles actuels : à lire sur la page du fournisseur (AI Studio pour Gemini).'),
        h('button', { class: 'bouton', onclick: enregistrer }, 'Enregistrer'))));
}
