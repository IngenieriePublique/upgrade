// Bilan : tableau de bord, revue hebdomadaire guidée (15 min), audit trimestriel, guide anti-réseaux.
// Données personnelles : notes « ecran:… », « revue:… », « audit:… », « reseaux:plan » (IndexedDB et sauvegardes, jamais le dépôt).
import { h, fill, zoneTexte, dateLongue } from '../ui.js';
import { loadData } from '../data.js';
import { dayKey, deckStats, addDays } from '../srs.js';
import { creerItems, maitrise, resumeMaitrise } from '../territoires.js';
import { essaisDepuisNotes as essaisDictee, bilan as bilanDictee } from '../dictee.js';
import { essaisDepuisNotes as essaisAtelier, resume as resumeAtelier, resumePortfolio } from '../atelier.js';
import { lundiDe, trimestre, joursTenus, semaines, ecranStats, reperes, debutSysteme, echeance, chiffresSemaine,
  usageModules, auditConseille, ID_ECRAN, ID_BASE, ID_REVUE, ID_AUDIT } from '../bilan.js';

const ONGLETS = [
  { id: 'bilan', label: 'Bilan', href: '#/bilan' },
  { id: 'revue', label: 'Revue hebdomadaire', href: '#/bilan/revue' },
  { id: 'audit', label: 'Audit trimestriel', href: '#/bilan/audit' },
  { id: 'reseaux', label: 'Réseaux sociaux', href: '#/bilan/reseaux' },
];

function sousNav(actif) {
  return h('nav', { class: 'onglets', 'aria-label': 'Bilan' },
    ONGLETS.map((o) => h('a', { href: o.href, class: o.id === actif ? 'actif' : '', 'aria-current': o.id === actif ? 'page' : null }, o.label)));
}

const fmtJour = (k) => dateLongue(new Date(...k.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x)))).getTime());
const fmtDate = (ts) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(ts);
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

async function contexte(store, decks) {
  const [contenu, days, journal, states, notes] = await Promise.all([
    loadData('bilan/bilan.json'), store.days(), store.journal(), store.states(), store.notes()]);
  return { contenu, days, journal, states, notes, decks };
}

async function donneesDictee(notes) {
  const regles = await loadData('dictees/regles.json');
  const categories = regles.categories.map((c) => c.id);
  const essais = essaisDictee(notes.filter((n) => n.kind === 'dictee'));
  return { essais, categories, bilan: bilanDictee(essais, categories) };
}

// ---- Tableau de bord ----

