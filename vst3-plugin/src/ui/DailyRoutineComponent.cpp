#include "DailyRoutineComponent.h"

namespace MidiSheet
{

DailyRoutineComponent::DailyRoutineComponent(DailyRoutineManager& manager)
    : routineManager(manager)
{
    // Key selector
    keySelector.addItem("C Major", 1);
    keySelector.addItem("G Major", 2);
    keySelector.addItem("F Major", 3);
    keySelector.addItem("D Major", 4);
    keySelector.addItem("Bb Major", 5);
    keySelector.addItem("A Minor", 6);
    keySelector.addItem("D Minor", 7);
    keySelector.setSelectedId(1, juce::dontSendNotification);
    keySelector.onChange = [this]() {
        routineManager.setTargetKey(keySelector.getText());
    };
    addAndMakeVisible(keySelector);

    // Controls
    prevButton.setButtonText(juce::CharPointer_UTF8("\xe2\x8f\xae")); // ⏮
    prevButton.onClick = [this]() { routineManager.prevSubPhase(); };
    addAndMakeVisible(prevButton);

    playButton.setButtonText("Start");
    playButton.onClick = [this]() { routineManager.togglePlay(); };
    addAndMakeVisible(playButton);

    skipButton.setButtonText(juce::CharPointer_UTF8("\xe2\x8f\xad")); // ⏭
    skipButton.onClick = [this]() { routineManager.skipSubPhase(); };
    addAndMakeVisible(skipButton);

    resetButton.setButtonText(juce::CharPointer_UTF8("\xf0\x9f\x94\x84")); // 🔄
    resetButton.onClick = [this]() { routineManager.reset(); };
    addAndMakeVisible(resetButton);

    // Tap rhythm button for Block 2A
    tapButton.setButtonText("Tap (Space)");
    tapButton.onClick = [this]() {
        const double now = juce::Time::getMillisecondCounterHiRes() * 0.001;
        const auto fb = routineManager.registerRhythmTap(now);
        tapFeedbackStr = fb.text;
        if (fb.rating == TimingRating::Perfect)
            tapFeedbackColour = juce::Colour::fromRGB(16, 185, 129);
        else if (fb.rating == TimingRating::Early || fb.rating == TimingRating::Late)
            tapFeedbackColour = juce::Colour::fromRGB(245, 158, 11);
        else
            tapFeedbackColour = juce::Colour::fromRGB(239, 68, 68);
        repaint();
    };
    addAndMakeVisible(tapButton);

    exitButton.setButtonText("Exit");
    exitButton.onClick = [this]() {
        routineManager.pause();
        if (onExitRoutineMode) onExitRoutineMode();
    };
    addAndMakeVisible(exitButton);

    routineManager.onTick = [this](const RoutineProgress&) {
        repaint();
    };
    routineManager.onPhaseChanged = [this](const RoutineSubPhase& phase) {
        phaseTitleStr = phase.title;
        phaseInstructionsStr = phase.methodology;
        repaint();
    };
    routineManager.onTapFeedback = [this](const TimingFeedback& fb) {
        tapFeedbackStr = fb.text;
        if (fb.rating == TimingRating::Perfect)
            tapFeedbackColour = juce::Colour::fromRGB(16, 185, 129);
        else if (fb.rating == TimingRating::Early || fb.rating == TimingRating::Late)
            tapFeedbackColour = juce::Colour::fromRGB(245, 158, 11);
        else
            tapFeedbackColour = juce::Colour::fromRGB(239, 68, 68);
        repaint();
    };
}

void DailyRoutineComponent::updateUI()
{
    const auto p = routineManager.getProgress();
    playButton.setButtonText(p.isRunning ? "Pause" : "Start");
    const auto* phase = p.currentPhase;
    tapButton.setVisible(phase != nullptr && phase->type == "rhythm_tap");
    repaint();
}

void DailyRoutineComponent::paint(juce::Graphics& g)
{
    const auto bounds = getLocalBounds().toFloat();
    const auto p = routineManager.getProgress();

    // Background card
    g.setColour(juce::Colour::fromRGB(15, 23, 42).withAlpha(0.95f));
    g.fillRoundedRectangle(bounds, 10.0f);
    g.setColour(juce::Colour::fromRGB(16, 185, 129).withAlpha(0.4f));
    g.drawRoundedRectangle(bounds, 10.0f, 1.5f);

    // Title & Streak
    g.setFont(juce::FontOptions(13.0f, juce::Font::bold));
    g.setColour(juce::Colours::white);
    g.drawText("20-MIN DAILY ROUTINE", 14, 10, 160, 20, juce::Justification::centredLeft);

    // Streak badge
    g.setColour(juce::Colour::fromRGB(245, 158, 11));
    g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
    g.drawText(juce::String(p.streak) + " Day Streak", 175, 10, 80, 20, juce::Justification::centredLeft);

    // Master Timer and Phase Timer
    const int totalMin = static_cast<int>(p.totalElapsedSeconds) / 60;
    const int totalSec = static_cast<int>(p.totalElapsedSeconds) % 60;
    const int phaseMin = static_cast<int>(p.phaseRemainingSeconds) / 60;
    const int phaseSec = static_cast<int>(p.phaseRemainingSeconds) % 60;

    const auto masterTimerStr = juce::String::formatted("%02d:%02d / 20:00", totalMin, totalSec);
    const auto phaseTimerStr = juce::String::formatted("%02d:%02d left", phaseMin, phaseSec);

    g.setFont(juce::FontOptions(13.0f, juce::Font::bold));
    g.setColour(juce::Colour::fromRGB(52, 211, 153));
    g.drawText(masterTimerStr, getWidth() - 360, 10, 110, 20, juce::Justification::centredRight);

    g.setColour(juce::Colour::fromRGB(251, 191, 36));
    g.drawText(phaseTimerStr, getWidth() - 245, 10, 80, 20, juce::Justification::centredLeft);

    // 4-Block Segmented Bar
    const float barY = 38.0f;
    const float barH = 14.0f;
    const float barW = getWidth() - 28.0f;
    const float blockW = barW / 4.0f;

    const juce::String blockNames[4] = { "1. Mechanical (5m)", "2. Analysis (5m)", "3. Cold Read (7m)", "4. Flash (3m)" };
    const int currentBlock = (p.currentPhase != nullptr) ? p.currentPhase->blockIndex : 1;

    for (int b = 0; b < 4; ++b)
    {
        const juce::Rectangle<float> bRect(14.0f + (b * blockW), barY, blockW - 4.0f, barH);
        if (b + 1 == currentBlock)
        {
            g.setColour(juce::Colour::fromRGB(16, 185, 129).withAlpha(0.25f));
            g.fillRoundedRectangle(bRect, 4.0f);
            g.setColour(juce::Colour::fromRGB(52, 211, 153));
            g.drawRoundedRectangle(bRect, 4.0f, 1.2f);
        }
        else if (b + 1 < currentBlock)
        {
            g.setColour(juce::Colour::fromRGB(14, 165, 233).withAlpha(0.2f));
            g.fillRoundedRectangle(bRect, 4.0f);
            g.setColour(juce::Colour::fromRGB(56, 189, 248));
        }
        else
        {
            g.setColour(juce::Colour::fromRGB(30, 41, 59));
            g.fillRoundedRectangle(bRect, 4.0f);
            g.setColour(juce::Colour::fromRGB(100, 116, 139));
        }
        g.setFont(juce::FontOptions(9.0f, juce::Font::bold));
        g.drawText(blockNames[b], bRect, juce::Justification::centred, true);
    }

    // Guidance Banner
    const float cardY = 56.0f;
    const float cardH = getHeight() - cardY - 8.0f;
    g.setColour(juce::Colour::fromRGB(2, 6, 23).withAlpha(0.7f));
    g.fillRoundedRectangle(14.0f, cardY, barW, cardH, 6.0f);

    // Title & Instructions
    g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
    g.setColour(juce::Colour::fromRGB(52, 211, 153));
    g.drawText(phaseTitleStr, 22, static_cast<int>(cardY + 3.0f), getWidth() - 180, 16, juce::Justification::centredLeft);

    g.setFont(juce::FontOptions(10.0f, juce::Font::plain));
    g.setColour(juce::Colour::fromRGB(203, 213, 225));
    g.drawText(phaseInstructionsStr, 22, static_cast<int>(cardY + 20.0f), getWidth() - 180, 26, juce::Justification::topLeft, true);

    // Rhythm Tap Feedback text or Flash scan banner
    if (p.currentPhase != nullptr && p.currentPhase->type == "rhythm_tap" && tapFeedbackStr.isNotEmpty())
    {
        g.setFont(juce::FontOptions(10.0f, juce::Font::bold));
        g.setColour(tapFeedbackColour);
        g.drawText(tapFeedbackStr, getWidth() - 170, static_cast<int>(cardY + 28.0f), 150, 18, juce::Justification::centredRight);
    }
    else if (p.flashPreviewActive)
    {
        g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
        g.setColour(juce::Colour::fromRGB(245, 158, 11));
        g.drawText("Flash Scan: " + juce::String(p.flashCountdownSeconds) + "s", getWidth() - 160, static_cast<int>(cardY + 12.0f), 140, 20, juce::Justification::centredRight);
    }
}

void DailyRoutineComponent::resized()
{
    const int rightMargin = getWidth() - 14;

    // Controls top right
    exitButton.setBounds(rightMargin - 44, 8, 44, 22);
    resetButton.setBounds(rightMargin - 74, 8, 26, 22);
    skipButton.setBounds(rightMargin - 104, 8, 26, 22);
    playButton.setBounds(rightMargin - 156, 8, 48, 22);
    prevButton.setBounds(rightMargin - 186, 8, 26, 22);

    // Key selector
    keySelector.setBounds(255, 8, 85, 22);

    // Tap button inside card
    tapButton.setBounds(getWidth() - 120, 60, 95, 22);
}

} // namespace MidiSheet
