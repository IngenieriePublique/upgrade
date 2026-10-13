// Suivi de la méthode de travail : fonctions pures (temps actif, objectif par semaine, totaux par jour, étiquettes).
// Aucune dépendance au navigateur : les écrans sont dans methode.js et seances.js.

export const CLE_SEANCES = 'first-methode-seances';
export const CLE_ETIQUETTES = 'first-methode-etiquettes';
export const CLE_EN_COURS = 'first-methode-en-cours';
export const CLE_DEBUT = 'first-methode-debut';

// Progression recommandée (minutes de travail réel par jour) ; après la semaine 10, on reste sur le dernier palier.
export const PALIERS = [
  { de: 1, a: 3, minutes: 90 },
  { de: 4, a: 6, minutes: 120 },
  { de: 7, a: 8, minutes: 150 },
  { de: 9, a: 10, minutes: 180 },
];
export const SEMAINES = 10;
export const MINUTES_DEMARRAGE = 10; // on commence dix minutes, même sans envie
export const MINUTES_SESSION = 40;   // puis une pause de dix minutes

// ---------- jours (calendrier local, 'AAAA-MM-JJ') ----------
export const pad = (n) => String(n).padStart(2, '0');
export const jourLocal = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// Midi : à l'abri des changements d'heure quand on ajoute des jours.
const midi = (jour) => { const [a, m, j] = jour.split('-').map(Number); return new Date(a, m - 1, j, 12); };
export const ajouterJours = (jour, n) => { const d = midi(jour); d.setDate(d.getDate() + n); return jourLocal(d.getTime()); };
export const ecartJours = (a, b) => Math.round((midi(b) - midi(a)) / 86400000);
export const dateDuJour = (jour) => midi(jour);

// ---------- objectif ----------
export function semaineDuProgramme(debut, jour) {
  if (!debut) return 1;
  return Math.max(1, Math.floor(ecartJours(debut, jour) / 7) + 1);
}

export function objectifMinutes(semaine) {
  const s = Math.max(1, semaine);
  return (PALIERS.find((p) => s >= p.de && s <= p.a) ?? PALIERS.at(-1)).minutes;
}

// ---------- état d'une séance en cours : { segments: [{ d, f }], tags, tache, arret } ----------
// Chaque segment est une période de travail (début, fin ; fin = null tant qu'il court) : on stocke des instants,
// jamais un compteur, donc recharger la page ne perd rien.
// Une séance qui court n'a pas de fin : son temps est toujours « maintenant moins début ». Page fermée, serveur coupé ou
// ordinateur éteint, le travail continue de compter jusqu'au clic sur Arrêter.
export const etatVide = (tags = []) => ({ segments: [], tags: [...tags], tache: '', arret: false });

export const estEtat = (e) => Boolean(e) && typeof e === 'object' && Array.isArray(e.tags) && typeof e.tache === 'string'
  && Array.isArray(e.segments) && e.segments.every((g) => g && Number.isFinite(g.d) && (g.f == null || Number.isFinite(g.f)));

export const enCours = (segments) => segments.length > 0 && segments.at(-1).f == null;

export function phase(etat) {
  if (!etat.segments.length) return 'repos';
  if (etat.arret) return 'arret';
  return enCours(etat.segments) ? 'travail' : 'pause';
}

export const demarrer = (etat, now) => ({ ...etat, arret: false, segments: [{ d: now, f: null }] });
export const reprendre = (etat, now) => ({ ...etat, arret: false, segments: [...etat.segments, { d: now, f: null }] });
const fermer = (segments, now) => segments.map((g, i) => (i === segments.length - 1 && g.f == null ? { ...g, f: now } : g));
export const mettreEnPause = (etat, now) => ({ ...etat, segments: fermer(etat.segments, now) });
export const arreter = (etat, now) => ({ ...etat, arret: true, segments: fermer(etat.segments, now) });

export const tempsActif = (segments, now = Date.now()) => segments.reduce((s, g) => s + Math.max(0, (g.f ?? now) - g.d), 0);
export function tempsPause(segments) {
  let total = 0;
  for (let i = 1; i < segments.length; i++) total += Math.max(0, segments[i].d - (segments[i - 1].f ?? segments[i].d));
  return total;
}
export const nbPauses = (segments) => Math.max(0, segments.length - 1);

