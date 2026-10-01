// Web MIDI input. Only asks for permission when the person clicks "Connect".

export class MidiInput {
  constructor({ performer, onStatus, onControl }) {
    this.performer = performer;
    this.onStatus = onStatus;
    this.onControl = onControl;
    this.access = null;
  }

  static get supported() {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  async connect() {
    if (!MidiInput.supported) {
      this.onStatus('This browser can’t use MIDI. Try Chrome, Edge or Firefox.', false);
      return;
    }
    try {
      this.access = await navigator.requestMIDIAccess();
      this.access.onstatechange = () => this._bind();
      this._bind();
    } catch {
      this.onStatus('MIDI access was blocked. You can allow it in the browser’s site settings.', false);
    }
  }

  _bind() {
    const inputs = [...this.access.inputs.values()];
    for (const input of inputs) input.onmidimessage = (msg) => this._message(msg.data);
    if (!inputs.length) {
      this.onStatus('No MIDI keyboard found. Plug one in — it will connect automatically.', false);
      return;
    }
    const names = inputs.map((i) => i.name).filter(Boolean).join(', ');
    this.onStatus(`MIDI connected: ${names || `${inputs.length} device(s)`}`, true);
  }

  _message(data) {
    const [status, d1 = 0, d2 = 0] = data;
    const cmd = status & 0xf0;
    if (cmd === 0x90 && d2 > 0) this.performer.press('midi', d1, d2 / 127);
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) this.performer.release('midi', d1);
    else if (cmd === 0xb0) this.onControl(d1, d2 / 127);
  }
}
