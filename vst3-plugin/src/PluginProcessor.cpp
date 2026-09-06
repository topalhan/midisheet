#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace MidiSheet
{

MidiSheetAudioProcessor::MidiSheetAudioProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
}

void MidiSheetAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    juce::ignoreUnused(sampleRate, samplesPerBlock);
    midiQueue.reset();
}

void MidiSheetAudioProcessor::releaseResources()
{
}

bool MidiSheetAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    // Support stereo in/out or silence
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
     && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;

    return true;
}

void MidiSheetAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;

    // We do not synthesize sound: clear audio buffer so no unwanted noise is introduced
    buffer.clear();

    // Query DAW host transport state
    if (auto* hostPlayHead = getPlayHead())
    {
        if (auto posOpt = hostPlayHead->getPosition())
        {
            const auto pos = *posOpt;
            if (pos.getBpm().hasValue())
            {
                transportState.bpm = *pos.getBpm();
                scorer.setBpm(transportState.bpm);
            }
            if (pos.getTimeSignature().hasValue())
            {
                transportState.timeSigNumerator = pos.getTimeSignature()->numerator;
                transportState.timeSigDenominator = pos.getTimeSignature()->denominator;
            }
            transportState.isPlaying = pos.getIsPlaying();
            if (pos.getPpqPosition().hasValue())
                transportState.ppqPosition = *pos.getPpqPosition();
            if (pos.getTimeInSeconds().hasValue())
                transportState.timeInSeconds = *pos.getTimeInSeconds();
        }
    }

    const double sRate = getSampleRate();
    const double invSampleRate = (sRate > 0.0) ? (1.0 / sRate) : (1.0 / 44100.0);
    const double monotonicNowSec = juce::Time::getMillisecondCounterHiRes() * 0.001;

    // Inspect incoming MIDI messages and push to lock-free queue for the GUI/Scorer
    for (const auto metadata : midiMessages)
    {
        const auto msg = metadata.getMessage();
        MidiEvent ev;
        ev.timestampSeconds = (transportState.isPlaying && transportState.timeInSeconds > 0.0)
            ? (transportState.timeInSeconds + (metadata.samplePosition * invSampleRate))
            : monotonicNowSec;
        ev.ppqPosition = transportState.ppqPosition;

        if (msg.isNoteOn())
        {
            ev.type = MidiEventType::NoteOn;
            ev.noteNumber = static_cast<uint8_t>(msg.getNoteNumber());
            ev.velocity = static_cast<uint8_t>(msg.getVelocity());
            ev.channel = static_cast<uint8_t>(msg.getChannel());
            midiQueue.push(ev);
        }
        else if (msg.isNoteOff())
        {
            ev.type = MidiEventType::NoteOff;
            ev.noteNumber = static_cast<uint8_t>(msg.getNoteNumber());
            ev.velocity = 0;
            ev.channel = static_cast<uint8_t>(msg.getChannel());
            midiQueue.push(ev);
        }
        else if (msg.isController())
        {
            const int cc = msg.getControllerNumber();
            if (cc == 2) // Breath Controller (CC2)
            {
                ev.type = MidiEventType::Breath;
                ev.normalizedValue = msg.getControllerValue() / 127.0f;
                midiQueue.push(ev);
            }
            else if (cc == 64) // Sustain Pedal (CC64)
            {
                ev.type = MidiEventType::SustainPedal;
                ev.normalizedValue = (msg.getControllerValue() >= 64) ? 1.0f : 0.0f;
                midiQueue.push(ev);
            }
        }
    }

    // Zero-latency MIDI pass-through:
    // midiMessages is preserved untouched so subsequent instruments receive all notes instantaneously!
}

juce::AudioProcessorEditor* MidiSheetAudioProcessor::createEditor()
{
    return new MidiSheetAudioProcessorEditor(*this);
}

void MidiSheetAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::ValueTree state("MidiSheetState");
    state.setProperty("melodyId", scorer.getCurrentMelody().id, nullptr);
    state.setProperty("mode", (scorer.getPracticeMode() == PracticeMode::Tempo) ? "tempo" : "wait", nullptr);

    juce::MemoryOutputStream stream(destData, false);
    state.writeToStream(stream);
}

void MidiSheetAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    auto state = juce::ValueTree::readFromData(data, static_cast<size_t>(sizeInBytes));
    if (state.isValid())
    {
        if (state.hasProperty("melodyId"))
            scorer.loadMelody(state.getProperty("melodyId"));
        if (state.hasProperty("mode"))
        {
            const juce::String modeStr = state.getProperty("mode");
            scorer.setPracticeMode(modeStr == "tempo" ? PracticeMode::Tempo : PracticeMode::Wait);
        }
    }
}

} // namespace MidiSheet

// Standalone & Plugin entry point
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new MidiSheet::MidiSheetAudioProcessor();
}
