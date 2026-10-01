import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textToMelody, melodyLength } from '../src/music/wordMelody.js';
import { isInScale } from '../src/music/theory.js';

test('every note lands in the chosen scale', () => {
  const melody = textToMelody('Hello, world! Selamat pagi 🎵 こんにちは 2026', { root: 62, scaleId: 'minor' });
  const notes = melody.filter((n) => n.midi !== null);
  assert.ok(notes.length > 10);
  for (const n of notes) assert.ok(isInScale(n.midi, 62, 'minor'), `${n.char} → ${n.midi}`);
});

test('the same text always gives the same tune', () => {
  assert.deepEqual(textToMelody('Musix'), textToMelody('Musix'));
});

test('vowels sing longer than consonants', () => {
  const [m, u] = textToMelody('mu', { resolve: false });
  assert.equal(m.beats, 0.5);
  assert.equal(u.beats, 1);
});

test('spaces and punctuation become rests, merged and never leading or trailing', () => {
  const melody = textToMelody('  hi...  you  ', { resolve: false });
  assert.notEqual(melody[0].midi, null);
  assert.notEqual(melody[melody.length - 1].midi, null);
  const rests = melody.filter((n) => n.midi === null);
  assert.equal(rests.length, 1);
});

test('the tune resolves to the home note', () => {
  const melody = textToMelody('abc', { root: 60, scaleId: 'majorPentatonic' });
  assert.equal(melody[melody.length - 1].midi, 60);
  assert.ok(melodyLength(melody) > 0);
});

test('empty input stays silent, and long input is capped', () => {
  assert.deepEqual(textToMelody(''), []);
  assert.deepEqual(textToMelody('   ...'), []);
  const long = textToMelody('a'.repeat(500), { maxNotes: 64, resolve: false });
  assert.equal(long.length, 64);
});
