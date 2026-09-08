# MidiSheet — Real-Time Web MIDI Sheet Music & Grand Staff

A modern, zero-dependency web application that accepts Web MIDI hardware input (or virtual/computer keyboard input) and renders notes on a Grand Staff (Treble and Bass clefs) in real time with chord detection, a scrolling timeline, an interactive virtual piano, and a polyphonic synthesizer.

---

## Features

- **Interactive Melody Trainer & Accuracy Assessment**:
  - Library of **10 curated melody snippets** across varying difficulty levels:
    1. *Ode to Joy* (L. van Beethoven) — Easy (C Major)
    2. *Twinkle, Twinkle, Little Star* (Traditional) — Easy (C Major)
    3. *Mary Had a Little Lamb* (Traditional) — Easy (C Major)
    4. *Jingle Bells (Chorus)* (J. Pierpont) — Easy (C Major)
    5. *Happy Birthday* (Traditional) — Medium (3/4 time)
    6. *When the Saints Go Marching In* (Traditional) — Medium (C Major)
    7. *Für Elise (Theme Motif)* (L. van Beethoven) — Medium (A Minor with D#5)
    8. *Canon in D (Theme)* (J. Pachelbel) — Medium (D Major with F#4 & C#4)
    9. *Bach Minuet in G (Opening)* (J.S. Bach) — Medium (3/4 time)
    10. *Scarborough Fair* (Traditional) — Advanced (D Dorian mode)
  - **Full Mistake Inspection & Review (VST3 Parity)**:
    - Interactive callout cards appear above mistake notes on the Grand Staff showing expected target vs played wrong pitch and attempt counts.
    - Scorewide mistake badges, canvas `<` / `>` cycling buttons, and clickable note hitboxes.
    - Dual-key visual piano highlighting (`Target` in emerald green, `Played` in rose red) with auto-centering.
    - Post-performance scorecard with "Review Mistakes on Sheet" button and clickable note breakdown list.
  - **Dedicated Live MIDI `INPUT` Column**: Live played notes render cleanly in an isolated column to the left of upcoming melody notes, eliminating visual overlap.
  - **Inter-Onset Rhythm Evaluation**: Natural musical rhythm assessment in Wait mode (matching C++ `MelodyScorer.cpp`) with phrase anchoring on Note 0 and metronome grid sync.
  - **Classical Note Engraving**: Vector augmentation dots with automatic staff-line collision avoidance and curved Bezier eighth/sixteenth note flags.
  - **"🔇 No Sound (Hardware / EWI Audio)" Preset**: Built-in option to mute the internal synth for players using hardware sound generators (e.g. EWI5000, Yamaha YDS, digital pianos) while maintaining full visual notation and scoring.
  - **Two Practice Modes**:
    - *Wait for Note (Learn Mode)*: Pauses until the correct note is played before advancing.
    - *In-Tempo (Challenge Mode)*: Evaluates performance rhythm and speed against an ongoing timeline.
  - **Performance Scorecard**: Awards 1, 2, or 3 glowing stars with detailed feedback at the end of each melody.
- **Real-Time Grand Staff Notation**:
  - Crisp vector Treble Clef and Bass Clef rendering on an HTML5 canvas with HiDPI/Retina support.
  - Automatic clef routing: Notes $\ge \text{C4}$ (MIDI 60) on Treble, notes $< \text{C4}$ on Bass.
  - Mathematically accurate ledger lines dynamically drawn above and below both staves (e.g. Middle C, A5, C6, E2, C2).
  - Musical accidentals (♯ Sharps / ♭ Flats) toggleable with note name tags.
  - Velocity-sensitive notehead glows and pulse animations.
- **Dual Visualizer Modes**:
  1. **Live Grand Staff**: Instantaneous chord/note display showing held keys with harmonized stems and notehead collision prevention.
  2. **Scrolling Sheet Timeline**: Continuous horizontal sheet music roll that transcribes notes with real-time duration bars moving past a playhead.
- **Real-Time Chord Recognition**:
  - Automatically identifies root notes, chord qualities, inversions, and slash chords (e.g., *C Major 7*, *A Minor / C*, *G7*, *F#dim*, *Dsus4*).
  - Displays interval names for two-note intervals and cluster details for complex harmonies.
- **Web MIDI API Hardware Integration**:
  - Native plug-and-play support for USB and Bluetooth MIDI keyboards/controllers.
  - Hot-plugging: Automatically detects when MIDI controllers are plugged in or disconnected.
  - Device input selector and channel monitoring.
  - Full Damper / Sustain Pedal (MIDI CC #64) support.
  - Built-in collapsible MIDI Event Stream Inspector showing raw hex bytes, status, and velocity.
- **Built-in Polyphonic Sound Engine (Web Audio API)**:
  - 9 instrument presets:
    - **Acoustic Grand Piano**: Additive multi-harmonic synthesis with hammer-strike filter and natural acoustic decay.
    - **Electric Piano (Rhodes)**: Bell-like FM chime with warm body.
    - **Synth Strings / Pad**: Warm dual detuned oscillators with smooth attack.
    - **Drawbar Organ**: Classic tonewheel simulation with key click.
    - **Concert Flute**: Pure singing fundamental with authentic breath chiff and embouchure noise.
    - **Clarinet (Woodwind)**: Cylindrical bore acoustics with prominent odd harmonics and warm woody resonance.
    - **Tenor Saxophone**: Conical bore acoustics with body formant filter and expressive reed bite.
    - **Brass / Trumpet**: Dual detuned sawtooth waves with dynamic filter envelope sweep.
    - **EWI Analog Lead**: Iconic Michael Brecker-style analog wind synthesizer with singing resonant filter.
  - **External Sound Card & Audio Interface Routing**: Direct output selection (`setSinkId`) allowing routing to USB audio interfaces (Focusrite Scarlett, MOTU, PreSonus, Behringer, etc.) with `{ latencyHint: 'interactive' }` low-latency buffer processing.
  - Master volume slider, mute toggle, and stereo reverb room ambience.
- **Interactive 61-Key Virtual Piano**:
  - Covers 5 octaves from C2 to C7.
  - Keys illuminate and press down in sync with incoming MIDI notes.
  - Playable via mouse, touch, and computer keyboard.
- **QWERTY Computer Keyboard Bridge**:
  - Playable anywhere even without MIDI hardware:
    - **White Keys**: `A` (C4), `S` (D4), `D` (E4), `F` (F4), `G` (G4), `H` (A4), `J` (B4), `K` (C5), `L` (D5), `;` (E5), `'` (F5)
    - **Black Keys**: `W` (C#4), `E` (D#4), `T` (F#4), `Y` (G#4), `U` (A#4), `O` (C#5), `P` (D#5)
    - **Octave Transposition**: `Z` (Octave down), `X` (Octave up)
    - **Sustain Pedal**: `Space` bar

---

## How to Run

### Option 1: Open Directly in Browser (Recommended)
Double-click `index.html` or open it in any Web MIDI-supported browser:
- **Google Chrome** (Recommended)
- **Microsoft Edge** (Recommended)
- **Brave / Opera**

### Option 2: Local HTTP Server (Python)
If your browser restricts Web MIDI or ES modules on `file://` URLs, launch a local web server:

```bash
# In the project directory (n:\projects\learning)
py -m http.server 8000
```
Then navigate to:
```
http://localhost:8000
```

---

## Project Structure

```
n:/projects/learning/
├── index.html       # Main HTML page with responsive layout, staff canvas, and piano
├── style.css        # CSS variables, dark/light theme, realistic piano keys & staff styles
├── chords.js        # Music theory engine, diatonic step mapping, and chord identification
├── notation.js      # Canvas Grand Staff renderer (Treble, Bass, Ledger lines, Scrolling notes)
├── audio.js         # Polyphonic Web Audio synthesizer with 4 instrument presets
├── midi.js          # Web MIDI API manager, hotplugging, and QWERTY keyboard bridge
├── app.js           # Coordinator linking Audio, MIDI, Notation, and Virtual Keyboard
└── README.md        # Documentation and user guide
```
