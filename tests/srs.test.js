import { test, eq, ok } from './runner.js';
import { GRADES as G, newState, schedule, replay, buildQueue, deckStats, countNewToday,
  addDays, startOfDay, dayKey, formatDelay } from '../site/js/srs.js';

const T0 = new Date(2026, 9, 12, 9, 30).getTime(); // 12 oct. 2026, 9 h 30 (heure locale)
const day = (n) => addDays(T0, n);

test('carte neuve notée Bien : revue demain à minuit', () => {
  const s = schedule(newState('a'), G.BIEN, T0);
  eq([s.reps, s.interval, s.due, s.firstSeen], [1, 1, day(1), T0]);
});

test('carte neuve notée Facile : 3 jours ; Difficile : 1 jour', () => {
  eq(schedule(newState('a'), G.FACILE, T0).interval, 3);
  eq(schedule(newState('a'), G.DIFFICILE, T0).interval, 1);
});

test('progression Bien, Bien, Bien : 1, 3, 8, 20 jours', () => {
  let s = newState('a');
  const got = [];
  for (let i = 0; i < 4; i++) { s = schedule(s, G.BIEN, s.due || T0); got.push(s.interval); }
  eq(got, [1, 3, 8, 20]);
});

test('Encore : réinitialise, +1 échec, facilité réduite, revue dans 10 minutes', () => {
  let s = schedule(schedule(newState('a'), G.BIEN, T0), G.BIEN, day(1));
  const e0 = s.ease;
  s = schedule(s, G.ENCORE, day(3));
  eq([s.reps, s.interval, s.lapses], [0, 0, 1]);
  ok(s.ease < e0, 'facilité non réduite');
  eq(s.due, day(3) + 10 * 60000);
});

test('Encore sur carte neuve : pas d\'échec compté', () => {
  const s = schedule(newState('a'), G.ENCORE, T0);
  eq([s.lapses, s.ease], [0, 2.5]);
});

test('facilité jamais sous 1,3', () => {
  let s = schedule(newState('a'), G.BIEN, T0);
  for (let i = 0; i < 20; i++) s = schedule(s, G.ENCORE, T0 + i);
  ok(s.ease >= 1.3, `ease ${s.ease}`);
});

test('l\'intervalle augmente toujours après une note autre que Encore', () => {
  let s = newState('a');
  for (const g of [G.BIEN, G.BIEN, G.DIFFICILE, G.DIFFICILE, G.DIFFICILE]) {
    const prev = s.interval;
    s = schedule(s, g, s.due || T0);
    ok(s.interval >= prev, `${s.interval} < ${prev}`);
  }
});

test('schedule ne modifie pas l\'état d\'entrée', () => {
  const s = newState('a');
  const copy = JSON.stringify(s);
  schedule(s, G.FACILE, T0);
  eq(JSON.stringify(s), copy);
});

test('replay du journal = application directe des notes', () => {
  const journal = [
    { cardId: 'a', ts: T0, grade: G.BIEN }, { cardId: 'b', ts: T0 + 1, grade: G.ENCORE },
    { cardId: 'a', ts: day(1), grade: G.FACILE }, { cardId: 'b', ts: day(1) + 5, grade: G.BIEN },
  ];
  let a = schedule(schedule(newState('a'), G.BIEN, T0), G.FACILE, day(1));
  const m = replay([...journal].reverse()); // l'ordre d'entrée n'importe pas
  eq(m.get('a'), a);
  eq(m.get('b').reps, 1);
});

test('addDays : minuit local même à travers le passage à l\'heure d\'hiver', () => {
  const avant = new Date(2026, 9, 24, 15).getTime(); // changement d'heure le 25 octobre 2026
  for (let n = 1; n <= 3; n++) {
    const d = new Date(addDays(avant, n));
    eq([d.getHours(), d.getMinutes()], [0, 0]);
  }
});

test('dayKey et startOfDay', () => {
  eq(dayKey(T0), '2026-10-12');
  eq(startOfDay(T0), new Date(2026, 9, 12).getTime());
});

const cards = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => ({ id }));

test('file : dues d\'abord (plus en retard en premier), puis nouvelles, futures exclues', () => {
  const states = new Map([
    ['c1', { ...newState('c1'), due: day(0), firstSeen: day(-5) }],
    ['c2', { ...newState('c2'), due: day(-3), firstSeen: day(-9) }],
    ['c3', { ...newState('c3'), due: day(2), firstSeen: day(-2) }],
  ]);
  eq(buildQueue(cards, states, T0, { newLimit: 10 }).map((c) => c.id), ['c2', 'c1', 'c4', 'c5']);
});

test('file : quota de nouvelles cartes du jour', () => {
  eq(buildQueue(cards, new Map(), T0, { newLimit: 2 }).length, 2);
  eq(buildQueue(cards, new Map(), T0, { newLimit: 2, newToday: 2 }).length, 0);
  eq(buildQueue(cards, new Map(), T0, { newLimit: 2, newToday: 5 }).length, 0);
});

test('file : une carte ratée (revue dans 10 min) reste due aujourd\'hui', () => {
  const states = new Map([['c1', schedule(newState('c1'), G.ENCORE, T0)]]);
  eq(buildQueue([cards[0]], states, T0 + 60000).map((c) => c.id), ['c1']);
});

test('countNewToday compte les premières vues du jour seulement', () => {
  const states = new Map([
    ['a', { ...newState('a'), firstSeen: T0 }], ['b', { ...newState('b'), firstSeen: day(-1) }]]);
  eq(countNewToday(states, T0 + 1000), 1);
});

test('deckStats', () => {
  const states = new Map([
    ['c1', { ...newState('c1'), due: day(-1), interval: 30, firstSeen: 1 }],
    ['c2', { ...newState('c2'), due: day(4), interval: 4, firstSeen: 1 }]]);
  eq(deckStats(cards, states, T0), { total: 5, nouvelles: 3, dues: 1, apprises: 2, mures: 1 });
});

test('formatDelay', () => {
  eq(formatDelay(T0, T0 + 10 * 60000), '10 min');
  eq(formatDelay(T0, day(1)), '1 j');
  eq(formatDelay(T0, day(8)), '8 j');
  eq(formatDelay(T0, day(30)), '4 sem.');
  eq(formatDelay(T0, day(90)), '3 mois');
});
