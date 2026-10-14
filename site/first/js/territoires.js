// Jeu des territoires. Quatre formats au choix avant de jouer (régions, départements d'une région, villes, pays d'un continent) ;
// avant chaque série, un écran de révision montre la carte zoomée avec les noms et les préfectures.
// Logique des questions : formats.js et site/js/territoires.js (partagée avec Upgrade) ; progression : répétition espacée d'Upgrade.
import { h, fill } from '../../js/ui.js';
import { loadData } from '../../js/data.js';
import { creerCarte, chargerGeo } from '../../js/carte-svg.js';
import { noterReponse } from '../../js/territoires.js';
import { cadre } from './cadre.js';
import { iconeDetaillee } from './icones.js';
import { bornes, carteMonde, cartePays, carteVilles, largeurVue, legendesEncarts, optionsCarte, poserRevision } from './carte-first.js';
import { FORMATS, TITRES_MODES, continent, continents, creerQuestionFirst, groupe, groupes, lignesEtude, serie } from './formats.js';

const ICONES_FORMAT = { regions: 'regions', departements: 'departements', villes: 'villes', pays: 'pays' };

// Adresse de l'écran de choix (région, continent) d'un format ; sans choix intermédiaire, le menu des formats.
const retourFormat = (format) => (format === 'departements' || format === 'pays' ? `#/territoires?f=${format}` : '#/territoires');

export async function render({ view, store, params }) {
  const [data, geo, donneesVilles, donneesPref, monde] = await Promise.all([loadData('territoires/data.json'), chargerGeo(), loadData('territoires/villes.json'),
    loadData('territoires/prefectures.json'), loadData('territoires/pays.json')]);
  const villes = donneesVilles.villes;
  const prefectures = donneesPref.prefectures;
  const format = FORMATS[params.f] ? params.f : null;
  const g = format === 'departements' ? groupe(data, params.r) : format === 'pays' ? continent(monde, params.r) : null;

  const zone = h('div', { class: 'jeu' });
  const compteur = h('span', { class: 'compteur', 'aria-live': 'polite' });
  const liens = [];
  if (format) liens.push(h('a', { class: 'filtre', href: '#/territoires' }, 'Formats'));
  if (g) liens.push(h('a', { class: 'filtre', href: `#/territoires?f=${format}` }, format === 'pays' ? 'Continents' : 'Régions'));
  view.append(cadre({
    titre: 'Jeu des territoires',
    nom: 'territoires',
    outils: [compteur, liens.length ? h('nav', { class: 'filtres', 'aria-label': 'Retour' }, liens) : null],
    corps: zone,
  }));

  if (!format) { menuFormats(zone, data, villes, monde); return undefined; }
  if (format === 'departements' && !g) { choixRegion(zone, geo, data); return undefined; }
  if (format === 'pays' && !g) { await choixContinent(zone, monde); return undefined; }
  // Cartes supplémentaires : un continent pour les pays ; le monde centré sur les territoires français pour l'outre-mer.
  const geoPays = format === 'pays' ? await loadData(`geo/monde-${g.code}.json`) : null;
  const geoOm = format === 'regions' || (format === 'departements' && g.outreMer) ? await loadData('geo/monde-om.json') : null;
  return jouer({ zone, compteur, store, data, geo, geoPays, geoOm, villes, prefectures, format, g });
}

// ---------- choix du format ----------

function menuFormats(zone, data, villes, monde) {
  const nb = { regions: `${data.regions.length} régions`, departements: `${data.departements.length} départements`, villes: `${villes.length} villes`, pays: `${monde.pays.length} pays` };
  fill(zone, h('div', { class: 'formats' }, Object.entries(FORMATS).map(([cle, f]) => h('a', { class: 'format', href: `#/territoires?f=${cle}` },
    iconeDetaillee(ICONES_FORMAT[cle], { taille: 56 }),
    h('span', { class: 'format-titre' }, f.titre),
    h('span', { class: 'format-nb' }, nb[cle]),
    h('span', { class: 'format-detail' }, f.detail)))));
  zone.classList.add('sans-carte', 'menu');
}