export async function renderBilan({ view, store, decks }) {
  const now = Date.now();
  const c = await contexte(store, decks);
  const [dataTerr, indexKits, notesAtelier, notesPortfolio, dic, atelierNotes, atelierCourts, portfolio] = await Promise.all([
    loadData('territoires/data.json'), loadData('fondations/index.json'), store.notes('redac'), store.notes('portfolio'),
    donneesDictee(c.notes), loadData('atelier/notes.json'), loadData('atelier/courts.json'), loadData('atelier/portfolio.json')]);

  const m = resumeMaitrise(maitrise(creerItems(dataTerr), c.states));
  const contacts = c.notes.filter((n) => n.kind === 'contact');
  const contactsFaits = contacts.filter((n) => n.data?.statut === 'fait').length;
  const ecran = ecranStats(c.notes);
  const essaisA = essaisAtelier(notesAtelier);
  const resA = resumeAtelier(essaisA, atelierNotes.notes, atelierCourts.courts);
  const resP = resumePortfolio(notesPortfolio, portfolio.projets);
  const liste = reperes(c.contenu.objectifs, { days: c.days, now, maitrise: m, kitsPublies: indexKits.kits.length,
    livrablesPublies: resP.publies, contactsFaits, ecran });
  const debut = debutSysteme(c.days, c.journal);
  const fin = echeance(debut, c.contenu.objectifs.duree_mois);
  const sem = semaines(c.days, now);
  const toutes = c.decks.flatMap((d) => d.cartes);
  const cartes = deckStats(toutes, c.states, now);
  const il7 = addDays(now, -6);
  const revisions7 = c.journal.filter((j) => j.ts >= il7).length;
  const lundi = lundiDe(now);
  const revueFaite = c.notes.some((n) => n.id === ID_REVUE(lundi) && n.data?.doneAt);
  const audit = auditConseille(now, c.notes);
  const maxEcran = Math.max(1, ...ecran.serie.slice(-12).map((s) => s.minutes), ecran.base ?? 0);

  fill(view,
    h('h1', null, 'Bilan'),
    sousNav('bilan'),
    h('p', { class: 'chapo' }, 'Un tableau de bord pour regarder ce qui se passe réellement, une fois par semaine, sans en faire un jeu de score. Les chiffres viennent de ce que tu as fait dans Upgrade ; seul le temps passé sur les réseaux est à saisir à la main.'),
    !revueFaite ? h('div', { class: 'alerte' }, 'La revue de cette semaine n\'est pas faite : quinze minutes. ', h('a', { href: '#/bilan/revue' }, 'La faire')) : null,
    audit ? h('div', { class: 'alerte' }, `Le trimestre (${trimestre(now).replace('-', ' ')}) est bien entamé et aucun audit n'est écrit. `, h('a', { href: '#/bilan/audit' }, 'Faire l\'audit')) : null,

    h('h2', { class: 'rubrique' }, 'Repères à trois mois'),
    h('p', { class: 'petit' }, debut ? `Début : ${fmtDate(debut)}. Échéance : ${fmtDate(fin)}. ${c.contenu.objectifs.avertissement}` : c.contenu.objectifs.avertissement),
    h('ul', { class: 'reperes' }, liste.map((r) => h('li', { class: r.ok ? 'ok' : '' },
      h('div', { class: 'repere-tete' }, h('strong', null, r.titre), h('span', { class: 'etat' }, r.ok ? '✓ atteint' : 'en cours')),
      h('div', { class: 'barre', role: 'img', 'aria-label': `${Math.round(r.part * 100)} %` }, h('div', { style: `width:${Math.round(r.part * 100)}%` })),
      h('p', { class: 'petit' }, `${r.valeur} · cible : ${r.cible}`)))),

    h('h2', { class: 'rubrique' }, 'Régularité'),
    h('p', null, `${pluriel(joursTenus(c.days, now, 7), 'jour tenu', 'jours tenus')} sur les 7 derniers, ${joursTenus(c.days, now, 28)} sur les 28 derniers. Cinq jours sur sept suffisent.`),
    h('div', { class: 'semaines', role: 'img', 'aria-label': 'Jours tenus par semaine sur douze semaines' }, sem.map((s) =>
      h('div', { class: `sem${s.ok ? ' ok' : ''}${s.enCours ? ' courante' : ''}`, title: `Semaine du ${fmtJour(s.lundi)} : ${s.jours} jour${s.jours > 1 ? 's' : ''}` },
        h('div', { class: 'sem-barre', style: `height:${(s.jours / 7) * 100}%` }), h('span', { class: 'petit' }, s.jours)))),

    h('h2', { class: 'rubrique' }, 'Mémoire et savoirs'),
    h('div', { class: 'grille' },
      h('div', { class: 'carte' }, h('h3', null, 'Cartes'), h('p', null, `${cartes.apprises} apprises sur ${cartes.total}, dont ${cartes.mures} mûres (intervalle d'au moins 21 jours).`),
        h('p', { class: 'petit' }, `${pluriel(revisions7, 'révision', 'révisions')} ces sept derniers jours.`), h('a', { class: 'lien', href: '#/cartes' }, 'Voir les paquets')),
      h('div', { class: 'carte' }, h('h3', null, 'Territoires'),
        h('p', null, `Départements : ${m.departements[3]} mûrs, ${m.departements[2]} solides, ${m.departements[1]} vus, ${m.departements[0]} à découvrir.`),
        h('p', null, `Régions : ${m.regions[3]} mûres, ${m.regions[2]} solides, ${m.regions[1]} vues, ${m.regions[0]} à découvrir.`), h('a', { class: 'lien', href: '#/territoires' }, 'Carte de maîtrise')),
      h('div', { class: 'carte' }, h('h3', null, 'Dictées'),
        dic.bilan.essais ? h('p', null, `${dic.bilan.tauxGlobal} fautes pour 100 mots sur les ${dic.bilan.essais} dernières dictées.`) : h('p', null, 'Pas encore de dictée corrigée.'),
        dic.bilan.tendance != null ? h('p', { class: 'petit' }, dic.bilan.tendance < 0 ? `Progrès : ${Math.abs(dic.bilan.tendance)} faute(s) de moins pour 100 mots que sur les trois précédentes.`
          : dic.bilan.tendance > 0 ? `Attention : ${dic.bilan.tendance} faute(s) de plus pour 100 mots que sur les trois précédentes.` : 'Stable.') : null,
        h('a', { class: 'lien', href: '#/dictee' }, 'Statistiques détaillées')),
      h('div', { class: 'carte' }, h('h3', null, 'Fondations'),
        h('p', null, `${indexKits.kits.length} kits publiés.`), h('a', { class: 'lien', href: '#/fondations' }, 'Voir le curriculum'))),

    h('h2', { class: 'rubrique' }, 'Production et réseau'),
    h('div', { class: 'grille' },
      h('div', { class: 'carte' }, h('h3', null, 'Atelier d\'écriture'),
        h('p', null, `${pluriel(resA.notesFaites, 'note terminée', 'notes terminées')} sur ${resA.notesTotal}, ${pluriel(resA.courtsFaits, 'exercice court', 'exercices courts')} sur ${resA.courtsTotal}.`),
        h('p', { class: 'petit' }, `Portfolio : ${resP.publies} publié, ${resP.commences} commencé sur ${resP.total} projets.`), h('a', { class: 'lien', href: '#/atelier' }, 'Atelier')),
      h('div', { class: 'carte' }, h('h3', null, 'Réseau humain'),
        h('p', null, `${pluriel(contactsFaits, 'entretien fait', 'entretiens faits')} sur ${contacts.length} contact${contacts.length > 1 ? 's' : ''} suivis.`),
        h('a', { class: 'lien', href: '#/sprint/reseau' }, 'Suivi des contacts'))),

    h('h2', { class: 'rubrique' }, 'Temps passé sur les réseaux sociaux'),
    ecran.base == null && !ecran.serie.length
      ? h('p', null, 'Aucune mesure. ', h('a', { href: '#/bilan/reseaux' }, 'Relever ta référence'), ', puis saisis chaque semaine le total pendant la revue.')
      : h('div', null,
        h('p', null, ecran.reduction == null ? 'Il manque la référence ou les semaines pour calculer l\'évolution.'
          : `${ecran.reduction >= 0 ? 'Baisse' : 'Hausse'} de ${Math.abs(ecran.reduction)} % : ${ecran.moyenne4} min par semaine en moyenne sur les quatre dernières semaines, contre ${ecran.base} min à la référence.`),
        h('div', { class: 'ecran-barres' },
          ecran.base != null ? h('div', { class: 'ecran-ligne' }, h('span', { class: 'petit' }, 'Référence'), h('div', { class: 'barre' }, h('div', { class: 'base', style: `width:${(ecran.base / maxEcran) * 100}%` })), h('span', { class: 'petit' }, `${ecran.base} min`)) : null,
          ecran.serie.slice(-12).map((s) => h('div', { class: 'ecran-ligne' }, h('span', { class: 'petit' }, fmtJour(s.lundi).replace(/^\S+ /, '')), h('div', { class: 'barre' }, h('div', { style: `width:${(s.minutes / maxEcran) * 100}%` })), h('span', { class: 'petit' }, `${s.minutes} min`))))),
    h('p', { class: 'petit' }, 'Le tableau de bord n\'enregistre aucun compte à rebours ni série : il se lit une fois par semaine, à la revue.'));
}

