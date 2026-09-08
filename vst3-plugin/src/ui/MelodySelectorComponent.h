#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <memory>
#include "../core/MelodyDatabase.h"

namespace MidiSheet
{

class MelodySelectorComponent : public juce::Component
{
public:
    enum class ViewMode { Melodies, Channels };

    MelodySelectorComponent();

    void paint(juce::Graphics& g) override;
    void resized() override;

    std::function<void(const juce::String&)> onMelodySelected;
    std::function<void()> onCloseClicked;

    void switchToChannelsView(const juce::File& file, const std::vector<MidiChannelInfo>& channels);
    void switchToMelodiesView();

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

    class ChannelListBoxModel : public juce::ListBoxModel
    {
    public:
        ChannelListBoxModel(MelodySelectorComponent& parent);
        int getNumRows() override;
        void paintListBoxItem(int rowNumber, juce::Graphics& g, int width, int height, bool rowIsSelected) override;
        void listBoxItemClicked(int rowNumber, const juce::MouseEvent& event) override;

    private:
        MelodySelectorComponent& owner;
    };

    void openFileChooser();

    ViewMode currentMode = ViewMode::Melodies;
    juce::File pendingFile;
    std::vector<MidiChannelInfo> pendingChannels;

    MelodyListBoxModel listBoxModel;
    ChannelListBoxModel channelListBoxModel;
    juce::ListBox listBox;
    juce::TextButton loadMidiButton;
    juce::TextButton backButton;
    juce::TextButton closeButton;
    std::unique_ptr<juce::FileChooser> fileChooser;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MelodySelectorComponent)
};

} // namespace MidiSheet
