import { test, eq, ok } from './runner.js';
import { mulberry32 } from '../site/js/territoires.js';
import {
  FORMATS, groupes, groupe, lignesEtude, codesDuFormat, choisirMode, serie, creerQuestionFirst, OUTRE_MER, continents, continent, avecArticle, dePays,
} from '../site/first/js/formats.js';
import { bornes, vueDe, vueEncarts, optionsCarte, cartePays, carteMonde } from '../site/first/js/carte-first.js';
import { idItem } from '../site/js/territoires.js';
import { creerCarte } from '../site/js/carte-svg.js';
import { placer, rectCentre, candidatsAutour, candidatsCentre, chevauche, largeur } from '../site/first/js/etiquettes.js';
import { elaguer } from '../site/first/js/lus.js';
import { pastilleLu } from '../site/first/js/cadre.js';
import { rectPin } from '../site/first/js/carte-first.js';
import { fileDeSerie as fileCartes } from '../site/first/js/cartes.js';
import { lectureDuJour, lectureAutre } from '../site/first/js/lecture.js';
import { ilYa } from '../site/first/js/brief.js';
import { pointsHexagone } from '../site/first/js/cadre.js';
import * as S from '../site/first/js/suivi.js';
import { histogramme, render as renderMethode } from '../site/first/js/methode.js';
import { NIVEAUX, TYPES, question, lireReponse, nombre } from '../site/first/js/calcul-mental.js';
import { render as renderCalcul } from '../site/first/js/calcul.js';

const T0 = new Date(2026, 9, 12, 9, 30).getTime();
const finDeJournee = new Date(2026, 9, 12, 24, 0, 0, 0).getTime();

const data = await (await fetch('../site/data/territoires/data.json')).json();
const geo = await (await fetch('../site/data/geo/france.json')).json();
const villes = (await (await fetch('../site/data/territoires/villes.json')).json()).villes;

test('formats : quatre formats, chacun avec ses types de question', () => {
  eq(Object.keys(FORMATS), ['regions', 'departements', 'villes', 'pays']);
  for (const f of Object.values(FORMATS)) ok(f.modes.length >= 2 && f.titre && f.detail);
});

const monde = await (await fetch('../site/data/territoires/pays.json')).json();
const geoOm = await (await fetch('../site/data/geo/monde-om.json')).json();

test('pays : 193 États répartis en sept continents, chacun avec sa capitale, son article et ses coordonnées dans la carte du continent', async () => {
  eq(monde.pays.length, 193);
  eq(new Set(monde.pays.map((p) => p.id)).size, 193);
  eq(monde.continents.map((c) => c.code), ['europe', 'asie', 'afrique', 'amerique-nord', 'caraibes', 'amerique-sud', 'oceanie']);
  eq(continents(monde).map((c) => c.pays.length), [44, 46, 54, 10, 13, 12, 14]);
  eq(continent(monde, 'asie').nom, 'Asie');
  eq(continent(monde, 'xx'), null);
  for (const c of monde.continents) {
    const geoC = await (await fetch(`../site/data/geo/monde-${c.code}.json`)).json();
    const [, , l, h] = geoC.viewBox.split(' ').map(Number);
    for (const p of monde.pays.filter((x) => x.continent === c.code)) {
      ok(p.nom && p.capitale, `${p.id} : nom ou capitale manquant`);
      ok(['le', 'la', 'les', "l'", ''].includes(p.article), `${p.nom} : article`);
      ok(p.cx >= 0 && p.cx <= l && p.cy >= 0 && p.cy <= h, `${p.nom} : centre hors de la carte`);
      ok(p.x >= 0 && p.x <= l && p.y >= 0 && p.y <= h, `${p.nom} : capitale hors de la carte`);
      ok(geoC.pays[p.id], `${p.nom} : absent de la carte`);
    }
  }
  const cap = (id) => monde.pays.find((p) => p.id === id).capitale;
  eq([cap('FR'), cap('JP'), cap('BR'), cap('AU'), cap('EG'), cap('CA')], ['Paris', 'Tokyo', 'Brasilia', 'Canberra', 'Le Caire', 'Ottawa']);
  ok(monde.pays.find((p) => p.id === 'ZA').note.includes('Le Cap'), 'note sur les capitales multiples');
});

test('pays : le nom avec son article, et après « de »', () => {
  const p = (id) => monde.pays.find((x) => x.id === id);
  eq(['FR', 'JP', 'IT', 'BS', 'CU', 'US'].map((id) => avecArticle(p(id))), ['la France', 'le Japon', "l'Italie", 'les Bahamas', 'Cuba', 'les États-Unis']);
  eq(['FR', 'JP', 'IT', 'BS', 'CU', 'HT', 'US', 'IQ'].map((id) => dePays(p(id))), ['de la France', 'du Japon', "de l'Italie", 'des Bahamas', 'de Cuba', "d'Haïti", 'des États-Unis', "de l'Irak"]);
});

