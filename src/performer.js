// The performer sits between every input (on-screen keys, computer keys,
// MIDI, the magic pad, games) and the synth. It applies the play modes —
// scale lock, chord buddy, arpeggiator, hold — and tells the UI what is
// sounding so keys, the mascot and the visualizer can react.

import { snapToScale, buildChord, describeChord, spokenNoteName, noteLabel } from './music/theory.js';
import { arpSequence, arpNoteAt, ARP_RATES } from './music/arp.js';

export class Performer extends EventTarget {
  /**
   * @param {{engine: import('./audio/engine.js').AudioEngine,
   *          synth: import('./audio/synth.js').Synth,
   *          clock: import('./audio/clock.js').Clock,
   *          getPlay: () => any}} deps
   */
  constructor({ engine, synth, clock, getPlay }) {
    super();
    this.engine = engine;
    this.synth = synth;
    this.clock = clock;
    this.getPlay = getPlay;
    this.active = new Map(); // "source:input" -> entry
    this.counts = new Map(); // midi -> number of entries sounding it directly
    this.order = 0;
    this.arpIndex = 0;
    this.arpRunning = false;
    clock.onStep((step, time, dur) => this._arpStep(step, time, dur));
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** Fire a UI event when the audio actually plays, not when it was scheduled. */
  _emitAt(time, type, detail) {
    const ms = Math.max(0, (time - this.engine.now) * 1000 + (this.engine.ctx?.outputLatency || 0) * 1000);
    if (ms < 4) this._emit(type, detail);
    else setTimeout(() => this._emit(type, detail), ms);
  }

  _arpOn(play = this.getPlay()) {
    return play.arp && play.arp !== 'off';
  }

  press(source, input, velocity = 0.8) {
    const play = this.getPlay();
    const key = `${source}:${input}`;
    if (this.active.has(key)) {
      // In hold mode a second press un-latches the note.
      if (play.hold) this.release(source, input, true);
      return;
    }
    this.engine.ensure();
    const target = play.scaleId !== 'chromatic' ? snapToScale(input, play.root, play.scaleId) : input;
    const notes = buildChord(target, play.chord, play.root, play.scaleId);
    const direct = !this._arpOn(play);
    const entry = { source, input, notes, velocity, order: this.order++, direct };
    this.active.set(key, entry);
    this._emit('press', { source, input, notes, velocity, latched: Boolean(play.hold) });
    if (direct) this._sound(notes, velocity);
    else this._startArp();
    this._emitChord();
  }

  release(source, input, force = false) {
    const key = `${source}:${input}`;
    const entry = this.active.get(key);
    if (!entry) return;
    if (this.getPlay().hold && !force) return;
    this.active.delete(key);
    this._emit('release', { source, input, notes: entry.notes });
    if (entry.direct) this._silence(entry.notes);
    this._emitChord();
  }

  /** Stop everything: held, latched, arpeggiated and ringing notes. */
  panic() {
    for (const entry of this.active.values()) {
      this._emit('release', { source: entry.source, input: entry.input, notes: entry.notes });
    }
    this.active.clear();
    for (const midi of this.counts.keys()) this._emit('noteoff', { midi });
    this.counts.clear();
    this.synth.allOff();
    this._stopArp();
    this._emitChord();
  }

  releaseSource(source) {
    for (const entry of [...this.active.values()]) {
      if (entry.source === source) this.release(entry.source, entry.input, true);
    }
  }

  /** Call when play modes change so held notes follow the new mode. */
  refresh(prev, next) {
    if (prev.hold && !next.hold) {
      for (const entry of [...this.active.values()]) this.release(entry.source, entry.input, true);
    }
    const wasArp = prev.arp && prev.arp !== 'off';
    const isArp = this._arpOn(next);
    if (wasArp === isArp) return;
    for (const entry of this.active.values()) {
      if (isArp && entry.direct) {
        this._silence(entry.notes);
        entry.direct = false;
      } else if (!isArp && !entry.direct) {
        entry.direct = true;
        this._sound(entry.notes, entry.velocity);
      }
    }
    if (isArp && this.active.size) this._startArp();
    if (!isArp) this._stopArp();
  }

  /** A note with a known length: melodies, games, the magic pad's glide. */
  playOneShot(midi, { velocity = 0.8, when, duration = 0.3, source = 'auto' } = {}) {
    const ctx = this.engine.ensure();
    const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
    this.synth.playNote(midi, velocity, t, duration);
    this._emitAt(t, 'noteon', { midi, velocity, source, transient: true });
    this._emitAt(t + duration, 'noteoff', { midi, source, transient: true });
  }

  _sound(notes, velocity) {
    for (const n of notes) {
      const c = this.counts.get(n) || 0;
      this.counts.set(n, c + 1);
      if (c === 0) {
        this.synth.noteOn(n, velocity);
        this._emit('noteon', { midi: n, velocity });
      }
    }
  }

  _silence(notes) {
    for (const n of notes) {
      const c = this.counts.get(n);
      if (!c) continue;
      if (c === 1) {
        this.counts.delete(n);
        this.synth.noteOff(n);
        this._emit('noteoff', { midi: n });
      } else {
        this.counts.set(n, c - 1);
      }
    }
  }

  _startArp() {
    if (this.arpRunning) return;
    this.arpRunning = true;
    this.arpIndex = 0;
    const wasRunning = this.clock.running;
    this.clock.acquire('arp');
    // Without a beat playing, start the arpeggio the moment the key goes down.
    if (wasRunning && !this.clock.owners.has('beat')) this.clock.realign();
  }

  _stopArp() {
    if (!this.arpRunning) return;
    this.arpRunning = false;
    this.clock.release('arp');
  }

  _arpStep(step, time, stepDur) {
    if (!this.arpRunning) return;
    const play = this.getPlay();
    const pool = [...this.active.values()].filter((e) => !e.direct).sort((a, b) => a.order - b.order);
    if (!pool.length) {
      this._stopArp();
      return;
    }
    const ticks = ARP_RATES[play.arpRate]?.ticks ?? 2;
    if (step % ticks !== 0) return;
    const seq = arpSequence(pool.flatMap((e) => e.notes), play.arp, play.arpOctaves);
    const midi = arpNoteAt(seq, this.arpIndex++, play.arp);
    if (midi == null) return;
    const velocity = pool.reduce((s, e) => s + e.velocity, 0) / pool.length;
    const duration = stepDur * ticks * 0.82;
    this.synth.playNote(midi, velocity, time, duration);
    this._emitAt(time, 'noteon', { midi, velocity, source: 'arp', transient: true });
    this._emitAt(time + duration, 'noteoff', { midi, source: 'arp', transient: true });
  }

  /** Every note currently held (before the arpeggiator spreads them out). */
  heldNotes() {
    return [...new Set([...this.active.values()].flatMap((e) => e.notes))].sort((a, b) => a - b);
  }

  _emitChord() {
    const notes = this.heldNotes();
    this._emit('chord', { notes });
  }
}

/** Human-friendly description of what's held: "C♯4", "D minor", or "3 notes". */
export function describeHeld(notes, system = 'letters') {
  if (!notes.length) return { text: '', spoken: '' };
  if (notes.length === 1) {
    return { text: noteLabel(notes[0], system), spoken: spokenNoteName(notes[0], system) };
  }
  const chord = describeChord(notes, system);
  if (chord) {
    const spoken = chord.label.replace('♯', ' sharp');
    return { text: chord.label, spoken: chord.quality.includes('chord') ? spoken : `${spoken} chord` };
  }
  return { text: `${notes.length} notes`, spoken: `${notes.length} notes` };
}
