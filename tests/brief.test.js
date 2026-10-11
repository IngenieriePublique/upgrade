// Brief et adaptateur IA : fonctions pures, requêtes construites, repli en cas d'échec, schéma des données publiées.
import { test, eq, ok, rejects } from './runner.js';
import { ilYa, joursDepuis } from '../site/js/modules/brief.js';
import { construireRequete, extraireTexte, promptBrief, demander, lireConfig, ecrireConfig, IaError } from '../site/js/ia.js';

const brief = { items: [
  { source: 'Le Monde', titre: 'Budget 2027 : un titre', chapo: 'Un chapô.' },
  { source: 'RFI', titre: 'Autre titre sans chapô', chapo: '' }] };

test('ilYa : minutes, heures, jours', () => {
  const now = Date.parse('2026-10-12T12:00:00Z');
  eq(ilYa('2026-10-12T11:30:00Z', now), 'il y a moins d\'une heure');
  eq(ilYa('2026-10-12T07:00:00Z', now), 'il y a 5 h');
  eq(ilYa('2026-10-10T12:00:00Z', now), 'il y a 2 j');
  eq(ilYa('n\'importe quoi', now), '');
});

test('joursDepuis : calendaire, local', () => {
  const now = new Date(2026, 9, 12, 8, 0).getTime();
  eq(joursDepuis('2026-10-12', now), 0);
  eq(joursDepuis('2026-10-09', now), 3);
  eq(joursDepuis('2026-09-30', now), 12);
});

test('promptBrief : numérote les items, interdit d\'inventer, garde les chapôs', () => {
  const p = promptBrief(brief);
  ok(p.includes('1. [Le Monde] Budget 2027 : un titre\n   Chapô : Un chapô.'));
  ok(p.includes('2. [RFI] Autre titre sans chapô') && !p.includes('Chapô : \n'));
  ok(p.includes('UNIQUEMENT') && p.includes('information insuffisante'));
});

test('construireRequete : Gemini (clé en en-tête, jamais dans l\'URL) et format OpenAI', () => {
  const g = construireRequete({ fournisseur: 'gemini', cle: 'SECRET', modele: '' }, 'salut');
  ok(g.url.includes('/models/gemini-flash-latest:generateContent'));
  ok(!g.url.includes('SECRET'), 'la clé ne doit pas être dans l\'URL');
  eq(g.init.headers['x-goog-api-key'], 'SECRET');
  eq(JSON.parse(g.init.body).contents[0].parts[0].text, 'salut');
  const m = construireRequete({ fournisseur: 'mistral', cle: 'K', modele: 'mon-modele' }, 'salut');
  eq(m.url, 'https://api.mistral.ai/v1/chat/completions');
  eq(m.init.headers.authorization, 'Bearer K');
  eq(JSON.parse(m.init.body).model, 'mon-modele');
});

test('extraireTexte : refuse une réponse vide', () => {
  eq(extraireTexte({ fournisseur: 'gemini' }, { candidates: [{ content: { parts: [{ text: ' a ' }, { text: 'b' }] } }] }), 'a b');
  eq(extraireTexte({ fournisseur: 'groq' }, { choices: [{ message: { content: 'x' } }] }), 'x');
  let erreur = null;
  try { extraireTexte({ fournisseur: 'gemini' }, { candidates: [] }); } catch (e) { erreur = e; }
  ok(erreur instanceof IaError);
});

test('demander : quota 429 signalé, réseau coupé, absence de clé', async () => {
  const cfg = { fournisseur: 'gemini', cle: 'K' };
  let e = await demander(cfg, 'p', async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'limite' } }) })).catch((x) => x);
  ok(e instanceof IaError && e.quota === true, 'le quota doit être signalé');
  e = await demander(cfg, 'p', async () => { throw new TypeError('Failed to fetch'); }).catch((x) => x);
  ok(e instanceof IaError && !e.quota);
  e = await demander(cfg, 'p', async () => ({ ok: false, status: 500, json: async () => { throw new Error('pas du json'); } })).catch((x) => x);
  ok(e instanceof IaError && e.message.startsWith('500'));
  await rejects(demander({ fournisseur: 'gemini', cle: '' }, 'p'));
});

test('lireConfig / ecrireConfig : stockage local tolérant aux pannes', () => {
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  eq(lireConfig(st), null);
  ok(ecrireConfig({ fournisseur: 'groq', cle: 'K', modele: '' }, st));
  eq(lireConfig(st).fournisseur, 'groq');
  ecrireConfig(null, st);
  eq(lireConfig(st), null);
  mem.set('upgrade-ia', '{pas du json');
  eq(lireConfig(st), null);
  mem.set('upgrade-ia', JSON.stringify({ fournisseur: 'inconnu', cle: 'K' }));
  eq(lireConfig(st), null);
  const casse = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('bloqué'); }, removeItem() { throw new Error('bloqué'); } };
  eq(lireConfig(casse), null);
  eq(ecrireConfig({ fournisseur: 'groq', cle: 'K' }, casse), false);
});

test('data/brief/latest.json : schéma lu par l\'application, plafond de 13', async () => {
  const r = await fetch('../site/data/brief/latest.json');
  ok(r.ok, 'latest.json absent');
  const b = await r.json();
  eq(b.version, 1);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(b.date));
  ok(b.items.length <= 13);
  const ids = new Set();
  for (const it of b.items) {
    ok(!ids.has(it.id), `doublon ${it.id}`);
    ids.add(it.id);
    ok(it.titre && /^https:\/\//.test(it.lien) && it.question.endsWith('?'), `item mal formé ${it.id}`);
    ok(['france', 'monde', 'action_publique'].includes(it.rubrique));
    ok((it.chapo ?? '').length <= 201, 'chapô trop long');
  }
  const idx = await (await fetch('../site/data/brief/index.json')).json();
  ok(idx.dates.includes(b.date), 'le Brief du jour doit figurer dans l\'index');
});
