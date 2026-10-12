// Logique des dictées : alinéas, essais, statistiques, niveau conseillé, choix de la dictée suivante, cartes de règles.
import { test, eq, ok } from './runner.js';
import { alineas, essaisDepuisNotes, fautesPour100, fautesParCategorie, bilan, niveauConseille, choisirProchaine,
  categoriesAActiver, categoriesActives, ajouterRegles, resumeEssai, ID_ESSAI, DECK_REGLES, texteParle } from '../site/js/dictee.js';

const CATS = ['pp', 'homophone', 'sujet-verbe', 'gn', 'conjugaison', 'lexicale', 'ponctuation'];
const profil = (o) => ({ pp: 0, homophone: 0, 'sujet-verbe': 0, gn: 0, conjugaison: 0, lexicale: 0, ponctuation: 0, ...o });
const dictees = [
  { id: 'd01', niveau: 1, profil: profil({ homophone: 10 }) },
  { id: 'd02', niveau: 1, profil: profil({ pp: 10 }) },
  { id: 'd03', niveau: 2, profil: profil({ pp: 5, homophone: 5 }) },
  { id: 'd04', niveau: 3, profil: profil({ pp: 2 }) },
];
const essai = (dicteeId, ts, nbFautes, cat = 'pp', mots = 100) => ({
  dicteeId, ts, mots, fautes: Array.from({ length: nbFautes }, (_, i) => ({ i, cat })),
});

test('alinéas : les index suivent texte.split(/\\s+/) et traversent les alinéas', () => {
  const texte = 'Un deux trois.\n\nQuatre —  cinq.';
  const a = alineas(texte);
  eq(a.length, 2);
  eq(a.flat().map((m) => m.mot), texte.split(/\s+/));
  eq(a.flat().map((m) => m.i), [0, 1, 2, 3, 4, 5]);
});

test('essais : seules les notes « dictee: » valides comptent, triées par date', () => {
  const n = (id, data, extra = {}) => ({ id, kind: 'dictee', data, updatedAt: 1, ...extra });
  const notes = [
    n(ID_ESSAI('d02', 20), { dicteeId: 'd02', ts: 20, mots: 100, fautes: [] }),
    n(ID_ESSAI('d01', 10), { dicteeId: 'd01', ts: 10, mots: 100, fautes: [{ i: 1, cat: 'pp' }] }),
    n(ID_ESSAI('d03', 30), { dicteeId: 'd03', ts: 30, mots: 100, fautes: [] }, { deleted: true }),
    { id: 'kit:a01', data: { startedAt: 1 } },
    n(ID_ESSAI('d04', 40), { dicteeId: 'd04', ts: 40, mots: 0, fautes: [] }),
  ];
  eq(essaisDepuisNotes(notes).map((e) => e.dicteeId), ['d01', 'd02']);
});

test('fautes pour 100 mots et par catégorie', () => {
  const e = { dicteeId: 'd01', ts: 1, mots: 112, fautes: [{ i: 1, cat: 'pp' }, { i: 5, cat: 'pp' }, { i: 9, cat: 'gn' }] };
  eq(fautesPour100(e), 2.7);
  eq(fautesParCategorie(e, CATS), { pp: 2, homophone: 0, 'sujet-verbe': 0, gn: 1, conjugaison: 0, lexicale: 0, ponctuation: 0 });
  eq(resumeEssai(e), '3 fautes pour 112 mots (2,7 pour 100)');
});

test('bilan : fautes par catégorie, taux global et tendance (négatif = progrès)', () => {
  const es = [essai('d01', 1, 10), essai('d02', 2, 10), essai('d03', 3, 10), essai('d04', 4, 4), essai('d01', 5, 4), essai('d02', 6, 4)];
  const b = bilan(es, CATS);
  eq(b.tendance, -6);
  eq(b.parCategorie.find((c) => c.cat === 'pp').fautes, 42);
  eq(b.tauxGlobal, 7);
  eq(bilan([], CATS).tauxGlobal, null);
  eq(bilan([essai('d01', 1, 3)], CATS).tendance, null, 'pas assez d\'essais');
});

test('niveau conseillé : monte sous 4 fautes/100 mots, descend à 12 et plus, sinon reste', () => {
  eq(niveauConseille([], dictees), 1);
  eq(niveauConseille([essai('d03', 1, 2), essai('d03', 2, 3), essai('d03', 3, 4)], dictees), 3);
  eq(niveauConseille([essai('d03', 1, 5), essai('d03', 2, 7), essai('d03', 3, 8)], dictees), 2);
  eq(niveauConseille([essai('d03', 1, 12), essai('d03', 2, 15), essai('d03', 3, 20)], dictees), 1);
  eq(niveauConseille([essai('d04', 1, 0)], dictees), 4, 'plafonné au niveau 4');
});

