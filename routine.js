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

    // Iteration & Round tracking for looping exercises
    this.subPhaseRounds = [];
    this.currentRoundIndex = 1;
    this.roundCountdownInterval = null;

    // UI callbacks
    this.onTick = options.onTick || null;
    this.onPhaseChange = options.onPhaseChange || null;
    this.onComplete = options.onComplete || null;
    this.onTapFeedback = options.onTapFeedback || null;
    this.onFlashCountdown = options.onFlashCountdown || null;
    this.onRoundComplete = options.onRoundComplete || null;
    this.onRoundTick = options.onRoundTick || null;

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
        waitMode: true,
        strictMode: false,
        exercise: getAwkwardPairs(key),
        methodology: 'Slur slowly at 60 BPM. Ensure fingers snap down and lift as unified blocks with zero hand tension. Tactile execution without reading pressure.',
        objective: 'Eliminate physical hesitation and finger stumbling on the most treacherous micro-intervals and register breaks in this key before any reading pressure is introduced.',
        neuroscience: 'Pre-conditions the motor cortex and establishes tactile spatial familiarity. When the physical mechanism is effortless, the brain frees up 80% more cognitive bandwidth for reading notation.',
        howTo: [
          'Play in Wait Mode at a relaxed 60 BPM—there is zero time rush.',
          'Slur each awkward interval smoothly; snap fingers down and release as unified blocks.',
          'Maintain an arched hand dome with soft wrists; never collapse knuckles.'
        ],
        pitfalls: 'Rushing the tempo, playing with stiff fingers, or punching notes. Strive for butter-smooth legato.',
        proTip: 'Focus your attention entirely on the physical tactile sensations in your fingertips rather than reading.'
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
        waitMode: true,
        strictMode: false,
        exercise: generateBrokenThirds(key, 76),
        methodology: `Klosé diatonic broken thirds in ${key}. Focus on continuous, unbroken sound and smooth physical transitions across finger registers.`,
        objective: 'Establish unbroken diatonic muscle memory across 2 full octaves and build finger agility across skip intervals (1-3, 2-4, 3-5).',
        neuroscience: 'Sight-reading literature is dominated by diatonic thirds. Automating third-interval finger shapes prevents micro-hesitations when reading melodies with skips.',
        howTo: [
          'Play in Wait Mode at 76 BPM with continuous, singing tone.',
          'Feel the physical skip distance between alternate fingers across octave boundaries.',
          'Breathe steadily (wind instruments) and keep an unbroken stream of sound.'
        ],
        pitfalls: 'Disconnecting notes with choppy staccato or tensing up on octave crossing notes.',
        proTip: 'Hear the next third in your mind half a beat before your fingers strike.'
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
        waitMode: false,
        strictMode: false,
        exercise: excerpt,
        methodology: 'Play the rhythm on your MIDI instrument tapping the same note (or use Spacebar). Metronome is clicking. Focus entirely on rhythmic precision and vocalize subdivisions aloud ("1-e-&-a 2-e-&-a").',
        objective: 'Decouple rhythm processing from pitch decoding. 80% of sight-reading failure is caused by rhythmic panic; mastering the pulse in isolation cures it.',
        neuroscience: 'Simultaneous Learning Principle (Paul Harris): The human brain cannot easily decipher novel pitch contours and complex meter subdivisions at the same time. Isolating rhythm locks in the pulse before pitches are introduced.',
        howTo: [
          'Tap the same note repeatedly on your instrument (or press Spacebar) in strict metronome time.',
          'Vocalize the subdivisions aloud ("1-e-&-a 2-e-&-a" or "Ta-ka-di-mi").',
          'Lock your downbeats directly to the metronome click with zero hesitation.'
        ],
        pitfalls: 'Trying to play different melody pitches. Ignore the pitches—only the rhythm counts!',
        proTip: 'Lean into the beat. Tapping with confident, crisp releases dramatically boosts rhythmic accuracy.'
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
        waitMode: true,
        strictMode: false,
        audioMuted: true,
        exercise: excerpt,
        methodology: 'Trace the melodic contour across the staff (steps vs leaps) with interval ribbons. Do NOT name note letters. Silently pre-finger keys on your instrument without blowing/striking.',
        objective: 'Train your brain to recognize spatial intervals and melodic contours instantly, and physically pre-map key movements without audio distraction.',
        neuroscience: 'Naming note letters (C-D-E) in your head adds a 200ms processing bottleneck. Sight-reading masters translate visual contour (steps vs leaps) directly to finger distance.',
        howTo: [
          'Synth audio is muted. Silently trace the colored interval ribbons (Green=Step, Orange=Third, Purple=Leap).',
          'Ghost-finger: Silently pre-touch the keys on your instrument without striking or blowing.',
          'Identify the highest note, lowest note, and cadence points before moving on.'
        ],
        pitfalls: 'Saying note letter names in your head or stopping to think about note spelling.',
        proTip: 'Trust your visual spatial awareness: step = neighbor key, skip = skip one key, leap = jump.'
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
        waitMode: false,
        strictMode: true,
        exercise: excerpt,
        methodology: 'Strict execution with metronome: Never stop, restart, or hesitate! Keep steady time. Jump back in immediately on downbeats to earn Downbeat Recovery bonuses.',
        objective: 'Simulate true audition conditions. Eradicate the catastrophic "restart reflex" and build unstoppable forward momentum.',
        neuroscience: 'In ensembles, gigs, and exams, stopping after a mistake ruins the entire performance. Professional musicians keep the pulse moving and re-enter on the next measure.',
        howTo: [
          'Play in Strict In-Tempo Mode with active metronome clicks.',
          'If you hit a wrong note: NEVER STOP! Never try to correct it! Keep moving with the metronome.',
          'Re-enter cleanly on the next downbeat to score a +35 Downbeat Recovery Bonus!'
        ],
        pitfalls: 'Stopping, stuttering, playing a note twice, or letting eyes look back at a mistake.',
        proTip: 'Your eyes belong where the music is going, not where your fingers currently are.'
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
        waitMode: false,
        strictMode: false,
        exercise: null, // Generated dynamically after Take 1
        methodology: 'Isolating the stumbling measure from Take 1. Loop repeatedly at a steady, controlled tempo until finger hesitation vanishes.',
        objective: 'Rewire muscle memory with laser focus on the exact stumbling measure from Take 1 instead of wasting time re-playing parts you already know.',
        neuroscience: 'Myelination occurs through high-density repetition of difficult transitions at a controlled, error-free tempo. Slow looping cures the exact neurological glitch.',
        howTo: [
          'The system isolates the exact measure where you stumbled in Take 1 at a relaxed tempo (-16 BPM).',
          'Loop the phrase repeatedly with deep relaxation and precise finger placement.',
          'Continue looping until the phrase feels 100% natural, fluid, and effortless.'
        ],
        pitfalls: 'Rushing or tensing up. The tempo is intentionally relaxed so your brain can rewrite the movement.',
        proTip: 'Pay special attention to the transition note entering and leaving the loop.'
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
        waitMode: false,
        strictMode: true,
        lookahead: true,
        exercise: excerpt,
        methodology: 'Lookahead buffer active: The eye cursor leads 1 full measure ahead of the playhead. Push your visual attention ahead while fingers execute from buffer memory.',
        objective: 'Master the "Eye-Hand Span": train your eyes to read 1 full measure ahead of where your fingers are physically playing.',
        neuroscience: 'The hallmark of master sight-readers is visual buffer ingestion. Their eyes ingest measure 3 into short-term visual memory while their hands execute measure 2.',
        howTo: [
          'Watch the Decoupled Eye Pacer cursor leading 1 bar ahead of the playhead.',
          'Let your eyes absorb upcoming shapes while your fingers play the note from short-term memory.',
          'Maintain steady forward momentum; trust your visual buffer!'
        ],
        pitfalls: 'Letting your eyes snap backward to check what your hands just played. Keep eyes anchored ahead!',
        proTip: 'Read ahead in chunks: look for the barline and notice the first note of the upcoming measure.'
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
        objective: 'Build high-speed visual chunking under intense time pressure with a strict single-play lockout rule.',
        neuroscience: 'Flash exposure forces the visual cortex to group musical motifs, scale runs, and cadences into single cognitive chunks rather than reading note-by-note.',
        howTo: [
          '10-Second Scan Countdown: Study clef, key center, highest/lowest notes, and rhythm groupings without playing.',
          'When countdown hits zero, play straight through ONCE at tempo without stopping.',
          'Single-play lockout: You only get ONE shot per flash line!'
        ],
        pitfalls: 'Trying to read note-by-note during the scan. Absorb the entire 4-bar phrase as a visual silhouette.',
        proTip: 'Look at the last bar first during the 10s scan so you know how the phrase resolves.'
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
        objective: 'High-volume rapid pattern processing. Reinforce first-read reflexes with a fresh musical contour.',
        neuroscience: 'Volume reading builds perceptual fluency through exposure to diverse musical shapes under time constraints.',
        howTo: [
          'Scan for 10 seconds: look for rhythmic patterns and interval leaps.',
          'Play once cleanly at tempo with confidence.'
        ],
        pitfalls: 'Freezing if you hit a bad note. Keep the pulse going until the final double barline.',
        proTip: 'Notice the meter: tap your foot silently to internalize the pulse before the countdown ends.'
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
        objective: 'Final curriculum challenge: brisk tempo, maximum focus, and flawless single-play execution to seal today\'s streak.',
        neuroscience: 'Ending the 20-minute masterclass with a high-tempo successful read consolidates motor learning during sleep.',
        howTo: [
          '10-second scan: identify the tonic cadence and finger shifts.',
          'Execute with brisk, joyful precision straight through to the finish!'
        ],
        pitfalls: 'Hesitating at the final cadence. Finish strong!',
        proTip: 'Celebrate your completion! You have trained every key dimension of sight-reading mastery today.'
      }
    ];
  }

  getCurrentPhase() {
    return this.subPhases[this.currentSubPhaseIndex] || null;
  }

  startOrResume() {
    if (this.isRunning) return;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.isRunning = true;
    this.timerInterval = setInterval(() => this.tick(), 1000);

    const phase = this.getCurrentPhase();
    const isCurrentMelodyLoaded = this.trainer?.currentMelody && phase && this.trainer.currentMelody.id === phase.exercise?.id;

    if (!phase || !isCurrentMelodyLoaded) {
      try {
        this.loadSubPhase(this.currentSubPhaseIndex, true);
      } catch (err) {
        console.error('Error in loadSubPhase during startOrResume:', err);
      }
    } else {
      // Resuming existing phase without resetting elapsed time
      if (!this.flashPreviewActive && !phase.waitMode && this.trainer) {
        this.trainer.startMetronome();
      }
    }

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
    if (this.trainer) {
      this.trainer.rhythmTapMode = false;
      this.trainer.expectedTapMidi = null;
    }
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

  continueToNextSubPhase() {
    if (this.currentSubPhaseIndex < this.subPhases.length - 1) {
      const nextIndex = this.currentSubPhaseIndex + 1;
      this.loadSubPhase(nextIndex, true);
      this.startOrResume();
    } else {
      this.finishRoutine();
    }
  }

  repeatCurrentSubPhase() {
    const phase = this.getCurrentPhase();
    const timeRemaining = phase ? (phase.durationSeconds - this.subPhaseElapsedSeconds) : 0;
    // If timer was expired or nearly exhausted, grant fresh time for extra round
    if (timeRemaining <= 10) {
      this.subPhaseElapsedSeconds = 0;
    }
    // Load subphase preserving existing round history
    this.loadSubPhase(this.currentSubPhaseIndex, true, true);
    this.startOrResume();
  }

  getCurrentSubPhaseStats() {
    const phase = this.getCurrentPhase();
    if (!phase) return null;

    let accuracy = 100;
    let stars = 3;
    let mistakes = 0;
    let totalNotes = 0;
    let roundsCount = this.subPhaseRounds ? this.subPhaseRounds.length : 0;

    if (this.subPhaseRounds && this.subPhaseRounds.length > 0) {
      // Completed at least one round in this subphase
      const sumAcc = this.subPhaseRounds.reduce((acc, r) => acc + (r.accuracy || 0), 0);
      accuracy = Math.round(sumAcc / this.subPhaseRounds.length);
      mistakes = this.subPhaseRounds.reduce((acc, r) => acc + (r.mistakes || 0), 0);
      totalNotes = this.subPhaseRounds.reduce((acc, r) => acc + (r.totalNotes || (phase.exercise?.notes?.length || 0)), 0);
      stars = accuracy >= 95 ? 3 : (accuracy >= 80 ? 2 : 1);
    } else if (phase.type === 'rhythm_tap') {
      const good = this.routineStats?.goodTaps || 0;
      const total = this.routineStats?.totalTaps || 0;
      accuracy = total > 0 ? Math.round((good / total) * 100) : 100;
      mistakes = total - good;
      totalNotes = total;
      stars = accuracy >= 95 ? 3 : (accuracy >= 80 ? 2 : 1);
      roundsCount = total > 0 ? 1 : 0;
    } else {
      // User was mid-exercise during round 1
      const trainerStats = this.trainer?.stats;
      if (trainerStats) {
        accuracy = (trainerStats.accuracy !== undefined) ? trainerStats.accuracy : 100;
        mistakes = (trainerStats.mistakeCount || 0) + (trainerStats.missedNotes || 0);
        totalNotes = (trainerStats.correctNotes || 0) + mistakes;
        stars = accuracy >= 95 ? 3 : (accuracy >= 80 ? 2 : 1);
        roundsCount = (trainerStats.correctNotes > 0 || mistakes > 0) ? 1 : 0;
      }
    }

    return {
      phaseIndex: this.currentSubPhaseIndex,
      phaseTitle: phase.title,
      phaseType: phase.type,
      blockIndex: phase.blockIndex,
      blockName: phase.blockName,
      accuracy: Math.max(0, Math.min(100, accuracy)),
      stars,
      mistakes,
      totalNotes,
      roundsCount,
      rounds: this.subPhaseRounds ? [...this.subPhaseRounds] : [],
      elapsedSeconds: this.subPhaseElapsedSeconds,
      durationSeconds: phase.durationSeconds
    };
  }

  pauseForSubPhaseTransition() {
    const phase = this.getCurrentPhase();
    if (!phase) {
      this.finishRoutine();
      return;
    }

    // 1. Pause the routine clock & timer so no time is lost while reviewing
    this.pause();

    // 2. Clear any pending round countdowns
    if (this.roundCountdownInterval) {
      clearInterval(this.roundCountdownInterval);
      this.roundCountdownInterval = null;
    }

    // 3. Stop trainer metronome
    if (this.trainer) {
      this.trainer.stopMetronome();
    }

    // 4. Compute performance stats for the subphase that just completed
    const stats = this.getCurrentSubPhaseStats();

    // 5. Look up next phase in sequence
    const nextIndex = this.currentSubPhaseIndex + 1;
    const nextPhase = (nextIndex < this.subPhases.length) ? this.subPhases[nextIndex] : null;

    // 6. Notify listener to display transition popup
    if (this.onSubPhaseTimeout) {
      this.onSubPhaseTimeout(stats, nextPhase, phase);
    } else {
      this.skipSubPhase();
    }
  }

  prevSubPhase() {
    if (this.currentSubPhaseIndex > 0) {
      this.currentSubPhaseIndex--;
      this.subPhaseElapsedSeconds = 0;
      this.loadSubPhase(this.currentSubPhaseIndex);
    }
  }

  loadSubPhase(index, autoStartExercise = true, preserveRounds = false) {
    if (index < 0 || index >= this.subPhases.length) return;
    this.currentSubPhaseIndex = index;
    if (!preserveRounds) {
      this.subPhaseElapsedSeconds = 0;
      this.subPhaseRounds = [];
      this.currentRoundIndex = 1;
    }
    if (this.roundCountdownInterval) {
      clearInterval(this.roundCountdownInterval);
      this.roundCountdownInterval = null;
    }
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
      this.trainer.rhythmTapMode = (phase.type === 'rhythm_tap');
      if (phase.type === 'rhythm_tap') {
        this.trainer.expectedTapMidi = (exercise.notes && exercise.notes.length > 0) ? exercise.notes[0].midi : 60;
      } else {
        this.trainer.expectedTapMidi = null;
      }

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
    try {
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
        this.pauseForSubPhaseTransition();
        return;
      }

      // Check if master 20 minutes finished
      if (this.totalElapsedSeconds >= this.totalDurationSeconds) {
        this.finishRoutine();
        return;
      }

      this.notifyTick();
    } catch (err) {
      console.error('Error in routine tick:', err);
    }
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

    // For all looping warm-up and practice phases:
    // Block 1 (awkward pairs, thirds), Block 2 (rhythm tap, interval audit), Block 3 (targeted fix loop, take 2 lookahead)
    const isLoopingPhase = (
      phase.type === 'awkward' ||
      phase.type === 'thirds' ||
      phase.type === 'rhythm_tap' ||
      phase.type === 'audit' ||
      phase.type === 'targeted_fix' ||
      phase.type === 'take2'
    );

    if (isLoopingPhase) {
      const roundSummary = {
        round: this.currentRoundIndex,
        accuracy: (summary && summary.accuracy !== undefined) ? summary.accuracy : 100,
        rhythmAccuracy: (summary && summary.rhythmAccuracy !== undefined) ? summary.rhythmAccuracy : 0,
        mistakes: (summary && summary.mistakeCount !== undefined) ? summary.mistakeCount : 0,
        stars: (summary && summary.stars !== undefined) ? summary.stars : 3,
        durationSeconds: (summary && summary.durationSeconds) ? summary.durationSeconds : Math.max(1, Math.round(this.subPhaseElapsedSeconds)),
        remainingSeconds: Math.max(0, phase.durationSeconds - this.subPhaseElapsedSeconds),
        phaseTitle: phase.title,
        phaseType: phase.type,
        totalNotes: (summary && ((summary.correctNotes || 0) + (summary.mistakeCount || 0) + (summary.missedNotes || 0))) || (phase.exercise?.notes?.length || 0)
      };
      this.subPhaseRounds.push(roundSummary);

      this.currentRoundIndex++;

      if (this.onRoundComplete) {
        this.onRoundComplete(roundSummary, this.subPhaseRounds, 0);
      }

      // Always present the transition modal to offer [Continue to Next Exercise] or [Practice Again]!
      this.pauseForSubPhaseTransition();
      return;
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
