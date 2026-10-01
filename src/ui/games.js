// Word melody and Copycat: two small games that teach listening and
// show how text, notes and scales relate.

import { h, announce, noteColorVar } from './dom.js';
import { textToMelody } from '../music/wordMelody.js';
import { noteLabel, spokenNoteName, scaleNotesInRange, pitchClass } from '../music/theory.js';
import { storage } from '../state/store.js';

/** Schedules a list of timed callbacks and can cancel them all at once. */
class Timeline {
  constructor() {
    this.timers = new Set();
  }

  at(ms, fn) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  clear() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  get busy() {
    return this.timers.size > 0;
  }
}

export class WordMelody {
  constructor({ form, input, list, button, performer, getPlay, getBpm, getNames }) {
    this.form = form;
    this.input = input;
    this.list = list;
    this.button = button;
    this.performer = performer;
    this.getPlay = getPlay;
    this.getBpm = getBpm;
    this.getNames = getNames;
    this.timeline = new Timeline();
    this.melody = [];

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.timeline.busy) this.stop();
      else this.play();
    });
    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => this.preview(), 150);
    });
    this.preview();
  }

  _opts() {
    const play = this.getPlay();
    const scaleId = play.scaleId === 'chromatic' ? 'majorPentatonic' : play.scaleId;
    return { root: 60 + play.root + play.octave * 12, scaleId };
  }

  preview() {
    this.melody = textToMelody(this.input.value, this._opts());
    const names = this.getNames();
    this.list.replaceChildren(
      ...this.melody.map((n) =>
        n.midi == null
          ? h('li', { class: 'word-note word-note--rest', 'aria-label': 'pause' }, h('span', { class: 'word-note__char', 'aria-hidden': 'true' }, '·'))
          : h(
              'li',
              { class: 'word-note', style: { '--note': noteColorVar(n.midi) }, 'aria-label': `${n.char}: ${spokenNoteName(n.midi, names)}` },
              h('span', { class: 'word-note__char', 'aria-hidden': 'true' }, n.char),
              h('span', { class: 'word-note__pitch', 'aria-hidden': 'true' }, noteLabel(n.midi, names)),
            ),
      ),
    );
  }

  play() {
    this.preview();
    if (!this.melody.length) {
      announce('Type something first, then press Sing it.');
      return;
    }
    const beat = 60 / this.getBpm();
    const items = [...this.list.children];
    let t = 50;
    this.melody.forEach((n, i) => {
      const dur = n.beats * beat * 1000;
      this.timeline.at(t, () => {
        items.forEach((el) => el.classList.remove('is-playing'));
        items[i]?.classList.add('is-playing');
        if (n.midi != null) {
          this.performer.playOneShot(n.midi, { duration: (dur / 1000) * 0.9, velocity: n.accent ? 0.9 : 0.7 });
        }
      });
      t += dur;
    });
    this.timeline.at(t + 200, () => {
      items.forEach((el) => el.classList.remove('is-playing'));
      this._setButton(false);
    });
    this._setButton(true);
  }

  stop() {
    this.timeline.clear();
    for (const el of this.list.children) el.classList.remove('is-playing');
    this._setButton(false);
  }

  _setButton(playing) {
    this.button.lastChild.textContent = playing ? 'Stop' : 'Sing it';
    this.button.querySelector('use').setAttribute('href', playing ? '#i-stop' : '#i-play');
  }
}

const MAX_LIVES = 3;

export class Copycat {
  constructor({ els, performer, keyboard, getPlay, getNames }) {
    this.els = els;
    this.performer = performer;
    this.keyboard = keyboard;
    this.getPlay = getPlay;
    this.getNames = getNames;
    this.timeline = new Timeline();
    this.state = 'idle';
    this.round = 0;
    this.lives = MAX_LIVES;
    this.tune = [];
    this.pos = 0;
    this.best = Number(storage.load('copycatBest', 0)) || 0;
    els.best.textContent = String(this.best);

    els.start.addEventListener('click', () => (this.state === 'idle' || this.state === 'over' ? this.start() : this.stop()));
    els.replay.addEventListener('click', () => this._playTune());
    performer.addEventListener('press', (e) => this._onPress(e.detail));
    this._renderLives();
  }

  start() {
    this.round = 1;
    this.lives = MAX_LIVES;
    this._renderLives();
    this.els.start.lastChild.textContent = 'Stop game';
    this.els.start.querySelector('use').setAttribute('href', '#i-stop');
    this.els.replay.disabled = false;
    this._newTune(3);
  }

