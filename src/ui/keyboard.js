// The on-screen piano. Multi-touch, glide across keys, velocity from where
// you strike the key, and a single tab stop with arrow-key navigation.

import { h, noteColorVar } from './dom.js';
import { isBlackKey, isInScale, noteLabel, spokenNoteName, pitchClass } from '../music/theory.js';

const coarsePointer = () => window.matchMedia?.('(pointer: coarse)').matches;

export class PianoKeyboard {
  /**
   * @param {{root: HTMLElement, performer: any, getState: () => any, hintFor: (midi: number) => string}} deps
   */
  constructor({ root, performer, getState, hintFor }) {
    this.root = root;
    this.performer = performer;
    this.getState = getState;
    this.hintFor = hintFor;
    this.keys = new Map();
    this.order = [];
    this.pointers = new Map();
    this.lit = new Map();
    this.focusMidi = 60;
    this.focusHeld = null;
    this.layoutKey = '';

    root.addEventListener('pointerdown', (e) => this._pointerDown(e));
    root.addEventListener('pointermove', (e) => this._pointerMove(e));
    root.addEventListener('pointerup', (e) => this._pointerUp(e));
    root.addEventListener('pointercancel', (e) => this._pointerUp(e));
    root.addEventListener('lostpointercapture', (e) => this._pointerUp(e));
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('keydown', (e) => this._keyDown(e));
    root.addEventListener('keyup', (e) => this._keyUp(e));
    root.addEventListener('focusin', (e) => {
      const key = e.target.closest?.('.key');
      if (key) this._setRoving(Number(key.dataset.midi));
    });
    root.addEventListener('focusout', (e) => {
      if (this.focusHeld != null && !root.contains(e.relatedTarget)) {
        this.performer.release('focus', this.focusHeld);
        this.focusHeld = null;
      }
    });

    performer.addEventListener('noteon', (e) => this._light(e.detail.midi, 1));
    performer.addEventListener('noteoff', (e) => this._light(e.detail.midi, -1));
    performer.addEventListener('press', (e) => this.keys.get(e.detail.input)?.classList.add('is-pressed'));
    performer.addEventListener('release', (e) => this.keys.get(e.detail.input)?.classList.remove('is-pressed'));

    new ResizeObserver(() => this.layout()).observe(root);
    this.layout();
  }

  /** Visible range [low, high]. */
  get range() {
    return [this.order[0], this.order[this.order.length - 1]];
  }

