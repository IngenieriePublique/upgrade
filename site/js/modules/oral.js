// Oral : banque de questions, enregistreur local, auto-évaluation. Le son n'est jamais envoyé ni conservé.
import { h, fill, zoneTexte } from '../ui.js';
import { loadData } from '../data.js';
import { CRITERES_ORAL, fmtDuree, moyenneOral } from '../candidature.js';
import { enregistrementSupporte, demarrer, extension } from '../recorder.js';
import { sousNav } from './sprint.js';

const CIBLES = [[0, 'Sans objectif'], [30, '30 secondes'], [90, '90 secondes'], [180, '3 minutes']];
const ECHELLE = ['1', '2', '3', '4'];

export async function render({ view, store, params }) {
  const [banque, notes] = await Promise.all([loadData('oral/questions.json'), store.notes('oral')]);
  const parId = new Map(banque.questions.map((q) => [q.id, q]));
  const zone = h('div');
  const historique = h('div');

  let categorie = params.cat ?? '';
  let cible = 90;
  let question = parId.get(params.q) ?? tirer(banque.questions, categorie, null);
  let phase = 'attente'; // attente | enregistre | revue
  let session = null;
  let resultat = null;
  let ecoule = 0;
  let timer = null;
  let urlAudio = null;
  let erreur = '';
  let tics = 0;
  let grille = {};
  let commentaire = '';
  let sauve = false;

  function nettoyer() {
    clearInterval(timer);
    timer = null;
    if (session) { session.annuler(); session = null; }
    if (urlAudio) { URL.revokeObjectURL(urlAudio); urlAudio = null; }
  }

  function suivante() {
    nettoyer();
    question = tirer(banque.questions, categorie, question?.id);
    phase = 'attente'; resultat = null; ecoule = 0; tics = 0; grille = {}; commentaire = ''; sauve = false; erreur = '';
    dessiner();
  }

  async function lancer() {
    erreur = '';
    const t0 = Date.now();
    try {
      session = enregistrementSupporte() ? await demarrer() : null;
    } catch (e) {
      erreur = String(e.message ?? e);
      dessiner();
      return;
    }
    phase = 'enregistre';
    ecoule = 0;
    timer = setInterval(() => { ecoule = (Date.now() - t0) / 1000; majChrono(); }, 250);
    dessiner();
  }

  async function arreter() {
    clearInterval(timer);
    timer = null;
    const duree = ecoule;
    resultat = session ? await session.arreter() : { blob: null, mime: '', duree };
    session = null;
    if (resultat.blob) urlAudio = URL.createObjectURL(resultat.blob);
    phase = 'revue';
    dessiner();
  }

  const chrono = h('span', { class: 'chrono', role: 'timer' });
  function majChrono() {
    chrono.textContent = cible ? `${fmtDuree(ecoule)} / ${fmtDuree(cible)}` : fmtDuree(ecoule);
    chrono.classList.toggle('depasse', !!cible && ecoule > cible);
  }

  async function enregistrerEval() {
    const ts = Date.now();
    const data = { questionId: question.id, duree: Math.round(resultat.duree), cible, grille: { ...grille }, tics, commentaire, avecAudio: !!resultat.blob };
    await store.putNote(`oral:${ts}`, data);
    sauve = true;
    notes.push({ id: `oral:${ts}`, kind: 'oral', data, updatedAt: ts });
    dessiner();
  }

  function bloc() {
    if (phase === 'attente') {
      return h('div', null,
        erreur ? h('p', { class: 'alerte erreur' }, erreur) : null,
        enregistrementSupporte() ? null : h('p', { class: 'alerte' }, 'Ce navigateur ne permet pas d\'enregistrer : tu peux t\'entraîner avec le chronomètre seul.'),
        h('button', { class: 'bouton principal large', onclick: lancer }, enregistrementSupporte() ? '● Enregistrer ma réponse' : '▶ Lancer le chronomètre'),
        h('p', { class: 'petit' }, 'Parle à voix haute comme en entretien. L\'enregistrement reste dans cette page et disparaît quand tu la quittes, sauf si tu le télécharges.'));
    }
    if (phase === 'enregistre') {
      majChrono();
      return h('div', { class: 'enreg' }, h('span', { class: 'rec', 'aria-hidden': 'true' }, '●'), chrono,
        h('button', { class: 'bouton principal', onclick: arreter }, '■ Arrêter'));
    }
    return revue();
  }

  function revue() {
    const complet = CRITERES_ORAL.every((c) => grille[c.id]);
    return h('div', null,
      h('p', null, `Durée : ${fmtDuree(resultat.duree)}${cible ? ` pour un objectif de ${fmtDuree(cible)}` : ''}.`,
        cible && resultat.duree > cible * 1.15 ? ' Trop long : coupe un exemple.' : ''),
      urlAudio ? h('audio', { controls: true, src: urlAudio, 'aria-label': 'Réécouter ma réponse' }) : null,
      urlAudio ? h('p', null, h('a', { class: 'lien', href: urlAudio, download: `entrainement-${question.id}.${extension(resultat.mime)}` }, 'Télécharger l\'audio')) : null,
      h('div', { class: 'rangee tics' }, h('span', null, `Tics de langage comptés à la réécoute (euh, du coup, voilà…) : ${tics}`),
        h('button', { onclick: () => { tics++; dessiner(); } }, '+1'),
        h('button', { onclick: () => { tics = Math.max(0, tics - 1); dessiner(); } }, '−1')),
      h('h3', null, 'Auto-évaluation (1 = à retravailler, 4 = solide)'),
      CRITERES_ORAL.map((c) => h('div', { class: 'critere' }, h('span', null, c.label),
        h('span', { class: 'echelle', role: 'group', 'aria-label': c.label },
          ECHELLE.map((v) => h('button', { class: grille[c.id] === Number(v) ? 'actif' : '', 'aria-pressed': String(grille[c.id] === Number(v)),
            onclick: () => { grille[c.id] = Number(v); dessiner(); } }, v))))),
      zoneTexte({ id: 'oral-com', label: 'Une chose à changer à la prochaine prise', rows: 2, valeur: commentaire,
        onSave: async (v) => { commentaire = v; } }),
      h('div', { class: 'rangee' },
        sauve ? h('span', { class: 'petit' }, 'Auto-évaluation enregistrée.')
          : h('button', { class: 'bouton principal', disabled: !complet, onclick: enregistrerEval }, 'Enregistrer mon auto-évaluation'),
        h('button', { class: 'bouton', onclick: () => { nettoyer(); phase = 'attente'; resultat = null; ecoule = 0; tics = 0; grille = {}; sauve = false; dessiner(); } }, 'Recommencer cette question'),
        h('button', { class: 'bouton', onclick: suivante }, 'Question suivante')));
  }

  function dessiner() {
    fill(zone,
      h('div', { class: 'filtres' },
        h('label', { class: 'filtre' }, 'Catégorie',
          h('select', { onchange: (ev) => { categorie = ev.target.value; suivante(); } },
            h('option', { value: '' }, 'Toutes'),
            banque.categories.map((c) => h('option', { value: c.id, selected: c.id === categorie }, c.titre)))),
        h('label', { class: 'filtre' }, 'Durée visée',
          h('select', { disabled: phase === 'enregistre', onchange: (ev) => { cible = Number(ev.target.value); dessiner(); } },
            CIBLES.map(([v, l]) => h('option', { value: String(v), selected: v === cible }, l))))),
      question
        ? h('article', { class: 'carte question-carte' },
          h('p', { class: 'etiquette' }, banque.categories.find((c) => c.id === question.categorie)?.titre),
          h('p', { class: 'recto' }, question.question),
          h('details', null, h('summary', null, 'Ce que le jury cherche, et comment préparer'),
            h('p', null, h('strong', null, 'Il cherche : '), question.cherche),
            h('p', null, h('strong', null, 'Piste : '), question.piste)))
        : h('p', null, 'Aucune question dans cette catégorie.'),
      question ? bloc() : null,
      phase !== 'revue' ? h('p', null, h('button', { class: 'lien', onclick: suivante }, 'Une autre question')) : null);
    dessinerHistorique();
  }

  function dessinerHistorique() {
    const recents = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
    const moy = moyenneOral(notes);
    fill(historique,
      h('h2', { class: 'rubrique' }, `Mes entraînements (${notes.length})`),
      moy != null ? h('p', null, `Moyenne de l'auto-évaluation : ${moy} sur 4.`) : h('p', { class: 'petit' }, 'Aucun entraînement enregistré pour le moment. Trois suffisent pour valider cette étape du sprint.'),
      h('ul', null, recents.map((n) => {
        const q = parId.get(n.data.questionId);
        const m = moyenneOral([n]);
        return h('li', null, `${new Date(n.updatedAt).toLocaleDateString('fr-FR')} · ${q?.question ?? n.data.questionId} · ${fmtDuree(n.data.duree ?? 0)} · ${m ?? '?'}/4`,
          n.data.commentaire ? h('span', { class: 'petit' }, ` — ${n.data.commentaire}`) : null);
      })));
  }

  fill(view,
    h('h1', null, 'Oral'),
    sousNav('oral'),
    h('p', { class: 'chapo' }, 'Une question, une réponse à voix haute, une réécoute, une note honnête. Dix minutes par jour valent mieux qu\'une heure le dimanche.'),
    zone, historique);
  dessiner();
  return nettoyer;
}

// Tire une question au hasard (dans la catégorie si elle est donnée), différente de la précédente si possible.
export function tirer(questions, categorie, precedente, rand = Math.random) {
  const pool = questions.filter((q) => !categorie || q.categorie === categorie);
  const autres = pool.filter((q) => q.id !== precedente);
  const liste = autres.length ? autres : pool;
  return liste.length ? liste[Math.floor(rand() * liste.length)] : null;
}
