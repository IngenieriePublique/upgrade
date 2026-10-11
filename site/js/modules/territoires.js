// Territoires : jeu de cartes (placer, nommer, numéros, préfectures, voisins), Plus ou moins, Qui suis-je ?, fiches.
import { h, fill, plural } from '../ui.js';
import { loadData } from '../data.js';
import { dayKey } from '../srs.js';
import { creerCarte, chargerGeo } from '../carte-svg.js';
import {
  MODES, creerItems, creerQuestion, noterReponse, memeEnsemble, fileDuJour, nouveauxAujourdhui, maitrise, resumeMaitrise,
  indexer, CRITERES, paire, formatNombre, indices, reponseJuste, norm, QUESTIONS_PAR_SEANCE, NOUVEAUX_PAR_JOUR,
} from '../territoires.js';

const charger = () => Promise.all([loadData('territoires/data.json'), chargerGeo()]);
const NIVEAUX = ['Jamais vu', 'Vu', 'Solide (≥ 7 jours)', 'Mûr (≥ 21 jours)'];

function legende() {
  return h('p', { class: 'legende', 'aria-label': 'Légende des couleurs' },
    NIVEAUX.map((n, i) => h('span', null, h("i", { class: `pastille m${i}` }), n)));
}

// ---------------------------------------------------------------------------------------------------
// Accueil du jeu : carte de maîtrise, modes d'entraînement, autres jeux
export async function renderMenu({ view, store }) {
  const [[data, geo], states] = await Promise.all([charger(), store.states()]);
  const items = creerItems(data);
  const m = maitrise(items, states);
  const resume = resumeMaitrise(m);
  const now = Date.now();
  const file = fileDuJour(items, states, now, { dejaNouveauxAujourdhui: nouveauxAujourdhui(items, states, now) });
  const idx = indexer(data);
  const noms = new Map([...idx.dep.values()].map((d) => [d.code, `${d.nom} (${d.code})`]));
  const niveaux = new Map([...m.departements].map(([c, e]) => [c, e.niveau]));
  const carte = creerCarte(geo, { couche: 'departements', fond: 'regions', niveaux, noms, onClic: (c) => { location.hash = `#/territoires/fiche?code=${c}`; } });

  fill(view,
    h('h1', null, 'Territoires'),
    h('p', { class: 'chapo' }, 'Départements, régions, préfectures, numéros, voisins : dix questions par jour suffisent. Chaque réponse alimente la répétition espacée.'),
    file.length
      ? h('a', { class: 'bouton principal', href: '#/territoires/jeu?mode=quotidien' }, `Jeu du jour : ${plural(file.length, 'question', 'questions')}`)
      : h('p', { class: 'alerte' }, 'Rien à voir aujourd\'hui. Reviens demain, ou entraîne-toi librement ci-dessous.'),
    h('section', { class: 'carte' },
      h('h2', null, 'Carte de maîtrise'),
      h('p', { class: 'stats' }, `Départements : ${resume.departements[3]} mûrs · ${resume.departements[2]} solides · ${resume.departements[1]} vus · ${resume.departements[0]} jamais vus (sur ${data.departements.length}). `,
        `Régions : ${resume.regions[3] + resume.regions[2]} solides ou mûres sur ${data.regions.length}.`),
      h('div', { class: 'carte-cadre' }, carte.el), legende(),
      h('p', { class: 'petit' }, 'Clique un département pour ouvrir sa fiche.')),
    h('section', { class: 'carte' },
      h('h2', null, 'S\'entraîner par mode'),
      h('div', { class: 'modes' }, Object.entries(MODES).map(([mode, info]) => {
        const them = items.filter((i) => i.mode === mode);
        const vus = them.filter((i) => states.has(i.id)).length;
        const dus = them.filter((i) => states.has(i.id) && states.get(i.id).due < now + 86400000).length;
        return h('div', { class: 'mode' },
          h('div', null, h('strong', null, info.titre), h('p', { class: 'petit' }, `${info.court} · ${vus}/${them.length} vus${dus ? ` · ${dus} à revoir` : ''}`)),
          h('a', { class: 'bouton', href: `#/territoires/jeu?mode=${mode}` }, 'Jouer'));
      }))),
    h('section', { class: 'carte' },
      h('h2', null, 'Autres jeux'),
      h('div', { class: 'rangee' },
        h('a', { class: 'bouton', href: '#/territoires/plusmoins' }, 'Plus ou moins'),
        h('a', { class: 'bouton', href: '#/territoires/qui' }, 'Qui suis-je ?'),
        h('a', { class: 'bouton', href: '#/territoires/fiches' }, 'Toutes les fiches')),
      h('p', { class: 'petit' }, 'Plus ou moins et Qui suis-je ? ne comptent pas dans la répétition espacée : ce sont des jeux pour se faire un ordre de grandeur et des repères.')));
}

