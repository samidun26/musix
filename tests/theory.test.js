import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  midiToFreq, pitchClass, octaveOf, isBlackKey, noteLabel, spokenNoteName,
  isInScale, snapToScale, scaleNotesInRange, stepInScale, buildChord, describeChord, SCALES,
} from '../src/music/theory.js';

test('midiToFreq anchors A4 at 440 Hz and doubles per octave', () => {
  assert.equal(midiToFreq(69), 440);
  assert.equal(midiToFreq(81), 880);
  assert.ok(Math.abs(midiToFreq(60) - 261.6256) < 1e-3);
});

test('pitch class and octave follow scientific pitch notation', () => {
  assert.equal(pitchClass(61), 1);
  assert.equal(pitchClass(-1), 11);
  assert.equal(octaveOf(60), 4);
  assert.equal(octaveOf(59), 3);
  assert.equal(isBlackKey(61), true);
  assert.equal(isBlackKey(64), false);
});

test('note labels support letters and fixed-do solfège', () => {
  assert.equal(noteLabel(60), 'C4');
  assert.equal(noteLabel(61, 'letters', false), 'C♯');
  assert.equal(noteLabel(71, 'solfege'), 'Si4');
  assert.equal(spokenNoteName(66), 'F sharp 4');
  assert.equal(spokenNoteName(67, 'solfege', false), 'Sol');
});

test('every scale starts on the root and stays inside one octave', () => {
  for (const [id, scale] of Object.entries(SCALES)) {
    assert.equal(scale.intervals[0], 0, id);
    assert.ok(scale.intervals.every((i) => i >= 0 && i < 12), id);
    assert.deepEqual([...scale.intervals].sort((a, b) => a - b), scale.intervals, `${id} is ascending`);
  }
});

test('snapToScale leaves scale notes alone and picks the nearest otherwise', () => {
  // C major pentatonic: C D E G A
  assert.equal(snapToScale(60, 0, 'majorPentatonic'), 60);
  assert.equal(snapToScale(61, 0, 'majorPentatonic'), 60); // C♯ → C (tie goes down)
  assert.equal(snapToScale(65, 0, 'majorPentatonic'), 64); // F → E
  assert.equal(snapToScale(66, 0, 'majorPentatonic'), 67); // F♯ → G
  assert.equal(snapToScale(71, 0, 'majorPentatonic'), 72); // B → C
  // Works in other keys too: D major
  assert.equal(snapToScale(65, 2, 'major'), 64); // F → E (tie, down)
  assert.ok(isInScale(66, 2, 'major')); // F♯ is in D major
});

test('scaleNotesInRange lists notes ascending', () => {
  assert.deepEqual(scaleNotesInRange(0, 'majorPentatonic', 60, 72), [60, 62, 64, 67, 69, 72]);
});

test('stepInScale walks degrees across octave boundaries both ways', () => {
  assert.equal(stepInScale(60, 1, 0, 'major'), 62);
  assert.equal(stepInScale(60, 7, 0, 'major'), 72);
  assert.equal(stepInScale(60, -1, 0, 'major'), 59);
  assert.equal(stepInScale(67, 2, 0, 'majorPentatonic'), 72);
  assert.equal(stepInScale(60, -6, 0, 'majorPentatonic'), 45); // A2
});

test('buildChord makes fixed shapes without a scale lock', () => {
  assert.deepEqual(buildChord(60, 'off'), [60]);
  assert.deepEqual(buildChord(60, 'triad'), [60, 64, 67]);
  assert.deepEqual(buildChord(60, 'seventh'), [60, 64, 67, 71]);
  assert.deepEqual(buildChord(60, 'power'), [60, 67, 72]);
  assert.deepEqual(buildChord(60, 'sus'), [60, 65, 67]);
});

test('buildChord follows the scale when a scale lock is on', () => {
  // D in C major gives D minor; B gives B diminished.
  assert.deepEqual(buildChord(62, 'triad', 0, 'major'), [62, 65, 69]);
  assert.deepEqual(buildChord(71, 'triad', 0, 'major'), [71, 74, 77]);
  assert.deepEqual(buildChord(67, 'seventh', 0, 'major'), [67, 71, 74, 77]); // G7
});

test('describeChord names common chords, including inversions', () => {
  assert.equal(describeChord([60, 64, 67]).label, 'C major');
  assert.equal(describeChord([62, 65, 69]).label, 'D minor');
  assert.equal(describeChord([64, 67, 72]).label, 'C major'); // first inversion
  assert.equal(describeChord([67, 71, 74, 77]).label, 'G7');
  assert.equal(describeChord([60, 67]).label, 'C power chord');
  assert.equal(describeChord([60, 64, 67], 'solfege').label, 'Do major');
  assert.equal(describeChord([60]), null);
  assert.equal(describeChord([60, 61, 62]), null);
});
