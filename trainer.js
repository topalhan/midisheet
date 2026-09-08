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
    this.mode = 'wait'; // 'wait' (wait-for-note) or 'tempo' (strict timing)
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
      streak: 0,
      bestStreak: 0,
      accuracy: 100, // Pitch accuracy %
      rhythmAccuracy: 100, // Rhythm accuracy %
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
    this.onComplete = null;

    // Load default melody
    this.loadMelody(this.melodies[0].id);
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
      streak: 0,
      bestStreak: 0,
      accuracy: 100,
      rhythmAccuracy: 100,
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

    // Start metronome / countdown if enabled or in tempo mode
    if (this.mode === 'tempo' || this.metronomeEnabled) {
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
    if (this.metronomeTimer || this.mode === 'tempo') {
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
    this.countInTotal = beatsPerMeasure;
    this.currentBeatIndex = 0;

    const beatMs = (60 / this.bpm) * 1000;

    if (this.mode === 'tempo') {
      this.isCountingIn = true;
      this.countInBeat = 1;
      this.songStartTime = null;
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

      if (this.mode === 'tempo' && this.isCountingIn) {
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
        if (this.countInBeat > this.countInTotal) {
          // Count in complete! Song starts on next interval
          this.isCountingIn = false;
          this.songStartTime = nextTickTime + beatMs;
          this.currentBeatIndex = 0;
          if (this.onCountIn) {
            this.onCountIn(0, this.countInTotal); // Dismiss count-in
          }
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

    if (this.mode === 'tempo') {
      this.startTempoMonitor();
    }
  }

  /**
   * Re-align metronome to user's first note strike in Wait mode
   */
  alignMetronomeTo(anchorTime) {
    if (!this.metronomeEnabled || this.mode === 'tempo') return;
    this.stopMetronome();

    const timeSig = this.currentMelody ? (this.currentMelody.timeSignature || [4, 4]) : [4, 4];
    const beatsPerMeasure = timeSig[0] || 4;
    const beatMs = (60 / this.bpm) * 1000;

    // Note 0 was struck on Beat 0 (Measure 1 Beat 1); schedule next tick on Beat 2
    this.currentBeatIndex = 1;
    let nextTickTime = anchorTime + beatMs;

    const tick = () => {
      if (this.isFinished || this.mode !== 'wait' || !this.metronomeEnabled) {
        this.stopMetronome();
        return;
      }

      const now = performance.now();
      this.lastBeatTime = now;

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
      nextTickTime += beatMs;
      const delay = Math.max(0, nextTickTime - performance.now());
      this.metronomeTimer = setTimeout(tick, delay);
    };

    const initialDelay = Math.max(0, nextTickTime - performance.now());
    this.metronomeTimer = setTimeout(tick, initialDelay);
  }

  /**
   * Monitor note progress in Tempo mode.
   * If note window has passed without being hit, auto-advance and record as missed.
   */
  startTempoMonitor() {
    const beatMs = (60 / this.bpm) * 1000;

    const monitor = () => {
      if (this.isFinished || this.mode !== 'tempo') return;

      if (!this.isCountingIn && this.songStartTime !== null && this.noteIndex < this.currentMelody.notes.length) {
        const now = performance.now();
        const currentTarget = this.noteTimeline[this.noteIndex];
        if (currentTarget) {
          const noteExpectedTime = this.songStartTime + (currentTarget.startBeat * beatMs);
          const noteDurationMs = currentTarget.duration * beatMs;
          // Note expires when playback moves past the note duration plus an expiration grace window
          const noteExpiryTime = noteExpectedTime + Math.max(noteDurationMs, 280);

          if (now > noteExpiryTime) {
            // Note was not played in time -> Auto-advance as Missed
            const currentSlot = this.noteResults[this.noteIndex];
            currentSlot.status = 'missed';
            currentSlot.timing = { rating: 'missed', offsetMs: null, text: 'Missed' };

            this.stats.missedNotes++;
            this.stats.offBeatHits++;
            this.stats.streak = 0;
            this.calculateAccuracy();

            if (this.onTimingFeedback) {
              this.onTimingFeedback({
                rating: 'missed',
                offsetMs: null,
                text: '🔴 Missed'
              });
            }

            this.noteIndex++;
            if (this.noteIndex >= this.currentMelody.notes.length) {
              this.finishMelody();
              return;
            } else {
              this.notifyState();
            }
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
   * Direct parity with VST3 C++ MelodyScorer.cpp
   */
  evaluateTiming(now) {
    const beatMs = (60 / this.bpm) * 1000;
    let delta = 0;
    let rating, text, points;

    const target = this.getCurrentTargetNote();
    const targetDuration = target ? (target.duration || 1) : 1;

    // Note 0 initiates phrase/song timing (exact VST3 MelodyScorer parity)
    if (this.noteIndex === 0) {
      this.songStartTime = now;
      this.lastNoteTimestampMs = now;
      this.expectedCumulativeBeats = targetDuration;

      // In Wait mode, re-align metronome to Note 0 downbeat if metronome is active
      if (this.mode === 'wait' && this.metronomeEnabled) {
        this.alignMetronomeTo(now);
      }

      rating = 'perfect';
      points = 100;
      text = '🟢 Perfect (Start)';
      this.stats.perfectHits++;
      this.stats.rhythmPoints += points;
      return { rating, offsetMs: 0, text, points };
    }

    if (this.mode === 'tempo') {
      // In Tempo mode: lock to timeline anchored to songStartTime
      if (this.songStartTime !== null) {
        const currentTarget = this.noteTimeline[this.noteIndex];
        const expectedTime = currentTarget
          ? (this.songStartTime + (currentTarget.startBeat * beatMs))
          : (this.songStartTime + (this.expectedCumulativeBeats * beatMs));
        delta = now - expectedTime;
      } else {
        delta = 0;
      }
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
      } else {
        delta = 0;
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
    return { rating, offsetMs: Math.round(delta), text, points };
  }

  /**
   * Process a played note from MIDI / virtual piano / computer keyboard
   */
  onNotePlayed(midi, velocity = 100) {
    if (this.isFinished || !this.currentMelody) return;

    // If counting in tempo mode, ignore or notify to wait
    if (this.mode === 'tempo' && this.isCountingIn) {
      if (this.onTimingFeedback) {
        this.onTimingFeedback({ rating: 'count_in', offsetMs: null, text: '⏳ Wait for Count-In!' });
      }
      return;
    }

    const now = performance.now();

    // 1. Post-completion lockout (protects against breath release vibration)
    if (now - this.lastCompletedTime < 140) {
      return;
    }

    // 2. Same-note re-articulation protection for wind controllers
    if (midi === this.lastPlayedMidi) {
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

    if (midi === expectedMidi) {
      // Correct pitch struck!
      const currentSlot = this.noteResults[this.noteIndex];
      const isFirstTry = currentSlot.mistakes === 0;

      // Evaluate beat timing
      const timing = this.evaluateTiming(now);

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

      this.calculateAccuracy();

      const expectedInfo = MusicTheory.getNoteInfo(expectedMidi);
      const playedInfo = MusicTheory.getNoteInfo(midi);

      if (this.onNoteMistake) {
        this.onNoteMistake(this.noteIndex, expectedInfo, playedInfo);
      }

      this.notifyState();
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
    const processedNotes = this.stats.correctNotes + this.stats.missedNotes;
    if (processedNotes === 0) {
      this.stats.rhythmAccuracy = 100;
    } else {
      const maxPossibleRhythm = processedNotes * 100;
      this.stats.rhythmAccuracy = Math.max(0, Math.min(100, Math.round((this.stats.rhythmPoints / maxPossibleRhythm) * 100)));
    }
  }

  finishMelody() {
    this.stopMetronome();
    this.isFinished = true;
    this.stats.endTime = performance.now();
    this.calculateAccuracy();

    const durationSeconds = Math.round((this.stats.endTime - this.stats.startTime) / 1000);

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
        mistakeIndices: this.getMistakeIndices()
      });
    }
  }
}