// Régions de métropole et outre-mer, chacune en petite carte zoomée.
function choixRegion(zone, geo, data) {
  fill(zone, h('div', { class: 'regions-choix' },
    h('p', { class: 'etiquette' }, 'Départements : choisis une région'),
    h('div', { class: 'regions-grille' }, groupes(data).map((gr) => {
      const mini = creerCarte(geo, { couche: 'departements', ...optionsCarte(geo, data, 'departements', gr, { legendes: false }) });
      mini.el.removeAttribute('role');
      mini.el.setAttribute('aria-hidden', 'true');
      mini.el.querySelectorAll('.t.hors').forEach((p) => p.remove()); // seulement la région, sans contexte
      return h('a', { class: 'region-choix', href: `#/territoires?f=departements&r=${gr.code}` },
        h('span', { class: 'region-mini' }, mini.el),
        h('span', { class: 'region-nom' }, gr.nom),
        h('span', { class: 'region-nb' }, `${gr.deps.length} département${gr.deps.length > 1 ? 's' : ''}`));
    }))));
  zone.classList.add('sans-carte', 'menu');
}

// Continents, chacun en petite carte zoomée.
async function choixContinent(zone, monde) {
  const liste = continents(monde);
  const geos = await Promise.all(liste.map((c) => loadData(`geo/monde-${c.code}.json`)));
  fill(zone, h('div', { class: 'regions-choix' },
    h('p', { class: 'etiquette' }, 'Pays : choisis un continent'),
    h('div', { class: 'regions-grille continents' }, liste.map((c, i) => {
      const mini = cartePays(geos[i], new Set(c.pays.map((p) => p.id)), new Map());
      mini.el.removeAttribute('role');
      mini.el.setAttribute('aria-hidden', 'true');
      mini.el.querySelectorAll('.pays.hors').forEach((p) => p.remove()); // seulement le continent, sans contexte
      return h('a', { class: 'region-choix', href: `#/territoires?f=pays&r=${c.code}` },
        h('span', { class: 'region-mini' }, mini.el),
        h('span', { class: 'region-nom' }, c.nom),
        h('span', { class: 'region-nb' }, `${c.pays.length} pays`));
    }))));
  zone.classList.add('sans-carte', 'menu');
}

// ---------- révision puis jeu ----------

