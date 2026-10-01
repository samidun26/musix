// Magic pad: an XY surface. "Play" mode is a theremin that always stays in
// your scale; "Shape" mode morphs brightness and space together.

import { scaleNotesInRange, spokenNoteName, noteLabel, pitchClass } from '../music/theory.js';
import { PARAMS, toNorm, fromNorm } from '../state/params.js';
import { announce, prefersReducedMotion } from './dom.js';

export class MagicPad {
  constructor({ root, performer, getPlay, getPatch, setParams, getNames }) {
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.puck = root.querySelector('.xy__puck');
    this.axisX = root.querySelector('.xy__axis--x');
    this.axisY = root.querySelector('.xy__axis--y');
    this.g = this.canvas.getContext('2d');
    this.performer = performer;
    this.getPlay = getPlay;
    this.getPatch = getPatch;
    this.setParams = setParams;
    this.getNames = getNames;
    this.mode = 'play';
    this.x = 0.5;
    this.y = 0.5;
    this.pointer = null;
    this.current = null; // midi currently sounding from the pad
    this.trail = [];
    this.keyHeld = false;

    root.addEventListener('pointerdown', (e) => this._down(e));
    root.addEventListener('pointermove', (e) => this._move(e));
    root.addEventListener('pointerup', (e) => this._up(e));
    root.addEventListener('pointercancel', (e) => this._up(e));
    root.addEventListener('keydown', (e) => this._key(e));
    root.addEventListener('keyup', (e) => this._keyUp(e));
    root.addEventListener('blur', () => this._stop());
    new ResizeObserver(() => this._resize()).observe(this.canvas);
    this.visible = true;
    new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
    }).observe(root);
    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
    this.setMode('play');
  }

  setMode(mode) {
    this._stop();
    this.mode = mode;
    this.axisX.textContent = mode === 'play' ? 'Pitch →' : 'Brightness →';
    this.axisY.textContent = mode === 'play' ? '↑ Brightness' : '↑ Space';
    if (mode === 'shape') {
      const p = this.getPatch();
      this.x = toNorm(PARAMS.cutoff, p.cutoff);
      this.y = toNorm(PARAMS.space, p.space);
    }
    this._place();
  }

  /** Scale notes across the pad: two octaves around the current octave. */
  _notes() {
    const play = this.getPlay();
    const scale = play.scaleId === 'chromatic' ? 'majorPentatonic' : play.scaleId;
    const base = 48 + play.octave * 12 + play.root;
    return scaleNotesInRange(play.root, scale, base, base + 24);
  }

  _noteAt(x) {
    const notes = this._notes();
    return notes[Math.min(notes.length - 1, Math.floor(x * notes.length))];
  }

  _place() {
    this.puck.style.setProperty('--x', this.x.toFixed(4));
    this.puck.style.setProperty('--y', this.y.toFixed(4));
    if (this.current != null) this.puck.style.setProperty('--puck', `var(--n${pitchClass(this.current)})`);
    else this.puck.style.removeProperty('--puck');
  }

  _apply(sound) {
    if (this.mode === 'shape') {
      this.setParams({ cutoff: fromNorm(PARAMS.cutoff, this.x), space: fromNorm(PARAMS.space, this.y) });
    } else {
      this.setParams({ cutoff: fromNorm(PARAMS.cutoff, 0.25 + this.y * 0.7) });
      if (sound) {
        const midi = this._noteAt(this.x);
        if (midi !== this.current) {
          if (this.current != null) this.performer.release('pad', this.current, true);
          this.performer.press('pad', midi, 0.85);
          this.current = midi;
        }
      }
    }
    this.trail.push({ x: this.x, y: this.y, life: 1 });
    if (this.trail.length > 60) this.trail.shift();
    this._place();
  }

  _stop() {
    if (this.current != null) this.performer.release('pad', this.current, true);
    this.current = null;
    this.keyHeld = false;
    this.root.classList.remove('is-active');
    this._place();
  }

  _xy(e) {
    const r = this.root.getBoundingClientRect();
    this.x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    this.y = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
  }

  _down(e) {
    if (this.pointer != null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    this.root.focus({ preventScroll: true });
    this.root.setPointerCapture(e.pointerId);
    this.pointer = e.pointerId;
    this.root.classList.add('is-active');
    this._xy(e);
    this._apply(true);
  }

  _move(e) {
    if (e.pointerId !== this.pointer) return;
    this._xy(e);
    this._apply(true);
  }

  _up(e) {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    this._stop();
  }

  _key(e) {
    const notes = this._notes();
    const stepX = this.mode === 'play' ? 1 / notes.length : 0.04;
    const moves = { ArrowLeft: [-stepX, 0], ArrowRight: [stepX, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] };
    if (e.key in moves) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      // Snap to the middle of a note's column so each press lands on a new note.
      this.x = Math.max(0, Math.min(0.999, this.x + dx));
      if (this.mode === 'play') this.x = (Math.floor(this.x * notes.length) + 0.5) / notes.length;
      this.y = Math.max(0, Math.min(1, this.y + dy));
      this._apply(this.keyHeld);
      this._describe();
    } else if ((e.key === ' ' || e.key === 'Enter') && this.mode === 'play') {
      e.preventDefault();
      if (e.repeat || this.keyHeld) return;
      this.keyHeld = true;
      this.root.classList.add('is-active');
      this.current = null;
      this._apply(true);
    }
  }

  _keyUp(e) {
    if ((e.key === ' ' || e.key === 'Enter') && this.keyHeld) {
      e.preventDefault();
      this._stop();
    }
  }

  _describe() {
    if (this.mode === 'play') {
      const midi = this._noteAt(this.x);
      announce(`${spokenNoteName(midi, this.getNames())}, brightness ${Math.round(this.y * 100)} percent`);
    } else {
      announce(`Brightness ${Math.round(this.x * 100)} percent, space ${Math.round(this.y * 100)} percent`);
    }
  }

  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.colors = null;
  }

  themeChanged() {
    this.colors = null;
  }

  _frame() {
    requestAnimationFrame(this._frame);
    const g = this.g;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h || !this.visible) return;
    if (!this.colors) {
      const cs = getComputedStyle(document.documentElement);
      this.colors = Array.from({ length: 12 }, (_, i) => cs.getPropertyValue(`--n${i}`).trim());
      this.lineColor = cs.getPropertyValue('--screen-line').trim() || '#3a3670';
      this.labelColor = cs.getPropertyValue('--screen-soft').trim() || '#aaa4d8';
    }
    g.clearRect(0, 0, w, h);

    if (this.mode === 'play') {
      const notes = this._notes();
      const cw = w / notes.length;
      g.font = '600 11px Fredoka, ui-rounded, system-ui, sans-serif';
      g.textAlign = 'center';
      notes.forEach((m, i) => {
        const on = m === this.current;
        g.globalAlpha = on ? 0.55 : 0.14;
        g.fillStyle = this.colors[pitchClass(m)];
        g.fillRect(i * cw + 1, 0, cw - 2, h);
        g.globalAlpha = 0.9;
        g.fillStyle = this.labelColor;
        if (cw > 16) g.fillText(noteLabel(m, this.getNames(), false), i * cw + cw / 2, h - 36);
      });
      g.globalAlpha = 1;
    } else {
      g.strokeStyle = this.lineColor;
      g.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        g.beginPath();
        g.moveTo((i / 8) * w, 0);
        g.lineTo((i / 8) * w, h);
        g.moveTo(0, (i / 8) * h);
        g.lineTo(w, (i / 8) * h);
        g.stroke();
      }
    }

    if (!prefersReducedMotion()) {
      for (const p of this.trail) {
        p.life -= 0.03;
        if (p.life <= 0) continue;
        g.globalAlpha = p.life * 0.5;
        g.fillStyle = this.current != null ? this.colors[pitchClass(this.current)] : '#ffc93c';
        g.beginPath();
        g.arc(p.x * w, (1 - p.y) * h, 6 + p.life * 8, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    this.trail = this.trail.filter((p) => p.life > 0);
  }
}
