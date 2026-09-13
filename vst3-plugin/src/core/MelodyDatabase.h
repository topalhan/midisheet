#pragma once

#include <juce_core/juce_core.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <vector>

namespace MidiSheet
{

struct MelodyNote
{
    int midi = 60;
    float duration = 1.0f; // Duration in beats (quarter notes)
    juce::String name = "C4";
    double startBeat = 0.0;
};

struct TimeSignature
{
    int numerator = 4;
    int denominator = 4;
};

struct Melody
{
    juce::String id;
    juce::String title;
    juce::String composer;
    juce::String difficulty; // "Easy", "Medium", "Hard"
    int bpm = 120;
    int timeSigNum = 4;
    int timeSigDen = 4;
    TimeSignature timeSignature { 4, 4 };
    juce::String key;
    juce::String description;
    std::vector<MelodyNote> notes;
    bool isCustom = false;
};

struct MidiChannelInfo
{
    int channelNumber = 1; // 1-16
    int noteCount = 0;
    juce::String trackName;
    juce::String instrumentName;
    int lowestMidi = 127;
    int highestMidi = 0;
    bool isDrum = false; // channel 10
};

class MelodyDatabase
{
public:
    static const std::vector<Melody>& getAllMelodies();
    static const Melody* getMelodyById(const juce::String& id);
    static std::vector<MidiChannelInfo> inspectMidiChannels(const juce::File& file);
    static bool loadMidiFile(const juce::File& file, juce::String& outMelodyId, int targetChannel = -1);
    static void addCustomMelody(const Melody& melody);
    static void removeCustomMelody(const juce::String& id);

private:
    static std::vector<Melody> createMelodyLibrary();
    static std::vector<Melody>& getCustomMelodiesList();
    static std::vector<Melody>& getCombinedMelodiesList();
    static void rebuildCombinedList();
};

} // namespace MidiSheet
