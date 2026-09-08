#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../core/MelodyScorer.h"
#include "../core/MusicTheory.h"

namespace MidiSheet
{

class ScoreboardComponent : public juce::Component
{
public:
    ScoreboardComponent();

    void paint(juce::Graphics& g) override;
    void resized() override;

    void updateState(const MelodyScorer& scorer, const DetectedChord& chord, double bpm, bool hostPlaying, const std::vector<int>& activeNotes = {}, bool preferFlats = false, int reviewMistakeIndex = -1);

    std::function<void()> onSelectMelodyClicked;
    std::function<void()> onRestartClicked;
    std::function<void(PracticeMode)> onModeChanged;

private:
    juce::TextButton selectMelodyButton;
    juce::TextButton restartButton;
    juce::ComboBox modeSelector;

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
    int currentStreak = 0;
    int noteIndex = 0;
    int totalNotes = 15;
    double currentBpm = 120.0;
    bool isHostPlaying = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ScoreboardComponent)
};

} // namespace MidiSheet
