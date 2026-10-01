// Beat garden: a 16-step drum sequencer laid out as an ARIA grid.
// One tab stop; arrow keys move, Space/Enter plants or pulls a beat.
// With a mouse you can drag to paint several steps at once.

import { h } from './dom.js';
import { DRUMS, STEPS } from '../state/beats.js';

const ROW_COLORS = { kick: 'var(--n0)', snare: 'var(--n2)', clap: 'var(--n6)', hat: 'var(--n8)', bell: 'var(--n10)' };

export class BeatGarden {
  constructor({ root, clock, drums, engine, getRows, setRows, onBeat }) {
    this.root = root;
    this.clock = clock;
    this.drums = drums;
    this.engine = engine;
    this.getRows = getRows;
    this.setRows = setRows;
    this.onBeat = onBeat;
    this.playing = false;
    this.cells = []; // [row][step] -> button
    this.focus = { r: 0, c: 0 };
    this.paint = null;
    this.lastPointer = 'mouse';
    this.timers = new Set();
    this.nowStep = -1;

    this._build();
    clock.onStep((step, time) => this._tick(step, time));
  }

  _build() {
    const head = h('div', { class: 'beatrow beatrow--head', role: 'row' },
      h('span', { role: 'columnheader' }, h('span', { class: 'visually-hidden' }, 'Drum')),
      ...Array.from({ length: STEPS }, (_, i) =>
        h('span', { role: 'columnheader', class: i % 4 === 0 ? 'is-beat-start' : '' }, String(i + 1))));
    this.root.append(head);

    DRUMS.forEach((drum, r) => {
      const row = h('div', { class: 'beatrow', role: 'row', style: { '--row': ROW_COLORS[drum.id] } },
        h('span', { class: 'beatrow__label', role: 'rowheader' }, drum.label));
      this.cells[r] = [];
      for (let c = 0; c < STEPS; c++) {
        const btn = h('button', {
          type: 'button',
          class: `step${c % 4 === 0 ? ' is-beat-start' : ''}`,
          tabindex: r === 0 && c === 0 ? 0 : -1,
          'aria-pressed': 'false',
          'aria-label': `${drum.label}, step ${c + 1}`,
          dataset: { r: String(r), c: String(c) },
        });
        this.cells[r][c] = btn;
        row.append(h('span', { role: 'gridcell' }, btn));
      }
      this.root.append(row);
    });

    this.root.addEventListener('click', (e) => {
      const btn = e.target.closest?.('.step');
      if (!btn) return;
      // Mouse presses already toggled on pointerdown (to support painting).
      if (e.detail !== 0 && this.lastPointer === 'mouse') return;
      this._toggle(Number(btn.dataset.r), Number(btn.dataset.c));
    });
    this.root.addEventListener('pointerdown', (e) => {
      this.lastPointer = e.pointerType;
      const btn = e.target.closest?.('.step');
      if (!btn || e.pointerType !== 'mouse' || e.button !== 0) return;
      const r = Number(btn.dataset.r);
      const c = Number(btn.dataset.c);
      this.paint = !this.getRows()[DRUMS[r].id][c];
      this._set(r, c, this.paint, true);
      this._setFocus(r, c, false);
    });
    this.root.addEventListener('pointerover', (e) => {
      if (this.paint === null || e.pointerType !== 'mouse') return;
      const btn = e.target.closest?.('.step');
      if (btn) this._set(Number(btn.dataset.r), Number(btn.dataset.c), this.paint, false);
    });
    window.addEventListener('pointerup', () => {
      this.paint = null;
    });
    this.root.addEventListener('keydown', (e) => this._key(e));
    this.root.addEventListener('focusin', (e) => {
      const btn = e.target.closest?.('.step');
      if (btn) this._setFocus(Number(btn.dataset.r), Number(btn.dataset.c), false);
    });
    this.render();
  }

  render() {
    const rows = this.getRows();
    DRUMS.forEach((drum, r) => {
      for (let c = 0; c < STEPS; c++) this.cells[r][c].setAttribute('aria-pressed', String(rows[drum.id][c]));
    });
  }

  _toggle(r, c) {
    const on = !this.getRows()[DRUMS[r].id][c];
    this._set(r, c, on, true);
  }

  _set(r, c, on, preview) {
    const rows = this.getRows();
    const id = DRUMS[r].id;
    if (rows[id][c] === on) return;
    const next = { ...rows, [id]: rows[id].map((v, i) => (i === c ? on : v)) };
    this.setRows(next);
    this.cells[r][c].setAttribute('aria-pressed', String(on));
    // Hear what you plant (unless the beat is already playing it for you).
    if (on && preview && !this.playing) this.drums.play(id, undefined, 0.9);
  }

  _setFocus(r, c, move = true) {
    this.cells[this.focus.r][this.focus.c].tabIndex = -1;
    this.focus = { r, c };
    const btn = this.cells[r][c];
    btn.tabIndex = 0;
    if (move) btn.focus();
  }

  _key(e) {
    const { r, c } = this.focus;
    const moves = {
      ArrowRight: [r, Math.min(STEPS - 1, c + 1)],
      ArrowLeft: [r, Math.max(0, c - 1)],
      ArrowDown: [Math.min(DRUMS.length - 1, r + 1), c],
      ArrowUp: [Math.max(0, r - 1), c],
      Home: e.ctrlKey ? [0, 0] : [r, 0],
      End: e.ctrlKey ? [DRUMS.length - 1, STEPS - 1] : [r, STEPS - 1],
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    this._setFocus(...moves[e.key]);
  }

  toggle(play = !this.playing) {
    if (play === this.playing) return;
    this.playing = play;
    if (play) {
      const wasRunning = this.clock.running;
      this.clock.acquire('beat');
      if (wasRunning) this.clock.realign();
    } else {
      this.clock.release('beat');
      for (const t of this.timers) clearTimeout(t);
      this.timers.clear();
      this._showStep(-1);
    }
  }

  _tick(step, time) {
    if (!this.playing) return;
    const s = step % STEPS;
    const rows = this.getRows();
    for (const drum of DRUMS) {
      if (rows[drum.id][s]) this.drums.play(drum.id, time, s % 4 === 0 ? 1 : 0.82);
    }
    const ms = Math.max(0, (time - this.engine.now) * 1000);
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.playing) return;
      this._showStep(s);
      if (s % 4 === 0) this.onBeat?.(s / 4);
    }, ms);
    this.timers.add(t);
  }

  _showStep(s) {
    if (this.nowStep >= 0) for (const row of this.cells) row[this.nowStep].classList.remove('is-now');
    this.nowStep = s;
    if (s >= 0) for (const row of this.cells) row[s].classList.add('is-now');
  }
}