test('pays : révision, série et questions de chaque continent', () => {
  const rng = mulberry32(21);
  let n = 0;
  for (const c of continents(monde)) {
    const lignes = lignesEtude('pays', data, villes, c);
    eq(lignes.length, c.pays.length);
    ok(lignes.every((l) => l.titre && l.detail));
    eq(codesDuFormat('pays', data, villes, c), c.pays.map((p) => p.id));
    const s = serie('pays', data, villes, c, new Map(), rng);
    eq(new Set(s.map((q) => q.code)).size, c.pays.length);
    ok(s.every((q) => FORMATS.pays.modes.includes(q.mode)));
    for (const p of c.pays) {
      for (const mode of FORMATS.pays.modes) {
        const q = creerQuestionFirst({ id: idItem(mode, p.id), mode, code: p.id }, data, villes, rng, c.pays);
        n++;
        ok(q.consigne && q.explication.includes(p.capitale), `${mode} ${p.nom}`);
        if (q.type === 'qcm') {
          ok(q.choix.some((x) => x.valeur === q.bonne), `${mode} ${p.nom} : bonne réponse absente`);
          eq(new Set(q.choix.map((x) => x.libelle)).size, 4, `${mode} ${p.nom} : quatre choix distincts`);
        } else eq([q.type, q.cible], ['clic', p.id]);
      }
    }
  }
  eq(n, 193 * 4);
});

test('pays : la carte d\'un continent, ses pastilles de petits pays et ses étiquettes', async () => {
  const eu = continent(monde, 'europe');
  const geoEu = await (await fetch('../site/data/geo/monde-europe.json')).json();
  const actifs = new Set(eu.pays.map((p) => p.id));
  const noms = new Map(eu.pays.map((p) => [p.id, p.nom]));
  let clic = null;
  const carte = cartePays(geoEu, actifs, noms, { onClic: (code) => { clic = code; } });
  eq(carte.el.querySelectorAll('.pays:not(.hors)').length, 44);
  ok(carte.el.querySelectorAll('.pays.hors').length > 5, 'pays voisins en contexte');
  const mc = carte.chemin('MC');
  ok(mc.querySelector('circle.pt'), 'Monaco a une pastille');
  ok(!carte.chemin('FR').querySelector('circle.pt'), 'la France n\'en a pas');
  ok(!carte.chemin('TR'), 'la Turquie n\'est pas un pays du jeu');
  mc.dispatchEvent(new MouseEvent('click'));
  eq(clic, 'MC');
  carte.marquer('MC', 'cible');
  ok(mc.classList.contains('cible'));
  carte.retirer('cible');
  ok(!mc.classList.contains('cible'));
  carte.nommer('FR'); carte.nommer('FR');
  eq([...carte.el.querySelectorAll('.noms text')].map((t) => t.textContent), ['France']);
  carte.nommerTout();
  eq(carte.el.querySelectorAll('.noms text').length, 44);
});

test('outre-mer : la carte du monde repère les cinq départements d\'outre-mer et la métropole, par code de région ou de département', () => {
  const m = carteMonde(geoOm, data);
  eq(geoOm.marqueurs.map((x) => x.code), ['971', '972', '973', '974', '976', 'metropole']);
  ok(m.el.querySelector('.t.fr'), 'la France est mise en évidence');
  for (const r of data.regions.filter((x) => x.outre_mer)) {
    ok(m.chemin(r.code), `repère de ${r.nom}`);
    eq(m.chemin(r.code), m.chemin(r.departements[0]));
  }
  const [, , l, h] = geoOm.viewBox.split(' ').map(Number);
  ok(geoOm.marqueurs.every((x) => x.x > 0 && x.x < l && x.y > 0 && x.y < h), 'repères dans la carte');
  const x = Object.fromEntries(geoOm.marqueurs.map((q) => [q.code, q]));
  ok(x['973'].x < x.metropole.x && x['974'].x > x.metropole.x, 'la Guyane est à l\'ouest de la métropole, La Réunion à l\'est');
  ok(x['974'].y > x.metropole.y, 'La Réunion est au sud de la métropole');
});

test('groupes de départements : 13 régions de métropole puis l\'outre-mer ; chaque département une seule fois', () => {
  const gs = groupes(data);
  eq(gs.length, 14);
  eq(gs.at(-1).code, OUTRE_MER);
  eq(gs.at(-1).deps, ['971', '972', '973', '974', '976']);
  eq(gs.flatMap((g) => g.deps).sort(), data.departements.map((d) => d.code).sort());
  eq(groupe(data, '53').nom, 'Bretagne');
  eq(groupe(data, 'xx'), null);
});

