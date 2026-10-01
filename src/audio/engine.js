// The audio graph. Created lazily on the first user gesture (browsers
// refuse to start audio before one).
//
//  voices ─► synthIn ─► crunch ─► synthLevel ─┬─► dry ───────────────┐
//                                             ├─► echo send ─► delay ─┤
//                                             └─► space send ─► verb ─┤
//  drums ─► drumIn ───────────────────────────────────────────────────┤
//                                                                     ▼
//                           master (volume cap) ─► limiter ─► mono? ─► analyser ─► speakers
//                                                             └─► recorder tap

export class AudioEngine extends EventTarget {
  constructor() {
    super();
    this.ctx = null;
    this.nodes = null;
    this.bpm = 108;
    this.options = { maxVolume: 0.85, mono: false };
    this.fx = { crunch: 0, echo: 0.18, space: 0.25, volume: 0.75 };
    this.drumLevel = 0.8;
    this._curveAmount = -1;
  }

  get running() {
    return this.ctx?.state === 'running';
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Call from inside a user gesture. Safe to call often. */
  ensure() {
    if (!this.ctx) this._build();
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  _build() {
    // Let iOS play through the silent switch, like a music app would.
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      /* not supported */
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;

    const gain = (value = 1) => {
      const g = ctx.createGain();
      g.gain.value = value;
      return g;
    };

    const synthIn = gain(1);
    const shaper = ctx.createWaveShaper();
    shaper.oversample = '4x';
    const synthLevel = gain(this.fx.volume);
    const dry = gain(1);
    const echoSend = gain(0);
    const delay = ctx.createDelay(2);
    const feedback = gain(0.3);
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 3200;
    const spaceSend = gain(0);
    const verb = ctx.createConvolver();
    verb.buffer = makeImpulse(ctx, 2.8, 2.6);
    const drumIn = gain(this.drumLevel);
    const drumVerb = gain(0.12);
    const master = gain(this.options.maxVolume);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    const out = gain(1);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;

    synthIn.connect(shaper).connect(synthLevel);
    synthLevel.connect(dry).connect(master);
    synthLevel.connect(echoSend).connect(delay).connect(echoTone).connect(feedback).connect(delay);
    echoTone.connect(master);
    synthLevel.connect(spaceSend).connect(verb).connect(master);
    drumIn.connect(master);
    drumIn.connect(drumVerb).connect(verb);
    master.connect(limiter).connect(out).connect(analyser).connect(ctx.destination);

    this.nodes = {
      synthIn, shaper, synthLevel, dry, echoSend, delay, feedback, spaceSend, verb,
      drumIn, master, limiter, out, analyser, recordTap: null,
    };

    this.setTempo(this.bpm);
    this.setFx(this.fx);
    this.setOptions(this.options);
    ctx.addEventListener('statechange', () => this.dispatchEvent(new Event('statechange')));
    this.dispatchEvent(new Event('ready'));
  }

  setTempo(bpm) {
    this.bpm = bpm;
    if (!this.ctx) return;
    // Dotted-eighth echo: the classic "rhythmic" delay.
    const time = Math.min(1.8, (60 / bpm) * 0.75);
    this.nodes.delay.delayTime.setTargetAtTime(time, this.ctx.currentTime, 0.05);
  }

  setFx(fx) {
    Object.assign(this.fx, fx);
    if (!this.ctx) return;
    const { crunch, echo, space, volume } = this.fx;
    const t = this.ctx.currentTime;
    const n = this.nodes;
    if (Math.abs(crunch - this._curveAmount) > 0.004) {
      n.shaper.curve = crunch > 0.004 ? makeDriveCurve(crunch) : null;
      this._curveAmount = crunch;
    }
    // Distortion is louder; pull the level back so Crunch isn't a volume knob.
    n.synthLevel.gain.setTargetAtTime(volume * (1 - crunch * 0.45), t, 0.02);
    n.echoSend.gain.setTargetAtTime(echo * 0.65, t, 0.03);
    n.feedback.gain.setTargetAtTime(0.22 + echo * 0.33, t, 0.03);
    n.spaceSend.gain.setTargetAtTime(space * 0.95, t, 0.03);
    n.dry.gain.setTargetAtTime(1 - space * 0.25, t, 0.03);
  }

  setDrumLevel(level) {
    this.drumLevel = level;
    if (this.ctx) this.nodes.drumIn.gain.setTargetAtTime(level, this.ctx.currentTime, 0.02);
  }

  /** Hearing-safety cap and mono downmix. */
  setOptions(options) {
    Object.assign(this.options, options);
    if (!this.ctx) return;
    const { out, master } = this.nodes;
    master.gain.setTargetAtTime(this.options.maxVolume, this.ctx.currentTime, 0.05);
    if (this.options.mono) {
      out.channelCount = 1;
      out.channelCountMode = 'explicit';
      out.channelInterpretation = 'speakers';
    } else {
      out.channelCount = 2;
      out.channelCountMode = 'max';
    }
  }

  /** A MediaStream of everything you hear, for the recorder. */
  getRecordStream() {
    this.ensure();
    if (!this.ctx.createMediaStreamDestination) return null;
    if (!this.nodes.recordTap) {
      this.nodes.recordTap = this.ctx.createMediaStreamDestination();
      this.nodes.out.connect(this.nodes.recordTap);
    }
    return this.nodes.recordTap.stream;
  }
}

function makeDriveCurve(amount) {
  const n = 2048;
  const curve = new Float32Array(n);
  const drive = 1 + amount * 24;
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

function makeImpulse(ctx, seconds, decay) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const fadeIn = Math.min(1, i / (rate * 0.008));
      data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay * fadeIn;
    }
  }
  return buf;
}
