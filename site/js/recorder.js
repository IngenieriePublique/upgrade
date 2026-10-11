// Enregistreur audio local (MediaRecorder). Rien n'est envoyé : le son reste en mémoire jusqu'à la fermeture de la page,
// sauf si l'utilisateur le télécharge lui-même.

export const enregistrementSupporte = () =>
  typeof MediaRecorder !== 'undefined' && !!globalThis.navigator?.mediaDevices?.getUserMedia;

const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export const choisirMime = (rec = globalThis.MediaRecorder) =>
  (rec?.isTypeSupported ? MIMES.find((m) => rec.isTypeSupported(m)) : null) ?? '';

export const extension = (mime) => (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm');

// Démarre l'enregistrement. Renvoie { arreter() -> Promise<{ blob, mime, duree }>, annuler() }.
// Lève une erreur claire si le micro est refusé ou absent.
export async function demarrer() {
  let flux;
  try {
    flux = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    const refus = e.name === 'NotAllowedError' || e.name === 'SecurityError';
    throw new Error(refus ? 'Accès au micro refusé : autorise-le dans la barre d\'adresse du navigateur.'
      : e.name === 'NotFoundError' ? 'Aucun micro détecté.' : `Micro indisponible (${e.message ?? e.name}).`);
  }
  const mime = choisirMime();
  const rec = new MediaRecorder(flux, mime ? { mimeType: mime } : undefined);
  const morceaux = [];
  rec.ondataavailable = (ev) => { if (ev.data.size) morceaux.push(ev.data); };
  const t0 = Date.now();
  rec.start();
  const liberer = () => flux.getTracks().forEach((t) => t.stop());
  return {
    arreter: () => new Promise((resolve) => {
      rec.onstop = () => {
        liberer();
        resolve({ blob: new Blob(morceaux, { type: rec.mimeType || mime || 'audio/webm' }), mime: rec.mimeType || mime, duree: (Date.now() - t0) / 1000 });
      };
      rec.stop();
    }),
    annuler: () => { rec.onstop = null; try { rec.stop(); } catch { /* déjà arrêté */ } liberer(); },
  };
}