test('révision avant le jeu : noms et préfectures pour chaque format', () => {
  const reg = lignesEtude('regions', data, villes);
  eq(reg.length, 18);
  ok(reg.every((l) => l.titre && l.detail), 'région sans préfecture');
  eq(reg.find((l) => l.titre === 'Bretagne').detail, 'Rennes');
  const dep = lignesEtude('departements', data, villes, groupe(data, '53'));
  eq(dep.map((l) => l.titre), ['22 Côtes-d\'Armor', '29 Finistère', '35 Ille-et-Vilaine', '56 Morbihan']);
  eq(dep.map((l) => l.detail), ['Saint-Brieuc', 'Quimper', 'Rennes', 'Vannes']);
  eq(lignesEtude('villes', data, villes).length, villes.length);
});

test('villes : dans le repère de la carte, près de leur département, Paris sur Paris', () => {
  ok(villes.length >= 30, 'au moins une trentaine de villes');
  const [, , largeur, hauteur] = geo.viewBox.split(' ').map(Number);
  for (const v of villes) {
    ok(v.x > 0 && v.x < largeur && v.y > 0 && v.y < hauteur, `${v.nom} hors de la carte`);
    ok(data.departements.some((d) => d.code === v.departement && d.nom === v.departement_nom), `département de ${v.nom}`);
    const c = geo.departements[v.departement].c;
    ok(Math.hypot(v.x - c[0], v.y - c[1]) < 130, `${v.nom} loin de son département`);
  }
  const paris = villes.find((v) => v.nom === 'Paris');
  ok(Math.hypot(paris.x - geo.departements['75'].c[0], paris.y - geo.departements['75'].c[1]) < 8);
  eq(new Set(villes.map((v) => v.id)).size, villes.length);
});

test('choix du type de question : jamais vu d\'abord, puis le plus en retard', () => {
  const modes = ['placer-reg', 'nom-reg', 'chef-reg'];
  const etats = new Map([[idItem('placer-reg', '53'), { due: 500 }], [idItem('chef-reg', '53'), { due: 100 }]]);
  eq(choisirMode('53', modes, etats), 'nom-reg');
  etats.set(idItem('nom-reg', '53'), { due: 300 });
  eq(choisirMode('53', modes, etats), 'chef-reg');
  ok(modes.includes(choisirMode('53', modes, new Map(), mulberry32(3))));
});

test('série : un élément par question, tout le périmètre choisi, plus de mélange de formats', () => {
  const states = new Map();
  const reg = serie('regions', data, villes, null, states, mulberry32(5));
  eq(reg.length, 18);
  eq(new Set(reg.map((q) => q.code)).size, 18);
  ok(reg.every((q) => FORMATS.regions.modes.includes(q.mode)));
  const dep = serie('departements', data, villes, groupe(data, '76'), states, mulberry32(5));
  eq(dep.length, 13);
  ok(dep.every((q) => groupe(data, '76').deps.includes(q.code)), 'département d\'une autre région');
  eq(serie('villes', data, villes, null, states, mulberry32(5)).length, villes.length);
  eq(codesDuFormat('departements', data, villes, groupe(data, '94')), ['2A', '2B']);
});

test('questions : tous les types de tous les formats se construisent, avec une bonne réponse parmi quatre choix', () => {
  const rng = mulberry32(11);
  const formats = [['regions', null], ['villes', null], ...groupes(data).map((g) => ['departements', g])];
  let n = 0;
  for (const [f, g] of formats) {
    for (const code of codesDuFormat(f, data, villes, g)) {
      for (const mode of FORMATS[f].modes) {
        const q = creerQuestionFirst({ id: idItem(mode, code), mode, code }, data, villes, rng);
        n++;
        ok(q.consigne && q.explication, `${mode} ${code} : consigne`);
        if (q.type === 'qcm') {
          ok(q.choix.some((c) => c.valeur === q.bonne), `${mode} ${code} : bonne réponse absente`);
          eq(new Set(q.choix.map((c) => c.libelle)).size, 4, `${mode} ${code} : quatre choix distincts`);
        } else eq(q.type, 'clic');
      }
    }
  }
  ok(n > 300, `${n} questions`);
});

test('outre-mer : les mauvaises réponses sont d\'autres départements d\'outre-mer', () => {
  const drom = new Set(['971', '972', '973', '974', '976']);
  for (const code of drom) {
    for (const mode of ['nom-dep', 'pref-dep', 'dep-pref', 'num-code']) {
      const q = creerQuestionFirst({ id: idItem(mode, code), mode, code }, data, villes, mulberry32(2));
      const trouve = (v) => data.departements.find((x) => x.code === v || x.prefecture === v);
      ok(q.choix.every((c) => drom.has(trouve(c.valeur).code)), `${mode} ${code} : réponse hors outre-mer`);
    }
  }
});

