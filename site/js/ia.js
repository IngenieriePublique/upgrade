// IA facultative et jamais bloquante : le Brief est complet sans elle.
// Repli permanent : copier un prompt prêt à coller dans n'importe quel chat gratuit.
// La clé reste dans le localStorage de ce navigateur (jamais exportée, jamais dans le dépôt).
// On n'envoie que des textes publics (titres et chapôs du Brief), jamais de notes personnelles.

export const FOURNISSEURS = {
  gemini: { nom: 'Google Gemini (AI Studio)', modele: 'gemini-flash-latest', format: 'gemini',
    base: 'https://generativelanguage.googleapis.com/v1beta',
    aide: 'Palier gratuit : les contenus envoyés peuvent servir à améliorer les produits de Google (acceptable ici : textes publics).' },
  mistral: { nom: 'Mistral (La Plateforme)', modele: 'mistral-small-latest', format: 'openai', base: 'https://api.mistral.ai/v1',
    aide: 'Plan gratuit soumis à l\'acceptation de l\'entraînement sur les données.' },
  groq: { nom: 'Groq', modele: 'llama-3.3-70b-versatile', format: 'openai', base: 'https://api.groq.com/openai/v1',
    aide: 'Quotas gratuits par organisation ; le nom du modèle change souvent : le corriger au besoin.' },
};

const CLE = 'upgrade-ia';

export function lireConfig(storage = globalThis.localStorage) {
  try {
    const c = JSON.parse(storage.getItem(CLE) ?? 'null');
    return c && FOURNISSEURS[c.fournisseur] ? c : null;
  } catch { return null; }
}

export function ecrireConfig(cfg, storage = globalThis.localStorage) {
  try {
    if (cfg) storage.setItem(CLE, JSON.stringify(cfg)); else storage.removeItem(CLE);
    return true;
  } catch { return false; }
}

// Prompt à coller dans un chat : tout le contexte est dans le texte, rien n'est inventé par le modèle.
export function promptBrief(brief) {
  const lignes = brief.items.map((it, i) =>
    `${i + 1}. [${it.source}] ${it.titre}${it.chapo ? `\n   Chapô : ${it.chapo}` : ''}`);
  return [
    'Tu m\'aides à préparer des conversations à partir de l\'actualité. Voici les titres et chapôs du jour. ' +
    'Travaille UNIQUEMENT à partir de ces textes : n\'ajoute aucun fait, chiffre ou date qui n\'y figure pas. ' +
    'Si le texte ne suffit pas, écris « information insuffisante ».',
    '',
    ...lignes,
    '',
    'Pour chaque numéro, réponds en trois lignes maximum :',
    '- Résumé : une ou deux phrases, en français clair.',
    '- Angle : une question ouverte qui permet de lancer une conversation avec un professionnel de l\'action publique.',
    'Termine par une question de synthèse qui relie deux ou trois de ces sujets.',
  ].join('\n');
}

export function construireRequete(cfg, prompt) {
  const f = FOURNISSEURS[cfg.fournisseur];
  const modele = cfg.modele || f.modele;
  if (f.format === 'gemini') {
    return {
      url: `${f.base}/models/${encodeURIComponent(modele)}:generateContent`,
      init: { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.cle },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } }) },
    };
  }
  return {
    url: `${f.base}/chat/completions`,
    init: { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.cle}` },
      body: JSON.stringify({ model: modele, temperature: 0.3, messages: [{ role: 'user', content: prompt }] }) },
  };
}

export function extraireTexte(cfg, json) {
  const f = FOURNISSEURS[cfg.fournisseur];
  const t = f.format === 'gemini'
    ? json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
    : json?.choices?.[0]?.message?.content;
  if (!t || !String(t).trim()) throw new IaError('Réponse vide du fournisseur.');
  return String(t).trim();
}

export class IaError extends Error {
  constructor(message, { quota = false } = {}) { super(message); this.quota = quota; }
}

// Renvoie le texte du modèle, ou lève IaError (quota = true si la limite gratuite est atteinte).
export async function demander(cfg, prompt, fetchImpl = globalThis.fetch) {
  if (!cfg?.cle) throw new IaError('Aucune clé enregistrée.');
  const { url, init } = construireRequete(cfg, prompt);
  let r;
  try { r = await fetchImpl(url, init); } catch (e) { throw new IaError(`Réseau indisponible (${e.message ?? e}).`); }
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json())?.error?.message ?? ''; } catch { /* corps non JSON */ }
    throw new IaError(`${r.status} ${detail}`.trim().slice(0, 200), { quota: r.status === 429 });
  }
  return extraireTexte(cfg, await r.json());
}
