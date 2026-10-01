// A "patch" is one complete sound. Everything that loads a patch from
// outside (presets, share codes, storage) goes through sanitizePatch.

import { PARAMS, PARAM_KEYS, fromNorm } from './params.js';
import { randomName, randomEmoji } from '../music/names.js';

export const WAVES = [
  { id: 'sine', label: 'Smooth', tech: 'Sine wave' },
  { id: 'triangle', label: 'Mellow', tech: 'Triangle wave' },
  { id: 'square', label: 'Retro', tech: 'Square wave' },
  { id: 'sawtooth', label: 'Bold', tech: 'Sawtooth wave' },
];
const WAVE_IDS = WAVES.map((w) => w.id);

const EXTRA = {
  decay: { min: 0.02, max: 3, default: 0.35 },
  sub: { min: 0, max: 1, default: 0 },
  octave: { min: -2, max: 2, default: 0 },
};

export function defaultPatch() {
  const p = { name: 'Hello Synth', emoji: '🎹', wave: 'sawtooth' };
  for (const key of PARAM_KEYS) p[key] = PARAMS[key].default;
  for (const [key, spec] of Object.entries(EXTRA)) p[key] = spec.default;
  return p;
}

function clampNum(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cleanText(value, fallback, max) {
  if (typeof value !== 'string') return fallback;
  // Strip control characters; the name is only ever rendered as text, never HTML.
  const t = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  return t || fallback;
}

export function sanitizePatch(input) {
  const base = defaultPatch();
  if (!input || typeof input !== 'object') return base;
  const out = { ...base };
  out.name = cleanText(input.name, base.name, 40);
  out.emoji = cleanText(input.emoji, base.emoji, 8);
  out.wave = WAVE_IDS.includes(input.wave) ? input.wave : base.wave;
  for (const key of PARAM_KEYS) {
    const spec = PARAMS[key];
    out[key] = clampNum(input[key], spec.min, spec.max, spec.default);
  }
  for (const [key, spec] of Object.entries(EXTRA)) {
    out[key] = clampNum(input[key], spec.min, spec.max, spec.default);
  }
  out.octave = Math.round(out.octave);
  return out;
}

/**
 * A random sound that is still pleasant: brightness stays in a musical
 * range, most sounds stay clean, and volume never jumps.
 */
export function randomPatch(rng = Math.random, current = defaultPatch()) {
  const chance = (p) => rng() < p;
  const between = (a, b) => a + rng() * (b - a);
  const wave = WAVE_IDS[Math.floor(rng() * WAVE_IDS.length)];
  const pad = chance(0.3);
  return sanitizePatch({
    name: randomName(rng),
    emoji: randomEmoji(rng),
    wave,
    cutoff: fromNorm(PARAMS.cutoff, between(0.45, 0.9)),
    resonance: chance(0.25) ? between(4, 12) : between(0.5, 2.5),
    filterEnv: chance(0.6) ? between(0.2, 0.8) : 0,
    detune: chance(0.6) ? between(4, 22) : between(0, 4),
    attack: pad ? between(0.25, 1.4) : between(0.003, 0.03),
    decay: between(0.12, 0.9),
    sustain: pad ? between(0.6, 0.9) : between(0.2, 0.8),
    release: pad ? between(0.9, 2.8) : between(0.12, 0.9),
    vibrato: chance(0.3) ? between(0.15, 0.55) : 0,
    crunch: chance(0.25) ? between(0.1, 0.45) : 0,
    echo: chance(0.6) ? between(0.1, 0.45) : 0,
    space: between(0.1, 0.55),
    sub: wave === 'sine' ? 0 : chance(0.35) ? between(0.2, 0.6) : 0,
    volume: current.volume ?? PARAMS.volume.default,
    octave: current.octave ?? 0,
  });
}

/** True when two patches sound the same (ignores name/emoji). */
export function samePatchSound(a, b) {
  if (a.wave !== b.wave) return false;
  const keys = [...PARAM_KEYS, ...Object.keys(EXTRA)];
  return keys.every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 1e-6);
}
