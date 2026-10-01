// Drum rows and starter patterns for the Beat Garden.

export const STEPS = 16;

export const DRUMS = [
  { id: 'kick', label: 'Kick', note: 'Deep thump' },
  { id: 'snare', label: 'Snare', note: 'Snappy crack' },
  { id: 'clap', label: 'Clap', note: 'Hand clap' },
  { id: 'hat', label: 'Hi-hat', note: 'Tiny tick' },
  { id: 'bell', label: 'Cowbell', note: 'More cowbell' },
];

// "x" = hit, "." = rest. Easy to read and edit by hand.
const P = (s) => Array.from(s.replace(/\s/g, ''), (c) => c === 'x');

export const BEAT_PRESETS = {
  fourFloor: {
    name: 'Four on the floor',
    rows: {
      kick: P('x... x... x... x...'),
      snare: P('.... .... .... ....'),
      clap: P('.... x... .... x...'),
      hat: P('..x. ..x. ..x. ..x.'),
      bell: P('.... .... .... ....'),
    },
  },
  boomBap: {
    name: 'Boom bap',
    rows: {
      kick: P('x... ...x ..x. ....'),
      snare: P('.... x... .... x...'),
      clap: P('.... .... .... ....'),
      hat: P('x.x. x.x. x.x. x.x.'),
      bell: P('.... .... .... ....'),
    },
  },
  dembow: {
    name: 'Dembow',
    rows: {
      kick: P('x... x... x... x...'),
      snare: P('...x ..x. ...x ..x.'),
      clap: P('.... .... .... ....'),
      hat: P('x.x. x.x. x.x. x.x.'),
      bell: P('.... .... .... ....'),
    },
  },
  halfTime: {
    name: 'Half-time',
    rows: {
      kick: P('x... .... ..x. ....'),
      snare: P('.... .... x... ....'),
      clap: P('.... .... .... ....'),
      hat: P('x.xx x.x. x.xx x.x.'),
      bell: P('.... .... .... ..x.'),
    },
  },
  cowbell: {
    name: 'More cowbell',
    rows: {
      kick: P('x... ..x. x... ..x.'),
      snare: P('.... x... .... x...'),
      clap: P('.... .... .... ....'),
      hat: P('xxxx xxxx xxxx xxxx'),
      bell: P('x.x. x.x. x.x. x.x.'),
    },
  },
  empty: {
    name: 'Empty garden',
    rows: Object.fromEntries(DRUMS.map((d) => [d.id, P('.'.repeat(STEPS))])),
  },
};

export function clonePattern(rows) {
  const out = {};
  for (const d of DRUMS) out[d.id] = Array.from({ length: STEPS }, (_, i) => Boolean(rows?.[d.id]?.[i]));
  return out;
}

/** A random groove that still grooves: kick on the one, backbeat likely. */
export function randomPattern(rng = Math.random) {
  const rows = clonePattern({});
  for (let i = 0; i < STEPS; i++) {
    const beat = i % 4 === 0;
    rows.kick[i] = i === 0 || (beat ? rng() < 0.55 : rng() < 0.12);
    rows.snare[i] = (i === 4 || i === 12) ? rng() < 0.85 : rng() < 0.05;
    rows.clap[i] = (i === 4 || i === 12) ? rng() < 0.3 : rng() < 0.03;
    rows.hat[i] = i % 2 === 0 ? rng() < 0.8 : rng() < 0.3;
    rows.bell[i] = rng() < 0.06;
  }
  return rows;
}

/** Compact string form for storage: one 16-char row per drum. */
export function serializePattern(rows) {
  return DRUMS.map((d) => rows[d.id].map((on) => (on ? 'x' : '.')).join('')).join('|');
}

export function parsePattern(str) {
  if (typeof str !== 'string') return null;
  const parts = str.split('|');
  if (parts.length !== DRUMS.length) return null;
  const rows = {};
  for (let r = 0; r < DRUMS.length; r++) {
    if (!/^[x.]{16}$/.test(parts[r])) return null;
    rows[DRUMS[r].id] = P(parts[r]);
  }
  return rows;
}
