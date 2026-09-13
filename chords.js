/**
 * Music Theory Helper Module
 * Handles note names, MIDI pitch conversions, diatonic staff positions,
 * accidentals, and chord recognition.
 */

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Diatonic letters mapping to diatonic step within an octave (0 to 6)
const DIATONIC_STEPS = {
  'C': 0, 'D': 1, 'E': 2, 'F': 3, 'G': 4, 'A': 5, 'B': 6
};

// Base diatonic letter for each chromatic pitch (0-11) in sharp and flat spellings
const CHROMATIC_TO_DIATONIC_SHARP = [
  { letter: 'C', acc: '' },   // 0: C
  { letter: 'C', acc: '#' },  // 1: C#
  { letter: 'D', acc: '' },   // 2: D
  { letter: 'D', acc: '#' },  // 3: D#
  { letter: 'E', acc: '' },   // 4: E
  { letter: 'F', acc: '' },   // 5: F
  { letter: 'F', acc: '#' },  // 6: F#
  { letter: 'G', acc: '' },   // 7: G
  { letter: 'G', acc: '#' },  // 8: G#
  { letter: 'A', acc: '' },   // 9: A
  { letter: 'A', acc: '#' },  // 10: A#
  { letter: 'B', acc: '' }    // 11: B
];

const CHROMATIC_TO_DIATONIC_FLAT = [
  { letter: 'C', acc: '' },   // 0: C
  { letter: 'D', acc: 'b' },  // 1: Db
  { letter: 'D', acc: '' },   // 2: D
  { letter: 'E', acc: 'b' },  // 3: Eb
  { letter: 'E', acc: '' },   // 4: E
  { letter: 'F', acc: '' },   // 5: F
  { letter: 'G', acc: 'b' },  // 6: Gb
  { letter: 'G', acc: '' },   // 7: G
  { letter: 'A', acc: 'b' },  // 8: Ab
  { letter: 'A', acc: '' },   // 9: A
  { letter: 'B', acc: 'b' },  // 10: Bb
  { letter: 'B', acc: '' }    // 11: B
];

// Chord patterns defined by intervals from root in semitones
const CHORD_FORMULAS = [
  { name: '', suffix: '', intervals: [0, 4, 7], quality: 'Major' },
  { name: 'm', suffix: 'm', intervals: [0, 3, 7], quality: 'Minor' },
  { name: 'dim', suffix: 'dim', intervals: [0, 3, 6], quality: 'Diminished' },
  { name: 'aug', suffix: 'aug', intervals: [0, 4, 8], quality: 'Augmented' },
  { name: 'sus4', suffix: 'sus4', intervals: [0, 5, 7], quality: 'Suspended 4th' },
  { name: 'sus2', suffix: 'sus2', intervals: [0, 2, 7], quality: 'Suspended 2nd' },
  { name: '7', suffix: '7', intervals: [0, 4, 7, 10], quality: 'Dominant 7th' },
  { name: 'maj7', suffix: 'maj7', intervals: [0, 4, 7, 11], quality: 'Major 7th' },
  { name: 'm7', suffix: 'm7', intervals: [0, 3, 7, 10], quality: 'Minor 7th' },
  { name: 'm(maj7)', suffix: 'm(maj7)', intervals: [0, 3, 7, 11], quality: 'Minor-Major 7th' },
  { name: 'm7b5', suffix: 'm7b5', intervals: [0, 3, 6, 10], quality: 'Half-Diminished' },
  { name: 'dim7', suffix: 'dim7', intervals: [0, 3, 6, 9], quality: 'Diminished 7th' },
  { name: 'add9', suffix: 'add9', intervals: [0, 4, 7, 14], quality: 'Add 9' },
  { name: '6', suffix: '6', intervals: [0, 4, 7, 9], quality: '6th' },
  { name: 'm6', suffix: 'm6', intervals: [0, 3, 7, 9], quality: 'Minor 6th' },
  { name: '9', suffix: '9', intervals: [0, 4, 7, 10, 14], quality: 'Dominant 9th' },
  { name: 'maj9', suffix: 'maj9', intervals: [0, 4, 7, 11, 14], quality: 'Major 9th' },
  { name: '5 (Power)', suffix: '5', intervals: [0, 7], quality: '5th' }
];

