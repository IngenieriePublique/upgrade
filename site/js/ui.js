// Petit utilitaire DOM : h('div', {class: 'x', onclick: fn}, enfants…)
const PROPS = new Set(['value', 'checked', 'disabled', 'selected']);

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}

// Remplace le contenu de `el` ; ignore null/false (contrairement à replaceChildren, qui écrit « null »).
export function fill(el, ...kids) {
  el.replaceChildren();
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
export const dateLongue = (ts) => fmtLong.format(ts);

export function plural(n, un, plusieurs) {
  return `${n} ${n > 1 ? plusieurs : un}`;
}
