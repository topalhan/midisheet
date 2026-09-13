/**
 * Routine Exercises Library & Generator for the 20-Minute Daily Training Routine
 * Covers:
 * - Block 1: Mechanical Calibration (Awkward Pairs & Klosé Broken Thirds)
 * - Block 2 & 3: Pre-Flight Analysis & Cold Sight-Reading Excerpts
 * - Block 4: Volume Flash Reading Lines (Ultra-simple 4-bar lines)
 */

import { MusicTheory } from './chords.js';

// Diatonic scale pitch classes for key generation
export const KEY_DEFINITIONS = {
  'C Major': { root: 60, scale: [0, 2, 4, 5, 7, 9, 11], accidentals: 0, preferFlats: false },
  'G Major': { root: 55, scale: [0, 2, 4, 5, 7, 9, 11], accidentals: 1, preferFlats: false },
  'F Major': { root: 53, scale: [0, 2, 4, 5, 7, 9, 11], accidentals: -1, preferFlats: true },
  'D Major': { root: 62, scale: [0, 2, 4, 5, 7, 9, 11], accidentals: 2, preferFlats: false },
  'Bb Major': { root: 58, scale: [0, 2, 4, 5, 7, 9, 11], accidentals: -2, preferFlats: true },
  'A Minor': { root: 57, scale: [0, 2, 3, 5, 7, 8, 10], accidentals: 0, preferFlats: false },
  'D Minor': { root: 62, scale: [0, 2, 3, 5, 7, 8, 10], accidentals: -1, preferFlats: true }
};

/**
 * Generate ascending & descending Klosé-style diatonic broken thirds for any key.
 * Pattern: 1-3, 2-4, 3-5, 4-6, 5-7, 6-8... then descending.
 */
export function generateBrokenThirds(keyName = 'C Major', bpm = 76) {
  const def = KEY_DEFINITIONS[keyName] || KEY_DEFINITIONS['C Major'];
  const notes = [];
  
  // Build a 2-octave diatonic scale array starting from root
  const fullScale = [];
  for (let octave = 0; octave < 2; ++octave) {
    for (let step = 0; step < def.scale.length; ++step) {
      fullScale.push(def.root + octave * 12 + def.scale[step]);
    }
  }
  fullScale.push(def.root + 24); // Top octave note

  const rangeLength = Math.min(9, fullScale.length - 2);

  // 1. Ascending Broken Thirds
  for (let i = 0; i < rangeLength; ++i) {
    const n1 = fullScale[i];
    const n2 = fullScale[i + 2];
    const info1 = MusicTheory.getNoteInfo(n1, def.preferFlats);
    const info2 = MusicTheory.getNoteInfo(n2, def.preferFlats);
    notes.push({ midi: n1, duration: 1, name: info1.fullName });
    notes.push({ midi: n2, duration: 1, name: info2.fullName });
  }
  const peakNote = fullScale[rangeLength];
  const peakInfo = MusicTheory.getNoteInfo(peakNote, def.preferFlats);
  notes.push({ midi: peakNote, duration: 2, name: peakInfo.fullName });

  // 2. Descending Broken Thirds
  for (let i = rangeLength; i >= 2; --i) {
    const n1 = fullScale[i];
    const n2 = fullScale[i - 2];
    const info1 = MusicTheory.getNoteInfo(n1, def.preferFlats);
    const info2 = MusicTheory.getNoteInfo(n2, def.preferFlats);
    notes.push({ midi: n1, duration: 1, name: info1.fullName });
    notes.push({ midi: n2, duration: 1, name: info2.fullName });
  }
  const rootNote = fullScale[0];
  const rootInfo = MusicTheory.getNoteInfo(rootNote, def.preferFlats);
  notes.push({ midi: rootNote, duration: 2, name: rootInfo.fullName });

  return {
    id: `routine-thirds-${keyName.toLowerCase().replace(/\s+/g, '-')}`,
    title: `Klosé Diatonic Thirds (${keyName})`,
    composer: 'H. Klosé / Daily Calibrations',
    difficulty: 'Daily Routine',
    bpm: bpm,
    timeSignature: [4, 4],
    key: keyName,
    description: 'Slur smoothly with continuous, unbroken sound. Feel the physical interval contour in your fingers.',
    notes
  };
}