// Key Signatures definitions with diatonic pitch classes and accidentals
export const KEY_SIGNATURES = {
  'C Major': { name: 'C Major', type: 'major', accidentals: 0, sharps: [], flats: [], diatonicPitchClasses: [0, 2, 4, 5, 7, 9, 11] },
  'G Major': { name: 'G Major', type: 'major', accidentals: 1, sharps: ['F#'], flats: [], diatonicPitchClasses: [7, 9, 11, 0, 2, 4, 6] },
  'D Major': { name: 'D Major', type: 'major', accidentals: 2, sharps: ['F#', 'C#'], flats: [], diatonicPitchClasses: [2, 4, 6, 7, 9, 11, 1] },
  'A Major': { name: 'A Major', type: 'major', accidentals: 3, sharps: ['F#', 'C#', 'G#'], flats: [], diatonicPitchClasses: [9, 11, 1, 2, 4, 6, 8] },
  'E Major': { name: 'E Major', type: 'major', accidentals: 4, sharps: ['F#', 'C#', 'G#', 'D#'], flats: [], diatonicPitchClasses: [4, 6, 8, 9, 11, 1, 3] },
  'B Major': { name: 'B Major', type: 'major', accidentals: 5, sharps: ['F#', 'C#', 'G#', 'D#', 'A#'], flats: [], diatonicPitchClasses: [11, 1, 3, 4, 6, 8, 10] },
  'F Major': { name: 'F Major', type: 'major', accidentals: 1, sharps: [], flats: ['Bb'], diatonicPitchClasses: [5, 7, 9, 10, 0, 2, 4] },
  'Bb Major': { name: 'Bb Major', type: 'major', accidentals: 2, sharps: [], flats: ['Bb', 'Eb'], diatonicPitchClasses: [10, 0, 2, 3, 5, 7, 9] },
  'Eb Major': { name: 'Eb Major', type: 'major', accidentals: 3, sharps: [], flats: ['Bb', 'Eb', 'Ab'], diatonicPitchClasses: [3, 5, 7, 8, 10, 0, 2] },
  'Ab Major': { name: 'Ab Major', type: 'major', accidentals: 4, sharps: [], flats: ['Bb', 'Eb', 'Ab', 'Db'], diatonicPitchClasses: [8, 10, 0, 1, 3, 5, 7] },
  'A Minor': { name: 'A Minor', type: 'minor', accidentals: 0, sharps: [], flats: [], diatonicPitchClasses: [9, 11, 0, 2, 4, 5, 7] },
  'E Minor': { name: 'E Minor', type: 'minor', accidentals: 1, sharps: ['F#'], flats: [], diatonicPitchClasses: [4, 6, 7, 9, 11, 0, 2] },
  'D Minor': { name: 'D Minor', type: 'minor', accidentals: 1, sharps: [], flats: ['Bb'], diatonicPitchClasses: [2, 4, 5, 7, 9, 10, 0] },
  'D Dorian': { name: 'D Dorian', type: 'modal', accidentals: 0, sharps: [], flats: [], diatonicPitchClasses: [2, 4, 5, 7, 9, 11, 0] }
};


export class MusicTheory {
  /**
   * Convert MIDI note number to note details
   * @param {number} midi - 0 to 127
   * @param {boolean} preferFlats - whether to use flats instead of sharps
   */
  static getNoteInfo(midi, preferFlats = false) {
    if (typeof midi !== 'number' || isNaN(midi) || !isFinite(midi)) {
      midi = 60;
    }
    const safeMidi = Math.max(0, Math.min(127, Math.round(midi)));
    const pitchClass = ((safeMidi % 12) + 12) % 12;
    const octave = Math.floor(safeMidi / 12) - 1;
    const nameMap = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
    const diatonicMap = preferFlats ? CHROMATIC_TO_DIATONIC_FLAT : CHROMATIC_TO_DIATONIC_SHARP;

    const baseInfo = diatonicMap[pitchClass] || { letter: 'C', acc: '' };
    const letter = baseInfo.letter || 'C';
    const accidental = baseInfo.acc || '';
    const fullName = `${nameMap[pitchClass] || 'C'}${octave}`;
    const displayName = `${nameMap[pitchClass] || 'C'}`;

    // Calculate total diatonic step index (C0 = 0)
    // C0 is octave 0, step 0.
    const stepOffset = DIATONIC_STEPS[letter] !== undefined ? DIATONIC_STEPS[letter] : 0;
    const diatonicStep = octave * 7 + stepOffset;

    // Middle C is C4 = MIDI 60 -> octave 4, diatonic 'C' = 0 -> step = 28
    // Treble bottom line is E4 -> octave 4, diatonic 'E' = 2 -> step = 30
    // Bass bottom line is G2 -> octave 2, diatonic 'G' = 4 -> step = 18

    // Staff clef determination:
    // Middle C (60) and above defaults to Treble; below 60 to Bass
    const clef = safeMidi >= 60 ? 'treble' : 'bass';

    return {
      midi: safeMidi,
      pitchClass,
      octave,
      letter,
      accidental,
      fullName,
      displayName,
      diatonicStep,
      clef,
      frequency: 440 * Math.pow(2, (safeMidi - 69) / 12)
    };
  }

