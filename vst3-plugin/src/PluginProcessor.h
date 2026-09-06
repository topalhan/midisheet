#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "core/MidiQueue.h"
#include "core/MelodyScorer.h"

namespace MidiSheet
{

class MidiSheetAudioProcessor : public juce::AudioProcessor
{
public:
    MidiSheetAudioProcessor();
    ~MidiSheetAudioProcessor() override = default;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;

    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "MidiSheet"; }

    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    MidiEventQueue& getMidiQueue() { return midiQueue; }
    HostTransportState getTransportState() const { return transportState; }
    MelodyScorer& getScorer() { return scorer; }

private:
    MidiEventQueue midiQueue;
    HostTransportState transportState;
    MelodyScorer scorer;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MidiSheetAudioProcessor)
};

} // namespace MidiSheet
