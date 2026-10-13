// Méthode de travail : un chronomètre de séance (commencer, pause, arrêter), la tâche accomplie, des étiquettes de domaine,
// l'objectif du jour selon la semaine du programme et un histogramme des quatorze derniers jours.
// Tout est stocké dans le navigateur (voir lus.js) ; les séances terminées se lisent dans la sous-page seances.js.
import { h, fill } from '../../js/ui.js';
import { cadre } from './cadre.js';
import { icone } from './icones.js';
import { lire, ecrire } from './lus.js';
import * as S from './suivi.js';

const NS = 'http://www.w3.org/2000/svg';
const JOURS_HISTO = 14;
const jourSemaine = new Intl.DateTimeFormat('fr-FR', { weekday: 'narrow' });
const jourComplet = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const heure = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function el(tag, attrs = {}, texte = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (texte != null) e.textContent = texte;
  return e;
}

// Histogramme du temps de travail par jour (secondes) et ligne grise en pointillés de la moyenne journalière.
export function histogramme(serie, moyenneSec, aujourdhui) {
  const W = 560, H = 150, marge = 6, base = 112, haut = 20;
  const max = Math.max(3600, moyenneSec ?? 0, ...serie.map((j) => j.secondes));
  const pas = (W - 2 * marge) / serie.length;
  const large = pas * 0.6;
  const y = (sec) => base - (sec / max) * (base - haut);
  const svg = el('svg', { class: 'histo-svg', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `Temps de travail des ${serie.length} derniers jours${moyenneSec != null ? `, moyenne ${S.duree(moyenneSec)} par jour` : ''}` });
  svg.append(el('line', { class: 'histo-base', x1: marge, x2: W - marge, y1: base, y2: base }));
  serie.forEach((j, i) => {
    const x = marge + i * pas + (pas - large) / 2;
    const date = S.dateDuJour(j.jour);
    const auj = j.jour === aujourdhui;
    const g = el('g', { class: `histo-jour${auj ? ' auj' : ''}${j.secondes ? '' : ' vide'}` });
    g.append(el('title', {}, `${jourComplet.format(date)} : ${j.secondes ? S.duree(j.secondes) : 'aucune séance'}`));
    const hauteur = j.secondes ? Math.max(3, base - y(j.secondes)) : 2;
    g.append(el('rect', { class: 'barre-histo', x: x.toFixed(1), y: (base - hauteur).toFixed(1), width: large.toFixed(1), height: hauteur.toFixed(1), rx: 3 }));
    g.append(el('text', { class: 'histo-lettre', x: (x + large / 2).toFixed(1), y: base + 17, 'text-anchor': 'middle' }, jourSemaine.format(date)));
    g.append(el('text', { class: 'histo-num', x: (x + large / 2).toFixed(1), y: base + 31, 'text-anchor': 'middle' }, String(date.getDate())));
    if (auj && j.secondes) g.append(el('text', { class: 'histo-valeur', x: (x + large / 2).toFixed(1), y: base - hauteur - 5, 'text-anchor': 'middle' }, S.duree(j.secondes)));
    svg.append(g);
  });
  if (moyenneSec != null) {
    svg.append(el('line', { class: 'histo-moyenne', x1: marge, x2: W - marge, y1: y(moyenneSec).toFixed(1), y2: y(moyenneSec).toFixed(1) }));
    svg.append(el('text', { class: 'histo-moy-texte', x: marge + 2, y: (y(moyenneSec) - 5).toFixed(1) }, `moyenne ${S.duree(moyenneSec)}`));
  }
  return svg;
}

