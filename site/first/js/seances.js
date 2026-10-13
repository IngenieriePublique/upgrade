// Liste des séances de travail archivées : date, durée et étiquettes sur chaque ligne ; la tâche accomplie et les détails
// s'ouvrent dans l'accordéon. Le fichier d'archive (JSON) s'exporte et se réimporte depuis le pied de page.
import { h, fill } from '../../js/ui.js';
import { cadre } from './cadre.js';
import { icone } from './icones.js';
import { lire, ecrire } from './lus.js';
import * as S from './suivi.js';

const fmtDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const heure = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export async function render({ view, store }) {
  let seances = S.triees((await lire(store, S.CLE_SEANCES, [])).filter(S.estSeance));
  let etiquettes = await lire(store, S.CLE_ETIQUETTES, []);
  let debut = await lire(store, S.CLE_DEBUT, null);
  const ouvertes = new Set();
  const liste = h('div', { class: 'seances-liste' });
  const pied = h('div', { class: 'seances-pied' });
  const message = h('span', { class: 'discret', 'aria-live': 'polite' });

  function ligne(s) {
    const totalJour = S.totauxParJour(seances)[S.jourLocal(s.debut)] ?? 0;
    const ouvert = ouvertes.has(s.id);
    const corps = h('div', { class: 'seance-corps', id: `seance-${s.id}`, hidden: !ouvert },
      h('div', null,
        h('span', { class: 'etiquette' }, 'Tâche accomplie'),
        s.tache ? h('p', { class: 'seance-tache' }, s.tache) : h('p', { class: 'discret' }, 'Aucune tâche notée.')),
      h('dl', { class: 'seance-details' },
        h('dt', null, 'Horaire'), h('dd', null, `${heure(s.debut)} – ${heure(s.fin)}`),
        h('dt', null, 'Travail effectif'), h('dd', null, S.duree(s.duree)),
        h('dt', null, 'Pauses'), h('dd', null, s.pauses ? `${s.pauses} (${S.duree(s.pause)})` : 'aucune'),
        h('dt', null, 'Ce jour-là'), h('dd', null, `${S.duree(totalJour)} sur un objectif de ${S.duree(s.objectif * 60)} (semaine ${s.semaine})`)),
      h('div', { class: 'rangee' },
        h('button', { type: 'button', class: 'secondaire', onclick: () => supprimer(s) }, icone('croix', { taille: 14 }), 'Supprimer cette séance')));
    const tete = h('button', { type: 'button', class: 'seance-tete', 'aria-expanded': String(ouvert), 'aria-controls': corps.id },
      h('span', { class: 'seance-date' }, majuscule(fmtDate.format(s.debut)), h('small', null, heure(s.debut))),
      h('span', { class: 'seance-duree' }, S.duree(s.duree)),
      h('span', { class: 'seance-tags' }, s.tags.map((t) => h('span', { class: 'tag-lu' }, t))),
      icone('bas', { taille: 20 }));
    const el = h('article', { class: `seance-ligne${ouvert ? ' ouvert' : ''}` }, tete, corps);
    tete.addEventListener('click', () => {
      const ouvre = corps.hidden;
      corps.hidden = !ouvre;
      tete.setAttribute('aria-expanded', String(ouvre));
      el.classList.toggle('ouvert', ouvre);
      if (ouvre) ouvertes.add(s.id); else ouvertes.delete(s.id);
    });
    return el;
  }

  async function supprimer(s) {
    if (!window.confirm(`Supprimer la séance du ${fmtLong.format(s.debut)} (${S.duree(s.duree)}) ?`)) return;
    seances = seances.filter((x) => x.id !== s.id);
    ouvertes.delete(s.id);
    await ecrire(store, S.CLE_SEANCES, seances);
    dessiner();
  }

  function telecharger() {
    const blob = new Blob([S.exporter({ seances, etiquettes, debut })], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `methode-de-travail-${S.jourLocal(Date.now())}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    message.textContent = `${seances.length} séance${seances.length > 1 ? 's' : ''} exportée${seances.length > 1 ? 's' : ''}.`;
  }

  async function importer(fichier) {
    try {
      const data = JSON.parse(await fichier.text());
      if (!Array.isArray(data.seances)) throw new Error('pas de liste de séances');
      const r = S.fusionner(seances, data.seances);
      seances = r.seances;
      for (const e of Array.isArray(data.etiquettes) ? data.etiquettes : []) etiquettes = S.ajouterEtiquette(etiquettes, e)?.liste ?? etiquettes;
      const d = data.programme?.debut;
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && (!debut || d < debut)) debut = d;
      await ecrire(store, S.CLE_SEANCES, seances);
      await ecrire(store, S.CLE_ETIQUETTES, etiquettes);
      if (debut) await ecrire(store, S.CLE_DEBUT, debut);
      dessiner();
      message.textContent = `${r.ajoutees} séance${r.ajoutees > 1 ? 's' : ''} ajoutée${r.ajoutees > 1 ? 's' : ''}.`;
    } catch (e) {
      message.textContent = `Fichier illisible : ${e.message ?? e}`;
    }
  }

  async function repartir() {
    if (!window.confirm('Repartir de la semaine 1 (objectif de 1 h 30 par jour) à partir d\'aujourd\'hui ? Les séances archivées sont conservées.')) return;
    debut = S.jourLocal(Date.now());
    await ecrire(store, S.CLE_DEBUT, debut);
    dessiner();
    message.textContent = 'Programme reparti de la semaine 1.';
  }

  const entree = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-label': 'Fichier à importer' });
  entree.addEventListener('change', () => { if (entree.files[0]) importer(entree.files[0]); entree.value = ''; });

  function dessiner() {
    const total = seances.reduce((s, x) => s + x.duree, 0);
    const semaine = S.semaineDuProgramme(debut, S.jourLocal(Date.now()));
    fill(liste, seances.length
      ? seances.map(ligne)
      : h('p', { class: 'discret vide' }, 'Aucune séance archivée pour l\'instant.'));
    fill(pied,
      h('span', { class: 'discret' }, `${seances.length} séance${seances.length > 1 ? 's' : ''}${seances.length ? ` · ${S.duree(total)} au total` : ''} · semaine ${semaine} du programme`),
      h('div', { class: 'rangee' },
        message,
        h('button', { type: 'button', class: 'secondaire', onclick: repartir }, 'Repartir de la semaine 1'),
        h('button', { type: 'button', class: 'secondaire', onclick: () => entree.click() }, 'Importer'),
        h('button', { type: 'button', class: 'secondaire', disabled: !seances.length, onclick: telecharger }, 'Exporter'),
        entree));
  }

  view.append(cadre({
    titre: 'Séances de travail',
    nom: 'seances',
    retour: { href: '#/methode', titre: 'Méthode de travail' },
    corps: h('div', { class: 'seances' }, liste, pied),
  }));
  dessiner();
}