/**
 * Isolated Awkward Pairs exercise (Block 1 Part A: 60 BPM).
 * Targets clumsy finger coordination: D-F, B-C register breaks, chromatic shifts.
 */
export function getAwkwardPairs(targetKey = 'C Major') {
  const isFlat = targetKey.includes('F') || targetKey.includes('Bb') || targetKey.includes('D Minor');
  return {
    id: 'routine-awkward-pairs',
    title: 'Isolated Awkward Pairs (Tactile Execution)',
    composer: 'Mechanical Calibration',
    difficulty: 'Block 1',
    bpm: 60,
    timeSignature: [4, 4],
    key: targetKey,
    description: 'Slur slowly at 60 BPM. Ensure fingers snap down and lift as unified blocks with zero hand tension.',
    notes: [
      // Pair 1: D4 to F4 (minor third leap)
      { midi: 62, duration: 2, name: 'D4' },
      { midi: 65, duration: 2, name: 'F4' },
      { midi: 62, duration: 1, name: 'D4' },
      { midi: 65, duration: 1, name: 'F4' },
      { midi: 62, duration: 2, name: 'D4' },

      // Pair 2: B3 to C4 (register break / octave key shift)
      { midi: 59, duration: 2, name: 'B3' },
      { midi: 60, duration: 2, name: 'C4' },
      { midi: 59, duration: 1, name: 'B3' },
      { midi: 60, duration: 1, name: 'C4' },
      { midi: 59, duration: 2, name: 'B3' },

      // Pair 3: A4 to B4 (cross-fingering throat to clarion transition)
      { midi: 69, duration: 2, name: 'A4' },
      { midi: 71, duration: 2, name: 'B4' },
      { midi: 69, duration: 1, name: 'A4' },
      { midi: 71, duration: 1, name: 'B4' },
      { midi: 69, duration: 2, name: 'A4' },

      // Pair 4: C4 to Eb4 / D#4 (awkward chromatic lateral displacement)
      { midi: 60, duration: 2, name: 'C4' },
      { midi: 63, duration: 2, name: isFlat ? 'Eb4' : 'D#4' },
      { midi: 60, duration: 1, name: 'C4' },
      { midi: 63, duration: 1, name: isFlat ? 'Eb4' : 'D#4' },
      { midi: 60, duration: 2, name: 'C4' }
    ]
  };
}

/**
 * Pre-Flight & Cold Sight-Reading Excerpts (Blocks 2 & 3).
 */
