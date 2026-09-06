#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"
#include "ui/GrandStaffComponent.h"
#include "ui/ScoreboardComponent.h"
#include "ui/MelodySelectorComponent.h"
#include "ui/VirtualPianoComponent.h"
#include "core/MusicTheory.h"
#include <vector>

namespace MidiSheet
{

class MidiSheetAudioProcessorEditor : public juce::AudioProcessorEditor,
                                      public juce::Timer
{
public:
    explicit MidiSheetAudioProcessorEditor(MidiSheetAudioProcessor&);
    ~MidiSheetAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;
    void timerCallback() override;

private:
    void handleMidiEvent(const MidiEvent& ev);
    void updateChordDetection();

    MidiSheetAudioProcessor& audioProcessor;

    GrandStaffComponent grandStaff;
    ScoreboardComponent scoreboard;
    VirtualPianoComponent virtualPiano;
    MelodySelectorComponent melodySelector;

    bool isMelodySelectorOpen = false;
    bool preferFlats = false;
    std::vector<int> activeMidiNotes;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MidiSheetAudioProcessorEditor)
};

} // namespace MidiSheet