export async function render({ view, store }) {
  let seances = S.triees((await lire(store, S.CLE_SEANCES, [])).filter(S.estSeance));
  let etiquettes = await lire(store, S.CLE_ETIQUETTES, []);
  let debutProgramme = await lire(store, S.CLE_DEBUT, null);
  const brouillon = await lire(store, S.CLE_EN_COURS, null);
  let etat = S.estEtat(brouillon) ? { ...S.etatVide(), ...brouillon } : S.etatVide();
  let note = '';          // message passager affiché au repos (séance archivée, page restée inactive)
  let ajout = false;      // champ de nouvelle étiquette ouvert
  let jourAffiche = S.jourLocal(Date.now());
  let minutesAffichees = -1;

  const sauver = () => ecrire(store, S.CLE_EN_COURS, etat);

  // Séance restée ouverte pendant que la page était fermée : mise en pause à son dernier signe de vie.
  const r0 = S.reprise(etat, Date.now());
  if (r0.interrompue) { etat = r0.etat; note = `Page fermée pendant la séance : mise en pause à ${heure(r0.a)}.`; sauver(); }

  const elHisto = h('div', { class: 'histo' });
  const elObjectif = h('div', { class: 'objectif' });
  const elChrono = h('p', { class: 'chrono', role: 'timer' });
  const elEtat = h('p', { class: 'etat-seance', 'aria-live': 'polite' });
  const elActions = h('div', { class: 'actions' });
  const elTags = h('div', { class: 'tags', role: 'group', 'aria-label': 'Domaines de travail' });
  const zone = h('textarea', { class: 'tache', rows: 3, maxlength: 2000, 'aria-label': 'Tâche accomplie', placeholder: 'Tâche accomplie' }, etat.tache);
  const elCompte = h('span', null);

  // ---------- chiffres du jour (la séance en cours est comptée dans le jour où elle a commencé) ----------
  const actifSec = (now = Date.now()) => (etat.segments.length ? S.tempsActif(etat.segments, now) / 1000 : 0);
  function totaux(now = Date.now()) {
    const t = S.totauxParJour(seances);
    if (etat.segments.length) { const j = S.jourLocal(etat.segments[0].d); t[j] = (t[j] ?? 0) + actifSec(now); }
    return t;
  }

  function dessinerHisto(now = Date.now()) {
    const t = totaux(now);
    const aujourdhui = S.jourLocal(now);
    const serie = S.serieJours(t, aujourdhui, JOURS_HISTO);
    const moy = S.moyenne(serie, S.premierJourTravaille(seances, t));
    fill(elHisto, histogramme(serie, moy, aujourdhui));
  }

  function dessinerObjectif(now = Date.now()) {
    const aujourdhui = S.jourLocal(now);
    const semaine = S.semaineDuProgramme(debutProgramme, aujourdhui);
    const objectif = S.objectifMinutes(semaine) * 60;
    const fait = totaux(now)[aujourdhui] ?? 0;
    const atteint = fait >= objectif;
    fill(elObjectif,
      h('div', { class: 'objectif-ligne' },
        h('span', null, 'Objectif ', h('span', { class: 'large' }, 'du jour '), h('b', null, S.duree(objectif))),
        h('span', { class: 'discret' }, `semaine ${semaine}${semaine <= S.SEMAINES ? `/${S.SEMAINES}` : ''}`),
        h('span', null, 'Aujourd\'hui ', h('b', { class: atteint ? 'atteint' : '' }, S.duree(fait)))),
      h('div', { class: `progression${atteint ? ' atteint' : ''}`, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': Math.round(objectif / 60), 'aria-valuenow': Math.round(fait / 60), 'aria-label': 'Objectif du jour' },
        h('i', { style: `width:${Math.min(100, (fait / objectif) * 100).toFixed(1)}%` })));
  }

  // ---------- séance ----------
  function majChrono(now = Date.now()) {
    elChrono.textContent = S.chrono(etat.segments.length ? S.tempsActif(etat.segments, now) : 0);
    const p = S.phase(etat);
    elChrono.classList.toggle('en-pause', p === 'pause');
    elChrono.classList.toggle('fini', p === 'arret');
    const texte = {
      repos: note,
      travail: S.conseil(etat, now),
      pause: 'En pause',
      arret: 'Séance terminée : écris la tâche accomplie, puis archive-la.',
    }[p];
    if (elEtat.textContent !== texte) elEtat.textContent = texte;
  }

  function dessinerActions() {
    const p = S.phase(etat);
    const bouton = (texte, nomIcone, fn, secondaire = false) => h('button', { type: 'button', class: secondaire ? 'secondaire' : '', onclick: fn },
      icone(nomIcone, { taille: 16 }), texte);
    fill(elActions,
      p === 'repos' ? bouton('Commencer', 'jouer', () => transition(commencer)) : null,
      p === 'travail' ? bouton('Pause', 'pause', () => transition(S.mettreEnPause), true) : null,
      p === 'pause' ? bouton('Reprendre', 'jouer', () => transition(S.reprendre)) : null,
      p === 'travail' || p === 'pause' ? bouton('Arrêter', 'stop', () => transition(S.arreter), true) : null,
      p === 'arret' ? bouton('Archiver la séance', 'coche', archiver) : null,
      p === 'arret' ? bouton('Reprendre', 'jouer', () => transition(S.reprendre), true) : null);
  }

  function dessinerTout() {
    const now = Date.now();
    dessinerHisto(now);
    dessinerObjectif(now);
    dessinerActions();
    dessinerTags();
    majChrono(now);
    elCompte.textContent = `Séances${seances.length ? ` (${seances.length})` : ''}`;
    minutesAffichees = Math.floor(actifSec(now) / 60);
  }

  async function commencer(e, now) {
    if (!debutProgramme) { debutProgramme = S.jourLocal(now); await ecrire(store, S.CLE_DEBUT, debutProgramme); }
    return S.demarrer(e, now);
  }

  async function transition(fn) {
    const now = Date.now();
    note = '';
    etat = await fn(etat, now);
    await sauver();
    dessinerTout();
    if (S.phase(etat) === 'arret') zone.focus();
  }

  async function archiver() {
    const now = Date.now();
    etat.tache = zone.value;
    if (S.tempsActif(etat.segments, now) < 5000) {
      note = 'Séance trop courte pour être archivée.';
    } else {
      const s = S.creerSeance(etat, { now, debutProgramme });
      seances = S.triees([...seances, s]);
      await ecrire(store, S.CLE_SEANCES, seances);
      note = `Séance archivée : ${S.duree(s.duree)}.`;
    }
    etat = S.etatVide(etat.tags);
    zone.value = '';
    await sauver();
    dessinerTout();
  }

  // La tâche est enregistrée quelques instants après la dernière frappe, et en quittant le champ.
  let minuteur = null;
  const memoriserTache = () => { clearTimeout(minuteur); minuteur = null; etat.tache = zone.value; sauver(); };
  zone.addEventListener('input', () => { clearTimeout(minuteur); minuteur = setTimeout(memoriserTache, 400); });
  zone.addEventListener('blur', memoriserTache);

  // ---------- étiquettes ----------
  function choisir(nom) {
    etat.tags = S.basculer(etat.tags, nom);
    sauver();
    dessinerTags();
  }

  function supprimer(nom) {
    etiquettes = etiquettes.filter((e) => e !== nom);
    etat.tags = etat.tags.filter((t) => t !== nom);
    ecrire(store, S.CLE_ETIQUETTES, etiquettes);
    sauver();
    dessinerTags();
  }

  function valider(valeur) {
    ajout = false;
    const r = S.ajouterEtiquette(etiquettes, valeur);
    if (r) {
      etiquettes = r.liste;
      ecrire(store, S.CLE_ETIQUETTES, etiquettes);
      if (!etat.tags.includes(r.nom)) { etat.tags = [...etat.tags, r.nom]; sauver(); }
    }
    dessinerTags();
  }

  function champEtiquette() {
    const input = h('input', { class: 'tag-champ', type: 'text', maxlength: S.LONGUEUR_ETIQUETTE, 'aria-label': 'Nouvelle étiquette', placeholder: 'Domaine' });
    let fini = false;
    const clore = (valeur) => { if (fini) return; fini = true; valider(valeur); };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); clore(input.value); }
      if (e.key === 'Escape') clore('');
    });
    input.addEventListener('blur', () => clore(input.value));
    requestAnimationFrame(() => input.focus());
    return input;
  }

  function dessinerTags() {
    fill(elTags,
      etiquettes.map((nom) => {
        const coche = etat.tags.includes(nom);
        return h('span', { class: 'tag-groupe' },
          h('button', { type: 'button', class: `tag${coche ? ' coche' : ''}`, 'aria-pressed': String(coche), onclick: () => choisir(nom) },
            coche ? icone('coche', { taille: 13 }) : null, nom),
          h('button', { type: 'button', class: 'tag-x', 'aria-label': `Supprimer l'étiquette ${nom}`, title: 'Supprimer l\'étiquette', onclick: () => supprimer(nom) }, icone('croix', { taille: 11 })));
      }),
      ajout ? champEtiquette()
        : h('button', { type: 'button', class: 'tag plus', 'aria-label': 'Ajouter une étiquette', title: 'Ajouter une étiquette', onclick: () => { ajout = true; dessinerTags(); } }, icone('plus', { taille: 14 })));
  }

  // ---------- horloge ----------
  function tick() {
    const now = Date.now();
    const r = S.reprise(etat, now);
    if (r.interrompue) {
      etat = r.etat;
      note = `Page restée inactive : séance mise en pause à ${heure(r.a)}.`;
      sauver();
      dessinerTout();
      return;
    }
    if (S.phase(etat) === 'travail' && now - (etat.vu ?? 0) >= 15000) { etat.vu = now; sauver(); }
    majChrono(now);
    const jour = S.jourLocal(now);
    const minutes = Math.floor(actifSec(now) / 60);
    if (jour !== jourAffiche || minutes !== minutesAffichees) {
      jourAffiche = jour;
      minutesAffichees = minutes;
      dessinerHisto(now);
      dessinerObjectif(now);
    }
  }

  view.append(cadre({
    titre: 'Méthode de travail',
    nom: 'methode',
    outils: [h('a', { class: 'bouton secondaire', href: '#/methode/seances' }, icone('liste', { taille: 16 }), elCompte)],
    corps: h('div', { class: 'methode' },
      elHisto,
      elObjectif,
      h('div', { class: 'seance' }, elChrono, elEtat, elActions, elTags, zone)),
  }));
  dessinerTout();
  const horloge = setInterval(tick, 1000);
  return () => { clearInterval(horloge); clearTimeout(minuteur); if (zone.value !== etat.tache) memoriserTache(); };
}
