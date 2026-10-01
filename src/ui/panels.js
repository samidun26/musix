// Tabs, dialogs, the recorder panel and the settings form.

import { h, icon, announce, toast, formatTime } from './dom.js';
import { Recorder, recordingSupported, extensionFor } from '../audio/recorder.js';

/** WAI-ARIA tabs with automatic activation. */
export function setupTabs(tablist) {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const select = (tab, focus = true) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
  };
  tablist.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) select(tab);
  });
  tablist.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next == null) return;
    e.preventDefault();
    select(tabs[(next + tabs.length) % tabs.length]);
  });
}

/** Native <dialog> with focus returned to whatever opened it. */
export function setupDialog(dialog, { onOpen } = {}) {
  let opener = null;
  dialog.addEventListener('close', () => {
    opener?.focus?.();
    opener = null;
  });
  // Clicking the dimmed backdrop closes the dialog.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  return {
    open() {
      if (dialog.open) return;
      opener = document.activeElement;
      onOpen?.();
      dialog.showModal();
    },
    close() {
      dialog.close();
    },
  };
}

export class RecorderPanel {
  constructor({ engine, els }) {
    this.els = els;
    this.recorder = new Recorder(engine);
    this.count = 0;
    this.timer = null;
    if (!recordingSupported()) {
      els.toggle.disabled = true;
      els.help.textContent = 'This browser can’t record audio. Try a recent Chrome, Edge, Firefox or Safari.';
      return;
    }
    els.toggle.addEventListener('click', () => (this.recorder.recording ? this.stop() : this.start()));
  }

  start() {
    try {
      this.recorder.start();
    } catch (err) {
      toast(err.message);
      return;
    }
    this.els.toggle.setAttribute('aria-pressed', 'true');
    this.els.label.textContent = 'Stop recording';
    announce('Recording. Play something!');
    const t0 = performance.now();
    this.els.time.textContent = '0:00';
    this.timer = setInterval(() => {
      this.els.time.textContent = formatTime((performance.now() - t0) / 1000);
    }, 250);
  }

  async stop() {
    clearInterval(this.timer);
    this.els.toggle.setAttribute('aria-pressed', 'false');
    this.els.label.textContent = 'Start recording';
    const take = await this.recorder.stop();
    if (!take) return;
    this.count++;
    const name = `Take ${this.count}`;
    const file = `musix-take-${this.count}.${extensionFor(take.mime)}`;
    const li = h(
      'li',
      { class: 'take' },
      h('div', { class: 'take__row' },
        h('span', { class: 'take__name' }, `${name} · ${formatTime(take.seconds)}`),
        h('span', { class: 'take__actions' },
          h('a', { class: 'btn', href: take.url, download: file }, icon('i-download'), 'Download'),
          h('button', {
            class: 'btn',
            type: 'button',
            'aria-label': `Delete ${name}`,
            onclick: () => {
              URL.revokeObjectURL(take.url);
              li.remove();
              announce(`${name} deleted`);
              this.els.toggle.focus();
            },
          }, icon('i-trash'), 'Delete'))),
      h('audio', { controls: true, src: take.url, preload: 'metadata', 'aria-label': name }),
    );
    this.els.takes.prepend(li);
    toast(`${name} saved — ${formatTime(take.seconds)}`);
  }
}

export const DEFAULT_SETTINGS = {
  theme: 'system',
  contrast: 'system',
  motion: 'system',
  textSize: 'default',
  readableFont: false,
  noteNames: 'letters',
  bigKeys: false,
  keyHints: true,
  computerKeys: true,
  haptics: true,
  maxVolume: 0.85,
  mono: false,
  beatFlash: false,
  announceNotes: false,
};

/** Two-way binding between the settings form and the settings store. */
export function bindSettingsForm(form, store, onReset) {
  const sync = () => {
    const s = store.get();
    for (const el of form.elements) {
      if (!el.name || !(el.name in s)) continue;
      if (el.type === 'radio') el.checked = s[el.name] === el.value;
      else if (el.type === 'checkbox') el.checked = Boolean(s[el.name]);
      else if (el.type === 'range') el.value = String(Math.round(s[el.name] * 100));
    }
    const out = form.querySelector('#max-volume-value');
    if (out) out.textContent = `${Math.round(s.maxVolume * 100)}%`;
  };
  form.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.name || !(el.name in store.get())) return;
    if (el.type === 'radio') store.set({ [el.name]: el.value });
    else if (el.type === 'checkbox') store.set({ [el.name]: el.checked });
    else if (el.type === 'range') store.set({ [el.name]: Number(el.value) / 100 });
  });
  form.querySelector('#settings-reset')?.addEventListener('click', () => {
    store.set({ ...DEFAULT_SETTINGS });
    onReset?.();
  });
  store.subscribe(sync);
  sync();
}

/** Reflect look-related settings on <html> so CSS can respond. */
export function applyLook(settings) {
  const root = document.documentElement;
  const mq = (q) => window.matchMedia?.(q).matches;
  if (settings.theme === 'light' || settings.theme === 'dark') root.dataset.theme = settings.theme;
  else delete root.dataset.theme;
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq('(prefers-color-scheme: dark)'));
  root.dataset.dark = String(dark);
  const contrast = settings.contrast === 'more' || (settings.contrast === 'system' && mq('(prefers-contrast: more)'));
  if (contrast) root.dataset.contrast = 'more';
  else delete root.dataset.contrast;
  const calm = settings.motion === 'reduce' || (settings.motion === 'system' && mq('(prefers-reduced-motion: reduce)'));
  if (calm) root.dataset.motion = 'reduce';
  else if (settings.motion === 'full') root.dataset.motion = 'full';
  else delete root.dataset.motion;
  if (settings.textSize !== 'default') root.dataset.text = settings.textSize;
  else delete root.dataset.text;
  if (settings.readableFont) root.dataset.font = 'readable';
  else delete root.dataset.font;
  return { dark };
}
