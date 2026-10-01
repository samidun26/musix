// Small DOM helpers: a hyperscript-style element builder and live-region announcer.

/**
 * h('button', { class: 'btn', onclick: fn, 'aria-pressed': 'false' }, 'Label')
 * Strings become text nodes (never parsed as HTML).
 */
export function h(tag, props = {}, ...children) {
  const svgTags = new Set(['svg', 'path', 'circle', 'line', 'g', 'use', 'rect', 'ellipse']);
  const el = svgTags.has(tag)
    ? document.createElementNS('http://www.w3.org/2000/svg', tag)
    : document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value);
    } else if (key === 'class') {
      el.setAttribute('class', value);
    } else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) el.style.setProperty(prop, v);
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function icon(id) {
  return h('svg', { class: 'icon', 'aria-hidden': 'true' }, h('use', { href: `#${id}` }));
}

let politeTimer = null;
/** Speak a message through the screen-reader live regions. */
export function announce(message, { assertive = false } = {}) {
  const region = document.getElementById(assertive ? 'sr-assertive' : 'sr-polite');
  if (!region) return;
  // Clearing first makes repeated identical messages speak again.
  region.textContent = '';
  clearTimeout(politeTimer);
  politeTimer = setTimeout(() => {
    region.textContent = message;
  }, 60);
}

/** Visual toast; also announced politely so it's never sight-only. */
export function toast(message) {
  const zone = document.getElementById('toasts');
  announce(message);
  if (!zone) return;
  const el = h('div', { class: 'toast' }, message);
  zone.append(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 260);
  }, 2400);
}

export function prefersReducedMotion() {
  return document.documentElement.dataset.motion === 'reduce';
}

/** Copy text, falling back to selecting it when the clipboard is refused. */
export async function copyText(text, input) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (input) {
      input.focus();
      input.select();
    }
    return false;
  }
}

export function noteColorVar(midi) {
  return `var(--n${((midi % 12) + 12) % 12})`;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
