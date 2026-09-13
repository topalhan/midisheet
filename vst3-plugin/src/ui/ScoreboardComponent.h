#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../core/MelodyScorer.h"
#include "../core/MusicTheory.h"

#include "GrandStaffComponent.h"

namespace MidiSheet
{

class ScoreboardComponent : public juce::Component
{
public:
    ScoreboardComponent();

    void paint(juce::Graphics& g) override;
    void resized() override;

    void updateState(const MelodyScorer& scorer, const DetectedChord& chord, double bpm, bool hostPlaying, const std::vector<int>& activeNotes = {}, bool preferFlats = false, int reviewMistakeIndex = -1);

    void setDisrupterMode(VisualDisrupterMode mode);
    void setEyeCursorEnabled(bool enabled);
    void setMetronomeEnabled(bool enabled);

    std::function<void()> onSelectMelodyClicked;
    std::function<void()> onRestartClicked;
    std::function<void(PracticeMode)> onModeChanged;
    std::function<void(VisualDisrupterMode)> onDisrupterModeChanged;
    std::function<void(bool)> onEyeCursorToggled;
    std::function<void(bool)> onMetronomeToggled;
    std::function<void()> onRoutineClicked;

private:
    juce::TextButton selectMelodyButton;
    juce::TextButton restartButton;
    juce::TextButton routineButton;
    juce::TextButton metronomeButton;
    bool metronomeActive = true;
    juce::ComboBox modeSelector;
    juce::ComboBox disrupterSelector;
    juce::TextButton eyeCursorButton;
    bool eyeCursorActive = false;

    juce::String melodyTitle = "Ode to Joy";
    juce::String composer = "L. van Beethoven";
    juce::String difficulty = "Easy";
    juce::String targetNoteStr = "E4";
    juce::String playedNoteStr = "--";
    bool playedMatchesTarget = false;
    bool hasPlayedNote = false;
    juce::String timingFeedbackStr = "Ready";
    juce::String chordNameStr = "Play a chord or note";
    juce::String chordQualityStr = "Ready";

    TimingRating currentRating = TimingRating::None;
    int accuracyPercent = 100;
    int rhythmPercent = 100;
    int sightReadingScore = 100;
    int recoveries = 0;
    PracticeMode practiceMode = PracticeMode::Wait;
    int currentStreak = 0;
    int noteIndex = 0;
    int totalNotes = 15;
    double currentBpm = 120.0;
    bool isHostPlaying = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ScoreboardComponent)
};

} // namespace MidiSheet