// ---- Revue hebdomadaire ----

export async function renderRevue({ view, store, decks, params }) {
  const now = Date.now();
  const c = await contexte(store, decks);
  const lundi = /^\d{4}-\d{2}-\d{2}$/.test(params.semaine ?? '') ? params.semaine : lundiDe(now);
  const precedent = lundiDe(addDays(new Date(...lundi.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x)))).getTime(), -7));
  const [notesAtelier, lastBackup] = await Promise.all([store.notes('redac'), store.getMeta('lastBackup', null)]);
  const essaisD = essaisDictee(c.notes.filter((n) => n.kind === 'dictee'));
  const chiffres = chiffresSemaine({ lundi, days: c.days, journal: c.journal, essaisDictee: essaisD, essaisAtelier: essaisAtelier(notesAtelier), contacts: c.notes.filter((n) => n.kind === 'contact') });
  const rev = c.contenu.revue;
  const revueNote = c.notes.find((n) => n.id === ID_REVUE(lundi));
  const data = { reponses: {}, intention: '', ...(revueNote?.data ?? {}) };
  data.reponses = { ...data.reponses };
  const sauver = () => store.putNote(ID_REVUE(lundi), { reponses: { ...data.reponses }, intention: data.intention, ...(data.doneAt ? { doneAt: data.doneAt } : {}) });
  const precedente = c.notes.find((n) => n.id === ID_REVUE(precedent))?.data;
  const ecran = c.notes.find((n) => n.id === ID_ECRAN(lundi))?.data?.minutes;
  const base = c.notes.find((n) => n.id === ID_BASE)?.data?.minutes;
  const finZone = h('div');
  const etatEcran = h('span', { class: 'etat-save', 'aria-live': 'polite' });

  async function saisirMinutes(id, valeur, extra = {}) {
    const n = Number(String(valeur).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) { etatEcran.textContent = 'Saisis un nombre de minutes.'; return; }
    await store.putNote(id, { minutes: Math.round(n), ...extra });
    etatEcran.textContent = 'Enregistré';
  }

  function dessinerFin() {
    fill(finZone, data.doneAt
      ? h('div', { class: 'carte fin' }, h('h2', null, 'Revue terminée.'), h('p', null, 'À dimanche prochain. Ferme l\'écran.'), h('a', { class: 'lien', href: '#/bilan' }, 'Voir le bilan'))
      : h('button', { class: 'bouton principal large', onclick: async () => { data.doneAt = Date.now(); await sauver(); dessinerFin(); } }, 'Terminer la revue'));
  }

  const etapes = Object.fromEntries(rev.etapes.map((e) => [e.id, e]));
  const entete = (id, n) => [h('h2', { class: 'rubrique' }, `${n}. ${etapes[id].titre}`), h('p', { class: 'petit' }, etapes[id].texte)];

  fill(view,
    h('h1', null, 'Revue hebdomadaire'),
    sousNav('revue'),
    h('p', { class: 'chapo' }, `Semaine du ${fmtJour(lundi)}. Quinze minutes, une fois par semaine : c'est la seule fois où tu regardes ton propre fonctionnement.`),
    precedente?.intention ? h('div', { class: 'carte' }, h('p', { class: 'etiquette' }, 'Ton intention de la semaine dernière'), h('p', null, precedente.intention)) : null,

    entete('chiffres', 1),
    h('ul', { class: 'chiffres-semaine' },
      h('li', null, h('strong', null, `${chiffres.joursTenus} sur 7`), ' jours tenus'),
      h('li', null, h('strong', null, chiffres.revisions), ' révisions de cartes'),
      h('li', null, h('strong', null, chiffres.dictees), ' dictée(s) corrigée(s)'),
      h('li', null, h('strong', null, chiffres.ecrits), ' note(s) écrite(s) et terminée(s)'),
      h('li', null, h('strong', null, chiffres.contacts), ' entretien(s) d\'information fait(s)')),
    chiffres.contacts === 0 ? h('p', { class: 'petit' }, 'Aucun contact humain cette semaine : c\'est le premier point à régler, pas le dernier.') : null,

    entete('ecran', 2),
    base == null
      ? h('div', { class: 'champ' }, h('label', { for: 'base' }, 'Référence de départ (minutes par semaine, avant tout blocage)'),
        h('input', { id: 'base', type: 'number', min: 0, step: 1, inputmode: 'numeric', placeholder: 'minutes',
          onchange: (e) => saisirMinutes(ID_BASE, e.target.value, { date: dayKey(now) }) }))
      : null,
    h('div', { class: 'champ' }, h('label', { for: 'ecran' }, `Minutes passées sur les réseaux cette semaine`, etatEcran),
      h('input', { id: 'ecran', type: 'number', min: 0, step: 1, inputmode: 'numeric', value: ecran ?? '', placeholder: 'minutes',
        onchange: (e) => saisirMinutes(ID_ECRAN(lundi), e.target.value) }),
      h('p', { class: 'petit' }, 'Total de la semaine dans le bilan d\'usage du téléphone et du navigateur. ', h('a', { href: '#/bilan/reseaux' }, 'Guide pour bloquer et mesurer'))),

    entete('questions', 3),
    rev.questions.map((q) => zoneTexte({ id: `rq-${q.id}`, label: q.label, aide: q.aide, rows: 3, valeur: data.reponses[q.id] ?? '',
      onSave: async (t) => { data.reponses[q.id] = t; await sauver(); } })),

    entete('sauvegarde', 4),
    h('p', null, lastBackup ? `Dernière sauvegarde il y a ${Math.floor((now - lastBackup) / 86400000)} jour(s). ` : 'Aucune sauvegarde faite. ', h('a', { class: 'bouton', href: '#/sauvegarde' }, 'Ouvrir la sauvegarde')),

    entete('intention', 5),
    zoneTexte({ id: 'rq-intention', label: 'Une chose à protéger la semaine prochaine', rows: 2, valeur: data.intention,
      onSave: async (t) => { data.intention = t; await sauver(); } }),
    finZone);
  dessinerFin();
}

