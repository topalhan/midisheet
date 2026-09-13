#include "PluginEditor.h"
#include <algorithm>

namespace MidiSheet
{

MidiSheetAudioProcessorEditor::MidiSheetAudioProcessorEditor(MidiSheetAudioProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p), dailyRoutine(p.getRoutineManager())
{
    // Enable resizable plugin window
    setResizable(true, true);
    setResizeLimits(800, 560, 1920, 1200);
    setSize(920, 620);

    // 1. Add Grand Staff Component
    grandStaff.onReviewNoteChanged = [this](int noteIdx, int targetMidi, int wrongMidi) {
        juce::ignoreUnused(noteIdx);
        if (wrongMidi >= 0)
            virtualPiano.setReviewNotes(targetMidi, wrongMidi);
        else
            virtualPiano.clearReviewNotes();
    };
    grandStaff.onSkipSilentAnalysisClicked = [this]() {
        audioProcessor.getScorer().skipSilentAnalysis();
    };
    addAndMakeVisible(grandStaff);

    // 2. Add Scoreboard HUD Component
    scoreboard.onSelectMelodyClicked = [this]() {
        isMelodySelectorOpen = true;
        melodySelector.setVisible(true);
        resized();
    };
    scoreboard.onRestartClicked = [this]() {
        virtualPiano.clearReviewNotes();
        audioProcessor.getScorer().restart();
        const auto& scorer = audioProcessor.getScorer();
        grandStaff.setPracticeState(&scorer.getCurrentMelody(),
                                     scorer.getCurrentNoteIndex(),
                                     scorer.isFinished(),
                                     scorer.getPracticeMode(),
                                     scorer.getCurrentPlayheadBeats(),
                                     scorer.getIsCountingIn(),
                                     scorer.isSilentAnalyzing(),
                                     scorer.getAnalysisSecondsRemaining(),
                                     scorer.getCountInBeat(),
                                     scorer.getCountInTotal());
        if (auto* target = audioProcessor.getScorer().getCurrentTargetNote())
            virtualPiano.setTargetNote(target->midi);
    };
    scoreboard.onModeChanged = [this](PracticeMode mode) {
        audioProcessor.getScorer().setPracticeMode(mode);
    };
    scoreboard.onDisrupterModeChanged = [this](VisualDisrupterMode mode) {
        grandStaff.setVisualDisrupterMode(mode);
        audioProcessor.setVisualDisrupterMode(mode);
    };
    scoreboard.onEyeCursorToggled = [this](bool enabled) {
        grandStaff.setDecoupledEyeCursorEnabled(enabled);
        audioProcessor.setDecoupledEyeCursorEnabled(enabled);
    };
    scoreboard.onMetronomeToggled = [this](bool enabled) {
        audioProcessor.setMetronomeEnabled(enabled);
    };
    scoreboard.onRoutineClicked = [this]() {
        isRoutineMode = true;
        audioProcessor.setRoutineMode(true);
        scoreboard.setVisible(false);
        dailyRoutine.setVisible(true);
        audioProcessor.getRoutineManager().startOrResume();
        resized();
    };
    addAndMakeVisible(scoreboard);

    // 2b. Add Daily Routine Component (initially hidden)
    dailyRoutine.onExitRoutineMode = [this]() {
        isRoutineMode = false;
        audioProcessor.setRoutineMode(false);
        dailyRoutine.setVisible(false);
        scoreboard.setVisible(true);
        audioProcessor.getScorer().restart();
        resized();
    };
    addChildComponent(dailyRoutine);

    // 3. Add Virtual Piano Keyboard Component
    virtualPiano.onNoteTriggered = [this](int midi, int velocity) {
        MidiEvent ev;
        ev.type = MidiEventType::NoteOn;
        ev.noteNumber = static_cast<uint8_t>(midi);
        ev.velocity = static_cast<uint8_t>(velocity);
        ev.timestampSeconds = juce::Time::getMillisecondCounterHiRes() * 0.001;
        handleMidiEvent(ev);
    };
    virtualPiano.onNoteReleased = [this](int midi) {
        MidiEvent ev;
        ev.type = MidiEventType::NoteOff;
        ev.noteNumber = static_cast<uint8_t>(midi);
        ev.velocity = 0;
        ev.timestampSeconds = juce::Time::getMillisecondCounterHiRes() * 0.001;
        handleMidiEvent(ev);
    };
    addAndMakeVisible(virtualPiano);

    // 4. Add Melody Selector Modal Component (initially hidden)
    melodySelector.onMelodySelected = [this](const juce::String& melodyId) {
        virtualPiano.clearReviewNotes();
        audioProcessor.getScorer().loadMelody(melodyId);
        const auto& scorer = audioProcessor.getScorer();
        grandStaff.setPracticeState(&scorer.getCurrentMelody(),
                                    scorer.getCurrentNoteIndex(),
                                    scorer.isFinished(),
                                    scorer.getPracticeMode(),
                                    scorer.getCurrentPlayheadBeats(),
                                    scorer.getIsCountingIn(),
                                    scorer.isSilentAnalyzing(),
                                    scorer.getAnalysisSecondsRemaining(),
                                    scorer.getCountInBeat(),
                                    scorer.getCountInTotal());
        grandStaff.setNoteEvaluations(&audioProcessor.getScorer().getNoteEvaluations());
        if (auto* target = audioProcessor.getScorer().getCurrentTargetNote())
            virtualPiano.setTargetNote(target->midi);
        isMelodySelectorOpen = false;
        melodySelector.setVisible(false);
    };
    melodySelector.onCloseClicked = [this]() {
        isMelodySelectorOpen = false;
        melodySelector.setVisible(false);
    };
    melodySelector.setVisible(false);
    addChildComponent(melodySelector);

    // Initial state
    const auto& initScorer = audioProcessor.getScorer();
    grandStaff.setPracticeState(&initScorer.getCurrentMelody(),
                                initScorer.getCurrentNoteIndex(),
                                initScorer.isFinished(),
                                initScorer.getPracticeMode(),
                                initScorer.getCurrentPlayheadBeats(),
                                initScorer.getIsCountingIn(),
                                initScorer.isSilentAnalyzing(),
                                initScorer.getAnalysisSecondsRemaining(),
                                initScorer.getCountInBeat(),
                                initScorer.getCountInTotal());
    grandStaff.setNoteEvaluations(&audioProcessor.getScorer().getNoteEvaluations());
    grandStaff.setVisualDisrupterMode(audioProcessor.getVisualDisrupterMode());
    grandStaff.setDecoupledEyeCursorEnabled(audioProcessor.isDecoupledEyeCursorEnabled());
    scoreboard.setDisrupterMode(audioProcessor.getVisualDisrupterMode());
    scoreboard.setEyeCursorEnabled(audioProcessor.isDecoupledEyeCursorEnabled());
    scoreboard.setMetronomeEnabled(audioProcessor.isMetronomeEnabled());
    if (auto* target = audioProcessor.getScorer().getCurrentTargetNote())
        virtualPiano.setTargetNote(target->midi);

    // Start 60 FPS timer to drain lock-free MIDI FIFO from audio thread
    startTimerHz(60);
}

MidiSheetAudioProcessorEditor::~MidiSheetAudioProcessorEditor()
{
    stopTimer();
}

void MidiSheetAudioProcessorEditor::resized()
{
    const auto bounds = getLocalBounds();
    const int padding = 12;

    // Bottom: Virtual Piano Keyboard (height: 110px)
    const int pianoY = bounds.getBottom() - 110 - padding;
    virtualPiano.setBounds(padding, pianoY, bounds.getWidth() - padding * 2, 110);

    int staffY = padding;
    if (isRoutineMode)
    {
        dailyRoutine.setBounds(padding, padding, bounds.getWidth() - padding * 2, 98);
        staffY = dailyRoutine.getBottom() + padding;
    }
    else
    {
        scoreboard.setBounds(padding, padding, bounds.getWidth() - padding * 2, 72);
        staffY = scoreboard.getBottom() + padding;
    }

    // Middle: Grand Staff Notation
    const int staffHeight = pianoY - staffY - padding;
    grandStaff.setBounds(padding, staffY, bounds.getWidth() - padding * 2, staffHeight);

    // Modal overlay centered
    if (isMelodySelectorOpen)
    {
        const int modalW = std::min(580, bounds.getWidth() - 40);
        const int modalH = std::min(460, bounds.getHeight() - 40);
        melodySelector.setBounds((bounds.getWidth() - modalW) / 2, (bounds.getHeight() - modalH) / 2, modalW, modalH);
        melodySelector.toFront(true);
    }
}

void MidiSheetAudioProcessorEditor::paint(juce::Graphics& g)
{
    // Background
    g.fillAll(juce::Colour::fromRGB(2, 6, 23)); // Slate 950 deep

    // Dim overlay if modal is open
    if (isMelodySelectorOpen)
    {
        g.setColour(juce::Colours::black.withAlpha(0.6f));
        g.fillRect(getLocalBounds());
    }
}

void MidiSheetAudioProcessorEditor::timerCallback()
{
    const double nowSec = juce::Time::getMillisecondCounterHiRes() * 0.001;
    const bool isStandalone = (audioProcessor.wrapperType == juce::AudioProcessor::wrapperType_Standalone);
    if (isStandalone || audioProcessor.getScorer().isSilentAnalyzing())
    {
        if ((nowSec - audioProcessor.getLastProcessBlockTimeSec()) > 0.100)
        {
            audioProcessor.getScorer().processTime(-1.0, nowSec);
        }
    }

    // Drain all incoming MIDI events from the lock-free FIFO queue
    auto& queue = audioProcessor.getMidiQueue();
    MidiEvent ev;
    bool hasEvents = false;

    while (queue.pop(ev))
    {
        hasEvents = true;
        handleMidiEvent(ev);
    }

    // Query host transport
    const auto transport = audioProcessor.getTransportState();
    const auto chord = MusicTheory::detectChord(activeMidiNotes, preferFlats);

    const auto& scorer = audioProcessor.getScorer();
    grandStaff.setPracticeState(&scorer.getCurrentMelody(),
                                scorer.getCurrentNoteIndex(),
                                scorer.isFinished(),
                                scorer.getPracticeMode(),
                                scorer.getCurrentPlayheadBeats(),
                                scorer.getIsCountingIn(),
                                scorer.isSilentAnalyzing(),
                                scorer.getAnalysisSecondsRemaining(),
                                scorer.getCountInBeat(),
                                scorer.getCountInTotal());
    grandStaff.setNoteEvaluations(&scorer.getNoteEvaluations());
    scoreboard.updateState(scorer, chord, transport.bpm, transport.isPlaying, activeMidiNotes, preferFlats, grandStaff.getActiveReviewMistakeIndex());

    // Record FirstRead result if just completed
    if (scorer.isFinished() && scorer.getPracticeMode() == PracticeMode::FirstRead)
    {
        const auto& mId = scorer.getCurrentMelody().id;
        if (!audioProcessor.isMelodyFirstReadLocked(mId))
        {
            FirstReadRecord rec;
            rec.melodyId = mId;
            rec.title = scorer.getCurrentMelody().title;
            rec.timestamp = juce::Time::getCurrentTime().toMilliseconds();
            rec.dateStr = juce::Time::getCurrentTime().formatted("%Y-%m-%d %H:%M");
            rec.pitchAccuracy = scorer.getScorecard().pitchAccuracy;
            rec.rhythmAccuracy = scorer.getScorecard().rhythmAccuracy;
            rec.sightReadingScore = scorer.getScorecard().sightReadingScore;
            rec.recoveries = scorer.getScorecard().recoveries;
            rec.bpm = scorer.getBpm();
            audioProcessor.recordFirstReadResult(rec);
        }
    }

    if (audioProcessor.isRoutineMode())
    {
        audioProcessor.getRoutineManager().advanceTime(0.033);
        dailyRoutine.updateUI();

        if (scorer.isFinished())
        {
            audioProcessor.getRoutineManager().onMelodyCompleted(scorer.getScorecard());
        }
    }

    grandStaff.repaint();

    if (hasEvents)
    {
        repaint();
    }
}

void MidiSheetAudioProcessorEditor::handleMidiEvent(const MidiEvent& ev)
{
    const int midi = static_cast<int>(ev.noteNumber);

    if (ev.type == MidiEventType::NoteOn)
    {
        // Add to active notes
        if (std::find(activeMidiNotes.begin(), activeMidiNotes.end(), midi) == activeMidiNotes.end())
        {
            activeMidiNotes.push_back(midi);
        }

        grandStaff.noteOn(midi, ev.velocity);
        virtualPiano.noteOn(midi);

        // Evaluate note against practice melody with high-precision timestamp
        auto& scorer = audioProcessor.getScorer();
        const auto transport = audioProcessor.getTransportState();
        const double hostPpq = (transport.isPlaying && transport.ppqPosition >= 0.0) ? transport.ppqPosition : -1.0;
        const double noteTimestamp = (ev.timestampSeconds > 0.0)
            ? ev.timestampSeconds
            : (juce::Time::getMillisecondCounterHiRes() * 0.001);

        const bool hit = scorer.evaluateNote(midi, ev.velocity, noteTimestamp, hostPpq);

        grandStaff.setPracticeState(&scorer.getCurrentMelody(),
                                    scorer.getCurrentNoteIndex(),
                                    scorer.isFinished(),
                                    scorer.getPracticeMode(),
                                    scorer.getCurrentPlayheadBeats(),
                                    scorer.getIsCountingIn(),
                                    scorer.isSilentAnalyzing(),
                                    scorer.getAnalysisSecondsRemaining());
        if (!hit)
        {
            grandStaff.triggerMistakeFlash();
        }

        // Check if downbeat tempo recovery occurred
        const auto& evals = scorer.getNoteEvaluations();
        const int prevIdx = scorer.getCurrentNoteIndex() - 1;
        if (prevIdx >= 0 && prevIdx < static_cast<int>(evals.size()) && evals[static_cast<size_t>(prevIdx)].isRecovered)
        {
            grandStaff.triggerRecoveryFlash();
        }

        if (auto* target = scorer.getCurrentTargetNote())
            virtualPiano.setTargetNote(target->midi);
        else
            virtualPiano.setTargetNote(-1);

        // Immediate HUD update for instantaneous timing feedback
        scoreboard.updateState(scorer, MusicTheory::detectChord(activeMidiNotes, preferFlats), transport.bpm, transport.isPlaying, activeMidiNotes, preferFlats, grandStaff.getActiveReviewMistakeIndex());
    }
    else if (ev.type == MidiEventType::NoteOff)
    {
        auto it = std::find(activeMidiNotes.begin(), activeMidiNotes.end(), midi);
        if (it != activeMidiNotes.end())
        {
            activeMidiNotes.erase(it);
        }

        grandStaff.noteOff(midi);
        virtualPiano.noteOff(midi);

        auto& scorer = audioProcessor.getScorer();
        const auto transport = audioProcessor.getTransportState();
        scoreboard.updateState(scorer, MusicTheory::detectChord(activeMidiNotes, preferFlats), transport.bpm, transport.isPlaying, activeMidiNotes, preferFlats, grandStaff.getActiveReviewMistakeIndex());
    }
}

void MidiSheetAudioProcessorEditor::updateChordDetection()
{
}

} // namespace MidiSheet
