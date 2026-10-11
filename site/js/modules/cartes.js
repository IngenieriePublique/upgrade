// Cartes : liste des paquets et écran de révision.
import { h, fill, plural } from '../ui.js';
import { GRADES, GRADE_LABELS, schedule, buildQueue, deckStats, countNewToday, formatDelay, dayKey, newState } from '../srs.js';

export const NEW_PER_DAY = 10;

export async function renderListe({ view, store, decks }) {
  const states = await store.states();
  const now = Date.now();
  const newToday = countNewToday(states, now);
  const queue = buildQueue(decks.flatMap((d) => d.cartes), states, now, { newLimit: NEW_PER_DAY, newToday });

  fill(view,
    h('h1', null, 'Cartes'),
    h('p', { class: 'chapo' }, queue.length
      ? `${plural(queue.length, 'carte à voir', 'cartes à voir')} aujourd'hui (nouvelles limitées à ${NEW_PER_DAY} par jour).`
      : 'Rien à réviser pour le moment.'),
    queue.length ? h('a', { class: 'bouton principal', href: '#/cartes/reviser' }, 'Lancer la révision') : null,
    h('div', { class: 'grille' }, decks.map((d) => {
      const st = deckStats(d.cartes, states, now);
      return h('section', { class: 'carte' },
        h('h2', null, d.titre),
        h('p', null, d.description),
        h('p', { class: 'stats' },
          h('span', null, `${st.total} cartes`), ' · ',
          h('span', null, `${st.apprises} vues`), ' · ',
          h('span', null, `${st.dues} dues`), ' · ',
          h('span', null, `${st.mures} mûres (≥ 21 j)`)),
        h('div', { class: 'barre', 'aria-hidden': 'true' },
          h('div', { style: `width:${st.total ? Math.round(100 * st.apprises / st.total) : 0}%` })));
    })),
  );
}

export async function renderRevision({ view, store, decks }) {
  const cards = decks.flatMap((d) => d.cartes);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const states = await store.states();
  const t0 = Date.now();
  const queue = buildQueue(cards, states, t0, { newLimit: NEW_PER_DAY, newToday: countNewToday(states, t0) });
  const total = queue.length;
  const stats = { notes: 0, bien: 0 };
  let shown = false;
  let busy = false;

  if (!total) {
    view.append(h('h1', null, 'Cartes'), h('p', { class: 'chapo' }, 'Rien à réviser.'),
      h('a', { class: 'bouton', href: '#/' }, 'Retour à Aujourd\'hui'));
    return;
  }

  const zone = h('div', { class: 'revision' });
  view.append(zone);

  async function finish() {
    await store.patchDay(dayKey(Date.now()), { done: { cartes: true } });
    fill(zone, 
      h('h1', null, 'Cartes terminées'),
      h('p', { class: 'chapo' }, `${plural(stats.notes, 'note', 'notes')} · ${stats.notes ? Math.round(100 * stats.bien / stats.notes) : 0} % « Bien » ou mieux.`),
      h('a', { class: 'bouton principal', href: '#/' }, 'Retour à Aujourd\'hui'));
  }

  function draw() {
    if (!queue.length) { finish(); return; }
    const card = queue[0];
    const state = states.get(card.id) ?? newState(card.id);
    const now = Date.now();
    const verso = h('div', { class: 'verso' },
      card.verso.split('\n').map((p) => h('p', null, p)),
      h('details', { class: 'sources' },
        h('summary', null, 'Sources'),
        h('ul', null, card.sources.map((s) => h('li', null, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.titre)))),
        h('p', { class: 'petit' }, `Revu le ${card.revu}${card.perissable ? ' · fait périssable, à recontrôler' : ''}.`)));

    const flagBtn = h('button', { class: 'lien', onclick: async (e) => {
      await store.addFlag(card.id);
      e.target.textContent = 'Signalée';
      e.target.disabled = true;
    } }, 'Signaler une erreur');

    fill(zone, 
      h('div', { class: 'entete-rev' },
        h('span', null, `${plural(queue.length, 'carte restante', 'cartes restantes')}`),
        h('a', { class: 'lien', href: '#/' }, 'Arrêter')),
      h('div', { class: 'barre', 'aria-hidden': 'true' },
        h('div', { style: `width:${Math.round(100 * (total - queue.length) / total)}%` })),
      h('article', { class: 'face' },
        h('p', { class: 'etiquette' }, card.deckTitre),
        h('p', { class: 'recto' }, card.recto),
        shown ? verso : null),
      shown
        ? h('div', { class: 'notes', role: 'group', 'aria-label': 'Ta note' },
          GRADE_LABELS.map((label, g) => h('button', { class: `note n${g}`, onclick: () => grade(g) },
            h('span', null, label),
            h('small', null, formatDelay(now, schedule(state, g, now).due)),
            h('kbd', null, String(g + 1)))))
        : h('button', { class: 'bouton principal large', onclick: reveal }, 'Afficher la réponse ', h('kbd', null, 'Espace')),
      shown ? h('p', { class: 'petit droite' }, flagBtn) : null);
  }

  function reveal() { shown = true; draw(); }

  async function grade(g) {
    if (busy || !shown) return;
    busy = true;
    const card = queue.shift();
    const next = await store.review(card.id, g, Date.now());
    states.set(card.id, next);
    stats.notes++;
    if (g >= GRADES.BIEN) stats.bien++;
    if (g === GRADES.ENCORE) queue.push(card);
    shown = false;
    busy = false;
    draw();
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !queue.length) return;
    if (!shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); }
    else if (shown && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); grade(Number(e.key) - 1); }
  }
  document.addEventListener('keydown', onKey);
  draw();
  return () => document.removeEventListener('keydown', onKey);
}
