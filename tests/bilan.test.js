// Logique du bilan : semaines, régularité, temps d'écran, repères à trois mois, revue, audit.
import { test, eq, ok } from './runner.js';
import { lundiDe, trimestre, jourDuTrimestre, joursTenus, semaines, ecranStats, reperes, debutSysteme, echeance,
  chiffresSemaine, usageModules, auditConseille, ID_ECRAN, ID_BASE, ID_AUDIT } from '../site/js/bilan.js';

const T = (a, m, j, h = 12) => new Date(a, m - 1, j, h).getTime();
const jour = (day, finished = true, done = {}) => ({ day, done, finished });
const CFG = { jours_tenus_sur_28: 20, kits_publies: 30, livrables_portfolio: 1, entretiens_information: 6, reduction_reseaux_pct: 50, territoires_niveau: 2 };

test('lundi de la semaine : lundi, dimanche et mercredi', () => {
  eq(lundiDe(T(2026, 10, 12)), '2026-10-12'); // lundi
  eq(lundiDe(T(2026, 10, 14)), '2026-10-12'); // mercredi
  eq(lundiDe(T(2026, 10, 18, 23)), '2026-10-12'); // dimanche soir
  eq(lundiDe(T(2026, 10, 19, 0)), '2026-10-19');
  eq(lundiDe(T(2027, 1, 1)), '2026-12-28'); // changement d'année
});

test('trimestre et jour du trimestre', () => {
  eq(trimestre(T(2026, 10, 12)), '2026-T4');
  eq(trimestre(T(2026, 3, 31)), '2026-T1');
  eq(jourDuTrimestre(T(2026, 10, 1)), 0);
  eq(jourDuTrimestre(T(2026, 12, 20)), 80);
});

test('jours tenus : compte seulement les séances terminées dans la fenêtre', () => {
  const now = T(2026, 10, 14);
  const days = [jour('2026-10-14'), jour('2026-10-13'), jour('2026-10-12', false), jour('2026-10-08'), jour('2026-09-01')];
  eq(joursTenus(days, now, 7), 3);
  eq(joursTenus(days, now, 3), 2);
  eq(joursTenus([], now, 28), 0);
});

test('semaines : 12 semaines, la dernière est la semaine en cours, bonne à partir de 5 jours', () => {
  const now = T(2026, 10, 16); // vendredi
  const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-05', '2026-10-06'].map((d) => jour(d));
  const s = semaines(days, now);
  eq(s.length, 12);
  eq(s[11], { lundi: '2026-10-12', jours: 5, ok: true, enCours: true });
  eq(s[10], { lundi: '2026-10-05', jours: 2, ok: false, enCours: false });
  eq(s[0].lundi, '2026-07-27');
});

test('temps d\'écran : référence, quatre dernières semaines, réduction', () => {
  const n = (id, minutes, extra = {}) => ({ id, data: { minutes }, ...extra });
  const notes = [n(ID_BASE, 600), n(ID_ECRAN('2026-09-07'), 900), n(ID_ECRAN('2026-09-14'), 500), n(ID_ECRAN('2026-09-21'), 400),
    n(ID_ECRAN('2026-09-28'), 300), n(ID_ECRAN('2026-10-05'), 200), n(ID_ECRAN('2026-10-12'), 100, { deleted: true }), n('ecran:pas-une-date', 5)];
  const s = ecranStats(notes);
  eq(s.base, 600);
  eq(s.serie.length, 5);
  eq(s.recentes.map((x) => x.minutes), [500, 400, 300, 200]);
  eq(s.moyenne4, 350);
  eq(s.reduction, 42);
  eq(ecranStats([]), { base: null, serie: [], recentes: [], moyenne4: null, reduction: null });
  eq(ecranStats([n(ID_ECRAN('2026-10-05'), 100)]).reduction, null); // pas de référence : pas de réduction
});

const CTX = (o = {}) => ({ days: [], now: T(2026, 12, 20), maitrise: { departements: [50, 30, 20, 1], regions: [0, 5, 10, 3] },
  kitsPublies: 25, livrablesPublies: 0, contactsFaits: 2, ecran: { reduction: null }, ...o });

