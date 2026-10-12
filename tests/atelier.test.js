// Logique de l'atelier d'écriture : essais, statuts, grille, étape suivante, portfolio.
import { test, eq, ok } from './runner.js';
import { compterMots, essaisDepuisNotes, statutEssai, statutExercice, scoreGrille, tendance, etapeSuivante,
  prochainCourtParType, resume, promptRetourNote, avancementProjet, projetPublie, prochaineEtapeProjet, projetCourant,
  resumePortfolio, ID_ESSAI, ID_PROJET } from '../site/js/atelier.js';

const CRITERES = [{ id: 'probleme', titre: 'Le problème', question: 'q1' }, { id: 'plan', titre: 'Le plan', question: 'q2' },
  { id: 'style', titre: 'Le style', question: 'q3' }];
const note = (exId, ts, data = {}, extra = {}) => ({ id: ID_ESSAI(exId, ts), kind: 'redac', updatedAt: ts,
  data: { exId, ts, texte: 'un deux trois', secondes: 60, ...data }, ...extra });
const NOTES_EX = [{ id: 'n01' }, { id: 'n02' }, { id: 'n03' }];
const COURTS = [{ id: 'c01', type: 'titres' }, { id: 'c02', type: 'titres' }, { id: 'c03', type: 'dix-lignes' }];

test('mots : compte les mots et ignore les espaces en trop', () => {
  eq(compterMots('  un  deux\n\ntrois '), 3);
  eq(compterMots(''), 0);
  eq(compterMots(null), 0);
});

test('essais : seules les notes « redac: » valides comptent, triées par date', () => {
  const brut = [
    note('n01', 30), note('n02', 10), note('n03', 20, {}, { deleted: true }),
    { id: 'kit:a01', data: { startedAt: 1 } }, { id: 'redac:n04:5', data: { exId: 'n04', ts: 'x', texte: 'a' } },
    { id: 'redac:n05:6', data: null },
  ];
  eq(essaisDepuisNotes(brut).map((e) => e.exId), ['n02', 'n01']);
  eq(essaisDepuisNotes(brut)[0].mots, 3);
});

test('statut d\'un essai : brouillon, à évaluer, à réécrire, terminé', () => {
  const e = (data) => essaisDepuisNotes([note('n01', 1, data)])[0];
  eq(statutEssai(e({})), 'brouillon');
  eq(statutEssai(e({ finishedAt: 5 })), 'a-evaluer');
  eq(statutEssai(e({ finishedAt: 5, grille: { plan: 2 } })), 'a-reecrire');
  eq(statutEssai(e({ finishedAt: 5, grille: { plan: 2 }, reecriture: '  ' })), 'a-reecrire');
  eq(statutEssai(e({ finishedAt: 5, grille: { plan: 2 }, reecriture: 'texte' })), 'termine');
});

test('statut d\'un exercice court : à comparer puis terminé, sans grille ni réécriture', () => {
  const e = (data) => essaisDepuisNotes([note('c01', 1, data)])[0];
  eq(statutEssai(e({ finishedAt: 5 })), 'a-comparer');
  eq(statutEssai(e({ finishedAt: 5, compare: true })), 'termine');
  eq(statutExercice([], 'n01'), 'nouveau');
});

test('grille : total, maximum, critères faibles triés', () => {
  const s = scoreGrille({ probleme: 1, plan: 3, style: 0 }, CRITERES);
  eq(s.total, 4);
  eq(s.max, 9);
  ok(s.complete);
  eq(s.faibles.map((c) => c.id), ['style', 'probleme']);
  const partiel = scoreGrille({ plan: 2 }, CRITERES);
  ok(!partiel.complete);
  eq(partiel.total, 2);
});

test('tendance : moyenne par critère sur les dernières notes évaluées, critère le plus faible', () => {
  const essais = essaisDepuisNotes([
    note('n01', 1, { finishedAt: 2, grille: { probleme: 1, plan: 3, style: 2 } }),
    note('n02', 3, { finishedAt: 4, grille: { probleme: 3, plan: 3, style: 0 } }),
    note('c01', 5, { finishedAt: 6, compare: true }),
  ]);
  const t = tendance(essais, CRITERES);
  eq(t.notes, 2);
  eq(t.moyennes.map((m) => m.moyenne), [2, 3, 1]);
  eq(t.faible.id, 'style');
  eq(tendance([], CRITERES), null);
});

test('étape suivante : finir ce qui est commencé avant de commencer autre chose', () => {
  const avec = (...ns) => etapeSuivante(essaisDepuisNotes(ns), NOTES_EX, COURTS);
  eq(avec().action, 'nouveau-note');
  eq(avec().exId, 'n01');
  eq(avec(note('n01', 1)).action, 'ecrire');
  eq(avec(note('n01', 1, { finishedAt: 2 })).action, 'evaluer');
  eq(avec(note('n01', 1, { finishedAt: 2, grille: { plan: 1 } })).action, 'reecrire');
  eq(avec(note('c01', 1, { finishedAt: 2 })).action, 'comparer');
});

