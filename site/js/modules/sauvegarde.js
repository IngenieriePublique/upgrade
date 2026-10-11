// Sauvegarde : export / import JSON et dossier de sauvegarde automatique.
import { h, fill, plural } from '../ui.js';
import { telecharger, dossierSupporte, choisirDossier, sauvegarderDansDossier } from '../backup.js';

export async function render({ view, store }) {
  const zone = h('div');
  view.append(zone);
  let message = null;

  async function draw() {
    const [last, dir, n, flags] = await Promise.all([
      store.getMeta('lastBackup', null), store.getMeta('_dossier', null),
      store.journalCount(), store.getMeta('flags', [])]);
    const fichier = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: importer });

    fill(zone, 
      h('h1', null, 'Sauvegarde'),
      h('p', { class: 'chapo' }, 'Ta progression vit uniquement dans ce navigateur. Si les données du site sont effacées, elle disparaît : sauvegarde au moins une fois par semaine.'),
      message ? h('p', { class: `alerte${message.erreur ? ' erreur' : ''}` }, message.texte) : null,
      h('section', { class: 'carte' },
        h('h2', null, 'État'),
        h('p', null, `${plural(n, 'révision enregistrée', 'révisions enregistrées')}. `,
          last ? `Dernière sauvegarde : ${new Date(last).toLocaleString('fr-FR')}.` : 'Aucune sauvegarde faite.'),
        flags.length ? h('p', { class: 'petit' }, `${plural(flags.length, 'carte signalée', 'cartes signalées')} (incluses dans la sauvegarde).`) : null),
      h('section', { class: 'carte' },
        h('h2', null, 'Dossier de sauvegarde automatique'),
        dossierSupporte
          ? [h('p', null, dir ? `Dossier choisi : ${dir.name}. Une sauvegarde y est écrite à chaque « Terminer la séance » (le navigateur peut redemander l'autorisation).`
            : 'Choisis un dossier (de préférence synchronisé : OneDrive, clé USB…).'),
            h('div', { class: 'rangee' },
              h('button', { class: 'bouton', onclick: choisir }, dir ? 'Changer de dossier' : 'Choisir un dossier'),
              dir ? h('button', { class: 'bouton', onclick: maintenant }, 'Sauvegarder maintenant') : null)]
          : h('p', null, 'Ce navigateur ne permet pas d\'écrire dans un dossier. Utilise l\'export manuel (Edge ou Chrome permettent le dossier).')),
      h('section', { class: 'carte' },
        h('h2', null, 'Export et import manuels'),
        h('div', { class: 'rangee' },
          h('button', { class: 'bouton', onclick: exporter }, 'Exporter (fichier JSON)'),
          h('button', { class: 'bouton', onclick: () => fichier.click() }, 'Importer un fichier')),
        h('p', { class: 'petit' }, 'L\'import fusionne avec les données présentes (rien n\'est écrasé) ; on peut le refaire sans doublon.'),
        fichier));
  }

  async function exporter() {
    telecharger(await store.exportAll());
    await store.setMeta('lastBackup', Date.now());
    message = { texte: 'Fichier exporté dans ton dossier de téléchargements.' };
    draw();
  }

  async function choisir() {
    try {
      await choisirDossier(store);
      const r = await sauvegarderDansDossier(store, { interactive: true });
      message = { texte: r.ok ? `Dossier enregistré, sauvegarde écrite : ${r.name}.` : `Dossier enregistré (${r.raison}).` };
    } catch (e) {
      if (e.name !== 'AbortError') message = { texte: `Impossible : ${e.message}`, erreur: true };
    }
    draw();
  }

  async function maintenant() {
    try {
      const r = await sauvegarderDansDossier(store, { interactive: true });
      message = r.ok ? { texte: `Sauvegarde écrite : ${r.name}.` } : { texte: `Échec : ${r.raison}.`, erreur: true };
    } catch (e) { message = { texte: `Échec : ${e.message}`, erreur: true }; }
    draw();
  }

  async function importer(e) {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const r = await store.importMerge(JSON.parse(await f.text()));
      message = { texte: `Import réussi : ${plural(r.ajoutees, 'révision ajoutée', 'révisions ajoutées')} (total ${r.total}, ${plural(r.cartes, 'carte', 'cartes')} suivies).` };
    } catch (err) {
      message = { texte: `Import refusé : ${err.message}`, erreur: true };
    }
    draw();
  }

  await draw();
}
