// Turn any text into a melody that fits the chosen scale.
// Latin letters map to scale degrees, vowels sing longer, spaces and
// punctuation become rests, and every other character (other scripts,
// emoji, digits) is hashed from its code point so nothing is silent.

import { stepInScale, snapToScale } from './theory.js';

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
const LONG_RESTS = new Set(['.', '!', '?', ';', ':', '\n']);
const SHORT_RESTS = new Set([' ', ',', '-', '–', '—', '\t']);
const SPAN_DEGREES = 10; // roughly two octaves of a pentatonic scale

/**
 * @param {string} text
 * @param {{root?: number, scaleId?: string, resolve?: boolean, maxNotes?: number}} opts
 * @returns {{char: string, midi: number|null, beats: number, accent: boolean}[]}
 */
export function textToMelody(text, opts = {}) {
  const { root = 60, scaleId = 'majorPentatonic', resolve = true, maxNotes = 64 } = opts;
  const home = snapToScale(root, root, scaleId);
  const out = [];
  let played = 0;

  for (const char of Array.from(String(text ?? ''))) {
    if (played >= maxNotes) break;
    const lower = char.toLowerCase();

    if (LONG_RESTS.has(char)) {
      pushRest(out, char, 1);
      continue;
    }
    if (SHORT_RESTS.has(char)) {
      pushRest(out, char, 0.5);
      continue;
    }

    let degree;
    if (lower >= 'a' && lower <= 'z') {
      degree = (lower.charCodeAt(0) - 97) % SPAN_DEGREES;
    } else if (char >= '0' && char <= '9') {
      degree = Number(char) % SPAN_DEGREES;
    } else {
      const cp = char.codePointAt(0) ?? 0;
      degree = (cp * 7 + 3) % SPAN_DEGREES;
    }

    const vowel = VOWELS.has(lower);
    const upper = char !== lower;
    out.push({
      char,
      midi: stepInScale(home, degree, root, scaleId),
      beats: vowel ? 1 : 0.5,
      accent: upper || vowel,
    });
    played++;
  }

  // Trim trailing rests, then land back on the home note so the tune feels finished.
  while (out.length && out[out.length - 1].midi === null) out.pop();
  if (resolve && played > 0) {
    out.push({ char: '♪', midi: home, beats: 1.5, accent: true });
  }
  return out;
}

function pushRest(out, char, beats) {
  const prev = out[out.length - 1];
  // Merge consecutive rests so "...  " doesn't stall the tune.
  if (prev && prev.midi === null) {
    prev.beats = Math.min(2, prev.beats + beats / 2);
    return;
  }
  if (!out.length) return; // no leading silence
  out.push({ char, midi: null, beats, accent: false });
}

/** Total length in beats, handy for progress UI. */
export function melodyLength(melody) {
  return melody.reduce((sum, n) => sum + n.beats, 0);
}
