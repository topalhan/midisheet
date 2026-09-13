#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "core/MidiQueue.h"
#include "core/MelodyScorer.h"
#include "core/MusicTheory.h"
#include "core/DailyRoutineManager.h"

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

    bool isMelodyFirstReadLocked(const juce::String& melodyId) const;
    void recordFirstReadResult(const FirstReadRecord& record);
    const std::map<juce::String, FirstReadRecord>& getFirstReadRecords() const { return firstReadRecords; }
    void resetFirstReadLockouts();

    VisualDisrupterMode getVisualDisrupterMode() const noexcept { return disrupterMode; }
    void setVisualDisrupterMode(VisualDisrupterMode mode) noexcept { disrupterMode = mode; }

    bool isDecoupledEyeCursorEnabled() const noexcept { return decoupledEyeCursorEnabled; }
    void setDecoupledEyeCursorEnabled(bool enabled) noexcept { decoupledEyeCursorEnabled = enabled; }

    double getLastProcessBlockTimeSec() const noexcept { return lastProcessBlockTimeSec.load(std::memory_order_relaxed); }

    bool isMetronomeEnabled() const noexcept { return metronomeEnabled.load(std::memory_order_relaxed); }
    void setMetronomeEnabled(bool enabled) noexcept { metronomeEnabled.store(enabled, std::memory_order_relaxed); }

    DailyRoutineManager& getRoutineManager() { return routineManager; }
    bool isRoutineMode() const noexcept { return routineModeActive; }
    void setRoutineMode(bool active) noexcept { routineModeActive = active; }

    struct MetronomeClickSynth
    {
        float sampleRate = 44100.0f;
        float currentAmp = 0.0f;
        float decay = 0.992f;
        float phase = 0.0f;
        float phaseDelta = 0.0f;
        int samplesRemaining = 0;

        void prepare(double sRate)
        {
            sampleRate = static_cast<float>(sRate > 0.0 ? sRate : 44100.0);
        }

        void trigger(bool isDownbeat)
        {
            const float freq = isDownbeat ? 1400.0f : 900.0f;
            phase = 0.0f;
            phaseDelta = static_cast<float>(juce::MathConstants<double>::twoPi * freq / sampleRate);
            samplesRemaining = static_cast<int>(sampleRate * 0.030f); // 30ms burst
            decay = std::pow(0.001f, 1.0f / static_cast<float>(std::max(1, samplesRemaining)));
            currentAmp = isDownbeat ? 0.65f : 0.42f;
        }

        float renderNextSample()
        {
            if (samplesRemaining <= 0)
                return 0.0f;

            samplesRemaining--;
            const float out = currentAmp * std::sin(phase);
            phase += phaseDelta;
            currentAmp *= decay;
            return out;
        }
    };

private:
    MidiEventQueue midiQueue;
    HostTransportState transportState;
    MelodyScorer scorer;
    DailyRoutineManager routineManager;
    bool routineModeActive = false;
    std::map<juce::String, FirstReadRecord> firstReadRecords;
    VisualDisrupterMode disrupterMode = VisualDisrupterMode::None;
    bool decoupledEyeCursorEnabled = false;
    std::atomic<double> lastProcessBlockTimeSec { 0.0 };
    std::atomic<bool> metronomeEnabled { true };

    MetronomeClickSynth metronomeSynth;
    bool prevHostPlaying = false;
    double prevHostPpq = 0.0;
    int64_t lastMetronomeBeat = -1;
    double internalBeatAccumulator = 0.0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MidiSheetAudioProcessor)
};

} // namespace MidiSheet
