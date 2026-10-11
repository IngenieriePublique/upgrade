// Tests du jeu Territoires : éléments, questions (toutes générées), notes, file du jour, maîtrise, plus ou moins.
import { test, eq, ok } from './runner.js';
import { GRADES as G, schedule, newState, addDays } from '../site/js/srs.js';
import {
  creerItems, creerQuestion, noterReponse, memeEnsemble, fileDuJour, nouveauxAujourdhui, maitrise, resumeMaitrise,
  paire, indices, reponseJuste, norm, mulberry32, indexer, MODES, CRITERES, ORDRE_REGIONS,
} from '../site/js/territoires.js';

const data = await (await fetch('../site/data/territoires/data.json')).json();
const geo = await (await fetch('../site/data/geo/france.json')).json();
const T0 = new Date(2026, 9, 12, 9, 0).getTime();

test('données : 101 départements, 18 régions, 22 anciennes régions, 2 sources ou plus partout', () => {
  eq([data.departements.length, data.regions.length, data.anciennes.length], [101, 18, 22]);
  for (const t of [...data.departements, ...data.regions, ...data.anciennes]) {
    ok(t.sources.length >= 2 && t.sources.every((s) => /^https:\/\//.test(s.url) && s.titre), `sources de ${t.nom}`);
    ok(/^\d{4}-\d{2}-\d{2}$/.test(t.revu), `date de revue de ${t.nom}`);
  }
});

test('tracés : chaque territoire a un chemin SVG, les 5 encarts d\'outre-mer existent', () => {
  eq(Object.keys(geo.departements).length, 101);
  eq(Object.keys(geo.regions).length, 18);
  eq(Object.keys(geo.anciennes).length, 22);
  eq(geo.cadres.map((c) => c.code), ['971', '972', '973', '974', '976']);
  for (const t of Object.values(geo.departements)) ok(/^M[\d. -]+L/.test(t.d), 'chemin mal formé');
});

test('faits connus : Gironde, Paris, Corse-du-Sud, Val-d\'Oise, Lyon', () => {
  const { dep, reg } = indexer(data);
  const g = dep.get('33');
  eq([g.nom, g.prefecture, g.region, g.voisins], ['Gironde', 'Bordeaux', '75', ['17', '24', '40', '47']]);
  eq(dep.get('75').voisins, ['92', '93', '94']);
  eq(dep.get('2A').voisins, ['2B']);
  eq(dep.get('95').prefecture, 'Cergy');
  eq(dep.get('69').prefecture, 'Lyon');
  eq(reg.get('75').prefecture, 'Bordeaux');
  eq(reg.get('93').prefecture, 'Marseille');
});

test('anciennes régions : Aquitaine, Picardie et Alsace → bonnes régions actuelles', () => {
  const a = Object.fromEntries(data.anciennes.map((x) => [x.nom, x.region_actuelle]));
  eq([a['Aquitaine'], a['Picardie'], a['Alsace'], a['Auvergne'], a['Bretagne']], ['75', '32', '44', '84', '53']);
});

test('items : un identifiant unique par élément, ordre de départ = régions de Nouvelle-Aquitaine puis les autres', () => {
  const items = creerItems(data);
  eq(new Set(items.map((i) => i.id)).size, items.length);
  eq(items[0].id, 'terr-placer-reg-75');
  eq(items.filter((i) => i.mode === 'placer-reg').length, 18);
  eq(items.filter((i) => i.mode === 'placer-dep').length, 96); // pas de doublon pour l'outre-mer
  eq(items.filter((i) => i.mode === 'num-nom').length, 101);
  ok(items.every((i) => MODES[i.mode]), 'mode inconnu');
  // les départements de la région 75 (Nouvelle-Aquitaine) sont proposés avant ceux d'Occitanie (76)
  const rang = (id) => items.findIndex((i) => i.id === id);
  ok(rang('terr-placer-dep-33') < rang('terr-placer-dep-31'), 'ordre des régions');
  eq(ORDRE_REGIONS.length, 18);
});

test('questions : tous les éléments produisent une question valide (bonne réponse présente, choix distincts)', () => {
  const rng = mulberry32(42);
  for (const item of creerItems(data)) {
    const q = creerQuestion(item, data, rng);
    ok(q.consigne && q.explication, `texte vide : ${item.id}`);
    if (q.type === 'qcm') {
      eq(q.choix.length, 4, `4 choix : ${item.id}`);
      eq(new Set(q.choix.map((c) => c.libelle)).size, 4, `libellés distincts : ${item.id}`);
      eq(new Set(q.choix.map((c) => c.valeur)).size, 4, `valeurs distinctes : ${item.id}`);
      ok(q.choix.some((c) => c.valeur === q.bonne), `bonne réponse absente : ${item.id}`);
    } else if (q.type === 'clic') {
      ok(geo[q.couche][q.cible], `cible inconnue : ${item.id}`);
    } else if (q.type === 'multi') {
      ok(q.cibles.length > 0 && q.cibles.every((c) => geo[q.couche][c]), `cibles : ${item.id}`);
    } else throw new Error(`type inconnu : ${item.id}`);
  }
});

test('questions : la préfecture du Val-d\'Oise est Cergy, et les distracteurs ne répètent pas la bonne réponse', () => {
  const q = creerQuestion({ id: 'x', mode: 'pref-dep', code: '95' }, data, mulberry32(1));
  eq(q.bonne, 'Cergy');
  eq(q.choix.filter((c) => c.libelle === 'Cergy').length, 1);
});

test('notes : faux → Encore ; juste rapide → Facile ; moyen → Bien ; lent → Difficile', () => {
  eq([noterReponse(false, 1000), noterReponse(true, 2500), noterReponse(true, 8000), noterReponse(true, 20000)], [G.ENCORE, G.FACILE, G.BIEN, G.DIFFICILE]);
});

test('ensembles : l\'ordre ne compte pas, un oubli ou un excès est faux', () => {
  ok(memeEnsemble(['a', 'b'], new Set(['b', 'a'])));
  ok(!memeEnsemble(['a'], ['a', 'b']));
  ok(!memeEnsemble(['a', 'c'], ['a', 'b']));
});

test('file du jour : dus d\'abord, puis nouveaux dans la limite du jour, 10 questions au plus', () => {
  const items = creerItems(data);
  const states = new Map();
  // 3 éléments dus (le plus en retard en premier), 1 non dû
  const due = (id, jours) => states.set(id, { ...newState(id), reps: 1, interval: 3, due: addDays(T0, jours), firstSeen: addDays(T0, -5) });
  due(items[5].id, 0); due(items[2].id, -3); due(items[9].id, 0); due(items[7].id, 4);
  const file = fileDuJour(items, states, T0, { dejaNouveauxAujourdhui: 0 });
  eq(file.length, 9, '3 dus + 6 nouveaux');
  eq(file[0].id, items[2].id, 'le plus en retard d\'abord');
  ok(!file.some((i) => i.id === items[7].id), 'élément non dû proposé');
  eq(file.filter((i) => !states.has(i.id)).length, 6, '6 nouveaux par jour');
  eq(fileDuJour(items, states, T0, { dejaNouveauxAujourdhui: 6 }).length, 3);
});

test('nouveaux aujourd\'hui : seuls les éléments vus pour la première fois ce jour comptent', () => {
  const items = creerItems(data);
  const states = new Map([[items[0].id, schedule(newState(items[0].id), G.BIEN, T0)], [items[1].id, schedule(newState(items[1].id), G.BIEN, addDays(T0, -2))]]);
  eq(nouveauxAujourdhui(items, states, T0), 1);
});

test('maîtrise : niveaux 0 à 3 selon l\'intervalle de tous les éléments du territoire', () => {
  const items = creerItems(data);
  const states = new Map();
  const mets = (mode, code, interval, reps = 2) => states.set(`terr-${mode}-${code}`, { ...newState('x'), reps, interval });
  const tousDep = (code, interval) => items.filter((i) => i.code === code && !['placer-reg', 'chef-reg', 'ancienne'].includes(i.mode)).forEach((i) => states.set(i.id, { ...newState(i.id), reps: 2, interval }));
  tousDep('33', 25); tousDep('31', 8); mets('placer-dep', '40', 1, 1);
  const m = maitrise(items, states);
  eq([m.departements.get('33').niveau, m.departements.get('31').niveau, m.departements.get('40').niveau, m.departements.get('64').niveau], [3, 2, 1, 0]);
  mets('placer-reg', '75', 30); mets('chef-reg', '75', 30);
  eq(maitrise(items, states).regions.get('75').niveau, 3);
  const r = resumeMaitrise(m);
  eq(r.departements.reduce((a, b) => a + b, 0), 101);
});

test('plus ou moins : la bonne réponse correspond aux valeurs, rapport ≥ 1,15, Rhône exclu de la superficie', () => {
  const rng = mulberry32(7);
  for (const critere of Object.keys(CRITERES)) {
    for (const niveau of ['departements', 'regions']) {
      for (let i = 0; i < 40; i++) {
        const p = paire(data, critere, rng, niveau);
        ok(Math.max(p.va, p.vb) / Math.min(p.va, p.vb) >= 1.15, 'écart trop faible');
        eq(p.bonne, p.va > p.vb ? 'a' : 'b');
        if (critere !== 'population') ok(!(p.a.code === '69' && niveau === 'departements') && !(p.b.code === '69' && niveau === 'departements'), 'Rhône dans une comparaison de surface');
      }
    }
  }
});

test('qui suis-je : les indices ne contiennent pas le nom, la réponse accepte nom (sans accents) et numéro', () => {
  const d = data.departements.find((x) => x.code === '33');
  const liste = indices(d, data);
  ok(liste.length >= 5);
  ok(!liste.some((t) => t.includes('Gironde')), 'nom non masqué');
  ok(reponseJuste('gironde', d) && reponseJuste('33', d) && !reponseJuste('Landes', d));
  ok(reponseJuste('Val d\'Oise', data.departements.find((x) => x.code === '95')) && reponseJuste('Val-d’Oise', data.departements.find((x) => x.code === '95')));
  eq(norm('Côte-d\'Or'), 'cote d or');
});
