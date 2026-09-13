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

    // Mode Selector
    modeSelector.addItem("Wait for Note", 1);
    modeSelector.addItem("In-Tempo (Metronome)", 2);
    modeSelector.addItem("Strict Time (No-Pause)", 3);
    modeSelector.addItem("First-Read (30s Lockout)", 4);
    modeSelector.setSelectedId(1, juce::dontSendNotification);
    modeSelector.setColour(juce::ComboBox::backgroundColourId, juce::Colour::fromRGB(30, 41, 59));
    modeSelector.setColour(juce::ComboBox::textColourId, juce::Colour::fromRGB(226, 232, 240));
    modeSelector.onChange = [this]() {
        PracticeMode mode = PracticeMode::Wait;
        switch (modeSelector.getSelectedId())
        {
            case 1: mode = PracticeMode::Wait; break;
            case 2: mode = PracticeMode::Tempo; break;
            case 3: mode = PracticeMode::StrictTime; break;
            case 4: mode = PracticeMode::FirstRead; break;
            default: break;
        }
        if (onModeChanged) onModeChanged(mode);
    };
    addAndMakeVisible(modeSelector);

    // Visual Disrupter Mode Selector
    disrupterSelector.addItem("Disrupter: Off", 1);
    disrupterSelector.addItem("Vanishing Bar", 2);
    disrupterSelector.addItem("Advance Curtain", 3);
    disrupterSelector.setSelectedId(1, juce::dontSendNotification);
    disrupterSelector.setColour(juce::ComboBox::backgroundColourId, juce::Colour::fromRGB(30, 41, 59));
    disrupterSelector.setColour(juce::ComboBox::textColourId, juce::Colour::fromRGB(226, 232, 240));
    disrupterSelector.onChange = [this]() {
        VisualDisrupterMode mode = VisualDisrupterMode::None;
        switch (disrupterSelector.getSelectedId())
        {
            case 1: mode = VisualDisrupterMode::None; break;
            case 2: mode = VisualDisrupterMode::VanishingBar; break;
            case 3: mode = VisualDisrupterMode::AdvanceCurtain; break;
            default: break;
        }
        if (onDisrupterModeChanged) onDisrupterModeChanged(mode);
    };
    addAndMakeVisible(disrupterSelector);

    // Eye Cursor (+1 Bar) Pacer Button
    eyeCursorButton.setButtonText(juce::String::fromUTF8("👁 Eye Pacer"));
    eyeCursorButton.setColour(juce::TextButton::buttonColourId, juce::Colour::fromRGB(30, 41, 59));
    eyeCursorButton.setColour(juce::TextButton::textColourOffId, juce::Colour::fromRGB(148, 163, 184));
    eyeCursorButton.onClick = [this]() {
        eyeCursorActive = !eyeCursorActive;
        setEyeCursorEnabled(eyeCursorActive);
        if (onEyeCursorToggled) onEyeCursorToggled(eyeCursorActive);
    };
    addAndMakeVisible(eyeCursorButton);

    // Metronome Click Toggle Button
    metronomeButton.setButtonText(juce::String::fromUTF8("🔔 Click"));
    setMetronomeEnabled(true);
    metronomeButton.onClick = [this]() {
        metronomeActive = !metronomeActive;
        setMetronomeEnabled(metronomeActive);
        if (onMetronomeToggled) onMetronomeToggled(metronomeActive);
    };
    addAndMakeVisible(metronomeButton);

    // Routine Mode Button
    routineButton.setButtonText(juce::CharPointer_UTF8("\xe2\x8f\xb1\xef\xb8\x8f Routine (20m)"));
    routineButton.setColour(juce::TextButton::buttonColourId, juce::Colour::fromRGB(16, 185, 129).withAlpha(0.35f));
    routineButton.setColour(juce::TextButton::textColourOffId, juce::Colour::fromRGB(52, 211, 153));
    routineButton.onClick = [this]() {
        if (onRoutineClicked) onRoutineClicked();
    };
    addAndMakeVisible(routineButton);
}

