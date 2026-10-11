// Minuteur global (un seul à la fois), affiché dans l'en-tête sur toutes les pages.
import { h } from './ui.js';

let handle = null;
let endAt = 0;
let label = '';
let box = null;
const BASE_TITLE = 'Upgrade';

export function initTimer(el) {
  box = el;
  draw();
}

export function startTimer(name, minutes) {
  stopTimer();
  label = name;
  endAt = Date.now() + minutes * 60000;
  handle = setInterval(tick, 500);
  draw();
}

export function stopTimer() {
  if (handle) clearInterval(handle);
  handle = null;
  document.title = BASE_TITLE;
  draw();
}

export const timerLabel = () => (handle ? label : null);

function tick() {
  const left = endAt - Date.now();
  if (left <= 0) {
    clearInterval(handle);
    handle = null;
    beep();
    document.title = `Temps écoulé — ${BASE_TITLE}`;
    draw(true);
    return;
  }
  document.title = `${fmt(left)} · ${label}`;
  draw();
}

const fmt = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function draw(finished = false) {
  if (!box) return;
  if (finished) {
    box.replaceChildren(h('span', { class: 'timer fini' }, `${label} : temps écoulé`,
      h('button', { class: 'lien', onclick: stopTimer }, 'OK')));
  } else if (handle) {
    box.replaceChildren(h('span', { class: 'timer' }, `⏱ ${label} ${fmt(endAt - Date.now())}`,
      h('button', { class: 'lien', onclick: stopTimer }, 'Arrêter')));
  } else {
    box.replaceChildren();
  }
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.frequency.value = 660;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch { /* le son est facultatif */ }
}
