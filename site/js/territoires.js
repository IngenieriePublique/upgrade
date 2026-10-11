// Logique pure du jeu Territoires : éléments à apprendre, questions, notes, carte de maîtrise.
// Aucun accès au navigateur : testable seul (tests/territoires.test.js). Chaque élément est une « carte »
// du moteur de répétition espacée (srs.js) dont l'identifiant commence par « terr- ».
import { GRADES } from './srs.js';

export const MODES = {
  'placer-reg': { titre: 'Placer une région', court: 'Régions sur la carte' },
  'chef-reg': { titre: 'Préfecture de région', court: 'Capitales régionales' },
  'ancienne': { titre: 'Anciennes régions', court: 'Anciennes → régions actuelles' },
  'placer-dep': { titre: 'Placer un département', court: 'Départements sur la carte' },
  'nom-dep': { titre: 'Nommer le département', court: 'Nom du département surligné' },
  'num-nom': { titre: 'Numéro d\'un département', court: 'Département → numéro' },
  'num-code': { titre: 'Département d\'un numéro', court: 'Numéro → département' },
  'pref-dep': { titre: 'Préfecture d\'un département', court: 'Département → préfecture' },
  'dep-pref': { titre: 'Département d\'une préfecture', court: 'Préfecture → département' },
  'region-de': { titre: 'Région d\'un département', court: 'Département → région' },
  'voisins': { titre: 'Départements limitrophes', court: 'Voisins sur la carte' },
};

// Régions par ordre d'apprentissage : on commence par la région de l'utilisateur et par Paris.
export const ORDRE_REGIONS = ['75', '11', '76', '52', '53', '24', '28', '32', '44', '27', '84', '93', '94', '01', '02', '03', '04', '06'];
export const NOUVEAUX_PAR_JOUR = 6;
export const QUESTIONS_PAR_SEANCE = 10;

const MODES_DEP = ['placer-dep', 'nom-dep', 'num-nom', 'num-code', 'pref-dep', 'dep-pref', 'region-de'];
const MODES_DROM = ['num-nom', 'num-code', 'pref-dep', 'dep-pref']; // la région est le département : pas de doublon

export const idItem = (mode, code) => `terr-${mode}-${code}`;

// Générateur pseudo-aléatoire reproductible (tests).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Comparaison tolérante : minuscules, sans accents, tirets et apostrophes comptés comme des espaces.
export function norm(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’'`\-–]/g, ' ').replace(/\s+/g, ' ').trim();
}

