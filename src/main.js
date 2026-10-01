// Musix — wires the audio engine, state and UI together.

import { AudioEngine } from './audio/engine.js';
import { Synth } from './audio/synth.js';
import { DrumKit } from './audio/drums.js';
import { Clock } from './audio/clock.js';
import { Performer, describeHeld } from './performer.js';
import { createStore, storage, persist } from './state/store.js';
import { PRESETS } from './state/presets.js';
import { sanitizePatch, randomPatch } from './state/patch.js';
import { PARAMS, PARAM_GROUPS } from './state/params.js';
import { encodePatch, decodePatch, shareUrl, patchFromHash } from './state/share.js';
import { BEAT_PRESETS, clonePattern, randomPattern, serializePattern, parsePattern } from './state/beats.js';
import { SCALES, CHORD_TYPES, LETTER_NAMES, SOLFEGE_NAMES, getScale, noteLabel, stepInScale } from './music/theory.js';
import { ARP_MODES, ARP_RATES } from './music/arp.js';
import { h, $, announce, toast, copyText } from './ui/dom.js';
import { createKnob } from './ui/knob.js';
import { PianoKeyboard } from './ui/keyboard.js';
import { Stage } from './ui/stage.js';
import { BeatGarden } from './ui/sequencer.js';
import { MagicPad } from './ui/xyPad.js';
import { WordMelody, Copycat } from './ui/games.js';
import { setupTabs, setupDialog, RecorderPanel, bindSettingsForm, applyLook, DEFAULT_SETTINGS } from './ui/panels.js';
import { ComputerKeys } from './input/computerKeys.js';
import { MidiInput } from './input/midi.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// ---------- Settings ----------
const ENUMS = {
  theme: ['system', 'light', 'dark'],
  contrast: ['system', 'standard', 'more'],
  motion: ['system', 'reduce', 'full'],
  textSize: ['default', 'large', 'larger'],
  noteNames: ['letters', 'solfege'],
};

function sanitizeSettings(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    const v = raw[key];
    if (typeof v !== typeof def) continue;
    if (ENUMS[key] && !ENUMS[key].includes(v)) continue;
    out[key] = key === 'maxVolume' ? clamp(v, 0.1, 1) : v;
  }
  return out;
}

const settings = createStore({ ...DEFAULT_SETTINGS, ...sanitizeSettings(storage.load('settings', {})) });
persist(settings, 'settings', (s) => s, 50);

// ---------- App state ----------
const saved = storage.load('app', {}) || {};
const shared = patchFromHash(location.hash);
const mySounds = Array.isArray(saved.mySounds)
  ? saved.mySounds
      .filter((s) => s && typeof s.id === 'string')
      .slice(0, 12)
      .map((s) => ({ id: s.id.slice(0, 40), patch: sanitizePatch(s.patch) }))
  : [];

const app = createStore({
  patch: shared || (saved.patch ? sanitizePatch(saved.patch) : PRESETS[0].patch),
  presetId: shared ? null : typeof saved.presetId === 'string' ? saved.presetId : 'hello',
  edited: shared ? false : Boolean(saved.edited),
  scaleId: SCALES[saved.scaleId] ? saved.scaleId : 'chromatic',
  root: Number.isInteger(saved.root) ? clamp(saved.root, 0, 11) : 0,
  chord: CHORD_TYPES[saved.chord] ? saved.chord : 'off',
  arp: ARP_MODES[saved.arp] ? saved.arp : 'off',
  arpRate: ARP_RATES[saved.arpRate] ? String(saved.arpRate) : '8',
  hold: false,
  bpm: clamp(Math.round(num(saved.bpm, 108)), 60, 180),
  beatRows: parsePattern(saved.beatRows) || clonePattern(BEAT_PRESETS.fourFloor.rows),
  beatPreset: typeof saved.beatPreset === 'string' && (BEAT_PRESETS[saved.beatPreset] || saved.beatPreset === '') ? saved.beatPreset : 'fourFloor',
  beatLevel: clamp(num(saved.beatLevel, 0.8), 0, 1),
  mySounds,
  vizMode: saved.vizMode === 'bars' ? 'bars' : 'wave',
});

persist(app, 'app', (s) => ({
  patch: s.patch,
  presetId: s.presetId,
  edited: s.edited,
  scaleId: s.scaleId,
  root: s.root,
  chord: s.chord,
  arp: s.arp,
  arpRate: s.arpRate,
  bpm: s.bpm,
  beatRows: serializePattern(s.beatRows),
  beatPreset: s.beatPreset,
  beatLevel: s.beatLevel,
  mySounds: s.mySounds,
  vizMode: s.vizMode,
}));

