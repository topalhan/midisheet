#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace MidiSheet
{

MidiSheetAudioProcessor::MidiSheetAudioProcessor()
    : AudioProcessor(BusesProperties()
                     .withInput("Input", juce::AudioChannelSet::stereo(), true)
                     .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      routineManager(scorer)
{
    routineManager.onLookaheadChanged = [this](bool enabled) {
        setDecoupledEyeCursorEnabled(enabled);
    };
}

void MidiSheetAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    juce::ignoreUnused(samplesPerBlock);
    midiQueue.reset();
    metronomeSynth.prepare(sampleRate);
    lastMetronomeBeat = -1;
    internalBeatAccumulator = 0.0;
    prevHostPlaying = false;
    prevHostPpq = 0.0;
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
    lastProcessBlockTimeSec.store(monotonicNowSec, std::memory_order_relaxed);

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

    // Host transport edge & rewind detection
    const bool isPlaying = transportState.isPlaying;
    const bool hostJustStarted = isPlaying && !prevHostPlaying;
    const bool hostRewound = isPlaying && (transportState.ppqPosition < prevHostPpq - 0.5);

    if (hostJustStarted || hostRewound)
    {
        if (scorer.isTimeDrivenMode())
        {
            if (scorer.getPracticeMode() == PracticeMode::FirstRead)
            {
                if (!isMelodyFirstReadLocked(scorer.getCurrentMelody().id))
                    scorer.triggerHostTransportStart();
            }
            else
            {
                scorer.triggerHostTransportStart();
            }
        }
        lastMetronomeBeat = static_cast<int64_t>(std::floor(transportState.ppqPosition));
    }
    else if (!isPlaying && prevHostPlaying)
    {
        lastMetronomeBeat = -1;
        internalBeatAccumulator = 0.0;
    }

    prevHostPlaying = isPlaying;
    prevHostPpq = transportState.ppqPosition;

    // Drive continuous multi-note expiration in StrictTime and FirstRead (and Tempo)
    const bool isStandaloneApp = (wrapperType == wrapperType_Standalone);
    if (isPlaying && transportState.ppqPosition >= 0.0)
    {
        scorer.processTime(transportState.ppqPosition, monotonicNowSec);
    }
    else if (isStandaloneApp || scorer.isSilentAnalyzing())
    {
        scorer.processTime(-1.0, monotonicNowSec);
    }

    // Built-in Sample-Accurate Audio Metronome Click Generator
    const bool metronomeActive = metronomeEnabled.load(std::memory_order_relaxed)
                              && !scorer.isFinished()
                              && !scorer.isSilentAnalyzing()
                              && (scorer.getIsCountingIn() || scorer.isTimeDrivenMode());

    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    if (metronomeActive && numSamples > 0)
    {
        const int timeSigNum = (transportState.timeSigNumerator > 0)
            ? transportState.timeSigNumerator
            : ((scorer.getCurrentMelody().timeSignature.numerator > 0) ? scorer.getCurrentMelody().timeSignature.numerator : 4);

        if (isPlaying && transportState.ppqPosition >= 0.0)
        {
            const double startPpq = transportState.ppqPosition;
            const double ppqPerSample = (transportState.bpm / 60.0) * invSampleRate;
            const double endPpq = startPpq + (numSamples * ppqPerSample);

            const int64_t nextBeatInt = static_cast<int64_t>(std::ceil(startPpq));
            const int64_t endBeatInt = static_cast<int64_t>(std::floor(endPpq));

            int triggerSample = -1;
            bool isDownbeat = false;

            for (int64_t b = nextBeatInt; b <= endBeatInt; ++b)
            {
                if (b > lastMetronomeBeat)
                {
                    const int s = static_cast<int>(std::round((static_cast<double>(b) - startPpq) / ppqPerSample));
                    triggerSample = std::clamp(s, 0, numSamples - 1);
                    isDownbeat = (b % timeSigNum == 0);
                    lastMetronomeBeat = b;
                    break;
                }
            }

            for (int s = 0; s < numSamples; ++s)
            {
                if (s == triggerSample)
                    metronomeSynth.trigger(isDownbeat);

                const float clickSample = metronomeSynth.renderNextSample();
                if (clickSample != 0.0f)
                {
                    for (int ch = 0; ch < numChannels; ++ch)
                        buffer.addSample(ch, s, clickSample);
                }
            }
        }
        else
        {
            // Standalone or stopped host internal clock metronome
            const double bpm = (scorer.getCurrentMelody().bpm > 0) ? scorer.getCurrentMelody().bpm : scorer.getBpm();
            const double beatInc = (bpm / 60.0) * invSampleRate;

            for (int s = 0; s < numSamples; ++s)
            {
                internalBeatAccumulator += beatInc;
                const int64_t curBeat = static_cast<int64_t>(std::floor(internalBeatAccumulator));
                if (curBeat > lastMetronomeBeat)
                {
                    lastMetronomeBeat = curBeat;
                    const bool isDownbeat = (curBeat % timeSigNum == 0);
                    metronomeSynth.trigger(isDownbeat);
                }

                const float clickSample = metronomeSynth.renderNextSample();
                if (clickSample != 0.0f)
                {
                    for (int ch = 0; ch < numChannels; ++ch)
                        buffer.addSample(ch, s, clickSample);
                }
            }
        }
    }
    else if (numSamples > 0)
    {
        // Smoothly render remaining transient tail without cutting off
        for (int s = 0; s < numSamples; ++s)
        {
            const float clickSample = metronomeSynth.renderNextSample();
            if (clickSample != 0.0f)
            {
                for (int ch = 0; ch < numChannels; ++ch)
                    buffer.addSample(ch, s, clickSample);
            }
        }
    }

    // Zero-latency MIDI pass-through:
    // If in silent analysis, mute MIDI synth pass-through
    if (scorer.isSilentAnalyzing())
    {
        midiMessages.clear();
    }
}

juce::AudioProcessorEditor* MidiSheetAudioProcessor::createEditor()
{
    return new MidiSheetAudioProcessorEditor(*this);
}

bool MidiSheetAudioProcessor::isMelodyFirstReadLocked(const juce::String& melodyId) const
{
    return firstReadRecords.find(melodyId) != firstReadRecords.end();
}

void MidiSheetAudioProcessor::recordFirstReadResult(const FirstReadRecord& record)
{
    firstReadRecords[record.melodyId] = record;
}

void MidiSheetAudioProcessor::resetFirstReadLockouts()
{
    firstReadRecords.clear();
}

void MidiSheetAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::ValueTree state("MidiSheetState");
    state.setProperty("melodyId", scorer.getCurrentMelody().id, nullptr);
    juce::String modeStr = "wait";
    switch (scorer.getPracticeMode())
    {
        case PracticeMode::Wait: modeStr = "wait"; break;
        case PracticeMode::Tempo: modeStr = "tempo"; break;
        case PracticeMode::StrictTime: modeStr = "strict"; break;
        case PracticeMode::FirstRead: modeStr = "firstread"; break;
    }
    state.setProperty("mode", modeStr, nullptr);

    juce::String disrupterStr = "none";
    switch (disrupterMode)
    {
        case VisualDisrupterMode::None: disrupterStr = "none"; break;
        case VisualDisrupterMode::VanishingBar: disrupterStr = "vanishing"; break;
        case VisualDisrupterMode::AdvanceCurtain: disrupterStr = "curtain"; break;
    }
    state.setProperty("disrupter", disrupterStr, nullptr);
    state.setProperty("eyeCursor", decoupledEyeCursorEnabled, nullptr);
    state.setProperty("metronome", metronomeEnabled.load(std::memory_order_relaxed), nullptr);

    juce::ValueTree frList("FirstReadRecords");
    for (const auto& [id, rec] : firstReadRecords)
    {
        juce::ValueTree item("Record");
        item.setProperty("id", rec.melodyId, nullptr);
        item.setProperty("title", rec.title, nullptr);
        item.setProperty("pitchAcc", rec.pitchAccuracy, nullptr);
        item.setProperty("rhythmAcc", rec.rhythmAccuracy, nullptr);
        item.setProperty("score", rec.sightReadingScore, nullptr);
        item.setProperty("recoveries", rec.recoveries, nullptr);
        item.setProperty("timestamp", static_cast<juce::int64>(rec.timestamp), nullptr);
        frList.appendChild(item, nullptr);
    }
    state.appendChild(frList, nullptr);

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
            if (modeStr == "firstread") scorer.setPracticeMode(PracticeMode::FirstRead);
            else if (modeStr == "strict") scorer.setPracticeMode(PracticeMode::StrictTime);
            else if (modeStr == "tempo") scorer.setPracticeMode(PracticeMode::Tempo);
            else scorer.setPracticeMode(PracticeMode::Wait);
        }
        if (state.hasProperty("disrupter"))
        {
            const juce::String dStr = state.getProperty("disrupter");
            if (dStr == "vanishing") disrupterMode = VisualDisrupterMode::VanishingBar;
            else if (dStr == "curtain") disrupterMode = VisualDisrupterMode::AdvanceCurtain;
            else disrupterMode = VisualDisrupterMode::None;
        }
        if (state.hasProperty("eyeCursor"))
        {
            decoupledEyeCursorEnabled = static_cast<bool>(state.getProperty("eyeCursor"));
        }
        if (state.hasProperty("metronome"))
        {
            metronomeEnabled.store(static_cast<bool>(state.getProperty("metronome")), std::memory_order_relaxed);
        }

        auto frList = state.getChildWithName("FirstReadRecords");
        if (frList.isValid())
        {
            firstReadRecords.clear();
            for (int i = 0; i < frList.getNumChildren(); ++i)
            {
                auto item = frList.getChild(i);
                FirstReadRecord rec;
                rec.melodyId = item.getProperty("id").toString();
                rec.title = item.getProperty("title").toString();
                rec.pitchAccuracy = item.getProperty("pitchAcc");
                rec.rhythmAccuracy = item.getProperty("rhythmAcc");
                rec.sightReadingScore = item.getProperty("score");
                rec.recoveries = item.getProperty("recoveries");
                const juce::int64 millis = item.getProperty("timestamp");
                rec.timestamp = millis;
                rec.dateStr = juce::Time(millis).formatted("%Y-%m-%d %H:%M");
                firstReadRecords[rec.melodyId] = rec;
            }
        }
    }
}

} // namespace MidiSheet

// Standalone & Plugin entry point
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new MidiSheet::MidiSheetAudioProcessor();
}
