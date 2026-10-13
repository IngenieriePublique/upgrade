// Logique pure du jeu des territoires de First Upgrade : trois formats (régions, départements d'une région, villes),
// choix du type de question selon la progression, questions. Aucun accès au DOM : testable seul (tests/first.test.js).
// Chaque question reste une carte du moteur de répétition espacée (srs.js), identifiant « terr-<mode>-<code> » :
// les modes déjà connus d'Upgrade (placer-reg, chef-reg, placer-dep, nom-dep, pref-dep, dep-pref, num-code) partagent leur progression.
import { creerQuestion, idItem, ORDRE_REGIONS } from '../../js/territoires.js';
import { melanger } from './cadre.js';

export const FORMATS = {
  regions: {
    titre: 'Régions',
    detail: '18 régions et leurs préfectures',
    modes: ['placer-reg', 'nom-reg', 'chef-reg'],
  },
  departements: {
    titre: 'Départements',
    detail: 'Une région à la fois : départements, numéros, préfectures',
    modes: ['placer-dep', 'nom-dep', 'pref-dep', 'dep-pref', 'num-code'],
  },
  villes: {
    titre: 'Villes',
    detail: 'Les principales villes de France',
    modes: ['ville-placer', 'ville-nom'],
  },
};

export const TITRES_MODES = {
  'placer-reg': 'Placer une région',
  'nom-reg': 'Nommer la région',
  'chef-reg': 'Préfecture de région',
  'placer-dep': 'Placer un département',
  'nom-dep': 'Nommer le département',
  'pref-dep': 'Préfecture d\'un département',
  'dep-pref': 'Département d\'une préfecture',
  'num-code': 'Département d\'un numéro',
  'ville-placer': 'Placer une ville',
  'ville-nom': 'Nommer la ville',
};

export const OUTRE_MER = 'om';

// Groupes proposés pour le format « départements » : les régions de métropole (ordre d'apprentissage d'Upgrade), puis l'outre-mer.
export function groupes(data) {
  const rang = (c) => ORDRE_REGIONS.indexOf(c);
  const regions = data.regions.filter((r) => !r.outre_mer).sort((a, b) => rang(a.code) - rang(b.code))
    .map((r) => ({ code: r.code, nom: r.nom, deps: r.departements, outreMer: false }));
  const drom = data.departements.filter((d) => d.outre_mer).map((d) => d.code);
  return [...regions, { code: OUTRE_MER, nom: 'Outre-mer', deps: drom, outreMer: true }];
}

export const groupe = (data, code) => groupes(data).find((g) => g.code === code) ?? null;

// Éléments à étudier (liste affichée avant le jeu) : { code, titre, detail }.
export function lignesEtude(format, data, villes, g = null) {
  const idx = { dep: new Map(data.departements.map((d) => [d.code, d])), reg: new Map(data.regions.map((r) => [r.code, r])) };
  if (format === 'regions') {
    const rang = (c) => ORDRE_REGIONS.indexOf(c);
    return [...data.regions].sort((a, b) => rang(a.code) - rang(b.code)).map((r) => ({ code: r.code, titre: r.nom, detail: r.prefecture }));
  }
  if (format === 'departements') {
    return g.deps.map((c) => idx.dep.get(c)).map((d) => ({ code: d.code, titre: `${d.code} ${d.nom}`, detail: d.prefecture }));
  }
  return villes.map((v) => ({ code: v.id, titre: v.nom, detail: `dép. ${v.departement}` }));
}

// Codes des éléments d'un format (une question par élément et par série).
export function codesDuFormat(format, data, villes, g = null) {
  if (format === 'regions') return data.regions.map((r) => r.code);
  if (format === 'departements') return [...g.deps];
  return villes.map((v) => v.id);
}

// Type de question pour un élément : celui qui est le plus en retard dans la répétition espacée (jamais vu = en tête),
// au hasard à égalité. Rejouer la série fait donc tourner les types de question.
export function choisirMode(code, modes, states, rng = Math.random) {
  let meilleurs = [];
  let cle = Infinity;
  for (const m of modes) {
    const s = states.get(idItem(m, code));
    const k = s ? s.due : -Infinity;
    if (k < cle) { cle = k; meilleurs = [m]; } else if (k === cle) meilleurs.push(m);
  }
  return meilleurs[Math.floor(rng() * meilleurs.length)];
}

// Série complète : un élément par question, dans un ordre aléatoire (le choix du jeu, lui, ne l'est plus).
export function serie(format, data, villes, g, states, rng = Math.random) {
  const modes = FORMATS[format].modes;
  return melanger(codesDuFormat(format, data, villes, g), rng).map((code) => {
    const mode = choisirMode(code, modes, states, rng);
    return { id: idItem(mode, code), mode, code };
  });
}

// --- Questions ----------------------------------------------------------------------------------------

function qcm(bonne, libelleBonne, autres, rng) {
  const choix = melanger([{ valeur: bonne, libelle: libelleBonne }, ...autres], rng);
  return { type: 'qcm', choix, bonne };
}

