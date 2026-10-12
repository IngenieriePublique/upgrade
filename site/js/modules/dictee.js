// Dictées : menu et statistiques, lecture par segments (voix du navigateur), correction à l'écran.
// L'utilisateur écrit sur papier ; ici il écoute, puis compare sa copie au texte et marque ses fautes.
import { h, fill, plural } from '../ui.js';
import { loadData } from '../data.js';
import { dayKey } from '../srs.js';
import { alineas, essaisDepuisNotes, fautesPour100, bilan, niveauConseille, choisirProchaine, categoriesAActiver,
  categoriesActives, ajouterRegles, resumeEssai, texteParle, ID_ESSAI, ID_REGLE, LIBELLES_NIVEAU, CODES } from '../dictee.js';

const lien = (href, texte) => h('a', { href, target: '_blank', rel: 'noopener' }, texte);
const fr1 = (x) => String(x).replace('.', ',');

function reglage(cle, defaut) {
  try { const v = localStorage.getItem(`dictee.${cle}`); return v == null ? defaut : JSON.parse(v); } catch { return defaut; }
}
function memoriser(cle, valeur) {
  try { localStorage.setItem(`dictee.${cle}`, JSON.stringify(valeur)); } catch { /* stockage indisponible : réglage non conservé */ }
}

async function charger(store) {
  const [data, regles, notes] = await Promise.all([loadData('dictees/dictees.json'), loadData('dictees/regles.json'), store.notes()]);
  const categories = regles.categories.map((c) => c.id);
  return {
    dictees: data.dictees, regles, categories,
    libelles: Object.fromEntries(regles.categories.map((c) => [c.id, c])),
    essais: essaisDepuisNotes(notes.filter((n) => n.kind === 'dictee')),
    actives: categoriesActives(notes.filter((n) => n.kind === 'regle')),
  };
}

// ---------------------------------------------------------------- menu

export async function renderMenu({ view, store, decks }) {
  const ctx = await charger(store);
  const { dictees, regles, categories, libelles } = ctx;
  let { essais, actives } = ctx;
  const zone = h('div');
  view.append(zone);

  async function activer(cat) {
    await store.putNote(ID_REGLE(cat), { depuis: Date.now() });
    actives = new Set([...actives, cat]);
    ajouterRegles(decks, regles, actives);
    draw();
  }

  function draw() {
    const suivante = choisirProchaine(dictees, essais, categories);
    const b = bilan(essais, categories);
    const maxTaux = Math.max(1, ...b.parCategorie.map((c) => c.pour100));
    const parDictee = new Map();
    for (const e of essais) parDictee.set(e.dicteeId, [...(parDictee.get(e.dicteeId) ?? []), e]);
    const niveau = niveauConseille(essais, dictees);

    fill(zone,
      h('h1', null, 'Dictées'),
      h('p', { class: 'chapo' }, 'On écrit sur papier, à la main : l\'écran lit le texte phrase par phrase, puis sert à corriger. Chaque faute marquée nourrit les statistiques et fait entrer les règles correspondantes dans les cartes.'),
      suivante ? h('section', { class: 'carte' },
        h('h2', null, essais.length ? 'Dictée conseillée' : 'Pour commencer'),
        h('p', null, h('strong', null, suivante.titre), ` · niveau ${suivante.niveau} (${LIBELLES_NIVEAU[suivante.niveau].toLowerCase()}) · ${suivante.mots} mots · environ 10 minutes`),
        h('p', { class: 'petit' }, essais.length
          ? `Choisie d'après tes dernières fautes : niveau ${niveau} conseillé, avec les pièges des catégories où tu te trompes le plus.`
          : 'Première dictée : niveau 1, pour te donner un point de départ.'),
        h('a', { class: 'bouton principal', href: `#/dictee/ecrire?id=${suivante.id}` }, 'Faire cette dictée')) : null,

      essais.length ? h('section', { class: 'carte' },
        h('h2', null, 'Tes fautes'),
        h('p', { class: 'stats' },
          `${plural(b.essais, 'dictée', 'dictées')} prises en compte · ${fr1(b.tauxGlobal)} fautes pour 100 mots`,
          b.tendance == null ? '' : b.tendance < 0 ? ` · en progrès (${fr1(b.tendance)} sur les 3 dernières)`
            : b.tendance > 0 ? ` · en recul (+${fr1(b.tendance)} sur les 3 dernières)` : ' · stable'),
        h('ul', { class: 'stats-fautes' }, b.parCategorie.map((c) => h('li', { 'data-cat': c.cat },
          h('span', { class: 'cat-nom' }, h('span', { class: 'sigle', 'data-cat': c.cat }, CODES[c.cat]), ` ${libelles[c.cat].libelle}`),
          h('span', { class: 'barre', 'aria-hidden': 'true' }, h('div', { style: `width:${Math.round(100 * c.pour100 / maxTaux)}%` })),
          h('span', { class: 'cat-val' }, `${fr1(c.pour100)} / 100 mots`),
          actives.has(c.cat)
            ? h('span', { class: 'statut' }, 'règles actives')
            : h('button', { class: 'lien', onclick: () => activer(c.cat) }, 'activer les règles'))))) : null,

      h('section', null,
        h('h2', null, 'Les 40 dictées'),
        [1, 2, 3, 4].map((n) => h('details', { class: 'carte', open: n === niveau },
          h('summary', null, h('strong', null, `Niveau ${n} · ${LIBELLES_NIVEAU[n]}`),
            ` (${dictees.filter((d) => d.niveau === n && parDictee.has(d.id)).length}/${dictees.filter((d) => d.niveau === n).length} faites)`),
          h('ul', { class: 'kits' }, dictees.filter((d) => d.niveau === n).map((d) => {
            const faits = parDictee.get(d.id) ?? [];
            const dernier = faits[faits.length - 1];
            return h('li', { class: `kit${faits.length ? ' termine' : ''}` },
              h('span', { class: 'statut' }, faits.length ? `faite ${faits.length} fois` : 'à faire'),
              h('a', { href: `#/dictee/ecrire?id=${d.id}` }, d.titre),
              h('span', { class: 'petit' }, ` ${d.mots} mots${dernier ? ` · dernière : ${fr1(fautesPour100(dernier))} faute(s) / 100 mots` : ''}`));
          }))))),

      h('p', { class: 'petit' }, 'Les textes viennent de Wikisource (œuvres du domaine public, transcription CC BY-SA 4.0) et du Conseil constitutionnel (Constitution, Déclaration de 1789). L\'estimation des « pièges » de chaque dictée est automatique : c\'est une indication, pas une analyse linguistique.'));
  }
  draw();
}

