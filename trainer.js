/**
 * Interactive Melody Trainer & Accuracy Assessment Engine
 * Includes interactive Audio/Visual Metronome, Tempo Mode with Count-in,
 * Real-time Beat Timing Window Evaluation, and Rhythm Scoring.
 */

import { MELODIES } from './melodies.js';
import { MusicTheory } from './chords.js';

export class MelodyTrainer {
  constructor() {
    this.melodies = [...MELODIES];
    this.loadPersistedCustomMelodies();
    this.currentMelody = null;
    this.noteIndex = 0;
    this.isFinished = false;
    this.mode = 'wait'; // 'wait' (wait-for-note), 'tempo', 'strict' (no-pause sight-reading), 'first_read'
    this.bpm = 108;
    this.metronomeEnabled = true;

    // In-tempo & Metronome tracking
    this.isCountingIn = false;
    this.countInBeat = 0;
    this.countInTotal = 4;
    this.songStartTime = null;
    this.lastNoteTimestampMs = null;
    this.expectedCumulativeBeats = 0;
    this.metronomeTimer = null;
    this.tempoMonitorRaf = null;
    this.currentBeatIndex = 0;
    this.lastBeatTime = 0;
    this.noteTimeline = [];
    this.playheadBeats = 0;

    // Strict Sight-Reading & Downbeat Recovery State
    this.previousNoteMissedOrMistake = false;

    // Latency Calibration & Hardware Offset Compensation
    this.latencyCompensationMs = this.loadLatencyCompensation();
    this.lastRawOffsetMs = null;

    // First-Read Challenge & Silent Analysis State
    this.isAnalyzing = false;
    this.analysisSecondsRemaining = 30;
    this.analysisTotalSeconds = 30;
    this.analysisTimer = null;
    this.firstReadRecords = this.loadFirstReadRecords();

    // Per-note result array: each entry tracks status ('pending'|'correct'|'mistake'|'missed')
    this.noteResults = [];

    // Note holding & debouncing state (vital for wind instruments / EWIs)
    this.heldNotes = new Set();
    this.lastPlayedMidi = -1;
    this.lastPlayedTime = 0;
    this.lastCompletedTime = 0;
    this.lastReleaseTime = new Map();

    // Scoring & Stats
    this.stats = {
      totalNotes: 0,
      correctNotes: 0,
      mistakeCount: 0,
      missedNotes: 0,
      recoveries: 0,
      recoveryPoints: 0,
      streak: 0,
      bestStreak: 0,
      accuracy: 100, // Pitch accuracy %
      rhythmAccuracy: 100, // Rhythm accuracy %
      sightReadingScore: 100, // Weighted (60% rhythm + 40% pitch + recovery)
      perfectHits: 0, // <= 75ms
      earlyHits: 0,   // -160ms to -75ms
      lateHits: 0,    // +75ms to +160ms
      goodHits: 0,    // <= 250ms
      offBeatHits: 0, // > 250ms
      rhythmPoints: 0,
      startTime: null,
      endTime: null
    };

    // Callbacks
    this.onStateChange = null;
    this.onNoteSuccess = null;
    this.onNoteMistake = null;
    this.onTimingFeedback = null;
    this.onMetronomeTick = null;
    this.onCountIn = null;
    this.onAnalysisTick = null;
    this.onAnalysisComplete = null;
    this.onRecovery = null;
    this.onPlayheadMove = null;
    this.onFirstReadLocked = null;
    this.onComplete = null;
    this.onRhythmTapFeedback = null;

    // Rhythm Tap & Subdivision Mode (Paul Harris Method: tap single pitch or written pitch in tempo)
    this.rhythmTapMode = false;
    this.expectedTapMidi = null;

    // Load default melody
    this.loadMelody(this.melodies[0].id);
  }

  isStrictTimeMode() {
    return this.mode === 'strict' || this.mode === 'first_read';
  }

  isTimeDrivenMode() {
    return this.mode === 'tempo' || this.mode === 'strict' || this.mode === 'first_read';
  }

  isFirstReadMode() {
    return this.mode === 'first_read';
  }

  loadFirstReadRecords() {
    try {
      const data = localStorage.getItem('midisheet_first_read_records');
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.warn('Failed to load first-read records:', e);
      return {};
    }
  }

  saveFirstReadRecord(melodyId, record) {
    try {
      this.firstReadRecords = this.loadFirstReadRecords();
      this.firstReadRecords[melodyId] = record;
      localStorage.setItem('midisheet_first_read_records', JSON.stringify(this.firstReadRecords));
      return true;
    } catch (e) {
      console.warn('Failed to save first-read record:', e);
      return false;
    }
  }

  getFirstReadRecord(melodyId) {
    if (!melodyId) return null;
    this.firstReadRecords = this.loadFirstReadRecords();
    return this.firstReadRecords[melodyId] || null;
  }

  isMelodyFirstReadLocked(melodyId) {
    return !!this.getFirstReadRecord(melodyId);
  }

