// Chargement (avec mémoire) des fichiers de données publiés dans site/data/.
const cache = new Map();

export function loadData(path) {
  if (!cache.has(path)) {
    const p = fetch(`data/${path}`).then((r) => {
      if (!r.ok) throw new Error(`data/${path} : HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(path)); // une erreur ne reste pas en mémoire
    cache.set(path, p);
  }
  return cache.get(path);
}