// ---------------------------------------------------------------- lecture

function voixFrancaises() {
  if (typeof speechSynthesis === 'undefined') return [];
  return speechSynthesis.getVoices().filter((v) => /^fr/i.test(v.lang))
    .sort((a, b) => (/natural/i.test(b.name) - /natural/i.test(a.name)) || (/hortense|denise|henri/i.test(b.name) - /hortense|denise|henri/i.test(a.name)) || a.name.localeCompare(b.name));
}

export async function renderEcrire({ view, params }) {
  const data = await loadData('dictees/dictees.json');
  const dictee = data.dictees.find((d) => d.id === params.id);
  if (!dictee) { view.append(h('h1', null, 'Dictée introuvable'), h('a', { href: '#/dictee' }, 'Retour aux dictées')); return; }
  const parle = typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
  const segs = dictee.segments;
  const prefs = { vitesse: reglage('vitesse', 0.85), ponctuation: reglage('ponctuation', true), auto: reglage('auto', false),
    secParMot: reglage('secParMot', 1.6), voix: reglage('voix', ''), aide: false };
  let pos = -1; // segment en cours (-1 : pas commencé)
  let minuteur = null;
  let lecture = 0; // jeton : une nouvelle lecture annule l'attente de la précédente
  const zone = h('div');
  view.append(zone);

  function arreter() {
    lecture++;
    clearTimeout(minuteur);
    if (parle) speechSynthesis.cancel();
  }

  function dire(texte, fini) {
    if (!parle) { fini?.(); return; }
    arreter();
    const mon = lecture;
    const u = new SpeechSynthesisUtterance(texte);
    const v = voixFrancaises().find((x) => x.name === prefs.voix) ?? voixFrancaises()[0];
    if (v) u.voice = v;
    u.lang = v?.lang ?? 'fr-FR';
    u.rate = prefs.vitesse;
    u.onend = () => { if (mon === lecture) fini?.(); };
    u.onerror = () => { if (mon === lecture) fini?.(); };
    speechSynthesis.speak(u);
  }

  const parleSegment = (i) => texteParle(segs[i], { ponctuation: prefs.ponctuation, finAlinea: dictee.fins_alinea[i] });

  function segment(i) {
    pos = Math.max(0, Math.min(segs.length - 1, i));
    draw();
    dire(parleSegment(pos), () => {
      if (!prefs.auto || pos >= segs.length - 1) return;
      const mots = segs[pos].split(/\s+/).length;
      minuteur = setTimeout(() => segment(pos + 1), (prefs.secParMot * mots + 1.5) * 1000);
    });
  }

  function toutLire() {
    pos = -1;
    draw();
    dire(dictee.texte.split(/\n\s*\n/).map((p) => texteParle(p)).join(' '));
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); segment(pos + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); segment(pos - 1); }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); segment(Math.max(pos, 0)); }
  }
  document.addEventListener('keydown', onKey);

  function reglages() {
    const voix = voixFrancaises();
    return h('details', { class: 'sources' }, h('summary', null, 'Réglages de la voix'),
      voix.length ? h('div', { class: 'champ' }, h('label', { for: 'dic-voix' }, 'Voix'),
        h('select', { id: 'dic-voix', onchange: (e) => { prefs.voix = e.target.value; memoriser('voix', prefs.voix); } },
          voix.map((v) => h('option', { value: v.name, selected: v.name === prefs.voix }, `${v.name} (${v.lang})`))))
        : h('p', { class: 'alerte' }, 'Aucune voix française trouvée : ce navigateur ne sait pas lire à voix haute. Utilise Edge ou Chrome, ou lis les segments affichés avec « Voir le segment ».'),
      h('div', { class: 'champ' }, h('label', { for: 'dic-vit' }, `Vitesse : ${fr1(prefs.vitesse)}`),
        h('input', { id: 'dic-vit', type: 'range', min: '0.6', max: '1.2', step: '0.05', value: String(prefs.vitesse),
          oninput: (e) => { prefs.vitesse = Number(e.target.value); memoriser('vitesse', prefs.vitesse); e.target.previousSibling.textContent = `Vitesse : ${fr1(prefs.vitesse)}`; } })),
      h('label', { class: 'case' }, h('input', { type: 'checkbox', checked: prefs.ponctuation,
        onchange: (e) => { prefs.ponctuation = e.target.checked; memoriser('ponctuation', prefs.ponctuation); } }), ' Dicter la ponctuation (« virgule », « point », « à la ligne »)'),
      h('label', { class: 'case' }, h('input', { type: 'checkbox', checked: prefs.auto,
        onchange: (e) => { prefs.auto = e.target.checked; memoriser('auto', prefs.auto); draw(); } }), ' Enchaîner automatiquement les segments'),
      prefs.auto ? h('div', { class: 'champ' }, h('label', { for: 'dic-pause' }, `Temps pour écrire : ${fr1(prefs.secParMot)} s par mot`),
        h('input', { id: 'dic-pause', type: 'range', min: '0.8', max: '3', step: '0.2', value: String(prefs.secParMot),
          oninput: (e) => { prefs.secParMot = Number(e.target.value); memoriser('secParMot', prefs.secParMot); e.target.previousSibling.textContent = `Temps pour écrire : ${fr1(prefs.secParMot)} s par mot`; } })) : null);
  }

  function draw() {
    const commence = pos >= 0;
    fill(zone,
      h('p', { class: 'petit' }, h('a', { href: '#/dictee' }, '← Dictées'), ` · niveau ${dictee.niveau} · ${dictee.mots} mots`),
      h('h1', null, 'Dictée'),
      h('p', { class: 'chapo' }, 'Prends une feuille et un stylo. Le texte est lu une fois en entier, puis phrase par phrase : écris à la main, sans regarder l\'écran. Quand tu as fini, passe à la correction.'),
      h('ol', { class: 'etapes-dictee' },
        h('li', null, h('strong', null, 'Écoute le texte en entier'), ' sans écrire.',
          h('div', { class: 'rangee' }, h('button', { class: 'bouton principal', onclick: toutLire }, '▶ Lire le texte en entier'),
            h('button', { onclick: arreter }, '■ Arrêter'))),
        h('li', null, h('strong', null, 'Écris sous la dictée'), ' : un segment à la fois.',
          commence ? h('div', { class: 'segment-courant', 'aria-live': 'polite' },
            h('p', { class: 'stats' }, `Segment ${pos + 1} sur ${segs.length}`),
            h('div', { class: 'barre', 'aria-hidden': 'true' }, h('div', { style: `width:${Math.round(100 * (pos + 1) / segs.length)}%` })),
            prefs.aide ? h('p', { class: 'segment-texte' }, segs[pos]) : null) : null,
          h('div', { class: 'rangee' },
            commence
              ? [h('button', { onclick: () => segment(pos - 1), disabled: pos <= 0 }, '◀ Précédent'),
                h('button', { class: 'bouton principal', onclick: () => segment(pos) }, '↻ Répéter'),
                h('button', { onclick: () => segment(pos + 1), disabled: pos >= segs.length - 1 }, 'Suivant ▶')]
              : h('button', { class: 'bouton principal', onclick: () => segment(0) }, '▶ Commencer la dictée'),
            commence ? h('button', { class: 'lien', onclick: () => { prefs.aide = !prefs.aide; draw(); } }, prefs.aide ? 'Masquer le segment' : 'Voir le segment (aide)') : null),
          h('p', { class: 'petit' }, 'Raccourcis : flèche droite = suivant, flèche gauche = précédent, R = répéter.')),
        h('li', null, h('strong', null, 'Relis'), ' ta copie pendant la lecture complète.',
          h('div', { class: 'rangee' }, h('button', { onclick: toutLire }, '▶ Relire en entier'))),
        h('li', null, h('strong', null, 'Corrige'), ' : compare ta copie au texte et marque tes fautes.',
          h('div', { class: 'rangee' }, h('a', { class: 'bouton principal', href: `#/dictee/corriger?id=${dictee.id}` }, 'J\'ai fini : passer à la correction')))),
      reglages());
  }
  draw();
  return () => { document.removeEventListener('keydown', onKey); arreter(); };
}