test('repères : valeurs, parts et états', () => {
  const r = reperes(CFG, CTX());
  eq(r.map((x) => x.id), ['jours', 'territoires', 'kits', 'portfolio', 'entretiens', 'reseaux']);
  eq(r[2].valeur, '25');
  ok(Math.abs(r[2].part - 25 / 30) < 1e-9);
  ok(r.every((x) => !x.ok));
  eq(r[1].valeur, '34 sur 119'); // niveau 2 ou 3 : 21 départements et 13 régions sur 101 et 18
});

test('repères : atteints', () => {
  const days = Array.from({ length: 20 }, (_, i) => jour(`2026-12-${String(20 - i).padStart(2, '0')}`));
  const r = reperes(CFG, CTX({ days, kitsPublies: 30, livrablesPublies: 2, contactsFaits: 6, ecran: { reduction: 55 },
    maitrise: { departements: [0, 0, 100, 1], regions: [0, 0, 18, 0] } }));
  ok(r.every((x) => x.ok), JSON.stringify(r.filter((x) => !x.ok)));
  eq(r[5].valeur, '−55 % par rapport à la référence');
  eq(r[0].part, 1);
});

test('début du système et échéance à trois mois', () => {
  const debut = debutSysteme([jour('2026-10-12')], [{ ts: T(2026, 10, 11, 9) }, { ts: T(2026, 10, 20) }]);
  eq(debut, T(2026, 10, 11, 9));
  eq(new Date(echeance(debut, 3)).getMonth(), 0); // janvier
  eq(debutSysteme([], []), null);
  eq(echeance(null, 3), null);
});

test('revue : chiffres de la semaine du lundi 12 au dimanche 18 octobre', () => {
  const c = chiffresSemaine({
    lundi: '2026-10-12',
    days: [jour('2026-10-12'), jour('2026-10-18'), jour('2026-10-19'), jour('2026-10-13', false)],
    journal: [{ ts: T(2026, 10, 12, 8) }, { ts: T(2026, 10, 18, 23) }, { ts: T(2026, 10, 19, 1) }, { ts: T(2026, 10, 11, 23) }],
    essaisDictee: [{ ts: T(2026, 10, 14) }, { ts: T(2026, 10, 25) }],
    essaisAtelier: [{ finishedAt: T(2026, 10, 15) }, { finishedAt: null }],
    contacts: [{ data: { statut: 'fait', faitLe: T(2026, 10, 16) } }, { data: { statut: 'rdv' } }, { data: { statut: 'fait', faitLe: T(2026, 9, 1) } }],
  });
  eq(c, { joursTenus: 2, revisions: 2, dictees: 1, ecrits: 1, contacts: 1 });
});

test('audit : usage des blocs sur 90 jours, parmi les jours où la séance a été ouverte', () => {
  const modules = [{ id: 'brief', bloc: 'brief' }, { id: 'dictee', bloc: 'dictee' }];
  const now = T(2026, 12, 20);
  const days = [jour('2026-12-20', true, { brief: true, dictee: true }), jour('2026-12-19', true, { brief: true }),
    jour('2026-12-18', false, {}), jour('2026-12-17', false, { brief: true }), jour('2026-01-01', true, { brief: true })];
  const u = usageModules(days, now, modules);
  eq(u.joursActifs, 3); // le 18 n'a rien de coché ni de terminé, le 1er janvier est hors fenêtre
  eq(u.modules.map((m) => m.jours), [3, 1]);
  eq(Math.round(u.modules[1].part * 100), 33);
});

test('audit conseillé : trimestre avancé et pas d\'audit écrit', () => {
  const audit = { id: ID_AUDIT('2026-T4'), data: { decisions: { brief: 'garder' } } };
  ok(!auditConseille(T(2026, 11, 2), [])); // trop tôt
  ok(auditConseille(T(2026, 12, 15), []));
  ok(!auditConseille(T(2026, 12, 15), [audit]));
  ok(auditConseille(T(2026, 12, 15), [{ id: ID_AUDIT('2026-T4'), data: { decisions: {} } }])); // audit vide : non fait
  ok(auditConseille(T(2026, 12, 15), [{ ...audit, deleted: true }]));
});
