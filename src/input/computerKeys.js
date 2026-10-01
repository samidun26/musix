// Play notes from the computer keyboard, using physical key positions
// (event.code) so the layout works on QWERTY, AZERTY, QWERTZ and others.

export const NOTE_KEYS = [
  ['KeyA', 0, 'A'], ['KeyW', 1, 'W'], ['KeyS', 2, 'S'], ['KeyE', 3, 'E'],
  ['KeyD', 4, 'D'], ['KeyF', 5, 'F'], ['KeyT', 6, 'T'], ['KeyG', 7, 'G'],
  ['KeyY', 8, 'Y'], ['KeyH', 9, 'H'], ['KeyU', 10, 'U'], ['KeyJ', 11, 'J'],
  ['KeyK', 12, 'K'], ['KeyO', 13, 'O'], ['KeyL', 14, 'L'], ['KeyP', 15, 'P'],
  ['Semicolon', 16, ';'], ['Quote', 17, "'"],
];

const BY_CODE = new Map(NOTE_KEYS.map(([code, offset]) => [code, offset]));
export const BASE_MIDI = 60; // the A key plays middle C at octave 0

function isTypingTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    return !['range', 'checkbox', 'radio', 'button', 'submit'].includes(el.type);
  }
  return false;
}

export class ComputerKeys {
  /**
   * @param {{performer: any, getState: () => {computerKeys: boolean, octave: number},
   *          onAction: (name: string) => void}} deps
   */
  constructor({ performer, getState, onAction }) {
    this.performer = performer;
    this.getState = getState;
    this.onAction = onAction;
    this.down = new Map(); // code -> midi actually played
    this.labels = new Map(NOTE_KEYS.map(([code, , label]) => [code, label]));

    window.addEventListener('keydown', (e) => this._down(e));
    window.addEventListener('keyup', (e) => this._up(e));
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
    this._loadLayout();
  }

  /** Show the real printed letter for each key position where the browser can tell us. */
  async _loadLayout() {
    try {
      const map = await navigator.keyboard?.getLayoutMap?.();
      if (!map) return;
      for (const [code] of NOTE_KEYS) {
        const label = map.get(code);
        if (label) this.labels.set(code, label.toUpperCase());
      }
      this.onAction('layout');
    } catch {
      /* not supported: QWERTY labels it is */
    }
  }

  /** Which computer key plays this note right now (or '' if none). */
  hintFor(midi) {
    const offset = midi - (BASE_MIDI + this.getState().octave * 12);
    const entry = NOTE_KEYS.find(([, o]) => o === offset);
    return entry ? this.labels.get(entry[0]) || entry[2] : '';
  }

  releaseAll() {
    for (const midi of this.down.values()) this.performer.release('computer', midi);
    this.down.clear();
  }

  _down(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') {
      this.onAction('panic');
      return;
    }
    if (isTypingTarget(e.target)) return;
    const state = this.getState();
    // Single-key shortcuts can be switched off (WCAG 2.1.4), together with note keys.
    if (!state.computerKeys) return;

    if (e.key === '?') {
      e.preventDefault();
      this.onAction('help');
      return;
    }
    if (e.shiftKey) {
      if (e.code === 'KeyH') this.onAction('hold');
      else if (e.code === 'KeyB') this.onAction('beat');
      else return;
      e.preventDefault();
      return;
    }
    const shortcuts = { KeyZ: 'octaveDown', KeyX: 'octaveUp', BracketLeft: 'prevSound', BracketRight: 'nextSound' };
    if (shortcuts[e.code]) {
      e.preventDefault();
      if (!e.repeat) this.onAction(shortcuts[e.code]);
      return;
    }
    if (!BY_CODE.has(e.code)) return;
    e.preventDefault();
    if (e.repeat || this.down.has(e.code)) return;
    const midi = BASE_MIDI + state.octave * 12 + BY_CODE.get(e.code);
    this.down.set(e.code, midi);
    this.performer.press('computer', midi, 0.8);
  }

  _up(e) {
    const midi = this.down.get(e.code);
    if (midi == null) return;
    this.down.delete(e.code);
    this.performer.release('computer', midi);
  }
}