// ---------------------------------------------------------------- correction

export async function renderCorriger({ view, store, decks, params }) {
  const ctx = await charger(store);
  const { dictees, regles, categories, libelles } = ctx;
  let { essais } = ctx;
  const dictee = dictees.find((d) => d.id === params.id);
  if (!dictee) { view.append(h('h1', null, 'Dictée introuvable'), h('a', { href: '#/dictee' }, 'Retour aux dictées')); return; }
  const marques = new Map(); // index du mot → catégorie
  let active = categories[0];
  let termine = null; // essai enregistré
  const zone = h('div');
  view.append(zone);

  function nbPar(cat) { return [...marques.values()].filter((c) => c === cat).length; }

  function texteMarque(lecture) {
    return h('div', { class: 'texte-dictee' }, alineas(dictee.texte).map((al) => h('p', null, al.map(({ i, mot }) => {
      const cat = termine ? termine.fautes.find((f) => f.i === i)?.cat : marques.get(i);
      const cls = `mot${cat ? ' faute' : ''}`;
      const contenu = [mot, cat ? h('sup', { class: 'sigle', 'data-cat': cat }, CODES[cat]) : null];
      const el = lecture
        ? h('span', { class: cls, 'data-cat': cat }, contenu)
        : h('button', { class: cls, 'data-cat': cat, 'aria-pressed': cat ? 'true' : 'false',
          title: cat ? `Faute : ${libelles[cat].libelle} (clic pour retirer)` : `Marquer une faute : ${libelles[active].libelle}`,
          onclick: () => { if (marques.has(i)) marques.delete(i); else marques.set(i, active); draw(); } }, contenu);
      return [el, ' '];
    }))));
  }

  async function enregistrer() {
    const ts = Date.now();
    const fautes = [...marques].map(([i, cat]) => ({ i, cat })).sort((a, b) => a.i - b.i);
    const data = { dicteeId: dictee.id, ts, mots: dictee.mots, niveau: dictee.niveau, fautes };
    await store.putNote(ID_ESSAI(dictee.id, ts), data);
    const essai = { id: ID_ESSAI(dictee.id, ts), ...data };
    const aActiver = categoriesAActiver(essai, categories).filter((c) => !ctx.actives.has(c));
    for (const c of aActiver) await store.putNote(ID_REGLE(c), { depuis: ts });
    ctx.actives = new Set([...ctx.actives, ...aActiver]);
    const avant = decks.find((d) => d.id === 'regles')?.cartes.length ?? 0;
    ajouterRegles(decks, regles, ctx.actives);
    essai.nouvellesCartes = (decks.find((d) => d.id === 'regles')?.cartes.length ?? 0) - avant;
    essai.categoriesActivees = aActiver;
    essais = [...essais, essai];
    await store.patchDay(dayKey(ts), { done: { dictee: true } });
    termine = essai;
    draw();
  }

  function draw() {
    if (termine) { drawBilan(); return; }
    const total = marques.size;
    fill(zone,
      h('p', { class: 'petit' }, h('a', { href: `#/dictee/ecrire?id=${dictee.id}` }, '← Revenir à la dictée'), ` · niveau ${dictee.niveau} · ${dictee.mots} mots`),
      h('h1', null, 'Correction'),
      h('p', { class: 'chapo' }, 'Compare ta copie, mot à mot. Choisis un type de faute, puis clique chaque mot où tu t\'es trompé (un mot oublié : clique celui qui devait être écrit ; une virgule oubliée : clique le mot qui la porte). Un nouveau clic retire la marque.'),
      h('div', { class: 'palette', role: 'radiogroup', 'aria-label': 'Type de faute' }, categories.map((c) => h('button', {
        class: `pastille-cat${c === active ? ' choisi' : ''}`, 'data-cat': c, role: 'radio', 'aria-checked': c === active ? 'true' : 'false',
        title: libelles[c].aide, onclick: () => { active = c; draw(); } },
      h('span', { class: 'sigle', 'data-cat': c }, CODES[c]), ` ${libelles[c].libelle}`, nbPar(c) ? h('span', { class: 'compte' }, nbPar(c)) : null))),
      h('div', { class: 'carte' }, texteMarque(false)),
      h('div', { class: 'rangee' },
        h('button', { class: 'bouton principal', onclick: enregistrer }, total ? `Terminer : ${plural(total, 'faute', 'fautes')}` : 'Terminer : aucune faute'),
        total ? h('button', { class: 'lien', onclick: () => { marques.clear(); draw(); } }, 'Tout effacer') : null),
      h('p', { class: 'petit' }, 'Le résultat reste dans ce navigateur (et dans ta sauvegarde JSON). Les règles des catégories où tu as fait des fautes entrent dans tes cartes.'));
  }

  function drawBilan() {
    const e = termine;
    const par = categories.map((c) => ({ c, n: e.fautes.filter((f) => f.cat === c).length })).filter((x) => x.n);
    const suivante = choisirProchaine(dictees, essais, categories);
    fill(zone,
      h('p', { class: 'petit' }, h('a', { href: '#/dictee' }, '← Dictées')),
      h('h1', null, e.fautes.length ? 'Dictée corrigée' : 'Sans faute'),
      h('p', { class: 'chapo' }, e.fautes.length ? resumeEssai(e) : `Aucune faute sur ${e.mots} mots. Bravo : la suivante sera un peu plus difficile.`),
      par.length ? h('ul', { class: 'stats-fautes' }, par.map(({ c, n }) => h('li', { 'data-cat': c },
        h('span', { class: 'cat-nom' }, h('span', { class: 'sigle', 'data-cat': c }, CODES[c]), ` ${libelles[c].libelle}`),
        h('span', { class: 'cat-val' }, plural(n, 'faute', 'fautes'))))) : null,
      e.categoriesActivees.length ? h('p', { class: 'alerte' },
        `Règles ajoutées à tes cartes : ${e.categoriesActivees.map((c) => libelles[c].libelle.toLowerCase()).join(', ')} (${plural(e.nouvellesCartes, 'nouvelle carte', 'nouvelles cartes')}, avec leurs sources).`) : null,
      h('div', { class: 'rangee' },
        suivante ? h('a', { class: 'bouton principal', href: `#/dictee/ecrire?id=${suivante.id}` }, 'Dictée suivante conseillée') : null,
        h('a', { class: 'bouton', href: '#/cartes/reviser' }, 'Réviser les cartes'),
        h('a', { class: 'bouton', href: '#/' }, 'Retour à Aujourd\'hui')),
      h('div', { class: 'carte' }, texteMarque(true)),
      h('p', { class: 'petit' }, `${dictee.auteur}, ${dictee.oeuvre} (${dictee.annee}). Source : `, lien(dictee.source.url, dictee.source.titre), `. ${dictee.licence}`),
      h('p', { class: 'petit droite' }, h('button', { class: 'lien', onclick: async (ev) => { await store.addFlag(`dictee-${dictee.id}`); ev.target.textContent = 'Signalé'; ev.target.disabled = true; } }, 'Signaler une erreur dans le texte')));
  }
  draw();
}
