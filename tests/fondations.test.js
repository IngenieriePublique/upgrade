// Logique du curriculum : statuts, kit du jour, cartes des kits ouverts ; cohérence des données publiées.
import { test, eq, ok } from './runner.js';
import { statutKit, prochainKit, resumeParcours, ajouterCartesKit, notesParKit, ID_NOTE } from '../site/js/fondations.js';

const index = {
  parcours: [
    { id: 'A', titre: 'Institutions', description: 'd', jours: [1] },
    { id: 'B', titre: 'Finances', description: 'd', jours: [1] },
    { id: 'C', titre: 'Évaluation', description: 'd', jours: [3] },
  ],
  kits: [
    { id: 'a01-x', parcours: 'A', ordre: 1, titre: 'A1' }, { id: 'a02-x', parcours: 'A', ordre: 2, titre: 'A2' },
    { id: 'b01-x', parcours: 'B', ordre: 1, titre: 'B1' }, { id: 'b02-x', parcours: 'B', ordre: 2, titre: 'B2' },
    { id: 'c01-x', parcours: 'C', ordre: 1, titre: 'C1' },
  ],
};
const note = (id, data) => ({ id: ID_NOTE(id), kind: 'kit', data, updatedAt: 1 });

test('statut d\'un kit : à faire, en cours, terminé (une saisie de débat seule ne le démarre pas)', () => {
  eq([statutKit(null), statutKit({ data: {} }), statutKit({ data: { debat: ['x'] } })], ['a-faire', 'a-faire', 'a-faire']);
  eq([statutKit({ data: { startedAt: 1 } }), statutKit({ data: { startedAt: 1, doneAt: 2 } }), statutKit({ data: { startedAt: 1, doneAt: null } })], ['en-cours', 'termine', 'en-cours']);
});

test('kit du jour : le lundi, le parcours qui a le moins de kits terminés (A en cas d\'égalité)', () => {
  eq(prochainKit(index, [], 1).id, 'a01-x');
  const notes = [note('a01-x', { startedAt: 1, doneAt: 2 })];
  eq(prochainKit(index, notes, 1).id, 'b01-x', 'A a un kit terminé, B aucun');
  eq(prochainKit(index, [...notes, note('b01-x', { startedAt: 1, doneAt: 2 })], 1).id, 'a02-x', 'égalité : A');
});

test('kit du jour : un kit en cours passe avant un nouveau ; jour sans kit : null ; parcours épuisé : null', () => {
  eq(prochainKit(index, [note('b01-x', { startedAt: 1 })], 1).id, 'b01-x');
  eq(prochainKit(index, [], 2), null);
  eq(prochainKit(index, [note('c01-x', { startedAt: 1, doneAt: 2 })], 3), null);
  eq(prochainKit(index, [], 3).id, 'c01-x');
});

test('notes : seules les notes « kit: » non supprimées comptent', () => {
  const m = notesParKit([note('a01-x', {}), { id: 'pitch:p90', data: {} }, { ...note('a02-x', {}), deleted: true }]);
  eq([...m.keys()], ['a01-x']);
});

test('résumé des parcours : totaux, terminés, en cours', () => {
  const r = resumeParcours(index, [note('a01-x', { startedAt: 1, doneAt: 2 }), note('a02-x', { startedAt: 1 })]);
  eq([r[0].total, r[0].termines, r[0].encours, r[1].termines], [2, 1, 1, 0]);
});

test('ajouter les cartes d\'un kit : un paquet par parcours, sans doublon', () => {
  const decks = [];
  const kit = { parcours: 'A', cartes: [{ id: 'a01-x-01' }, { id: 'a01-x-02' }] };
  ajouterCartesKit(decks, index.parcours[0], kit);
  ajouterCartesKit(decks, index.parcours[0], kit);
  eq(decks.length, 1);
  eq([decks[0].id, decks[0].cartes.length, decks[0].cartes[0].deck], ['fondations-a', 2, 'fondations-a']);
  ajouterCartesKit(decks, index.parcours[0], { parcours: 'A', cartes: [{ id: 'a02-x-01' }] });
  eq(decks[0].cartes.length, 3);
});

test('données publiées : chaque kit de l\'index existe, a ≥ 2 sources, 3 questions, des cartes héritant des sources', async () => {
  const idx = await (await fetch('../site/data/fondations/index.json')).json();
  ok(idx.kits.length > 0, 'aucun kit');
  const ids = new Set();
  for (const meta of idx.kits) {
    const k = await (await fetch(`../site/data/fondations/${meta.fichier}`)).json();
    eq(k.id, meta.id);
    ok(new Set(k.sources.map((s) => s.url)).size >= 2, `sources de ${k.id}`);
    eq(k.debat.length, 3);
    eq(k.cartes.length, meta.nombre_cartes);
    for (const c of k.cartes) {
      ok(!ids.has(c.id), `doublon ${c.id}`);
      ids.add(c.id);
      ok(c.id.startsWith(`${k.id}-`) && c.recto && c.verso && c.sources.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(c.revu), c.id);
    }
  }
});
