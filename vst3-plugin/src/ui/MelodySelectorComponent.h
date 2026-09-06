#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../core/MelodyDatabase.h"

namespace MidiSheet
{

class MelodySelectorComponent : public juce::Component
{
public:
    MelodySelectorComponent();

    void paint(juce::Graphics& g) override;
    void resized() override;

    std::function<void(const juce::String&)> onMelodySelected;
    std::function<void()> onCloseClicked;

private:
    class MelodyListBoxModel : public juce::ListBoxModel
    {
    public:
        MelodyListBoxModel(MelodySelectorComponent& parent);
        int getNumRows() override;
        void paintListBoxItem(int rowNumber, juce::Graphics& g, int width, int height, bool rowIsSelected) override;
        void listBoxItemClicked(int rowNumber, const juce::MouseEvent& event) override;

    private:
        MelodySelectorComponent& owner;
    };

    MelodyListBoxModel listBoxModel;
    juce::ListBox listBox;
    juce::TextButton closeButton;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MelodySelectorComponent)
};

} // namespace MidiSheet
