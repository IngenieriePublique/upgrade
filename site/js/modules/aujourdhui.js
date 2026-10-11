// Aujourd'hui : la séance de 60 minutes, finie par construction.
import { h, fill, dateLongue, plural } from '../ui.js';
import { buildQueue, countNewToday, dayKey, addDays } from '../srs.js';
import { startTimer, stopTimer, timerLabel } from '../timer.js';
import { sauvegarderDansDossier } from '../backup.js';
import { NEW_PER_DAY } from './cartes.js';
import { loadData } from '../data.js';
import { etapes, prochaineEtape, joursRestants, sprintActif } from '../candidature.js';

const PROFOND = ['Revue hebdomadaire', 'Institutions et action publique', 'Culture générale',
  'Évaluation et données', 'Atelier d\'écriture / portfolio', 'Oral', 'Lecture longue ou podcast'];
const JOURS_DICTEE = [1, 3, 5]; // lundi, mercredi, vendredi

function blocs(now, dues, sprint = null) {
  const dow = new Date(now).getDay();
  return [
    { id: 'brief', titre: 'Brief', min: 8, lien: '#/brief',
      note: '13 items au plus, une question à poser par item. Chaque article s\'ouvre dans un nouvel onglet.' },
    { id: 'cartes', titre: 'Cartes', min: 12, lien: '#/cartes/reviser',
      note: dues ? `${plural(dues, 'carte à voir', 'cartes à voir')}.` : 'Rien à réviser pour le moment.' },
    { id: 'territoires', titre: 'Territoires', min: 5, lien: '#/territoires/jeu?mode=quotidien',
      note: 'Dix questions au plus : placer, nommer, numéros, préfectures, voisins. La carte de maîtrise est dans l\'onglet Territoires.' },
    sprint
      ? { id: 'profond', titre: `Sprint candidature (jusqu'au 15 novembre)`, min: 25, lien: sprint.lien,
        note: `${sprint.jours} jour${sprint.jours > 1 ? 's' : ''} restant${sprint.jours > 1 ? 's' : ''}. Prochaine étape : ${sprint.titre}.` }
      : { id: 'profond', titre: `Bloc profond : ${PROFOND[dow]}`, min: 25, manuel: true,
        note: 'Fiches et kits à venir (phase 5). En attendant : un dossier de Vie-publique ou un rapport sur le thème du jour.' },
    JOURS_DICTEE.includes(dow)
      ? { id: 'dictee', titre: 'Dictée', min: 10, avenir: 'Phase 6 : dictée sur papier, correction à l\'écran.' }
      : { id: 'mot', titre: 'Mot du jour et sigles', min: 10, avenir: 'À venir. Les sigles tournent déjà dans les cartes.' },
  ];
}

