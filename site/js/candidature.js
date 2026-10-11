// Logique pure du sprint candidature (sans DOM) : étapes, progression, statuts. Testée dans tests/candidature.test.js.

export const SPRINT_FIN = new Date(2026, 10, 15, 23, 59, 59).getTime(); // mi-novembre 2026

export const STATUTS_RADAR = [
  { id: 'a-etudier', label: 'À étudier' },
  { id: 'cible', label: 'Cible' },
  { id: 'contacte', label: 'Contacté' },
  { id: 'candidature', label: 'Candidature envoyée' },
  { id: 'ecarte', label: 'Écarté' },
];

export const STATUTS_CONTACT = [
  { id: 'a-contacter', label: 'À contacter' },
  { id: 'message', label: 'Message envoyé' },
  { id: 'rdv', label: 'Rendez-vous pris' },
  { id: 'fait', label: 'Entretien fait' },
];

export const CRITERES_ORAL = [
  { id: 'clarte', label: 'Clarté' },
  { id: 'structure', label: 'Structure' },
  { id: 'concret', label: 'Concret (exemples, chiffres)' },
  { id: 'energie', label: 'Énergie et voix' },
];

export const joursRestants = (now = Date.now()) => Math.max(0, Math.ceil((SPRINT_FIN - now) / 86400000));
export const sprintActif = (now = Date.now()) => now <= SPRINT_FIN;

export const estRempli = (v) => typeof v === 'string' && v.trim().length > 0;

// Un pitch est complet quand tous ses champs sont remplis.
export function pitchComplet(note, gabarit) {
  const champs = note?.data?.champs ?? {};
  return gabarit.champs.every((c) => estRempli(champs[c.id]));
}

// Une histoire est utilisable à l'oral quand situation, action et résultat sont écrits.
export function histoireUtilisable(note) {
  const c = note?.data?.champs ?? {};
  return estRempli(c.situation) && estRempli(c.action) && estRempli(c.resultat);
}

export const statutRadar = (note) => note?.data?.statut ?? 'a-etudier';

// Moyenne d'une série d'auto-évaluations (notes de 1 à 4), arrondie au dixième ; null s'il n'y en a pas.
export function moyenneOral(evals) {
  const vals = evals.flatMap((e) => Object.values(e.data?.grille ?? {})).filter((v) => Number.isFinite(v));
  return vals.length ? Math.round((10 * vals.reduce((a, b) => a + b, 0)) / vals.length) / 10 : null;
}

export function fmtDuree(secondes) {
  const s = Math.max(0, Math.round(secondes));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Étapes du sprint, dans l'ordre. `notes` : toutes les notes non supprimées ; `gabarits` : content/oral/gabarits.json.
export function etapes(notes, gabarits) {
  const parKind = (k) => notes.filter((n) => n.kind === k);
  const pitch90 = notes.find((n) => n.id === 'pitch:p90');
  const gab90 = gabarits.pitchs.find((p) => p.id === 'p90');
  const cibles = parKind('radar').filter((n) => ['cible', 'contacte', 'candidature'].includes(statutRadar(n)));
  const histoires = parKind('star').filter(histoireUtilisable);
  const oral = parKind('oral');
  const rdv = parKind('contact').filter((n) => ['rdv', 'fait'].includes(n.data?.statut));
  const decision = notes.find((n) => n.id === 'decision');

  return [
    { id: 'radar', titre: 'Choisir 5 employeurs cibles dans le radar', lien: '#/sprint/radar',
      fait: cibles.length >= 5, detail: `${cibles.length} sur 5` },
    { id: 'pitch', titre: 'Écrire le pitch de 90 secondes', lien: '#/sprint/recit',
      fait: !!pitch90 && pitchComplet(pitch90, gab90), detail: pitch90 && pitchComplet(pitch90, gab90) ? 'écrit' : 'à écrire' },
    { id: 'star', titre: 'Écrire 4 histoires STAR', lien: '#/sprint/recit?v=star',
      fait: histoires.length >= 4, detail: `${histoires.length} sur 4` },
    { id: 'oral', titre: 'Faire 3 entraînements enregistrés', lien: '#/sprint/oral',
      fait: oral.length >= 3, detail: `${oral.length} sur 3` },
    { id: 'reseau', titre: 'Planifier un premier entretien d\'information', lien: '#/sprint/reseau',
      fait: rdv.length >= 1, detail: rdv.length ? `${rdv.length} planifié${rdv.length > 1 ? 's' : ''}` : 'aucun' },
    { id: 'choix', titre: 'Écrire une décision provisoire concours / contractuel', lien: '#/sprint/choix',
      fait: estRempli(decision?.data?.texte), detail: estRempli(decision?.data?.texte) ? 'écrite' : 'à écrire' },
  ];
}

export const prochaineEtape = (liste) => liste.find((e) => !e.fait) ?? null;
