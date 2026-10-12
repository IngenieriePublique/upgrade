// Logique pure des dictées : essais, statistiques de fautes, choix de la dictée suivante, cartes de règles ciblées.
// Un essai = une dictée faite sur papier, puis corrigée à l'écran en cliquant chaque faute et en la classant.
// Stocké comme note personnelle `dictee:<id>:<horodatage>` ; rien n'est jamais dans le dépôt.

export const ID_ESSAI = (dicteeId, ts) => `dictee:${dicteeId}:${ts}`;
export const ID_REGLE = (cat) => `regle:${cat}`;
export const NIVEAUX = [1, 2, 3, 4];
export const LIBELLES_NIVEAU = { 1: 'Débutant', 2: 'Courant', 3: 'Littéraire', 4: 'Institutionnel' };
export const DECK_REGLES = 'regles';

// Découpe un texte en alinéas de mots numérotés. L'index d'un mot est sa position dans texte.split(/\s+/),
// ce qui rend les fautes enregistrées indépendantes de la mise en page.
export function alineas(texte) {
  let i = 0;
  return texte.split(/\n\s*\n/).map((p) => p.trim().split(/\s+/).filter(Boolean).map((mot) => ({ i: i++, mot })));
}

// Notes `dictee:` → essais { dicteeId, ts, mots, fautes: [{i, cat}] } triés du plus ancien au plus récent.
export function essaisDepuisNotes(notes) {
  return notes
    .filter((n) => n.id.startsWith('dictee:') && !n.deleted && n.data && Array.isArray(n.data.fautes))
    .map((n) => ({ id: n.id, dicteeId: n.data.dicteeId, ts: n.data.ts, mots: n.data.mots, fautes: n.data.fautes }))
    .filter((e) => e.dicteeId && Number.isFinite(e.ts) && e.mots > 0)
    .sort((a, b) => a.ts - b.ts);
}

export const nbFautes = (e) => e.fautes.length;
export const fautesPour100 = (e) => (e.mots ? Math.round((1000 * nbFautes(e)) / e.mots) / 10 : 0);

export function fautesParCategorie(e, categories) {
  const par = Object.fromEntries(categories.map((c) => [c, 0]));
  for (const f of e.fautes) if (f.cat in par) par[f.cat]++;
  return par;
}

// Statistiques sur les `n` derniers essais : fautes et taux pour 100 mots par catégorie, et tendance
// (moyenne des fautes/100 mots des 3 derniers essais moins celle des 3 précédents ; négatif = progrès).
export function bilan(essais, categories, n = 10) {
  const recents = essais.slice(-n);
  const mots = recents.reduce((s, e) => s + e.mots, 0);
  const total = Object.fromEntries(categories.map((c) => [c, 0]));
  for (const e of recents) for (const [c, v] of Object.entries(fautesParCategorie(e, categories))) total[c] += v;
  const moyenne = (liste) => (liste.length ? liste.reduce((s, e) => s + fautesPour100(e), 0) / liste.length : null);
  const derniers = essais.slice(-3);
  const avant = essais.slice(-6, -3);
  const tendance = derniers.length && avant.length ? Math.round((moyenne(derniers) - moyenne(avant)) * 10) / 10 : null;
  return {
    essais: recents.length,
    fautes: Object.values(total).reduce((a, b) => a + b, 0),
    parCategorie: categories.map((c) => ({ cat: c, fautes: total[c], pour100: mots ? Math.round((1000 * total[c]) / mots) / 10 : 0 })),
    tauxGlobal: mots ? Math.round((1000 * Object.values(total).reduce((a, b) => a + b, 0)) / mots) / 10 : null,
    tendance,
  };
}

// Niveau conseillé d'après les 3 derniers essais : ≤ 4 fautes/100 mots → niveau au-dessus ; ≥ 12 → en dessous.
// Le niveau de référence est celui de la dernière dictée faite.
export function niveauConseille(essais, dictees) {
  if (!essais.length) return 1;
  const parId = new Map(dictees.map((d) => [d.id, d]));
  const dernier = parId.get(essais[essais.length - 1].dicteeId);
  const base = dernier ? dernier.niveau : 1;
  const derniers = essais.slice(-3);
  const moy = derniers.reduce((s, e) => s + fautesPour100(e), 0) / derniers.length;
  if (moy <= 4) return Math.min(4, base + 1);
  if (moy >= 12) return Math.max(1, base - 1);
  return base;
}

