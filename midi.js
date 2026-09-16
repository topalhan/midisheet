/**
 * Web MIDI API Manager & Keyboard Bridge
 * Manages physical MIDI hardware connections, hot-plugging, message decoding,
 * and computer keyboard (QWERTY) input emulation.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function midiToNoteName(midi) {
  if (typeof midi !== 'number' || isNaN(midi) || midi < 0 || midi > 127) return '';
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

export class MidiManager {
  constructor() {
    this.midiAccess = null;
    this.selectedInputId = 'all'; // 'all' or specific port ID
    this.activeInputs = new Map(); // id -> input port

    // Octave transposition for computer keyboard
    this.keyboardOctave = 4; // C4 default

    // QWERTY key map: Key code -> semitone offset from current keyboardOctave * 12
    this.keyMap = {
      // Lower octave
      'KeyA': 0,   // C
      'KeyW': 1,   // C#
      'KeyS': 2,   // D
      'KeyE': 3,   // D#
      'KeyD': 4,   // E
      'KeyF': 5,   // F
      'KeyT': 6,   // F#
      'KeyG': 7,   // G
      'KeyY': 8,   // G#
      'KeyH': 9,   // A
      'KeyU': 10,  // A#
      'KeyJ': 11,  // B
      // Upper octave
      'KeyK': 12,  // C+1
      'KeyO': 13,  // C#+1
      'KeyL': 14,  // D+1
      'KeyP': 15,  // D#+1
      'Semicolon': 16, // E+1
      'Quote': 17  // F+1
    };

    // Tracking active computer keys to prevent auto-repeat triggers
    this.pressedComputerKeys = new Map(); // code -> midiNote

    // Debouncing & state tracking for wind instruments & hardware jitter
    this.noteDebounceTime = 45; // ms threshold to ignore rapid duplicate Note On
    this.noteStates = new Map(); // note -> { active: boolean, lastOnTime: number, lastOffTime: number }

    // Event callbacks
    this.onNoteOn = null;
    this.onNoteOff = null;
    this.onSustainPedal = null;
    this.onBreath = null;
    this.onDevicesChange = null;
    this.onMidiLog = null;
    this.onStatusChange = null;

    this.isSupported = Boolean(navigator.requestMIDIAccess);
  }

  /**
   * Initialize Web MIDI API
   */
  async requestAccess() {
    if (!this.isSupported) {
      if (this.onStatusChange) {
        this.onStatusChange({
          supported: false,
          connected: false,
          message: 'Web MIDI API is not supported in this browser. Use virtual piano or QWERTY keyboard.'
        });
      }
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });

      // Listen for hot-plug events (device connect/disconnect)
      this.midiAccess.onstatechange = (event) => {
        this.updateDeviceList();
        if (this.onMidiLog) {
          this.onMidiLog({
            type: 'System',
            source: event.port.name,
            detail: `Port ${event.port.state}: ${event.port.type} (${event.port.connection})`
          });
        }
      };

      this.updateDeviceList();
      this.bindSelectedInputs();

      if (this.onStatusChange) {
        const hasInputs = this.activeInputs.size > 0;
        this.onStatusChange({
          supported: true,
          connected: hasInputs,
          deviceCount: this.activeInputs.size,
          message: hasInputs
            ? `Connected: ${this.activeInputs.size} MIDI device(s) ready`
            : 'Web MIDI ready. No hardware connected yet.'
        });
      }

      return true;
    } catch (err) {
      console.warn('Web MIDI Access denied or failed:', err);
      if (this.onStatusChange) {
        this.onStatusChange({
          supported: true,
          connected: false,
          message: `MIDI permission denied: ${err.message}`
        });
      }
      return false;
    }
  }

  /**
   * Scans inputs and invokes devices change callback
   */
  updateDeviceList() {
    if (!this.midiAccess) return;

    this.activeInputs.clear();
    const devices = [];

    for (const [id, input] of this.midiAccess.inputs.entries()) {
      this.activeInputs.set(id, input);
      devices.push({
        id,
        name: input.name || `MIDI Port ${id}`,
        manufacturer: input.manufacturer || 'Generic',
        state: input.state
      });
    }

    if (this.onDevicesChange) {
      this.onDevicesChange(devices);
    }

    this.bindSelectedInputs();
  }

  /**
   * Select a specific device ID or 'all'
   */
  selectDevice(id) {
    this.selectedInputId = id;
    this.bindSelectedInputs();
  }

  /**
   * Attaches message listeners to active inputs
   */
  bindSelectedInputs() {
    if (!this.midiAccess) return;

    for (const [id, input] of this.activeInputs.entries()) {
      // Clear existing listener first
      input.onmidimessage = null;

      if (this.selectedInputId === 'all' || this.selectedInputId === id) {
        input.onmidimessage = (msg) => this.handleMidiMessage(msg, input.name);
      }
    }
  }

  /**
   * Process raw MIDI byte packets with debouncing and breath/wind instrument support
   */
  handleMidiMessage(msg, deviceName = 'MIDI In') {
    const data = msg.data;
    if (!data || data.length < 2) return;

    const statusByte = data[0];
    const command = statusByte >> 4;
    const channel = (statusByte & 0x0F) + 1;
    const note = data[1];
    const velocity = data.length > 2 ? data[2] : 0;
    const now = performance.now();

    // 0x90 = Note On, 0x80 = Note Off
    if (command === 9) {
      if (velocity > 0) {
        // Note On
        const state = this.noteStates.get(note) || { active: false, lastOnTime: 0, lastOffTime: 0 };
        
        // Debounce touch plate chatter / breath flutter (e.g. within 45ms)
        if (now - state.lastOnTime < this.noteDebounceTime) {
          return;
        }

        state.active = true;
        state.lastOnTime = now;
        this.noteStates.set(note, state);

        const noteName = midiToNoteName(note);
        if (this.onNoteOn) this.onNoteOn(note, velocity, channel, deviceName);
        this.logMessage('Note On', deviceName, `${noteName} (Note ${note}), Vel ${velocity}`, data, { note, noteName, velocity, channel });
      } else {
        // Note On with 0 velocity is Note Off per MIDI spec
        const state = this.noteStates.get(note);
        if (state) {
          state.active = false;
          state.lastOffTime = now;
        }
        const noteName = midiToNoteName(note);
        if (this.onNoteOff) this.onNoteOff(note, channel, deviceName);
        this.logMessage('Note Off', deviceName, `${noteName} (Note ${note})`, data, { note, noteName, channel });
      }
    } else if (command === 8) {
      // Note Off (0x80)
      const state = this.noteStates.get(note);
      if (state) {
        state.active = false;
        state.lastOffTime = now;
      }
      const noteName = midiToNoteName(note);
      if (this.onNoteOff) this.onNoteOff(note, channel, deviceName);
      this.logMessage('Note Off', deviceName, `${noteName} (Note ${note})`, data, { note, noteName, channel });
    } else if (command === 11) {
      // Control Change (0xB0)
      const ccNumber = note;
      const ccValue = velocity;

      if (ccNumber === 64) {
        // Sustain / Damper Pedal
        const isDown = ccValue >= 64;
        if (this.onSustainPedal) this.onSustainPedal(isDown);
        this.logMessage('Sustain Pedal', deviceName, isDown ? 'Pedal DOWN (64)' : 'Pedal UP (0)', data, { ccNumber, ccValue });
      } else if (ccNumber === 2 || ccNumber === 11 || ccNumber === 1 || ccNumber === 7 || ccNumber === 74) {
        // Breath Controller (CC#2), Expression (CC#11), Mod Wheel (CC#1), Volume (CC#7), or Filter (CC#74)
        const breathNorm = ccValue / 127;
        if (this.onBreath) this.onBreath(breathNorm, ccNumber);
        const ccNames = { 1: 'Mod Wheel', 2: 'Breath Controller', 7: 'Volume', 11: 'Expression', 74: 'Brightness / Filter' };
        const label = ccNames[ccNumber] || `CC #${ccNumber}`;
        this.logMessage(label, deviceName, `Value: ${ccValue} (${Math.round(breathNorm * 100)}%)`, data, { ccNumber, ccValue });
      } else if (ccNumber === 123 || ccNumber === 120) {
        // All Notes Off / All Sound Off
        for (const [activeNote, state] of this.noteStates.entries()) {
          if (state.active) {
            state.active = false;
            if (this.onNoteOff) this.onNoteOff(activeNote, channel, deviceName);
          }
        }
        this.logMessage('All Notes Off', deviceName, `CC #${ccNumber}`, data);
      } else {
        this.logMessage(`CC #${ccNumber}`, deviceName, `Value: ${ccValue}`, data, { ccNumber, ccValue });
      }
    } else if (command === 14) {
      // Pitch Bend (0xE0)
      const bendValue = ((velocity << 7) | note) - 8192;
      this.logMessage('Pitch Bend', deviceName, `Value: ${bendValue >= 0 ? '+' : ''}${bendValue}`, data, { bendValue });
    } else if (command === 13) {
      // Channel Pressure / Aftertouch (0xD0) - frequently used by wind controllers
      const pressureValue = note; // data[1]
      const pressureNorm = pressureValue / 127;
      if (this.onBreath) this.onBreath(pressureNorm, 'aftertouch');
      this.logMessage('Aftertouch', deviceName, `Pressure: ${pressureValue} (${Math.round(pressureNorm * 100)}%)`, data, { pressureValue });
    } else if (command === 10) {
      // Polyphonic Aftertouch (0xA0)
      const noteName = midiToNoteName(note);
      const pressureValue = velocity; // data[2]
      const pressureNorm = pressureValue / 127;
      if (this.onBreath) this.onBreath(pressureNorm, 'polyAftertouch');
      this.logMessage('Poly Pressure', deviceName, `${noteName} (Note ${note}): ${pressureValue}`, data, { note, noteName, pressureValue });
    } else if (command === 12) {
      // Program Change (0xC0)
      this.logMessage('Program Change', deviceName, `Program ${note}`, data, { program: note });
    }
  }

    logMessage(type, source, detail, rawBytes, extra = {}) {
    if (!this.onMidiLog) return;
    const hexString = Array.from(rawBytes).map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    this.onMidiLog({
      timestamp: new Date().toLocaleTimeString(),
      type,
      source,
      detail,
      raw: hexString,
      ...extra
    });
  }

  /**
   * Setup QWERTY computer keyboard listeners
   */
  enableComputerKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Ignore if typing in an input field or text area
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Octave Shift controls
      if (e.code === 'KeyZ') {
        this.setKeyboardOctave(this.keyboardOctave - 1);
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyX') {
        this.setKeyboardOctave(this.keyboardOctave + 1);
        e.preventDefault();
        return;
      }

      // Spacebar = Sustain pedal toggle / hold
      if (e.code === 'Space' && !e.repeat) {
        if (this.onSustainPedal) this.onSustainPedal(true);
        e.preventDefault();
        return;
      }

      if (e.repeat) return; // Prevent key repeat re-triggering

      if (this.keyMap.hasOwnProperty(e.code)) {
        const offset = this.keyMap[e.code];
        // Calculate MIDI note: (keyboardOctave + 1) * 12 + offset
        // For C4: (3 + 1)*12 + 0 = 48? No: C0 is 12, C4 is 60.
        // So (octave + 1) * 12 is correct: (4 + 1) * 12 = 60!
        const midiNote = (this.keyboardOctave + 1) * 12 + offset;

        if (midiNote >= 0 && midiNote <= 127) {
          this.pressedComputerKeys.set(e.code, midiNote);
          if (this.onNoteOn) {
            this.onNoteOn(midiNote, 100, 1, 'Computer Keyboard');
          }
          const noteName = midiToNoteName(midiNote);
          this.logMessage('Note On', 'Computer Keyboard', `${noteName} (Note ${midiNote}), Vel 100`, [0x90, midiNote, 100], { note: midiNote, noteName, velocity: 100, channel: 1 });
          e.preventDefault();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        if (this.onSustainPedal) this.onSustainPedal(false);
        e.preventDefault();
        return;
      }

      if (this.pressedComputerKeys.has(e.code)) {
        const midiNote = this.pressedComputerKeys.get(e.code);
        this.pressedComputerKeys.delete(e.code);
        if (this.onNoteOff) {
          this.onNoteOff(midiNote, 1, 'Computer Keyboard');
        }
        const noteName = midiToNoteName(midiNote);
        this.logMessage('Note Off', 'Computer Keyboard', `${noteName} (Note ${midiNote})`, [0x80, midiNote, 0], { note: midiNote, noteName, channel: 1 });
        e.preventDefault();
      }
    });
  }

  setKeyboardOctave(oct) {
    this.keyboardOctave = Math.max(1, Math.min(7, oct));
    return this.keyboardOctave;
  }
}
