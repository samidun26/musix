// Share a sound as a short text code (and as a link that carries it).
// Format: "mx1." + base64url(JSON with short keys). Decoding is defensive:
// codes come from strangers, so every value goes through sanitizePatch.

import { sanitizePatch, WAVES } from './patch.js';

const PREFIX = 'mx1.';
const HASH_KEY = 'sound=';

const KEYS = {
  name: 'n', emoji: 'e', wave: 'w', cutoff: 'c', resonance: 'r', filterEnv: 'f',
  detune: 'd', attack: 'a', decay: 'y', sustain: 's', release: 'l', vibrato: 'v',
  crunch: 'x', echo: 'o', space: 'p', volume: 'g', sub: 'b', octave: 't',
};

function round(n) {
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n) >= 100) return Math.round(n);
  return Number(n.toPrecision(3));
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64) {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = norm + '='.repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodePatch(patch) {
  const compact = {};
  for (const [long, short] of Object.entries(KEYS)) {
    const v = patch[long];
    if (long === 'wave') compact[short] = Math.max(0, WAVES.findIndex((w) => w.id === v));
    else if (typeof v === 'number') compact[short] = round(v);
    else if (typeof v === 'string') compact[short] = v;
  }
  return PREFIX + toBase64Url(JSON.stringify(compact));
}

/** Returns a clean patch, or null when the code isn't one of ours. */
export function decodePatch(code) {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  const start = trimmed.indexOf(PREFIX);
  if (start === -1) return null;
  const body = trimmed.slice(start + PREFIX.length).match(/^[A-Za-z0-9_-]+/);
  if (!body || body[0].length > 2000) return null;
  try {
    const compact = JSON.parse(fromBase64Url(body[0]));
    if (!compact || typeof compact !== 'object' || Array.isArray(compact)) return null;
    const raw = {};
    for (const [long, short] of Object.entries(KEYS)) {
      if (!(short in compact)) continue;
      raw[long] = long === 'wave' ? WAVES[compact[short]]?.id : compact[short];
    }
    return sanitizePatch(raw);
  } catch {
    return null;
  }
}

export function shareUrl(baseHref, patch) {
  const url = new URL(baseHref);
  url.hash = HASH_KEY + encodePatch(patch);
  return url.toString();
}

/** Reads "#sound=mx1...." from a location hash. */
export function patchFromHash(hash) {
  if (typeof hash !== 'string') return null;
  const clean = hash.replace(/^#/, '');
  if (!clean.startsWith(HASH_KEY)) return null;
  return decodePatch(decodeURIComponent(clean.slice(HASH_KEY.length)));
}