// ---------------------------------------------------------------------------------------------------
// Une partie : file d'éléments dus puis nouveaux, une question à la fois
export async function renderJeu({ view, store, params }) {
  const [data, geo] = await charger();
  const items = creerItems(data);
  const states = await store.states();
  const t0 = Date.now();
  const mode = params.mode ?? 'quotidien';
  const quotidien = mode === 'quotidien';
  if (!quotidien && !MODES[mode]) throw new Error(`mode inconnu : ${mode}`);
  const pool = quotidien ? items : items.filter((i) => i.mode === mode);
  const file = fileDuJour(pool, states, t0, quotidien
    ? { dejaNouveauxAujourdhui: nouveauxAujourdhui(items, states, t0) }
    : { nouveauxParJour: QUESTIONS_PAR_SEANCE, dejaNouveauxAujourdhui: 0 });
  const idx = indexer(data);
  const total = file.length;
  const bilan = { reponses: 0, justes: 0 };
  const reposees = new Set();
  let verrou = false;
  let courant = null;
  const zone = h('div', { class: 'jeu' });
  view.append(zone);

  if (!total) {
    fill(zone, h('h1', null, quotidien ? 'Territoires' : MODES[mode].titre), h('p', { class: 'chapo' }, 'Rien à voir pour le moment.'),
      h('a', { class: 'bouton', href: '#/territoires' }, 'Retour'));
    return;
  }

  async function fin() {
    courant = null;
    if (quotidien) await store.patchDay(dayKey(Date.now()), { done: { territoires: true } });
    fill(zone, h('h1', null, 'Terminé'),
      h('p', { class: 'chapo' }, `${bilan.justes} bonne${bilan.justes > 1 ? 's' : ''} réponse${bilan.justes > 1 ? 's' : ''} sur ${bilan.reponses}.`),
      h('div', { class: 'rangee' },
        h('a', { class: 'bouton principal', href: quotidien ? '#/' : '#/territoires' }, quotidien ? 'Retour à Aujourd\'hui' : 'Retour aux Territoires'),
        h('a', { class: 'bouton', href: '#/territoires' }, 'Carte de maîtrise')));
  }

  function suivante() {
    if (!file.length) { fin(); return; }
    verrou = false;
    const item = file.shift();
    const q = creerQuestion(item, data);
    const debut = Date.now();
    const carte = q.couche ? creerCarte(geo, { couche: q.couche, fond: q.couche === 'departements' ? 'regions' : null, onClic: q.type === 'qcm' ? null : surClic, noms: null }) : null;
    if (carte && q.surbrillance) carte.marquer(q.surbrillance, 'cible');
    const retour = h('div', { class: 'retour', 'aria-live': 'polite' });
    const selection = new Set();
    courant = { q, item, debut, selection, carte, retour, valider: null };

    async function repondre(juste, contenuRetour) {
      if (verrou) return;
      verrou = true;
      const ms = Date.now() - debut;
      const g = noterReponse(juste, ms);
      const nouvelEtat = await store.review(item.id, g, Date.now());
      states.set(item.id, nouvelEtat);
      bilan.reponses++;
      if (juste) bilan.justes++;
      else if (!reposees.has(item.id)) { reposees.add(item.id); file.push(item); }
      const fiche = q.fiche ? h('a', { class: 'lien', href: `#/territoires/fiche?code=${q.fiche}` }, 'Voir la fiche') : null;
      fill(retour,
        h('p', { class: juste ? 'bravo' : 'rate' }, juste ? 'Juste.' : 'Pas tout à fait.'),
        h('p', null, q.explication), contenuRetour, fiche,
        h('button', { class: 'bouton principal large', onclick: suivante, id: 'suivant' }, file.length ? 'Question suivante ' : 'Terminer ', h('kbd', null, 'Entrée')));
      document.getElementById('suivant')?.focus();
    }
    courant.repondre = repondre;

    function surClic(code) {
      if (verrou) return;
      if (q.type === 'clic') {
        const juste = code === q.cible;
        if (!juste) carte.marquer(code, 'faux');
        carte.marquer(q.cible, 'ok');
        const nom = (q.couche === 'regions' ? idx.reg : idx.dep).get(code)?.nom;
        repondre(juste, juste ? null : h('p', { class: 'petit' }, `Tu as cliqué sur ${nom}.`));
      } else if (q.type === 'multi') {
        if (code === q.code) return;
        if (selection.has(code)) { selection.delete(code); carte.chemin(code).classList.remove('sel'); }
        else { selection.add(code); carte.marquer(code, 'sel'); }
        courant.validerBtn.disabled = selection.size === 0;
      }
    }

    const reponses = h('div', { class: q.type === 'qcm' ? 'choix' : 'rangee' });
    if (q.type === 'qcm') {
      q.choix.forEach((c, i) => {
        const b = h('button', { class: 'choix-btn', 'data-valeur': c.valeur, onclick: () => {
          if (verrou) return;
          const juste = c.valeur === q.bonne;
          b.classList.add(juste ? 'ok' : 'faux');
          reponses.querySelectorAll('button').forEach((x) => { x.disabled = true; if (x.dataset.valeur === q.bonne) x.classList.add('ok'); });
          if (carte && q.surbrillance && !juste) carte.marquer(q.surbrillance, 'cible');
          repondre(juste);
        } }, c.libelle, h('kbd', null, String(i + 1)));
        reponses.append(b);
      });
    } else if (q.type === 'multi') {
      courant.validerBtn = h('button', { class: 'bouton principal', disabled: true, onclick: () => {
        if (verrou) return;
        const juste = memeEnsemble(selection, q.cibles);
        for (const c of q.cibles) { carte.chemin(c).classList.remove('sel'); carte.marquer(c, selection.has(c) ? 'ok' : 'manque'); }
        for (const c of selection) if (!q.cibles.includes(c)) carte.marquer(c, 'faux');
        repondre(juste);
      } }, 'Valider', h('kbd', null, 'Entrée'));
      reponses.append(courant.validerBtn);
    }
    if (q.type !== 'qcm') {
      reponses.append(h('button', { class: 'lien', onclick: () => {
        if (verrou) return;
        if (q.type === 'clic') carte.marquer(q.cible, 'ok');
        else for (const c of q.cibles) carte.marquer(c, 'manque');
        repondre(false);
      } }, 'Je ne sais pas'));
    }

    fill(zone,
      h('div', { class: 'entete-rev' }, h('span', null, `${plural(file.length + 1, 'question restante', 'questions restantes')}`), h('a', { class: 'lien', href: quotidien ? '#/' : '#/territoires' }, 'Arrêter')),
      h('div', { class: 'barre', 'aria-hidden': 'true' }, h('div', { style: `width:${Math.round(100 * (total - file.length - 1) / total)}%` })),
      h('article', { class: 'face' },
        h('p', { class: 'etiquette' }, MODES[item.mode].titre),
        h('p', { class: 'recto' }, q.consigne),
        carte ? h('div', { class: 'carte-cadre' }, carte.el) : null,
        reponses, retour));
  }

  function surTouche(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !courant) return;
    const { q } = courant;
    if (!verrou && q.type === 'qcm' && ['1', '2', '3', '4'].includes(e.key)) {
      const b = zone.querySelectorAll('.choix-btn')[Number(e.key) - 1];
      if (b) { e.preventDefault(); b.click(); }
    } else if (!verrou && q.type === 'multi' && e.key === 'Enter' && !courant.validerBtn.disabled) {
      e.preventDefault(); courant.validerBtn.click();
    } else if (verrou && e.key === 'Enter') {
      const s = document.getElementById('suivant');
      if (s && document.activeElement !== s) { e.preventDefault(); s.click(); }
    }
  }
  document.addEventListener('keydown', surTouche);
  suivante();
  return () => document.removeEventListener('keydown', surTouche);
}