const getPlay = () => {
  const s = app.get();
  return {
    scaleId: s.scaleId,
    root: s.root,
    chord: s.chord,
    arp: s.arp,
    arpRate: s.arpRate,
    arpOctaves: 1,
    hold: s.hold,
    octave: s.patch.octave,
  };
};
const getNames = () => settings.get().noteNames;

// ---------- Audio ----------
const engine = new AudioEngine();
engine.setOptions({ maxVolume: settings.get().maxVolume, mono: settings.get().mono });
engine.setDrumLevel(app.get().beatLevel);
const synth = new Synth(engine);
synth.setPatch(app.get().patch);
const clock = new Clock(engine);
clock.setBpm(app.get().bpm);
const drums = new DrumKit(engine);
const performer = new Performer({ engine, synth, clock, getPlay });

// Browsers only allow sound after a gesture, so wake the engine on the first one.
const unlock = (e) => {
  if (e.target?.closest?.('#power')) return;
  engine.ensure();
};
for (const type of ['pointerdown', 'keydown', 'touchend']) {
  document.addEventListener(type, unlock, { capture: true, passive: true });
}

const power = $('#power');
function renderPower() {
  const on = engine.running;
  power.classList.toggle('is-on', on);
  power.querySelector('.power__label').textContent = on
    ? 'Sound on'
    : engine.ctx
      ? 'Sound paused · tap to resume'
      : 'Tap to wake the sound';
}
power.addEventListener('click', () => {
  if (engine.running) {
    performer.panic();
    engine.ctx.suspend();
    announce('Sound paused');
  } else {
    engine.ensure();
    announce('Sound on');
  }
});
engine.addEventListener('statechange', renderPower);
engine.addEventListener('ready', renderPower);

// ---------- Patch helpers ----------
function updatePatch(partial, { edited = true } = {}) {
  app.set({ patch: { ...app.get().patch, ...partial }, ...(edited ? { edited: true } : {}) });
}

function loadPatch(patch, presetId, { keepVolume = true } = {}) {
  const current = app.get().patch;
  app.set({
    patch: keepVolume ? { ...patch, volume: current.volume } : patch,
    presetId,
    edited: false,
  });
}

function allSounds() {
  return [...PRESETS, ...app.get().mySounds];
}

function demoSound() {
  // A quick rising arpeggio so you hear a new sound straight away.
  const { root, octave } = getPlay();
  const base = 60 + root + octave * 12;
  [0, 2, 4, 7].forEach((deg, i) => {
    const midi = stepInScale(base, deg, root, 'major');
    performer.playOneShot(midi, { when: engine.now + 0.05 + i * 0.13, duration: 0.22, velocity: 0.75 });
  });
}

// ---------- Sound lab ----------
const presetsEl = $('#presets');
// Chips are rebuilt only when the list changes, so focus never jumps away mid-click.
function syncPresetPressed() {
  const { presetId } = app.get();
  for (const btn of presetsEl.querySelectorAll('.preset')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.id === presetId));
  }
}

function renderPresets() {
  const { presetId, mySounds: mine } = app.get();
  const chip = (id, patch) =>
    h('button', {
      type: 'button',
      class: 'preset',
      dataset: { id },
      'aria-pressed': String(id === presetId),
      onclick: () => {
        loadPatch(patch, id);
        demoSound();
        announce(`${patch.name} loaded`);
      },
    },
    h('span', { class: 'preset__emoji', 'aria-hidden': 'true' }, patch.emoji),
    patch.name);
  const nodes = PRESETS.map((p) => chip(p.id, p.patch));
  if (mine.length) {
    nodes.push(h('span', { class: 'presets__divider' }, 'Your saved sounds'));
    for (const s of mine) {
      nodes.push(h('span', { class: 'saved' },
        chip(s.id, s.patch),
        h('button', {
          type: 'button',
          class: 'saved__remove',
          'aria-label': `Delete ${s.patch.name}`,
          onclick: () => {
            app.set({ mySounds: app.get().mySounds.filter((x) => x.id !== s.id), ...(presetId === s.id ? { presetId: null } : {}) });
            toast(`${s.patch.name} deleted`);
            $('#save-sound').focus();
          },
        }, '×')));
    }
  }
  presetsEl.replaceChildren(...nodes);
}