// ---- Audit trimestriel ----

export async function renderAudit({ view, store, decks, params }) {
  const now = Date.now();
  const c = await contexte(store, decks);
  const trim = /^\d{4}-T[1-4]$/.test(params.t ?? '') ? params.t : trimestre(now);
  const aud = c.contenu.audit;
  const note = c.notes.find((n) => n.id === ID_AUDIT(trim));
  const data = { decisions: {}, reponses: {}, ...(note?.data ?? {}) };
  data.decisions = { ...data.decisions }; data.reponses = { ...data.reponses };
  const sauver = () => store.putNote(ID_AUDIT(trim), { decisions: { ...data.decisions }, reponses: { ...data.reponses }, ...(data.doneAt ? { doneAt: data.doneAt } : {}) });
  const usage = usageModules(c.days, now, aud.modules);
  const fin = h('div');
  const dessinerFin = () => fill(fin, data.doneAt
    ? h('div', { class: 'carte fin' }, h('h2', null, 'Audit terminé.'), h('p', null, 'Applique tes décisions au plus tôt : une suppression non faite est une suppression oubliée.'), h('a', { class: 'lien', href: '#/bilan' }, 'Retour au bilan'))
    : h('button', { class: 'bouton principal large', onclick: async () => { data.doneAt = Date.now(); await sauver(); dessinerFin(); } }, 'Terminer l\'audit'));

  fill(view,
    h('h1', null, `Audit trimestriel ${trim.replace('-', ' ')}`),
    sousNav('audit'),
    h('p', { class: 'chapo' }, aud.avertissement),
    h('p', { class: 'petit' }, `Les pourcentages comptent les jours où le bloc a été coché, parmi les ${usage.joursActifs} jours de ces 90 derniers où la séance a été ouverte. La dictée n'a lieu que trois jours par semaine et la lecture libre les autres jours : 100 % n'est pas attendu pour eux.`),
    h('div', { class: 'defile' }, h('table', null,
      h('thead', null, h('tr', null, ['Module', 'Usage', 'Ta décision'].map((x) => h('th', null, x)))),
      h('tbody', null, aud.modules.map((m) => {
        const u = usage.modules.find((x) => x.id === m.id);
        return h('tr', null,
          h('th', { scope: 'row' }, m.titre, h('p', { class: 'petit' }, m.question)),
          h('td', null, `${u.jours} jour${u.jours > 1 ? 's' : ''} (${Math.round(u.part * 100)} %)`, h('div', { class: 'barre' }, h('div', { style: `width:${Math.round(u.part * 100)}%` }))),
          h('td', null, h('select', { 'aria-label': `Décision pour ${m.titre}`, onchange: async (e) => { data.decisions[m.id] = e.target.value; await sauver(); } },
            h('option', { value: '' }, '—'), aud.decisions.map((d) => h('option', { value: d.id, selected: data.decisions[m.id] === d.id }, d.label)))));
      })))),
    h('h2', { class: 'rubrique' }, 'Questions du trimestre'),
    aud.questions.map((q) => zoneTexte({ id: `aq-${q.id}`, label: q.label, aide: q.aide, rows: 3, valeur: data.reponses[q.id] ?? '',
      onSave: async (t) => { data.reponses[q.id] = t; await sauver(); } })),
    fin);
  dessinerFin();
}

