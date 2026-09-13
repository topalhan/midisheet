/**
 * Daily Training Routine Controller (20-Minute Master Class Engine)
 * Strictly executes the 4-Block Curriculum:
 * - Block 1: Mechanical Calibration (5 min: Awkward Pairs 60 BPM + Klosé Broken Thirds)
 * - Block 2: Pre-Flight Analysis (5 min: Paul Harris Rhythm Tap + Visual Interval Audit)
 * - Block 3: The Cold Sight-Read (7 min: Take 1 Strict + Targeted Fix Loop + Take 2 Lookahead)
 * - Block 4: Volume Flash Reading (3 min: 3 Lines with 10s Flash Scan + Strict Single-Play Lockout)
 */

import { 
  getAwkwardPairs, 
  generateBrokenThirds, 
  getSightReadingExcerpt, 
  getFlashReadingLines, 
  KEY_DEFINITIONS 
} from './routine_exercises.js';
import { MusicTheory } from './chords.js';

export class DailyRoutineController {
  constructor(trainer, audio, notation, options = {}) {
    this.trainer = trainer;
    this.audio = audio;
    this.notation = notation;

    // Routine configuration
    this.targetKey = 'C Major';
    this.totalDurationSeconds = 1200; // 20 minutes (strict master clock)
    this.totalElapsedSeconds = 0;
    this.isRunning = false;
    this.timerInterval = null;

    // Sub-phase tracking
    this.currentSubPhaseIndex = 0;
    this.subPhaseElapsedSeconds = 0;
    this.subPhases = [];

    // Block 2 rhythm tapping tracking
    this.lastTapFeedback = null;
    this.rhythmTapScores = [];

    // Block 3 Take 1 results for targeted fix
    this.take1Excerpt = null;
    this.take1Mistakes = [];
    this.targetedFixExercise = null;

    // Block 4 Flash Reading tracking
    this.flashPreviewActive = false;
    this.flashCountdownSeconds = 10;
    this.completedFlashLines = new Set();

    // Routine aggregate stats
    this.routineStats = {
      notesPlayed: 0,
      correctNotes: 0,
      recoveries: 0,
      recoveryPoints: 0,
      rhythmHits: 0,
      totalTaps: 0,
      goodTaps: 0
    };

    // UI callbacks
    this.onTick = options.onTick || null;
    this.onPhaseChange = options.onPhaseChange || null;
    this.onComplete = options.onComplete || null;
    this.onTapFeedback = options.onTapFeedback || null;
    this.onFlashCountdown = options.onFlashCountdown || null;

    // Build plan for initial key
    this.buildPlan();
  }

  setTargetKey(keyName) {
    if (!KEY_DEFINITIONS[keyName]) return;
    this.targetKey = keyName;
    if (!this.isRunning) {
      this.buildPlan();
      this.loadSubPhase(0);
    }
  }

