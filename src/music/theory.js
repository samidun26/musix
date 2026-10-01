// Pure music-theory helpers. No DOM, no audio — safe to unit test in Node.

export const LETTER_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
// Fixed-do solfège, as taught in Indonesia and much of Europe and Latin America.
export const SOLFEGE_NAMES = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
const SPOKEN_LETTERS = ['C', 'C sharp', 'D', 'D sharp', 'E', 'F', 'F sharp', 'G', 'G sharp', 'A', 'A sharp', 'B'];
const SPOKEN_SOLFEGE = ['Do', 'Do sharp', 'Re', 'Re sharp', 'Mi', 'Fa', 'Fa sharp', 'Sol', 'Sol sharp', 'La', 'La sharp', 'Si'];

export const MIDI_MIN = 0;
export const MIDI_MAX = 127;

export const SCALES = {
  chromatic: { name: 'Every note', mood: 'No lock', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  majorPentatonic: { name: 'Major pentatonic', mood: 'Easy', intervals: [0, 2, 4, 7, 9] },
  minorPentatonic: { name: 'Minor pentatonic', mood: 'Bluesy', intervals: [0, 3, 5, 7, 10] },
  major: { name: 'Major', mood: 'Happy', intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Natural minor', mood: 'Moody', intervals: [0, 2, 3, 5, 7, 8, 10] },
  blues: { name: 'Blues', mood: 'Gritty', intervals: [0, 3, 5, 6, 7, 10] },
  dorian: { name: 'Dorian', mood: 'Jazzy', intervals: [0, 2, 3, 5, 7, 9, 10] },
  lydian: { name: 'Lydian', mood: 'Dreamy', intervals: [0, 2, 4, 6, 7, 9, 11] },
  hirajoshi: { name: 'Hirajōshi', mood: 'Misty', intervals: [0, 2, 3, 7, 8] },
  wholeTone: { name: 'Whole tone', mood: 'Floaty', intervals: [0, 2, 4, 6, 8, 10] },
};

export const CHORD_TYPES = {
  off: { name: 'Off' },
  triad: { name: 'Triads' },
  seventh: { name: 'Sevenths' },
  power: { name: 'Power chords' },
  sus: { name: 'Suspended' },
};

const FIXED_CHORDS = {
  triad: [0, 4, 7],
  seventh: [0, 4, 7, 11],
  power: [0, 7, 12],
  sus: [0, 5, 7],
};

// Scale-degree offsets used when a scale lock is active (stacked "thirds" in the scale).
const DIATONIC_DEGREES = {
  triad: [0, 2, 4],
  seventh: [0, 2, 4, 6],
};

export function clampMidi(m) {
  return Math.max(MIDI_MIN, Math.min(MIDI_MAX, Math.round(m)));
}

export function midiToFreq(m, a4 = 440) {
  return a4 * 2 ** ((m - 69) / 12);
}

export function pitchClass(m) {
  return ((Math.round(m) % 12) + 12) % 12;
}

export function octaveOf(m) {
  return Math.floor(Math.round(m) / 12) - 1;
}

export function isBlackKey(m) {
  return [1, 3, 6, 8, 10].includes(pitchClass(m));
}

/** Visible note label, e.g. "C♯4" or "Do♯4". */
export function noteLabel(m, system = 'letters', withOctave = true) {
  const names = system === 'solfege' ? SOLFEGE_NAMES : LETTER_NAMES;
  const base = names[pitchClass(m)];
  return withOctave ? `${base}${octaveOf(m)}` : base;
}

/** Screen-reader friendly name, e.g. "C sharp 4". */
export function spokenNoteName(m, system = 'letters', withOctave = true) {
  const names = system === 'solfege' ? SPOKEN_SOLFEGE : SPOKEN_LETTERS;
  const base = names[pitchClass(m)];
  return withOctave ? `${base} ${octaveOf(m)}` : base;
}

export function getScale(scaleId) {
  return SCALES[scaleId] || SCALES.chromatic;
}

export function isInScale(m, root, scaleId) {
  const rel = pitchClass(m - root);
  return getScale(scaleId).intervals.includes(rel);
}

/** Nearest note in the scale. Ties resolve downwards so snapping feels predictable. */
export function snapToScale(m, root, scaleId) {
  if (isInScale(m, root, scaleId)) return m;
  for (let d = 1; d <= 6; d++) {
    if (isInScale(m - d, root, scaleId)) return m - d;
    if (isInScale(m + d, root, scaleId)) return m + d;
  }
  return m;
}

/** All scale notes between low and high (inclusive), ascending. */
export function scaleNotesInRange(root, scaleId, low, high) {
  const out = [];
  for (let m = Math.ceil(low); m <= high; m++) {
    if (isInScale(m, root, scaleId)) out.push(m);
  }
  return out;
}

/**
 * Move `steps` scale degrees from `m` (which should be in the scale).
 * Works in both directions and across octaves.
 */
export function stepInScale(m, steps, root, scaleId) {
  const intervals = getScale(scaleId).intervals;
  const start = snapToScale(m, root, scaleId);
  const rel = start - root;
  const octave = Math.floor(rel / 12);
  const degree = intervals.indexOf(pitchClass(rel));
  const total = degree + steps;
  const len = intervals.length;
  const octShift = Math.floor(total / len);
  const idx = ((total % len) + len) % len;
  return root + (octave + octShift) * 12 + intervals[idx];
}

/** Expand one note into a chord, diatonic to the scale when a scale lock is active. */
export function buildChord(m, type, root = 0, scaleId = 'chromatic') {
  if (!type || type === 'off' || !CHORD_TYPES[type]) return [m];
  const diatonic = scaleId !== 'chromatic' && DIATONIC_DEGREES[type];
  const notes = diatonic
    ? DIATONIC_DEGREES[type].map((deg) => stepInScale(m, deg, root, scaleId))
    : FIXED_CHORDS[type].map((iv) => m + iv);
  return [...new Set(notes.map(clampMidi))].sort((a, b) => a - b);
}

const QUALITIES = [
  { set: [0, 4, 7, 11], name: 'major 7' },
  { set: [0, 4, 7, 10], name: '7' },
  { set: [0, 3, 7, 10], name: 'minor 7' },
  { set: [0, 3, 6, 10], name: 'half-diminished' },
  { set: [0, 3, 6, 9], name: 'diminished 7' },
  { set: [0, 3, 7, 11], name: 'minor major 7' },
  { set: [0, 4, 8, 11], name: 'augmented major 7' },
  { set: [0, 4, 7], name: 'major' },
  { set: [0, 3, 7], name: 'minor' },
  { set: [0, 3, 6], name: 'diminished' },
  { set: [0, 4, 8], name: 'augmented' },
  { set: [0, 5, 7], name: 'sus4' },
  { set: [0, 2, 7], name: 'sus2' },
  { set: [0, 7], name: 'power chord' },
];

/**
 * Name a group of notes, trying every note as the root. Returns e.g.
 * { root: 2, quality: 'minor', label: 'D minor' } or null when it isn't a known chord.
 */
export function describeChord(notes, system = 'letters') {
  const pcs = [...new Set(notes.map(pitchClass))];
  if (pcs.length < 2) return null;
  const sortedBass = [...notes].sort((a, b) => a - b);
  // Prefer the lowest note as root so inversions read naturally.
  const candidates = [pitchClass(sortedBass[0]), ...pcs];
  for (const r of candidates) {
    const rel = pcs.map((pc) => pitchClass(pc - r)).sort((a, b) => a - b);
    const match = QUALITIES.find(
      (q) => q.set.length === rel.length && q.set.every((v, i) => v === rel[i]),
    );
    if (match) {
      const names = system === 'solfege' ? SOLFEGE_NAMES : LETTER_NAMES;
      const label = match.name === '7' ? `${names[r]}7` : `${names[r]} ${match.name}`;
      return { root: r, quality: match.name, label };
    }
  }
  return null;
}