$('#surprise').addEventListener('click', () => {
  const patch = randomPatch(Math.random, app.get().patch);
  loadPatch(patch, null);
  demoSound();
  toast(`${patch.emoji} Say hi to ${patch.name}!`);
});

$('#save-sound').addEventListener('click', () => {
  const { patch, presetId, edited, mySounds: mine } = app.get();
  const builtIn = PRESETS.some((p) => p.id === presetId);
  if (!edited && (builtIn || mine.some((s) => s.id === presetId))) {
    toast('That sound is already in your list. Turn a knob first to make it your own.');
    return;
  }
  const name = builtIn && !patch.name.endsWith('remix') ? `${patch.name} remix`.slice(0, 40) : patch.name;
  const entry = { id: `my-${Date.now().toString(36)}`, patch: { ...patch, name } };
  app.set({ mySounds: [...mine, entry].slice(-12), presetId: entry.id, patch: entry.patch, edited: false });
  toast(`Saved “${name}”`);
});

const knobs = {};
// Musi explains each knob in the speech bubble (screen readers get the same text via aria-describedby).
function showHint(spec) {
  stage.setTip(`${spec.label} (${spec.tech.toLowerCase()}): ${spec.hint}`, { hold: 12000 });
}
$('#knobs').append(
  ...PARAM_GROUPS.map((group) => {
    const grid = h('div', { class: 'knob-group__grid' });
    for (const key of group.keys) {
      const knob = createKnob({
        key,
        spec: PARAMS[key],
        value: app.get().patch[key],
        onChange: (v) => updatePatch({ [key]: v }),
        onHint: showHint,
      });
      knobs[key] = knob;
      grid.append(knob.el);
    }
    return h('div', { class: 'knob-group', role: 'group', 'aria-labelledby': `group-${group.id}`, style: { '--group': `var(--${group.id})` } },
      h('h3', { class: 'knob-group__title', id: `group-${group.id}` }, group.label),
      grid);
  }),
);

const waveInputs = [...document.querySelectorAll('input[name="wave"]')];
for (const input of waveInputs) {
  input.addEventListener('change', () => {
    if (input.checked) updatePatch({ wave: input.value });
  });
}

// ---------- Play bar ----------
const scaleSel = $('#scale');
const rootSel = $('#root');
const chordSel = $('#chord');
const arpSel = $('#arp');
const arpRateSel = $('#arp-rate');
const option = (value, label) => h('option', { value }, label);

scaleSel.append(...Object.entries(SCALES).map(([id, s]) => option(id, id === 'chromatic' ? 'Off' : `${s.name} · ${s.mood}`)));
chordSel.append(...Object.entries(CHORD_TYPES).map(([id, c]) => option(id, c.name)));
arpSel.append(...Object.entries(ARP_MODES).map(([id, m]) => option(id, m.name)));
arpRateSel.append(...Object.entries(ARP_RATES).map(([id, r]) => option(id, r.name)));
function renderRootOptions() {
  const names = getNames() === 'solfege' ? SOLFEGE_NAMES : LETTER_NAMES;
  rootSel.replaceChildren(...names.map((n, i) => option(String(i), n)));
  rootSel.value = String(app.get().root);
}
renderRootOptions();

scaleSel.addEventListener('change', () => {
  app.set({ scaleId: scaleSel.value });
  announce(scaleSel.value === 'chromatic' ? 'Scale lock off' : `Scale lock: ${getScale(scaleSel.value).name}`);
});
rootSel.addEventListener('change', () => app.set({ root: Number(rootSel.value) }));
chordSel.addEventListener('change', () => app.set({ chord: chordSel.value }));
arpSel.addEventListener('change', () => app.set({ arp: arpSel.value }));
arpRateSel.addEventListener('change', () => app.set({ arpRate: arpRateSel.value }));

function setOctave(delta) {
  const next = clamp(app.get().patch.octave + delta, -2, 2);
  if (next === app.get().patch.octave) {
    toast(delta > 0 ? 'That’s the highest octave' : 'That’s the lowest octave');
    return;
  }
  updatePatch({ octave: next }, { edited: false });
}
$('#octave-down').addEventListener('click', () => setOctave(-1));
$('#octave-up').addEventListener('click', () => setOctave(1));

const holdBtn = $('#hold');
function toggleHold() {
  const hold = !app.get().hold;
  app.set({ hold });
  announce(hold ? 'Hold on: tap a key to start a note, tap again to stop it' : 'Hold off');
}
holdBtn.addEventListener('click', toggleHold);

