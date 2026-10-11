// Stockage local (IndexedDB). Rien ne quitte le navigateur : la progression n'est jamais dans le dépôt.
// Magasins : cards (état courant), journal (toutes les révisions), meta (réglages), days (séances du jour).
import { newState, schedule, replay } from './srs.js';

const DB_VERSION = 2;
export const BACKUP_FORMAT = 'upgrade-sauvegarde';

const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx) => new Promise((res, rej) => {
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error);
  tx.onabort = () => rej(tx.error || new Error('transaction annulée'));
});

export async function openStore(name = 'upgrade') {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB indisponible dans ce navigateur');
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open(name, DB_VERSION);
    r.onupgradeneeded = (ev) => {
      const d = r.result;
      if (ev.oldVersion < 1) {
        d.createObjectStore('cards', { keyPath: 'id' });
        const j = d.createObjectStore('journal', { keyPath: 'n', autoIncrement: true });
        j.createIndex('cardId', 'cardId');
        d.createObjectStore('meta', { keyPath: 'key' });
        d.createObjectStore('days', { keyPath: 'day' });
      }
      if (ev.oldVersion < 2) d.createObjectStore('notes', { keyPath: 'id' }); // pitch, histoires, radar, réseau, oral
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('base verrouillée par un autre onglet'));
  });
  return makeStore(db, name);
}

