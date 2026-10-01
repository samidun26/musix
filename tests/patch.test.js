import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPatch, sanitizePatch, randomPatch, samePatchSound, WAVES } from '../src/state/patch.js';
import { PARAMS, PARAM_KEYS, toNorm, fromNorm, formatValue, spokenValue } from '../src/state/params.js';
import { PRESETS } from '../src/state/presets.js';
import { encodePatch, decodePatch, shareUrl, patchFromHash } from '../src/state/share.js';
import { BEAT_PRESETS, DRUMS, STEPS, serializePattern, parsePattern, randomPattern, clonePattern } from '../src/state/beats.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test('knob mapping round-trips for every parameter', () => {
  for (const key of PARAM_KEYS) {
    const spec = PARAMS[key];
    for (const t of [0, 0.25, 0.5, 1]) {
      assert.ok(Math.abs(toNorm(spec, fromNorm(spec, t)) - t) < 1e-9, `${key} @ ${t}`);
    }
    assert.ok(spec.default >= spec.min && spec.default <= spec.max, `${key} default in range`);
  }
});

test('values are formatted for eyes and for screen readers', () => {
  assert.equal(formatValue(PARAMS.cutoff, 1200), '1.2 kHz');
  assert.equal(spokenValue(PARAMS.cutoff, 440), '440 hertz');
  assert.equal(formatValue(PARAMS.attack, 0.35), '350 ms');
  assert.equal(spokenValue(PARAMS.release, 2), '2 seconds');
  assert.equal(formatValue(PARAMS.echo, 0.456), '46%');
});

test('sanitizePatch clamps, defaults and rejects junk', () => {
  const p = sanitizePatch({ cutoff: 1e9, attack: -5, wave: 'banana', name: '  <b>Hi</b>\u0007 ', volume: 'loud', octave: 1.6 });
  assert.equal(p.cutoff, PARAMS.cutoff.max);
  assert.equal(p.attack, PARAMS.attack.min);
  assert.equal(p.wave, defaultPatch().wave);
  assert.equal(p.name, '<b>Hi</b>'); // kept as plain text, rendered with textContent
  assert.equal(p.volume, PARAMS.volume.default);
  assert.equal(p.octave, 2);
  assert.deepEqual(sanitizePatch(null), defaultPatch());
});

test('every preset is already clean', () => {
  for (const { id, patch } of PRESETS) assert.deepEqual(sanitizePatch(patch), patch, id);
});

test('random patches stay valid and keep the current volume', () => {
  const rng = seeded(42);
  for (let i = 0; i < 50; i++) {
    const p = randomPatch(rng, { ...defaultPatch(), volume: 0.4, octave: -1 });
    assert.deepEqual(sanitizePatch(p), p);
    assert.equal(p.volume, 0.4);
    assert.equal(p.octave, -1);
    assert.ok(WAVES.some((w) => w.id === p.wave));
  }
});

test('share codes round-trip and survive tampering', () => {
  const original = PRESETS[2].patch;
  const code = encodePatch(original);
  assert.match(code, /^mx1\.[A-Za-z0-9_-]+$/);
  const back = decodePatch(code);
  assert.equal(back.name, original.name);
  assert.equal(back.wave, original.wave);
  assert.ok(samePatchSound(back, original) || Math.abs(back.cutoff - original.cutoff) < 1);

  assert.equal(decodePatch('hello'), null);
  assert.equal(decodePatch('mx1.!!!'), null);
  assert.equal(decodePatch(`mx1.${Buffer.from('[1,2]').toString('base64url')}`), null);
  const evil = decodePatch(`mx1.${Buffer.from(JSON.stringify({ c: 1e12, w: 99, n: 42 })).toString('base64url')}`);
  assert.equal(evil.cutoff, PARAMS.cutoff.max);
  assert.equal(evil.wave, defaultPatch().wave);
});

test('share links carry the code in the hash', () => {
  const url = shareUrl('https://example.com/musix/?x=1#old', PRESETS[1].patch);
  assert.ok(url.startsWith('https://example.com/musix/?x=1#sound=mx1.'));
  const back = patchFromHash(new URL(url).hash);
  assert.equal(back.name, PRESETS[1].patch.name);
  assert.equal(patchFromHash('#something-else'), null);
});

test('names with emoji and non-Latin text survive encoding', () => {
  const p = { ...defaultPatch(), name: 'Bebek Goreng 🦆 ねこ', emoji: '🦆' };
  assert.equal(decodePatch(encodePatch(p)).name, p.name);
});

test('beat patterns serialize and parse', () => {
  for (const { rows } of Object.values(BEAT_PRESETS)) {
    const clean = clonePattern(rows);
    for (const d of DRUMS) assert.equal(clean[d.id].length, STEPS);
    assert.deepEqual(parsePattern(serializePattern(clean)), clean);
  }
  const random = randomPattern(seeded(7));
  assert.equal(random.kick[0], true, 'random beats always start with a kick');
  assert.equal(parsePattern('nope'), null);
  assert.equal(parsePattern('x'.repeat(16)), null);
});