function panic() {
  performer.panic();
  keyboard.resetLights();
  announce('All sound stopped');
}
$('#panic').addEventListener('click', panic);

// ---------- Inputs ----------
const computerKeys = new ComputerKeys({
  performer,
  getState: () => ({ computerKeys: settings.get().computerKeys, octave: app.get().patch.octave }),
  onAction: (action) => {
    switch (action) {
      case 'panic': return panic();
      case 'help': return helpDialog.open();
      case 'hold': return toggleHold();
      case 'beat': return toggleBeat();
      case 'octaveDown': return setOctave(-1);
      case 'octaveUp': return setOctave(1);
      case 'prevSound':
      case 'nextSound': return stepSound(action === 'nextSound' ? 1 : -1);
      case 'layout': return keyboard?.refresh();
      default: return undefined;
    }
  },
});

function stepSound(dir) {
  const list = allSounds();
  const idx = list.findIndex((s) => s.id === app.get().presetId);
  const next = list[(idx + dir + list.length) % list.length];
  loadPatch(next.patch, next.id);
  announce(`${next.patch.name}`);
}

const keyboard = new PianoKeyboard({
  root: $('#keys'),
  performer,
  hintFor: (m) => computerKeys.hintFor(m),
  getState: () => {
    const s = app.get();
    const st = settings.get();
    return {
      octave: s.patch.octave,
      scaleId: s.scaleId,
      root: s.root,
      hold: s.hold,
      noteNames: st.noteNames,
      keyHints: st.keyHints,
      computerKeys: st.computerKeys,
      bigKeys: st.bigKeys,
      haptics: st.haptics,
    };
  },
});

$('.skip-link').addEventListener('click', (e) => {
  e.preventDefault();
  keyboard.focus();
});

const midiStatus = $('#midi-status');
const midi = new MidiInput({
  performer,
  onStatus: (text) => {
    midiStatus.textContent = text;
    announce(text);
  },
  onControl: (cc, v) => {
    if (cc === 1) updatePatch({ vibrato: v });
    else if (cc === 74) updatePatch({ cutoff: PARAMS.cutoff.min * (PARAMS.cutoff.max / PARAMS.cutoff.min) ** v });
    else if (cc === 7) updatePatch({ volume: v });
    else if (cc === 64) {
      const hold = v >= 0.5;
      if (hold !== app.get().hold) app.set({ hold });
    } else if (cc === 120 || cc === 123) panic();
  },
});
$('#midi-connect').addEventListener('click', () => midi.connect());

// ---------- Screen ----------
const stage = new Stage({
  engine,
  performer,
  getNames,
  els: {
    canvas: $('#viz'),
    mascot: $('#mascot'),
    mouth: $('#mascot-mouth'),
    tip: $('#mascot-tip'),
    screen: $('.screen'),
  },
});
const vizBtn = $('#viz-mode');
vizBtn.addEventListener('click', () => app.set({ vizMode: app.get().vizMode === 'bars' ? 'wave' : 'bars' }));

const lcd = { sound: $('#lcd-sound'), note: $('#lcd-note'), scale: $('#lcd-scale'), tempo: $('#lcd-tempo') };
let announceTimer = null;
performer.addEventListener('chord', (e) => {
  const { notes } = e.detail;
  if (!notes.length) return;
  const desc = describeHeld(notes, getNames());
  lcd.note.textContent = desc.text;
  if (settings.get().announceNotes) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => announce(desc.spoken), 180);
  }
});
performer.addEventListener('noteon', (e) => {
  if (e.detail.transient && !performer.heldNotes().length) {
    lcd.note.textContent = noteLabel(e.detail.midi, getNames());
  }
});

// ---------- Beat garden ----------
const beatBtn = $('#beat-play');
const garden = new BeatGarden({
  root: $('#beatgrid'),
  clock,
  drums,
  engine,
  getRows: () => app.get().beatRows,
  setRows: (rows) => app.set({ beatRows: rows, beatPreset: '' }),
  onBeat: (beat) => {
    if (!settings.get().beatFlash) return;
    // Keep flashes under 3 per second (WCAG 2.3.1) at fast tempos.
    if (app.get().bpm > 150 && beat % 2 === 1) return;
    stage.flash();
  },
});