void ScoreboardComponent::resized()
{
    const auto bounds = getLocalBounds();
    const int rightEdge = bounds.getRight() - 12;
    const int topEdge = bounds.getY() + 10;

    selectMelodyButton.setBounds(rightEdge - 95, topEdge, 95, 28);
    restartButton.setBounds(rightEdge - 175, topEdge, 75, 28);
    metronomeButton.setBounds(rightEdge - 255, topEdge, 75, 28);
    modeSelector.setBounds(rightEdge - 410, topEdge, 150, 28);
    disrupterSelector.setBounds(rightEdge - 550, topEdge, 135, 28);
    eyeCursorButton.setBounds(rightEdge - 660, topEdge, 105, 28);
    routineButton.setBounds(rightEdge - 785, topEdge, 120, 28);
}

void ScoreboardComponent::setMetronomeEnabled(bool enabled)
{
    metronomeActive = enabled;
    if (metronomeActive)
    {
        metronomeButton.setColour(juce::TextButton::buttonColourId, juce::Colour::fromRGB(16, 185, 129).withAlpha(0.35f));
        metronomeButton.setColour(juce::TextButton::textColourOffId, juce::Colour::fromRGB(52, 211, 153));
        metronomeButton.setButtonText(juce::String::fromUTF8("🔔 Click"));
    }
    else
    {
        metronomeButton.setColour(juce::TextButton::buttonColourId, juce::Colour::fromRGB(30, 41, 59));
        metronomeButton.setColour(juce::TextButton::textColourOffId, juce::Colour::fromRGB(148, 163, 184));
        metronomeButton.setButtonText(juce::String::fromUTF8("🔕 Click"));
    }
    repaint();
}

void ScoreboardComponent::setEyeCursorEnabled(bool enabled)
{
    eyeCursorActive = enabled;
    if (eyeCursorActive)
    {
        eyeCursorButton.setColour(juce::TextButton::buttonColourId, juce::Colour::fromRGB(14, 165, 233).withAlpha(0.35f));
        eyeCursorButton.setColour(juce::TextButton::textColourOffId, juce::Colour::fromRGB(56, 189, 248));
    }
    else
    {
        eyeCursorButton.setColour(juce::TextButton::buttonColourId, juce::Colour::fromRGB(30, 41, 59));
        eyeCursorButton.setColour(juce::TextButton::textColourOffId, juce::Colour::fromRGB(148, 163, 184));
    }
    repaint();
}

void ScoreboardComponent::setDisrupterMode(VisualDisrupterMode mode)
{
    int id = 1;
    switch (mode)
    {
        case VisualDisrupterMode::None: id = 1; break;
        case VisualDisrupterMode::VanishingBar: id = 2; break;
        case VisualDisrupterMode::AdvanceCurtain: id = 3; break;
    }
    disrupterSelector.setSelectedId(id, juce::dontSendNotification);
}