async function jouer({ zone, compteur, store, data, geo, geoPays, geoOm, villes, prefectures, format, g }) {
  const states = await store.states();
  zone.classList.toggle('pays-jeu', format === 'pays');
  const lignes = lignesEtude(format, data, villes, g);
  const titreFormat = format === 'departements' ? `Départements · ${g.nom}` : format === 'pays' ? `Pays · ${g.nom}` : FORMATS[format].titre;
  const actifsPays = format === 'pays' ? new Set(g.pays.map((p) => p.id)) : null;
  const nomsPays = format === 'pays' ? new Map(g.pays.map((p) => [p.id, p.nom])) : null;

  let file = [];
  let total = 0;
  let bilan = { reponses: 0, justes: 0 };
  let courant = null;
  let verrou = false;
  const reposees = new Set();

  // Carte de la question ou de la révision, selon le format.
  function fabriquerCarte(q, { onClic = null, legendes = false } = {}) {
    if (format === 'pays') return cartePays(geoPays, actifsPays, nomsPays, { onClic });
    if (q?.couche === 'villes' || (!q && format === 'villes')) return carteVilles(geo, data, villes, { onClic, population: !q });
    const couche = q?.couche ?? (format === 'regions' ? 'regions' : 'departements');
    const opt = optionsCarte(geo, data, format, g, { legendes });
    return creerCarte(geo, { couche, onClic, ...opt });
  }

  // Noms des zones et pins des préfectures de l'écran de révision, placés sans chevauchement.
  function poserPins(carte) {
    const vb = largeurVue(carte);
    if (format === 'regions') {
      const taille = vb / 58;
      const zones = data.regions.filter((r) => !r.outre_mer).map((r) => ({ id: r.code, x: geo.regions[r.code].c[0], y: geo.regions[r.code].c[1], texte: r.nom }));
      const pins = data.regions.map((r) => {
        const p = prefectures[r.departements.find((c) => data.departements.find((d) => d.code === c).prefecture_region)];
        const drom = r.outre_mer;
        return { id: r.code, x: p.x, y: p.y, nom: p.nom, echelle: drom ? 0.6 : 1, taille: drom ? taille * 0.7 : taille * 1.02 };
      });
      return poserRevision(carte, { zones, pins, taille, evite: legendesEncarts(geo) });
    }
    if (format === 'pays') {
      // Nom du pays au centre de la carte, pin et nom de la capitale ; un pays trop petit reçoit un seul nom, pays et capitale.
      const t = vb / 64;
      const zones = g.pays.filter((p) => !p.petit).map((p) => ({ id: p.id, x: p.cx, y: p.cy, texte: p.nom }));
      const pins = g.pays.map((p) => ({ id: p.id, x: p.x, y: p.y, nom: p.petit && p.nom !== p.capitale ? `${p.nom} (${p.capitale})` : p.capitale }));
      return poserRevision(carte, { zones, pins, taille: t });
    }
    const taille = vb / 44;
    if (g.outreMer) {
      return poserRevision(carte, { pins: g.deps.map((c) => ({ id: c, x: prefectures[c].x, y: prefectures[c].y, nom: prefectures[c].nom })), taille, evite: legendesEncarts(geo) });
    }
    // Un département trop petit pour son nom (petite couronne de Paris) n'a pas d'étiquette de zone : son numéro est joint à sa préfecture.
    const petit = (c) => { const b = bornes(geo, 'departements', [c]); return b.x1 - b.x0 < vb / 7; };
    const zones = g.deps.filter((c) => !petit(c)).map((c) => ({ id: c, x: geo.departements[c].c[0], y: geo.departements[c].c[1], texte: `${c} ${data.departements.find((d) => d.code === c).nom}` }));
    const pins = g.deps.map((c) => ({ id: c, x: prefectures[c].x, y: prefectures[c].y, nom: petit(c) ? `${prefectures[c].nom} (${c})` : prefectures[c].nom }));
    return poserRevision(carte, { zones, pins, taille });
  }

  // ----- écran de révision : noms et préfectures avant de jouer
  function etude() {
    courant = null;
    compteur.textContent = '';
    zone.classList.remove('sans-carte', 'menu');
    const carte = fabriquerCarte(null, { legendes: true });
    let pins = new Map();
    if (format === 'villes') carte.nommerTout();
    else pins = poserPins(carte);
    const monde = geoOm ? carteMonde(geoOm, data) : null;
    const items = lignes.map((l) => {
      const li = h('li', { 'data-code': l.code }, h('b', null, l.titre), h('span', null, l.detail));
      const cible = carte.chemin(l.code);
      const pin = pins.get(l.code);
      const repere = monde?.chemin(l.code);
      const allume = (on) => { li.classList.toggle('survol', on); cible?.classList.toggle('survol', on); pin?.classList.toggle('survol', on); repere?.classList.toggle('survol', on); };
      li.addEventListener('pointerenter', () => allume(true));
      li.addEventListener('pointerleave', () => allume(false));
      cible?.addEventListener('pointerenter', () => allume(true));
      cible?.addEventListener('pointerleave', () => allume(false));
      return li;
    });
    const enTete = { regions: 'Régions et préfectures de région', departements: `Départements et préfectures · ${g?.nom ?? ''}`, villes: 'Principales villes de France',
      pays: `Pays et capitales · ${g?.nom ?? ''}` }[format];
    fill(zone,
      h('div', { class: 'jeu-carte' }, carte.el),
      h('div', { class: 'panneau etude' },
        h('p', { class: 'etiquette' }, 'À revoir avant de jouer'),
        h('h2', { class: 'consigne' }, enTete),
        format === 'villes' ? h('p', { class: 'discret legende-etude' }, 'La taille des pastilles suit la population (Wikidata).') : null,
        h('ul', { class: `liste-etude${lignes.length > 24 ? ' trois compacte' : monde && lignes.length > 6 ? ' deux compacte' : lignes.length > 12 ? ' deux' : ''}` }, items),
        monde ? h('div', { class: 'monde-mini' }, h('p', { class: 'etiquette' }, 'Position dans le monde'), monde.el) : null,
        h('div', { class: 'rangee' },
          h('button', { id: 'commencer', onclick: nouvelleSerie }, 'Commencer', h('kbd', null, 'Entrée')),
          h('a', { class: 'bouton secondaire', href: retourFormat(format) }, 'Changer'))));
    document.getElementById('commencer')?.focus();
  }

  function nouvelleSerie() {
    file = serie(format, data, villes, g, states);
    total = file.length;
    bilan = { reponses: 0, justes: 0 };
    reposees.clear();
    suivante();
  }

  function fin() {
    courant = null;
    compteur.textContent = '';
    zone.classList.add('sans-carte');
    fill(zone, h('div', { class: 'panneau centre' },
      h('p', { class: 'etiquette' }, titreFormat),
      h('p', { class: 'grand' }, `${bilan.justes} sur ${bilan.reponses}`),
      h('p', { class: 'discret' }, bilan.justes === bilan.reponses ? 'Sans faute.' : 'Les questions ratées reviendront bientôt.'),
      h('div', { class: 'rangee' },
        h('button', { id: 'rejouer', onclick: etude }, 'Revoir la carte et rejouer'),
        h('a', { class: 'bouton secondaire', href: retourFormat(format) }, 'Autre choix'))));
    document.getElementById('rejouer')?.focus();
  }

  function suivante() {
    if (!file.length) { fin(); return; }
    verrou = false;
    const item = file.shift();
    const q = creerQuestionFirst(item, data, villes, Math.random, g?.pays);
    const debut = Date.now();
    const surClic = q.type === 'clic' ? (code) => repondreClic(code) : null;
    const carte = q.couche ? fabriquerCarte(q, { onClic: surClic }) : null;
    if (carte && q.surbrillance) carte.marquer(q.surbrillance, 'cible');
    const retour = h('div', { class: 'retour-jeu', 'aria-live': 'polite' });
    const reponses = h('div', { class: q.type === 'qcm' ? 'choix' : 'rangee' });
    courant = { q };
    compteur.textContent = `${Math.min(total, total - file.length)} / ${total}`;

    async function repondre(juste) {
      if (verrou) return;
      verrou = true;
      reponses.querySelector('.inconnu')?.remove();
      const etat = await store.review(item.id, noterReponse(juste, Date.now() - debut), Date.now());
      states.set(item.id, etat);
      bilan.reponses++;
      if (juste) bilan.justes++;
      else if (!reposees.has(item.id)) { reposees.add(item.id); file.push({ ...item }); }
      fill(retour,
        h('p', { class: juste ? 'juste' : 'rate' }, juste ? 'Juste.' : 'Pas tout à fait.'),
        h('p', null, q.explication),
        h('button', { id: 'suivant', onclick: suivante }, file.length ? 'Suivante' : 'Terminer', h('kbd', null, 'Entrée')));
      document.getElementById('suivant')?.focus();
    }

    function repondreClic(code) {
      if (verrou) return;
      const juste = code === q.cible;
      if (!juste) { carte.marquer(code, 'faux'); carte.nommer?.(code); }
      carte.marquer(q.cible, 'ok');
      carte.nommer?.(q.cible);
      repondre(juste);
    }

    if (q.type === 'qcm') {
      q.choix.forEach((c, i) => {
        const b = h('button', { class: 'choix-btn secondaire', 'data-valeur': c.valeur, onclick: () => {
          if (verrou) return;
          const juste = c.valeur === q.bonne;
          b.classList.add(juste ? 'ok' : 'faux');
          reponses.querySelectorAll('button').forEach((x) => { x.disabled = true; if (x.dataset.valeur === q.bonne) x.classList.add('ok'); });
          if (carte && q.surbrillance) { carte.retirer('cible'); carte.marquer(q.surbrillance, 'ok'); carte.nommer?.(q.surbrillance); }
          repondre(juste);
        } }, h('span', null, c.libelle), h('kbd', null, String(i + 1)));
        reponses.append(b);
      });
    } else {
      reponses.append(h('button', { class: 'secondaire inconnu', onclick: () => {
        if (verrou) return;
        carte.marquer(q.cible, 'ok');
        carte.nommer?.(q.cible);
        repondre(false);
      } }, 'Je ne sais pas'));
    }

    fill(zone,
      carte ? h('div', { class: 'jeu-carte' }, carte.el) : null,
      h('div', { class: `panneau${carte ? '' : ' centre'}` },
        h('div', { class: 'progression', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.max(0, Math.round(100 * (total - file.length - 1) / total))}%` })),
        h('p', { class: 'etiquette' }, `${titreFormat} · ${TITRES_MODES[item.mode]}`),
        h('p', { class: 'consigne' }, q.consigne),
        reponses,
        retour));
    zone.classList.toggle('sans-carte', !carte);
  }

  function surTouche(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !courant) return;
    if (!verrou && courant.q.type === 'qcm' && ['1', '2', '3', '4'].includes(e.key)) {
      const b = zone.querySelectorAll('.choix-btn')[Number(e.key) - 1];
      if (b) { e.preventDefault(); b.click(); }
    } else if (verrou && e.key === 'Enter') {
      const s = document.getElementById('suivant');
      if (s && document.activeElement !== s) { e.preventDefault(); s.click(); }
    }
  }
  document.addEventListener('keydown', surTouche);
  etude();
  return () => document.removeEventListener('keydown', surTouche);
}