export const SIGHT_READING_EXCERPTS = {
  'C Major': [
    {
      id: 'sr-c-pastoral',
      title: 'Pastoral Promenade in C',
      composer: 'Sight-Reading Excerpt',
      difficulty: 'Grade 2',
      bpm: 96,
      timeSignature: [4, 4],
      key: 'C Major',
      description: 'Lyrical stepping line with broken thirds and a measure 3 downbeat leap.',
      notes: [
        { midi: 60, duration: 1, name: 'C4' },
        { midi: 64, duration: 1, name: 'E4' },
        { midi: 62, duration: 1, name: 'D4' },
        { midi: 65, duration: 1, name: 'F4' },
        { midi: 64, duration: 2, name: 'E4' },
        { midi: 67, duration: 2, name: 'G4' },
        { midi: 65, duration: 1, name: 'F4' },
        { midi: 64, duration: 1, name: 'E4' },
        { midi: 62, duration: 1, name: 'D4' },
        { midi: 60, duration: 1, name: 'C4' },
        { midi: 67, duration: 2, name: 'G4' },
        { midi: 60, duration: 2, name: 'C4' }
      ]
    },
    {
      id: 'sr-c-march',
      title: 'Courtyard Fanfare in C',
      composer: 'Sight-Reading Excerpt',
      difficulty: 'Grade 2',
      bpm: 104,
      timeSignature: [4, 4],
      key: 'C Major',
      description: 'Rhythmic repeated notes with dotted motifs and octave awareness.',
      notes: [
        { midi: 60, duration: 1, name: 'C4' },
        { midi: 60, duration: 1, name: 'C4' },
        { midi: 64, duration: 1, name: 'E4' },
        { midi: 67, duration: 1, name: 'G4' },
        { midi: 69, duration: 1.5, name: 'A4' },
        { midi: 67, duration: 0.5, name: 'G4' },
        { midi: 65, duration: 1, name: 'F4' },
        { midi: 64, duration: 1, name: 'E4' },
        { midi: 62, duration: 2, name: 'D4' },
        { midi: 60, duration: 2, name: 'C4' }
      ]
    }
  ],
  'G Major': [
    {
      id: 'sr-g-morning',
      title: 'Morning Song in G',
      composer: 'Sight-Reading Excerpt',
      difficulty: 'Grade 2',
      bpm: 92,
      timeSignature: [3, 4],
      key: 'G Major',
      description: 'Graceful 3/4 waltz movement featuring the F#4 leading tone.',
      notes: [
        { midi: 67, duration: 1, name: 'G4' },
        { midi: 71, duration: 1, name: 'B4' },
        { midi: 74, duration: 1, name: 'D5' },
        { midi: 72, duration: 1.5, name: 'C5' },
        { midi: 71, duration: 0.5, name: 'B4' },
        { midi: 69, duration: 1, name: 'A4' },
        { midi: 66, duration: 1, name: 'F#4' },
        { midi: 67, duration: 2, name: 'G4' }
      ]
    }
  ],
  'F Major': [
    {
      id: 'sr-f-ballad',
      title: 'Riverside Melody in F',
      composer: 'Sight-Reading Excerpt',
      difficulty: 'Grade 2',
      bpm: 88,
      timeSignature: [4, 4],
      key: 'F Major',
      description: 'Gentle arching phrase featuring key signature Bb4 scale navigation.',
      notes: [
        { midi: 65, duration: 1, name: 'F4' },
        { midi: 69, duration: 1, name: 'A4' },
        { midi: 70, duration: 1.5, name: 'Bb4' },
        { midi: 69, duration: 0.5, name: 'A4' },
        { midi: 67, duration: 2, name: 'G4' },
        { midi: 65, duration: 2, name: 'F4' },
        { midi: 64, duration: 1, name: 'E4' },
        { midi: 65, duration: 3, name: 'F4' }
      ]
    }
  ]
};

