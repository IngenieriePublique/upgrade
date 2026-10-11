import { test, eq, ok } from './runner.js';
import { openStore } from '../site/js/store.js';
import {
  etapes, prochaineEtape, pitchComplet, histoireUtilisable, moyenneOral, fmtDuree, joursRestants, sprintActif, statutRadar,
} from '../site/js/candidature.js';
import { correspond } from '../site/js/modules/radar.js';
import { tirer } from '../site/js/modules/oral.js';
import { compterMots, promptRetour } from '../site/js/modules/recit.js';
import { contactsDeLaSemaine } from '../site/js/modules/reseau.js';
import { choisirMime, extension } from '../site/js/recorder.js';

let compteur = 0;
async function avecBase(fn) {
  const s = await openStore(`test-notes-${Date.now()}-${compteur++}`);
  try { await fn(s); } finally { await s.destroy(); }
}

const GAB = { pitchs: [{ id: 'p90', champs: [{ id: 'qui' }, { id: 'demande' }] }] };
const note = (id, data, t = 1) => ({ id, kind: id.split(':')[0], data, updatedAt: t });

// --- notes dans la base ---
test('notes : écriture, lecture, liste par genre, suppression par pierre tombale', () => avecBase(async (s) => {
  await s.putNote('pitch:p90', { champs: { qui: 'A' } }, 10);
  await s.putNote('radar:anct', { statut: 'cible' }, 11);
  eq((await s.getNote('pitch:p90')).data.champs.qui, 'A');
  eq((await s.notes()).length, 2);
  eq((await s.notes('radar')).map((n) => n.id), ['radar:anct']);
  await s.deleteNote('radar:anct', 12);
  eq(await s.getNote('radar:anct'), null);
  eq((await s.notes()).length, 1);
}));

test('export puis import : la note la plus récente l\'emporte, les suppressions restent supprimées', () => avecBase(async (a) => {
  await a.putNote('pitch:p90', { champs: { qui: 'ancienne' } }, 10);
  await a.putNote('contact:1', { nom: 'X' }, 10);
  const sauvegarde = await a.exportAll();
  eq(sauvegarde.version, 2);
  eq(sauvegarde.notes.length, 2);

  await a.putNote('pitch:p90', { champs: { qui: 'récente' } }, 20); // locale plus récente
  await a.deleteNote('contact:1', 30); // supprimée après la sauvegarde
  const r = await a.importMerge(sauvegarde);
  eq(r.notes, 0, 'rien de plus récent dans la sauvegarde');
  eq((await a.getNote('pitch:p90')).data.champs.qui, 'récente');
  eq(await a.getNote('contact:1'), null);
}));

test('import : une note absente localement est ajoutée, une note plus récente remplace', () => avecBase(async (a) => {
  await a.putNote('star:s1', { titre: 'locale' }, 5);
  const r = await a.importMerge({ format: 'upgrade-sauvegarde', version: 2, journal: [], days: [], meta: {},
    notes: [note('star:s1', { titre: 'importée' }, 9), note('oral:7', { duree: 60 }, 3), { id: 'sans-genre', updatedAt: 1 }] });
  eq(r.notes, 2);
  eq((await a.getNote('star:s1')).data.titre, 'importée');
  eq((await a.getNote('oral:7')).data.duree, 60);
}));

test('un ancien fichier de sauvegarde (sans notes) s\'importe encore', () => avecBase(async (a) => {
  const r = await a.importMerge({ format: 'upgrade-sauvegarde', version: 1, journal: [{ cardId: 'x', ts: 1, grade: 2 }], days: [], meta: {} });
  eq(r.ajoutees, 1);
  eq(r.notes, 0);
}));

// --- étapes du sprint ---
test('étapes : rien de fait au départ, prochaine étape = le radar', () => {
  const l = etapes([], GAB);
  eq(l.length, 6);
  ok(l.every((e) => !e.fait));
  eq(prochaineEtape(l).id, 'radar');
});

