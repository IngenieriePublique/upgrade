// Atelier d'écriture : logique pure (essais, grille, étape suivante, portfolio). Aucun accès au DOM ni au stockage.
// Un essai = une note « redac:<exercice>:<horodatage> » : { exId, ts, texte, secondes, finishedAt?, grille?, reecriture?, compare? }.
// Un projet de portfolio = une note « portfolio:<projet> » : { etapes: { <étape>: horodatage }, notes: { <étape>: texte }, url? }.

export const ID_ESSAI = (exId, ts) => `redac:${exId}:${ts}`;
export const ID_PROJET = (pid) => `portfolio:${pid}`;
export const NIVEAU_MAX = 3;

export const compterMots = (t) => (String(t ?? '').trim() ? String(t).trim().split(/\s+/).length : 0);

const essaiValide = (n) => {
  const d = n?.data;
  return n && !n.deleted && typeof n.id === 'string' && n.id.startsWith('redac:') && d
    && typeof d.exId === 'string' && Number.isFinite(d.ts) && typeof d.texte === 'string';
};

// Essais valides, du plus ancien au plus récent.
export function essaisDepuisNotes(notes) {
  return notes.filter(essaiValide)
    .map((n) => ({
      exId: n.data.exId, ts: n.data.ts, texte: n.data.texte, mots: compterMots(n.data.texte),
      secondes: Number.isFinite(n.data.secondes) ? n.data.secondes : 0,
      finishedAt: n.data.finishedAt ?? null, grille: n.data.grille ?? null,
      reecriture: n.data.reecriture ?? null, compare: !!n.data.compare, id: n.id,
    }))
    .sort((a, b) => a.ts - b.ts);
}

export const estCourt = (exId) => /^c\d+$/.test(exId);

// brouillon → a-evaluer → a-reecrire → termine (note) ; brouillon → a-comparer → termine (exercice court).
export function statutEssai(e) {
  if (!e.finishedAt) return 'brouillon';
  if (estCourt(e.exId)) return e.compare ? 'termine' : 'a-comparer';
  if (!e.grille) return 'a-evaluer';
  if (!e.reecriture || !e.reecriture.trim()) return 'a-reecrire';
  return 'termine';
}

export const dernierEssai = (essais, exId) => [...essais].reverse().find((e) => e.exId === exId) ?? null;

export function statutExercice(essais, exId) {
  const e = dernierEssai(essais, exId);
  return e ? statutEssai(e) : 'nouveau';
}

// Résultat d'une auto-évaluation : grille = { critère: 0..3 }. Renvoie le total, le maximum et les critères faibles.
export function scoreGrille(grille, criteres) {
  const parCritere = criteres.map((c) => ({ id: c.id, titre: c.titre, niveau: Number.isInteger(grille?.[c.id]) ? grille[c.id] : null }));
  const remplis = parCritere.filter((c) => c.niveau != null);
  const total = remplis.reduce((a, c) => a + c.niveau, 0);
  return {
    total, max: criteres.length * NIVEAU_MAX, complete: remplis.length === criteres.length, parCritere,
    faibles: remplis.filter((c) => c.niveau <= 1).sort((a, b) => a.niveau - b.niveau),
  };
}

// Moyenne par critère sur les `n` dernières notes évaluées ; le critère le plus faible dit quoi travailler.
export function tendance(essais, criteres, n = 4) {
  const notees = essais.filter((e) => !estCourt(e.exId) && e.grille).slice(-n);
  if (!notees.length) return null;
  const moyennes = criteres.map((c) => {
    const vals = notees.map((e) => e.grille[c.id]).filter((v) => Number.isInteger(v));
    return { id: c.id, titre: c.titre, moyenne: vals.length ? Math.round((vals.reduce((a, v) => a + v, 0) / vals.length) * 10) / 10 : null };
  }).filter((m) => m.moyenne != null);
  if (!moyennes.length) return null;
  const faible = [...moyennes].sort((a, b) => a.moyenne - b.moyenne)[0];
  return { notes: notees.length, moyennes, faible };
}

// Prochaine étape de la semaine : finir ce qui est commencé, puis une nouvelle note, puis un exercice court.
// Renvoie { action: 'ecrire' | 'evaluer' | 'reecrire' | 'comparer' | 'nouveau-court' | 'nouveau-note', exId, essai? } ou null.
export function etapeSuivante(essais, notes, courts) {
  const enCours = [...essais].reverse().find((e) => statutEssai(e) !== 'termine');
  if (enCours) {
    const s = statutEssai(enCours);
    const action = { brouillon: 'ecrire', 'a-evaluer': 'evaluer', 'a-reecrire': 'reecrire', 'a-comparer': 'comparer' }[s];
    return { action, exId: enCours.exId, essai: enCours };
  }
  const fait = new Set(essais.filter((e) => statutEssai(e) === 'termine').map((e) => e.exId));
  const prochaineNote = notes.find((n) => !fait.has(n.id));
  // Alterne : une note, puis un court, tant qu'il reste des deux.
  const dernierFait = [...essais].reverse().find((e) => statutEssai(e) === 'termine');
  const prochainCourt = prochainCourtParType(courts, essais);
  if (dernierFait && !estCourt(dernierFait.exId) && prochainCourt) return { action: 'nouveau-court', exId: prochainCourt.id };
  if (prochaineNote) return { action: 'nouveau-note', exId: prochaineNote.id };
  if (prochainCourt) return { action: 'nouveau-court', exId: prochainCourt.id };
  return null;
}

