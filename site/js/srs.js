// Répétition espacée : variante SM-2 à 4 notes. Fonctions pures, sans accès au navigateur.
// L'état d'une carte se déduit toujours du journal des révisions (replay) : on peut changer d'algorithme plus tard.

export const GRADES = { ENCORE: 0, DIFFICILE: 1, BIEN: 2, FACILE: 3 };
export const GRADE_LABELS = ['Encore', 'Difficile', 'Bien', 'Facile'];

const START_EASE = 2.5;
const MIN_EASE = 1.3;
const RELEARN_MS = 10 * 60 * 1000;
const MATURE_DAYS = 21;

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Minuit local, n jours plus tard (insensible aux changements d'heure).
export function addDays(ts, n) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function dayKey(ts) {
  const d = new Date(ts);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function newState(id) {
  return { id, reps: 0, lapses: 0, interval: 0, ease: START_EASE, due: 0, firstSeen: null, last: null };
}

// Nouvel état après une note. `state` n'est pas modifié.
export function schedule(state, grade, now) {
  const s = { ...state };
  s.firstSeen = state.firstSeen ?? now;
  s.last = now;

  if (grade === GRADES.ENCORE) {
    if (state.reps > 0) {
      s.lapses = state.lapses + 1;
      s.ease = Math.max(MIN_EASE, state.ease - 0.2);
    }
    s.reps = 0;
    s.interval = 0;
    s.due = now + RELEARN_MS;
    return s;
  }

  let interval;
  if (state.reps === 0) {
    interval = [0, 1, 1, 3][grade];
  } else if (state.reps === 1) {
    interval = [0, 2, 3, 6][grade];
  } else {
    const mult = [0, 1.2, state.ease, state.ease * 1.3][grade];
    interval = Math.max(state.interval + 1, Math.round(state.interval * mult));
  }
  if (grade === GRADES.DIFFICILE) s.ease = Math.max(MIN_EASE, state.ease - 0.15);
  if (grade === GRADES.FACILE) s.ease = state.ease + 0.15;
  s.reps = state.reps + 1;
  s.interval = interval;
  s.due = addDays(now, interval);
  return s;
}

// Reconstruit tous les états depuis le journal [{cardId, ts, grade, n?}].
export function replay(journal) {
  const sorted = [...journal].sort((a, b) => a.ts - b.ts || (a.n ?? 0) - (b.n ?? 0));
  const states = new Map();
  for (const e of sorted) {
    const cur = states.get(e.cardId) ?? newState(e.cardId);
    states.set(e.cardId, schedule(cur, e.grade, e.ts));
  }
  return states;
}

export function countNewToday(states, now) {
  const t0 = startOfDay(now);
  let n = 0;
  for (const s of states.values()) if (s.firstSeen != null && s.firstSeen >= t0) n++;
  return n;
}

// File de la séance : cartes dues (les plus en retard d'abord), puis nouvelles cartes dans la limite du jour.
export function buildQueue(cards, states, now, { newLimit = 10, newToday = 0, reviewLimit = 200 } = {}) {
  const endOfToday = addDays(now, 1);
  const due = [];
  const fresh = [];
  for (const c of cards) {
    const s = states.get(c.id);
    if (!s) fresh.push(c);
    else if (s.due < endOfToday) due.push({ c, due: s.due });
  }
  due.sort((a, b) => a.due - b.due);
  const room = Math.max(0, newLimit - newToday);
  return [...due.slice(0, reviewLimit).map((x) => x.c), ...fresh.slice(0, room)];
}

export function deckStats(cards, states, now) {
  const endOfToday = addDays(now, 1);
  const st = { total: cards.length, nouvelles: 0, dues: 0, apprises: 0, mures: 0 };
  for (const c of cards) {
    const s = states.get(c.id);
    if (!s) { st.nouvelles++; continue; }
    st.apprises++;
    if (s.due < endOfToday) st.dues++;
    if (s.interval >= MATURE_DAYS) st.mures++;
  }
  return st;
}

// « 10 min », « 1 j », « 3 sem. », « 2 mois »… pour l'affichage sous les boutons de note.
export function formatDelay(fromTs, dueTs) {
  const ms = dueTs - fromTs;
  if (ms < 60 * 60 * 1000) return `${Math.max(1, Math.round(ms / 60000))} min`;
  const days = Math.max(1, Math.round((dueTs - startOfDay(fromTs)) / 86400000));
  if (days < 14) return `${days} j`;
  if (days < 60) return `${Math.round(days / 7)} sem.`;
  if (days < 365) return `${Math.round(days / 30)} mois`;
  return `${(days / 365).toFixed(1).replace('.', ',')} an`;
}
