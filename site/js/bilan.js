// Bilan : logique pure (régularité, repères à trois mois, temps d'écran, revue, audit). Aucun accès au DOM ni au stockage.
// Notes personnelles : « ecran:<lundi> » { minutes }, « ecran:base » { minutes, date }, « revue:<lundi> » { reponses, intention, ... },
// « audit:<AAAA-Tn> » { decisions, reponses }.
import { dayKey, addDays } from './srs.js';

export const ID_ECRAN = (lundi) => `ecran:${lundi}`;
export const ID_BASE = 'ecran:base';
export const ID_REVUE = (lundi) => `revue:${lundi}`;
export const ID_AUDIT = (trim) => `audit:${trim}`;
const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;

const parseJour = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

// Clé (AAAA-MM-JJ) du lundi de la semaine de `ts`.
export function lundiDe(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d.getTime());
}

export const trimestre = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`; };

// Nombre de jours (0 à 90) écoulés depuis le début du trimestre de `ts`.
export function jourDuTrimestre(ts) {
  const d = new Date(ts);
  const debut = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).getTime();
  return Math.floor((new Date(ts).setHours(0, 0, 0, 0) - debut) / 86400000);
}

// ---- Régularité ----

export function joursTenus(days, now, n) {
  const clefs = new Set(days.filter((d) => d.finished).map((d) => d.day));
  let c = 0;
  for (let i = 0; i < n; i++) if (clefs.has(dayKey(addDays(now, -i)))) c++;
  return c;
}

// Les `n` dernières semaines (la plus ancienne d'abord, la semaine en cours en dernier) : jours tenus et semaine « bonne » (≥ 5 jours).
export function semaines(days, now, n = 12, seuil = 5) {
  const clefs = new Set(days.filter((d) => d.finished).map((d) => d.day));
  const lundiCourant = parseJour(lundiDe(now));
  const sortie = [];
  for (let s = n - 1; s >= 0; s--) {
    const debut = addDays(lundiCourant, -7 * s);
    let jours = 0;
    for (let i = 0; i < 7; i++) if (clefs.has(dayKey(addDays(debut, i)))) jours++;
    sortie.push({ lundi: dayKey(debut), jours, ok: jours >= seuil, enCours: s === 0 });
  }
  return sortie;
}

// ---- Temps passé sur les réseaux ----

export function ecranStats(notes) {
  const ok = (n) => n && !n.deleted && Number.isFinite(n.data?.minutes) && n.data.minutes >= 0;
  const base = notes.find((n) => n.id === ID_BASE && ok(n))?.data.minutes ?? null;
  const serie = notes.filter((n) => ok(n) && n.id.startsWith('ecran:') && JOUR_RE.test(n.id.slice(6)))
    .map((n) => ({ lundi: n.id.slice(6), minutes: n.data.minutes })).sort((a, b) => a.lundi.localeCompare(b.lundi));
  const recentes = serie.slice(-4);
  const moyenne4 = recentes.length ? Math.round(recentes.reduce((a, s) => a + s.minutes, 0) / recentes.length) : null;
  const reduction = base && moyenne4 != null ? Math.round(((base - moyenne4) / base) * 100) : null;
  return { base, serie, recentes, moyenne4, reduction };
}

// ---- Repères à trois mois ----

const compteNiveau = (tab, niveauMin) => tab.slice(niveauMin).reduce((a, n) => a + n, 0);

// ctx : { days, now, maitrise: { departements: [n0..n3], regions: [n0..n3] }, kitsPublies, livrablesPublies, contactsFaits, ecran }
export function reperes(cfg, ctx) {
  const tenus = joursTenus(ctx.days, ctx.now, 28);
  const niveau = cfg.territoires_niveau;
  const totalTerr = ctx.maitrise.departements.reduce((a, n) => a + n, 0) + ctx.maitrise.regions.reduce((a, n) => a + n, 0);
  const solides = compteNiveau(ctx.maitrise.departements, niveau) + compteNiveau(ctx.maitrise.regions, niveau);
  const red = ctx.ecran.reduction;
  const part = (v, c) => Math.max(0, Math.min(1, c ? v / c : 0));
  return [
    { id: 'jours', titre: 'Régularité', valeur: `${tenus} jours sur les 28 derniers`, cible: `${cfg.jours_tenus_sur_28} jours (5 sur 7)`,
      part: part(tenus, cfg.jours_tenus_sur_28), ok: tenus >= cfg.jours_tenus_sur_28 },
    { id: 'territoires', titre: 'Territoires', valeur: `${solides} sur ${totalTerr}`, cible: 'tous les départements et toutes les régions au niveau « solide » (carte de maîtrise)',
      part: part(solides, totalTerr), ok: totalTerr > 0 && solides === totalTerr },
    { id: 'kits', titre: 'Kits publiés', valeur: `${ctx.kitsPublies}`, cible: `${cfg.kits_publies} (production de contenu)`,
      part: part(ctx.kitsPublies, cfg.kits_publies), ok: ctx.kitsPublies >= cfg.kits_publies },
    { id: 'portfolio', titre: 'Livrable de portfolio publié', valeur: `${ctx.livrablesPublies}`, cible: `${cfg.livrables_portfolio}`,
      part: part(ctx.livrablesPublies, cfg.livrables_portfolio), ok: ctx.livrablesPublies >= cfg.livrables_portfolio },
    { id: 'entretiens', titre: 'Entretiens d\'information faits', valeur: `${ctx.contactsFaits}`, cible: `${cfg.entretiens_information}`,
      part: part(ctx.contactsFaits, cfg.entretiens_information), ok: ctx.contactsFaits >= cfg.entretiens_information },
    { id: 'reseaux', titre: 'Temps sur les réseaux', valeur: red == null ? 'pas de mesure' : `${red >= 0 ? '−' : '+'}${Math.abs(red)} % par rapport à la référence`,
      cible: `−${cfg.reduction_reseaux_pct} % (référence et quatre semaines saisies)`, part: red == null ? 0 : part(red, cfg.reduction_reseaux_pct), ok: red != null && red >= cfg.reduction_reseaux_pct },
  ];
}

// Début du système : le plus ancien des jours enregistrés et des révisions. Échéance : début + `mois`.
export function debutSysteme(days, journal) {
  const ts = [...days.map((d) => parseJour(d.day)), ...journal.map((j) => j.ts)].filter(Number.isFinite);
  return ts.length ? Math.min(...ts) : null;
}

export function echeance(debut, mois) {
  if (debut == null) return null;
  const d = new Date(debut);
  d.setMonth(d.getMonth() + mois);
  return d.getTime();
}

// ---- Revue hebdomadaire ----

// Chiffres de la semaine qui commence le lundi `lundi` (clé). Les listes d'entrée sont celles du magasin.
export function chiffresSemaine({ lundi, days, journal, essaisDictee, essaisAtelier, contacts }) {
  const debut = parseJour(lundi);
  const fin = addDays(debut, 7);
  const dans = (ts) => Number.isFinite(ts) && ts >= debut && ts < fin;
  const clefs = new Set(Array.from({ length: 7 }, (_, i) => dayKey(addDays(debut, i))));
  return {
    joursTenus: days.filter((d) => d.finished && clefs.has(d.day)).length,
    revisions: journal.filter((j) => dans(j.ts)).length,
    dictees: essaisDictee.filter((e) => dans(e.ts)).length,
    ecrits: essaisAtelier.filter((e) => dans(e.finishedAt)).length,
    contacts: contacts.filter((c) => c.data?.statut === 'fait' && dans(c.data.faitLe)).length,
  };
}

// ---- Audit trimestriel ----

// Pour chaque module : jours où son bloc a été coché sur `n` jours, parmi les jours où la séance a été ouverte.
export function usageModules(days, now, modules, n = 90) {
  const debut = addDays(now, -(n - 1));
  const recents = days.filter((d) => parseJour(d.day) >= debut && (d.finished || Object.values(d.done ?? {}).some(Boolean)));
  return {
    joursActifs: recents.length,
    modules: modules.map((m) => {
      const jours = recents.filter((d) => d.done?.[m.bloc]).length;
      return { id: m.id, bloc: m.bloc, jours, part: recents.length ? jours / recents.length : 0 };
    }),
  };
}

// Un audit est conseillé quand le trimestre est bien entamé (à partir du 70e jour) et qu'aucun audit n'est écrit pour lui.
export function auditConseille(now, notes) {
  const fait = notes.some((n) => n.id === ID_AUDIT(trimestre(now)) && !n.deleted && n.data && Object.keys(n.data.decisions ?? {}).length);
  return !fait && jourDuTrimestre(now) >= 70;
}
