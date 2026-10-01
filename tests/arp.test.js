import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arpSequence, arpNoteAt } from '../src/music/arp.js';

test('up sorts held notes and down reverses them', () => {
  assert.deepEqual(arpSequence([67, 60, 64], 'up'), [60, 64, 67]);
  assert.deepEqual(arpSequence([67, 60, 64], 'down'), [67, 64, 60]);
});

test('as played keeps press order and drops duplicates', () => {
  assert.deepEqual(arpSequence([67, 60, 67, 64], 'played'), [67, 60, 64]);
});

test('bounce goes up then down without repeating the ends', () => {
  assert.deepEqual(arpSequence([60, 64, 67], 'bounce'), [60, 64, 67, 64]);
  assert.deepEqual(arpSequence([60, 64], 'bounce'), [60, 64]);
});

test('octaves extend the pattern upwards', () => {
  assert.deepEqual(arpSequence([60, 64], 'up', 2), [60, 64, 72, 76]);
});

test('empty input or off mode gives nothing', () => {
  assert.deepEqual(arpSequence([], 'up'), []);
  assert.deepEqual(arpSequence([60], 'off'), []);
  assert.equal(arpNoteAt([], 0, 'up'), null);
});

test('arpNoteAt cycles, and random uses the injected generator', () => {
  const seq = [60, 64, 67];
  assert.equal(arpNoteAt(seq, 4, 'up'), 64);
  assert.equal(arpNoteAt(seq, 0, 'random', () => 0.99), 67);
});