  stop(message = 'Game stopped. Press Start whenever you’re ready.') {
    this.timeline.clear();
    this.keyboard.clearHints();
    this.state = 'idle';
    this.els.start.lastChild.textContent = 'Start game';
    this.els.start.querySelector('use').setAttribute('href', '#i-play');
    this.els.replay.disabled = true;
    this._say('Can you copy Musi?', message);
  }

  _newTune(length) {
    const play = this.getPlay();
    const [lo, hi] = this.keyboard.range;
    // Pentatonic notes on the visible keyboard: friendly to hear and to find.
    let pool = scaleNotesInRange(play.root, 'majorPentatonic', Math.max(lo, 60 + play.octave * 12 - 2), Math.min(hi, 72 + play.octave * 12));
    if (pool.length < 3) pool = scaleNotesInRange(play.root, 'majorPentatonic', lo, hi);
    const tune = [];
    while (tune.length < length) {
      const n = pool[Math.floor(Math.random() * pool.length)];
      if (tune.length >= 2 && n === tune[tune.length - 1] && n === tune[tune.length - 2]) continue;
      tune.push(n);
    }
    this.tune = tune;
    this.els.round.textContent = String(this.round);
    this._playTune();
  }

  _playTune() {
    if (!this.tune.length) return;
    this.timeline.clear();
    this.keyboard.clearHints();
    this.state = 'listen';
    this.pos = 0;
    this._renderDots();
    this._say(`Round ${this.round}: listen…`, `Musi plays ${this.tune.length} notes.`);
    const gap = 520;
    this.tune.forEach((midi, i) => {
      this.timeline.at(400 + i * gap, () => {
        this.performer.playOneShot(midi, { duration: 0.38, velocity: 0.85, source: 'copycat' });
        if (this.els.show.checked) {
          this.keyboard.hint(midi, true);
          this.timeline.at(380, () => this.keyboard.hint(midi, false));
        }
      });
    });
    this.timeline.at(400 + this.tune.length * gap, () => {
      this.state = 'turn';
      this._say('Your turn!', `Play the ${this.tune.length} notes back. Any octave counts.`);
    });
  }

  _onPress({ source, input }) {
    if (this.state !== 'turn' || source === 'pad') return;
    const expected = this.tune[this.pos];
    const names = this.getNames();
    if (pitchClass(input) === pitchClass(expected)) {
      this.pos++;
      this._renderDots();
      if (this.pos === this.tune.length) this._win();
      return;
    }
    this.lives--;
    this._renderLives();
    this._renderDots(this.pos);
    const heard = spokenNoteName(input, names, false);
    const wanted = spokenNoteName(expected, names, false);
    if (this.lives <= 0) {
      this.state = 'over';
      this.timeline.clear();
      this.els.start.lastChild.textContent = 'Play again';
      this.els.start.querySelector('use').setAttribute('href', '#i-replay');
      this.els.replay.disabled = true;
      this._say('Game over!', `You reached round ${this.round}. That was ${heard}; Musi wanted ${wanted}.`);
      return;
    }
    this.state = 'oops';
    this._say('Oops!', `That was ${heard}; Musi wanted ${wanted}. Listen again…`);
    this.timeline.at(1600, () => this._playTune());
  }

  _win() {
    this.state = 'won';
    if (this.round > this.best) {
      this.best = this.round;
      storage.save('copycatBest', this.best);
      this.els.best.textContent = String(this.best);
    }
    this._say('Yes! Perfect copy!', this.round >= 3 ? 'You’ve got great ears. Next tune is one note longer.' : 'Next tune is one note longer.');
    this.timeline.at(1400, () => {
      this.round++;
      this._newTune(Math.min(12, this.tune.length + 1));
    });
  }

  _say(title, msg) {
    this.els.title.textContent = title;
    this.els.msg.textContent = msg;
    announce(`${title} ${msg}`);
  }

  _renderDots(wrongAt = -1) {
    this.els.dots.replaceChildren(
      ...this.tune.map((_, i) =>
        h('span', { class: `copycat__dot${i < this.pos ? ' is-done' : ''}${i === wrongAt ? ' is-wrong' : ''}` })),
    );
  }

  _renderLives() {
    this.els.lives.textContent = '♥'.repeat(this.lives) + '♡'.repeat(MAX_LIVES - this.lives);
    this.els.lives.setAttribute('aria-label', `${this.lives} of ${MAX_LIVES} hearts`);
  }
}
