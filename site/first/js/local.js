// Version locale / version light.
// Servi par scripts/serve_local.py (adresse http://127.0.0.1:8765/site/), le site trouve une API (/api/ping) : mode « local »,
// toutes les activités, et la progression est aussi écrite dans un fichier du disque (data_local/progression/) à chaque
// modification, puis relue à l'ouverture : Firefox peut effacer ses données, rien n'est perdu.
// Sans ce serveur (GitHub Pages, téléphone), mode « light » : seulement les jeux (territoires, cartes, calcul), progression dans le navigateur.
// `?light` dans l'adresse force le mode light (pour l'essayer en local).

const DELAI_ENVOI = 300;       // ms : les écritures rapprochées (série de cartes) partent en un seul envoi
const BATTEMENT = 30000;       // ms : tant que la page est ouverte, elle interroge le serveur (qui s'arrête seul sans nouvelles, voir serve_local.py)
const LIMITE_KEEPALIVE = 60000; // octets : au-delà, un envoi lancé à la fermeture de la page n'est pas garanti
const ECRITURES = ['review', 'setMeta', 'patchDay', 'putNote', 'deleteNote', 'importMerge'];

export const adresseApi = () => new URL('../api/', document.baseURI).href;

export async function detecter(recherche = location.search) {
  if (new URLSearchParams(recherche).has('light')) return false;
  const ctrl = new AbortController();
  const arret = setTimeout(() => ctrl.abort(), 2000);
  try {
    const r = await fetch(`${adresseApi()}ping`, { signal: ctrl.signal, cache: 'no-store' });
    return r.ok && (await r.json()).local === true;
  } catch { return false; } finally { clearTimeout(arret); }
}

// Bandeau d'alerte (rien tant que tout va bien).
function bandeau(texte) {
  let el = document.querySelector('.alerte-local');
  if (!texte) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.className = 'alerte-local';
    el.setAttribute('role', 'alert');
    document.body.append(el);
  }
  el.textContent = texte;
}

async function lireFichier(api) {
  const r = await fetch(`${api}sauvegarde`, { cache: 'no-store' });
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(`lecture refusée (${r.status})`);
  return r.json();
}

async function envoyer(api, data, urgent = false) {
  const corps = JSON.stringify(data);
  const r = await fetch(`${api}sauvegarde`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: corps,
    keepalive: urgent && corps.length < LIMITE_KEEPALIVE,
  });
  if (!r.ok) throw new Error(`écriture refusée (${r.status})`);
}

// Relit le fichier (il fait foi pour les réglages ; les révisions, notes et jours sont fusionnés), puis envoie l'état complet
// à chaque écriture. Renvoie true si la synchronisation est active.
export async function brancher(store, api = adresseApi()) {
  try {
    const fichier = await lireFichier(api);
    if (fichier) await store.importMerge(fichier, { prioriteImport: true });
    await envoyer(api, await store.exportAll());
  } catch (e) {
    console.warn('sauvegarde locale', e);
    bandeau(`La progression n'est pas enregistrée sur l'ordinateur (${e.message ?? e}). Elle reste dans le navigateur.`);
    return false;
  }

  let minuteur = null;
  let enCours = false;
  let encore = false;
  async function pousser(urgent = false) {
    clearTimeout(minuteur);
    minuteur = null;
    if (enCours) { encore = true; return; }
    enCours = true;
    try {
      do {
        encore = false;
        await envoyer(api, await store.exportAll(), urgent);
      } while (encore);
      bandeau(null);
    } catch (e) {
      console.warn('sauvegarde locale', e);
      bandeau('La progression n\'a pas pu être enregistrée sur l\'ordinateur : le serveur local est-il toujours lancé ?');
    } finally { enCours = false; }
  }
  const planifier = () => { clearTimeout(minuteur); minuteur = setTimeout(pousser, DELAI_ENVOI); };

  for (const nom of ECRITURES) {
    const origine = store[nom].bind(store);
    store[nom] = async (...args) => { const r = await origine(...args); planifier(); return r; };
  }
  // Un envoi encore en attente quand on ferme ou quitte la page part tout de suite.
  const vider = () => { if (minuteur) pousser(true); };
  addEventListener('pagehide', vider);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') vider(); });

  // Le serveur lancé sans fenêtre s'arrête quand plus aucune page ne l'interroge : celle-ci le fait toutes les 30 secondes.
  let arret = false;
  setInterval(async () => {
    try {
      await fetch(`${api}ping`, { cache: 'no-store' });
      if (arret) { arret = false; bandeau(null); pousser(); }
    } catch {
      arret = true;
      bandeau('Le serveur local est arrêté : relancer « Lancer First Upgrade ». La progression reste dans ce navigateur et sera enregistrée dès son retour.');
    }
  }, BATTEMENT);
  return true;
}