test('dictée suivante : on commence au niveau 1, puis on vise les catégories où l\'on se trompe', () => {
  eq(choisirProchaine(dictees, [], CATS).id, 'd01', 'à égalité d\'erreurs, la première');
  const surtoutPP = [essai('d02', 1, 8, 'pp'), essai('d02', 2, 8, 'pp')];
  eq(choisirProchaine(dictees, surtoutPP, CATS).id, 'd01', 'd02 est déjà faite ; niveau 1 restant : d01');
  const homophones = [essai('d03', 1, 8, 'homophone'), essai('d03', 2, 8, 'homophone'), essai('d03', 3, 8, 'homophone')];
  eq(choisirProchaine(dictees, homophones, CATS).id, 'd01', 'niveau 2 conseillé mais d03 faite : on prend le niveau le plus proche restant');
  const dico = [
    { id: 'x1', niveau: 1, profil: profil({ homophone: 10 }) }, { id: 'x2', niveau: 1, profil: profil({ pp: 10 }) },
    { id: 'x0', niveau: 1, profil: profil({}) }];
  eq(choisirProchaine(dico, [essai('x0', 1, 6, 'pp')], CATS).id, 'x2', 'fautes de participe passé → dictée riche en participes');
  eq(choisirProchaine(dico, [essai('x0', 1, 6, 'homophone')], CATS).id, 'x1');
});

test('dictée suivante : tout est fait → la moins récente ; aucune dictée → null', () => {
  const es = [essai('d01', 5, 5), essai('d02', 1, 5), essai('d03', 7, 5), essai('d04', 3, 5)];
  eq(choisirProchaine(dictees, es, CATS).id, 'd02');
  eq(choisirProchaine([], [], CATS), null);
});

test('règles ciblées : catégories avec faute → cartes ajoutées sans doublon au paquet « regles »', () => {
  const e = { dicteeId: 'd01', ts: 1, mots: 100, fautes: [{ i: 1, cat: 'pp' }, { i: 2, cat: 'gn' }, { i: 3, cat: 'pp' }] };
  eq(categoriesAActiver(e, CATS), ['pp', 'gn']);
  const regles = { titre: 'Règles', description: 'd', cartes: [
    { id: 'regles-pp-01', categorie: 'pp', recto: 'q', verso: 'r' }, { id: 'regles-gn-01', categorie: 'gn', recto: 'q', verso: 'r' },
    { id: 'regles-lexicale-01', categorie: 'lexicale', recto: 'q', verso: 'r' }] };
  const decks = [];
  ajouterRegles(decks, regles, new Set(['pp']));
  ajouterRegles(decks, regles, new Set(['pp', 'gn']));
  eq(decks.map((d) => d.id), [DECK_REGLES]);
  eq(decks[0].cartes.map((c) => c.id), ['regles-pp-01', 'regles-gn-01']);
  eq(decks[0].cartes[0].deck, DECK_REGLES);
  eq(ajouterRegles([], regles, new Set()), null);
});

test('catégories actives : notes « regle: » non supprimées', () => {
  const notes = [{ id: 'regle:pp', data: { depuis: 1 } }, { id: 'regle:gn', data: {}, deleted: true }, { id: 'regle:ponctuation', data: { actif: false } }, { id: 'kit:a01', data: {} }];
  eq([...categoriesActives(notes)], ['pp']);
});

test('texte parlé : abréviations développées ; ponctuation dictée seulement si demandée', () => {
  eq(texteParle('M. Seguin dit : « Ah ! »'), 'monsieur Seguin dit : « Ah ! »');
  eq(texteParle('M. Seguin dit : « Ah ! »', { ponctuation: true }), 'monsieur Seguin dit deux-points ouvrez les guillemets Ah point d’exclamation fermez les guillemets');
  eq(texteParle('Il part, enfin.', { ponctuation: true, finAlinea: true }), 'Il part virgule enfin point À la ligne.');
  eq(texteParle('Il part, enfin.', { finAlinea: true }), 'Il part, enfin.');
});

test('données publiées : 40 dictées cohérentes avec les règles', async () => {
  const d = await (await fetch('../site/data/dictees/dictees.json')).json();
  const r = await (await fetch('../site/data/dictees/regles.json')).json();
  eq(d.dictees.length, 40);
  const cats = r.categories.map((c) => c.id);
  eq(cats, CATS);
  for (const x of d.dictees) {
    eq(alineas(x.texte).flat().length, x.texte.split(/\s+/).length, x.id);
    ok(Object.keys(x.profil).every((c) => cats.includes(c)), x.id);
  }
  ok(r.cartes.every((c) => cats.includes(c.categorie)));
  const dico = d.dictees;
  ok(choisirProchaine(dico, [], cats).niveau === 1, 'on commence par le niveau 1');
});