  /**
   * Calculate diatonic staff line position offset relative to bottom line of staff.
   * In musical notation:
   * 0 = bottom line (line 1)
   * 1 = space above bottom line (space 1)
   * 2 = line 2
   * 3 = space 2
   * 4 = line 3 (middle line)
   * 5 = space 3
   * 6 = line 4
   * 7 = space 4
   * 8 = line 5 (top line)
   * Values < 0 or > 8 indicate ledger lines.
   */
  static getStaffPosition(diatonicStep, clef = 'treble') {
    if (clef === 'treble') {
      // Treble bottom line is E4 (diatonicStep = 30)
      return diatonicStep - 30;
    } else {
      // Bass bottom line is G2 (diatonicStep = 18)
      return diatonicStep - 18;
    }
  }

  /**
   * Identifies chord from an array of currently active MIDI notes
   * @param {number[]} activeNotes - Array of MIDI note numbers
   * @param {boolean} preferFlats - Display preference
   * @returns {object|null}
   */
  static identifyChord(activeNotes, preferFlats = false) {
    if (!activeNotes || activeNotes.length === 0) return null;

    const uniqueNotes = Array.from(new Set(activeNotes)).sort((a, b) => a - b);
    if (uniqueNotes.length === 1) {
      const info = this.getNoteInfo(uniqueNotes[0], preferFlats);
      return {
        name: info.displayName,
        type: 'Single Note',
        root: info.displayName,
        bass: info.displayName,
        notes: [info.displayName],
        quality: 'Unison'
      };
    }

    const lowestMidi = uniqueNotes[0];
    const lowestInfo = this.getNoteInfo(lowestMidi, preferFlats);
    const lowestPitchClass = lowestInfo.pitchClass;

    const pitchClasses = Array.from(new Set(uniqueNotes.map(n => ((n % 12) + 12) % 12)));
    const nameMap = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;

    // Try each pitch class as the root
    let bestMatch = null;

    for (const rootPitch of pitchClasses) {
      // Calculate intervals from this candidate root
      const intervals = pitchClasses.map(p => (p - rootPitch + 12) % 12).sort((a, b) => a - b);

      // Match against formulas
      for (const formula of CHORD_FORMULAS) {
        const formIntervals = formula.intervals.map(i => i % 12);
        const uniqueFormIntervals = Array.from(new Set(formIntervals)).sort((a, b) => a - b);

        // Check if sets match
        if (intervals.length === uniqueFormIntervals.length &&
            intervals.every((val, idx) => val === uniqueFormIntervals[idx])) {

          const rootName = nameMap[rootPitch];
          const isSlash = rootPitch !== lowestPitchClass;
          const bassName = isSlash ? nameMap[lowestPitchClass] : '';
          const chordName = `${rootName}${formula.suffix}${isSlash ? '/' + bassName : ''}`;

          bestMatch = {
            name: chordName,
            root: rootName,
            suffix: formula.suffix,
            quality: formula.quality,
            bass: isSlash ? bassName : rootName,
            isSlash,
            intervals
          };
          break;
        }
      }
      if (bestMatch) break;
    }

    if (!bestMatch) {
      // Fallback for 2-note intervals or unrecognized harmonies
      if (uniqueNotes.length === 2) {
        const interval = Math.abs(uniqueNotes[1] - uniqueNotes[0]) % 12;
        const intervalNames = [
          'Unison', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd',
          'Perfect 4th', 'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th',
          'Minor 7th', 'Major 7th'
        ];
        const low = this.getNoteInfo(uniqueNotes[0], preferFlats).displayName;
        const high = this.getNoteInfo(uniqueNotes[1], preferFlats).displayName;
        return {
          name: `${low}-${high} (${intervalNames[interval]})`,
          type: 'Interval',
          root: low,
          bass: low,
          quality: intervalNames[interval]
        };
      }

      // Display note cluster
      const names = uniqueNotes.map(n => this.getNoteInfo(n, preferFlats).displayName);
      return {
        name: names.join(' '),
        type: 'Cluster',
        root: names[0],
        bass: names[0],
        quality: 'Complex'
      };
    }

    return bestMatch;
  }

  /**
   * Get Key Signature details by name
   */
  static getKeySignature(name = 'C Major') {
    return KEY_SIGNATURES[name] || KEY_SIGNATURES['C Major'];
  }

