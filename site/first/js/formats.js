// Logique pure du jeu des territoires de First Upgrade : quatre formats (régions, départements d'une région, villes, pays d'un continent),
// choix du type de question selon la progression, questions. Aucun accès au DOM : testable seul (tests/first.test.js).
// Chaque question reste une carte du moteur de répétition espacée (srs.js), identifiant « terr-<mode>-<code> » :
// les modes déjà connus d'Upgrade (placer-reg, chef-reg, placer-dep, nom-dep, pref-dep, dep-pref, num-code) partagent leur progression.
import { creerQuestion, idItem, ORDRE_REGIONS } from '../../js/territoires.js';
import { melanger } from './cadre.js';

export const FORMATS = {
  pays: {
    titre: 'Pays',
    detail: 'Un continent à la fois : pays et capitales',
    modes: ['pays-placer', 'pays-nom', 'pays-capitale', 'capitale-pays'],
  },
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
  'pays-placer': 'Placer un pays',
  'pays-nom': 'Nommer le pays',
  'pays-capitale': 'Capitale d\'un pays',
  'capitale-pays': 'Pays d\'une capitale',
};

// Familles de questions qu'on peut activer ou désactiver : chacune regroupe des types de question (modes) de plusieurs formats.
export const OPTIONS_QUESTIONS = {
  capitales: { titre: 'Capitales', modes: ['pays-capitale', 'capitale-pays'] },
  prefectures: { titre: 'Préfectures', modes: ['chef-reg', 'pref-dep', 'dep-pref'] },
  numeros: { titre: 'Numéros de département', modes: ['num-code'] },
};

// Familles qui concernent un format (celles dont au moins un type de question en fait partie).
export const optionsDuFormat = (format) => Object.keys(OPTIONS_QUESTIONS).filter((k) => OPTIONS_QUESTIONS[k].modes.some((m) => FORMATS[format].modes.includes(m)));

// Types de question retenus pour un format. options : { capitales?, prefectures?, numeros? } (faux = famille désactivée ; absente = activée).
// Un format garde toujours ses types de question de base : s'il ne restait rien, tous seraient conservés.
export function modesActifs(format, options = {}) {
  const exclus = new Set(Object.entries(OPTIONS_QUESTIONS).filter(([k]) => options[k] === false).flatMap(([, o]) => o.modes));
  const gardes = FORMATS[format].modes.filter((m) => !exclus.has(m));
  return gardes.length ? gardes : FORMATS[format].modes;
}

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

// Continents proposés pour le format « pays » : { code, nom, pays: [{ id, nom, capitale, … }] }. monde : site/data/territoires/pays.json.
export const continents = (monde) => monde.continents.map((c) => ({ ...c, pays: monde.pays.filter((p) => p.continent === c.code) }));
export const continent = (monde, code) => continents(monde).find((c) => c.code === code) ?? null;

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
  if (format === 'pays') return g.pays.map((p) => ({ code: p.id, titre: p.nom, detail: p.capitale }));
  return villes.map((v) => ({ code: v.id, titre: v.nom, detail: `dép. ${v.departement}` }));
}

// Codes des éléments d'un format (une question par élément et par série).
export function codesDuFormat(format, data, villes, g = null) {
  if (format === 'regions') return data.regions.map((r) => r.code);
  if (format === 'departements') return [...g.deps];
  if (format === 'pays') return g.pays.map((p) => p.id);
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
export function serie(format, data, villes, g, states, rng = Math.random, options = {}) {
  const modes = modesActifs(format, options);
  return melanger(codesDuFormat(format, data, villes, g), rng).map((code) => {
    const mode = choisirMode(code, modes, states, rng);
    return { id: idItem(mode, code), mode, code };
  });
}

// --- Questions ----------------------------------------------------------------------------------------

function qcm(bonne, libelleBonne, autres, rng, drapeauBon = null) {
  const choix = melanger([{ valeur: bonne, libelle: libelleBonne, ...(drapeauBon ? { drapeau: drapeauBon } : {}) }, ...autres], rng);
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

// Le nom d'un pays avec son article (« la France », « les Bahamas », « Cuba ») et après « de » (« de la France », « du Japon », « d'Haïti »).
export function avecArticle(p) {
  return p.article === "l'" ? `l'${p.nom}` : p.article ? `${p.article} ${p.nom}` : p.nom;
}
export function dePays(p) {
  switch (p.article) {
    case 'le': return `du ${p.nom}`;
    case 'les': return `des ${p.nom}`;
    case 'la': return `de la ${p.nom}`;
    case "l'": return `de l'${p.nom}`;
    default: return /^[AEIOUHÀÂÉÈÊÎÔÛ]/i.test(p.nom) ? `d'${p.nom}` : `de ${p.nom}`;
  }
}

// Questions sur les pays d'un continent. autres : les pays du même continent ; les mauvaises réponses viennent d'abord des voisins.
function questionPays(item, p, autres, rng) {
  // drapeau : code du pays dont l'explication cite le nom ; drapeauConsigne : idem pour la consigne quand elle le cite (elle ne le fait pas
  // pour « X est la capitale de quel pays ? », où le drapeau donnerait la réponse). Le drapeau s'affiche après le nom ; purement décoratif.
  const base = { id: item.id, mode: item.mode, code: item.code, couche: 'pays', surbrillance: p.id, drapeau: p.id, nomPays: p.nom };
  const proches = [...autres].sort((a, b) => Math.hypot(a.cx - p.cx, a.cy - p.cy) - Math.hypot(b.cx - p.cx, b.cy - p.cy));
  const explication = `${p.nom} : capitale ${p.capitale}.${p.note ? ` ${p.note}` : ''}`;
  const noms = () => tirer(proches.slice(0, 8), proches, p.nom, 3, (x) => x.nom, rng).map((x) => ({ valeur: x.id, libelle: x.nom, drapeau: x.id }));
  switch (item.mode) {
    case 'pays-placer':
      return { ...base, type: 'clic', cible: p.id, surbrillance: null, drapeauConsigne: p.id, consigne: `Clique sur ${avecArticle(p)}.`, explication };
    case 'pays-nom':
      return { ...base, ...qcm(p.id, p.nom, noms(), rng, p.id), consigne: 'Quel est le pays en couleur ?', explication };
    case 'pays-capitale': {
      const caps = tirer(proches.slice(0, 8), proches, p.capitale, 3, (x) => x.capitale, rng).map((x) => ({ valeur: x.capitale, libelle: x.capitale }));
      return { ...base, ...qcm(p.capitale, p.capitale, caps, rng), drapeauConsigne: p.id, consigne: `Quelle est la capitale ${dePays(p)} ?`, explication };
    }
    default: // capitale-pays
      return { ...base, ...qcm(p.id, p.nom, noms(), rng, p.id), couche: null, surbrillance: null, consigne: `${p.capitale} est la capitale de quel pays ?`, explication };
  }
}

// Construit la question d'un élément de série. villes : [{ id, nom, departement, departement_nom, x, y }] ;
// pays : les pays du continent joué (format « pays »), [{ id, nom, capitale, note, cx, cy }].
export function creerQuestionFirst(item, data, villes, rng = Math.random, pays = null) {
  const base = { id: item.id, mode: item.mode, code: item.code };
  switch (item.mode) {
    case 'pays-placer': case 'pays-nom': case 'pays-capitale': case 'capitale-pays':
      return questionPays(item, pays.find((x) => x.id === item.code), pays.filter((x) => x.id !== item.code), rng);
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