test('la préfecture d\'un département se demande carte à l\'appui', () => {
  const q = creerQuestionFirst({ id: idItem('pref-dep', '33'), mode: 'pref-dep', code: '33' }, data, villes, mulberry32(1));
  eq([q.couche, q.surbrillance], ['departements', '33']);
});

test('cadrage : la vue d\'une région contient ses départements, celle des encarts les cinq cadres', () => {
  const b = bornes(geo, 'departements', groupe(data, '53').deps);
  ok(b.x1 > b.x0 && b.y1 > b.y0 && b.x0 >= 0);
  const [x, y, w, h] = vueDe(geo, 'departements', groupe(data, '53').deps).split(' ').map(Number);
  ok(x < b.x0 && y < b.y0 && x + w > b.x1 && y + h > b.y1, 'marge');
  const [ex, ey, ew, eh] = vueEncarts(geo).split(' ').map(Number);
  for (const c of geo.cadres) ok(c.x >= ex && c.y >= ey && c.x + c.w <= ex + ew && c.y + c.h <= ey + eh, c.nom);
});

test('options de carte : région zoomée sans encarts, outre-mer sans légendes pendant le jeu, avec à la révision', () => {
  const g = groupe(data, '53');
  const opt = optionsCarte(geo, data, 'departements', g);
  eq([opt.cadres, [...opt.actifs]], [false, g.deps]);
  ok(!opt.visibles.has('971'), 'outre-mer visible autour de la Bretagne');
  eq(optionsCarte(geo, data, 'departements', groupe(data, OUTRE_MER)).legendes, false);
  eq(optionsCarte(geo, data, 'departements', groupe(data, OUTRE_MER), { legendes: true }).legendes, true);
  eq(optionsCarte(geo, data, 'regions').legendes, false);
});

test('cartes : même règle (dues puis nouvelles)', () => {
  const cartes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const file = fileCartes(cartes, new Map([['b', { due: T0 }]]), T0, 2, mulberry32(7));
  eq(file.length, 2);
  eq(file[0].id, 'b');
});

const L = (id, type = 'article') => ({ id, type });

test('lecture du jour : stable pour un jour donné, sans presse tant qu\'il reste des articles', () => {
  const pool = [L('p1', 'presse'), L('a1'), L('a2'), L('r1', 'rapport')];
  const a = lectureDuJour(pool, new Set(), '2026-10-12');
  eq(lectureDuJour(pool, new Set(), '2026-10-12').id, a.id);
  ok(a.type !== 'presse');
});

test('lecture du jour : évite les lectures déjà lues', () => {
  const pool = [L('a1'), L('a2'), L('a3')];
  for (const jour of ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']) {
    ok(lectureDuJour(pool, new Set(['a1', 'a2']), jour).id === 'a3', jour);
  }
});

test('lecture du jour : tout lu, on reprend dans l\'ensemble', () => {
  const pool = [L('a1'), L('a2')];
  ok(['a1', 'a2'].includes(lectureDuJour(pool, new Set(['a1', 'a2']), '2026-10-12').id));
});

test('une autre lecture : jamais la même, de préférence non lue', () => {
  const pool = [L('a1'), L('a2'), L('a3')];
  for (let s = 1; s < 20; s++) eq(lectureAutre(pool, new Set(['a2']), 'a1', mulberry32(s)).id, 'a3');
  eq(lectureAutre([L('seule')], new Set(), 'seule'), null);
});

test('« il y a » du Brief', () => {
  const now = Date.parse('2026-10-12T12:00:00Z');
  eq(ilYa('2026-10-12T11:30:00Z', now), 'il y a moins d\'une heure');
  eq(ilYa('2026-10-12T07:00:00Z', now), 'il y a 5 h');
  eq(ilYa('2026-10-10T12:00:00Z', now), 'il y a 2 j');
});

test('hexagone : six sommets', () => {
  eq(pointsHexagone(10).split(' ').length, 6);
});

test('creerCarte : légendes d\'outre-mer retirées à la demande, territoires hors zone seulement en contexte', () => {
  const avec = creerCarte(geo, { couche: 'regions' });
  eq(avec.el.querySelectorAll('.cadre-nom').length, 5);
  const sans = creerCarte(geo, { couche: 'regions', legendes: false });
  eq([sans.el.querySelectorAll('.cadre').length, sans.el.querySelectorAll('.cadre-nom').length], [5, 0]);
  const g = groupe(data, '53');
  const zoom = creerCarte(geo, { couche: 'departements', onClic: () => {}, ...optionsCarte(geo, data, 'departements', g) });
  eq(zoom.el.querySelectorAll('.cliquable').length, 4);
  eq(zoom.el.querySelectorAll('.t.hors').length, 96 - 4);
  eq(zoom.el.querySelectorAll('.cadre').length, 0);
});