// ---- Réseaux sociaux ----

export async function renderReseaux({ view, store, decks }) {
  const now = Date.now();
  const c = await contexte(store, decks);
  const r = c.contenu.reseaux;
  const ecran = ecranStats(c.notes);
  const plan = { ...(c.notes.find((n) => n.id === 'reseaux:plan')?.data ?? {}) };
  const etat = h('span', { class: 'etat-save', 'aria-live': 'polite' });

  async function saisirBase(valeur) {
    const n = Number(String(valeur).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) { etat.textContent = 'Saisis un nombre de minutes.'; return; }
    await store.putNote(ID_BASE, { minutes: Math.round(n), date: dayKey(now) });
    etat.textContent = 'Enregistré';
  }

  fill(view,
    h('h1', null, 'Réseaux sociaux : bloquer, remplacer, mesurer'),
    sousNav('reseaux'),
    h('div', { class: 'alerte' }, r.avertissement),
    h('p', { class: 'chapo' }, r.principe),

    h('h2', { class: 'rubrique' }, '1. Mesurer la situation de départ'),
    h('p', null, r.mesure),
    h('div', { class: 'champ' }, h('label', { for: 'base' }, 'Référence : minutes par semaine sur les réseaux', etat),
      h('input', { id: 'base', type: 'number', min: 0, step: 1, inputmode: 'numeric', value: ecran.base ?? '', placeholder: 'minutes', onchange: (e) => saisirBase(e.target.value) })),

    h('h2', { class: 'rubrique' }, '2. Un substitut pour chaque besoin'),
    h('div', { class: 'defile' }, h('table', null,
      h('thead', null, h('tr', null, ['Besoin', 'Substitut dans Upgrade ou dans ta vie'].map((x) => h('th', null, x)))),
      h('tbody', null, r.besoins.map((b) => h('tr', null, h('th', { scope: 'row' }, b.besoin), h('td', null, b.substitut, ' ', h('a', { href: b.ou }, 'Y aller'))))))),

    h('h2', { class: 'rubrique' }, '3. Mettre de la friction (tu l\'appliques toi-même)'),
    r.blocage.map((b) => h('details', { class: 'carte' },
      h('summary', null, h('strong', null, b.outil), h('span', { class: 'petit' }, ` · ${b.plateforme}`)),
      h('p', null, b.ce_que_ca_fait),
      h('ol', null, b.etapes.map((e) => h('li', null, e))),
      h('p', { class: 'petit' }, h('strong', null, 'À vérifier : '), b.a_verifier),
      b.sources.length ? h('p', { class: 'petit' }, 'Sources : ', b.sources.map((s, i) => [i ? ' · ' : null, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.titre)])) : null)),

    h('h2', { class: 'rubrique' }, `4. ${r.si_alors.titre}`),
    h('p', null, r.si_alors.texte),
    r.si_alors.champs.map((f) => zoneTexte({ id: `sa-${f.id}`, label: f.label, rows: 2, valeur: plan[f.id] ?? '',
      onSave: async (t) => { plan[f.id] = t; await store.putNote('reseaux:plan', { ...plan }); } })),

    h('p', { class: 'petit' }, ecran.reduction == null ? 'Une fois la référence saisie et quatre semaines relevées pendant la revue, le bilan calcule l\'évolution.'
      : `Évolution actuelle : ${ecran.reduction >= 0 ? '−' : '+'}${Math.abs(ecran.reduction)} % (objectif −${c.contenu.objectifs.reduction_reseaux_pct} %).`));
}
