# Musix — a friendly synth

Musix is a synthesizer that runs in your browser and is built to be fun for
everyone, whether you've never touched an instrument or you play every day.
It has no dependencies and no build step: open it and play.

```bash
npm start          # serves the app at http://localhost:5173
npm test           # unit tests (Node's built-in test runner)
npm run check      # tests + syntax check of every module
```

Any static file server works too (`python3 -m http.server`), and so does
GitHub Pages: publish the repository root.

## What you can do

**Play**
- **On-screen piano**: multi-touch, drag across keys to glide between notes, and
  strike nearer the front of a key for a louder note.
- **Computer keyboard**: `A`–`;` for white keys, `W E T Y U O P` for sharps,
  `Z`/`X` to change octave. It uses physical key positions, so it works on
  AZERTY and QWERTZ layouts too, and shows the real letters where the browser
  can tell.
- **MIDI keyboards**: velocity, mod wheel (wobble), CC 74 (brightness), and
  sustain pedal (hold). Permission is only requested when you click *Connect*.

**Shape the sound** in the *Sound lab*: 8 presets, 4 wave shapes and 12 knobs.
Each knob has a friendly name with the real synth term next to it (Brightness ·
filter cutoff, Tail · release), and Musi the mascot explains what it does when
you hover or focus it. *Surprise me* builds a random sound that still sounds
good and gives it a silly name. *Save* keeps your own sounds.

**Unique features**
- **Scale lock**: notes outside the scale snap to the nearest scale note, so
  nothing sounds wrong. Out-of-scale keys are striped, so you can see the scale
  without relying on colour.
- **Chord buddy**: one key plays a whole chord. With a scale lock on, the chords
  follow the scale. The screen names what you're playing ("D minor").
- **Arpeggiator**: up, down, bounce, random or in the order you played,
  locked to the tempo. Combine it with *Hold* and the notes keep dancing.
- **Beat garden**: a 16-step drum machine (kick, snare, clap, hi-hat, cowbell)
  with starter patterns, random grooves and drag-to-paint.
- **Magic pad**: an XY pad. *Play notes* works like a theremin that always stays
  in your scale; *Shape sound* morphs brightness and space together.
- **Word melody**: type anything (your name, a word, emoji, any script) and hear
  it as a tune in your current scale. Vowels sing longer, spaces take a breath,
  and the tune always resolves home.
- **Copycat**: an ear-training game. Musi plays a short tune and you play it
  back, with one more note each round.
- **Recorder**: captures everything you hear into an audio file you can download.
- **Share codes and links**: a whole sound fits into a short code
  (`mx1.…`) that you can paste or send as a link.
- **Musi the mascot** sings along: it changes colour with each note and opens its
  mouth with the volume.
- **Note colours** follow the Boomwhacker convention used in music classrooms,
  and note names can be letters (C D E) or fixed-do solfège (Do Re Mi).

## Accessibility

Accessibility is a core feature, not an add-on. Everything under **Comfort**
is remembered on your device.

| Need | What Musix does |
| --- | --- |
| Keyboard only | Every control is reachable. The piano, beat grid and tabs each take one Tab stop and use arrow keys inside. Knobs follow the ARIA slider pattern (arrows, Page Up/Down, Home/End). A skip link jumps straight to the keys. `?` lists all shortcuts. |
| Screen readers | Real buttons, labels and live regions. Keys announce "C sharp 4", knobs announce "1.2 kilohertz" and explain what they do. An optional setting announces the notes and chords you play. |
| Motor | **Hold** turns notes into tap-on/tap-off, so you never need to keep a key held. **Big keys** shows fewer, larger keys. Main controls are at least 44 px and nothing is smaller than the 24 px minimum (WCAG 2.5.8). Single-key shortcuts can be switched off (WCAG 2.1.4). |
| Low vision | High-contrast mode (also follows the system setting), three text sizes, light and dark themes, an extra-readable font option, strong focus rings, and Windows High Contrast (forced colours) support. |
| Colour vision | Colour is never the only signal: notes are labelled, out-of-scale keys are striped, and active beats show a dot. |
| Deaf and hard of hearing | A visual beat flash (kept under 3 flashes a second), the visualizer, the mascot and lit keys show what's sounding. Phones that support vibration can buzz on each touch. |
| Hearing safety | A built-in limiter and an adjustable loudness limit. **Mono audio** sends the same sound to both ears. |
| Motion sensitivity | Respects `prefers-reduced-motion`, with a manual *Calm* option that stops the bouncing and floating bubbles. |

The app is checked with axe-core (WCAG 2.2 AA and best-practice rules) in
light, dark and high-contrast themes, every dialog and tab, and at phone width.

## How it's built

Plain HTML, CSS and ES modules on the Web Audio API.

```
index.html            page structure and dialogs
src/main.js           wires state, audio and UI together
src/performer.js      routes every input through scale lock, chords, arpeggio, hold
src/audio/            engine (effects and limiter), synth voices, drum kit,
                      look-ahead clock (runs in a Worker so background tabs keep time),
                      recorder
src/music/            pure music logic: scales, chords, arpeggios, word melodies
src/state/            parameters, presets, patch validation, share codes, beat patterns
src/ui/               knob, piano, screen and mascot, beat grid, magic pad, games, panels
src/input/            computer keyboard and MIDI
src/styles/           design tokens (themes, contrast) and component styles
tests/                unit tests for everything in src/music and src/state
```

Each synth voice uses two detuned oscillators plus an optional sub oscillator,
a resonant low-pass filter with its own envelope, an ADSR amp envelope and a
vibrato LFO that fades in. Voices go through distortion, a tempo-synced
dotted-eighth delay and a generated reverb, then through a limiter.

Share codes are treated as untrusted input: every value is clamped and
validated before it reaches the audio engine, and names are only ever
rendered as text.