// ---------- étiquettes, pins, pastilles « lu » ----------

const prefectures = (await (await fetch('../site/data/territoires/prefectures.json')).json()).prefectures;

test('étiquettes : deux étiquettes voulant la même place ne se chevauchent pas', () => {
  const pin = { x0: 95, y0: 80, x1: 105, y1: 100 };
  const items = ['A', 'B', 'C'].map((id) => ({ id, w: 40, h: 10, candidats: candidatsAutour(pin, 40, 10, 1) }));
  const res = placer(items, { obstacles: [pin] });
  const rects = [...res.values()].map((r) => r.rect);
  for (let i = 0; i < rects.length; i++) {
    ok(!chevauche(rects[i], pin), `étiquette ${i} sur le pin`);
    for (let j = i + 1; j < rects.length; j++) ok(!chevauche(rects[i], rects[j]), `étiquettes ${i} et ${j}`);
  }
});

test('étiquettes : une zone garde son centre quand la place est libre, sinon se décale', () => {
  const libre = placer([{ id: 'z', w: 50, h: 10, candidats: candidatsCentre(100, 100, 12) }]);
  eq([libre.get('z').cx, libre.get('z').cy], [100, 100]);
  const occupe = placer([{ id: 'z', w: 50, h: 10, candidats: candidatsCentre(100, 100, 12) }], { obstacles: [rectCentre(100, 100, 20, 20)] });
  ok(!chevauche(occupe.get('z').rect, rectCentre(100, 100, 20, 20)), 'zone restée sur l\'obstacle');
});

test('étiquettes : restent dans les bornes quand c\'est possible', () => {
  const bornes = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const pin = { x0: 92, y0: 40, x1: 100, y1: 50 };
  const r = placer([{ id: 'p', w: 40, h: 10, candidats: candidatsAutour(pin, 40, 10, 1) }], { obstacles: [pin], bornes }).get('p').rect;
  ok(r.x0 >= 0 && r.x1 <= 100 && r.y0 >= 0 && r.y1 <= 100, 'étiquette hors de la carte');
});

test('préfectures : 101, dans le repère de la carte, près du centre de leur département, nom conforme', () => {
  eq(Object.keys(prefectures).length, 101);
  const [, , largeurCarte, hauteurCarte] = geo.viewBox.split(' ').map(Number);
  for (const d of data.departements) {
    const p = prefectures[d.code];
    eq(p.nom, d.prefecture, `préfecture de ${d.nom}`);
    if (d.outre_mer) {
      const c = geo.cadres.find((x) => x.code === d.code);
      ok(p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h, `${p.nom} hors de son encart`);
    } else {
      ok(p.x > 0 && p.x < largeurCarte && p.y > 0 && p.y < hauteurCarte, `${p.nom} hors de la carte`);
      const c = geo.departements[d.code].c;
      ok(Math.hypot(p.x - c[0], p.y - c[1]) < 90, `${p.nom} loin de son département`);
    }
  }
});

test('pins de la révision : aucune étiquette sur un pin ni sur une autre, pour chaque région de métropole', () => {
  for (const gr of groupes(data).filter((x) => !x.outreMer)) {
    const taille = Number(vueDe(geo, 'departements', gr.deps).split(' ')[2]) / 44; // même corps de texte que l'écran
    const pins = gr.deps.map((c) => rectPin(prefectures[c].x, prefectures[c].y, taille * 1.5));
    const items = gr.deps.map((c, i) => {
      const w = largeur(prefectures[c].nom, taille) + taille * 0.4;
      return { id: c, w, h: taille * 1.3, candidats: candidatsAutour(pins[i], w, taille * 1.3, taille * 0.12) };
    });
    const res = [...placer(items, { obstacles: pins }).values()];
    res.forEach((r, i) => {
      pins.forEach((p) => ok(!chevauche(r.rect, p), `${gr.nom} : étiquette sur un pin`));
      res.slice(i + 1).forEach((s2) => ok(!chevauche(r.rect, s2.rect), `${gr.nom} : étiquettes superposées`));
    });
  }
});

test('villes : la population est publiée pour dimensionner les pastilles', () => {
  ok(villes.every((v) => Number.isInteger(v.population) && v.population >= 100000), 'population manquante');
  ok(villes[0].population >= villes.at(-1).population, 'ordre décroissant');
});