  /**
   * Determine if a MIDI note is diatonic or an accidental deviation from the key signature.
   * E.g. In C Major, C/D/E/F/G/A/B are diatonic, while C#, Eb, F#, etc. deviate.
   * In G Major, F# is diatonic (muscle memory default), while F natural is a deviation.
   */
  static isAccidentalDeviation(midi, keySignatureName = 'C Major') {
    if (typeof midi !== 'number' || isNaN(midi) || !isFinite(midi)) {
      return {
        isDiatonic: true,
        isDeviation: false,
        printedAccidental: '',
        pitchClass: 0,
        noteInfo: this.getNoteInfo(60),
        keySignature: this.getKeySignature(keySignatureName)
      };
    }
    const safeMidi = Math.max(0, Math.min(127, Math.round(midi)));
    const key = this.getKeySignature(keySignatureName);
    const pitchClass = ((safeMidi % 12) + 12) % 12;
    const isDiatonic = key.diatonicPitchClasses.includes(pitchClass);

    // Prefer flats for flat keys
    const preferFlats = key.flats.length > 0;
    const noteInfo = this.getNoteInfo(safeMidi, preferFlats);

    // Accidental printed status
    let isDeviation = false;
    let printedAccidental = '';

    if (!isDiatonic) {
      isDeviation = true;
      printedAccidental = noteInfo.accidental || (preferFlats ? 'b' : '#');
    } else {
      // It is diatonic. Check if the key signature itself has an accidental for this letter.
      // E.g., in G Major, F has a sharp in the key signature.
      // If someone played an F natural, that would be !isDiatonic (pitchClass 5 vs 6) so isDeviation=true and printedAccidental='♮'.
      if (key.sharps.some(s => s.startsWith(noteInfo.letter))) {
        printedAccidental = '#';
      } else if (key.flats.some(f => f.startsWith(noteInfo.letter))) {
        printedAccidental = 'b';
      }
    }

    return {
      isDiatonic,
      isDeviation,
      printedAccidental,
      pitchClass,
      noteInfo,
      keySignature: key
    };
  }

  /**
   * Classify relative motion / interval between two MIDI notes:
   * - Step (2nd): 1 to 2 semitones -> Green
   * - Skip (3rd): 3 to 4 semitones -> Orange
   * - Leap (4th, 5th, 6th, Octave+): 5+ semitones -> Purple
   * - Unison: 0 semitones -> Cyan
   */
  static classifyInterval(midi1, midi2, preferFlats = false) {
    const semitones = Math.abs(midi2 - midi1);
    const info1 = this.getNoteInfo(midi1, preferFlats);
    const info2 = this.getNoteInfo(midi2, preferFlats);
    const stepDist = Math.abs(info2.diatonicStep - info1.diatonicStep);

    if (semitones === 0) {
      return {
        category: 'unison',
        type: 'unison',
        semitones: 0,
        steps: 0,
        shortLabel: '1st',
        label: 'Unison',
        color: '#38bdf8',
        rgba: 'rgba(56, 189, 248, 0.7)',
        glow: '#38bdf8'
      };
    } else if (stepDist === 1 || semitones <= 2) {
      return {
        category: 'step',
        type: 'step',
        semitones,
        steps: 1,
        shortLabel: '2nd',
        label: 'Step (2nd)',
        color: '#22c55e', // Emerald Green
        rgba: 'rgba(34, 197, 94, 0.75)',
        glow: '#22c55e'
      };
    } else if (stepDist === 2 || (semitones >= 3 && semitones <= 4)) {
      return {
        category: 'skip',
        type: 'skip',
        semitones,
        steps: 2,
        shortLabel: '3rd',
        label: 'Skip (3rd)',
        color: '#f97316', // Vibrant Orange
        rgba: 'rgba(249, 115, 22, 0.85)',
        glow: '#f97316'
      };
    } else {
      let shortLabel = `${stepDist + 1}th`;
      if (stepDist === 3 || semitones === 5) shortLabel = '4th';
      else if (stepDist === 4 || semitones === 7) shortLabel = '5th';
      else if (stepDist === 5 || semitones === 9) shortLabel = '6th';
      else if (stepDist === 6 || semitones === 11) shortLabel = '7th';
      else if (stepDist === 7 || semitones === 12) shortLabel = '8ve';
      else if (stepDist > 7) shortLabel = `${stepDist + 1}th`;

      return {
        category: 'leap',
        type: 'leap',
        semitones,
        steps: stepDist,
        shortLabel,
        label: `Leap (${shortLabel})`,
        color: '#a855f7', // Vivid Purple
        rgba: 'rgba(168, 85, 247, 0.85)',
        glow: '#a855f7'
      };
    }
  }
}
