// Atelier d'écriture : cycle « corpus → note chronométrée → auto-évaluation → note modèle → réécriture », plus des exercices courts.
// Tout ce qui est écrit reste dans le navigateur (notes « redac: ») et dans les sauvegardes, jamais dans le dépôt.
import { h, fill, copierTexte } from '../ui.js';
import { loadData } from '../data.js';
import { startTimer, stopTimer, timerLabel } from '../timer.js';
import { compterMots, essaisDepuisNotes, statutEssai, statutExercice, dernierEssai, scoreGrille, tendance, etapeSuivante,
  resume, promptRetourNote, resumePortfolio, projetCourant, ID_ESSAI } from '../atelier.js';

const ONGLETS = [
  { id: 'accueil', label: 'Atelier', href: '#/atelier' },
  { id: 'portfolio', label: 'Portfolio', href: '#/atelier/portfolio' },
  { id: 'grille', label: 'Grille', href: '#/atelier/grille' },
];

export function sousNav(actif) {
  return h('nav', { class: 'onglets', 'aria-label': 'Atelier d\'écriture' },
    ONGLETS.map((o) => h('a', { href: o.href, class: o.id === actif ? 'actif' : '', 'aria-current': o.id === actif ? 'page' : null }, o.label)));
}

async function charger(store) {
  const [grille, notes, courts, portfolio, notesStore] = await Promise.all([
    loadData('atelier/grille.json'), loadData('atelier/notes.json'), loadData('atelier/courts.json'),
    loadData('atelier/portfolio.json'), store.notes()]);
  return { grille, notes: notes.notes, courts: courts.courts, typesCourts: courts.types, portfolio, notesStore,
    essais: essaisDepuisNotes(notesStore), avertissementNotes: notes.avertissement };
}

