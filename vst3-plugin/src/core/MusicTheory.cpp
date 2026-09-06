#include "MusicTheory.h"
#include <algorithm>
#include <set>

namespace MidiSheet
{

const char* MusicTheory::noteNamesSharp[12] = {
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
};

const char* MusicTheory::noteNamesFlat[12] = {
    "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"
};

// Diatonic step offset for each chromatic semitone within an octave:
// C=0, C#/Db=0(or 1), D=1, D#/Eb=1(or 2), E=2, F=3, F#/Gb=3(or 4), G=4, G#/Ab=4(or 5), A=5, A#/Bb=5(or 6), B=6
const int MusicTheory::diatonicSteps[12] = {
    0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6
};

NoteInfo MusicTheory::getNoteInfo(int midi, bool preferFlats)
{
    NoteInfo info;
    info.midi = midi;

    const int semitone = (midi % 12 + 12) % 12;
    info.octave = (midi / 12) - 1;

    const char* rawName = preferFlats ? noteNamesFlat[semitone] : noteNamesSharp[semitone];
    info.displayName = rawName;
    info.fullName = juce::String(rawName) + juce::String(info.octave);

    info.stepName = juce::String::charToString(rawName[0]);
    info.accidental = (rawName[1] != '\0') ? juce::String::charToString(rawName[1]) : "";
    info.isNatural = info.accidental.isEmpty();

    // If flat preference, the diatonic step for flats (Db, Eb, Gb, Ab, Bb) is step above
    int stepInOctave = diatonicSteps[semitone];
    if (preferFlats && !info.isNatural)
    {
        // Db is step D (1), Eb is step E (2), Gb is step G (4), Ab is step A (5), Bb is step B (6)
        if (semitone == 1) stepInOctave = 1;
        else if (semitone == 3) stepInOctave = 2;
        else if (semitone == 6) stepInOctave = 4;
        else if (semitone == 8) stepInOctave = 5;
        else if (semitone == 10) stepInOctave = 6;
    }

    // Diatonic offset from C4 (MIDI 60: octave 4, step 0)
    info.diatonicStep = (info.octave - 4) * 7 + stepInOctave;
    info.isTreble = (midi >= 60);

    return info;
}

int MusicTheory::getDiatonicOffsetFromMiddleC(int midi, bool preferFlats)
{
    return getNoteInfo(midi, preferFlats).diatonicStep;
}

DetectedChord MusicTheory::detectChord(const std::vector<int>& activeMidiNotes, bool preferFlats)
{
    DetectedChord result;
    if (activeMidiNotes.empty())
    {
        result.name = "Play a note or chord";
        result.quality = "Ready";
        result.isValid = false;
        return result;
    }

    if (activeMidiNotes.size() == 1)
    {
        const auto info = getNoteInfo(activeMidiNotes[0], preferFlats);
        result.name = info.fullName;
        result.root = info.displayName;
        result.quality = "Single Note";
        result.isValid = true;
        return result;
    }

    // Sort pitches
    std::vector<int> sorted = activeMidiNotes;
    std::sort(sorted.begin(), sorted.end());

    // Extract unique pitch classes (0 to 11)
    std::set<int> uniquePcSet;
    for (int m : sorted)
        uniquePcSet.insert((m % 12 + 12) % 12);

    std::vector<int> pitchClasses(uniquePcSet.begin(), uniquePcSet.end());
    const int bassMidi = sorted.front();
    const auto bassInfo = getNoteInfo(bassMidi, preferFlats);

    // Test each pitch class as candidate root
    struct ChordPattern {
        std::vector<int> intervals;
        const char* quality;
        const char* suffix;
    };

    static const ChordPattern patterns[] = {
        // Triads
        { {0, 4, 7}, "Major Triad", "" },
        { {0, 3, 7}, "Minor Triad", "m" },
        { {0, 3, 6}, "Diminished Triad", "dim" },
        { {0, 4, 8}, "Augmented Triad", "aug" },
        { {0, 2, 7}, "Suspended 2nd", "sus2" },
        { {0, 5, 7}, "Suspended 4th", "sus4" },
        // 7th Chords
        { {0, 4, 7, 11}, "Major 7th", "maj7" },
        { {0, 3, 7, 10}, "Minor 7th", "m7" },
        { {0, 4, 7, 10}, "Dominant 7th", "7" },
        { {0, 3, 6, 9},  "Diminished 7th", "dim7" },
        { {0, 3, 6, 10}, "Half-Diminished", "m7b5" },
        { {0, 4, 7, 14}, "Add 9", "add9" },
        { {0, 4, 7, 10, 14}, "Dominant 9th", "9" }
    };

    for (int rootPc : pitchClasses)
    {
        // Build intervals from candidate root
        std::vector<int> intervals;
        for (int pc : pitchClasses)
        {
            intervals.push_back((pc - rootPc + 12) % 12);
        }
        std::sort(intervals.begin(), intervals.end());

        for (const auto& pat : patterns)
        {
            if (intervals.size() == pat.intervals.size())
            {
                bool match = true;
                for (size_t i = 0; i < intervals.size(); ++i)
                {
                    if (intervals[i] != (pat.intervals[i] % 12))
                    {
                        match = false;
                        break;
                    }
                }

                if (match)
                {
                    const auto rootInfo = getNoteInfo(rootPc + 60, preferFlats);
                    juce::String chordName = rootInfo.displayName + pat.suffix;

                    if (bassInfo.displayName != rootInfo.displayName)
                    {
                        chordName += "/" + bassInfo.displayName;
                        result.inversion = "Inversion (Bass: " + bassInfo.displayName + ")";
                    }
                    else
                    {
                        result.inversion = "Root Position";
                    }

                    result.name = chordName;
                    result.root = rootInfo.displayName;
                    result.quality = pat.quality;
                    result.isValid = true;
                    return result;
                }
            }
        }
    }

    // Fallback: list notes
    juce::String listStr;
    for (size_t i = 0; i < sorted.size(); ++i)
    {
        if (i > 0) listStr += " ";
        listStr += getNoteInfo(sorted[i], preferFlats).displayName;
    }
    result.name = listStr;
    result.quality = "Polyphonic";
    result.isValid = true;
    return result;
}

} // namespace MidiSheet
