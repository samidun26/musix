// Built-in sounds. Each one is a starting point, not a finished product:
// tweak the knobs and save your own version.

import { sanitizePatch } from './patch.js';

const RAW = [
  {
    id: 'hello', name: 'Hello Synth', emoji: '🎹', wave: 'sawtooth',
    cutoff: 2800, resonance: 1.5, filterEnv: 0.35, detune: 8,
    attack: 0.008, decay: 0.35, sustain: 0.6, release: 0.45,
    vibrato: 0, crunch: 0, echo: 0.18, space: 0.25, sub: 0, octave: 0,
  },
  {
    id: 'bubble', name: 'Bubble Pop', emoji: '🫧', wave: 'sine',
    cutoff: 6000, resonance: 1, filterEnv: 0.2, detune: 0,
    attack: 0.003, decay: 0.18, sustain: 0, release: 0.25,
    vibrato: 0, crunch: 0, echo: 0.32, space: 0.25, sub: 0, octave: 0,
  },
  {
    id: 'cosmic', name: 'Cosmic Pad', emoji: '🌌', wave: 'sawtooth',
    cutoff: 1800, resonance: 2, filterEnv: 0.15, detune: 18,
    attack: 0.9, decay: 0.8, sustain: 0.8, release: 2.4,
    vibrato: 0.15, crunch: 0, echo: 0.25, space: 0.7, sub: 0, octave: 0,
  },
  {
    id: 'arcade', name: 'Retro Arcade', emoji: '👾', wave: 'square',
    cutoff: 9000, resonance: 0.7, filterEnv: 0, detune: 0,
    attack: 0.002, decay: 0.1, sustain: 0.55, release: 0.08,
    vibrato: 0, crunch: 0, echo: 0.12, space: 0.08, sub: 0, octave: 0,
  },
  {
    id: 'bells', name: 'Sleepy Bells', emoji: '🔔', wave: 'triangle',
    cutoff: 7000, resonance: 1, filterEnv: 0.5, detune: 4,
    attack: 0.002, decay: 0.9, sustain: 0, release: 1.8,
    vibrato: 0, crunch: 0, echo: 0.3, space: 0.5, sub: 0, octave: 1,
  },
  {
    id: 'robot', name: 'Robot Bass', emoji: '🤖', wave: 'sawtooth',
    cutoff: 600, resonance: 9, filterEnv: 0.65, detune: 6,
    attack: 0.003, decay: 0.25, sustain: 0.4, release: 0.15,
    vibrato: 0, crunch: 0.35, echo: 0, space: 0.05, sub: 0.55, octave: -1,
  },
  {
    id: 'strings', name: 'Velvet Strings', emoji: '🎻', wave: 'sawtooth',
    cutoff: 3200, resonance: 0.8, filterEnv: 0.1, detune: 14,
    attack: 0.35, decay: 0.6, sustain: 0.8, release: 1,
    vibrato: 0.35, crunch: 0, echo: 0.1, space: 0.45, sub: 0, octave: 0,
  },
  {
    id: 'bee', name: 'Buzzy Bee', emoji: '🐝', wave: 'square',
    cutoff: 2400, resonance: 6, filterEnv: 0.3, detune: 10,
    attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.2,
    vibrato: 0.5, crunch: 0.25, echo: 0.15, space: 0.15, sub: 0, octave: 0,
  },
];

export const PRESETS = RAW.map((p) => ({ id: p.id, patch: sanitizePatch({ ...p, volume: 0.75 }) }));

export function findPreset(id) {
  return PRESETS.find((p) => p.id === id) || null;
}