void ScoreboardComponent::updateState(const MelodyScorer& scorer, const DetectedChord& chord, double bpm, bool hostPlaying, const std::vector<int>& activeNotes, bool preferFlats, int reviewMistakeIndex)
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
    sightReadingScore = scorecard.sightReadingScore;
    recoveries = scorecard.recoveries;
    practiceMode = scorer.getPracticeMode();

    int expectedId = 1;
    switch (practiceMode)
    {
        case PracticeMode::Wait: expectedId = 1; break;
        case PracticeMode::Tempo: expectedId = 2; break;
        case PracticeMode::StrictTime: expectedId = 3; break;
        case PracticeMode::FirstRead: expectedId = 4; break;
    }
    if (modeSelector.getSelectedId() != expectedId)
        modeSelector.setSelectedId(expectedId, juce::dontSendNotification);

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
            currentRating = TimingRating::Missed;
            const auto& evals = scorer.getNoteEvaluations();
            const auto& notes = melody.notes;

            int targetMistakeIdx = reviewMistakeIndex;
            if (targetMistakeIdx < 0 || targetMistakeIdx >= static_cast<int>(notes.size()) ||
                (targetMistakeIdx < static_cast<int>(evals.size()) && evals[static_cast<size_t>(targetMistakeIdx)].mistakeAttempts == 0))
            {
                targetMistakeIdx = scorer.getFirstMistakeIndex();
            }

            if (targetMistakeIdx >= 0 && targetMistakeIdx < static_cast<int>(notes.size()))
            {
                const auto& noteObj = notes[static_cast<size_t>(targetMistakeIdx)];
                targetNoteStr = noteObj.name;

                juce::String wrongStr = "?";
                if (targetMistakeIdx < static_cast<int>(evals.size()) && evals[static_cast<size_t>(targetMistakeIdx)].lastWrongMidi >= 0)
                {
                    wrongStr = MusicTheory::getNoteInfo(evals[static_cast<size_t>(targetMistakeIdx)].lastWrongMidi, preferFlats).fullName;
                }

                playedNoteStr = wrongStr;
                hasPlayedNote = true;
                playedMatchesTarget = false;

                if (scorecard.mistakeCount == 1)
                {
                    timingFeedbackStr = "Mistake Note #" + juce::String(targetMistakeIdx + 1) + ": Played " + wrongStr + " (Expected " + noteObj.name + ")";
                }
                else
                {
                    timingFeedbackStr = "Reviewing Note #" + juce::String(targetMistakeIdx + 1) + ": Played " + wrongStr + " vs " + noteObj.name + " (" + juce::String(scorecard.mistakeCount) + " mistakes)";
                }

                if (targetMistakeIdx < static_cast<int>(evals.size()) && evals[static_cast<size_t>(targetMistakeIdx)].completed)
                {
                    const int ro = static_cast<int>(std::round(evals[static_cast<size_t>(targetMistakeIdx)].offsetMs));
                    timingFeedbackStr += " [" + (ro >= 0 ? juce::String("+") : juce::String()) + juce::String(ro) + "ms]";
                }
            }
            else
            {
                timingFeedbackStr = juce::String(scorecard.mistakeCount) + " mistake(s) to review";
            }
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

    g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
    const float textW = g.getCurrentFont().getStringWidth(timingFeedbackStr);
    const float pillWidth = std::clamp(textW + 36.0f, 190.0f, 350.0f);
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
    const float streakX = leftX + pillWidth + 10.0f;
    g.setColour(juce::Colour::fromRGB(245, 158, 11));
    g.setFont(juce::FontOptions(12.0f, juce::Font::bold));
    g.drawText("Streak: " + juce::String(currentStreak), streakX, y, 78.0f, 22.0f, juce::Justification::centredLeft);

    // Accuracy Stats
    const float pitchX = streakX + 82.0f;
    g.setColour(juce::Colour::fromRGB(148, 163, 184));
    g.setFont(juce::FontOptions(11.0f, juce::Font::plain));
    g.drawText("Pitch: " + juce::String(accuracyPercent) + "%", pitchX, y, 70.0f, 22.0f, juce::Justification::centredLeft);
    const float rhythmX = pitchX + 72.0f;
    g.drawText("Rhythm: " + juce::String(rhythmPercent) + "%", rhythmX, y, 78.0f, 22.0f, juce::Justification::centredLeft);

    const float srX = rhythmX + 80.0f;
    g.setColour(juce::Colour::fromRGB(56, 189, 248)); // Sky 400
    g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
    g.drawText("Sight-Read: " + juce::String(sightReadingScore) + "%", srX, y, 105.0f, 22.0f, juce::Justification::centredLeft);

    if (recoveries > 0)
    {
        const float recX = srX + 108.0f;
        g.setColour(juce::Colour::fromRGB(16, 185, 129));
        g.drawText(juce::String::fromUTF8("\xE2\x9A\xA1 ") + juce::String(recoveries), recX, y, 45.0f, 22.0f, juce::Justification::centredLeft);
    }

    // Detected Chord Display
    const float chordX = bounds.getRight() - 250.0f;
    g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
    g.setColour(juce::Colour::fromRGB(56, 189, 248)); // Sky 400
    g.drawText("Chord: " + chordNameStr, chordX, y, 235.0f, 22.0f, juce::Justification::centredRight);
}

} // namespace MidiSheet
