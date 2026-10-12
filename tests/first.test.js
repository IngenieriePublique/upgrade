import { test, eq, ok } from './runner.js';
import { mulberry32 } from '../site/js/territoires.js';
import { fileDeSerie as fileTerritoires } from '../site/first/js/territoires.js';
import { fileDeSerie as fileCartes } from '../site/first/js/cartes.js';
import { lectureDuJour, lectureAutre } from '../site/first/js/lecture.js';
import { ilYa } from '../site/first/js/brief.js';
import { pointsHexagone } from '../site/first/js/cadre.js';

const T0 = new Date(2026, 9, 12, 9, 30).getTime();
const finDeJournee = new Date(2026, 9, 12, 24, 0, 0, 0).getTime();

test('territoires : dus d\'abord, puis nouveaux ; taille limitée', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'].map((x) => ({ id: `terr-${x}` }));
  const states = new Map([['terr-c', { due: T0 - 1000 }], ['terr-d', { due: finDeJournee + 1000 }]]);
  const file = fileTerritoires(pool, states, T0, 3, mulberry32(1));
  eq(file.length, 3);
  eq(file[0].id, 'terr-c');
  ok(!file.some((i) => i.id === 'terr-d'), 'un élément non dû ne doit pas figurer');
});

test('territoires : rien à voir quand tout est à jour', () => {
  const pool = [{ id: 'x' }];
  eq(fileTerritoires(pool, new Map([['x', { due: finDeJournee + 5 }]]), T0).length, 0);
});

test('cartes : même règle (dues puis nouvelles)', () => {
  const cartes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const file = fileCartes(cartes, new Map([['b', { due: T0 }]]), T0, 2, mulberry32(7));
  eq(file.length, 2);
  eq(file[0].id, 'b');
});

const L = (id, type = 'article') => ({ id, type });

test('lecture du jour : stable pour un jour donné, sans presse tant qu\'il reste des articles', () => {
  const pool = [L('p1', 'presse'), L('a1'), L('a2'), L('r1', 'rapport')];
  const a = lectureDuJour(pool, new Set(), '2026-10-12');
  eq(lectureDuJour(pool, new Set(), '2026-10-12').id, a.id);
  ok(a.type !== 'presse');
});

test('lecture du jour : évite les lectures déjà lues', () => {
  const pool = [L('a1'), L('a2'), L('a3')];
  for (const jour of ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']) {
    ok(lectureDuJour(pool, new Set(['a1', 'a2']), jour).id === 'a3', jour);
  }
});

test('lecture du jour : tout lu, on reprend dans l\'ensemble', () => {
  const pool = [L('a1'), L('a2')];
  ok(['a1', 'a2'].includes(lectureDuJour(pool, new Set(['a1', 'a2']), '2026-10-12').id));
});

test('une autre lecture : jamais la même, de préférence non lue', () => {
  const pool = [L('a1'), L('a2'), L('a3')];
  for (let s = 1; s < 20; s++) eq(lectureAutre(pool, new Set(['a2']), 'a1', mulberry32(s)).id, 'a3');
  eq(lectureAutre([L('seule')], new Set(), 'seule'), null);
});

test('« il y a » du Brief', () => {
  const now = Date.parse('2026-10-12T12:00:00Z');
  eq(ilYa('2026-10-12T11:30:00Z', now), 'il y a moins d\'une heure');
  eq(ilYa('2026-10-12T07:00:00Z', now), 'il y a 5 h');
  eq(ilYa('2026-10-10T12:00:00Z', now), 'il y a 2 j');
});

test('hexagone : six sommets', () => {
  eq(pointsHexagone(10).split(' ').length, 6);
});