  resetFirstReadRecords() {
    try {
      localStorage.removeItem('midisheet_first_read_records');
      this.firstReadRecords = {};
      this.notifyState();
      return true;
    } catch (e) {
      return false;
    }
  }

  loadLatencyCompensation() {
    try {
      const saved = localStorage.getItem('midisheet_latency_compensation_ms');
      if (saved !== null) {
        const val = parseInt(saved, 10);
        return isNaN(val) ? 0 : Math.max(-500, Math.min(500, val));
      }
    } catch (e) {
      console.warn('Failed to load latency compensation:', e);
    }
    return 0;
  }

  setLatencyCompensation(ms) {
    const val = Math.max(-500, Math.min(500, Math.round(Number(ms) || 0)));
    this.latencyCompensationMs = val;
    try {
      localStorage.setItem('midisheet_latency_compensation_ms', val.toString());
    } catch (e) {
      console.warn('Failed to save latency compensation:', e);
    }
    return val;
  }

  startSilentAnalysis(durationSeconds = 30) {
    this.stopMetronome();
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }

    this.isAnalyzing = true;
    this.analysisSecondsRemaining = durationSeconds;
    this.analysisTotalSeconds = durationSeconds;
    this.notifyState();

    if (this.onAnalysisTick) {
      this.onAnalysisTick(this.analysisSecondsRemaining, this.analysisTotalSeconds);
    }