// Séance archivée (durées en secondes, instants en millisecondes).
export function creerSeance(etat, { now, debutProgramme = null }) {
  const segs = fermer(etat.segments, now);
  const debut = segs[0].d;
  const jour = jourLocal(debut);
  const semaine = semaineDuProgramme(debutProgramme ?? jour, jour);
  return {
    id: String(debut),
    debut,
    fin: segs.at(-1).f,
    duree: Math.round(tempsActif(segs, now) / 1000),
    pause: Math.round(tempsPause(segs) / 1000),
    pauses: nbPauses(segs),
    tags: [...etat.tags],
    tache: etat.tache.trim(),
    semaine,
    objectif: objectifMinutes(semaine),
  };
}

export function conseil(etat, now = Date.now()) {
  if (phase(etat) !== 'travail') return '';
  const min = tempsActif(etat.segments, now) / 60000;
  if (min < MINUTES_DEMARRAGE) return 'Dix minutes, même sans envie.';
  if (min >= MINUTES_SESSION) return 'Quarante minutes : une pause de dix minutes.';
  return '';
}

// ---------- totaux et moyenne ----------
export function totauxParJour(seances) {
  const t = {};
  for (const s of seances) { const j = jourLocal(s.debut); t[j] = (t[j] ?? 0) + s.duree; }
  return t;
}

// Les n derniers jours jusqu'à `fin` (inclus), du plus ancien au plus récent.
export function serieJours(totaux, fin, n = 14) {
  return Array.from({ length: n }, (_, k) => {
    const jour = ajouterJours(fin, k - (n - 1));
    return { jour, secondes: totaux[jour] ?? 0 };
  });
}

// Moyenne journalière en secondes : tous les jours depuis le premier jour de travail (les jours sans séance comptent),
// limitée aux jours affichés. null tant qu'aucune séance n'est dans la série.
export function moyenne(serie, premierJour) {
  if (!premierJour) return null;
  const jours = serie.filter((j) => j.jour >= premierJour);
  if (!jours.length) return null;
  return jours.reduce((s, j) => s + j.secondes, 0) / jours.length;
}

export const premierJourTravaille = (seances, totaux = totauxParJour(seances)) => Object.keys(totaux).sort()[0] ?? null;

// ---------- affichage ----------
export function duree(secondes) {
  const m = Math.round(secondes / 60);
  if (m === 0) return secondes > 0 ? '< 1 min' : '0 min';
  if (m < 60) return `${m} min`;
  const r = m % 60;
  return r ? `${Math.floor(m / 60)} h ${pad(r)}` : `${Math.floor(m / 60)} h`;
}

export function chrono(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

// ---------- étiquettes (domaines de travail) ----------
export const LONGUEUR_ETIQUETTE = 24;

// Ajoute une étiquette (espaces nettoyés, doublons sans tenir compte de la casse) ; renvoie { liste, nom } ou null si vide.
export function ajouterEtiquette(liste, brut) {
  const nom = String(brut ?? '').replace(/\s+/g, ' ').trim().slice(0, LONGUEUR_ETIQUETTE);
  if (!nom) return null;
  const existant = liste.find((e) => e.toLowerCase() === nom.toLowerCase());
  return existant ? { liste, nom: existant } : { liste: [...liste, nom], nom };
}

export const basculer = (tags, nom) => (tags.includes(nom) ? tags.filter((t) => t !== nom) : [...tags, nom]);

// ---------- fichier de sauvegarde ----------
export const estSeance = (s) => Boolean(s) && typeof s === 'object' && typeof s.id === 'string'
  && Number.isFinite(s.debut) && Number.isFinite(s.fin) && Number.isFinite(s.duree) && Array.isArray(s.tags) && typeof s.tache === 'string';

export const triees = (seances) => [...seances].sort((a, b) => b.debut - a.debut);

// Fusionne par identifiant (la séance déjà présente est conservée) ; renvoie { seances, ajoutees }.
export function fusionner(seances, importees) {
  const ids = new Set(seances.map((s) => s.id));
  const neuves = importees.filter((s) => estSeance(s) && !ids.has(s.id));
  return { seances: triees([...seances, ...neuves]), ajoutees: neuves.length };
}

export function exporter({ seances, etiquettes, debut }) {
  return JSON.stringify({ version: 1, programme: { debut }, etiquettes, seances: triees(seances) }, null, 2);
}
