#include "ScoreboardComponent.h"

namespace MidiSheet
{

ScoreboardComponent::ScoreboardComponent()
{
    // Melody Selector Button
    selectMelodyButton.setButtonText("Melodies");
    selectMelodyButton.setColour(juce::TextButton::buttonColourId, juce::Colour::fromRGB(14, 165, 233)); // Sky 500
    selectMelodyButton.setColour(juce::TextButton::textColourOffId, juce::Colours::white);
    selectMelodyButton.onClick = [this]() {
        if (onSelectMelodyClicked) onSelectMelodyClicked();
    };
    addAndMakeVisible(selectMelodyButton);

    // Restart Button
    restartButton.setButtonText("Restart");
    restartButton.setColour(juce::TextButton::buttonColourId, juce::Colour::fromRGB(30, 41, 59));
    restartButton.setColour(juce::TextButton::textColourOffId, juce::Colour::fromRGB(226, 232, 240));
    restartButton.onClick = [this]() {
        if (onRestartClicked) onRestartClicked();
    };
    addAndMakeVisible(restartButton);

    // Mode Selector (Wait vs Tempo)
    modeSelector.addItem("Wait for Note", 1);
    modeSelector.addItem("Tempo / On Beat", 2);
    modeSelector.setSelectedId(1, juce::dontSendNotification);
    modeSelector.setColour(juce::ComboBox::backgroundColourId, juce::Colour::fromRGB(30, 41, 59));
    modeSelector.setColour(juce::ComboBox::textColourId, juce::Colour::fromRGB(226, 232, 240));
    modeSelector.onChange = [this]() {
        const auto mode = (modeSelector.getSelectedId() == 2) ? PracticeMode::Tempo : PracticeMode::Wait;
        if (onModeChanged) onModeChanged(mode);
    };
    addAndMakeVisible(modeSelector);
}

void ScoreboardComponent::resized()
{
    const auto bounds = getLocalBounds();
    const int rightEdge = bounds.getRight() - 12;
    const int topEdge = bounds.getY() + 10;

    selectMelodyButton.setBounds(rightEdge - 110, topEdge, 110, 28);
    restartButton.setBounds(rightEdge - 205, topEdge, 88, 28);
    modeSelector.setBounds(rightEdge - 345, topEdge, 132, 28);
}

void ScoreboardComponent::updateState(const MelodyScorer& scorer, const DetectedChord& chord, double bpm, bool hostPlaying, const std::vector<int>& activeNotes, bool preferFlats)
{
    const auto& melody = scorer.getCurrentMelody();
    melodyTitle = melody.title;
    composer = melody.composer;
    difficulty = melody.difficulty;
    currentBpm = bpm;
    isHostPlaying = hostPlaying;

    const auto* target = scorer.getCurrentTargetNote();
    targetNoteStr = (target != nullptr) ? target->name : (scorer.isFinished() ? "Done" : "");

    // Live played note tracking
    if (activeNotes.empty())
    {
        hasPlayedNote = false;
        playedMatchesTarget = false;
        playedNoteStr = "--";
    }
    else
    {
        hasPlayedNote = true;
        juce::StringArray names;
        bool matches = false;
        const int currIdx = scorer.getCurrentNoteIndex();

        for (int midi : activeNotes)
        {
            const auto noteInfo = MusicTheory::getNoteInfo(midi, preferFlats);
            names.add(noteInfo.fullName);

            if (target != nullptr && midi == target->midi)
            {
                matches = true;
            }
            else if (currIdx > 0 && currIdx - 1 < static_cast<int>(melody.notes.size())
                     && midi == melody.notes[static_cast<size_t>(currIdx - 1)].midi)
            {
                matches = true;
            }
        }

        playedNoteStr = names.joinIntoString(", ");
        playedMatchesTarget = matches;
    }

    chordNameStr = chord.name;
    chordQualityStr = chord.quality;

    const auto& scorecard = scorer.getScorecard();
    accuracyPercent = scorecard.pitchAccuracy;
    rhythmPercent = scorecard.rhythmAccuracy;
    currentStreak = scorer.getCurrentStreak();
    noteIndex = scorer.getCurrentNoteIndex();
    totalNotes = static_cast<int>(melody.notes.size());

    if (scorer.isFinished())
    {
        if (scorecard.mistakeCount == 0)
        {
            timingFeedbackStr = "Flawless Performance!";
            currentRating = TimingRating::Perfect;
        }
        else
        {
            timingFeedbackStr = juce::String(scorecard.mistakeCount) + " mistake(s) to review";
            currentRating = TimingRating::Missed;
        }
    }
    else
    {
        const auto& feedback = scorer.getLastTimingFeedback();
        timingFeedbackStr = feedback.text;
        currentRating = feedback.rating;
    }

    repaint();
}

void ScoreboardComponent::paint(juce::Graphics& g)
{
    const auto bounds = getLocalBounds().toFloat();

    // Dark sleek container background
    g.setColour(juce::Colour::fromRGB(15, 23, 42)); // Slate 900
    g.fillRoundedRectangle(bounds, 12.0f);

    g.setColour(juce::Colour::fromRGB(30, 41, 59)); // Border
    g.drawRoundedRectangle(bounds.reduced(0.5f), 12.0f, 1.2f);

    // Left Column: Melody Info & Target Note
    const float leftX = bounds.getX() + 14.0f;
    float y = bounds.getY() + 12.0f;

    // Difficulty badge
    juce::Colour diffColor = (difficulty == "Easy") ? juce::Colour::fromRGB(16, 185, 129) // Emerald 500
                          : (difficulty == "Medium") ? juce::Colour::fromRGB(245, 158, 11) // Amber 500
                          : juce::Colour::fromRGB(244, 63, 94); // Rose 500

    g.setColour(diffColor.withAlpha(0.2f));
    g.fillRoundedRectangle(leftX, y, 54.0f, 18.0f, 4.0f);
    g.setColour(diffColor);
    g.drawRoundedRectangle(leftX, y, 54.0f, 18.0f, 4.0f, 1.0f);
    g.setFont(juce::FontOptions(10.0f, juce::Font::bold));
    g.drawText(difficulty.toUpperCase(), leftX, y, 54.0f, 18.0f, juce::Justification::centred);

    // Melody Title
    g.setColour(juce::Colours::white);
    g.setFont(juce::FontOptions(17.0f, juce::Font::bold));
    g.drawText(melodyTitle, leftX + 62.0f, y - 2.0f, 240.0f, 22.0f, juce::Justification::centredLeft);

    // Target Note Pill
    const float targetPillX = leftX + 310.0f;
    const float targetPillW = 95.0f;
    g.setColour(juce::Colour::fromRGB(245, 158, 11).withAlpha(0.2f));
    g.fillRoundedRectangle(targetPillX, y - 2.0f, targetPillW, 22.0f, 6.0f);
    g.setColour(juce::Colour::fromRGB(251, 191, 36));
    g.drawRoundedRectangle(targetPillX, y - 2.0f, targetPillW, 22.0f, 6.0f, 1.2f);
    g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
    g.drawText("Target: " + targetNoteStr, targetPillX, y - 2.0f, targetPillW, 22.0f, juce::Justification::centred);

    // Live Played Note Pill
    const float playedPillX = targetPillX + targetPillW + 8.0f;
    const float playedPillW = 105.0f;
    juce::Colour playedBg = juce::Colour::fromRGB(30, 41, 59);
    juce::Colour playedBorder = juce::Colour::fromRGB(71, 85, 105);
    juce::Colour playedTextColor = juce::Colour::fromRGB(148, 163, 184);

    if (hasPlayedNote)
    {
        if (!targetNoteStr.isEmpty() || noteIndex > 0)
        {
            if (playedMatchesTarget)
            {
                playedBg = juce::Colour::fromRGB(16, 185, 129).withAlpha(0.2f); // Emerald 500
                playedBorder = juce::Colour::fromRGB(52, 211, 153);
                playedTextColor = juce::Colour::fromRGB(52, 211, 153);
            }
            else
            {
                playedBg = juce::Colour::fromRGB(244, 63, 94).withAlpha(0.2f); // Rose 500
                playedBorder = juce::Colour::fromRGB(251, 113, 133);
                playedTextColor = juce::Colour::fromRGB(251, 113, 133);
            }
        }
        else
        {
            playedBg = juce::Colour::fromRGB(14, 165, 233).withAlpha(0.2f); // Sky 500
            playedBorder = juce::Colour::fromRGB(56, 189, 248);
            playedTextColor = juce::Colour::fromRGB(56, 189, 248);
        }
    }

    g.setColour(playedBg);
    g.fillRoundedRectangle(playedPillX, y - 2.0f, playedPillW, 22.0f, 6.0f);
    g.setColour(playedBorder);
    g.drawRoundedRectangle(playedPillX, y - 2.0f, playedPillW, 22.0f, 6.0f, 1.2f);
    g.setColour(playedTextColor);
    g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
    g.drawText("Played: " + playedNoteStr, playedPillX, y - 2.0f, playedPillW, 22.0f, juce::Justification::centred);

    // Second Row: Timing Feedback & Chord & Stats
    y += 28.0f;

    // Timing Feedback pill
    juce::Colour feedbackBg = juce::Colour::fromRGB(30, 41, 59);
    juce::Colour feedbackText = juce::Colour::fromRGB(148, 163, 184);

    if (currentRating == TimingRating::Perfect)
    {
        feedbackBg = juce::Colour::fromRGB(16, 185, 129).withAlpha(0.2f);
        feedbackText = juce::Colour::fromRGB(52, 211, 153);
    }
    else if (currentRating == TimingRating::Early || currentRating == TimingRating::Late)
    {
        feedbackBg = juce::Colour::fromRGB(245, 158, 11).withAlpha(0.2f);
        feedbackText = juce::Colour::fromRGB(251, 191, 36);
    }
    else if (currentRating == TimingRating::Missed)
    {
        feedbackBg = juce::Colour::fromRGB(244, 63, 94).withAlpha(0.2f);
        feedbackText = juce::Colour::fromRGB(251, 113, 133);
    }

    const float pillWidth = 190.0f;
    const float pillHeight = 22.0f;
    g.setColour(feedbackBg);
    g.fillRoundedRectangle(leftX, y, pillWidth, pillHeight, 6.0f);
    g.setColour(feedbackText.withAlpha(0.35f));
    g.drawRoundedRectangle(leftX, y, pillWidth, pillHeight, 6.0f, 1.0f);

    // Dynamic colored status indicator dot
    g.setColour(feedbackText);
    g.fillEllipse(leftX + 8.0f, y + (pillHeight - 8.0f) * 0.5f, 8.0f, 8.0f);

    // Clean feedback text beside status dot
    g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
    g.drawText(timingFeedbackStr, leftX + 22.0f, y, pillWidth - 26.0f, pillHeight, juce::Justification::centredLeft);

    // Streak badge
    g.setColour(juce::Colour::fromRGB(245, 158, 11));
    g.setFont(juce::FontOptions(12.0f, juce::Font::bold));
    g.drawText("Streak: " + juce::String(currentStreak), leftX + 200.0f, y, 90.0f, 22.0f, juce::Justification::centredLeft);

    // Accuracy Stats
    g.setColour(juce::Colour::fromRGB(148, 163, 184));
    g.setFont(juce::FontOptions(11.0f, juce::Font::plain));
    g.drawText("Pitch: " + juce::String(accuracyPercent) + "%", leftX + 295.0f, y, 80.0f, 22.0f, juce::Justification::centredLeft);
    g.drawText("Rhythm: " + juce::String(rhythmPercent) + "%", leftX + 380.0f, y, 90.0f, 22.0f, juce::Justification::centredLeft);

    // Detected Chord Display
    const float chordX = bounds.getRight() - 250.0f;
    g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
    g.setColour(juce::Colour::fromRGB(56, 189, 248)); // Sky 400
    g.drawText("Chord: " + chordNameStr, chordX, y, 235.0f, 22.0f, juce::Justification::centredRight);
}

} // namespace MidiSheet
