// Look-ahead scheduler: a timer wakes up often and schedules any 16th notes
// that fall inside the next slice of audio time. The timer lives in a
// Worker so background tabs don't throttle it into stuttering.

const LOOKAHEAD = 0.12; // seconds of audio scheduled ahead
const TICK_MS = 25;

function createTicker(onTick) {
  try {
    const src = `let id=null;onmessage=e=>{if(e.data==='start'&&id===null){id=setInterval(()=>postMessage(0),${TICK_MS})}else if(e.data==='stop'){clearInterval(id);id=null}}`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = onTick;
    return {
      start: () => worker.postMessage('start'),
      stop: () => worker.postMessage('stop'),
    };
  } catch {
    let id = null;
    return {
      start: () => {
        if (id === null) id = setInterval(onTick, TICK_MS);
      },
      stop: () => {
        clearInterval(id);
        id = null;
      },
    };
  }
}

export class Clock {
  constructor(engine) {
    this.engine = engine;
    this.bpm = 108;
    this.step = 0;
    this.nextTime = 0;
    this.running = false;
    this.listeners = new Set();
    this.owners = new Set();
    this.ticker = createTicker(() => this._schedule());
  }

  /** Several features share one clock; it runs while anyone needs it. */
  acquire(owner) {
    const wasRunning = this.owners.size > 0;
    this.owners.add(owner);
    if (!wasRunning) this.start();
  }

  release(owner) {
    this.owners.delete(owner);
    if (!this.owners.size) this.stop();
  }

  get stepDur() {
    return 60 / this.bpm / 4;
  }

  /** fn(step, time, stepDur) is called once per 16th note, slightly ahead of time. */
  onStep(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setBpm(bpm) {
    this.bpm = Math.max(40, Math.min(220, bpm));
    this.engine.setTempo(this.bpm);
  }

  start() {
    const ctx = this.engine.ensure();
    if (this.running) return;
    this.running = true;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.05;
    this.ticker.start();
    this._schedule();
  }

  /** Restart the bar right now (used when an arpeggio begins with no beat running). */
  realign() {
    if (!this.running) return this.start();
    this.step = 0;
    this.nextTime = this.engine.now + 0.02;
    this._schedule();
    return undefined;
  }

  stop() {
    this.running = false;
    this.ticker.stop();
  }

  _schedule() {
    if (!this.running || !this.engine.ctx) return;
    const ctx = this.engine.ctx;
    // If the tab slept, skip ahead instead of firing a burst of late notes.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.02;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      for (const fn of this.listeners) fn(this.step, this.nextTime, this.stepDur);
      this.nextTime += this.stepDur;
      this.step++;
    }
  }
}
