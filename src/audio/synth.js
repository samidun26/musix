// Polyphonic subtractive synth: two detuned oscillators + optional sub,
// a resonant low-pass filter with its own envelope, an amp envelope,
// and a vibrato LFO that fades in while a note is held.

import { midiToFreq } from '../music/theory.js';
import { defaultPatch } from '../state/patch.js';

const MAX_VOICES = 32;
const PEAK = 0.26; // headroom so chords don't slam the limiter
const WAVE_GAIN = { sine: 1, triangle: 0.9, square: 0.42, sawtooth: 0.5 };
const VIBRATO_CENTS = 45;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

class Voice {
  constructor(engine, patch, midi, velocity, when) {
    const ctx = engine.ctx;
    const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
    this.ctx = ctx;
    this.midi = midi;
    this.start = t;
    this.releasing = false;
    this.onended = null;
    this.env = {
      attack: patch.attack,
      decay: patch.decay,
      sustain: patch.sustain,
      peak: PEAK * (0.3 + 0.7 * clamp(velocity, 0, 1) ** 1.4),
      release: patch.release,
    };

    const freq = midiToFreq(midi);
    const osc1 = new OscillatorNode(ctx, { type: patch.wave, frequency: freq, detune: -patch.detune / 2 });
    const osc2 = new OscillatorNode(ctx, { type: patch.wave, frequency: freq, detune: patch.detune / 2 });
    const mix = new GainNode(ctx, { gain: WAVE_GAIN[patch.wave] * 0.5 });
    osc1.connect(mix);
    osc2.connect(mix);

    let sub = null;
    if (patch.sub > 0.01) {
      sub = new OscillatorNode(ctx, { type: 'sine', frequency: freq / 2 });
      const subGain = new GainNode(ctx, { gain: patch.sub * 0.55 });
      sub.connect(subGain).connect(mix);
    }

    const lfo = new OscillatorNode(ctx, { type: 'sine', frequency: 5.6 });
    const lfoDepth = new GainNode(ctx, { gain: 0 });
    lfo.connect(lfoDepth);
    lfoDepth.connect(osc1.detune);
    lfoDepth.connect(osc2.detune);
    if (sub) lfoDepth.connect(sub.detune);
    lfoDepth.gain.setValueAtTime(0, t);
    lfoDepth.gain.linearRampToValueAtTime(patch.vibrato * VIBRATO_CENTS, t + 0.45);

    const filter = new BiquadFilterNode(ctx, { type: 'lowpass', Q: patch.resonance });
    const base = this._trackedCutoff(patch.cutoff);
    if (patch.filterEnv > 0.001) {
      const peakCut = clamp(base * (1 + patch.filterEnv * 8), 40, 18000);
      filter.frequency.setValueAtTime(peakCut, t);
      filter.frequency.setTargetAtTime(base, t + 0.002, 0.03 + patch.decay * 0.35);
    } else {
      filter.frequency.setValueAtTime(base, t);
    }

    const amp = new GainNode(ctx, { gain: 0 });
    const { attack, decay, sustain, peak } = this.env;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + attack);
    amp.gain.setTargetAtTime(peak * sustain, t + attack, Math.max(0.005, decay / 3));

    // Spread notes gently across the stereo field, like sitting at a piano.
    const pan = new StereoPannerNode(ctx, { pan: clamp((midi - 64) / 40, -0.4, 0.4) });

    mix.connect(filter).connect(amp).connect(pan).connect(engine.nodes.synthIn);

    for (const o of [osc1, osc2, sub, lfo]) o?.start(t);
    osc1.onended = () => this._cleanup();

    this.nodes = { osc1, osc2, sub, lfo, lfoDepth, filter, amp, pan, mix };
  }

  _trackedCutoff(cutoff) {
    // Light key tracking keeps high notes from sounding duller than low ones.
    return clamp(cutoff * 2 ** (((this.midi - 60) / 12) * 0.35), 40, 18000);
  }

  /** Amp envelope value at time t, computed so releases work in every browser. */
  _envAt(t) {
    const { attack, decay, sustain, peak } = this.env;
    const dt = t - this.start;
    if (dt <= 0) return 0;
    if (dt < attack) return (peak * dt) / attack;
    const s = peak * sustain;
    return s + (peak - s) * Math.exp(-(dt - attack) / Math.max(0.005, decay / 3));
  }

  release(when, fast = false) {
    if (this.releasing) return;
    this.releasing = true;
    const now = this.ctx.currentTime;
    const t = Math.max(when ?? now, now);
    const tau = fast ? 0.012 : Math.max(0.008, this.env.release / 4.5);
    const g = this.nodes.amp.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(this._envAt(t), t);
    g.setTargetAtTime(0, t, tau);
    const stopAt = t + tau * 6 + 0.02;
    for (const o of [this.nodes.osc1, this.nodes.osc2, this.nodes.sub, this.nodes.lfo]) {
      try {
        o?.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
  }

  update(patch) {
    const t = this.ctx.currentTime;
    const { filter, osc1, osc2, lfoDepth } = this.nodes;
    filter.frequency.cancelScheduledValues(t);
    filter.frequency.setTargetAtTime(this._trackedCutoff(patch.cutoff), t, 0.03);
    filter.Q.setTargetAtTime(patch.resonance, t, 0.03);
    osc1.detune.setTargetAtTime(-patch.detune / 2, t, 0.03);
    osc2.detune.setTargetAtTime(patch.detune / 2, t, 0.03);
    if (t > this.start + 0.45) lfoDepth.gain.setTargetAtTime(patch.vibrato * VIBRATO_CENTS, t, 0.05);
  }

  _cleanup() {
    for (const node of Object.values(this.nodes)) {
      try {
        node?.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.onended?.();
  }
}

export class Synth {
  constructor(engine) {
    this.engine = engine;
    this.patch = defaultPatch();
    this.held = new Map(); // midi -> Voice (notes under a finger)
    this.voices = new Set(); // every voice still making sound
  }

  setPatch(patch) {
    this.patch = patch;
    this.engine.setFx({ crunch: patch.crunch, echo: patch.echo, space: patch.space, volume: patch.volume });
    if (!this.engine.ctx) return;
    for (const v of this.held.values()) v.update(patch);
  }

  _spawn(midi, velocity, when) {
    this.engine.ensure();
    const live = [...this.voices].filter((v) => !v.releasing);
    if (live.length >= MAX_VOICES) {
      live.sort((a, b) => a.start - b.start)[0].release(undefined, true);
    }
    const v = new Voice(this.engine, this.patch, midi, velocity, when);
    v.onended = () => this.voices.delete(v);
    this.voices.add(v);
    return v;
  }

  noteOn(midi, velocity = 0.8, when) {
    const existing = this.held.get(midi);
    if (existing) existing.release(when, true);
    this.held.set(midi, this._spawn(midi, velocity, when));
  }

  noteOff(midi, when) {
    const v = this.held.get(midi);
    if (!v) return;
    this.held.delete(midi);
    v.release(when);
  }

  /** Fire-and-forget note with a known length (arpeggiator, games, melodies). */
  playNote(midi, velocity, when, duration) {
    const v = this._spawn(midi, velocity, when);
    v.release(v.start + duration);
  }

  allOff() {
    for (const v of this.voices) v.release(undefined, true);
    this.held.clear();
  }
}
