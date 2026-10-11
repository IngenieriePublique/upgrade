// Routeur à fragment (#/chemin?clé=valeur). Chaque route : { path, render({view, params, ...ctx}) -> cleanup? }.
import { h } from './ui.js';

export function createRouter(routes, outlet, ctx) {
  let cleanup = null;
  let token = 0;

  async function go() {
    const mine = ++token;
    const hash = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = hash.split('?');
    const params = Object.fromEntries(new URLSearchParams(qs ?? ''));
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }

    const route = routes.find((r) => r.path === path) ?? routes.find((r) => r.path === '*');
    const view = h('div', { class: 'view' });
    let res;
    try {
      res = await route.render({ ...ctx, view, params });
    } catch (e) {
      console.error(e);
      view.replaceChildren(h('div', { class: 'carte erreur' }, h('h2', null, 'Erreur'), h('p', null, String(e.message ?? e))));
    }
    if (mine !== token) { if (typeof res === 'function') res(); return; }
    if (typeof res === 'function') cleanup = res;
    outlet.replaceChildren(view);
    document.querySelectorAll('[data-route]').forEach((a) => {
      const on = a.dataset.route === '/' ? path === '/' : path.startsWith(a.dataset.route);
      a.classList.toggle('actif', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    outlet.focus({ preventScroll: true });
  }

  window.addEventListener('hashchange', go);
  return go;
}
