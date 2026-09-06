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

export class MusicTheory {
  /**
   * Convert MIDI note number to note details
   * @param {number} midi - 0 to 127
   * @param {boolean} preferFlats - whether to use flats instead of sharps
   */
  static getNoteInfo(midi, preferFlats = false) {
    const pitchClass = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    const nameMap = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
    const diatonicMap = preferFlats ? CHROMATIC_TO_DIATONIC_FLAT : CHROMATIC_TO_DIATONIC_SHARP;

    const baseInfo = diatonicMap[pitchClass];
    const letter = baseInfo.letter;
    const accidental = baseInfo.acc;
    const fullName = `${nameMap[pitchClass]}${octave}`;
    const displayName = `${nameMap[pitchClass]}`;

    // Calculate total diatonic step index (C0 = 0)
    // C0 is octave 0, step 0.
    const diatonicStep = octave * 7 + DIATONIC_STEPS[letter];

    // Middle C is C4 = MIDI 60 -> octave 4, diatonic 'C' = 0 -> step = 28
    // Treble bottom line is E4 -> octave 4, diatonic 'E' = 2 -> step = 30
    // Bass bottom line is G2 -> octave 2, diatonic 'G' = 4 -> step = 18

    // Staff clef determination:
    // Middle C (60) and above defaults to Treble; below 60 to Bass
    const clef = midi >= 60 ? 'treble' : 'bass';

    return {
      midi,
      pitchClass,
      octave,
      letter,
      accidental,
      fullName,
      displayName,
      diatonicStep,
      clef,
      frequency: 440 * Math.pow(2, (midi - 69) / 12)
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
}