// ---------------------------------------------------------------------------------------------------
// Plus ou moins
export async function renderPlusMoins({ view, store, params }) {
  const data = await loadData('territoires/data.json');
  const critere = CRITERES[params.critere] ? params.critere : 'population';
  const niveau = params.niveau === 'regions' ? 'regions' : 'departements';
  let record = await store.getMeta('terr-plusmoins-record', 0);
  let serie = 0;
  const zone = h('div');
  const lien = (c, n, texte, actif) => h('a', { class: `bouton${actif ? ' principal' : ''}`, href: `#/territoires/plusmoins?critere=${c}&niveau=${n}` }, texte);

  function tour() {
    const p = paire(data, critere, Math.random, niveau);
    const carte = (cote, t) => h('button', { class: 'duel', onclick: () => repondre(cote, p, bouton) },
      h('strong', null, t.nom), h('span', { class: 'petit' }, niveau === 'departements' ? `(${t.code})` : ''));
    const bouton = [carte('a', p.a), carte('b', p.b)];
    fill(zone,
      h('p', { class: 'chapo' }, `Lequel est ${CRITERES[critere].titre} ?`),
      h('div', { class: 'duels' }, bouton),
      h('p', { class: 'petit', 'aria-live': 'polite', id: 'pm-retour' }, `Série en cours : ${serie} · Record : ${record}`));
  }

  async function repondre(cote, p, boutons) {
    boutons.forEach((b) => { b.disabled = true; });
    const juste = cote === p.bonne;
    const unite = CRITERES[critere].unite;
    boutons[0].append(h('span', { class: 'valeur' }, formatNombre(p.va, unite)));
    boutons[1].append(h('span', { class: 'valeur' }, formatNombre(p.vb, unite)));
    boutons[cote === 'a' ? 0 : 1].classList.add(juste ? 'ok' : 'faux');
    if (!juste) boutons[p.bonne === 'a' ? 0 : 1].classList.add('ok');
    serie = juste ? serie + 1 : 0;
    if (serie > record) { record = serie; await store.setMeta('terr-plusmoins-record', record); }
    const retour = document.getElementById('pm-retour');
    retour.textContent = `${juste ? 'Juste.' : 'Raté.'} Série : ${serie} · Record : ${record}. `;
    retour.append(h('button', { class: 'bouton principal', onclick: tour, id: 'pm-suite' }, 'Suivant'));
    document.getElementById('pm-suite').focus();
  }

  fill(view, h('h1', null, 'Plus ou moins'),
    h('div', { class: 'rangee' },
      Object.keys(CRITERES).map((c) => lien(c, niveau, c === 'densite' ? 'Densité' : c === 'superficie' ? 'Superficie' : 'Population', c === critere)),
      lien(critere, 'departements', 'Départements', niveau === 'departements'), lien(critere, 'regions', 'Régions', niveau === 'regions')),
    zone,
    h('p', { class: 'petit' }, `Sources : Wikidata (population, année indiquée dans chaque fiche, et superficie). Les paires affichées diffèrent d'au moins 15 % : les années de recensement différentes ne changent pas le résultat. `,
      h('a', { href: '#/territoires' }, 'Retour')));
  tour();
}

