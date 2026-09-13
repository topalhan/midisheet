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

KeySignature KeySignature::getCMajor()
{
    return { "C Major", 0, (1 << 0) | (1 << 2) | (1 << 4) | (1 << 5) | (1 << 7) | (1 << 9) | (1 << 11) };
}

KeySignature KeySignature::getGMajor()
{
    return { "G Major", 1, (1 << 7) | (1 << 9) | (1 << 11) | (1 << 0) | (1 << 2) | (1 << 4) | (1 << 6) };
}

KeySignature KeySignature::getDMajor()
{
    return { "D Major", 2, (1 << 2) | (1 << 4) | (1 << 6) | (1 << 7) | (1 << 9) | (1 << 11) | (1 << 1) };
}

KeySignature KeySignature::getAMajor()
{
    return { "A Major", 3, (1 << 9) | (1 << 11) | (1 << 1) | (1 << 2) | (1 << 4) | (1 << 6) | (1 << 8) };
}

KeySignature KeySignature::getEMajor()
{
    return { "E Major", 4, (1 << 4) | (1 << 6) | (1 << 8) | (1 << 9) | (1 << 11) | (1 << 1) | (1 << 3) };
}

KeySignature KeySignature::getFMajor()
{
    return { "F Major", -1, (1 << 5) | (1 << 7) | (1 << 9) | (1 << 10) | (1 << 0) | (1 << 2) | (1 << 4) };
}

KeySignature KeySignature::getBbMajor()
{
    return { "Bb Major", -2, (1 << 10) | (1 << 0) | (1 << 2) | (1 << 3) | (1 << 5) | (1 << 7) | (1 << 9) };
}

KeySignature KeySignature::getEbMajor()
{
    return { "Eb Major", -3, (1 << 3) | (1 << 5) | (1 << 7) | (1 << 8) | (1 << 10) | (1 << 0) | (1 << 2) };
}

KeySignature KeySignature::getAMinor()
{
    auto key = getCMajor();
    key.name = "A Minor";
    return key;
}

KeySignature KeySignature::getDMinor()
{
    auto key = getFMajor();
    key.name = "D Minor";
    return key;
}

KeySignature KeySignature::getEMinor()
{
    auto key = getGMajor();
    key.name = "E Minor";
    return key;
}

KeySignature KeySignature::getByKeyName(const juce::String& keyName)
{
    if (keyName.containsIgnoreCase("G Major")) return getGMajor();
    if (keyName.containsIgnoreCase("D Major")) return getDMajor();
    if (keyName.containsIgnoreCase("A Major")) return getAMajor();
    if (keyName.containsIgnoreCase("E Major")) return getEMajor();
    if (keyName.containsIgnoreCase("F Major")) return getFMajor();
    if (keyName.containsIgnoreCase("Bb Major") || keyName.containsIgnoreCase("B-Flat")) return getBbMajor();
    if (keyName.containsIgnoreCase("Eb Major") || keyName.containsIgnoreCase("E-Flat")) return getEbMajor();
    if (keyName.containsIgnoreCase("A Minor")) return getAMinor();
    if (keyName.containsIgnoreCase("D Minor")) return getDMinor();
    if (keyName.containsIgnoreCase("E Minor")) return getEMinor();
    return getCMajor();
}

IntervalInfo MusicTheory::classifyInterval(int midi1, int midi2, bool preferFlats)
{
    const int semitones = std::abs(midi2 - midi1);
    const auto info1 = getNoteInfo(midi1, preferFlats);
    const auto info2 = getNoteInfo(midi2, preferFlats);
    const int stepDist = std::abs(info2.diatonicStep - info1.diatonicStep);

    if (semitones == 0)
    {
        return {
            IntervalCategory::Unison, 0, 0,
            "1st", "Unison",
            juce::Colour(0xFF38BDF8), juce::Colour(0x6638BDF8)
        };
    }
    else if (stepDist == 1 || semitones <= 2)
    {
        // Step (2nd): Emerald Green
        return {
            IntervalCategory::Step, semitones, 1,
            "2nd", "Step (2nd)",
            juce::Colour(0xFF22C55E), juce::Colour(0x6622C55E)
        };
    }
    else if (stepDist == 2 || (semitones >= 3 && semitones <= 4))
    {
        // Skip (3rd): Vivid Orange
        return {
            IntervalCategory::Skip, semitones, 2,
            "3rd", "Skip (3rd)",
            juce::Colour(0xFFF97316), juce::Colour(0x66F97316)
        };
    }
    else
    {
        // Leap: Royal Purple
        juce::String label = juce::String(stepDist + 1) + "th";
        if (stepDist == 3 || semitones == 5) label = "4th";
        else if (stepDist == 4 || semitones == 7) label = "5th";
        else if (stepDist == 5 || semitones == 9) label = "6th";
        else if (stepDist == 6 || semitones == 11) label = "7th";
        else if (stepDist == 7 || semitones == 12) label = "8ve";

        return {
            IntervalCategory::Leap, semitones, stepDist,
            label, "Leap (" + label + ")",
            juce::Colour(0xFFA855F7), juce::Colour(0x66A855F7)
        };
    }
}

} // namespace MidiSheet
