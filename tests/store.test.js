import { test, eq, ok, rejects } from './runner.js';
import { openStore } from '../site/js/store.js';
import { replay } from '../site/js/srs.js';

const T = new Date(2026, 9, 12, 9, 0).getTime();
let compteur = 0;

async function avecBase(fn) {
  const s = await openStore(`test-${Date.now()}-${compteur++}`);
  try { await fn(s); } finally { await s.destroy(); }
}

test('review écrit l\'état et le journal ensemble ; replay concorde', () => avecBase(async (s) => {
  await s.review('a', 2, T);
  await s.review('a', 2, T + 86400000);
  await s.review('b', 0, T + 5);
  const states = await s.states();
  eq(states.size, 2);
  eq(await s.journalCount(), 3);
  eq(replay(await s.journal()).get('a'), states.get('a'));
  eq(replay(await s.journal()).get('b'), states.get('b'));
}));

test('meta : lecture avec valeur par défaut, écriture', () => avecBase(async (s) => {
  eq(await s.getMeta('x', 42), 42);
  await s.setMeta('x', { a: 1 });
  eq(await s.getMeta('x'), { a: 1 });
}));

test('patchDay fusionne les blocs faits', () => avecBase(async (s) => {
  await s.patchDay('2026-10-12', { done: { cartes: true } });
  const r = await s.patchDay('2026-10-12', { done: { profond: true }, finished: true });
  eq(r.done, { cartes: true, profond: true });
  eq(r.finished, true);
}));

test('export puis import dans une base vide reproduit les états', () => avecBase(async (a) => {
  await a.review('a', 3, T); await a.review('b', 1, T + 1); await a.review('a', 2, T + 86400000);
  await a.patchDay('2026-10-12', { done: { cartes: true }, finished: true });
  await a.addFlag('b', T);
  await a.setMeta('_dossier', 'ne doit pas sortir');
  const data = JSON.parse(JSON.stringify(await a.exportAll()));
  ok(!('_dossier' in data.meta), 'clé privée exportée');

  await avecBase(async (b) => {
    const r = await b.importMerge(data);
    eq(r.ajoutees, 3);
    eq(await b.states(), await a.states());
    eq((await b.getDay('2026-10-12')).finished, true);
    eq(await b.getMeta('flags'), [{ cardId: 'b', ts: T }]);
  });
}));

test('importer deux fois ne crée aucun doublon', () => avecBase(async (a) => {
  await a.review('a', 2, T);
  const data = JSON.parse(JSON.stringify(await a.exportAll()));
  const r = await a.importMerge(data);
  eq(r.ajoutees, 0);
  eq(await a.journalCount(), 1);
}));

test('importer fusionne avec des révisions locales différentes', () => avecBase(async (a) => {
  await a.review('a', 2, T);
  await avecBase(async (b) => {
    await b.review('a', 2, T + 86400000);
    await b.review('c', 3, T + 10);
    await a.importMerge(JSON.parse(JSON.stringify(await b.exportAll())));
    eq(await a.journalCount(), 3);
    eq((await a.states()).get('a').reps, 2);
  });
}));

test('import refuse un fichier étranger ou mal formé', () => avecBase(async (s) => {
  await rejects(s.importMerge({ format: 'autre', journal: [] }));
  await rejects(s.importMerge(null));
  await rejects(s.importMerge({ format: 'upgrade-sauvegarde' }));
}));

test('import ignore les lignes de journal invalides', () => avecBase(async (s) => {
  const r = await s.importMerge({ format: 'upgrade-sauvegarde', version: 1, journal: [
    { cardId: 'a', ts: T, grade: 2 }, { cardId: 'b', ts: 'x', grade: 2 }, { cardId: 'c', ts: T, grade: 9 }, null] });
  eq(r.ajoutees, 1);
}));