function melanger(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function indexer(data) {
  return {
    dep: new Map(data.departements.map((d) => [d.code, d])),
    reg: new Map(data.regions.map((r) => [r.code, r])),
    anc: new Map(data.anciennes.map((a) => [a.code, a])),
  };
}

// Tous les éléments à apprendre, dans l'ordre d'introduction.
export function creerItems(data) {
  const { dep, reg } = indexer(data);
  const rang = (c) => ORDRE_REGIONS.indexOf(c);
  const items = [];
  const add = (mode, code) => items.push({ id: idItem(mode, code), mode, code });
  const regions = [...reg.keys()].sort((a, b) => rang(a) - rang(b));
  regions.forEach((c) => add('placer-reg', c));
  regions.forEach((c) => add('chef-reg', c));
  [...data.anciennes].sort((a, b) => rang(a.region_actuelle) - rang(b.region_actuelle) || a.nom.localeCompare(b.nom, 'fr'))
    .forEach((a) => add('ancienne', a.code));
  const deps = [...dep.values()].sort((a, b) => rang(a.region) - rang(b.region) || a.code.localeCompare(b.code));
  for (const d of deps) for (const m of (d.outre_mer ? MODES_DROM : MODES_DEP)) add(m, d.code);
  for (const d of deps) if (!d.outre_mer && d.voisins.length) add('voisins', d.code);
  return items;
}

const nomDep = (d) => d.nom;

// Choisit n distracteurs parmi `candidats` (rangés par proximité), sans doublon d'étiquette.
function distracteurs(candidats, bonne, n, etiquette, rng) {
  const vus = new Set([etiquette(bonne)]);
  const res = [];
  for (const c of candidats) {
    const e = etiquette(c);
    if (vus.has(e)) continue;
    vus.add(e);
    res.push(c);
    if (res.length === n) break;
  }
  return res;
}

function proches(d, idx, rng) {
  // voisins, puis départements de la même région, puis le reste au hasard
  const voisins = melanger(d.voisins.map((c) => idx.dep.get(c)), rng);
  const memeRegion = melanger([...idx.dep.values()].filter((x) => x.region === d.region && x.code !== d.code), rng);
  const reste = melanger([...idx.dep.values()].filter((x) => x.code !== d.code), rng);
  return [...voisins, ...memeRegion, ...reste];
}

function qcm(valeurBonne, libelleBonne, autres, rng) {
  const choix = melanger([{ valeur: valeurBonne, libelle: libelleBonne }, ...autres], rng);
  return { type: 'qcm', choix, bonne: valeurBonne };
}

// Construit la question d'un élément. `rng` : fonction () => [0,1[ (Math.random en production).
export function creerQuestion(item, data, rng = Math.random) {
  const idx = indexer(data);
  const base = { id: item.id, mode: item.mode, code: item.code };
  const d = idx.dep.get(item.code);

  switch (item.mode) {
    case 'placer-reg': {
      const r = idx.reg.get(item.code);
      return { ...base, type: 'clic', couche: 'regions', cible: r.code,
        consigne: `Clique sur la région « ${r.nom} ».`,
        explication: `${r.nom} : préfecture de région ${r.prefecture}, ${r.departements.length} département${r.departements.length > 1 ? 's' : ''}.`, fiche: `r:${r.code}` };
    }
    case 'chef-reg': {
      const r = idx.reg.get(item.code);
      const autres = distracteurs(melanger([...idx.reg.values()].filter((x) => x.code !== r.code), rng), r, 3, (x) => x.prefecture, rng)
        .map((x) => ({ valeur: x.prefecture, libelle: x.prefecture }));
      return { ...base, ...qcm(r.prefecture, r.prefecture, autres, rng), couche: 'regions', surbrillance: r.code,
        consigne: `Quelle est la préfecture de la région ${r.nom} ?`, explication: `${r.prefecture} est la préfecture de région ${r.nom}.`, fiche: `r:${r.code}` };
    }
    case 'ancienne': {
      const a = idx.anc.get(item.code);
      const actuelle = idx.reg.get(a.region_actuelle);
      const autres = distracteurs(melanger([...idx.reg.values()].filter((x) => !x.outre_mer && x.code !== actuelle.code), rng), actuelle, 3, (x) => x.nom, rng)
        .map((x) => ({ valeur: x.code, libelle: x.nom }));
      return { ...base, ...qcm(actuelle.code, actuelle.nom, autres, rng), couche: 'anciennes', surbrillance: a.code,
        consigne: `Avant 2016, la région « ${a.nom} » existait. Dans quelle région actuelle est-elle ?`,
        explication: `${a.nom} fait aujourd'hui partie de ${actuelle.nom}.` };
    }
    case 'placer-dep':
      return { ...base, type: 'clic', couche: 'departements', cible: d.code,
        consigne: `Clique sur le département « ${nomDep(d)} ».`,
        explication: `${d.nom} (${d.code}) : préfecture ${d.prefecture}, région ${idx.reg.get(d.region).nom}.`, fiche: d.code };
    case 'nom-dep': {
      const autres = distracteurs(proches(d, idx, rng), d, 3, nomDep, rng).map((x) => ({ valeur: x.code, libelle: x.nom }));
      return { ...base, ...qcm(d.code, d.nom, autres, rng), couche: 'departements', surbrillance: d.code,
        consigne: 'Quel est le département en couleur ?', explication: `${d.nom} (${d.code}), préfecture ${d.prefecture}.`, fiche: d.code };
    }
    case 'num-nom': {
      const cand = melanger([...idx.dep.values()].filter((x) => x.code !== d.code), rng);
      const voisinsNum = cand.filter((x) => x.code[0] === d.code[0]); // même chiffre de dizaine : plus piégeux
      const autres = distracteurs([...voisinsNum.slice(0, 2), ...cand], d, 3, (x) => x.code, rng).map((x) => ({ valeur: x.code, libelle: x.code }));
      return { ...base, ...qcm(d.code, d.code, autres, rng),
        consigne: `Quel est le numéro du département « ${d.nom} » ?`, explication: `${d.nom} porte le numéro ${d.code}.`, fiche: d.code };
    }
    case 'num-code': {
      const autres = distracteurs(proches(d, idx, rng), d, 3, nomDep, rng).map((x) => ({ valeur: x.code, libelle: x.nom }));
      return { ...base, ...qcm(d.code, d.nom, autres, rng),
        consigne: `Quel département porte le numéro ${d.code} ?`, explication: `${d.code} : ${d.nom}.`, fiche: d.code };
    }
    case 'pref-dep': {
      const autres = distracteurs(proches(d, idx, rng), d, 3, (x) => x.prefecture, rng).map((x) => ({ valeur: x.prefecture, libelle: x.prefecture }));
      return { ...base, ...qcm(d.prefecture, d.prefecture, autres, rng),
        consigne: `Quelle est la préfecture du département « ${d.nom} » ?`, explication: `${d.prefecture} est la préfecture de ${d.nom}.`, fiche: d.code };
    }
    case 'dep-pref': {
      const autres = distracteurs(proches(d, idx, rng), d, 3, nomDep, rng).map((x) => ({ valeur: x.code, libelle: x.nom }));
      return { ...base, ...qcm(d.code, d.nom, autres, rng),
        consigne: `${d.prefecture} est la préfecture de quel département ?`, explication: `${d.prefecture} : préfecture de ${d.nom} (${d.code}).`, fiche: d.code };
    }
    case 'region-de': {
      const r = idx.reg.get(d.region);
      const proches_ = melanger(d.voisins.map((c) => idx.dep.get(c).region), rng);
      const ordre = [...proches_, ...melanger([...idx.reg.keys()], rng)].filter((c) => c !== r.code && !idx.reg.get(c).outre_mer);
      const autres = distracteurs(ordre.map((c) => idx.reg.get(c)), r, 3, (x) => x.nom, rng).map((x) => ({ valeur: x.code, libelle: x.nom }));
      return { ...base, ...qcm(r.code, r.nom, autres, rng), couche: 'departements', surbrillance: d.code,
        consigne: `Dans quelle région se trouve le département « ${d.nom} » ?`, explication: `${d.nom} est en ${r.nom}.`, fiche: d.code };
    }
    case 'voisins': {
      const cibles = [...d.voisins];
      return { ...base, type: 'multi', couche: 'departements', surbrillance: d.code, cibles,
        consigne: `Clique sur les ${cibles.length} département${cibles.length > 1 ? 's' : ''} limitrophe${cibles.length > 1 ? 's' : ''} de « ${d.nom} », puis valide.`,
        explication: `Limitrophes de ${d.nom} : ${cibles.map((c) => idx.dep.get(c).nom).join(', ')}.`, fiche: d.code };
    }
    default:
      throw new Error(`mode inconnu : ${item.mode}`);
  }
}

// Note SRS d'après la réponse : juste et rapide → Facile ; juste → Bien ; juste mais lent → Difficile ; faux → Encore.
export function noterReponse(juste, ms) {
  if (!juste) return GRADES.ENCORE;
  if (ms <= 4000) return GRADES.FACILE;
  if (ms <= 12000) return GRADES.BIEN;
  return GRADES.DIFFICILE;
}

// Un ensemble de réponses « multi » est juste s'il est identique à la cible.
export function memeEnsemble(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

// File de la séance : éléments dus d'abord, puis nouveaux (dans la limite du jour), `taille` au plus.
export function fileDuJour(items, states, now, { taille = QUESTIONS_PAR_SEANCE, nouveauxParJour = NOUVEAUX_PAR_JOUR, dejaNouveauxAujourdhui = 0 } = {}) {
  const finJournee = new Date(now);
  finJournee.setHours(24, 0, 0, 0);
  const dus = [];
  const neufs = [];
  for (const it of items) {
    const s = states.get(it.id);
    if (!s) neufs.push(it);
    else if (s.due < finJournee.getTime()) dus.push({ it, due: s.due });
  }
  dus.sort((a, b) => a.due - b.due);
  const place = Math.max(0, nouveauxParJour - dejaNouveauxAujourdhui);
  return [...dus.map((x) => x.it), ...neufs.slice(0, place)].slice(0, taille);
}

export function nouveauxAujourdhui(items, states, now) {
  const t0 = new Date(now).setHours(0, 0, 0, 0);
  return items.filter((it) => {
    const s = states.get(it.id);
    return s && s.firstSeen != null && s.firstSeen >= t0;
  }).length;
}

// Carte de maîtrise : niveau 0 (jamais vu), 1 (vu), 2 (solide : intervalle ≥ 7 j), 3 (mûr : ≥ 21 j) pour chaque territoire.
export function maitrise(items, states) {
  const par = { departements: new Map(), regions: new Map() };
  const regModes = new Set(['placer-reg', 'chef-reg']);
  for (const it of items) {
    if (it.mode === 'ancienne') continue;
    const cible = regModes.has(it.mode) ? par.regions : par.departements;
    const e = cible.get(it.code) ?? { total: 0, vus: 0, solides: 0, murs: 0 };
    e.total++;
    const s = states.get(it.id);
    if (s && s.reps > 0) { e.vus++; if (s.interval >= 7) e.solides++; if (s.interval >= 21) e.murs++; }
    cible.set(it.code, e);
  }
  const niveau = (e) => (e.murs === e.total ? 3 : e.solides === e.total ? 2 : e.vus > 0 ? 1 : 0);
  const sortie = { departements: new Map(), regions: new Map() };
  for (const k of ['departements', 'regions']) for (const [c, e] of par[k]) sortie[k].set(c, { ...e, niveau: niveau(e) });
  return sortie;
}

export function resumeMaitrise(m) {
  const compte = (map) => {
    const n = [0, 0, 0, 0];
    for (const e of map.values()) n[e.niveau]++;
    return n;
  };
  return { departements: compte(m.departements), regions: compte(m.regions) };
}

// --- Plus ou moins -------------------------------------------------------------------------------------

export const CRITERES = {
  population: { titre: 'le plus peuplé', unite: 'habitants', valeur: (t) => t.population?.valeur ?? null },
  superficie: { titre: 'le plus étendu', unite: 'km²', valeur: (t) => t.superficie_km2 ?? null },
  densite: { titre: 'le plus dense', unite: 'hab./km²', valeur: (t) => (t.population && t.superficie_km2 ? t.population.valeur / t.superficie_km2 : null) },
};

// Deux territoires dont le rapport des valeurs dépasse 1,15 (les années de recensement diffèrent d'un département à l'autre).
export function paire(data, critere, rng = Math.random, niveau = 'departements') {
  const f = CRITERES[critere].valeur;
  const pool = data[niveau].filter((t) => f(t) != null);
  for (let essai = 0; essai < 200; essai++) {
    const a = pool[Math.floor(rng() * pool.length)];
    const b = pool[Math.floor(rng() * pool.length)];
    if (a === b) continue;
    const va = f(a);
    const vb = f(b);
    if (Math.max(va, vb) / Math.min(va, vb) >= 1.15) return { a, b, va, vb, critere, bonne: va > vb ? 'a' : 'b' };
  }
  throw new Error('aucune paire exploitable');
}

export function formatNombre(n, unite = '') {
  const arrondi = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${arrondi.toLocaleString('fr-FR')}${unite ? ` ${unite}` : ''}`;
}

// --- Qui suis-je ? ------------------------------------------------------------------------------------

// Indices du plus vague au plus précis. Le nom du département est masqué dans l'extrait Wikipédia.
export function indices(d, data) {
  const idx = indexer(data);
  const r = idx.reg.get(d.region);
  const masque = d.intro.split(d.nom).join('…').split(d.nom.toLowerCase()).join('…');
  const pop = d.population.valeur;
  return [
    `Je suis un département ${d.outre_mer ? 'd\'outre-mer' : 'métropolitain'} de la région ${r.nom}.`,
    `J'ai ${d.sous_prefectures.length} sous-préfecture${d.sous_prefectures.length > 1 ? 's' : ''} et ${d.voisins.length} département${d.voisins.length > 1 ? 's' : ''} limitrophe${d.voisins.length > 1 ? 's' : ''}.`,
    `Ma population est d'environ ${formatNombre(Math.round(pop / 10000) * 10000)} habitants${d.superficie_km2 ? ` pour ${formatNombre(Math.round(d.superficie_km2 / 100) * 100)} km²` : ''}.`,
    `Ma préfecture commence par « ${d.prefecture[0]} » et compte ${d.prefecture.length} caractères.`,
    `Mon numéro est ${d.code}.`,
    masque ? `Extrait de Wikipédia (CC BY-SA) : ${masque}` : null,
  ].filter(Boolean);
}

export function reponseJuste(saisie, d) {
  const s = norm(saisie);
  return s === norm(d.nom) || s === norm(d.code);
}
