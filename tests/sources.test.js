// Vérifie les données publiées : paquets déclarés, cartes bien formées, au moins 2 sources par carte.
import { test, eq, ok } from './runner.js';

const get = async (p) => (await fetch(p)).json();

test('data/cartes : chaque paquet est valide (identifiants uniques, ≥ 2 sources, date de revue)', async () => {
  const index = await get('../site/data/cartes/index.json');
  ok(index.paquets.length > 0, 'aucun paquet');
  const ids = new Set();
  for (const p of index.paquets) {
    const d = await get(`../site/data/cartes/${p.fichier}`);
    eq(d.cartes.length, p.nombre, `nombre déclaré pour ${p.id}`);
    for (const c of d.cartes) {
      ok(!ids.has(c.id), `identifiant en double : ${c.id}`);
      ids.add(c.id);
      ok(c.recto && c.verso, `recto/verso manquant : ${c.id}`);
      ok(c.sources.length >= 2, `moins de 2 sources : ${c.id}`);
      ok(c.sources.every((s) => /^https?:\/\//.test(s.url) && s.titre), `source mal formée : ${c.id}`);
      ok(/^\d{4}-\d{2}-\d{2}$/.test(c.revu), `date de revue : ${c.id}`);
    }
  }
});