  buildPlan() {
    const key = this.targetKey;
    const excerpt = getSightReadingExcerpt(key);
    this.take1Excerpt = excerpt;
    const flashLines = getFlashReadingLines(key);

    this.subPhases = [
      // -------------------------------------------------------------
      // BLOCK 1: Mechanical Calibration (5 Minutes)
      // -------------------------------------------------------------
      {
        id: 'block1_awkward',
        blockIndex: 1,
        blockName: 'Block 1: Mechanical Calibration',
        blockTotalMinutes: 5,
        title: 'Part 1: Isolated Awkward Pairs (60 BPM)',
        durationSeconds: 120, // 2 minutes
        bpm: 60,
        type: 'awkward',
        exercise: getAwkwardPairs(key),
        methodology: 'Muscle memory & awkward intervals. Slur slowly at 60 BPM. Ensure fingers snap down/lift as unified blocks with zero hand tension. Tactile execution without reading pressure.',
        strictMode: false,
        waitMode: true,
        lookahead: false,
        audioMuted: false
      },
      {
        id: 'block1_thirds',
        blockIndex: 1,
        blockName: 'Block 1: Mechanical Calibration',
        blockTotalMinutes: 5,
        title: 'Part 2: Diatonic Broken Thirds (Klosé Intervals)',
        durationSeconds: 180, // 3 minutes
        bpm: 76,
        type: 'thirds',
        exercise: generateBrokenThirds(key, 76),
        methodology: `Klosé diatonic broken thirds in ${key}. Focus on continuous, unbroken sound and smooth physical transitions across finger registers.`,
        strictMode: false,
        waitMode: true,
        lookahead: false,
        audioMuted: false
      },

      // -------------------------------------------------------------
      // BLOCK 2: Pre-Flight Analysis (Paul Harris Method - 5 Minutes)
      // -------------------------------------------------------------
      {
        id: 'block2_rhythm',
        blockIndex: 2,
        blockName: 'Block 2: Pre-Flight Analysis',
        blockTotalMinutes: 5,
        title: 'Part 1: Rhythm Tap & Subdivision (Paul Harris)',
        durationSeconds: 120, // 2 minutes
        bpm: excerpt.bpm || 96,
        type: 'rhythm_tap',
        exercise: excerpt,
        methodology: 'Instrument audio is MUTED. Metronome is clicking. Tap the rhythm along (tap button or Spacebar) and vocalize subdivisions aloud ("1-e-&-a 2-e-&-a").',
        strictMode: false,
        waitMode: false,
        interactiveTap: true,
        lookahead: false,
        audioMuted: true
      },
      {
        id: 'block2_audit',
        blockIndex: 2,
        blockName: 'Block 2: Pre-Flight Analysis',
        blockTotalMinutes: 5,
        title: 'Part 2: Visual Interval Audit & Ghost-Fingering',
        durationSeconds: 180, // 3 minutes
        bpm: excerpt.bpm || 96,
        type: 'audit',
        exercise: excerpt,
        methodology: 'Trace the melodic contour across the staff (steps vs leaps) with interval ribbons. Do NOT name note letters. Silently pre-finger keys on your instrument without blowing/striking.',
        strictMode: false,
        waitMode: true,
        lookahead: false,
        audioMuted: true
      },

      // -------------------------------------------------------------
      // BLOCK 3: The Cold Sight-Read (7 Minutes)
      // -------------------------------------------------------------
      {
        id: 'block3_take1',
        blockIndex: 3,
        blockName: 'Block 3: The Cold Sight-Read',
        blockTotalMinutes: 7,
        title: 'Take 1: Cold Strict Sight-Read (No Stopping!)',
        durationSeconds: 150, // 2.5 minutes
        bpm: excerpt.bpm || 96,
        type: 'take1',
        exercise: excerpt,
        methodology: 'Strict execution with metronome: Never stop, restart, or hesitate! Keep steady time. Jump back in immediately on downbeats to earn Downbeat Recovery bonuses.',
        strictMode: true,
        waitMode: false,
        lookahead: false,
        audioMuted: false
      },
      {
        id: 'block3_fix',
        blockIndex: 3,
        blockName: 'Block 3: The Cold Sight-Read',
        blockTotalMinutes: 7,
        title: 'Targeted Fix: Isolate & Loop Stumbling Measure',
        durationSeconds: 120, // 2 minutes
        bpm: Math.max(60, (excerpt.bpm || 96) - 16),
        type: 'targeted_fix',
        exercise: null, // Generated dynamically after Take 1
        methodology: 'Isolating the stumbling measure from Take 1. Loop repeatedly at a steady, controlled tempo until finger hesitation vanishes.',
        strictMode: false,
        waitMode: false,
        lookahead: false,
        audioMuted: false
      },
      {
        id: 'block3_take2',
        blockIndex: 3,
        blockName: 'Block 3: The Cold Sight-Read',
        blockTotalMinutes: 7,
        title: 'Take 2: Buffered Read (Eye-Ahead Lookahead)',
        durationSeconds: 150, // 2.5 minutes
        bpm: excerpt.bpm || 96,
        type: 'take2',
        exercise: excerpt,
        methodology: 'Lookahead buffer active: The eye cursor leads 1 full measure ahead of the playhead. Push your visual attention ahead while fingers execute from buffer memory.',
        strictMode: true,
        waitMode: false,
        lookahead: true,
        audioMuted: false
      },

      // -------------------------------------------------------------
      // BLOCK 4: Volume Flash Reading (3 Minutes)
      // -------------------------------------------------------------
      {
        id: 'block4_flash1',
        blockIndex: 4,
        blockName: 'Block 4: Volume Flash Reading',
        blockTotalMinutes: 3,
        title: 'Line 1 of 3: 10s Flash Scan -> Single Play',
        durationSeconds: 60, // 1 minute
        bpm: flashLines[0]?.bpm || 108,
        type: 'flash',
        lineIndex: 0,
        flashPreview: 10,
        exercise: flashLines[0],
        methodology: 'Scan the 4-bar line for 10 seconds without playing. Then play straight through ONCE at tempo. Single-play lockout rule enforced!',
        strictMode: true,
        waitMode: false,
        lookahead: false,
        audioMuted: false
      },
      {
        id: 'block4_flash2',
        blockIndex: 4,
        blockName: 'Block 4: Volume Flash Reading',
        blockTotalMinutes: 3,
        title: 'Line 2 of 3: 10s Flash Scan -> Single Play',
        durationSeconds: 60, // 1 minute
        bpm: flashLines[1]?.bpm || 108,
        type: 'flash',
        lineIndex: 1,
        flashPreview: 10,
        exercise: flashLines[1],
        methodology: 'Second flash line! 10s scan preview -> One brisk playthrough. Absorb shapes and cadence patterns at a glance.',
        strictMode: true,
        waitMode: false,
        lookahead: false,
        audioMuted: false
      },
      {
        id: 'block4_flash3',
        blockIndex: 4,
        blockName: 'Block 4: Volume Flash Reading',
        blockTotalMinutes: 3,
        title: 'Line 3 of 3: 10s Flash Scan -> Single Play',
        durationSeconds: 60, // 1 minute
        bpm: flashLines[2]?.bpm || 112,
        type: 'flash',
        lineIndex: 2,
        flashPreview: 10,
        exercise: flashLines[2],
        methodology: 'Final flash line! Lock in automatic sight-reading reflexes. Scan for 10s, then play through cleanly once.',
        strictMode: true,
        waitMode: false,
        lookahead: false,
        audioMuted: false
      }
    ];
  }

