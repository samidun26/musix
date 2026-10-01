// Arpeggiator patterns. Pure functions: given held notes, produce the step order.

export const ARP_MODES = {
  off: { name: 'Off' },
  up: { name: 'Up' },
  down: { name: 'Down' },
  bounce: { name: 'Bounce' },
  random: { name: 'Random' },
  played: { name: 'As played' },
};

/** How many 16th-note clock ticks each arp step lasts. */
export const ARP_RATES = {
  4: { name: 'Slow', ticks: 4 },
  8: { name: 'Medium', ticks: 2 },
  16: { name: 'Fast', ticks: 1 },
};

/**
 * @param {number[]} notes held notes, in the order they were pressed
 * @param {string} mode one of ARP_MODES
 * @param {number} octaves how many octaves to span (1–3)
 * @returns {number[]} the cycle of notes to step through
 */
export function arpSequence(notes, mode = 'up', octaves = 1) {
  if (!notes.length || mode === 'off') return [];
  const unique = [...new Set(notes)];
  const base = mode === 'played' ? unique : [...unique].sort((a, b) => a - b);
  const span = Math.max(1, Math.min(3, Math.round(octaves)));
  const expanded = [];
  for (let o = 0; o < span; o++) for (const n of base) expanded.push(n + 12 * o);

  switch (mode) {
    case 'down':
      return expanded.reverse();
    case 'bounce':
      return expanded.length > 2
        ? [...expanded, ...expanded.slice(1, -1).reverse()]
        : expanded;
    default:
      return expanded;
  }
}

/** Pick the note for a given step. `rng` is injectable for tests. */
export function arpNoteAt(sequence, step, mode, rng = Math.random) {
  if (!sequence.length) return null;
  if (mode === 'random') return sequence[Math.floor(rng() * sequence.length)];
  return sequence[((step % sequence.length) + sequence.length) % sequence.length];
}
