/**
 * Polyphonic Web Audio Synthesizer
 * Provides realistic acoustic grand piano, electric piano (Rhodes), synth strings,
 * organ, flute, clarinet, saxophone, trumpet, and EWI lead presets with envelope control,
 * velocity response, sustain pedal, and ultra-low-latency real-time response.
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.voiceBus = null;          // Static bus summing all polyphonic voices
    this.directDryGain = null;     // Direct zero-lookahead path for ultra-low latency
    this.compressor = null;        // Dynamics compressor for studio mode
    this.dryGain = null;
    this.wetGain = null;
    this.reverbNode = null;
    this.reverbSendGain = null;    // Dynamic send gate to convolver

    this.activeVoices = new Map(); // midiNote -> Voice object
    this.sustainedVoices = new Set(); // Set of midiNotes kept alive by sustain pedal

    this.preset = 'none'; // Default to 'none' (No Sound for Hardware / EWI Audio) // 'grandPiano', 'electricPiano', 'strings', 'organ', 'flute', 'clarinet', 'saxophone', 'trumpet', 'ewiLead'
    this.volume = 0.8;
    this.lowLatencyMode = true; // Enabled by default for instantaneous note onset on tempo
    this.reverbEnabled = false; // Dry by default in low-latency mode to eliminate FFT convolution overhead
    this.sustainPedalDown = false;
    this.isMuted = false;
    this.noiseBuffer = null;
    this.selectedDeviceId = 'default';
    this.synthMuted = false;

    this.isInitialized = false;
  }

  /**
   * Initializes the AudioContext upon first user interaction
   */
  async init() {
    if (this.isInitialized && this.ctx && this.ctx.state !== 'closed') {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    // Request lowest possible buffer from OS audio subsystem (WASAPI on Windows / CoreAudio on macOS)
    // latencyHint: 0 requests the minimum hardware buffer size supported (~2.6ms - 5ms)
    try {
      this.ctx = new AudioContextClass({ latencyHint: 0 });
    } catch (e) {
      try {
        this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
      } catch (e2) {
        this.ctx = new AudioContextClass();
      }
    }

    // Restore selected sound card if setSinkId is supported
    if (this.selectedDeviceId && this.selectedDeviceId !== 'default' && typeof this.ctx.setSinkId === 'function') {
      try {
        await this.ctx.setSinkId(this.selectedDeviceId);
      } catch (e) {
        console.warn('Could not restore audio output device:', e);
      }
    }

    const now = this.ctx.currentTime;

    // Master Output Chain -> Destination
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.volume, now);
    this.masterGain.connect(this.ctx.destination);

    // Static Voice Bus: All voice generators connect HERE once without reconnecting downstream nodes
    this.voiceBus = this.ctx.createGain();
    this.voiceBus.gain.setValueAtTime(1.0, now);

    // 1. Direct Dry Bus (Zero-latency path bypassing compressor lookahead delay and convolver FFT)
    this.directDryGain = this.ctx.createGain();
    this.directDryGain.gain.setValueAtTime(this.lowLatencyMode ? 1.0 : 0.0, now);
    this.voiceBus.connect(this.directDryGain);
    this.directDryGain.connect(this.masterGain);

    // 2. Studio Path: Dynamic Compressor for smooth polyphonic dynamics (used in Studio mode)
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-12, now);
    this.compressor.knee.setValueAtTime(18, now);
    this.compressor.ratio.setValueAtTime(4, now);
    this.compressor.attack.setValueAtTime(0.003, now);
    this.compressor.release.setValueAtTime(0.15, now);

    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.setValueAtTime(this.lowLatencyMode ? 0.0 : 0.85, now);

    this.voiceBus.connect(this.compressor);
    this.compressor.connect(this.dryGain);
    this.dryGain.connect(this.masterGain);

    // 3. Reverb Send Bus: Convolver Reverb
    this.createConvolverReverb();
    this.createNoiseBuffer();

    this.reverbSendGain = this.ctx.createGain();
    this.wetGain = this.ctx.createGain();

    const isReverbActive = !this.lowLatencyMode && this.reverbEnabled;
    this.reverbSendGain.gain.setValueAtTime(isReverbActive ? 1.0 : 0.0, now);
    this.wetGain.gain.setValueAtTime(isReverbActive ? 0.28 : 0.0, now);

    this.voiceBus.connect(this.reverbSendGain);
    if (isReverbActive) {
      this.reverbSendGain.connect(this.reverbNode);
    }
    this.reverbNode.connect(this.wetGain);
    this.wetGain.connect(this.masterGain);

    this.isInitialized = true;
  }

  /**
   * Toggle Low-Latency Mode
   * When enabled (default):
   * - Voices route through directDryGain -> masterGain with zero compressor lookahead delay
   * - Reverb convolver send is completely disconnected, avoiding FFT convolution overhead
   * When disabled (Studio Mode):
   * - Voices route through the compressor and stereo hall reverb for rich acoustic ambiance
   */
  setLowLatencyMode(enable) {
    this.lowLatencyMode = !!enable;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (this.lowLatencyMode) {
      // Instant direct dry path
      this.directDryGain.gain.setTargetAtTime(1.0, now, 0.005);
      this.dryGain.gain.setTargetAtTime(0.0, now, 0.005);
      this.wetGain.gain.setTargetAtTime(0.0, now, 0.005);
      this.reverbSendGain.gain.setTargetAtTime(0.0, now, 0.005);
    } else {
      // Studio compressed + reverb path
      this.directDryGain.gain.setTargetAtTime(0.0, now, 0.005);
      this.dryGain.gain.setTargetAtTime(0.85, now, 0.005);
      const wetVal = this.reverbEnabled ? 0.28 : 0.0;
      this.wetGain.gain.setTargetAtTime(wetVal, now, 0.005);
      this.reverbSendGain.gain.setTargetAtTime(this.reverbEnabled ? 1.0 : 0.0, now, 0.005);
    }
    this.updateReverbConnection();
  }

  /**
   * Connect or disconnect reverb node dynamically to spare CPU cycles when reverb is inactive
   */
  updateReverbConnection() {
    if (!this.reverbNode || !this.reverbSendGain) return;
    const shouldRunReverb = !this.lowLatencyMode && this.reverbEnabled;
    try {
      this.reverbSendGain.disconnect();
      if (shouldRunReverb) {
        this.reverbSendGain.connect(this.reverbNode);
      }
    } catch (e) {
      // Ignore disconnect errors
    }
  }

  /**
   * Retrieve audio latency metrics reported by the browser/OS audio driver
   */
  getLatencyInfo() {
    if (!this.ctx) {
      return {
        baseLatencyMs: 0,
        outputLatencyMs: 0,
        totalLatencyMs: 0,
        sampleRate: 44100,
        isHighLatency: false,
        lowLatencyMode: this.lowLatencyMode
      };
    }
    const base = (this.ctx.baseLatency || 0) * 1000;
    const output = (this.ctx.outputLatency || 0) * 1000;
    const total = base + output;
    // Over 45ms typically indicates Bluetooth A2DP wireless audio latency
    const isHighLatency = total > 45;

    return {
      baseLatencyMs: Math.round(base * 10) / 10,
      outputLatencyMs: Math.round(output * 10) / 10,
      totalLatencyMs: Math.round(total * 10) / 10,
      sampleRate: this.ctx.sampleRate,
      isHighLatency,
      lowLatencyMode: this.lowLatencyMode
    };
  }

  createConvolverReverb() {
    const rate = this.ctx.sampleRate;
    const length = Math.round(rate * 1.8); // 1.8 second natural room decay
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    const decay = 2.2;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const factor = Math.exp(-decay * t);
      left[i] = (Math.random() * 2 - 1) * factor;
      right[i] = (Math.random() * 2 - 1) * factor;
    }

    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = impulse;
  }

  createNoiseBuffer() {
    if (!this.ctx) return;
    const rate = this.ctx.sampleRate;
    const bufferSize = Math.round(rate * 1.5);
    const buffer = this.ctx.createBuffer(1, bufferSize, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime, 0.01);
    }
  }

  setMute(mute) {
    this.isMuted = mute;
    this.setVolume(this.volume);
  }

  setSynthMute(muted) {
    this.synthMuted = !!muted;
  }

  setPreset(name) {
    this.preset = name;
    if (name === 'none') {
      for (const midi of Array.from(this.activeVoices.keys())) {
        this.stopVoice(midi, true);
      }
      this.activeVoices.clear();
      this.sustainedVoices.clear();
    }
  }

  setReverb(enable) {
    this.reverbEnabled = !!enable;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const wetVal = (!this.lowLatencyMode && this.reverbEnabled) ? 0.28 : 0.0;
    if (this.wetGain) {
      this.wetGain.gain.setTargetAtTime(wetVal, now, 0.02);
    }
    if (this.reverbSendGain) {
      this.reverbSendGain.gain.setTargetAtTime(wetVal > 0 ? 1.0 : 0.0, now, 0.02);
    }
    this.updateReverbConnection();
  }

  /**
   * Set audio output device (routes audio directly to external sound card / audio interface)
   */
  async setOutputDevice(deviceId) {
    this.selectedDeviceId = deviceId || 'default';
    if (!this.isInitialized) {
      await this.init();
    }
    if (this.ctx && typeof this.ctx.setSinkId === 'function') {
      try {
        await this.ctx.setSinkId(this.selectedDeviceId === 'default' ? '' : this.selectedDeviceId);
        return true;
      } catch (err) {
        console.warn('Failed to set audio output device:', err);
        return false;
      }
    } else {
      console.warn('AudioContext.setSinkId is not supported in this browser.');
      return false;
    }
  }

  /**
   * Enumerate available audio output devices (e.g. Scarlett, Focusrite, USB audio interface, etc.)
   */
  async getOutputDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || (d.deviceId === 'default' ? 'Default Output' : `Audio Device (${d.deviceId.slice(0, 8)}...)`),
          groupId: d.groupId
        }));
    } catch (err) {
      console.warn('Failed to enumerate audio devices:', err);
      return [];
    }
  }

  /**
   * Request device permission so human-readable interface names (e.g. Focusrite Scarlett) are visible
   */
  async requestDeviceLabels() {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (e) {
      // User dismissed or no mic attached, continue to enumerate what's available
    }
    return await this.getOutputDevices();
  }

  setSustainPedal(down) {
    this.sustainPedalDown = down;
    if (!down) {
      // Release all voices held by sustain pedal
      for (const midi of this.sustainedVoices) {
        this.stopVoice(midi, true);
      }
      this.sustainedVoices.clear();
    }
  }

  /**
   * Play Note On - Synchronous execution when AudioContext is running for zero microtask latency
   */
  noteOn(midi, velocity = 100) {
    if (this.synthMuted) return;
    if (this.preset === 'none') return;
    if (!this.isInitialized || !this.ctx || this.ctx.state !== 'running') {
      this.init().then(() => {
        this._triggerNote(midi, velocity);
      });
      return;
    }
    this._triggerNote(midi, velocity);
  }

  _triggerNote(midi, velocity = 100) {
    if (this.preset === 'none') return;
    if (!this.ctx || this.ctx.state === 'closed') return;

    // If note is already playing, stop existing voice smoothly
    if (this.activeVoices.has(midi)) {
      this.stopVoice(midi, true);
    }

    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const velNorm = Math.max(0.1, Math.min(1, velocity / 127));

    let voice;
    switch (this.preset) {
      case 'electricPiano':
        voice = this.createElectricPianoVoice(freq, velNorm);
        break;
      case 'strings':
        voice = this.createStringsVoice(freq, velNorm);
        break;
      case 'organ':
        voice = this.createOrganVoice(freq, velNorm);
        break;
      case 'flute':
        voice = this.createFluteVoice(freq, velNorm);
        break;
      case 'clarinet':
        voice = this.createClarinetVoice(freq, velNorm);
        break;
      case 'saxophone':
        voice = this.createSaxophoneVoice(freq, velNorm);
        break;
      case 'trumpet':
        voice = this.createTrumpetVoice(freq, velNorm);
        break;
      case 'ewiLead':
        voice = this.createEwiLeadVoice(freq, velNorm);
        break;
      case 'grandPiano':
      default:
        voice = this.createGrandPianoVoice(freq, velNorm);
        break;
    }

    this.activeVoices.set(midi, voice);
    this.sustainedVoices.delete(midi);
  }

  /**
   * Handle Note Off
   */
  noteOff(midi) {
    if (this.preset === 'none') return;
    if (this.sustainPedalDown) {
      // Mark as sustained instead of stopping immediately
      this.sustainedVoices.add(midi);
    } else {
      this.stopVoice(midi, false);
    }
  }

  stopVoice(midi, immediate = false) {
    const voice = this.activeVoices.get(midi);
    if (!voice) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const releaseTime = immediate ? 0.03 : voice.releaseDuration || 0.35;

    // Trigger gain release envelope
    voice.gainNode.gain.cancelScheduledValues(now);
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
    voice.gainNode.gain.setTargetAtTime(0.0001, now, releaseTime / 3);

    // Stop oscillators after release and disconnect from voiceBus
    setTimeout(() => {
      try {
        voice.oscillators.forEach(osc => {
          osc.stop();
          osc.disconnect();
        });
        voice.gainNode.disconnect();
      } catch (e) {
        // Ignored if already cleaned up
      }
    }, (releaseTime + 0.05) * 1000);

    this.activeVoices.delete(midi);
  }

  /**
   * Realistic Grand Piano synthesis:
   * Multi-oscillator additive model with fundamental + 2nd/3rd/4th harmonics,
   * exponential acoustic decay, hammer impulse filter, and 1ms instant transient.
   */
  createGrandPianoVoice(freq, vel) {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const voiceGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    // Velocity-sensitive hammer filter (higher velocity = brighter cutoff)
    filter.type = 'lowpass';
    const baseCutoff = Math.min(16000, freq * (2.5 + 4.5 * vel));
    filter.frequency.setValueAtTime(baseCutoff, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.5), now + 1.8);

    const oscillators = [];

    // Harmonics: [harmonicMultiplier, amplitudeRelative, detuneCents]
    const harmonics = [
      [1.0, 1.0, 0],
      [1.001, 0.45, 1.5],   // slight natural detuning for acoustic warmth
      [2.0, 0.5 * vel, -1.2],
      [3.0, 0.22 * vel, 2.0],
      [4.0, 0.08 * vel, 0.0]
    ];

    harmonics.forEach(([mult, amp, detune]) => {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();

      osc.type = mult <= 2 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq * mult, now);
      osc.detune.setValueAtTime(detune, now);

      oscGain.gain.setValueAtTime(amp * 0.4, now);

      osc.connect(oscGain);
      oscGain.connect(filter);
      osc.start(now);
      oscillators.push(osc);
    });

    // Main Envelope: ultra-fast 1.0ms hammer attack transient for instantaneous on-tempo response
    const attack = 0.001;
    const decay = 2.2 + vel * 0.8;
    const targetGain = 0.35 * Math.pow(vel, 1.2);

    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.linearRampToValueAtTime(targetGain, now + attack);
    voiceGain.gain.exponentialRampToValueAtTime(0.001, now + decay);

    // Route: Filter -> VoiceGain -> VoiceBus (single static edge)
    filter.connect(voiceGain);
    voiceGain.connect(this.voiceBus);

    return {
      gainNode: voiceGain,
      oscillators,
      releaseDuration: 0.3
    };
  }

  /**
   * Electric Piano (Rhodes / FM style bell chime + warm tine)
   */
  createElectricPianoVoice(freq, vel) {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const voiceGain = ctx.createGain();
    const oscillators = [];

    // Modulator oscillator for FM bell chime
    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const modGain = ctx.createGain();

    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq, now);

    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(freq * 14.0, now); // Bell harmonic ratio

    // Modulator envelope
    const modIndex = 180 * vel;
    modGain.gain.setValueAtTime(modIndex, now);
    modGain.gain.exponentialRampToValueAtTime(0.1, now + 0.45);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    // Secondary body oscillator (warm triangle)
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(freq, now);
    bodyGain.gain.setValueAtTime(0.25, now);
    bodyOsc.connect(bodyGain);

    // Mix carrier and body
    const mixGain = ctx.createGain();
    carrier.connect(mixGain);
    bodyGain.connect(mixGain);

    mixGain.connect(voiceGain);

    // Main Envelope: crisp 1.5ms attack
    const targetGain = 0.32 * vel;
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.linearRampToValueAtTime(targetGain, now + 0.0015);
    voiceGain.gain.exponentialRampToValueAtTime(targetGain * 0.4, now + 0.8);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.0);

    carrier.start(now);
    modulator.start(now);
    bodyOsc.start(now);

    oscillators.push(carrier, modulator, bodyOsc);

    voiceGain.connect(this.voiceBus);

    return {
      gainNode: voiceGain,
      oscillators,
      releaseDuration: 0.4
    };
  }

  /**
   * Synth Strings / Warm Pad
   */
  createStringsVoice(freq, vel) {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const voiceGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(12000, freq * 3.5 + 400), now);

    const oscillators = [];

    // Dual detuned saw waves
    [-7, 7].forEach(detune => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime(detune, now);
      osc.connect(filter);
      osc.start(now);
      oscillators.push(osc);
    });

    filter.connect(voiceGain);

    // Responsive 15ms agile attack (down from 120ms) for precise tempo playing
    const targetGain = 0.22 * vel;
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.linearRampToValueAtTime(targetGain, now + 0.015);

    voiceGain.connect(this.voiceBus);

    return {
      gainNode: voiceGain,
      oscillators,
      releaseDuration: 0.55
    };
  }

  /**
   * Drawbar Organ
   */
  createOrganVoice(freq, vel) {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const voiceGain = ctx.createGain();
    const oscillators = [];

    // Drawbar harmonics: 16', 8', 4', 2'
    const drawbars = [
      { mult: 0.5, amp: 0.4 },
      { mult: 1.0, amp: 0.7 },
      { mult: 2.0, amp: 0.4 },
      { mult: 4.0, amp: 0.2 }
    ];

    drawbars.forEach(({ mult, amp }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * mult, now);
      gain.gain.setValueAtTime(amp * 0.35, now);
      osc.connect(gain);
      gain.connect(voiceGain);
      osc.start(now);
      oscillators.push(osc);
    });

    // Instant contact switch: 1.5ms attack
    const targetGain = 0.25 * vel;
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.linearRampToValueAtTime(targetGain, now + 0.0015);

    voiceGain.connect(this.voiceBus);

    return {
      gainNode: voiceGain,
      oscillators,
      releaseDuration: 0.08
    };
  }

  /**
   * Concert Flute:
   * Pure singing fundamental, gentle octave harmonic, and natural breath chiff.
   */
  createFluteVoice(freq, vel) {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const voiceGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(10000, freq * 3.2), now);

    const oscillators = [];

    // 1. Fundamental sine wave (pure core tone)
    const fundamental = ctx.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.setValueAtTime(freq, now);

    const fundGain = ctx.createGain();
    fundGain.gain.setValueAtTime(0.7, now);
    fundamental.connect(fundGain);
    fundGain.connect(filter);
    fundamental.start(now);
    oscillators.push(fundamental);

    // 2. Second harmonic (soft octave sparkle)
    const harmonic2 = ctx.createOscillator();
    harmonic2.type = 'triangle';
    harmonic2.frequency.setValueAtTime(freq * 2, now);

    const harmGain = ctx.createGain();
    harmGain.gain.setValueAtTime(0.12 * vel, now);
    harmonic2.connect(harmGain);
    harmGain.connect(filter);
    harmonic2.start(now);
    oscillators.push(harmonic2);

    // 3. Realistic breath chiff / embouchure noise
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      noise.loop = true;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(Math.min(7000, freq * 2.8), now);
      noiseFilter.Q.setValueAtTime(3.0, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.06 * vel, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.012 * vel, now + 0.08);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(voiceGain);
      noise.start(now);
      oscillators.push(noise);
    }

    filter.connect(voiceGain);

    // Flute breath onset envelope: agile 3.0ms transient (down from 35ms)
    const targetGain = 0.32 * vel;
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.linearRampToValueAtTime(targetGain, now + 0.003);

    voiceGain.connect(this.voiceBus);

    return {
      gainNode: voiceGain,
      oscillators,
      releaseDuration: 0.22
    };
  }

  /**
   * Clarinet / Woodwind:
   * Cylindrical bore acoustics with prominent odd harmonics and warm woody resonance.
   */
  createClarinetVoice(freq, vel) {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const voiceGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(9000, freq * (3.0 + 1.8 * vel)), now);
    filter.Q.setValueAtTime(1.8, now);

    const oscillators = [];

    // Core square wave (generates odd harmonics: 1st, 3rd, 5th, 7th...)
    const sqOsc = ctx.createOscillator();
    sqOsc.type = 'square';
    sqOsc.frequency.setValueAtTime(freq, now);

    const sqGain = ctx.createGain();
    sqGain.gain.setValueAtTime(0.28, now);
    sqOsc.connect(sqGain);
    sqGain.connect(filter);
    sqOsc.start(now);
    oscillators.push(sqOsc);

    // Warm round fundamental sine
    const sinOsc = ctx.createOscillator();
    sinOsc.type = 'sine';
    sinOsc.frequency.setValueAtTime(freq, now);

    const sinGain = ctx.createGain();
    sinGain.gain.setValueAtTime(0.55, now);
    sinOsc.connect(sinGain);
    sinGain.connect(filter);
    sinOsc.start(now);
    oscillators.push(sinOsc);

    // Characteristic 3rd harmonic woody overtone
    const overtone = ctx.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(freq * 3, now);

    const overGain = ctx.createGain();
    overGain.gain.setValueAtTime(0.14 * vel, now);
    overtone.connect(overGain);
    overGain.connect(filter);
    overtone.start(now);
    oscillators.push(overtone);

    filter.connect(voiceGain);

    // Clarinet tongue attack envelope: 2.5ms (down from 22ms)
    const targetGain = 0.30 * vel;
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.linearRampToValueAtTime(targetGain, now + 0.0025);

    voiceGain.connect(this.voiceBus);

    return {
      gainNode: voiceGain,
      oscillators,
      releaseDuration: 0.16
    };
  }

  /**
   * Tenor Saxophone:
   * Conical bore acoustics with rich full-spectrum harmonics and expressive reed bite.
   */
  createSaxophoneVoice(freq, vel) {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const voiceGain = ctx.createGain();

    // Body resonance formant filter (horn bell cavity around 950Hz)
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'peaking';
    bodyFilter.frequency.setValueAtTime(950, now);
    bodyFilter.Q.setValueAtTime(1.5, now);
    bodyFilter.gain.setValueAtTime(4.0, now);

    // Velocity-driven brightness filter
    const brightFilter = ctx.createBiquadFilter();
    brightFilter.type = 'lowpass';
    const baseCutoff = Math.min(12000, freq * (3.0 + 3.5 * vel));
    brightFilter.frequency.setValueAtTime(baseCutoff, now);
    brightFilter.Q.setValueAtTime(2.2, now);

    const oscillators = [];

    // Sawtooth core
    const sawOsc = ctx.createOscillator();
    sawOsc.type = 'sawtooth';
    sawOsc.frequency.setValueAtTime(freq, now);

    const sawGain = ctx.createGain();
    sawGain.gain.setValueAtTime(0.5, now);
    sawOsc.connect(sawGain);
    sawGain.connect(bodyFilter);
    sawOsc.start(now);
    oscillators.push(sawOsc);

    // Warm sub/body triangle
    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(freq, now);

    const bodyOscGain = ctx.createGain();
    bodyOscGain.gain.setValueAtTime(0.35, now);
    bodyOsc.connect(bodyOscGain);
    bodyOscGain.connect(bodyFilter);
    bodyOsc.start(now);
    oscillators.push(bodyOsc);

    bodyFilter.connect(brightFilter);
    brightFilter.connect(voiceGain);

    // Saxophone embouchure bite envelope: 2.5ms (down from 18ms)
    const targetGain = 0.30 * vel;
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.linearRampToValueAtTime(targetGain, now + 0.0025);

    voiceGain.connect(this.voiceBus);

    return {
      gainNode: voiceGain,
      oscillators,
      releaseDuration: 0.20
    };
  }

  /**
   * Brass / Trumpet:
   * Dual detuned saw waves with dynamic brass lowpass filter envelope sweep.
   */
  createTrumpetVoice(freq, vel) {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const voiceGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    // Brass filter envelope: quick bright opening on attack settling to sustained warmth
    const initialCutoff = Math.max(300, freq * 2.0);
    const peakCutoff = Math.min(14000, freq * (4.5 + 4.5 * vel));
    const sustainCutoff = Math.min(10000, freq * (3.0 + 2.5 * vel));

    filter.frequency.setValueAtTime(initialCutoff, now);
    filter.frequency.linearRampToValueAtTime(peakCutoff, now + 0.012);
    filter.frequency.exponentialRampToValueAtTime(sustainCutoff, now + 0.18);
    filter.Q.setValueAtTime(2.5, now);

    const oscillators = [];

    // Detuned sawtooth pair for thick brass section chorusing
    [-4, 4].forEach(cents => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime(cents, now);
      osc.connect(filter);
      osc.start(now);
      oscillators.push(osc);
    });

    filter.connect(voiceGain);

    // Brass attack envelope: 2.0ms (down from 15ms)
    const targetGain = 0.28 * vel;
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.linearRampToValueAtTime(targetGain, now + 0.002);

    voiceGain.connect(this.voiceBus);

    return {
      gainNode: voiceGain,
      oscillators,
      releaseDuration: 0.18
    };
  }

  /**
   * EWI Analog Lead:
   * Legendary vintage analog wind synthesizer lead (Michael Brecker style).
   * Fast, responsive, singing tone with resonant filter.
   */
  createEwiLeadVoice(freq, vel) {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const voiceGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(14000, freq * (3.8 + 4.0 * vel)), now);
    filter.Q.setValueAtTime(3.8, now); // Sweet singing analog resonance

    const oscillators = [];

    // Osc 1: Sawtooth core
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(freq, now);
    saw.detune.setValueAtTime(-3, now);

    const sawGain = ctx.createGain();
    sawGain.gain.setValueAtTime(0.45, now);
    saw.connect(sawGain);
    sawGain.connect(filter);
    saw.start(now);
    oscillators.push(saw);

    // Osc 2: Square wave with slight detune
    const square = ctx.createOscillator();
    square.type = 'square';
    square.frequency.setValueAtTime(freq, now);
    square.detune.setValueAtTime(5, now);

    const sqGain = ctx.createGain();
    sqGain.gain.setValueAtTime(0.35, now);
    square.connect(sqGain);
    sqGain.connect(filter);
    square.start(now);
    oscillators.push(square);

    filter.connect(voiceGain);

    // Agile instant wind attack: 2.0ms (down from 8ms)
    const targetGain = 0.32 * vel;
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.linearRampToValueAtTime(targetGain, now + 0.002);

    voiceGain.connect(this.voiceBus);

    return {
      gainNode: voiceGain,
      oscillators,
      releaseDuration: 0.22
    };
  }

  /**
   * High-precision percussive metronome click
   * Accented bright woodblock click on downbeat (1400Hz), warmer click on other beats (880Hz).
   * Routed directly to masterGain with zero lookahead delay.
   * @param {boolean} isDownbeat - True for accented beat 1
   * @param {number|null} time - Web Audio scheduling time (ctx.currentTime if null)
   */
  playMetronomeClick(isDownbeat = false, time = null) {
    if (!this.isInitialized || !this.ctx || this.ctx.state !== 'running') {
      this.init().then(() => {
        this._triggerMetronomeClick(isDownbeat, time);
      });
      return;
    }
    this._triggerMetronomeClick(isDownbeat, time);
  }

  _triggerMetronomeClick(isDownbeat = false, time = null) {
    if (!this.ctx || this.ctx.state === 'closed') return;

    const t = time ?? this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Woodblock / rimshot percussive click:
    // Downbeat: 1400Hz dropping to 600Hz, louder (peak gain 0.38)
    // Normal beat: 880Hz dropping to 400Hz, softer (peak gain 0.22)
    const startFreq = isDownbeat ? 1400 : 880;
    const endFreq = isDownbeat ? 600 : 400;
    const peakGain = isDownbeat ? 0.38 : 0.22;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + 0.025);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peakGain, t + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.05);
  }
}