const LIBELLE_STATUT = { nouveau: 'à faire', brouillon: 'en cours', 'a-evaluer': 'à évaluer', 'a-reecrire': 'à réécrire', 'a-comparer': 'à comparer', termine: 'terminé' };
const statut = (s) => h('span', { class: `statut st-${s}` }, LIBELLE_STATUT[s]);
const lien = (path, params) => `#/atelier/${path}?${new URLSearchParams(params)}`;
// Espaces insécables avant %, €, ponctuation haute et dans les guillemets français : évite les coupures de ligne disgracieuses.
const typo = (t) => t.replace(/(\d) (%|€|M€|Md€|ans|années)/g, '$1\u00a0$2').replace(/ ([;:!?»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');
const minutes = (sec) => `${Math.max(1, Math.round(sec / 60))} min`;

// Bloc du jeudi dans Aujourd'hui : la prochaine étape de l'atelier, ou le projet de portfolio en cours.
export async function blocJeudi(store) {
  const d = await charger(store);
  const e = etapeSuivante(d.essais, d.notes, d.courts);
  if (e) { const a = actionEtape(e, d); return { href: a.href, note: `${a.texte}.` }; }
  const c = projetCourant(d.notesStore, d.portfolio.projets);
  if (c) return { href: `#/atelier/projet?id=${c.p.id}`, note: `Portfolio : « ${c.p.titre} ».` };
  return null;
}

// ---- Accueil ----

function actionEtape(e, d) {
  const note = d.notes.find((n) => n.id === e.exId);
  const court = d.courts.find((c) => c.id === e.exId);
  const titre = (note ?? court)?.titre ?? e.exId;
  switch (e.action) {
    case 'ecrire': return { texte: `Reprendre ta note « ${titre} »`, href: lien('ecrire', { id: e.exId, t: e.essai.ts }) };
    case 'evaluer': return { texte: `Évaluer ta note « ${titre} » avec la grille`, href: lien('evaluer', { id: e.exId, t: e.essai.ts }) };
    case 'reecrire': return { texte: `Réécrire ta note « ${titre} »`, href: lien('reecrire', { id: e.exId, t: e.essai.ts }) };
    case 'comparer': return { texte: `Comparer ta réponse au modèle : « ${titre} »`, href: lien('court', { id: e.exId, t: e.essai.ts }) };
    case 'nouveau-court': return { texte: `Exercice court : « ${titre} »`, href: lien('court', { id: e.exId }) };
    default: return { texte: `Nouvelle note : « ${titre} »`, href: lien('ecrire', { id: e.exId }) };
  }
}

export async function renderAccueil({ view, store }) {
  const d = await charger(store);
  const suivante = etapeSuivante(d.essais, d.notes, d.courts);
  const r = resume(d.essais, d.notes, d.courts);
  const t = tendance(d.essais, d.grille.criteres);
  const p = resumePortfolio(d.notesStore, d.portfolio.projets);

  fill(view,
    h('h1', null, 'Atelier d\'écriture'),
    sousNav('accueil'),
    h('p', { class: 'chapo' }, 'Une note claire de deux pages, écrite en une heure à partir d\'un dossier, est la preuve la plus convaincante de ta valeur d\'analyste. L\'atelier t\'y entraîne chaque semaine, et le portfolio transforme ces notes en livrables publiables.'),
    suivante
      ? h('div', { class: 'carte prochaine' }, h('p', { class: 'etiquette' }, 'Prochaine étape'),
        h('h2', null, actionEtape(suivante, d).texte), h('a', { class: 'bouton principal', href: actionEtape(suivante, d).href }, 'Y aller'))
      : h('div', { class: 'carte prochaine' }, h('h2', null, 'Tous les exercices sont faits.'),
        h('p', null, t ? `Pour la suite, refais une note en travaillant surtout « ${t.faible.titre.toLowerCase()} », ton critère le plus faible.` : 'Refais une note en visant la grille.')),
    h('p', { class: 'stats' }, `${r.notesFaites} note${r.notesFaites > 1 ? 's' : ''} sur ${r.notesTotal} · ${r.courtsFaits} exercice${r.courtsFaits > 1 ? 's' : ''} court${r.courtsFaits > 1 ? 's' : ''} sur ${r.courtsTotal} · ${r.motsEcrits} mots écrits`),
    t ? h('div', { class: 'carte' },
      h('h2', null, `Ta tendance (${t.notes} dernière${t.notes > 1 ? 's' : ''} note${t.notes > 1 ? 's' : ''} évaluée${t.notes > 1 ? 's' : ''})`),
      h('ul', { class: 'stats-fautes' }, t.moyennes.map((m) => h('li', null,
        h('span', null, m.titre),
        h('div', { class: 'barre' }, h('div', { style: `width:${(m.moyenne / 3) * 100}%` })),
        h('span', { class: 'cat-val' }, `${m.moyenne} sur 3`)))),
      h('p', { class: 'petit' }, `Critère le plus faible : ${t.faible.titre}.`)) : null,

    h('h2', { class: 'rubrique' }, 'Notes de deux pages (60 minutes)'),
    h('ul', { class: 'kits' }, d.notes.map((n) => {
      const e = dernierEssai(d.essais, n.id);
      const s = statutExercice(d.essais, n.id);
      return h('li', { class: `kit ${s === 'termine' ? 'termine' : s === 'nouveau' ? '' : 'en-cours'}` },
        h('strong', null, h('a', { href: e && s !== 'termine' ? actionEtape({ action: { brouillon: 'ecrire', 'a-evaluer': 'evaluer', 'a-reecrire': 'reecrire' }[s], exId: n.id, essai: e }, d).href : lien('ecrire', { id: n.id }) }, n.titre)),
        statut(s), h('span', { class: 'petit' }, n.parcours),
        s === 'termine' ? h('a', { class: 'lien', href: lien('ecrire', { id: n.id, nouveau: 1 }) }, 'refaire') : null);
    })),
    h('h2', { class: 'rubrique' }, 'Exercices courts (10 à 20 minutes)'),
    Object.entries(d.typesCourts).map(([type, def]) => h('div', { class: 'carte' },
      h('h3', null, def.label), h('p', { class: 'petit' }, def.aide),
      h('ul', { class: 'kits' }, d.courts.filter((c) => c.type === type).map((c) => {
        const s = statutExercice(d.essais, c.id);
        const e = dernierEssai(d.essais, c.id);
        return h('li', { class: `kit ${s === 'termine' ? 'termine' : s === 'nouveau' ? '' : 'en-cours'}` },
          h('a', { href: lien('court', e && s !== 'termine' ? { id: c.id, t: e.ts } : { id: c.id }) }, c.titre),
          statut(s), h('span', { class: 'petit' }, `${c.duree_min} min`));
      })))),
    h('div', { class: 'carte' },
      h('h2', null, h('a', { href: '#/atelier/portfolio' }, 'Portfolio')),
      h('p', null, `${p.publies} livrable${p.publies > 1 ? 's' : ''} publié${p.publies > 1 ? 's' : ''}, ${p.commences} projet${p.commences > 1 ? 's' : ''} commencé${p.commences > 1 ? 's' : ''} sur ${p.total} proposés. Le portfolio est la preuve concrète qui répond à « mes analyses n'ont pas de valeur ».`)),
    h('p', { class: 'petit' }, d.avertissementNotes));
}

// ---- Grille ----

export async function renderGrille({ view, store }) {
  const { grille } = await charger(store);
  fill(view, h('h1', null, grille.titre), sousNav('grille'),
    h('p', { class: 'chapo' }, grille.avertissement),
    grille.criteres.map((c) => h('section', { class: 'carte' },
      h('h2', null, c.titre), h('p', null, c.question),
      h('ol', { start: 0, class: 'niveaux-liste' }, c.niveaux.map((n, i) => h('li', null, h('strong', null, `${grille.echelle[i].label} : `), n))),
      h('p', { class: 'petit' }, `Pièges : ${c.pieges.join(' ')}`))),
    h('div', { class: 'carte' }, h('h2', null, 'Mise en forme'), h('ul', null, grille.mise_en_forme.map((m) => h('li', null, m)))),
    h('details', { class: 'sources' }, h('summary', null, 'Sources de la grille'),
      h('ul', null, grille.sources.map((s) => h('li', null, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.titre))))));
}

// ---- Éléments communs ----

function documentCorpus(doc) {
  return h('details', { class: 'carte document', open: true },
    h('summary', null, h('strong', null, `${doc.id} · ${doc.titre}`)),
    h('p', { class: 'petit' }, `${doc.organisme} · ${doc.type} · ${doc.date}`),
    doc.resume.map((p) => h('p', null, typo(p))),
    doc.chiffres?.length ? h('ul', { class: 'chiffres' }, doc.chiffres.map((c) => h('li', null, h('strong', null, `${c.valeur}`), ` : ${c.label}`))) : null,
    doc.tableau ? tableau(doc.tableau) : null,
    h('p', { class: 'petit' }, h('em', null, `Limite : ${doc.limite}`)),
    h('p', { class: 'petit' }, h('a', { href: doc.url, target: '_blank', rel: 'noopener' }, 'Lire l\'original')));
}

function tableau(t) {
  return h('div', { class: 'defile' }, h('table', null,
    h('thead', null, h('tr', null, t.colonnes.map((c) => h('th', null, c)))),
    h('tbody', null, t.lignes.map((l) => h('tr', null, l.map((c, i) => (i === 0 ? h('th', { scope: 'row' }, c) : h('td', null, c))))))));
}

function listeOuParagraphes(x) {
  return [x.paragraphes?.map((p) => h('p', null, typo(p))), x.liste ? h('ul', null, x.liste.map((l) => h('li', null, typo(l)))) : null];
}

function noteModele(m) {
  return h('div', { class: 'carte modele' },
    h('p', { class: 'etiquette' }, 'Note modèle'),
    h('h2', null, m.titre),
    h('p', { class: 'petit entete-note' }, m.en_tete.map((l, i) => [i ? h('br') : null, l])),
    m.sections.map((s) => h('section', null, h('h3', null, s.titre), listeOuParagraphes(s))),
    m.calculs?.length ? h('details', { class: 'sources' }, h('summary', null, 'Chiffres calculés ou repères de l\'auteur'), h('ul', null, m.calculs.map((c) => h('li', null, c)))) : null,
    h('h3', null, 'Ce que fait cette note'),
    h('ul', null, m.lecons.map((l) => h('li', null, l))));
}

// Zone de rédaction à enregistrement automatique : renvoie { zone, lire }.
function editeur({ valeur, rows, onSave, onChange }) {
  const area = h('textarea', { rows, class: 'redaction', 'aria-label': 'Zone de rédaction' }, valeur);
  const etat = h('span', { class: 'etat-save', 'aria-live': 'polite' });
  let timer = null;
  let dernier = valeur;
  async function save() {
    clearTimeout(timer);
    timer = null;
    if (area.value === dernier) return;
    dernier = area.value;
    try { await onSave(area.value); etat.textContent = 'Enregistré'; } catch (e) { etat.textContent = `Échec : ${e.message ?? e}`; }
  }
  area.addEventListener('input', () => { etat.textContent = ''; onChange?.(area.value); clearTimeout(timer); timer = setTimeout(save, 800); });
  area.addEventListener('blur', save);
  return { area, etat, save, lire: () => area.value };
}

// ---- Rédaction d'une note ----

export async function renderEcrire({ view, store, params }) {
  const d = await charger(store);
  const ex = d.notes.find((n) => n.id === params.id);
  if (!ex) { location.hash = '#/atelier'; return; }
  let essai = params.t ? d.essais.find((e) => e.exId === ex.id && e.ts === Number(params.t)) : null;
  if (!essai && !params.nouveau) essai = [...d.essais].reverse().find((e) => e.exId === ex.id && statutEssai(e) === 'brouillon') ?? null;
  if (essai && statutEssai(essai) !== 'brouillon') { location.hash = lien('evaluer', { id: ex.id, t: essai.ts }); return; }
  const ts = essai?.ts ?? Date.now();
  const base = essai?.secondes ?? 0;
  const ouvert = Date.now();
  const secondes = () => Math.round(base + (Date.now() - ouvert) / 1000);
  const sauver = (texte, extra = {}) => store.putNote(ID_ESSAI(ex.id, ts), { exId: ex.id, ts, texte, secondes: secondes(), ...extra });

  const compteur = h('p', { class: 'petit', 'aria-live': 'polite' });
  const majCompteur = (t) => {
    const n = compterMots(t);
    compteur.textContent = `${n} mot${n > 1 ? 's' : ''} (visé : ${ex.mots.min} à ${ex.mots.max}).${n > ex.mots.max ? ' Trop long : coupe.' : ''}`;
  };
  const ed = editeur({ valeur: essai?.texte ?? '', rows: 20, onSave: (t) => sauver(t), onChange: majCompteur });
  majCompteur(ed.lire());
  const actif = timerLabel() === `Note ${ex.id}`;
  const message = h('p', { class: 'alerte', hidden: true });

  async function terminer(e) {
    const n = compterMots(ed.lire());
    if (n < 30) { message.hidden = false; message.textContent = 'Écris au moins quelques phrases avant de passer à l\'évaluation.'; return; }
    e.target.disabled = true;
    await sauver(ed.lire(), { finishedAt: Date.now() });
    stopTimer();
    location.hash = lien('evaluer', { id: ex.id, t: ts });
  }

  fill(view,
    h('p', null, h('a', { class: 'lien', href: '#/atelier' }, '← Atelier')),
    h('h1', null, ex.titre),
    h('div', { class: 'carte commande' },
      h('p', { class: 'etiquette' }, 'La commande'),
      h('p', null, h('strong', null, 'Vous êtes : '), ex.commande.role),
      h('p', null, h('strong', null, 'Destinataire : '), ex.commande.destinataire),
      h('p', null, h('strong', null, 'Objet : '), ex.commande.objet),
      h('p', null, ex.commande.contexte),
      h('p', null, h('strong', null, ex.commande.consigne))),
    h('h2', { class: 'rubrique' }, 'Le dossier'),
    h('p', { class: 'petit' }, 'Lis d\'abord vite, trie, puis écris. Ne recopie pas : reformule et croise les documents. Cite les documents par [D1], [D2].'),
    ex.corpus.map(documentCorpus),
    h('h2', { class: 'rubrique' }, 'Ta note'),
    h('div', { class: 'rangee' },
      h('button', { class: 'bouton', onclick: (e) => { if (timerLabel() === `Note ${ex.id}`) { stopTimer(); e.target.textContent = `⏱ Lancer le chronomètre (${ex.duree_min} min)`; } else { startTimer(`Note ${ex.id}`, ex.duree_min); e.target.textContent = 'Arrêter le chronomètre'; } } },
        actif ? 'Arrêter le chronomètre' : `⏱ Lancer le chronomètre (${ex.duree_min} min)`),
      h('span', { class: 'petit' }, 'Le chronomètre s\'affiche en haut de la page ; un bip signale la fin.')),
    h('div', { class: 'champ' }, h('label', null, 'Rédaction', ed.etat), ed.area),
    compteur, message,
    h('div', { class: 'rangee' }, h('button', { class: 'bouton principal', onclick: terminer }, 'Terminer et m\'évaluer')),
    h('p', { class: 'petit' }, 'Ton texte est enregistré dans ce navigateur. Il n\'est jamais envoyé nulle part.'));
  return () => { ed.save(); };
}

// ---- Évaluation et note modèle ----

export async function renderEvaluer({ view, store, params }) {
  const d = await charger(store);
  const ex = d.notes.find((n) => n.id === params.id);
  const essai = ex && d.essais.find((e) => e.exId === ex.id && e.ts === Number(params.t));
  if (!ex || !essai) { location.hash = '#/atelier'; return; }
  if (!essai.finishedAt) { location.hash = lien('ecrire', { id: ex.id, t: essai.ts }); return; }
  const grille = { ...(essai.grille ?? {}) };
  const sauver = (extra = {}) => store.putNote(ID_ESSAI(ex.id, essai.ts), {
    exId: ex.id, ts: essai.ts, texte: essai.texte, secondes: essai.secondes, finishedAt: essai.finishedAt, grille: { ...grille },
    ...(essai.reecriture ? { reecriture: essai.reecriture } : {}), ...extra });
  const zone = h('div');
  const sortie = h('span');

  function dessiner() {
    const s = scoreGrille(grille, d.grille.criteres);
    fill(zone,
      h('h2', { class: 'rubrique' }, 'Auto-évaluation'),
      h('p', { class: 'petit' }, 'Évalue-toi avant de voir la note modèle : choisis pour chaque critère la description qui ressemble le plus à ta note. Sois sévère, c\'est pour toi.'),
      d.grille.criteres.map((c) => {
        const niv = grille[c.id];
        return h('section', { class: 'carte critere-carte' },
          h('h3', null, c.titre), h('p', { class: 'petit' }, c.question),
          h('div', { class: 'echelle', role: 'group', 'aria-label': c.titre }, d.grille.echelle.map((e) => h('button', {
            class: niv === e.niveau ? 'actif' : '', 'aria-pressed': niv === e.niveau ? 'true' : 'false',
            onclick: async () => { grille[c.id] = e.niveau; await sauver(); dessiner(); } }, `${e.niveau} · ${e.label}`))),
          h('p', null, Number.isInteger(niv) ? c.niveaux[niv] : 'Choisis un niveau.'),
          h('details', { class: 'sources' }, h('summary', null, 'Pièges fréquents'), h('ul', null, c.pieges.map((p) => h('li', null, p)))));
      }),
      !s.complete
        ? h('p', { class: 'petit' }, `Il reste ${s.parCritere.filter((c) => c.niveau == null).length} critère(s) à évaluer pour voir la note modèle.`)
        : [
          h('div', { class: 'carte prochaine' }, h('p', { class: 'etiquette' }, 'Résultat'),
            h('h2', null, `${s.total} sur ${s.max}`),
            s.faibles.length ? h('p', null, `À travailler en priorité : ${s.faibles.map((c) => c.titre.toLowerCase()).join(', ')}.`) : h('p', null, 'Aucun critère faible : passe à la note modèle pour comparer.')),
          noteModele(ex.modele),
          h('div', { class: 'carte' }, h('h3', null, 'Mise en forme : vérifie'), h('ul', { class: 'cases' }, d.grille.mise_en_forme.map((m, i) => h('li', null,
            h('label', null, h('input', { type: 'checkbox', id: `mef-${i}` }), ` ${m}`))))),
          h('div', { class: 'rangee' },
            h('a', { class: 'bouton principal', href: lien('reecrire', { id: ex.id, t: essai.ts }) }, 'Réécrire ma note'),
            h('button', { class: 'bouton', onclick: () => copierTexte(promptRetourNote(ex, essai.texte, d.grille.criteres), sortie) }, 'Copier un prompt de retour (à coller dans un chat)'),
            sortie),
          h('p', { class: 'petit' }, 'Le prompt contient ta note : ne le colle que dans un chat où tu acceptes de partager ce texte.')]);
  }

  fill(view,
    h('p', null, h('a', { class: 'lien', href: '#/atelier' }, '← Atelier')),
    h('h1', null, `Évaluer : ${ex.titre}`),
    h('p', { class: 'stats' }, `${essai.mots} mots · ${minutes(essai.secondes)} d'écriture (objectif : ${ex.duree_min} min, ${ex.mots.min} à ${ex.mots.max} mots)`),
    h('details', { class: 'carte' }, h('summary', null, 'Relire ma note'), h('div', { class: 'ia-texte' }, essai.texte)),
    zone);
  dessiner();
}

// ---- Réécriture ----

export async function renderReecrire({ view, store, params }) {
  const d = await charger(store);
  const ex = d.notes.find((n) => n.id === params.id);
  const essai = ex && d.essais.find((e) => e.exId === ex.id && e.ts === Number(params.t));
  if (!ex || !essai || !essai.grille) { location.hash = ex && essai ? lien('evaluer', { id: ex.id, t: essai.ts }) : '#/atelier'; return; }
  const s = scoreGrille(essai.grille, d.grille.criteres);
  let texte = essai.reecriture ?? '';
  const fait = h('p', { class: 'petit', 'aria-live': 'polite' });
  const majFait = (t) => { const n = compterMots(t); fait.textContent = n ? `${n} mots.${n > ex.mots.max ? ' Trop long : coupe.' : ''}` : ''; };
  const ed = editeur({ valeur: texte, rows: 20, onChange: majFait,
    onSave: async (t) => {
      texte = t;
      await store.putNote(ID_ESSAI(ex.id, essai.ts), { exId: ex.id, ts: essai.ts, texte: essai.texte, secondes: essai.secondes,
        finishedAt: essai.finishedAt, grille: essai.grille, reecriture: t });
    } });
  majFait(texte);
  fill(view,
    h('p', null, h('a', { class: 'lien', href: lien('evaluer', { id: ex.id, t: essai.ts }) }, '← Évaluation')),
    h('h1', null, `Réécrire : ${ex.titre}`),
    h('p', { class: 'chapo' }, 'Réécris la note en corrigeant ce que la grille a révélé. Sans copier la note modèle : garde ton plan et ta voix, change ce qui était faible.'),
    s.faibles.length
      ? h('div', { class: 'carte' }, h('h2', null, 'Tes critères faibles'),
        h('ul', null, s.faibles.map((c) => h('li', null, h('strong', null, c.titre), ` (niveau ${c.niveau}) : ${d.grille.criteres.find((x) => x.id === c.id).question}`))))
      : h('p', null, 'Aucun critère faible : améliore ce qui te paraît encore perfectible.'),
    h('details', { class: 'carte' }, h('summary', null, 'Ma première version'), h('div', { class: 'ia-texte' }, essai.texte)),
    h('div', { class: 'rangee' }, h('button', { class: 'bouton', onclick: () => { ed.area.value = essai.texte; ed.area.dispatchEvent(new Event('input')); } }, 'Partir de ma première version')),
    h('div', { class: 'champ' }, h('label', null, 'Version réécrite', ed.etat), ed.area), fait,
    h('div', { class: 'rangee' }, h('a', { class: 'bouton principal', href: '#/atelier', onclick: () => ed.save() }, 'J\'ai fini : retour à l\'atelier')),
    h('details', { class: 'carte' }, h('summary', null, 'Revoir la note modèle'), noteModele(ex.modele)));
  return () => { ed.save(); };
}

// ---- Exercice court ----

export async function renderCourt({ view, store, params }) {
  const d = await charger(store);
  const ex = d.courts.find((c) => c.id === params.id);
  if (!ex) { location.hash = '#/atelier'; return; }
  const def = d.typesCourts[ex.type];
  let essai = params.t ? d.essais.find((e) => e.exId === ex.id && e.ts === Number(params.t)) : null;
  if (!essai) essai = [...d.essais].reverse().find((e) => e.exId === ex.id && statutEssai(e) !== 'termine') ?? null;
  const ts = essai?.ts ?? Date.now();
  const etat = { texte: essai?.texte ?? '', finishedAt: essai?.finishedAt ?? null, compare: essai?.compare ?? false };
  const sauver = () => store.putNote(ID_ESSAI(ex.id, ts), { exId: ex.id, ts, texte: etat.texte, secondes: 0,
    ...(etat.finishedAt ? { finishedAt: etat.finishedAt } : {}), ...(etat.compare ? { compare: true } : {}) });
  const zoneModele = h('div');
  const sortie = h('p', { class: 'petit', 'aria-live': 'polite' });
  let ed;

  async function voirModele() {
    if (compterMots(ed.lire()) < 3) { sortie.textContent = 'Écris d\'abord ta réponse, puis compare.'; return; }
    await ed.save();
    etat.finishedAt = etat.finishedAt ?? Date.now();
    await sauver();
    dessinerModele();
  }
  function dessinerModele() {
    if (!etat.finishedAt) { fill(zoneModele); return; }
    fill(zoneModele,
      h('div', { class: 'carte modele' }, h('p', { class: 'etiquette' }, 'Modèle'), listeOuParagraphes(ex.modele),
        ex.calculs?.length ? h('details', { class: 'sources' }, h('summary', null, 'Chiffres calculés'), h('ul', null, ex.calculs.map((c) => h('li', null, c)))) : null,
        h('h3', null, 'Ce que fait ce modèle'), h('ul', null, ex.lecons.map((l) => h('li', null, l)))),
      h('div', { class: 'rangee' },
        etat.compare ? h('p', { class: 'bravo' }, 'Exercice terminé.')
          : h('button', { class: 'bouton principal', onclick: async () => { etat.compare = true; await sauver(); dessinerModele(); } }, 'J\'ai comparé avec le modèle'),
        h('a', { class: 'bouton', href: '#/atelier' }, 'Retour à l\'atelier')));
  }

  ed = editeur({ valeur: etat.texte, rows: ex.type === 'titres' ? 7 : 10, onSave: async (t) => { etat.texte = t; await sauver(); } });
  const m = ex.matiere;
  fill(view,
    h('p', null, h('a', { class: 'lien', href: '#/atelier' }, '← Atelier')),
    h('p', { class: 'etiquette' }, def.label),
    h('h1', null, ex.titre),
    h('p', { class: 'chapo' }, ex.consigne), h('p', { class: 'petit' }, def.aide),
    h('div', { class: 'carte' },
      m.faits ? [h('h3', null, 'Faits'), h('ul', null, m.faits.map((f) => h('li', null, f)))] : null,
      m.texte ? m.texte.map((p) => h('p', null, p)) : null,
      m.tableau ? tableau(m.tableau) : null,
      m.liste ? [h('h3', null, ex.type === 'titres' ? 'Titres à reformuler' : 'À traiter'), h('ol', null, m.liste.map((l) => h('li', null, l)))] : null,
      h('p', { class: 'petit' }, h('a', { href: ex.source.url, target: '_blank', rel: 'noopener' }, ex.source.titre))),
    h('div', { class: 'champ' }, h('label', null, ex.type === 'titres' ? 'Tes titres (un par ligne, dans l\'ordre)' : 'Ta réponse', ed.etat), ed.area),
    h('div', { class: 'rangee' }, h('button', { class: 'bouton principal', onclick: voirModele }, etat.finishedAt ? 'Revoir le modèle' : 'Voir le modèle')),
    sortie, zoneModele);
  dessinerModele();
  return () => { ed.save(); };
}