export function getSightReadingExcerpt(targetKey = 'C Major') {
  const list = SIGHT_READING_EXCERPTS[targetKey] || SIGHT_READING_EXCERPTS['C Major'];
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Volume Flash Reading Lines (Block 4: 3 Minutes).
 */
export const FLASH_READING_SETS = {
  'C Major': [
    {
      id: 'flash-c-1',
      title: 'Flash Line 1: Stepping Scales',
      composer: 'Volume Flash Reading',
      difficulty: 'Very Easy',
      bpm: 108,
      timeSignature: [4, 4],
      key: 'C Major',
      description: 'Simple stepwise motion: scan for 10 seconds, play straight through once.',
      notes: [
        { midi: 60, duration: 1, name: 'C4' },
        { midi: 62, duration: 1, name: 'D4' },
        { midi: 64, duration: 1, name: 'E4' },
        { midi: 65, duration: 1, name: 'F4' },
        { midi: 67, duration: 2, name: 'G4' },
        { midi: 65, duration: 1, name: 'F4' },
        { midi: 64, duration: 1, name: 'E4' },
        { midi: 62, duration: 2, name: 'D4' },
        { midi: 60, duration: 2, name: 'C4' }
      ]
    },
    {
      id: 'flash-c-2',
      title: 'Flash Line 2: Broken Arpeggio',
      composer: 'Volume Flash Reading',
      difficulty: 'Very Easy',
      bpm: 108,
      timeSignature: [4, 4],
      key: 'C Major',
      description: 'Tonic triad skips: C - E - G - E - C.',
      notes: [
        { midi: 60, duration: 1, name: 'C4' },
        { midi: 64, duration: 1, name: 'E4' },
        { midi: 67, duration: 2, name: 'G4' },
        { midi: 64, duration: 1, name: 'E4' },
        { midi: 60, duration: 1, name: 'C4' },
        { midi: 62, duration: 2, name: 'D4' },
        { midi: 60, duration: 4, name: 'C4' }
      ]
    },
    {
      id: 'flash-c-3',
      title: 'Flash Line 3: Repeated Rhythm Accent',
      composer: 'Volume Flash Reading',
      difficulty: 'Very Easy',
      bpm: 112,
      timeSignature: [4, 4],
      key: 'C Major',
      description: 'Rhythmic pulse: spot the repeated notes and cadence downbeat.',
      notes: [
        { midi: 64, duration: 1, name: 'E4' },
        { midi: 64, duration: 1, name: 'E4' },
        { midi: 65, duration: 1, name: 'F4' },
        { midi: 67, duration: 1, name: 'G4' },
        { midi: 67, duration: 1, name: 'G4' },
        { midi: 65, duration: 1, name: 'F4' },
        { midi: 64, duration: 2, name: 'E4' },
        { midi: 62, duration: 2, name: 'D4' },
        { midi: 60, duration: 2, name: 'C4' }
      ]
    }
  ],
  'G Major': [
    {
      id: 'flash-g-1',
      title: 'Flash Line 1 in G',
      composer: 'Volume Flash Reading',
      difficulty: 'Very Easy',
      bpm: 104,
      timeSignature: [4, 4],
      key: 'G Major',
      description: 'Stepwise line anchored around G4.',
      notes: [
        { midi: 67, duration: 1, name: 'G4' },
        { midi: 69, duration: 1, name: 'A4' },
        { midi: 71, duration: 1, name: 'B4' },
        { midi: 72, duration: 1, name: 'C5' },
        { midi: 74, duration: 2, name: 'D5' },
        { midi: 71, duration: 2, name: 'B4' },
        { midi: 67, duration: 4, name: 'G4' }
      ]
    },
    {
      id: 'flash-g-2',
      title: 'Flash Line 2 in G',
      composer: 'Volume Flash Reading',
      difficulty: 'Very Easy',
      bpm: 104,
      timeSignature: [4, 4],
      key: 'G Major',
      description: 'Triad pattern G - B - D.',
      notes: [
        { midi: 67, duration: 1, name: 'G4' },
        { midi: 71, duration: 1, name: 'B4' },
        { midi: 74, duration: 2, name: 'D5' },
        { midi: 69, duration: 1, name: 'A4' },
        { midi: 66, duration: 1, name: 'F#4' },
        { midi: 67, duration: 4, name: 'G4' }
      ]
    },
    {
      id: 'flash-g-3',
      title: 'Flash Line 3 in G',
      composer: 'Volume Flash Reading',
      difficulty: 'Very Easy',
      bpm: 108,
      timeSignature: [4, 4],
      key: 'G Major',
      description: 'Fast cadence with leading tone F#4.',
      notes: [
        { midi: 71, duration: 1, name: 'B4' },
        { midi: 69, duration: 1, name: 'A4' },
        { midi: 67, duration: 2, name: 'G4' },
        { midi: 66, duration: 2, name: 'F#4' },
        { midi: 67, duration: 4, name: 'G4' }
      ]
    }
  ]
};

export function getFlashReadingLines(targetKey = 'C Major') {
  return FLASH_READING_SETS[targetKey] || FLASH_READING_SETS['C Major'];
}
