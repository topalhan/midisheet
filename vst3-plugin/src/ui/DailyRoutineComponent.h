#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../core/DailyRoutineManager.h"

namespace MidiSheet
{

class DailyRoutineComponent : public juce::Component
{
public:
    explicit DailyRoutineComponent(DailyRoutineManager& manager);
    ~DailyRoutineComponent() override = default;

    void paint(juce::Graphics& g) override;
    void resized() override;

    void updateUI();

    std::function<void()> onExitRoutineMode;

private:
    DailyRoutineManager& routineManager;

    juce::ComboBox keySelector;
    juce::TextButton playButton;
    juce::TextButton prevButton;
    juce::TextButton skipButton;
    juce::TextButton resetButton;
    juce::TextButton tapButton;
    juce::TextButton exitButton;

    juce::String phaseTitleStr;
    juce::String phaseInstructionsStr;
    juce::String tapFeedbackStr;
    juce::Colour tapFeedbackColour;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(DailyRoutineComponent)
};

} // namespace MidiSheet