test('étapes : chaque critère est détecté', () => {
  const notes = [
    ...['a', 'b', 'c', 'd', 'e'].map((x, i) => note(`radar:${x}`, { statut: i < 2 ? 'cible' : i < 4 ? 'contacte' : 'candidature' })),
    note('radar:z', { statut: 'ecarte' }),
    note('pitch:p90', { champs: { qui: 'a', demande: 'b' } }),
    ...['s1', 's2', 's3', 's4'].map((s) => note(`star:${s}`, { champs: { situation: 'x', action: 'y', resultat: 'z' } })),
    ...[1, 2, 3].map((i) => note(`oral:${i}`, { grille: { clarte: 3 } })),
    note('contact:1', { statut: 'rdv' }),
    note('decision', { texte: 'Je candidate en contractuel.' }),
  ];
  const l = etapes(notes, GAB);
  ok(l.every((e) => e.fait), JSON.stringify(l.filter((e) => !e.fait)));
  eq(prochaineEtape(l), null);
});

test('étapes : un pitch incomplet ou une histoire sans résultat ne comptent pas', () => {
  ok(!pitchComplet(note('pitch:p90', { champs: { qui: 'a', demande: '  ' } }), GAB.pitchs[0]));
  ok(!histoireUtilisable(note('star:s1', { champs: { situation: 'x', action: 'y' } })));
  ok(histoireUtilisable(note('star:s1', { champs: { situation: 'x', action: 'y', resultat: 'z' } })));
  eq(statutRadar(null), 'a-etudier');
});

test('compte à rebours du sprint', () => {
  const avant = new Date(2026, 10, 1, 12).getTime();
  eq(joursRestants(avant), 15);
  ok(sprintActif(avant));
  ok(!sprintActif(new Date(2026, 10, 16, 8).getTime()));
  eq(joursRestants(new Date(2026, 11, 1).getTime()), 0);
});

// --- oral ---
test('moyenne de l\'auto-évaluation et durées', () => {
  eq(moyenneOral([]), null);
  eq(moyenneOral([note('oral:1', { grille: { clarte: 2, structure: 4 } }), note('oral:2', { grille: { clarte: 3 } })]), 3);
  eq(fmtDuree(75), '1:15');
  eq(fmtDuree(-4), '0:00');
});

test('tirage de question : filtre par catégorie, évite la précédente, gère le vide', () => {
  const qs = [{ id: 'a', categorie: 'x' }, { id: 'b', categorie: 'x' }, { id: 'c', categorie: 'y' }];
  eq(tirer(qs, 'y', null, () => 0).id, 'c');
  eq(tirer(qs, 'x', 'a', () => 0).id, 'b');
  eq(tirer(qs, 'y', 'c', () => 0).id, 'c', 'seule question de la catégorie');
  eq(tirer(qs, 'z', null), null);
});

test('enregistreur : choix du format', () => {
  const faux = { isTypeSupported: (m) => m === 'audio/mp4' };
  eq(choisirMime(faux), 'audio/mp4');
  eq(choisirMime({ isTypeSupported: () => false }), '');
  eq(choisirMime(null), '');
  eq(extension('audio/mp4'), 'm4a');
  eq(extension('audio/webm;codecs=opus'), 'webm');
});

// --- radar, récit, réseau ---
test('radar : filtres combinés', () => {
  const e = { nom: 'Agence nationale', sigle: 'ANCT', type: 'Opérateur', lieu: 'Paris', mission: 'cohésion', echelon: 'national', priorite: 'A' };
  ok(correspond(e, { echelon: '', priorite: '', statut: '', q: '' }, 'a-etudier'));
  ok(correspond(e, { echelon: 'national', priorite: 'A', statut: 'cible', q: 'anct' }, 'cible'));
  ok(!correspond(e, { echelon: 'local', priorite: '', statut: '', q: '' }, 'cible'));
  ok(!correspond(e, { echelon: '', priorite: '', statut: 'ecarte', q: '' }, 'cible'));
  ok(!correspond(e, { echelon: '', priorite: '', statut: '', q: 'budget' }, 'cible'));
});

test('récit : compte de mots et prompt sans invention', () => {
  eq(compterMots('  un  deux\ntrois '), 3);
  eq(compterMots(''), 0);
  const p = promptRetour('son pitch', 'Qui : moi');
  ok(p.includes('Qui : moi') && p.includes('sans inventer aucun fait'));
});

test('réseau : seuls les entretiens faits dans les 7 derniers jours comptent', () => {
  const now = 10 * 86400000;
  const cs = [note('contact:1', { statut: 'fait', faitLe: now - 86400000 }), note('contact:2', { statut: 'fait', faitLe: now - 9 * 86400000 }),
    note('contact:3', { statut: 'rdv' })];
  eq(contactsDeLaSemaine(cs, now), 1);
});
