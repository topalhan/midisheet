#pragma once

#include <juce_core/juce_core.h>
#include <vector>

namespace MidiSheet
{

struct MelodyNote
{
    int midi = 60;
    float duration = 1.0f; // Duration in beats (quarter notes)
    juce::String name = "C4";
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
    juce::String key;
    juce::String description;
    std::vector<MelodyNote> notes;
};

class MelodyDatabase
{
public:
    static const std::vector<Melody>& getAllMelodies();
    static const Melody* getMelodyById(const juce::String& id);

private:
    static std::vector<Melody> createMelodyLibrary();
};

} // namespace MidiSheet