// Dictée suivante : parmi les non faites du niveau conseillé (sinon des autres niveaux, du plus proche au plus lointain),
// celle dont le profil de pièges recoupe le mieux les catégories où l'utilisateur se trompe le plus (lissage de Laplace).
// S'il n'y a plus aucune dictée neuve, la moins récemment faite.
export function choisirProchaine(dictees, essais, categories) {
  if (!dictees.length) return null;
  const faites = new Map();
  for (const e of essais) faites.set(e.dicteeId, e.ts);
  const niveau = niveauConseille(essais, dictees);
  const neuves = dictees.filter((d) => !faites.has(d.id));
  if (!neuves.length) return [...dictees].sort((a, b) => faites.get(a.id) - faites.get(b.id) || a.id.localeCompare(b.id))[0];
  const proche = [...new Set(neuves.map((d) => d.niveau))].sort((a, b) => Math.abs(a - niveau) - Math.abs(b - niveau) || a - b)[0];
  const candidates = neuves.filter((d) => d.niveau === proche);
  const b = bilan(essais, categories);
  const total = b.fautes + categories.length;
  const part = Object.fromEntries(b.parCategorie.map((c) => [c.cat, (c.fautes + 1) / total]));
  const score = (d) => categories.reduce((s, c) => s + part[c] * (d.profil[c] ?? 0), 0);
  return [...candidates].sort((x, y) => score(y) - score(x) || x.id.localeCompare(y.id))[0];
}

// Catégories où l'essai compte au moins une faute (leurs cartes de règles entrent dans la révision).
export const categoriesAActiver = (essai, categories) => categories.filter((c) => essai.fautes.some((f) => f.cat === c));

export function categoriesActives(notes) {
  return new Set(notes.filter((n) => n.id.startsWith('regle:') && !n.deleted && n.data?.actif !== false).map((n) => n.id.slice(6)));
}

// Ajoute (sans doublon) les cartes de règles des catégories actives au paquet « regles » de `decks` (modifié sur place).
export function ajouterRegles(decks, regles, actives) {
  const cartes = regles.cartes.filter((c) => actives.has(c.categorie));
  if (!cartes.length) return null;
  let deck = decks.find((d) => d.id === DECK_REGLES);
  if (!deck) {
    deck = { id: DECK_REGLES, titre: regles.titre, description: regles.description, cartes: [] };
    decks.push(deck);
  }
  const deja = new Set(deck.cartes.map((c) => c.id));
  for (const c of cartes) if (!deja.has(c.id)) deck.cartes.push({ ...c, deck: DECK_REGLES, deckTitre: deck.titre });
  return deck;
}

// Résumé d'un essai pour l'affichage : « 7 fautes pour 112 mots (6,3 pour 100) ».
export function resumeEssai(e) {
  const n = nbFautes(e);
  return `${n} faute${n > 1 ? 's' : ''} pour ${e.mots} mots (${String(fautesPour100(e)).replace('.', ',')} pour 100)`;
}

// Texte que la voix prononce pour un segment. Les abréviations sont développées (« M. » → « monsieur ») ;
// avec `ponctuation`, les signes sont dictés (« virgule », « point »…), comme dans une dictée à l'ancienne.
const SIGNES = [
  [/\.{3}|…/g, ' points de suspension '], [/;/g, ' point-virgule '], [/:/g, ' deux-points '], [/,/g, ' virgule '],
  [/!/g, ' point d’exclamation '], [/\?/g, ' point d’interrogation '], [/«/g, ' ouvrez les guillemets '],
  [/»/g, ' fermez les guillemets '], [/\(/g, ' ouvrez la parenthèse '], [/\)/g, ' fermez la parenthèse '],
  [/\s—\s|—/g, ' tiret '], [/\.(?=\s|$)/g, ' point '],
];
export function texteParle(segment, { ponctuation = false, finAlinea = false } = {}) {
  let t = segment
    .replace(/\bMM\. /g, 'messieurs ').replace(/\bM\. /g, 'monsieur ').replace(/\bMme /g, 'madame ')
    .replace(/\bMlle /g, 'mademoiselle ').replace(/\b1er\b/g, 'premier');
  if (ponctuation) for (const [re, mot] of SIGNES) t = t.replace(re, mot);
  else t = t.replace(/—/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return finAlinea && ponctuation ? `${t} À la ligne.` : t;
}

// Sigle court de chaque catégorie (affiché à côté du mot marqué : la couleur ne suffit pas).
export const CODES = { pp: 'PP', homophone: 'H', 'sujet-verbe': 'SV', gn: 'GN', conjugaison: 'C', lexicale: 'L', ponctuation: 'P' };