// Exercice court non fait, en faisant tourner les types (celui dont le type a été fait le moins récemment).
export function prochainCourtParType(courts, essais) {
  const faits = new Set(essais.filter((e) => estCourt(e.exId) && statutEssai(e) === 'termine').map((e) => e.exId));
  const restants = courts.filter((c) => !faits.has(c.id));
  if (!restants.length) return null;
  const dernierParType = new Map();
  for (const e of essais) {
    const c = courts.find((x) => x.id === e.exId);
    if (c && statutEssai(e) === 'termine') dernierParType.set(c.type, Math.max(dernierParType.get(c.type) ?? 0, e.finishedAt));
  }
  return [...restants].sort((a, b) => (dernierParType.get(a.type) ?? 0) - (dernierParType.get(b.type) ?? 0))[0];
}

// Progression globale pour le bilan.
export function resume(essais, notes, courts) {
  const termine = (id) => statutExercice(essais, id) === 'termine';
  return {
    notesFaites: notes.filter((n) => termine(n.id)).length, notesTotal: notes.length,
    courtsFaits: courts.filter((c) => termine(c.id)).length, courtsTotal: courts.length,
    motsEcrits: essais.filter((e) => e.finishedAt).reduce((a, e) => a + e.mots, 0),
  };
}

// Prompt à coller dans un chat pour obtenir un retour sur une note. Le texte de l'utilisateur est inclus : l'écran le dit.
export function promptRetourNote(ex, texte, criteres) {
  const lignes = criteres.map((c) => `- ${c.titre} : ${c.question}`).join('\n');
  return `Tu es un cadre de l'administration territoriale qui relit la note d'un étudiant en master de développement territorial.\n`
    + `Commande : ${ex.commande.role} écrit à ${ex.commande.destinataire}. Objet : ${ex.commande.objet}.\n`
    + `Évalue la note selon ces sept critères, en une phrase chacun, puis donne les trois améliorations les plus utiles. `
    + `N'invente aucun fait : si tu juges un chiffre douteux, dis-le sans le corriger de mémoire. Ne réécris pas la note à ma place.\n`
    + `${lignes}\n\nNote :\n${texte}`;
}

// ---- Portfolio ----

export function avancementProjet(note, projet) {
  const faites = projet.etapes.filter((e) => Number.isFinite(note?.data?.etapes?.[e.id])).length;
  return { faites, total: projet.etapes.length, fini: faites === projet.etapes.length };
}

// Un projet est « publié » quand toutes ses étapes sont cochées et qu'une adresse de publication est notée.
export function projetPublie(note, projet) {
  const a = avancementProjet(note, projet);
  return a.fini && /^https?:\/\/\S+$/.test(note?.data?.url ?? '');
}

export function prochaineEtapeProjet(note, projet) {
  return projet.etapes.find((e) => !Number.isFinite(note?.data?.etapes?.[e.id])) ?? null;
}

// Projet à poursuivre : le premier commencé et non fini, sinon le premier jamais commencé (dans l'ordre du fichier).
export function projetCourant(notes, projets) {
  const parId = new Map(notes.filter((n) => n && !n.deleted && typeof n.id === 'string' && n.id.startsWith('portfolio:')).map((n) => [n.id, n]));
  const etat = projets.map((p) => ({ p, a: avancementProjet(parId.get(ID_PROJET(p.id)), p), note: parId.get(ID_PROJET(p.id)) }));
  return etat.find((x) => x.a.faites > 0 && !x.a.fini) ?? etat.find((x) => x.a.faites === 0) ?? null;
}

export function resumePortfolio(notes, projets) {
  const parId = new Map(notes.filter((n) => n && !n.deleted && typeof n.id === 'string' && n.id.startsWith('portfolio:')).map((n) => [n.id, n]));
  return {
    publies: projets.filter((p) => projetPublie(parId.get(ID_PROJET(p.id)), p)).length,
    commences: projets.filter((p) => avancementProjet(parId.get(ID_PROJET(p.id)), p).faites > 0).length,
    total: projets.length,
  };
}