function toggleBeat() {
  engine.ensure();
  const play = !garden.playing;
  garden.toggle(play);
  beatBtn.setAttribute('aria-pressed', String(play));
  beatBtn.querySelector('.beat-play__label').textContent = play ? 'Stop beat' : 'Play beat';
  announce(play ? 'Beat playing' : 'Beat stopped');
}
beatBtn.addEventListener('click', toggleBeat);

const tempo = $('#tempo');
const tempoOut = $('#tempo-value');
tempo.value = String(app.get().bpm);
tempo.addEventListener('input', () => app.set({ bpm: Number(tempo.value) }));
tempo.setAttribute('aria-valuetext', `${app.get().bpm} beats per minute`);

const beatLevel = $('#beat-level');
beatLevel.value = String(Math.round(app.get().beatLevel * 100));
beatLevel.addEventListener('input', () => app.set({ beatLevel: Number(beatLevel.value) / 100 }));

const beatPresetSel = $('#beat-preset');
beatPresetSel.append(
  h('option', { value: '', disabled: true }, 'Your own'),
  ...Object.entries(BEAT_PRESETS).map(([id, p]) => option(id, p.name)),
);
beatPresetSel.value = app.get().beatPreset;
beatPresetSel.addEventListener('change', () => {
  const preset = BEAT_PRESETS[beatPresetSel.value];
  if (!preset) return;
  app.set({ beatRows: clonePattern(preset.rows), beatPreset: beatPresetSel.value });
  garden.render();
  announce(`${preset.name} pattern`);
});
$('#beat-random').addEventListener('click', () => {
  app.set({ beatRows: randomPattern(), beatPreset: '' });
  garden.render();
  announce('New random beat');
});

// ---------- Magic pad ----------
const pad = new MagicPad({
  root: $('#xy'),
  performer,
  getPlay,
  getPatch: () => app.get().patch,
  setParams: (p) => updatePatch(p),
  getNames,
});
for (const input of document.querySelectorAll('input[name="pad-mode"]')) {
  input.addEventListener('change', () => input.checked && pad.setMode(input.value));
}

// ---------- Games & tools ----------
setupTabs($('.tabs'));
const words = new WordMelody({
  form: $('#word-form'),
  input: $('#word-input'),
  list: $('#word-notes'),
  button: $('#word-play'),
  performer,
  getPlay,
  getBpm: () => app.get().bpm,
  getNames,
});
new Copycat({
  performer,
  keyboard,
  getPlay,
  getNames,
  els: {
    title: $('#cc-title'),
    msg: $('#cc-msg'),
    dots: $('#cc-dots'),
    round: $('#cc-round'),
    lives: $('#cc-lives'),
    best: $('#cc-best'),
    start: $('#cc-start'),
    replay: $('#cc-replay'),
    show: $('#cc-show'),
  },
});
new RecorderPanel({
  engine,
  els: {
    toggle: $('#rec-toggle'),
    label: $('#rec-label'),
    time: $('#rec-time'),
    takes: $('#takes'),
    help: $('#rec-help'),
  },
});

// ---------- Dialogs ----------
const settingsDialog = setupDialog($('#settings-dialog'));
const helpDialog = setupDialog($('#help-dialog'));
const shareDialog = setupDialog($('#share-dialog'), {
  onOpen: () => {
    const { patch } = app.get();
    $('#share-link').value = shareUrl(location.href, patch);
    $('#share-code').value = encodePatch(patch);
    $('#share-paste').value = '';
    $('#share-error').textContent = '';
  },
});
$('#open-settings').addEventListener('click', () => settingsDialog.open());
$('#open-help').addEventListener('click', () => helpDialog.open());
$('#open-share').addEventListener('click', () => shareDialog.open());

for (const btn of document.querySelectorAll('[data-copy]')) {
  btn.addEventListener('click', async () => {
    const input = document.getElementById(btn.dataset.copy);
    const ok = await copyText(input.value, input);
    toast(ok ? 'Copied! Paste it anywhere.' : 'Selected — press Ctrl+C (or ⌘C) to copy.');
  });
}
$('#share-load').addEventListener('click', () => {
  const patch = decodePatch($('#share-paste').value);
  if (!patch) {
    $('#share-error').textContent = 'That code doesn’t look right. Sound codes start with “mx1.”';
    $('#share-paste').focus();
    return;
  }
  loadPatch(patch, null, { keepVolume: true });
  shareDialog.close();
  demoSound();
  toast(`${patch.emoji} Loaded “${patch.name}”`);
});

bindSettingsForm($('#settings-form'), settings, () => toast('Settings reset'));