  /** Rebuild when the width, octave or key size changes; otherwise just refresh labels. */
  layout() {
    const st = this.getState();
    const width = this.root.clientWidth || 600;
    const minW = st.bigKeys ? 66 : coarsePointer() ? 46 : 40;
    const whites = Math.max(5, Math.min(22, Math.floor((width + 4) / (minW + 4))));
    const startOctave = whites >= 15 ? 3 : 4;
    const start = 12 * (startOctave + 1) + st.octave * 12;
    const key = `${start}:${whites}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this._build(start, whites);
    }
    this.refresh();
  }

  _build(start, whites) {
    this.root.replaceChildren();
    this.keys.clear();
    this.order = [];
    this.root.style.setProperty('--n', String(whites));
    let w = 0;
    let midi = start;
    while (w < whites) {
      const black = isBlackKey(midi);
      const el = h(
        'button',
        {
          type: 'button',
          class: `key key--${black ? 'black' : 'white'}`,
          tabindex: -1,
          'aria-pressed': 'false',
          dataset: { midi: String(midi) },
          style: { '--note': noteColorVar(midi), ...(black ? { '--i': String(w) } : {}) },
        },
        h('span', { class: 'key__dot', 'aria-hidden': 'true' }),
        h('span', { class: 'key__name', 'aria-hidden': 'true' }),
        h('span', { class: 'key__hint', 'aria-hidden': 'true' }),
      );
      this.root.append(el);
      this.keys.set(midi, el);
      this.order.push(midi);
      if (!black) w++;
      midi++;
    }
    // Restore lit state after a rebuild.
    for (const [m, count] of this.lit) if (count > 0) this.keys.get(m)?.classList.add('is-on');
    const [lo, hi] = this.range;
    if (this.focusMidi < lo || this.focusMidi > hi) {
      this.focusMidi = this.keys.has(lo + 12) ? lo + 12 : lo;
    }
    this._setRoving(this.focusMidi);
  }

  /** Update names, scale shading and computer-key hints. */
  refresh() {
    const st = this.getState();
    for (const [midi, el] of this.keys) {
      const outside = st.scaleId !== 'chromatic' && !isInScale(midi, st.root, st.scaleId);
      el.classList.toggle('is-outside', outside);
      const showOctave = pitchClass(midi) === 0;
      el.querySelector('.key__name').textContent = noteLabel(midi, st.noteNames, showOctave);
      const hint = st.keyHints && st.computerKeys ? this.hintFor(midi) : '';
      const hintEl = el.querySelector('.key__hint');
      hintEl.textContent = hint;
      hintEl.hidden = !hint;
      let label = spokenNoteName(midi, st.noteNames);
      if (outside) label += ', outside the scale';
      el.setAttribute('aria-label', label);
    }
  }

  focus() {
    this.keys.get(this.focusMidi)?.focus();
  }

  /** Light a key for the Copycat game. Finds the nearest visible key with that pitch. */
  hint(midi, on) {
    const el = this.keys.get(midi) || this._nearestByPitch(midi);
    el?.classList.toggle('is-hint', on);
  }

  clearHints() {
    for (const el of this.keys.values()) el.classList.remove('is-hint');
  }

  resetLights() {
    this.lit.clear();
    for (const el of this.keys.values()) {
      el.classList.remove('is-on', 'is-pressed');
      el.setAttribute('aria-pressed', 'false');
    }
  }

  _nearestByPitch(midi) {
    let best = null;
    let dist = Infinity;
    for (const [m, el] of this.keys) {
      if (pitchClass(m) === pitchClass(midi) && Math.abs(m - midi) < dist) {
        best = el;
        dist = Math.abs(m - midi);
      }
    }
    return best;
  }

  _light(midi, delta) {
    const count = Math.max(0, (this.lit.get(midi) || 0) + delta);
    if (count) this.lit.set(midi, count);
    else this.lit.delete(midi);
    const el = this.keys.get(midi);
    if (!el) return;
    el.classList.toggle('is-on', count > 0);
    el.setAttribute('aria-pressed', String(count > 0));
  }

  _setRoving(midi) {
    const prev = this.keys.get(this.focusMidi);
    if (prev) prev.tabIndex = -1;
    this.focusMidi = midi;
    const next = this.keys.get(midi);
    if (next) next.tabIndex = 0;
  }

  _velocity(e, el) {
    if (e.pointerType === 'pen' && e.pressure > 0) return 0.35 + e.pressure * 0.65;
    const rect = el.getBoundingClientRect();
    const rel = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    // Strike near the front of the key for a louder note, like a real piano action.
    return 0.5 + rel * 0.5;
  }

  _buzz() {
    if (this.getState().haptics) navigator.vibrate?.(8);
  }

  _pointerDown(e) {
    const el = e.target.closest?.('.key');
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    this.root.setPointerCapture?.(e.pointerId);
    const midi = Number(el.dataset.midi);
    this.pointers.set(e.pointerId, midi);
    this.performer.press('pointer', midi, this._velocity(e, el));
    if (e.pointerType !== 'mouse') this._buzz();
  }

  _pointerMove(e) {
    if (!this.pointers.has(e.pointerId) || this.getState().hold) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.key');
    const midi = hit && this.root.contains(hit) ? Number(hit.dataset.midi) : null;
    const prev = this.pointers.get(e.pointerId);
    if (midi === prev) return;
    if (prev != null) this.performer.release('pointer', prev);
    if (midi != null) {
      this.performer.press('pointer', midi, this._velocity(e, hit));
      if (e.pointerType !== 'mouse') this._buzz();
    }
    this.pointers.set(e.pointerId, midi);
  }

  _pointerUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const midi = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (midi != null) this.performer.release('pointer', midi);
  }

  _move(to) {
    const idx = this.order.indexOf(this.focusMidi);
    const target = this.order[Math.max(0, Math.min(this.order.length - 1, to(idx)))];
    if (target == null || target === this.focusMidi) return;
    // Holding Space while moving glides the note along with the focus.
    if (this.focusHeld != null) {
      this.performer.release('focus', this.focusHeld);
      this.performer.press('focus', target, 0.8);
      this.focusHeld = target;
    }
    this._setRoving(target);
    this.keys.get(target).focus();
  }

  _keyDown(e) {
    const el = e.target.closest?.('.key');
    if (!el) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        this._move((i) => i + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        this._move((i) => i - 1);
        break;
      case 'Home':
        this._move(() => 0);
        break;
      case 'End':
        this._move(() => this.order.length - 1);
        break;
      case ' ':
      case 'Enter':
        if (!e.repeat && this.focusHeld == null) {
          this.focusHeld = Number(el.dataset.midi);
          this.performer.press('focus', this.focusHeld, 0.8);
        }
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  _keyUp(e) {
    if ((e.key === ' ' || e.key === 'Enter') && this.focusHeld != null) {
      e.preventDefault();
      this.performer.release('focus', this.focusHeld);
      this.focusHeld = null;
    }
  }
}
