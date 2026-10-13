// Mémoire des articles lus (Brief, Lectures) : stockée dans la base IndexedDB du navigateur (la même que le reste de First Upgrade),
// donc conservée quand on ferme et rouvre la page. Sans base disponible (navigation privée), repli sur le localStorage, puis sur la mémoire.

export async function lire(store, cle, defaut) {
  if (store.memoire) {
    try { const v = localStorage.getItem(`first:${cle}`); return v == null ? defaut : JSON.parse(v); } catch { return defaut; }
  }
  return store.getMeta(cle, defaut);
}

export async function ecrire(store, cle, valeur) {
  if (store.memoire) {
    try { localStorage.setItem(`first:${cle}`, JSON.stringify(valeur)); } catch { /* stockage indisponible : la valeur reste en mémoire */ }
    return;
  }
  await store.setMeta(cle, valeur);
}

// Brief : { identifiant: 'AAAA-MM-JJ' (jour où il a été lu) }. Les identifiants changent chaque jour : on oublie ceux de plus de 60 jours.
export const CLE_BRIEF = 'first-brief-lus';
const JOURS_BRIEF = 60;

export function elaguer(lus, jour, jours = JOURS_BRIEF) {
  const limite = Date.parse(jour) - jours * 86400000;
  return Object.fromEntries(Object.entries(lus).filter(([, j]) => Date.parse(j) >= limite));
}