const themeBtn = $('#theme-toggle');
themeBtn.addEventListener('click', () => {
  const dark = document.documentElement.dataset.dark === 'true';
  settings.set({ theme: dark ? 'light' : 'dark' });
});

// ---------- Reactions to state ----------
let lastPlay = getPlay();

function renderLcd() {
  const s = app.get();
  lcd.sound.textContent = `${s.patch.emoji} ${s.patch.name}${s.edited ? ' (edited)' : ''}`;
  const names = getNames() === 'solfege' ? SOLFEGE_NAMES : LETTER_NAMES;
  lcd.scale.textContent = s.scaleId === 'chromatic' ? 'Every note' : `${names[s.root]} ${getScale(s.scaleId).name}`;
  lcd.tempo.textContent = `${s.bpm} BPM`;
}

function renderPatchControls() {
  const { patch } = app.get();
  for (const [key, knob] of Object.entries(knobs)) knob.set(patch[key]);
  for (const input of waveInputs) input.checked = input.value === patch.wave;
  $('#octave-value').textContent = patch.octave > 0 ? `+${patch.octave}` : String(patch.octave);
}

function renderPlayControls() {
  const s = app.get();
  scaleSel.value = s.scaleId;
  rootSel.value = String(s.root);
  chordSel.value = s.chord;
  arpSel.value = s.arp;
  arpRateSel.value = s.arpRate;
  arpRateSel.disabled = s.arp === 'off';
  holdBtn.setAttribute('aria-pressed', String(s.hold));
  vizBtn.setAttribute('aria-pressed', String(s.vizMode === 'bars'));
  stage.setMode(s.vizMode);
}

app.subscribe((s, changed) => {
  if ('patch' in changed) {
    synth.setPatch(s.patch);
    renderPatchControls();
    if (changed.patch.octave !== lastPlay.octave) keyboard.layout();
  }
  if ('mySounds' in changed) renderPresets();
  else if ('presetId' in changed) syncPresetPressed();
  if ('bpm' in changed) {
    clock.setBpm(s.bpm);
    tempoOut.textContent = String(s.bpm);
    tempo.setAttribute('aria-valuetext', `${s.bpm} beats per minute`);
  }
  if ('beatLevel' in changed) engine.setDrumLevel(s.beatLevel);
  if ('beatPreset' in changed) beatPresetSel.value = s.beatPreset;
  if ('scaleId' in changed || 'root' in changed) {
    keyboard.refresh();
    words.preview();
  }
  const play = getPlay();
  if (play.arp !== lastPlay.arp || play.hold !== lastPlay.hold) performer.refresh(lastPlay, play);
  lastPlay = play;
  renderPlayControls();
  renderLcd();
});

settings.subscribe((s, changed) => {
  const { dark } = applyLook(s);
  themeBtn.setAttribute('aria-label', dark ? 'Use light theme' : 'Use dark theme');
  engine.setOptions({ maxVolume: s.maxVolume, mono: s.mono });
  if ('noteNames' in changed) {
    renderRootOptions();
    renderLcd();
    words.preview();
  }
  keyboard.layout();
  stage.themeChanged();
  pad.themeChanged();
});

for (const q of ['(prefers-color-scheme: dark)', '(prefers-contrast: more)', '(prefers-reduced-motion: reduce)']) {
  window.matchMedia?.(q).addEventListener?.('change', () => {
    const { dark } = applyLook(settings.get());
    themeBtn.setAttribute('aria-label', dark ? 'Use light theme' : 'Use dark theme');
    stage.themeChanged();
    pad.themeChanged();
  });
}

// ---------- First paint ----------
{
  const { dark } = applyLook(settings.get());
  themeBtn.setAttribute('aria-label', dark ? 'Use light theme' : 'Use dark theme');
  stage.themeChanged();
  renderPresets();
  renderPatchControls();
  renderPlayControls();
  renderLcd();
  tempoOut.textContent = String(app.get().bpm);
  renderPower();
}

function applySharedFromHash() {
  const patch = patchFromHash(location.hash);
  if (!patch) return;
  loadPatch(patch, null);
  history.replaceState(null, '', location.pathname + location.search);
  stage.setTip(`Someone shared “${patch.name}” with you. Press a key to hear it!`);
  toast(`${patch.emoji} Loaded a shared sound: ${patch.name}`);
}
if (shared) applySharedFromHash();
window.addEventListener('hashchange', applySharedFromHash);

// Handy for debugging in the console.
window.musix = { engine, synth, performer, app, settings };