test('mémoire des lus : on oublie les entrées de plus de 60 jours', () => {
  const lus = { a: '2026-10-12', b: '2026-09-01', c: '2026-07-01' };
  eq(elaguer(lus, '2026-10-12'), { a: '2026-10-12', b: '2026-09-01' });
});

test('pastille « lu » : cercle vide, se coche au clic, annonce son état', async () => {
  const appels = [];
  const b = pastilleLu({ lu: false, onChange: (v) => appels.push(v) });
  eq([b.classList.contains('lu'), b.getAttribute('aria-pressed'), b.children.length], [false, 'false', 0]);
  b.click();
  await Promise.resolve();
  eq([b.classList.contains('lu'), b.getAttribute('aria-pressed'), b.querySelectorAll('svg').length, appels], [true, 'true', 1, [true]]);
  b.click();
  eq(appels, [true, false]);
  eq(pastilleLu({ lu: true }).classList.contains('lu'), true);
});

// ---------- méthode de travail ----------
const min = 60000;

test('objectif : 1 h 30 aux semaines 1-3, puis 2 h, 2 h 30, 3 h ; on reste à 3 h ensuite', () => {
  eq([1, 3, 4, 6, 7, 8, 9, 10, 25].map(S.objectifMinutes), [90, 90, 120, 120, 150, 150, 180, 180, 180]);
  eq(S.objectifMinutes(0), 90);
});

test('semaine du programme : comptée depuis le premier jour, passage de 7 jours en 7 jours', () => {
  eq(S.semaineDuProgramme('2026-10-01', '2026-10-01'), 1);
  eq(S.semaineDuProgramme('2026-10-01', '2026-10-07'), 1);
  eq(S.semaineDuProgramme('2026-10-01', '2026-10-08'), 2);
  eq(S.semaineDuProgramme('2026-10-01', '2026-12-10'), 11);
  eq(S.semaineDuProgramme(null, '2026-10-01'), 1);
  eq(S.ajouterJours('2026-10-25', 1), '2026-10-26'); // changement d'heure
  eq(S.ajouterJours('2026-03-01', -1), '2026-02-28');
});

test('séance : pause et reprise, le temps de pause n\'est pas compté', () => {
  let e = S.etatVide(['Stats']);
  eq(S.phase(e), 'repos');
  e = S.demarrer(e, 0);
  eq(S.phase(e), 'travail');
  e = S.mettreEnPause(e, 10 * min);
  eq(S.phase(e), 'pause');
  e = S.reprendre(e, 15 * min);
  e = S.arreter(e, 45 * min);
  eq(S.phase(e), 'arret');
  eq(S.tempsActif(e.segments, 99 * min), 40 * min);
  eq(S.tempsPause(e.segments), 5 * min);
  const s = S.creerSeance({ ...e, tache: '  Fiche 3 \n' }, { now: 50 * min, debutProgramme: null });
  eq([s.duree, s.pause, s.pauses, s.tache, s.tags, s.objectif, s.semaine], [2400, 300, 1, 'Fiche 3', ['Stats'], 90, 1]);
  ok(S.estSeance(s));
});

test('séance : arrêt depuis la pause, reprise après arrêt', () => {
  let e = S.mettreEnPause(S.demarrer(S.etatVide(), 0), 5 * min);
  e = S.arreter(e, 9 * min);
  eq(e.segments, [{ d: 0, f: 5 * min }]);
  e = S.reprendre(e, 10 * min);
  eq([S.phase(e), e.arret], ['travail', false]);
});

test('séance : une séance qui court garde son début, le temps compte même page fermée', () => {
  const e = S.demarrer(S.etatVide(), 0);
  const rechargee = JSON.parse(JSON.stringify(e)); // ce que retrouve la page après une fermeture
  eq(S.phase(rechargee), 'travail');
  eq(S.tempsActif(rechargee.segments, 5 * 60 * min), 5 * 60 * min);
  const fin = S.arreter(rechargee, 5 * 60 * min);
  eq(S.creerSeance(fin, { now: 6 * 60 * min }).duree, 5 * 3600);
});

test('conseil : dix minutes d\'abord, pause à quarante', () => {
  const e = S.demarrer(S.etatVide(), 0);
  eq([S.conseil(e, 2 * min), S.conseil(e, 20 * min)], ['Dix minutes, même sans envie.', '']);
  ok(S.conseil(e, 41 * min).includes('pause'));
  eq(S.conseil(S.etatVide(), 0), '');
});