    this.analysisTimer = setInterval(() => {
      this.analysisSecondsRemaining--;
      if (this.onAnalysisTick) {
        this.onAnalysisTick(this.analysisSecondsRemaining, this.analysisTotalSeconds);
      }
      this.notifyState();

      if (this.analysisSecondsRemaining <= 0) {
        this.skipSilentAnalysis();
      }
    }, 1000);
  }

  skipSilentAnalysis() {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }
    this.isAnalyzing = false;
    this.notifyState();

    if (this.onAnalysisComplete) {
      this.onAnalysisComplete();
    }

    // Launch strict count-in and playback!
    this.startMetronome();
  }

  addCustomMelody(melody) {
    if (!melody || !melody.notes || melody.notes.length === 0) return false;
    melody.isCustom = true;
    const existingIdx = this.melodies.findIndex(m => m.id === melody.id);
    if (existingIdx >= 0) {
      this.melodies[existingIdx] = melody;
    } else {
      this.melodies.push(melody);
    }
    this.saveCustomMelodies();
    this.loadMelody(melody.id);
    return true;
  }

  removeCustomMelody(id) {
    const idx = this.melodies.findIndex(m => m.id === id && m.isCustom);
    if (idx >= 0) {
      this.melodies.splice(idx, 1);
      this.saveCustomMelodies();
      if (this.currentMelody && this.currentMelody.id === id) {
        this.loadMelody(this.melodies[0].id);
      } else {
        this.notifyState();
      }
      return true;
    }
    return false;
  }

  saveCustomMelodies() {
    try {
      const customOnes = this.melodies.filter(m => m.isCustom);
      localStorage.setItem('midisheet_custom_melodies', JSON.stringify(customOnes));
    } catch (e) {
      console.warn('Failed to persist custom melodies in localStorage:', e);
    }
  }

  loadPersistedCustomMelodies() {
    try {
      const saved = localStorage.getItem('midisheet_custom_melodies');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          parsed.forEach(m => {
            if (m && m.id && Array.isArray(m.notes) && m.notes.length > 0) {
              m.isCustom = true;
              if (!this.melodies.some(existing => existing.id === m.id)) {
                this.melodies.push(m);
              }
            }
          });
        }
      }
    } catch (e) {
      console.warn('Failed to load persisted custom melodies from localStorage:', e);
    }
  }

  loadMelody(id) {
    const melody = this.melodies.find(m => m.id === id) || this.melodies[0];
    this.currentMelody = melody;
    this.bpm = melody.bpm || 108;
    this.buildNoteTimeline();
    this.restart();
  }

  loadMelodyObject(melodyObj) {
    if (!melodyObj) return;
    this.currentMelody = melodyObj;
    this.bpm = melodyObj.bpm || 108;
    this.buildNoteTimeline();
    this.restart();
  }

  buildNoteTimeline() {
    if (!this.currentMelody) return;
    let cumulativeBeats = 0;
    this.noteTimeline = this.currentMelody.notes.map((n, idx) => {
      const startBeat = cumulativeBeats;
      cumulativeBeats += n.duration;
      return {
        index: idx,
        midi: n.midi,
        duration: n.duration,
        name: n.name,
        startBeat,
        endBeat: cumulativeBeats
      };
    });
    this.totalSongBeats = cumulativeBeats;
    const timeSig = this.currentMelody.timeSignature || [4, 4];
    this.countInTotal = timeSig[0] || 4;
  }

  restart() {
    this.stopMetronome();

    if (!this.currentMelody) return;

    this.noteIndex = 0;
    this.isFinished = false;
    this.isCountingIn = false;
    this.countInBeat = 0;
    this.songStartTime = null;
    this.lastNoteTimestampMs = null;
    this.expectedCumulativeBeats = 0;
    this.playheadBeats = 0;
    this.previousNoteMissedOrMistake = false;

    if (this.rhythmTapMode) {
      this.expectedTapMidi = (this.currentMelody && this.currentMelody.notes && this.currentMelody.notes.length > 0)
        ? this.currentMelody.notes[0].midi
        : 60;
    } else {
      this.expectedTapMidi = null;
    }

    this.noteResults = this.currentMelody.notes.map(() => ({
      status: 'pending',
      mistakes: 0,
      wrongNotes: [],
      lastWrongMidi: null,
      playedMidi: null,
      timing: null
    }));

    this.stats = {
      totalNotes: this.currentMelody.notes.length,
      correctNotes: 0,
      mistakeCount: 0,
      missedNotes: 0,
      recoveries: 0,
      recoveryPoints: 0,
      streak: 0,
      bestStreak: 0,
      accuracy: 100,
      rhythmAccuracy: 100,
      sightReadingScore: 100,
      perfectHits: 0,
      earlyHits: 0,
      lateHits: 0,
      goodHits: 0,
      offBeatHits: 0,
      rhythmPoints: 0,
      startTime: performance.now(),
      endTime: null
    };

    this.heldNotes.clear();
    this.lastPlayedMidi = -1;
    this.lastPlayedTime = 0;
    this.lastCompletedTime = 0;
    this.lastReleaseTime = new Map();

    this.buildNoteTimeline();
    this.notifyState();

    // In first_read mode, start silent analysis or notify if locked
    if (this.mode === 'first_read') {
      if (this.isMelodyFirstReadLocked(this.currentMelody.id)) {
        if (this.onFirstReadLocked) {
          this.onFirstReadLocked(this.getFirstReadRecord(this.currentMelody.id));
        }
      } else {
        this.startSilentAnalysis(30);
      }
    } else if (this.isTimeDrivenMode() || this.metronomeEnabled) {
      this.startMetronome();
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.restart();
  }

  setBpm(bpm) {
    const clamped = Math.max(40, Math.min(240, Math.round(bpm)));
    if (this.bpm === clamped) return;
    this.bpm = clamped;
    if (this.metronomeTimer || this.isTimeDrivenMode()) {
      this.restart();
    } else {
      this.notifyState();
    }
  }

  toggleMetronome(enabled = null) {
    this.metronomeEnabled = enabled !== null ? enabled : !this.metronomeEnabled;
    if (!this.metronomeEnabled && this.mode === 'wait') {
      this.stopMetronome();
    } else if (this.metronomeEnabled && !this.metronomeTimer) {
      this.startMetronome();
    }
    this.notifyState();
    return this.metronomeEnabled;
  }

  stopMetronome() {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }
    this.isAnalyzing = false;

    if (this.metronomeTimer) {
      clearTimeout(this.metronomeTimer);
      this.metronomeTimer = null;
    }
    if (this.tempoMonitorRaf) {
      cancelAnimationFrame(this.tempoMonitorRaf);
      this.tempoMonitorRaf = null;
    }
  }

  startMetronome() {
    this.stopMetronome();
    if (!this.currentMelody) return;

    const timeSig = this.currentMelody.timeSignature || [4, 4];
    const beatsPerMeasure = timeSig[0] || 4;
    this.countInTotal = 4; // Standard 4-beat sight-reading count-in
    this.currentBeatIndex = 0;

    const beatMs = (60 / this.bpm) * 1000;

    if (this.isTimeDrivenMode()) {
      this.isCountingIn = true;
      this.countInBeat = 1;
      this.songStartTime = null;
      this.notifyState();
    } else {
      this.isCountingIn = false;
      this.countInBeat = 0;
    }

    let nextTickTime = performance.now();

    const tick = () => {
      if (this.isFinished) {
        this.stopMetronome();
        return;
      }

      const now = performance.now();
      this.lastBeatTime = now;

      if (this.isTimeDrivenMode() && this.isCountingIn) {
        if (this.countInBeat <= this.countInTotal) {
          // Play count-in click and show number on banner
          const isDownbeat = (this.countInBeat === 1);
          if (this.onMetronomeTick && this.metronomeEnabled) {
            this.onMetronomeTick(this.countInBeat - 1, isDownbeat, {
              isCountIn: true,
              count: this.countInBeat,
              total: this.countInTotal
            });
          }
          if (this.onCountIn) {
            this.onCountIn(this.countInBeat, this.countInTotal);
          }
          this.countInBeat++;
        } else {
          // Count in complete! This exact tick IS Beat 1 of Measure 1!
          this.isCountingIn = false;
          this.songStartTime = now;
          this.currentBeatIndex = 0;
          this.playheadBeats = 0;
          this.notifyState();
          if (this.onCountIn) {
            this.onCountIn(0, this.countInTotal); // Dismiss count-in banner cleanly at downbeat
          }

          // Trigger Beat 1 of Measure 1 click immediately
          const isDownbeat = true;
          if (this.onMetronomeTick && this.metronomeEnabled) {
            this.onMetronomeTick(0, isDownbeat, {
              isCountIn: false,
              beat: 1,
              total: beatsPerMeasure
            });
          }
          this.currentBeatIndex = 1;
        }
      } else {
        const beatInMeasure = (this.currentBeatIndex % beatsPerMeasure);
        const isDownbeat = (beatInMeasure === 0);

        if (this.onMetronomeTick && this.metronomeEnabled) {
          this.onMetronomeTick(beatInMeasure, isDownbeat, {
            isCountIn: false,
            beat: beatInMeasure + 1,
            total: beatsPerMeasure
          });
        }

        this.currentBeatIndex++;
      }

      nextTickTime += beatMs;
      const delay = Math.max(0, nextTickTime - performance.now());
      this.metronomeTimer = setTimeout(tick, delay);
    };

    // First tick immediately
    tick();

    if (this.isTimeDrivenMode()) {
      this.startTempoMonitor();
    }
  }

  /**
   * Re-align metronome to user's first note strike in Wait mode
   */
  alignMetronomeTo(anchorTime) {
    // Preserves steady, continuous metronome pulse without cancelling scheduled clicks or stalling
    if (this.metronomeEnabled && !this.metronomeTimer) {
      this.startMetronome();
    }
  }

  /**
   * Monitor note progress in In-Tempo and Strict Sight-Reading modes.
   * Advances the relentless playhead and auto-records expired notes as missed.
   */
  startTempoMonitor() {
    const beatMs = (60 / this.bpm) * 1000;

    const monitor = () => {
      if (this.isFinished || !this.isTimeDrivenMode()) return;

      if (!this.isCountingIn && !this.isAnalyzing && this.songStartTime !== null) {
        const now = performance.now();
        // Shift playhead so it visually represents what is currently audible from speakers
        const elapsedMs = Math.max(0, (now - this.latencyCompensationMs) - this.songStartTime);
        this.playheadBeats = elapsedMs / beatMs;

        if (this.onPlayheadMove) {
          this.onPlayheadMove(this.playheadBeats);
        }

        // Keep active target note synchronized directly with current playhead beats
        let advanced = false;
        while (this.noteIndex < this.currentMelody.notes.length) {
          const currentTarget = this.noteTimeline[this.noteIndex];
          if (!currentTarget) break;

          // Note physically sounds in ears at scheduled beat + latency compensation
          const noteExpectedTime = this.songStartTime + (currentTarget.startBeat * beatMs) + this.latencyCompensationMs;
          const noteDurationMs = currentTarget.duration * beatMs;
          // Tight musical grace window: max 140ms so target never lags behind current rhythm
          const graceMs = Math.min(140, noteDurationMs * 0.35);
          const noteExpiryTime = noteExpectedTime + noteDurationMs + graceMs;

          if (now > noteExpiryTime) {
            // Note expired without being struck -> Auto-advance as Missed
            const currentSlot = this.noteResults[this.noteIndex];
            if (currentSlot && currentSlot.status === 'pending') {
              currentSlot.status = 'missed';
              currentSlot.timing = { rating: 'missed', offsetMs: null, text: 'Missed' };

              this.stats.missedNotes++;
              this.stats.offBeatHits++;
              this.stats.streak = 0;
              this.previousNoteMissedOrMistake = true;
              this.calculateAccuracy();

              if (this.onTimingFeedback) {
                this.onTimingFeedback({
                  rating: 'missed',
                  offsetMs: null,
                  text: '🔴 Missed'
                });
              }
            }

            this.noteIndex++;
            advanced = true;
          } else {
            // Target is currently active
            break;
          }
        }

        if (advanced) {
          if (this.noteIndex >= this.currentMelody.notes.length) {
            this.finishMelody();
            return;
          } else {
            this.notifyState();
          }
        }
      }

      this.tempoMonitorRaf = requestAnimationFrame(monitor);
    };

    this.tempoMonitorRaf = requestAnimationFrame(monitor);
  }

  getCurrentTargetNote() {
    if (!this.currentMelody || this.isFinished) return null;
    return this.currentMelody.notes[this.noteIndex] || null;
  }

  /**
   * Evaluate timing accuracy for a played note
   * Direct parity with VST3 C++ MelodyScorer.cpp with Audio Latency Offset Compensation
   */
  evaluateTiming(now) {
    const beatMs = (60 / this.bpm) * 1000;
    let delta = 0;
    let rating, text, points;

    const target = this.getCurrentTargetNote();
    const targetDuration = target ? (target.duration || 1) : 1;

    // In Wait mode, Note 0 initiates phrase/song timing (exact VST3 MelodyScorer parity)
    if (this.mode === 'wait' && this.noteIndex === 0) {
      this.songStartTime = now;
      this.lastNoteTimestampMs = now;
      this.expectedCumulativeBeats = targetDuration;

      // In Wait mode: maintain uninterrupted, steady metronome pulse without stalling
      if (this.metronomeEnabled && !this.metronomeTimer) {
        this.startMetronome();
      }

      rating = 'perfect';
      points = 100;
      text = '🟢 Perfect (Start)';
      this.stats.perfectHits++;
      this.stats.rhythmPoints += points;
      return { rating, offsetMs: 0, rawOffsetMs: 0, text, points };
    }

    if (this.isTimeDrivenMode()) {
      // In Tempo and Strict modes: lock to timeline anchored to songStartTime
      if (this.songStartTime === null) {
        this.songStartTime = now;
      }
      const currentTarget = this.noteTimeline[this.noteIndex];
      const expectedTime = currentTarget
        ? (this.songStartTime + (currentTarget.startBeat * beatMs))
        : (this.songStartTime + (this.expectedCumulativeBeats * beatMs));
      
      const rawDelta = now - expectedTime;
      this.lastRawOffsetMs = Math.round(rawDelta);
      delta = rawDelta - this.latencyCompensationMs;

      this.lastNoteTimestampMs = now;
      this.expectedCumulativeBeats += targetDuration;
    } else {
      // In Wait mode: evaluate inter-onset duration from previous note (VST3 MelodyScorer parity)
      const prevIdx = this.noteIndex - 1;
      const prevNote = this.currentMelody ? this.currentMelody.notes[prevIdx] : null;
      const prevDuration = prevNote ? (prevNote.duration || 1) : 1;
      const expectedIntervalMs = prevDuration * beatMs;

      if (this.lastNoteTimestampMs !== null && this.lastNoteTimestampMs > 0) {
        const actualIntervalMs = now - this.lastNoteTimestampMs;
        delta = actualIntervalMs - expectedIntervalMs;
        this.lastRawOffsetMs = Math.round(delta);
      } else {
        delta = 0;
        this.lastRawOffsetMs = 0;
      }

      this.lastNoteTimestampMs = now;
      this.expectedCumulativeBeats += targetDuration;
    }

    const absDelta = Math.abs(delta);

    // Exact VST3 MelodyScorer thresholds (65ms tight, 150ms early/late, >150ms off-beat)
    if (absDelta <= 65) {
      rating = 'perfect';
      points = 100;
      text = `🟢 Perfect (${delta >= 0 ? '+' : ''}${Math.round(delta)}ms)`;
      this.stats.perfectHits++;
    } else if (absDelta <= 150) {
      points = 75;
      if (delta < 0) {
        rating = 'early';
        text = `🟡 Early (${Math.round(delta)}ms)`;
        this.stats.earlyHits++;
      } else {
        rating = 'late';
        text = `🟡 Late (+${Math.round(delta)}ms)`;
        this.stats.lateHits++;
      }
    } else {
      rating = 'off_beat';
      points = 30;
      text = `🔴 Off-beat (${delta >= 0 ? '+' : ''}${Math.round(delta)}ms)`;
      this.stats.offBeatHits++;
    }

    this.stats.rhythmPoints += points;
    return { rating, offsetMs: Math.round(delta), rawOffsetMs: this.lastRawOffsetMs, text, points };
  }

  /**
   * Process a played note from MIDI / virtual piano / computer keyboard
   */
  onNotePlayed(midi, velocity = 100) {
    if (this.isFinished || !this.currentMelody) return;

    if (this.isAnalyzing) {
      if (this.onTimingFeedback) {
        this.onTimingFeedback({ rating: 'analyzing', offsetMs: null, text: '👀 Silent Analysis Phase' });
      }
      return;
    }

    // If counting in tempo or strict mode, ignore or notify to wait
    if (this.isTimeDrivenMode() && this.isCountingIn) {
      if (this.onTimingFeedback) {
        this.onTimingFeedback({ rating: 'count_in', offsetMs: null, text: '⏳ Wait for Count-In!' });
      }
      return;
    }

    const now = performance.now();

    // 1. Post-completion lockout (protects against breath release vibration)
    const minCompletionGap = this.rhythmTapMode ? 50 : 140;
    if (now - this.lastCompletedTime < minCompletionGap) {
      return;
    }

    // 2. Same-note re-articulation protection
    if (this.rhythmTapMode) {
      // In rhythm tap mode, user intentionally taps the same note repeatedly
      this.heldNotes.delete(midi);
      if (now - this.lastPlayedTime < 50) return;
    } else if (midi === this.lastPlayedMidi) {
      if (this.heldNotes.has(midi)) return;
      if (now - this.lastPlayedTime < 180) return;
      const lastRel = this.lastReleaseTime.get(midi) || 0;
      if (now - lastRel < 50) return;
    }

    const targetNote = this.getCurrentTargetNote();
    if (!targetNote) return;

    this.lastPlayedMidi = midi;
    this.lastPlayedTime = now;
    this.heldNotes.add(midi);

    const expectedMidi = targetNote.midi;
    const isTimeDriven = this.isTimeDrivenMode();

    let isMatch = false;
    if (this.rhythmTapMode) {
      if (this.expectedTapMidi === null || this.noteIndex === 0) {
        this.expectedTapMidi = midi;
      }
      isMatch = (midi === this.expectedTapMidi || midi === expectedMidi);
    } else {
      isMatch = (midi === expectedMidi);
    }

    if (isMatch) {
      // Correct pitch / rhythm tap struck!
      const currentSlot = this.noteResults[this.noteIndex];
      const isFirstTry = currentSlot.mistakes === 0;

      // Evaluate beat timing
      const timing = this.evaluateTiming(now);

      if (this.rhythmTapMode) {
        if (timing.rating === 'perfect') {
          timing.text = `🎯 Perfect Beat! (${timing.offsetMs >= 0 ? '+' : ''}${timing.offsetMs}ms)`;
        } else if (timing.rating === 'early') {
          timing.text = `🟡 Early Beat (${timing.offsetMs}ms)`;
        } else if (timing.rating === 'late') {
          timing.text = `🟡 Late Beat (+${timing.offsetMs}ms)`;
        } else {
          timing.text = `🔴 Off-beat (${timing.offsetMs >= 0 ? '+' : ''}${timing.offsetMs}ms)`;
        }
        if (this.onRhythmTapFeedback) {
          this.onRhythmTapFeedback(timing);
        }
      }

      // Downbeat Recovery Bonus Check
      const timeSig = this.currentMelody.timeSignature || [4, 4];
      const beatsPerMeasure = timeSig[0] || 4;
      const isMeasureDownbeat = (targetNote.startBeat % beatsPerMeasure === 0);
      const isGoodTiming = (timing.rating === 'perfect' || timing.rating === 'early' || timing.rating === 'late');

      if (this.previousNoteMissedOrMistake && isGoodTiming && isMeasureDownbeat) {
        // Award Tempo Recovery Bonus!
        const bonus = 35;
        this.stats.recoveries = (this.stats.recoveries || 0) + 1;
        this.stats.recoveryPoints = (this.stats.recoveryPoints || 0) + bonus;
        timing.recovered = true;
        timing.text = `⚡ Recovery! +Bonus (${timing.offsetMs >= 0 ? '+' : ''}${timing.offsetMs}ms)`;

        if (this.onRecovery) {
          this.onRecovery({
            index: this.noteIndex,
            targetNote,
            recoveries: this.stats.recoveries,
            bonusPoints: bonus
          });
        }
        this.previousNoteMissedOrMistake = false;
      } else if (isGoodTiming) {
        this.previousNoteMissedOrMistake = false;
      }

      currentSlot.status = 'correct';
      currentSlot.playedMidi = midi;
      currentSlot.timing = timing;

      this.stats.correctNotes++;
      this.stats.streak++;
      if (this.stats.streak > this.stats.bestStreak) {
        this.stats.bestStreak = this.stats.streak;
      }

      this.calculateAccuracy();

      if (this.onTimingFeedback) {
        this.onTimingFeedback(timing);
      }

      if (this.onNoteSuccess) {
        this.onNoteSuccess(this.noteIndex, targetNote, isFirstTry, timing);
      }

      this.lastCompletedTime = now;
      this.noteIndex++;

      if (this.noteIndex >= this.currentMelody.notes.length) {
        this.finishMelody();
      } else {
        this.notifyState();
      }
    } else {
      // Incorrect pitch struck!
      const currentSlot = this.noteResults[this.noteIndex];
      currentSlot.mistakes++;
      currentSlot.lastWrongMidi = midi;
      if (!currentSlot.wrongNotes) currentSlot.wrongNotes = [];
      currentSlot.wrongNotes.push(midi);
      currentSlot.status = 'mistake';

      this.stats.mistakeCount++;
      this.stats.streak = 0;
      this.previousNoteMissedOrMistake = true;

      const expectedInfo = this.rhythmTapMode && this.expectedTapMidi !== null
        ? MusicTheory.getNoteInfo(this.expectedTapMidi)
        : MusicTheory.getNoteInfo(expectedMidi);
      const playedInfo = MusicTheory.getNoteInfo(midi);

      if (isTimeDriven) {
        // IN TIME-DRIVEN (IN-TEMPO / STRICT / FIRST-READ) MODES:
        // Evaluate rhythmic timeliness so user is scored for keeping time!
        const timing = this.evaluateTiming(now);
        currentSlot.timing = timing;

        const rhythmText = timing.rating === 'perfect' ? '🟢 Great Rhythm!' :
                           (timing.rating === 'early' || timing.rating === 'late') ? `🟡 In Tempo (${timing.offsetMs}ms)` : '🔴 Off-beat';

        if (this.onTimingFeedback) {
          this.onTimingFeedback({
            rating: timing.rating,
            offsetMs: timing.offsetMs,
            text: this.rhythmTapMode
              ? `❌ Tap ${expectedInfo.fullName} • ${rhythmText}`
              : `❌ ${playedInfo.fullName} • ${rhythmText}`
          });
        }

        if (this.rhythmTapMode && this.onRhythmTapFeedback) {
          this.onRhythmTapFeedback({
            rating: 'mistake',
            offsetMs: timing.offsetMs,
            text: `❌ Tap ${expectedInfo.fullName}`
          });
        }

        if (this.onNoteMistake) {
          this.onNoteMistake(this.noteIndex, expectedInfo, playedInfo, timing);
        }

        this.calculateAccuracy();
        this.lastCompletedTime = now;

        // Advance to next note slot immediately (No-Pause Metronome: never wait for pitch fix!)
        this.noteIndex++;
        if (this.noteIndex >= this.currentMelody.notes.length) {
          this.finishMelody();
        } else {
          this.notifyState();
        }
      } else {
        // Traditional Wait mode: wait for correction
        this.calculateAccuracy();

        if (this.onTimingFeedback) {
          this.onTimingFeedback({
            rating: 'mistake',
            offsetMs: null,
            text: `❌ Played ${playedInfo.fullName} (Expected ${expectedInfo.fullName})`
          });
        }

        if (this.onNoteMistake) {
          this.onNoteMistake(this.noteIndex, expectedInfo, playedInfo);
        }

        // Forward progression check in Wait mode:
        // If the note struck matches the NEXT expected note in the melody,
        // the user has progressed past the mistaken note rather than stopping to correct it.
        const nextIndex = this.noteIndex + 1;
        const nextTarget = (nextIndex < this.currentMelody.notes.length) ? this.currentMelody.notes[nextIndex] : null;

        if (nextTarget && midi === nextTarget.midi) {
          // Advance to next note and register this strike as the hit for next note!
          this.noteIndex = nextIndex;
          const nextSlot = this.noteResults[this.noteIndex];
          nextSlot.status = 'correct';
          nextSlot.playedMidi = midi;
          this.stats.correctNotes++;
          this.stats.streak++;
          if (this.stats.streak > this.stats.bestStreak) {
            this.stats.bestStreak = this.stats.streak;
          }
          this.calculateAccuracy();

          if (this.onTimingFeedback) {
            this.onTimingFeedback({
              rating: 'good',
              offsetMs: null,
              text: `✓ Advanced to ${MusicTheory.getNoteInfo(midi).fullName}`
            });
          }

          if (this.onNoteSuccess) {
            this.onNoteSuccess(this.noteIndex, nextTarget, true, { rating: 'good', offsetMs: 0 });
          }

          this.lastCompletedTime = now;
          this.noteIndex++;

          if (this.noteIndex >= this.currentMelody.notes.length) {
            this.finishMelody();
          } else {
            this.notifyState();
          }
          return;
        }

        this.notifyState();
      }
    }
  }

  onNoteReleased(midi) {
    this.heldNotes.delete(midi);
    this.lastReleaseTime.set(midi, performance.now());
    if (this.heldNotes.size === 0) {
      this.lastPlayedMidi = -1;
    }
  }

  calculateAccuracy() {
    // Pitch Accuracy: (correct / total attempts + missed)
    const pitchDenominator = this.stats.correctNotes + this.stats.mistakeCount + this.stats.missedNotes;
    if (pitchDenominator === 0) {
      this.stats.accuracy = 100;
    } else {
      this.stats.accuracy = Math.max(0, Math.round((this.stats.correctNotes / pitchDenominator) * 100));
    }

    // Rhythm Accuracy: points earned vs max possible points for processed notes
    const processedNotes = this.stats.correctNotes + this.stats.missedNotes + (this.isTimeDrivenMode() ? this.stats.mistakeCount : 0);
    if (processedNotes === 0) {
      this.stats.rhythmAccuracy = 100;
    } else {
      const maxPossibleRhythm = processedNotes * 100;
      const totalRhythmWithBonus = this.stats.rhythmPoints + (this.stats.recoveryPoints || 0);
      this.stats.rhythmAccuracy = Math.max(0, Math.min(100, Math.round((totalRhythmWithBonus / maxPossibleRhythm) * 100)));
    }

    // Composite Sight-Reading Score (Rhythm timeliness first, Pitch second)
    if (this.isTimeDrivenMode()) {
      this.stats.sightReadingScore = Math.max(0, Math.min(100, Math.round(
        (this.stats.rhythmAccuracy * 0.60) + (this.stats.accuracy * 0.40)
      )));
    }
  }

  finishMelody() {
    this.stopMetronome();
    this.isFinished = true;
    this.stats.endTime = performance.now();
    this.calculateAccuracy();

    const durationSeconds = Math.max(1, Math.round((this.stats.endTime - this.stats.startTime) / 1000));

    // Calculate stars factoring pitch accuracy and rhythm accuracy (VST3 MelodyScorer parity)
    let stars = 1;
    if (this.stats.accuracy >= 95 && this.stats.rhythmAccuracy >= 85) {
      stars = 3;
    } else if (this.stats.accuracy >= 80 && this.stats.rhythmAccuracy >= 65) {
      stars = 2;
    } else {
      stars = 1;
    }

    const summary = {
      melody: this.currentMelody,
      accuracy: this.stats.accuracy,
      rhythmAccuracy: this.stats.rhythmAccuracy,
      sightReadingScore: this.stats.sightReadingScore || Math.round((this.stats.rhythmAccuracy * 0.60) + (this.stats.accuracy * 0.40)),
      recoveries: this.stats.recoveries || 0,
      perfectHits: this.stats.perfectHits,
      greatHits: this.stats.earlyHits + this.stats.lateHits,
      goodHits: this.stats.goodHits,
      offBeatHits: this.stats.offBeatHits,
      missedNotes: this.stats.missedNotes,
      correctNotes: this.stats.correctNotes,
      mistakeCount: this.stats.mistakeCount,
      noteResults: this.noteResults,
      bestStreak: this.stats.bestStreak,
      durationSeconds,
      mode: this.mode,
      bpm: this.bpm,
      stars
    };

    if (this.mode === 'first_read') {
      const record = {
        melodyId: this.currentMelody.id,
        title: this.currentMelody.title,
        composer: this.currentMelody.composer,
        difficulty: this.currentMelody.difficulty,
        timestamp: Date.now(),
        dateStr: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        pitchAccuracy: this.stats.accuracy,
        rhythmAccuracy: this.stats.rhythmAccuracy,
        sightReadingScore: summary.sightReadingScore,
        recoveries: this.stats.recoveries || 0,
        stars,
        durationSeconds,
        bpm: this.bpm
      };
      this.saveFirstReadRecord(this.currentMelody.id, record);
      summary.isFirstRead = true;
      summary.firstReadRecord = record;
    }

    this.notifyState();

    if (this.onComplete) {
      this.onComplete(summary);
    }
  }

  getMistakeIndices() {
    const indices = [];
    if (!this.noteResults) return indices;
    for (let i = 0; i < this.noteResults.length; i++) {
      if (this.noteResults[i].mistakes > 0 || this.noteResults[i].status === 'mistake' || this.noteResults[i].status === 'missed') {
        indices.push(i);
      }
    }
    return indices;
  }

  getFirstMistakeIndex() {
    const mistakes = this.getMistakeIndices();
    return mistakes.length > 0 ? mistakes[0] : -1;
  }

  getMistakeReviewDetails(index, preferFlats = false) {
    if (!this.currentMelody || index < 0 || index >= this.currentMelody.notes.length) return null;
    const targetNote = this.currentMelody.notes[index];
    const res = this.noteResults[index] || { mistakes: 0, wrongNotes: [], lastWrongMidi: null };
    const targetInfo = MusicTheory.getNoteInfo(targetNote.midi, preferFlats);
    const wrongMidi = res.lastWrongMidi;
    const wrongInfo = wrongMidi !== null ? MusicTheory.getNoteInfo(wrongMidi, preferFlats) : null;

    return {
      index,
      targetMidi: targetNote.midi,
      targetName: targetInfo.fullName,
      wrongMidi,
      wrongName: wrongInfo ? wrongInfo.fullName : '?',
      mistakeAttempts: res.mistakes,
      timing: res.timing,
      offsetMs: res.timing ? res.timing.offsetMs : 0,
      duration: targetNote.duration
    };
  }

  notifyState() {
    if (this.onStateChange) {
      this.onStateChange({
        melody: this.currentMelody,
        noteIndex: this.noteIndex,
        totalNotes: this.currentMelody ? this.currentMelody.notes.length : 0,
        targetNote: this.getCurrentTargetNote(),
        noteResults: this.noteResults,
        stats: { ...this.stats },
        isFinished: this.isFinished,
        mode: this.mode,
        bpm: this.bpm,
        metronomeEnabled: this.metronomeEnabled,
        isCountingIn: this.isCountingIn,
        countInBeat: this.countInBeat,
        countInTotal: this.countInTotal,
        playheadBeats: this.playheadBeats,
        isAnalyzing: this.isAnalyzing,
        analysisSecondsRemaining: this.analysisSecondsRemaining,
        analysisTotalSeconds: this.analysisTotalSeconds,
        recoveries: this.stats.recoveries || 0,
        sightReadingScore: this.stats.sightReadingScore,
        isFirstReadLocked: this.isMelodyFirstReadLocked(this.currentMelody?.id),
        firstReadRecord: this.getFirstReadRecord(this.currentMelody?.id),
        mistakeIndices: this.getMistakeIndices()
      });
    }
  }
}

