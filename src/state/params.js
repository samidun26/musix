// Every sound control, described once. Friendly label first, the real
// synth term second, so people learn the vocabulary as they play.

export const PARAM_GROUPS = [
  { id: 'tone', label: 'Tone', keys: ['cutoff', 'resonance', 'filterEnv', 'detune'] },
  { id: 'shape', label: 'Shape', keys: ['attack', 'sustain', 'release', 'vibrato'] },
  { id: 'fx', label: 'Effects', keys: ['crunch', 'echo', 'space', 'volume'] },
];

export const PARAMS = {
  cutoff: {
    label: 'Brightness', tech: 'Filter cutoff', min: 80, max: 16000, default: 4200, curve: 'log', unit: 'hz',
    hint: 'A low-pass filter. Turn it down for a muffled, underwater sound; up for sparkle.',
  },
  resonance: {
    label: 'Squelch', tech: 'Filter resonance', min: 0.2, max: 18, default: 1.2, curve: 'log', unit: 'q',
    hint: 'Boosts the sound right at the filter edge. High values sound squelchy and vocal.',
  },
  filterEnv: {
    label: 'Pluck', tech: 'Filter envelope', min: 0, max: 1, default: 0.3, curve: 'linear', unit: 'pct',
    hint: 'Each note starts brighter and quickly mellows, like plucking a string.',
  },
  detune: {
    label: 'Thickness', tech: 'Oscillator detune', min: 0, max: 40, default: 8, curve: 'linear', unit: 'cents',
    hint: 'Two oscillators drift slightly apart, making the sound wider and richer.',
  },
  attack: {
    label: 'Fade in', tech: 'Attack', min: 0.002, max: 3, default: 0.01, curve: 'log', unit: 's',
    hint: 'How long a note takes to reach full volume. Long fades make soft pads.',
  },
  sustain: {
    label: 'Hold', tech: 'Sustain level', min: 0, max: 1, default: 0.7, curve: 'linear', unit: 'pct',
    hint: 'How loud a note stays while you keep holding the key.',
  },
  release: {
    label: 'Tail', tech: 'Release', min: 0.02, max: 5, default: 0.45, curve: 'log', unit: 's',
    hint: 'How long a note rings out after you let go.',
  },
  vibrato: {
    label: 'Wobble', tech: 'Vibrato', min: 0, max: 1, default: 0, curve: 'linear', unit: 'pct',
    hint: 'A gentle pitch wobble that fades in while a note is held, like a singer.',
  },
  crunch: {
    label: 'Crunch', tech: 'Distortion', min: 0, max: 1, default: 0, curve: 'linear', unit: 'pct',
    hint: 'Overdrives the sound for a gritty, fuzzy edge.',
  },
  echo: {
    label: 'Echo', tech: 'Tempo-synced delay', min: 0, max: 1, default: 0.18, curve: 'linear', unit: 'pct',
    hint: 'Repeats each note in time with the beat.',
  },
  space: {
    label: 'Space', tech: 'Reverb', min: 0, max: 1, default: 0.25, curve: 'linear', unit: 'pct',
    hint: 'Places the sound in a room. Turn it up for a big cathedral.',
  },
  volume: {
    label: 'Volume', tech: 'Synth level', min: 0, max: 1, default: 0.75, curve: 'linear', unit: 'pct',
    hint: 'Loudness of the keyboard sound. The beat has its own level.',
  },
};

export const PARAM_KEYS = Object.keys(PARAMS);

const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** Value → knob position (0–1). */
export function toNorm(spec, value) {
  const v = Math.max(spec.min, Math.min(spec.max, value));
  if (spec.curve === 'log') return clamp01(Math.log(v / spec.min) / Math.log(spec.max / spec.min));
  return clamp01((v - spec.min) / (spec.max - spec.min));
}

/** Knob position (0–1) → value. */
export function fromNorm(spec, t) {
  const n = clamp01(t);
  if (spec.curve === 'log') return spec.min * (spec.max / spec.min) ** n;
  return spec.min + n * (spec.max - spec.min);
}

function trimNumber(n, digits) {
  return Number(n.toFixed(digits)).toString();
}

/** Short visible text, e.g. "1.2 kHz", "350 ms", "45%". */
export function formatValue(spec, value) {
  switch (spec.unit) {
    case 'hz':
      return value >= 1000 ? `${trimNumber(value / 1000, 1)} kHz` : `${Math.round(value)} Hz`;
    case 's':
      return value < 1 ? `${Math.round(value * 1000)} ms` : `${trimNumber(value, 2)} s`;
    case 'cents':
      return `${Math.round(value)} ct`;
    case 'q':
      return trimNumber(value, 1);
    default:
      return `${Math.round(value * 100)}%`;
  }
}

/** Text for aria-valuetext, spelled out for screen readers. */
export function spokenValue(spec, value) {
  switch (spec.unit) {
    case 'hz':
      return value >= 1000 ? `${trimNumber(value / 1000, 1)} kilohertz` : `${Math.round(value)} hertz`;
    case 's':
      return value < 1 ? `${Math.round(value * 1000)} milliseconds` : `${trimNumber(value, 2)} seconds`;
    case 'cents':
      return `${Math.round(value)} cents`;
    case 'q':
      return `${trimNumber(value, 1)}`;
    default:
      return `${Math.round(value * 100)} percent`;
  }
}
