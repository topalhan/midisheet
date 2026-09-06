#pragma once

#include <juce_core/juce_core.h>
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

private:
    static const char* noteNamesSharp[12];
    static const char* noteNamesFlat[12];
    static const int diatonicSteps[12];
};

} // namespace MidiSheet
