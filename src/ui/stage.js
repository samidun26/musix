// The screen: oscilloscope / spectrum, floating note bubbles, and Musi the
// mascot, who sings along with whatever you play.

import { noteLabel, pitchClass } from '../music/theory.js';
import { prefersReducedMotion } from './dom.js';

const TIPS = [
  'Try “Surprise me” for a brand-new sound.',
  'Drag a knob up or down. Double-click puts it back. Hover one and I’ll explain it!',
  'Set Scale lock to Major pentatonic and every key sounds good!',
  'Chord buddy turns one finger into a whole chord.',
  'Turn on Hold, pick an Arpeggio, and let the notes dance.',
  'Plant some beats in the Beat garden below.',
  'Type your name in Word melody to hear how it sounds.',
  'Think you can beat me at Copycat?',
  'Drag across the keys to glide from note to note.',
];

export class Stage {
  constructor({ engine, performer, getNames, els }) {
    this.engine = engine;
    this.getNames = getNames;
    this.els = els;
    this.canvas = els.canvas;
    this.ctx2d = this.canvas.getContext('2d');
    this.bubbles = [];
    this.mode = 'wave';
    this.level = 0;
    this.lastColor = null;
    this.colors = [];
    this.visible = true;
    this.tipIndex = -1;
    this.playedOnce = false;
    this.lastNoteAt = 0;
    this.buffer = null;

    this._readColors();
    new ResizeObserver(() => this._resize()).observe(this.canvas);
    new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
    }).observe(this.canvas);

    performer.addEventListener('noteon', (e) => this._onNote(e.detail.midi, e.detail.velocity ?? 0.8));
    setInterval(() => this._idleTip(), 14000);
    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
  }

  /** Canvas can't read CSS variables, so copy the note colours once per theme change. */
  _readColors() {
    const cs = getComputedStyle(document.documentElement);
    this.colors = Array.from({ length: 12 }, (_, i) => cs.getPropertyValue(`--n${i}`).trim() || '#ffc93c');
    this.inkSoft = cs.getPropertyValue('--screen-soft').trim() || '#aaa4d8';
    this.accent = cs.getPropertyValue('--accent').trim() || '#ffc93c';
  }

  themeChanged() {
    this._readColors();
  }

  setMode(mode) {
    this.mode = mode;
  }

  /** Change what Musi says. `hold` keeps the tip up for a while before idle tips resume. */
  setTip(text, { hold = 0 } = {}) {
    this.els.tip.textContent = text;
    this.holdUntil = performance.now() + hold;
  }

  _idleTip() {
    const now = performance.now();
    if (now - this.lastNoteAt < 6000 || now < (this.holdUntil || 0)) return;
    this.tipIndex = (this.tipIndex + 1) % TIPS.length;
    this.setTip(TIPS[this.tipIndex]);
  }

  /** Pulse the screen border on the beat — rhythm you can see. */
  flash() {
    const screen = this.els.screen;
    screen.classList.add('is-beat');
    setTimeout(() => screen.classList.remove('is-beat'), 110);
  }

  _onNote(midi, velocity) {
    this.lastNoteAt = performance.now();
    if (!this.playedOnce) {
      this.playedOnce = true;
      this.setTip('Lovely! Turn the knobs while you play to shape the sound.');
    }
    const pc = pitchClass(midi);
    this.lastColor = this.colors[pc];
    this.els.mascot.style.setProperty('--mascot', `var(--n${pc})`);
    if (prefersReducedMotion() || !this.visible) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const x = 0.25 * w + ((Math.min(96, Math.max(36, midi)) - 36) / 60) * 0.7 * w;
    this.bubbles.push({
      x,
      y: h * 0.85,
      vy: -(0.6 + velocity * 0.9),
      r: 12 + velocity * 10,
      color: this.colors[pc],
      label: noteLabel(midi, this.getNames(), false),
      life: 1,
    });
    if (this.bubbles.length > 40) this.bubbles.shift();
  }

  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _frame() {
    requestAnimationFrame(this._frame);
    if (!this.visible) return;
    const g = this.ctx2d;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    g.clearRect(0, 0, w, h);

    const analyser = this.engine.nodes?.analyser;
    let rms = 0;
    if (analyser) {
      if (!this.buffer || this.buffer.length !== analyser.fftSize) {
        this.buffer = new Float32Array(analyser.fftSize);
        this.freq = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getFloatTimeDomainData(this.buffer);
      for (let i = 0; i < this.buffer.length; i += 4) rms += this.buffer[i] * this.buffer[i];
      rms = Math.sqrt(rms / (this.buffer.length / 4));
      if (this.mode === 'bars') this._drawBars(g, analyser, w, h);
      else this._drawWave(g, w, h);
    } else {
      this._drawIdle(g, w, h);
    }

    this._drawBubbles(g);

    // Musi bops along with the music.
    this.level += (Math.min(1, rms * 4) - this.level) * 0.35;
    const calm = prefersReducedMotion();
    const mouth = this.els.mouth;
    mouth.setAttribute('ry', String(3 + this.level * 13));
    mouth.setAttribute('rx', String(9 + this.level * 3));
    this.els.mascot.style.transform = calm
      ? ''
      : `translateY(${(-this.level * 10).toFixed(1)}px) scale(${(1 + this.level * 0.08).toFixed(3)}, ${(1 - this.level * 0.03).toFixed(3)})`;
  }

  _drawIdle(g, w, h) {
    g.strokeStyle = this.inkSoft;
    g.globalAlpha = 0.5;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w * 0.28, h * 0.55);
    g.lineTo(w - 12, h * 0.55);
    g.stroke();
    g.globalAlpha = 1;
  }

  _drawWave(g, w, h) {
    const data = this.buffer;
    const left = w * 0.24;
    const span = w - left - 12;
    const mid = h * 0.55;
    const amp = h * 0.38;
    // Find a rising zero crossing so the waveform holds still instead of jittering.
    let start = 0;
    for (let i = 1; i < data.length / 2; i++) {
      if (data[i - 1] < 0 && data[i] >= 0) {
        start = i;
        break;
      }
    }
    const count = Math.min(data.length - start, 900);
    const color = this.lastColor || this.accent;
    for (const [width, alpha] of [[9, 0.18], [3, 1]]) {
      g.beginPath();
      for (let i = 0; i < count; i++) {
        const x = left + (i / (count - 1)) * span;
        const y = mid - Math.max(-1, Math.min(1, data[start + i] * 2.2)) * amp;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.lineWidth = width;
      g.lineJoin = 'round';
      g.strokeStyle = color;
      g.globalAlpha = alpha;
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  _drawBars(g, analyser, w, h) {
    analyser.getByteFrequencyData(this.freq);
    const bars = 40;
    const left = w * 0.24;
    const span = w - left - 12;
    const bw = span / bars;
    const bins = this.freq.length;
    for (let b = 0; b < bars; b++) {
      // Log-spaced bins so bass and treble get fair room.
      const lo = Math.floor(2 ** ((b / bars) * Math.log2(bins / 2)));
      const hi = Math.max(lo + 1, Math.floor(2 ** (((b + 1) / bars) * Math.log2(bins / 2))));
      let peak = 0;
      for (let i = lo; i < hi; i++) peak = Math.max(peak, this.freq[i]);
      const bh = (peak / 255) * h * 0.8;
      g.fillStyle = this.colors[b % 12];
      g.globalAlpha = 0.9;
      const x = left + b * bw + 1.5;
      const y = h - 10 - bh;
      const bwInner = Math.max(2, bw - 3);
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, bwInner, Math.max(2, bh), 3);
      else g.rect(x, y, bwInner, Math.max(2, bh));
      g.fill();
    }
    g.globalAlpha = 1;
  }

  _drawBubbles(g) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const b of this.bubbles) {
      b.y += b.vy;
      b.life -= 0.012;
      g.globalAlpha = Math.max(0, b.life);
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      g.fillStyle = b.color;
      g.fill();
      g.lineWidth = 2.5;
      g.strokeStyle = '#1d1b36';
      g.stroke();
      g.fillStyle = '#1d1b36';
      g.font = `600 ${Math.round(b.r * 0.8)}px Fredoka, ui-rounded, system-ui, sans-serif`;
      g.fillText(b.label, b.x, b.y + 1);
    }
    g.globalAlpha = 1;
    this.bubbles = this.bubbles.filter((b) => b.life > 0);
  }
}