// ---------------------------------------------------------------------------------------------------
// Qui suis-je ?
export async function renderQui({ view }) {
  const data = await loadData('territoires/data.json');
  const zone = h('div');
  let score = 0;
  let manches = 0;

  function manche() {
    const d = data.departements[Math.floor(Math.random() * data.departements.length)];
    const liste = indices(d, data);
    let vus = 1;
    const champ = h('input', { type: 'text', list: 'dep-liste', placeholder: 'Nom ou numéro', 'aria-label': 'Ta réponse', autocomplete: 'off' });
    const retour = h('div', { 'aria-live': 'polite' });
    const indicesEl = h('ol', { class: 'indices' });
    let fini = false;

    function dessinerIndices() { fill(indicesEl, liste.slice(0, vus).map((t) => h('li', null, t))); }
    function terminer(juste) {
      fini = true;
      manches++;
      const pts = juste ? Math.max(1, liste.length - vus + 1) : 0;
      score += pts;
      vus = liste.length;
      dessinerIndices();
      fill(retour,
        h('p', { class: juste ? 'bravo' : 'rate' }, juste ? `Juste ! +${pts} point${pts > 1 ? 's' : ''}.` : `C'était ${d.nom} (${d.code}).`),
        h('p', { class: 'petit' }, `Score : ${score} en ${plural(manches, 'manche', 'manches')}. `, h('a', { href: `#/territoires/fiche?code=${d.code}` }, 'Fiche')),
        h('button', { class: 'bouton principal', onclick: manche }, 'Manche suivante'));
    }
    function envoyer(e) {
      e?.preventDefault();
      if (fini || !champ.value.trim()) return;
      if (reponseJuste(champ.value, d)) terminer(true);
      else { fill(retour, h('p', { class: 'rate' }, 'Non.')); if (vus < liste.length) { vus++; dessinerIndices(); } else terminer(false); }
      champ.value = '';
    }
    dessinerIndices();
    fill(zone,
      h('p', { class: 'chapo' }, 'Trouve le département. Moins tu demandes d\'indices, plus tu gagnes de points.'),
      indicesEl,
      h('form', { class: 'rangee', onsubmit: envoyer }, champ, h('button', { class: 'bouton principal', type: 'submit' }, 'Répondre'),
        h('button', { class: 'bouton', type: 'button', onclick: () => { if (!fini && vus < liste.length) { vus++; dessinerIndices(); } } }, 'Indice suivant'),
        h('button', { class: 'lien', type: 'button', onclick: () => { if (!fini) terminer(false); } }, 'Abandonner')),
      retour);
    champ.focus();
  }

  fill(view, h('h1', null, 'Qui suis-je ?'), zone,
    h('datalist', { id: 'dep-liste' }, data.departements.map((d) => h('option', { value: d.nom }))),
    h('p', { class: 'petit' }, 'Indices : Wikidata, liste des préfectures et extrait de Wikipédia (CC BY-SA). ', h('a', { href: '#/territoires' }, 'Retour')));
  manche();
}

