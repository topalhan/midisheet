#pragma once

#include <juce_core/juce_core.h>
#include <juce_graphics/juce_graphics.h>
#include <vector>
#include <string>

namespace MidiSheet
{

struct NoteInfo
{
    int midi = 60;
    juce::String stepName = "C";      // "C", "D", "E", etc.
    juce::String accidental = "";     // "#", "b", or ""
    int octave = 4;
    juce::String fullName = "C4";     // e.g. "C4", "F#4", "Bb3"
    juce::String displayName = "C";   // e.g. "C", "F#", "Bb"
    int diatonicStep = 0;             // 0 = C4, 1 = D4, 2 = E4, -1 = B3, etc.
    bool isNatural = true;
    bool isTreble = true;             // true if >= 60 (Middle C)
};

struct DetectedChord
{
    juce::String name = "No Notes";
    juce::String root = "";
    juce::String quality = "Ready";
    juce::String inversion = "";
    bool isValid = false;
};

enum class IntervalCategory
{
    Unison, // 0 semitones -> Cyan
    Step,   // 1-2 semitones (diatonic 2nd) -> Emerald Green
    Skip,   // 3-4 semitones (diatonic 3rd) -> Vivid Orange
    Leap    // 5+ semitones (4ths, 5ths, 6ths, 8ves) -> Royal Purple
};

enum class VisualDisrupterMode
{
    None,
    VanishingBar,
    AdvanceCurtain
};

struct IntervalInfo
{
    IntervalCategory category = IntervalCategory::Unison;
    int semitones = 0;
    int diatonicSteps = 0;
    juce::String shortLabel = "1st"; // "1st", "2nd", "3rd", "4th", "5th", "8ve"
    juce::String fullLabel = "Unison";
    juce::Colour color { 0xFF38BDF8 };
    juce::Colour glow { 0x6638BDF8 };
};

struct KeySignature
{
    juce::String name = "C Major";
    int accidentalCount = 0; // positive for sharps, negative for flats
    uint16_t diatonicMask = (1 << 0) | (1 << 2) | (1 << 4) | (1 << 5) | (1 << 7) | (1 << 9) | (1 << 11);

    bool isDiatonic(int midi) const noexcept
    {
        int pitchClass = ((midi % 12) + 12) % 12;
        return (diatonicMask & (1 << pitchClass)) != 0;
    }

    static KeySignature getByKeyName(const juce::String& keyName);
    static KeySignature getCMajor();
    static KeySignature getGMajor();
    static KeySignature getDMajor();
    static KeySignature getAMajor();
    static KeySignature getEMajor();
    static KeySignature getFMajor();
    static KeySignature getBbMajor();
    static KeySignature getEbMajor();
    static KeySignature getAMinor();
    static KeySignature getDMinor();
    static KeySignature getEMinor();
};

class MusicTheory
{
public:
    static NoteInfo getNoteInfo(int midi, bool preferFlats = false);

    /**
     * Compute diatonic staff line position offset relative to Middle C (C4 = 0).
     * Positive = up on treble clef, Negative = down on bass clef.
     */
    static int getDiatonicOffsetFromMiddleC(int midi, bool preferFlats = false);

    /**
     * Analyze a set of active sounding MIDI notes and identify root, quality, and inversion.
     */
    static DetectedChord detectChord(const std::vector<int>& activeMidiNotes, bool preferFlats = false);

    /**
     * Classify relative motion / interval between two MIDI notes:
     * - Step (2nd): 1 to 2 semitones -> Green
     * - Skip (3rd): 3 to 4 semitones -> Orange
     * - Leap (4th, 5th, 6th, Octave+): 5+ semitones -> Purple
     * - Unison: 0 semitones -> Cyan
     */
    static IntervalInfo classifyInterval(int midi1, int midi2, bool preferFlats = false);

private:
    static const char* noteNamesSharp[12];
    static const char* noteNamesFlat[12];
    static const int diatonicSteps[12];
};

} // namespace MidiSheet
