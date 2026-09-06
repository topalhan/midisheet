#pragma once

#include <juce_core/juce_core.h>
#include <atomic>
#include <array>

namespace MidiSheet
{

enum class MidiEventType : uint8_t
{
    NoteOn,
    NoteOff,
    Breath,
    SustainPedal
};

struct MidiEvent
{
    MidiEventType type = MidiEventType::NoteOn;
    uint8_t noteNumber = 60;
    uint8_t velocity = 100;
    uint8_t channel = 1;
    float normalizedValue = 0.0f; // For CC2 (Breath) or CC64 (Sustain)
    double timestampSeconds = 0.0;
    double ppqPosition = 0.0;     // Musical bar/beat position in DAW timeline
};

struct HostTransportState
{
    double bpm = 120.0;
    int timeSigNumerator = 4;
    int timeSigDenominator = 4;
    bool isPlaying = false;
    double ppqPosition = 0.0;
    double timeInSeconds = 0.0;
};

/**
 * Lock-free, thread-safe Single-Producer Single-Consumer (SPSC) ring buffer
 * designed for real-time audio thread to GUI thread communication without locks.
 */
class MidiEventQueue
{
public:
    MidiEventQueue() : fifo(Capacity) {}

    bool push(const MidiEvent& event) noexcept
    {
        int start1, size1, start2, size2;
        fifo.prepareToWrite(1, start1, size1, start2, size2);

        if (size1 > 0)
        {
            buffer[static_cast<size_t>(start1)] = event;
            fifo.finishedWrite(1);
            return true;
        }
        return false;
    }

    bool pop(MidiEvent& outEvent) noexcept
    {
        int start1, size1, start2, size2;
        fifo.prepareToRead(1, start1, size1, start2, size2);

        if (size1 > 0)
        {
            outEvent = buffer[static_cast<size_t>(start1)];
            fifo.finishedRead(1);
            return true;
        }
        return false;
    }

    void reset() noexcept
    {
        fifo.reset();
    }

private:
    static constexpr int Capacity = 1024;
    juce::AbstractFifo fifo;
    std::array<MidiEvent, Capacity> buffer;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MidiEventQueue)
};

} // namespace MidiSheet