// Distracteurs : on prend d'abord dans `preferes`, puis dans `reste`, sans doublon d'étiquette.
function tirer(preferes, reste, bonneLibelle, n, etiquette, rng) {
  const vus = new Set([bonneLibelle]);
  const res = [];
  for (const c of [...melanger(preferes, rng), ...melanger(reste, rng)]) {
    const e = etiquette(c);
    if (vus.has(e)) continue;
    vus.add(e);
    res.push(c);
    if (res.length === n) break;
  }
  return res;
}

// Questions sur les départements d'outre-mer : les mauvaises réponses viennent des autres départements d'outre-mer
// (tirées de toute la France, elles seraient trop faciles à écarter).
function questionOutreMer(item, data, rng) {
  const drom = data.departements.filter((d) => d.outre_mer);
  const d = drom.find((x) => x.code === item.code);
  const autres = drom.filter((x) => x.code !== d.code);
  const base = { id: item.id, mode: item.mode, code: item.code, couche: 'departements', surbrillance: d.code };
  switch (item.mode) {
    case 'nom-dep':
      return { ...base, ...qcm(d.code, d.nom, tirer(autres, [], d.nom, 3, (x) => x.nom, rng).map((x) => ({ valeur: x.code, libelle: x.nom })), rng),
        consigne: 'Quel est le département en couleur ?', explication: `${d.nom} (${d.code}), préfecture ${d.prefecture}.` };
    case 'pref-dep':
      return { ...base, ...qcm(d.prefecture, d.prefecture, tirer(autres, [], d.prefecture, 3, (x) => x.prefecture, rng).map((x) => ({ valeur: x.prefecture, libelle: x.prefecture })), rng),
        consigne: `Quelle est la préfecture de ${d.nom} ?`, explication: `${d.prefecture} est la préfecture de ${d.nom}.` };
    case 'dep-pref':
      return { ...base, ...qcm(d.code, d.nom, tirer(autres, [], d.nom, 3, (x) => x.nom, rng).map((x) => ({ valeur: x.code, libelle: x.nom })), rng),
        couche: null, surbrillance: null,
        consigne: `${d.prefecture} est la préfecture de quel département ?`, explication: `${d.prefecture} : préfecture de ${d.nom} (${d.code}).` };
    case 'num-code':
      return { ...base, ...qcm(d.code, d.nom, tirer(autres, [], d.nom, 3, (x) => x.nom, rng).map((x) => ({ valeur: x.code, libelle: x.nom })), rng),
        couche: null, surbrillance: null,
        consigne: `Quel département porte le numéro ${d.code} ?`, explication: `${d.code} : ${d.nom}.` };
    default:
      return null; // placer-dep : la question d'Upgrade convient
  }
}

// Construit la question d'un élément de série. villes : [{ id, nom, departement, departement_nom, x, y }].
export function creerQuestionFirst(item, data, villes, rng = Math.random) {
  const base = { id: item.id, mode: item.mode, code: item.code };
  switch (item.mode) {
    case 'nom-reg': {
      const r = data.regions.find((x) => x.code === item.code);
      const memeType = data.regions.filter((x) => x.code !== r.code && x.outre_mer === r.outre_mer);
      const reste = data.regions.filter((x) => x.code !== r.code && x.outre_mer !== r.outre_mer);
      const autres = tirer(memeType, reste, r.nom, 3, (x) => x.nom, rng).map((x) => ({ valeur: x.code, libelle: x.nom }));
      return { ...base, ...qcm(r.code, r.nom, autres, rng), couche: 'regions', surbrillance: r.code,
        consigne: 'Quelle est la région en couleur ?', explication: `${r.nom} : préfecture de région ${r.prefecture}.` };
    }
    case 'ville-placer': {
      const v = villes.find((x) => x.id === item.code);
      return { ...base, type: 'clic', couche: 'villes', cible: v.id,
        consigne: `Clique sur ${v.nom}.`, explication: `${v.nom} : ${v.departement_nom} (${v.departement}).` };
    }
    case 'ville-nom': {
      const v = villes.find((x) => x.id === item.code);
      const proches = [...villes].filter((x) => x.id !== v.id).sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y));
      const autres = tirer(proches.slice(0, 7), proches, v.nom, 3, (x) => x.nom, rng).map((x) => ({ valeur: x.id, libelle: x.nom }));
      return { ...base, ...qcm(v.id, v.nom, autres, rng), couche: 'villes', surbrillance: v.id,
        consigne: 'Quelle est cette ville ?', explication: `${v.nom} : ${v.departement_nom} (${v.departement}).` };
    }
    default: {
      const d = data.departements.find((x) => x.code === item.code);
      if (d?.outre_mer) {
        const q = questionOutreMer(item, data, rng);
        if (q) return q;
      }
      const q = creerQuestion(item, data, rng);
      // La préfecture d'un département se demande carte à l'appui : le département est en couleur.
      return item.mode === 'pref-dep' ? { ...q, couche: 'departements', surbrillance: item.code } : q;
    }
  }
}