test('étape suivante : une note terminée est suivie d\'un exercice court, puis d\'une nouvelle note', () => {
  const faite = note('n01', 1, { finishedAt: 2, grille: { plan: 3 }, reecriture: 'ok' });
  let r = etapeSuivante(essaisDepuisNotes([faite]), NOTES_EX, COURTS);
  eq([r.action, r.exId], ['nouveau-court', 'c01']);
  const court = note('c01', 3, { finishedAt: 4, compare: true });
  r = etapeSuivante(essaisDepuisNotes([faite, court]), NOTES_EX, COURTS);
  eq([r.action, r.exId], ['nouveau-note', 'n02']);
});

test('étape suivante : tout est fait, il n\'y a plus rien à proposer', () => {
  const tout = [...NOTES_EX.map((n, i) => note(n.id, i + 1, { finishedAt: 9, grille: { plan: 2 }, reecriture: 'x' })),
    ...COURTS.map((c, i) => note(c.id, 10 + i, { finishedAt: 20 + i, compare: true }))];
  eq(etapeSuivante(essaisDepuisNotes(tout), NOTES_EX, COURTS), null);
});

test('exercices courts : on fait tourner les types', () => {
  const essais = essaisDepuisNotes([note('c01', 1, { finishedAt: 5, compare: true })]);
  eq(prochainCourtParType(COURTS, essais).id, 'c03'); // le type « dix-lignes » n'a jamais été fait
  eq(prochainCourtParType(COURTS, []).id, 'c01');
});

test('résumé : notes faites, courts faits, mots écrits', () => {
  const essais = essaisDepuisNotes([
    note('n01', 1, { finishedAt: 2, grille: { plan: 1 }, reecriture: 'ok', texte: 'a b c d' }),
    note('n02', 3, { texte: 'a b' }),
    note('c01', 4, { finishedAt: 5, compare: true, texte: 'a b c' }),
  ]);
  eq(resume(essais, NOTES_EX, COURTS), { notesFaites: 1, notesTotal: 3, courtsFaits: 1, courtsTotal: 3, motsEcrits: 7 });
});

test('prompt de retour : contient la commande, les critères et le texte', () => {
  const p = promptRetourNote({ commande: { role: 'chargé de mission', destinataire: 'le SGAR', objet: 'finances' } }, 'Ma note.', CRITERES);
  ok(p.includes('chargé de mission') && p.includes('Le plan : q2') && p.endsWith('Ma note.'));
  ok(p.includes('N\'invente aucun fait'));
});

const PROJETS = [{ id: 'p1', etapes: [{ id: 'cadrer' }, { id: 'ecrire' }, { id: 'publier' }] }, { id: 'p2', etapes: [{ id: 'cadrer' }, { id: 'publier' }] }];
const pnote = (pid, etapes, url) => ({ id: ID_PROJET(pid), kind: 'portfolio', updatedAt: 1, data: { etapes, ...(url ? { url } : {}) } });

test('portfolio : avancement, prochaine étape, publication exigeant une adresse', () => {
  const n = pnote('p1', { cadrer: 1, ecrire: 2 });
  eq(avancementProjet(n, PROJETS[0]), { faites: 2, total: 3, fini: false });
  eq(prochaineEtapeProjet(n, PROJETS[0]).id, 'publier');
  eq(avancementProjet(undefined, PROJETS[0]).faites, 0);
  const fini = pnote('p1', { cadrer: 1, ecrire: 2, publier: 3 });
  ok(!projetPublie(fini, PROJETS[0]));
  ok(projetPublie(pnote('p1', { cadrer: 1, ecrire: 2, publier: 3 }, 'https://exemple.org/note.pdf'), PROJETS[0]));
  ok(!projetPublie(pnote('p1', { cadrer: 1, ecrire: 2, publier: 3 }, 'pas une adresse'), PROJETS[0]));
});

test('portfolio : projet courant et résumé', () => {
  eq(projetCourant([], PROJETS).p.id, 'p1');
  eq(projetCourant([pnote('p1', { cadrer: 1 })], PROJETS).p.id, 'p1'); // commencé, non fini
  const p1fini = pnote('p1', { cadrer: 1, ecrire: 2, publier: 3 }, 'https://exemple.org/a');
  eq(projetCourant([p1fini], PROJETS).p.id, 'p2'); // le suivant
  eq(resumePortfolio([p1fini, pnote('p2', { cadrer: 1 })], PROJETS), { publies: 1, commences: 2, total: 2 });
  eq(resumePortfolio([{ id: 'portfolio:p1', deleted: true, data: null }], PROJETS), { publies: 0, commences: 0, total: 2 });
});