function makeStore(db, name) {
  const all = (store) => wrap(db.transaction(store).objectStore(store).getAll());

  const api = {
    name,

    async states() {
      return new Map((await all('cards')).map((s) => [s.id, s]));
    },

    // Enregistre une révision : journal + état dans la même transaction.
    async review(cardId, grade, now = Date.now()) {
      const tx = db.transaction(['cards', 'journal'], 'readwrite');
      const cards = tx.objectStore('cards');
      const cur = (await wrap(cards.get(cardId))) ?? newState(cardId);
      const next = schedule(cur, grade, now);
      cards.put(next);
      tx.objectStore('journal').add({ cardId, ts: now, grade });
      await done(tx);
      return next;
    },

    journal: () => all('journal'),
    journalCount: () => wrap(db.transaction('journal').objectStore('journal').count()),

    async getMeta(key, def = null) {
      const r = await wrap(db.transaction('meta').objectStore('meta').get(key));
      return r ? r.value : def;
    },
    async setMeta(key, value) {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ key, value });
      await done(tx);
    },

    async getDay(day) {
      return (await wrap(db.transaction('days').objectStore('days').get(day))) ?? { day, done: {}, finished: false };
    },
    // Fusionne `patch` dans la séance du jour ; `patch.done` est fusionné clé par clé.
    async patchDay(day, patch) {
      const tx = db.transaction('days', 'readwrite');
      const st = tx.objectStore('days');
      const cur = (await wrap(st.get(day))) ?? { day, done: {}, finished: false };
      const next = { ...cur, ...patch, done: { ...cur.done, ...(patch.done ?? {}) } };
      st.put(next);
      await done(tx);
      return next;
    },
    days: () => all('days'),

    // Notes personnelles : { id, kind, data, updatedAt, deleted? }. L'id commence par le genre (« pitch:p90 »).
    // Une suppression laisse une pierre tombale (deleted) pour que l'import d'une vieille sauvegarde ne la ressuscite pas.
    async notes(kind = null) {
      return (await all('notes')).filter((n) => !n.deleted && (kind == null || n.kind === kind));
    },
    async getNote(id) {
      const n = await wrap(db.transaction('notes').objectStore('notes').get(id));
      return n && !n.deleted ? n : null;
    },
    async putNote(id, data, now = Date.now()) {
      const note = { id, kind: id.split(':')[0], data, updatedAt: now };
      const tx = db.transaction('notes', 'readwrite');
      tx.objectStore('notes').put(note);
      await done(tx);
      return note;
    },
    async deleteNote(id, now = Date.now()) {
      const tx = db.transaction('notes', 'readwrite');
      tx.objectStore('notes').put({ id, kind: id.split(':')[0], data: null, updatedAt: now, deleted: true });
      await done(tx);
    },

    async addFlag(cardId, ts = Date.now()) {
      const flags = await api.getMeta('flags', []);
      if (!flags.some((f) => f.cardId === cardId)) flags.push({ cardId, ts });
      await api.setMeta('flags', flags);
      return flags;
    },

    // Les clés commençant par « _ » (poignée de dossier, etc.) ne sont jamais exportées.
    async exportAll() {
      const meta = {};
      for (const m of await all('meta')) if (!m.key.startsWith('_')) meta[m.key] = m.value;
      return {
        format: BACKUP_FORMAT,
        version: 2,
        exportedAt: Date.now(),
        journal: (await api.journal()).map(({ cardId, ts, grade }) => ({ cardId, ts, grade })),
        days: await api.days(),
        notes: await all('notes'),
        meta,
      };
    },

    // Fusion sûre et répétable : union des journaux, états recalculés, séances et signalements fusionnés.
    async importMerge(data) {
      if (!data || data.format !== BACKUP_FORMAT || !Array.isArray(data.journal)) {
        throw new Error('fichier de sauvegarde non reconnu');
      }
      const local = await api.journal();
      const seen = new Set(local.map((e) => `${e.cardId}|${e.ts}`));
      const fresh = data.journal.filter((e) => e && typeof e.cardId === 'string' && Number.isFinite(e.ts)
        && [0, 1, 2, 3].includes(e.grade) && !seen.has(`${e.cardId}|${e.ts}`));
      const merged = [...local, ...fresh];
      const states = replay(merged);

      const flagsLocal = await api.getMeta('flags', []);
      const flagsIn = Array.isArray(data.meta?.flags) ? data.meta.flags : [];
      const flags = [...flagsLocal];
      for (const f of flagsIn) if (!flags.some((x) => x.cardId === f.cardId)) flags.push(f);

      const notesIn = (Array.isArray(data.notes) ? data.notes : [])
        .filter((n) => n && typeof n.id === 'string' && n.id.includes(':') && Number.isFinite(n.updatedAt));

      const tx = db.transaction(['cards', 'journal', 'meta', 'days', 'notes'], 'readwrite');
      const j = tx.objectStore('journal');
      for (const e of fresh) j.add({ cardId: e.cardId, ts: e.ts, grade: e.grade });
      const c = tx.objectStore('cards');
      c.clear();
      for (const s of states.values()) c.put(s);
      const m = tx.objectStore('meta');
      for (const [key, value] of Object.entries(data.meta ?? {})) {
        if (key.startsWith('_') || key === 'flags') continue;
        const exists = await wrap(m.get(key));
        if (!exists) m.put({ key, value });
      }
      m.put({ key: 'flags', value: flags });
      const d = tx.objectStore('days');
      for (const day of data.days ?? []) {
        const cur = await wrap(d.get(day.day));
        d.put(cur
          ? { ...cur, done: { ...day.done, ...cur.done }, finished: cur.finished || day.finished }
          : day);
      }
      // Notes : la version la plus récente de chaque note l'emporte.
      const nt = tx.objectStore('notes');
      let notes = 0;
      for (const n of notesIn) {
        const cur = await wrap(nt.get(n.id));
        if (!cur || n.updatedAt > cur.updatedAt) {
          nt.put({ id: n.id, kind: n.id.split(':')[0], data: n.data ?? null, updatedAt: n.updatedAt, ...(n.deleted ? { deleted: true } : {}) });
          notes++;
        }
      }
      await done(tx);
      return { ajoutees: fresh.length, total: merged.length, cartes: states.size, notes };
    },

    close: () => db.close(),
    async destroy() {
      db.close();
      await wrap(indexedDB.deleteDatabase(name));
    },
  };
  return api;
}
