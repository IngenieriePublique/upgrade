// Sauvegardes : téléchargement manuel (partout) et dossier choisi (API File System Access, Edge/Chrome).
import { dayKey } from './srs.js';

export const dossierSupporte = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export function nomFichier(ts = Date.now()) {
  return `upgrade-sauvegarde-${dayKey(ts)}.json`;
}

export function telecharger(data) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nomFichier(data.exportedAt);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function choisirDossier(store) {
  const dir = await window.showDirectoryPicker({ id: 'upgrade-sauvegarde', mode: 'readwrite' });
  await store.setMeta('_dossier', dir);
  return dir;
}

export async function dossierChoisi(store) {
  return store.getMeta('_dossier', null);
}

// `interactive` : appelé depuis un clic, donc on peut redemander la permission d'écriture.
export async function sauvegarderDansDossier(store, { interactive = false } = {}) {
  const dir = await store.getMeta('_dossier', null);
  if (!dir) return { ok: false, raison: 'aucun dossier choisi' };
  let perm = await dir.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted' && interactive) perm = await dir.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') return { ok: false, raison: 'permission à renouveler' };
  const data = await store.exportAll();
  const name = nomFichier(data.exportedAt);
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(data));
  await w.close();
  await store.setMeta('lastBackup', data.exportedAt);
  return { ok: true, name };
}