export async function render({ view, store, decks }) {
  const now = Date.now();
  const today = dayKey(now);
  const [states, days, journalCount, lastBackup] = await Promise.all([
    store.states(), store.days(), store.journalCount(), store.getMeta('lastBackup', null)]);
  const queue = buildQueue(decks.flatMap((d) => d.cartes), states, now,
    { newLimit: NEW_PER_DAY, newToday: countNewToday(states, now) });
  let sprint = null;
  if (sprintActif(now)) {
    try {
      const [gabarits, notes] = await Promise.all([loadData('oral/gabarits.json'), store.notes()]);
      const suivante = prochaineEtape(etapes(notes, gabarits));
      if (suivante) sprint = { lien: suivante.lien, titre: suivante.titre.charAt(0).toLowerCase() + suivante.titre.slice(1), jours: joursRestants(now) };
    } catch (e) { console.warn('sprint', e); } // le bloc normal reste affiché
  }
  const list = blocs(now, queue.length, sprint);
  let rec = days.find((d) => d.day === today) ?? { day: today, done: {}, finished: false };
  const finishedDays = new Set(days.filter((d) => d.finished).map((d) => d.day));

  const zone = h('div');
  view.append(zone);

  function semaine() {
    const cases = [];
    for (let i = 6; i >= 0; i--) {
      const k = dayKey(addDays(now, -i));
      cases.push({ k, ok: k === today ? rec.finished : finishedDays.has(k) });
    }
    return { cases, n: cases.filter((c) => c.ok).length };
  }

  async function toggle(id, on) {
    rec = await store.patchDay(today, { done: { [id]: on } });
    draw();
  }

  async function terminer(e) {
    e.target.disabled = true;
    rec = await store.patchDay(today, { finished: true, finishedAt: Date.now() });
    stopTimer();
    let msg = null;
    try {
      const r = await sauvegarderDansDossier(store, { interactive: true });
      msg = r.ok ? `Sauvegarde écrite : ${r.name}` : null;
    } catch (err) { msg = `Sauvegarde automatique impossible (${err.message ?? err}).`; }
    finishedDays.add(today);
    draw(msg);
  }

  function draw(backupMsg = null) {
    const w = semaine();
    const jours = journalCount > 0 && (lastBackup == null || now - lastBackup > 7 * 86400000);
    if (rec.finished) {
      fill(zone, 
        h('div', { class: 'carte fin' },
          h('h1', null, 'C\'est fait.'),
          h('p', { class: 'chapo' }, 'La séance du jour est terminée. Ferme l\'écran : il n\'y a rien d\'autre à voir ici.'),
          h('p', null, `${plural(w.n, 'jour tenu', 'jours tenus')} sur les 7 derniers (5 sur 7 suffisent).`),
          backupMsg ? h('p', { class: 'petit' }, backupMsg) : null,
          h('a', { class: 'lien', href: '#/cartes' }, 'Voir les paquets')));
      return;
    }
    const doneCount = list.filter((b) => rec.done[b.id]).length;
    fill(zone, 
      h('p', { class: 'date' }, dateLongue(now)),
      h('h1', null, 'Aujourd\'hui'),
      jours ? h('p', { class: 'alerte' }, lastBackup == null
        ? 'Aucune sauvegarde faite. ' : `Dernière sauvegarde il y a ${Math.floor((now - lastBackup) / 86400000)} jours. `,
        h('a', { href: '#/sauvegarde' }, 'Sauvegarder')) : null,
      h('ol', { class: 'blocs' }, list.map((b) => {
        const fait = !!rec.done[b.id];
        const actif = timerLabel() === b.titre;
        return h('li', { class: `bloc${fait ? ' fait' : ''}${b.avenir ? ' avenir' : ''}` },
          h('input', { type: 'checkbox', id: `b-${b.id}`, checked: fait, disabled: !!b.avenir,
            'aria-label': `${b.titre} fait`, onchange: (e) => toggle(b.id, e.target.checked) }),
          h('div', { class: 'bloc-corps' },
            h('label', { for: `b-${b.id}` }, h('strong', null, b.titre), h('span', { class: 'min' }, ` ${b.min} min`)),
            h('p', { class: 'petit' }, b.avenir ?? b.note ?? '')),
          h('div', { class: 'bloc-actions' },
            b.lien ? h('a', { class: 'bouton', href: b.lien }, fait ? 'Revoir' : 'Commencer') : null,
            !b.avenir ? h('button', { class: 'lien', onclick: () => { actif ? stopTimer() : startTimer(b.titre, b.min); draw(); } },
              actif ? 'Arrêter le minuteur' : '⏱ Minuteur') : null));
      })),
      h('div', { class: 'pied-seance' },
        h('p', { class: 'petit' }, `${doneCount} bloc${doneCount > 1 ? 's' : ''} fait${doneCount > 1 ? 's' : ''} · ${plural(w.n, 'jour tenu', 'jours tenus')} sur 7`,
          h('span', { class: 'points', 'aria-hidden': 'true' }, w.cases.map((c) => h('i', { class: c.ok ? 'on' : '', title: c.k })))),
        h('button', { class: 'bouton principal', onclick: terminer }, 'Terminer la séance')));
  }
  draw();
}