test('totaux par jour : toutes les séances d\'un même jour s\'additionnent ; moyenne depuis le premier jour', () => {
  const at = (j, h, duree) => ({ id: `${j}${h}`, debut: new Date(`${j}T${h}:00:00`).getTime(), fin: 0, duree, tags: [], tache: '' });
  const seances = [at('2026-10-11', '09', 3600), at('2026-10-11', '14', 1800), at('2026-10-13', '10', 1800)];
  const t = S.totauxParJour(seances);
  eq(t, { '2026-10-11': 5400, '2026-10-13': 1800 });
  const serie = S.serieJours(t, '2026-10-13', 4);
  eq(serie.map((j) => [j.jour, j.secondes]), [['2026-10-10', 0], ['2026-10-11', 5400], ['2026-10-12', 0], ['2026-10-13', 1800]]);
  eq(S.premierJourTravaille(seances), '2026-10-11');
  eq(S.moyenne(serie, '2026-10-11'), (5400 + 0 + 1800) / 3);
  eq(S.moyenne(serie, null), null);
  eq(S.moyenne(serie, '2026-10-14'), null);
});

test('durées : minutes, heures et chronomètre', () => {
  eq([S.duree(0), S.duree(20), S.duree(2400), S.duree(3600), S.duree(5400), S.duree(7500)], ['0 min', '< 1 min', '40 min', '1 h', '1 h 30', '2 h 05']);
  eq([S.chrono(0), S.chrono(65000), S.chrono(3725000)], ['00:00', '01:05', '1:02:05']);
});

test('étiquettes : nettoyées, sans doublon, cochées ou décochées', () => {
  eq(S.ajouterEtiquette(['Stats'], '  droit   public '), { liste: ['Stats', 'droit public'], nom: 'droit public' });
  eq(S.ajouterEtiquette(['Stats'], 'STATS'), { liste: ['Stats'], nom: 'Stats' });
  eq(S.ajouterEtiquette(['Stats'], '   '), null);
  eq(S.basculer(['a'], 'b'), ['a', 'b']);
  eq(S.basculer(['a', 'b'], 'a'), ['b']);
});

test('archive : export puis fusion sans doublon', () => {
  const s1 = { id: '1', debut: 1, fin: 2, duree: 1, tags: [], tache: '' };
  const s2 = { id: '2', debut: 5, fin: 6, duree: 1, tags: ['x'], tache: 'a' };
  const f = JSON.parse(S.exporter({ seances: [s1, s2], etiquettes: ['x'], debut: '2026-10-01' }));
  eq([f.version, f.seances.map((s) => s.id), f.programme.debut], [1, ['2', '1'], '2026-10-01']);
  const r = S.fusionner([s1], [...f.seances, { id: 'faux' }]);
  eq([r.ajoutees, r.seances.map((s) => s.id)], [1, ['2', '1']]);
});

test('histogramme : une barre par jour, la moyenne en pointillés, aujourd\'hui mis en valeur', () => {
  const serie = S.serieJours({ '2026-10-12': 3600, '2026-10-13': 1800 }, '2026-10-13', 14);
  const svg = histogramme(serie, 600, '2026-10-13');
  eq(svg.querySelectorAll('.histo-jour').length, 14);
  eq(svg.querySelectorAll('.histo-jour.auj').length, 1);
  eq(svg.querySelectorAll('.histo-moyenne').length, 1);
  eq(histogramme(serie, null, '2026-10-13').querySelectorAll('.histo-moyenne').length, 0);
  ok(svg.getAttribute('aria-label').includes('moyenne 10 min'));
});

test('écran méthode : ouverture au repos, en séance, en pause et à l\'arrêt, sans erreur', async () => {
  const now = Date.now();
  const cas = {
    repos: null,
    travail: { segments: [{ d: now - 3 * 3600000, f: null }], tags: [], tache: 'x', arret: false },
    pause: { segments: [{ d: now - 600000, f: now - 300000 }], tags: [], tache: '', arret: false },
    arret: { segments: [{ d: now - 600000, f: now - 300000 }], tags: [], tache: '', arret: true },
  };
  for (const [nom, etat] of Object.entries(cas)) {
    const store = { memoire: false, getMeta: async (cle, defaut) => (cle === 'first-methode-en-cours' && etat ? etat : defaut), setMeta: async () => {} };
    const view = document.createElement('div');
    const nettoyer = await renderMethode({ view, store });
    ok(view.querySelector('.chrono'), nom);
    ok(view.querySelectorAll('.actions button').length >= 1, nom);
    eq(view.querySelectorAll('.histo-jour').length, 14, nom);
    if (nom === 'travail') ok(view.querySelector('.etat-seance').textContent.startsWith('Séance en cours depuis'), nom);
    nettoyer();
  }
});

// ---------- calcul mental ----------