// ---------------------------------------------------------------------------------------------------
// Fiches
export async function renderFiches({ view }) {
  const data = await loadData('territoires/data.json');
  const filtre = h('input', { type: 'search', placeholder: 'Rechercher un département ou une région', 'aria-label': 'Rechercher' });
  const liste = h('ul', { class: 'liste-fiches' });
  function dessiner() {
    const q = norm(filtre.value);
    const rows = [
      ...data.regions.map((r) => ({ code: `r:${r.code}`, nom: r.nom, sous: 'région' })),
      ...data.departements.map((d) => ({ code: d.code, nom: d.nom, sous: d.code })),
    ].filter((x) => !q || norm(x.nom).includes(q) || norm(x.sous).includes(q));
    fill(liste, rows.map((x) => h('li', null, h('a', { href: `#/territoires/fiche?code=${x.code}` }, x.nom), ' ', h('span', { class: 'petit' }, x.sous))));
  }
  filtre.addEventListener('input', dessiner);
  fill(view, h('h1', null, 'Fiches territoriales'), h('p', { class: 'chapo' }, `${data.departements.length} départements et ${data.regions.length} régions.`), filtre, liste,
    h('p', null, h('a', { href: '#/territoires' }, 'Retour')));
  dessiner();
}

const lien = (href, texte) => h('a', { href, target: '_blank', rel: 'noopener' }, texte);

