/**
 * Library of 10 classic melodies for interactive practice and accuracy assessment
 */

export const MELODIES = [
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    composer: 'L. van Beethoven',
    difficulty: 'Easy',
    bpm: 108,
    timeSignature: [4, 4],
    key: 'C Major',
    description: 'The triumphant anthem from Symphony No. 9',
    notes: [
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 65, duration: 1, name: 'F4' },
      { midi: 67, duration: 1, name: 'G4' },
      { midi: 67, duration: 1, name: 'G4' },
      { midi: 65, duration: 1, name: 'F4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 62, duration: 1, name: 'D4' },
      { midi: 60, duration: 1, name: 'C4' },
      { midi: 60, duration: 1, name: 'C4' },
      { midi: 62, duration: 1, name: 'D4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 64, duration: 1.5, name: 'E4' },
      { midi: 62, duration: 0.5, name: 'D4' },
      { midi: 62, duration: 2, name: 'D4' }
    ]
  },
  {
    id: 'twinkle-twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    composer: 'Traditional',
    difficulty: 'Easy',
    bpm: 96,
    timeSignature: [4, 4],
    key: 'C Major',
    description: 'Universal childhood classic based on French melody',
    notes: [
      { midi: 60, duration: 1, name: 'C4' },
      { midi: 60, duration: 1, name: 'C4' },
      { midi: 67, duration: 1, name: 'G4' },
      { midi: 67, duration: 1, name: 'G4' },
      { midi: 69, duration: 1, name: 'A4' },
      { midi: 69, duration: 1, name: 'A4' },
      { midi: 67, duration: 2, name: 'G4' },
      { midi: 65, duration: 1, name: 'F4' },
      { midi: 65, duration: 1, name: 'F4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 62, duration: 1, name: 'D4' },
      { midi: 62, duration: 1, name: 'D4' },
      { midi: 60, duration: 2, name: 'C4' }
    ]
  },
  {
    id: 'mary-lamb',
    title: 'Mary Had a Little Lamb',
    composer: 'Traditional',
    difficulty: 'Easy',
    bpm: 112,
    timeSignature: [4, 4],
    key: 'C Major',
    description: 'Gentle stepping melody ideal for beginners',
    notes: [
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 62, duration: 1, name: 'D4' },
      { midi: 60, duration: 1, name: 'C4' },
      { midi: 62, duration: 1, name: 'D4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 64, duration: 2, name: 'E4' },
      { midi: 62, duration: 1, name: 'D4' },
      { midi: 62, duration: 1, name: 'D4' },
      { midi: 62, duration: 2, name: 'D4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 67, duration: 1, name: 'G4' },
      { midi: 67, duration: 2, name: 'G4' }
    ]
  },
  {
    id: 'jingle-bells',
    title: 'Jingle Bells (Chorus)',
    composer: 'J. Pierpont',
    difficulty: 'Easy',
    bpm: 120,
    timeSignature: [4, 4],
    key: 'C Major',
    description: 'Joyful holiday favorite with repeated rhythmic notes',
    notes: [
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 64, duration: 2, name: 'E4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 64, duration: 2, name: 'E4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 67, duration: 1, name: 'G4' },
      { midi: 60, duration: 1.5, name: 'C4' },
      { midi: 62, duration: 0.5, name: 'D4' },
      { midi: 64, duration: 3, name: 'E4' }
    ]
  },
  {
    id: 'happy-birthday',
    title: 'Happy Birthday to You',
    composer: 'Traditional',
    difficulty: 'Medium',
    bpm: 90,
    timeSignature: [3, 4],
    key: 'C Major',
    description: 'Celebratory 3/4 waltz rhythm with octave intervals',
    notes: [
      { midi: 60, duration: 0.75, name: 'C4' },
      { midi: 60, duration: 0.25, name: 'C4' },
      { midi: 62, duration: 1, name: 'D4' },
      { midi: 60, duration: 1, name: 'C4' },
      { midi: 65, duration: 1, name: 'F4' },
      { midi: 64, duration: 2, name: 'E4' },
      { midi: 60, duration: 0.75, name: 'C4' },
      { midi: 60, duration: 0.25, name: 'C4' },
      { midi: 62, duration: 1, name: 'D4' },
      { midi: 60, duration: 1, name: 'C4' },
      { midi: 67, duration: 1, name: 'G4' },
      { midi: 65, duration: 2, name: 'F4' }
    ]
  },
  {
    id: 'saints-marching',
    title: 'When the Saints Go Marching In',
    composer: 'Traditional',
    difficulty: 'Medium',
    bpm: 120,
    timeSignature: [4, 4],
    key: 'C Major',
    description: 'New Orleans jazz and gospel standard',
    notes: [
      { midi: 60, duration: 1, name: 'C4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 65, duration: 1, name: 'F4' },
      { midi: 67, duration: 3, name: 'G4' },
      { midi: 60, duration: 1, name: 'C4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 65, duration: 1, name: 'F4' },
      { midi: 67, duration: 3, name: 'G4' },
      { midi: 60, duration: 1, name: 'C4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 65, duration: 1, name: 'F4' },
      { midi: 67, duration: 1, name: 'G4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 60, duration: 1, name: 'C4' },
      { midi: 62, duration: 2, name: 'D4' }
    ]
  },
  {
    id: 'fur-elise',
    title: 'Für Elise (Intro Theme)',
    composer: 'L. van Beethoven',
    difficulty: 'Medium',
    bpm: 116,
    timeSignature: [3, 8],
    key: 'A Minor',
    description: 'Iconic classical motif featuring chromatic accidental D#5',
    notes: [
      { midi: 76, duration: 0.5, name: 'E5' },
      { midi: 75, duration: 0.5, name: 'D#5' },
      { midi: 76, duration: 0.5, name: 'E5' },
      { midi: 75, duration: 0.5, name: 'D#5' },
      { midi: 76, duration: 0.5, name: 'E5' },
      { midi: 71, duration: 0.5, name: 'B4' },
      { midi: 74, duration: 0.5, name: 'D5' },
      { midi: 72, duration: 0.5, name: 'C5' },
      { midi: 69, duration: 1.5, name: 'A4' }
    ]
  },
  {
    id: 'canon-in-d',
    title: 'Canon in D (Theme)',
    composer: 'J. Pachelbel',
    difficulty: 'Medium',
    bpm: 76,
    timeSignature: [4, 4],
    key: 'D Major',
    description: 'Timeless baroque progression with F# and C# accidentals',
    notes: [
      { midi: 66, duration: 1, name: 'F#4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 62, duration: 1, name: 'D4' },
      { midi: 61, duration: 1, name: 'C#4' },
      { midi: 59, duration: 1, name: 'B3' },
      { midi: 57, duration: 1, name: 'A3' },
      { midi: 59, duration: 1, name: 'B3' },
      { midi: 61, duration: 1, name: 'C#4' }
    ]
  },
  {
    id: 'bach-minuet',
    title: 'Minuet in G (Opening)',
    composer: 'J.S. Bach',
    difficulty: 'Medium',
    bpm: 104,
    timeSignature: [3, 4],
    key: 'G Major',
    description: 'Graceful baroque dance from the Notebook for Anna Magdalena',
    notes: [
      { midi: 74, duration: 1, name: 'D5' },
      { midi: 67, duration: 0.5, name: 'G4' },
      { midi: 69, duration: 0.5, name: 'A4' },
      { midi: 71, duration: 0.5, name: 'B4' },
      { midi: 72, duration: 0.5, name: 'C5' },
      { midi: 74, duration: 1, name: 'D5' },
      { midi: 67, duration: 1, name: 'G4' },
      { midi: 67, duration: 1, name: 'G4' }
    ]
  },
  {
    id: 'scarborough-fair',
    title: 'Scarborough Fair',
    composer: 'Traditional',
    difficulty: 'Advanced',
    bpm: 92,
    timeSignature: [3, 4],
    key: 'D Dorian',
    description: 'Haunting English ballad with distinctive modal melody',
    notes: [
      { midi: 62, duration: 1.5, name: 'D4' },
      { midi: 62, duration: 0.5, name: 'D4' },
      { midi: 69, duration: 1, name: 'A4' },
      { midi: 69, duration: 1, name: 'A4' },
      { midi: 64, duration: 1, name: 'E4' },
      { midi: 65, duration: 0.5, name: 'F4' },
      { midi: 64, duration: 0.5, name: 'E4' },
      { midi: 62, duration: 2, name: 'D4' }
    ]
  }
];