// Recalcule la réponse à partir du texte de la question, indépendamment du générateur.
function recalcul(t) {
  const sans = t.replace(/[\s\u202f]/g, '');
  let m;
  if ((m = sans.match(/^(\d+)²$/))) return Number(m[1]) ** 2;
  if ((m = t.match(/^Double de (\d+)$/))) return 2 * Number(m[1]);
  if ((m = t.match(/^Moitié de (\d+)$/))) return Number(m[1]) / 2;
  if ((m = t.replace(/\u202f/g, '').match(/^(\d+) % de (\d+)$/))) return (Number(m[1]) * Number(m[2])) / 100;
  if ((m = t.match(/^(\d+)\/(\d+) de (\d+)$/))) return (Number(m[3]) / Number(m[2])) * Number(m[1]);
  if ((m = t.match(/^(\d+) ([+−]) (\d+) %$/))) return Number(m[1]) + (m[2] === '+' ? 1 : -1) * (Number(m[1]) * Number(m[3])) / 100;
  return Function(`return ${sans.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')}`)();
}

test('calcul mental : quatre niveaux, chacun avec ses types de question', () => {
  eq(Object.keys(NIVEAUX), ['1', '2', '3', '4']);
  for (const n of Object.keys(NIVEAUX)) ok(TYPES.filter((t) => t.niveau === Number(n)).length >= 4, `niveau ${n}`);
});

test('calcul mental : 400 questions par niveau, réponses entières et exactes, astuce sans la solution', () => {
  for (const niveau of [1, 2, 3, 4]) {
    const rng = mulberry32(niveau * 7919);
    let prec = null;
    const vus = new Set();
    for (let i = 0; i < 400; i++) {
      const x = question(niveau, rng, prec);
      ok(Number.isInteger(x.reponse) && x.reponse >= 0, `${x.texte} → ${x.reponse}`);
      eq(x.reponse, recalcul(x.texte), x.texte);
      ok(x.astuce.length > 20, x.type);
      ok(!x.astuce.includes(`${x.texte} =`), `l'astuce donne la solution de ${x.texte}`);
      if (prec) ok(prec.type !== x.type && prec.texte !== x.texte, 'même type de suite');
      vus.add(x.type);
      prec = x;
    }
    eq(vus.size, TYPES.filter((t) => t.niveau === niveau).length, `niveau ${niveau} : tous les types sortent`);
  }
});

test('calcul mental : niveau inconnu refusé ; lecture de la réponse saisie', () => {
  let erreur = false;
  try { question(9); } catch { erreur = true; }
  ok(erreur);
  eq([lireReponse('85'), lireReponse(' 1 234 '), lireReponse('1\u202f234'), lireReponse('12,5'), lireReponse('−7')], [85, 1234, 1234, 12.5, -7]);
  ok(Number.isNaN(lireReponse('')) && Number.isNaN(lireReponse('abc')) && Number.isNaN(lireReponse('1+2')));
  eq([nombre(12), nombre(1000), nombre(1234567)], ['12', `1\u202f000`, `1\u202f234\u202f567`]);
});

test('écran calcul : bonne réponse comptée, mauvaise réponse montre la solution, astuce présente', async () => {
  const store = { memoire: false, getMeta: async (_, d) => d, setMeta: async () => {} };
  const view = document.createElement('div');
  document.body.append(view);
  const nettoyer = await renderCalcul({ view, store, params: { n: '1' } });
  const champ = view.querySelector('.calcul-reponse');
  const entree = () => champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok(view.querySelector('.calcul-question').textContent.length > 2);
  ok(view.querySelector('.tip-bulle').textContent.length > 20);
  eq(view.querySelector('.filtre.actif').textContent, 'Facile');
  champ.value = String(recalcul(view.querySelector('.calcul-question').textContent));
  entree();
  eq(view.querySelector('.compteur').textContent, '1 / 1');
  nettoyer(); // annule l'enchaînement automatique
  champ.readOnly = false;
  champ.value = '999999';
  entree();
  eq(view.querySelector('.compteur').textContent, '1 / 2');
  ok(view.querySelector('.calcul-solution').textContent.startsWith('= '));
  ok(champ.classList.contains('faux'));
  entree(); // solution affichée : Entrée passe à la question suivante
  eq(champ.value, '');
  ok(!champ.readOnly);
  entree(); // champ vide : Entrée ne fait rien (ni réponse comptée, ni solution)
  eq(view.querySelector('.compteur').textContent, '1 / 2');
  eq(view.querySelector('.calcul-solution').textContent, '');
  const passer = view.querySelector('.calcul-passer');
  eq(passer.title, 'Je ne sais pas');
  passer.click(); // la flèche montre la solution et compte comme une erreur
  eq(view.querySelector('.compteur').textContent, '1 / 3');
  ok(view.querySelector('.calcul-solution').textContent.startsWith('= '));
  view.remove();
});