export async function renderFiche({ view, params }) {
  const [data, geo] = await charger();
  const idx = indexer(data);
  const brut = params.code ?? '';
  const estRegion = brut.startsWith('r:');
  const t = estRegion ? idx.reg.get(brut.slice(2)) : idx.dep.get(brut);
  if (!t) throw new Error(`territoire inconnu : ${brut}`);
  const carte = creerCarte(geo, { couche: estRegion ? 'regions' : 'departements', fond: estRegion ? null : 'regions', etiquettes: false });
  carte.marquer(estRegion ? t.code : t.code, 'cible');
  if (!estRegion) for (const v of t.voisins) carte.marquer(v, 'voisin');
  const ligne = (k, v) => h('div', { class: 'fait' }, h('dt', null, k), h('dd', null, v));
  const pop = `${formatNombre(t.population.valeur)} habitants (${t.population.annee})`;
  const sup = t.superficie_km2 ? `${formatNombre(t.superficie_km2)} km²` : 'non disponible (le Rhône et la métropole de Lyon ont des périmètres distincts dans les sources)';

  fill(view,
    h('p', { class: 'petit' }, h('a', { href: '#/territoires/fiches' }, '← Toutes les fiches')),
    h('h1', null, estRegion ? t.nom : `${t.nom} (${t.code})`),
    h('div', { class: 'carte-cadre petite' }, carte.el),
    h('dl', { class: 'faits' },
      estRegion ? [
        ligne('Préfecture de région', t.prefecture),
        ligne('Départements', h('span', null, t.departements.map((c, i) => [i ? ', ' : '', h('a', { href: `#/territoires/fiche?code=${c}` }, idx.dep.get(c).nom)]))),
      ] : [
        ligne('Région', h('a', { href: `#/territoires/fiche?code=r:${t.region}` }, idx.reg.get(t.region).nom)),
        ligne('Préfecture', `${t.prefecture}${t.prefecture_region ? ' (aussi préfecture de région)' : ''}`),
        ligne('Sous-préfectures', t.sous_prefectures.length ? t.sous_prefectures.join(', ') : 'aucune'),
        ligne('Départements limitrophes', t.voisins.length
          ? h('span', null, t.voisins.map((c, i) => [i ? ', ' : '', h('a', { href: `#/territoires/fiche?code=${c}` }, idx.dep.get(c).nom)])) : 'aucun'),
      ],
      ligne('Population', pop), ligne('Superficie', sup)),
    h('section', { class: 'carte' },
      h('h2', null, 'Wikipédia'),
      h('blockquote', null, t.intro),
      h('p', { class: 'petit' }, `Texte : ${lien('https://fr.wikipedia.org/wiki/' + t.article.replace(/ /g, '_'), 'Wikipédia')}, licence CC BY-SA, extrait revu le ${t.revu}.`)),
    h('details', { class: 'sources' }, h('summary', null, 'Sources'),
      h('ul', null, t.sources.map((s) => h('li', null, lien(s.url, s.titre))))));
}
