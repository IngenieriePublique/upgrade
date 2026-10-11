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

// Zone de texte à enregistrement automatique (après 600 ms sans frappe, et en quittant le champ).
// onSave(valeur) peut être asynchrone ; l'état « Enregistré » s'affiche à côté du libellé.
export function zoneTexte({ label, aide, valeur = '', rows = 3, onSave, id }) {
  const etat = h('span', { class: 'etat-save', 'aria-live': 'polite' });
  const area = h('textarea', { id, rows, 'aria-describedby': aide ? `${id}-aide` : null }, valeur);
  let timer = null;
  let dernier = valeur;
  async function save() {
    clearTimeout(timer);
    timer = null;
    if (area.value === dernier) return;
    dernier = area.value;
    try { await onSave(area.value); etat.textContent = 'Enregistré'; }
    catch (e) { etat.textContent = `Échec : ${e.message ?? e}`; }
  }
  area.addEventListener('input', () => { etat.textContent = ''; clearTimeout(timer); timer = setTimeout(save, 600); });
  area.addEventListener('blur', save);
  return h('div', { class: 'champ' },
    h('label', { for: id }, label, etat),
    aide ? h('p', { class: 'petit', id: `${id}-aide` }, aide) : null,
    area);
}

// Copie un texte dans le presse-papiers ; sans autorisation, l'affiche dans une zone à copier à la main.
export async function copierTexte(texte, sortie) {
  try {
    await navigator.clipboard.writeText(texte);
    fill(sortie, h('span', { class: 'petit' }, 'Copié dans le presse-papiers.'));
  } catch {
    fill(sortie, h('textarea', { rows: 8, readonly: true, 'aria-label': 'Texte à copier' }, texte));
  }
}

const fmtLong =new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
export const dateLongue = (ts) => fmtLong.format(ts);

export function plural(n, un, plusieurs) {
  return `${n} ${n > 1 ? plusieurs : un}`;
}
