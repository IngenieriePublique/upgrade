// Mini lanceur de tests pour le navigateur (Node n'est pas installé).
const tests = [];
export const test = (name, fn) => tests.push({ name, fn });

export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} attendu ${b}, obtenu ${a}`);
}
export function ok(cond, msg = 'condition fausse') { if (!cond) throw new Error(msg); }
export async function rejects(promise, msg = 'aurait dû échouer') {
  try { await promise; } catch { return; }
  throw new Error(msg);
}

export async function run(root) {
  const out = [];
  for (const t of tests) {
    try { await t.fn(); out.push({ name: t.name, ok: true }); }
    catch (e) { out.push({ name: t.name, ok: false, err: String(e.message ?? e) }); }
  }
  const fails = out.filter((r) => !r.ok).length;
  root.innerHTML = `<h1>${fails ? '✗' : '✓'} ${out.length - fails}/${out.length} tests</h1>` + out.map((r) =>
    `<p style="color:${r.ok ? 'green' : 'crimson'}">${r.ok ? '✓' : '✗'} ${r.name}${r.err ? ` — ${r.err}` : ''}</p>`).join('');
  document.title = fails ? `ÉCHEC ${fails}` : `OK ${out.length}`;
  window.__results = out;
  return out;
}