  getCurrentPhase() {
    return this.subPhases[this.currentSubPhaseIndex] || null;
  }

  startOrResume() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Load current phase if not loaded
    this.loadSubPhase(this.currentSubPhaseIndex, false);

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => this.tick(), 1000);
    this.notifyTick();
  }

  pause() {
    this.isRunning = false;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.trainer) {
      this.trainer.stopMetronome();
    }
    if (this.audio) {
      if (typeof this.audio.setSynthMute === 'function') {
        this.audio.setSynthMute(false);
      } else {
        this.audio.isMuted = false;
      }
    }
    this.notifyTick();
  }

  togglePlay() {
    if (this.isRunning) {
      this.pause();
    } else {
      this.startOrResume();
    }
  }

  reset() {
    this.pause();
    this.totalElapsedSeconds = 0;
    this.currentSubPhaseIndex = 0;
    this.subPhaseElapsedSeconds = 0;
    this.flashPreviewActive = false;
    this.flashCountdownSeconds = 10;
    this.completedFlashLines.clear();
    this.rhythmTapScores = [];
    this.take1Mistakes = [];
    this.targetedFixExercise = null;
    this.routineStats = {
      notesPlayed: 0,
      correctNotes: 0,
      recoveries: 0,
      recoveryPoints: 0,
      rhythmHits: 0,
      totalTaps: 0,
      goodTaps: 0
    };
    this.buildPlan();
    this.loadSubPhase(0);
  }

  skipSubPhase() {
    if (this.currentSubPhaseIndex < this.subPhases.length - 1) {
      this.currentSubPhaseIndex++;
      this.subPhaseElapsedSeconds = 0;
      this.loadSubPhase(this.currentSubPhaseIndex);
    } else {
      this.finishRoutine();
    }
  }

  prevSubPhase() {
    if (this.currentSubPhaseIndex > 0) {
      this.currentSubPhaseIndex--;
      this.subPhaseElapsedSeconds = 0;
      this.loadSubPhase(this.currentSubPhaseIndex);
    }
  }

  loadSubPhase(index, autoStartExercise = true) {
    if (index < 0 || index >= this.subPhases.length) return;
    this.currentSubPhaseIndex = index;
    this.subPhaseElapsedSeconds = 0;
    const phase = this.subPhases[index];

    // Determine exercise
    let exercise = phase.exercise;

    // Dynamically build Targeted Fix exercise if needed
    if (phase.type === 'targeted_fix') {
      if (!this.targetedFixExercise) {
        this.targetedFixExercise = this.buildTargetedFixExercise();
      }
      exercise = this.targetedFixExercise;
      phase.exercise = exercise;
    }

    // Configure Audio Engine Muting (Synth silent, metronome active!)
    if (this.audio) {
      if (typeof this.audio.setSynthMute === 'function') {
        this.audio.setSynthMute(!!phase.audioMuted);
      } else {
        this.audio.isMuted = !!phase.audioMuted;
      }
    }

    // Configure Lookahead Buffer Option
    if (this.notation) {
      this.notation.setOption('decoupledEyeCursor', !!phase.lookahead);
    }

    // Configure Trainer
    if (this.trainer && exercise) {
      this.trainer.loadMelodyObject(exercise);
      this.trainer.bpm = phase.bpm || exercise.bpm || 96;

      if (phase.strictMode) {
        this.trainer.mode = 'strict';
      } else if (phase.waitMode) {
        this.trainer.mode = 'wait';
      } else {
        this.trainer.mode = 'tempo';
      }

      // Handle Flash Reading preview countdown
      if (phase.type === 'flash') {
        this.startFlashPreview(phase);
      } else {
        this.flashPreviewActive = false;
        if (this.isRunning && autoStartExercise && !phase.waitMode) {
          this.trainer.startMetronome();
        }
      }
    }

    if (this.onPhaseChange) {
      this.onPhaseChange(phase, this.getProgress());
    }

    this.notifyTick();
  }

  startFlashPreview(phase) {
    this.flashPreviewActive = true;
    this.flashCountdownSeconds = phase.flashPreview || 10;
    if (this.trainer) {
      this.trainer.stopMetronome();
    }
    if (this.onFlashCountdown) {
      this.onFlashCountdown(this.flashCountdownSeconds, phase);
    }
  }

  tick() {
    if (!this.isRunning) return;

    this.totalElapsedSeconds++;
    this.subPhaseElapsedSeconds++;

    const phase = this.getCurrentPhase();
    if (!phase) {
      this.finishRoutine();
      return;
    }

    // Handle Flash preview countdown in Block 4
    if (this.flashPreviewActive) {
      this.flashCountdownSeconds--;
      if (this.onFlashCountdown) {
        this.onFlashCountdown(this.flashCountdownSeconds, phase);
      }
      if (this.flashCountdownSeconds <= 0) {
        this.flashPreviewActive = false;
        if (this.trainer) {
          this.trainer.startMetronome();
        }
      }
    }

    // Check if sub-phase duration elapsed
    if (this.subPhaseElapsedSeconds >= phase.durationSeconds) {
      this.skipSubPhase();
      return;
    }

    // Check if master 20 minutes finished
    if (this.totalElapsedSeconds >= this.totalDurationSeconds) {
      this.finishRoutine();
      return;
    }

    this.notifyTick();
  }

  notifyTick() {
    if (this.onTick) {
      this.onTick(this.getProgress());
    }
  }

  getProgress() {
    const phase = this.getCurrentPhase();
    const phaseRemaining = phase ? Math.max(0, phase.durationSeconds - this.subPhaseElapsedSeconds) : 0;
    const totalRemaining = Math.max(0, this.totalDurationSeconds - this.totalElapsedSeconds);

    return {
      phase,
      phaseIndex: this.currentSubPhaseIndex,
      totalPhases: this.subPhases.length,
      phaseElapsed: this.subPhaseElapsedSeconds,
      phaseDuration: phase ? phase.durationSeconds : 0,
      phaseRemaining,
      totalElapsed: this.totalElapsedSeconds,
      totalDuration: this.totalDurationSeconds,
      totalRemaining,
      percentTotal: Math.min(100, Math.round((this.totalElapsedSeconds / this.totalDurationSeconds) * 100)),
      isRunning: this.isRunning,
      targetKey: this.targetKey,
      flashPreviewActive: this.flashPreviewActive,
      flashCountdownSeconds: this.flashCountdownSeconds,
      streak: this.getStreak()
    };
  }

  /**
   * Block 2A Rhythm Tap Handler
   * Evaluates user tap against the active metronome beat
   */
  registerRhythmTap() {
    if (!this.trainer) return null;
    const phase = this.getCurrentPhase();
    if (!phase || phase.type !== 'rhythm_tap') return null;

    const now = performance.now();
    const bpm = phase.bpm || 96;
    const beatIntervalMs = (60 / bpm) * 1000;

    let offsetMs = 0;
    if (this.trainer.lastBeatTime > 0) {
      const sinceLastBeat = now - this.trainer.lastBeatTime;
      const mod = sinceLastBeat % beatIntervalMs;
      // Nearest beat distance
      offsetMs = mod < beatIntervalMs / 2 ? mod : mod - beatIntervalMs;
    } else {
      offsetMs = 0;
    }

    // Incorporate hardware calibration offset if configured
    if (this.trainer.latencyCompensationMs) {
      offsetMs -= this.trainer.latencyCompensationMs;
    }

    const absOffset = Math.abs(offsetMs);
    let rating = 'good';
    let label = 'Good Rhythm!';
    let color = '#38bdf8';

    if (absOffset <= 50) {
      rating = 'perfect';
      label = 'Perfect Beat! 🎯';
      color = '#10b981';
      this.routineStats.goodTaps++;
    } else if (absOffset <= 120) {
      rating = offsetMs < 0 ? 'early' : 'late';
      label = offsetMs < 0 ? `Early (${Math.round(offsetMs)}ms)` : `Late (+${Math.round(offsetMs)}ms)`;
      color = '#f59e0b';
      this.routineStats.goodTaps++;
    } else {
      rating = 'offbeat';
      label = offsetMs < 0 ? `Offbeat (${Math.round(offsetMs)}ms)` : `Offbeat (+${Math.round(offsetMs)}ms)`;
      color = '#ef4444';
    }

    this.routineStats.totalTaps++;
    const feedback = { rating, label, color, offsetMs: Math.round(offsetMs) };
    this.lastTapFeedback = feedback;

    if (this.onTapFeedback) {
      this.onTapFeedback(feedback);
    }
    return feedback;
  }

  /**
   * Called by trainer when a melody finishes
   */
  onTrainerMelodyComplete(summary) {
    const phase = this.getCurrentPhase();
    if (!phase) return;

    // Accumulate stats
    if (summary) {
      this.routineStats.notesPlayed += summary.totalNotes || 0;
      this.routineStats.correctNotes += summary.correctNotes || 0;
      this.routineStats.recoveries += summary.recoveries || 0;
      this.routineStats.recoveryPoints += summary.recoveryPoints || 0;
    }

    // If in Block 3 Take 1, store mistakes for targeted fix
    if (phase.type === 'take1') {
      this.take1Mistakes = this.trainer.getMistakeIndices();
      // Auto-advance to targeted fix after brief celebration
      setTimeout(() => {
        if (this.isRunning && this.currentSubPhaseIndex === 4) {
          this.skipSubPhase();
        }
      }, 1500);
      return;
    }

    // If in Block 4 Flash Reading, lock out line immediately!
    if (phase.type === 'flash') {
      this.completedFlashLines.add(phase.lineIndex);
      // Auto-advance to next flash line
      setTimeout(() => {
        if (this.isRunning && this.currentSubPhaseIndex >= 7 && this.currentSubPhaseIndex <= 9) {
          this.skipSubPhase();
        }
      }, 1800);
      return;
    }

    // In Targeted Fix loop, loop the exercise again if time remains
    if (phase.type === 'targeted_fix') {
      if (this.isRunning && this.subPhaseElapsedSeconds < phase.durationSeconds - 5) {
        setTimeout(() => {
          if (this.isRunning && this.getCurrentPhase()?.type === 'targeted_fix') {
            this.trainer.restart();
            this.trainer.startMetronome();
          }
        }, 800);
      }
    }
  }

  /**
   * Dynamically builds a 1-measure targeted fix exercise from Take 1
   */
  buildTargetedFixExercise() {
    const base = this.take1Excerpt || getSightReadingExcerpt(this.targetKey);
    const beatsPerMeasure = (base.timeSignature && base.timeSignature[0]) || 4;
    const notes = base.notes || [];

    let targetMeasure = 0;

    if (this.take1Mistakes && this.take1Mistakes.length > 0 && this.trainer.noteTimeline) {
      const firstErrNote = this.trainer.noteTimeline[this.take1Mistakes[0]];
      if (firstErrNote) {
        targetMeasure = Math.floor(firstErrNote.startBeat / beatsPerMeasure);
      }
    } else {
      // Clean run: Find measure with maximum melodic interval jump
      let maxJump = 0;
      let curBeat = 0;
      for (let i = 0; i < notes.length - 1; i++) {
        const jump = Math.abs(notes[i + 1].midi - notes[i].midi);
        if (jump > maxJump) {
          maxJump = jump;
          targetMeasure = Math.floor(curBeat / beatsPerMeasure);
        }
        curBeat += notes[i].duration;
      }
    }

    // Extract notes in targetMeasure
    let curBeat = 0;
    const measureNotes = [];
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const noteMeasure = Math.floor(curBeat / beatsPerMeasure);
      if (noteMeasure === targetMeasure) {
        measureNotes.push({ ...n });
      }
      curBeat += n.duration;
    }

    const cleanMeasureNotes = measureNotes.length > 0 ? measureNotes : notes.slice(0, 4);

    // Loop the isolated measure 3 times for deliberate repetition
    const loopedNotes = [];
    for (let loop = 0; loop < 3; loop++) {
      for (const n of cleanMeasureNotes) {
        loopedNotes.push({ ...n });
      }
    }

    return {
      id: `targeted-fix-m${targetMeasure + 1}`,
      title: `Targeted Fix: Measure ${targetMeasure + 1} Isolation (Looped)`,
      composer: 'Deliberate Practice Loop',
      difficulty: 'Targeted Fix',
      bpm: Math.max(60, (base.bpm || 96) - 16),
      timeSignature: base.timeSignature || [4, 4],
      key: base.key || this.targetKey,
      description: `Measure ${targetMeasure + 1} isolated. Loop smoothly with zero finger hesitation.`,
      notes: loopedNotes
    };
  }

  finishRoutine() {
    this.pause();
    this.totalElapsedSeconds = this.totalDurationSeconds;

    // Record streak in localStorage
    const newStreak = this.incrementStreak();

    // Summary object
    const summary = {
      targetKey: this.targetKey,
      totalDurationMinutes: Math.round(this.totalElapsedSeconds / 60),
      notesPlayed: this.routineStats.notesPlayed,
      correctNotes: this.routineStats.correctNotes,
      accuracy: this.routineStats.notesPlayed > 0 
        ? Math.round((this.routineStats.correctNotes / this.routineStats.notesPlayed) * 100) 
        : 100,
      recoveries: this.routineStats.recoveries,
      recoveryPoints: this.routineStats.recoveryPoints,
      goodTaps: this.routineStats.goodTaps,
      totalTaps: this.routineStats.totalTaps,
      streak: newStreak,
      completedDate: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    };

    if (this.onComplete) {
      this.onComplete(summary);
    }
    return summary;
  }

  getStreak() {
    try {
      const streak = localStorage.getItem('midisheet_routine_streak');
      return streak ? parseInt(streak, 10) : 0;
    } catch (e) {
      return 0;
    }
  }

  incrementStreak() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const lastDate = localStorage.getItem('midisheet_routine_last_date');
      let streak = parseInt(localStorage.getItem('midisheet_routine_streak') || '0', 10);

      if (lastDate === today) {
        // Already incremented today
        return streak;
      }

      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (lastDate === yesterday) {
        streak += 1;
      } else {
        streak = 1; // Streak reset or first day
      }

      localStorage.setItem('midisheet_routine_streak', streak.toString());
      localStorage.setItem('midisheet_routine_last_date', today);
      return streak;
    } catch (e) {
      return 1;
    }
  }
}
