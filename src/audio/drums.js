// A tiny drum machine built from oscillators and noise. No samples to load.

export class DrumKit {
  constructor(engine) {
    this.engine = engine;
    this.noise = null;
  }

  _noiseBuffer(ctx) {
    if (!this.noise) {
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  play(id, when, velocity = 1) {
    const ctx = this.engine.ensure();
    const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
    const out = this.engine.nodes.drumIn;
    const v = Math.max(0.05, Math.min(1, velocity));
    switch (id) {
      case 'kick':
        return this._kick(ctx, out, t, v);
      case 'snare':
        return this._snare(ctx, out, t, v);
      case 'clap':
        return this._clap(ctx, out, t, v);
      case 'hat':
        return this._hat(ctx, out, t, v);
      case 'bell':
        return this._bell(ctx, out, t, v);
      default:
        return undefined;
    }
  }

  _env(ctx, t, peak, decay, attack = 0.002) {
    const g = new GainNode(ctx, { gain: 0.0001 });
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  _noise(ctx, t, dur) {
    const src = new AudioBufferSourceNode(ctx, { buffer: this._noiseBuffer(ctx) });
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur);
    return src;
  }

  _kick(ctx, out, t, v) {
    const osc = new OscillatorNode(ctx, { type: 'sine' });
    osc.frequency.setValueAtTime(165, t);
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.14);
    const env = this._env(ctx, t, 0.95 * v, 0.42, 0.003);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  _snare(ctx, out, t, v) {
    const noise = this._noise(ctx, t, 0.25);
    const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 1300 });
    const nEnv = this._env(ctx, t, 0.55 * v, 0.17);
    noise.connect(hp).connect(nEnv).connect(out);
    const tone = new OscillatorNode(ctx, { type: 'triangle', frequency: 190 });
    const tEnv = this._env(ctx, t, 0.35 * v, 0.09);
    tone.connect(tEnv).connect(out);
    tone.start(t);
    tone.stop(t + 0.15);
  }

  _clap(ctx, out, t, v) {
    const noise = this._noise(ctx, t, 0.3);
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1500, Q: 0.9 });
    const g = new GainNode(ctx, { gain: 0.0001 });
    // Three quick bursts, then a short tail — hands don't clap in perfect unison.
    for (const [i, off] of [0, 0.011, 0.023].entries()) {
      g.gain.setValueAtTime(0.0001, t + off);
      g.gain.exponentialRampToValueAtTime(0.7 * v * (1 - i * 0.12), t + off + 0.002);
      g.gain.exponentialRampToValueAtTime(0.05, t + off + 0.01);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    noise.connect(bp).connect(g).connect(out);
  }

  _hat(ctx, out, t, v) {
    const noise = this._noise(ctx, t, 0.08);
    const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 7500 });
    const env = this._env(ctx, t, 0.32 * v, 0.045, 0.001);
    noise.connect(hp).connect(env).connect(out);
  }

  _bell(ctx, out, t, v) {
    // The classic drum-machine cowbell: two square waves through a band-pass.
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 2600, Q: 1.2 });
    const env = this._env(ctx, t, 0.4 * v, 0.33, 0.002);
    for (const f of [540, 800]) {
      const o = new OscillatorNode(ctx, { type: 'square', frequency: f });
      o.connect(bp);
      o.start(t);
      o.stop(t + 0.4);
    }
    bp.connect(env).connect(out);
  }
}
