#include "MelodySelectorComponent.h"
#include "../core/MusicTheory.h"

namespace MidiSheet
{

MelodySelectorComponent::MelodySelectorComponent()
    : listBoxModel(*this),
      channelListBoxModel(*this)
{
    listBox.setModel(&listBoxModel);
    listBox.setRowHeight(56);
    listBox.setColour(juce::ListBox::backgroundColourId, juce::Colour::fromRGB(15, 23, 42)); // Slate 900
    addAndMakeVisible(listBox);

    loadMidiButton.setButtonText("+ Load .MID File");
    loadMidiButton.setColour(juce::TextButton::buttonColourId, juce::Colour::fromRGB(16, 185, 129)); // Emerald
    loadMidiButton.setColour(juce::TextButton::textColourOffId, juce::Colours::white);
    loadMidiButton.onClick = [this]() { openFileChooser(); };
    addAndMakeVisible(loadMidiButton);

    backButton.setButtonText("<- Back");
    backButton.setColour(juce::TextButton::buttonColourId, juce::Colour::fromRGB(30, 41, 59));
    backButton.setColour(juce::TextButton::textColourOffId, juce::Colour::fromRGB(226, 232, 240));
    backButton.onClick = [this]() { switchToMelodiesView(); };
    backButton.setVisible(false);
    addChildComponent(backButton);

    closeButton.setButtonText("X");
    closeButton.setColour(juce::TextButton::buttonColourId, juce::Colour::fromRGB(30, 41, 59));
    closeButton.setColour(juce::TextButton::textColourOffId, juce::Colour::fromRGB(226, 232, 240));
    closeButton.onClick = [this]() {
        if (currentMode == ViewMode::Channels)
            switchToMelodiesView();
        if (onCloseClicked)
            onCloseClicked();
    };
    addAndMakeVisible(closeButton);
}

void MelodySelectorComponent::switchToChannelsView(const juce::File& file, const std::vector<MidiChannelInfo>& channels)
{
    currentMode = ViewMode::Channels;
    pendingFile = file;
    pendingChannels = channels;
    loadMidiButton.setVisible(false);
    backButton.setVisible(true);
    listBox.setModel(&channelListBoxModel);
    listBox.updateContent();
    listBox.repaint();
    repaint();
}

void MelodySelectorComponent::switchToMelodiesView()
{
    currentMode = ViewMode::Melodies;
    pendingChannels.clear();
    loadMidiButton.setVisible(true);
    backButton.setVisible(false);
    listBox.setModel(&listBoxModel);
    listBox.updateContent();
    listBox.repaint();
    repaint();
}

void MelodySelectorComponent::openFileChooser()
{
    fileChooser = std::make_unique<juce::FileChooser>(
        "Select a Standard MIDI File (.mid) to score...",
        juce::File::getSpecialLocation(juce::File::userHomeDirectory),
        "*.mid;*.midi");

    auto folderChooserFlags = juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles;

    fileChooser->launchAsync(folderChooserFlags, [this](const juce::FileChooser& chooser)
    {
        auto file = chooser.getResult();
        if (file.existsAsFile())
        {
            auto channels = MelodyDatabase::inspectMidiChannels(file);
            if (channels.empty())
            {
                // Fallback: try loading directly
                juce::String newMelodyId;
                if (MelodyDatabase::loadMidiFile(file, newMelodyId, -1))
                {
                    listBox.updateContent();
                    listBox.repaint();
                    if (onMelodySelected)
                        onMelodySelected(newMelodyId);
                }
            }
            else if (channels.size() == 1)
            {
                // Only 1 channel: load directly without prompt
                juce::String newMelodyId;
                if (MelodyDatabase::loadMidiFile(file, newMelodyId, channels[0].channelNumber))
                {
                    listBox.updateContent();
                    listBox.repaint();
                    if (onMelodySelected)
                        onMelodySelected(newMelodyId);
                }
            }
            else
            {
                // Multiple channels: prompt user to pick channel
                switchToChannelsView(file, channels);
            }
        }
    });
}

void MelodySelectorComponent::resized()
{
    const auto bounds = getLocalBounds();
    closeButton.setBounds(bounds.getRight() - 36, bounds.getY() + 10, 26, 26);
    loadMidiButton.setBounds(bounds.getRight() - 170, bounds.getY() + 10, 125, 26);
    backButton.setBounds(bounds.getRight() - 170, bounds.getY() + 10, 125, 26);
    listBox.setBounds(bounds.getX() + 12, bounds.getY() + 44, bounds.getWidth() - 24, bounds.getHeight() - 56);
}

void MelodySelectorComponent::paint(juce::Graphics& g)
{
    const auto bounds = getLocalBounds().toFloat();

    // Dark sleek modal card background
    g.setColour(juce::Colour::fromRGB(15, 23, 42));
    g.fillRoundedRectangle(bounds, 12.0f);

    g.setColour(juce::Colour::fromRGB(56, 189, 248).withAlpha(0.6f)); // Sky glow border
    g.drawRoundedRectangle(bounds.reduced(1.0f), 12.0f, 1.5f);

    // Header title
    g.setColour(juce::Colours::white);
    g.setFont(juce::FontOptions(16.0f, juce::Font::bold));

    if (currentMode == ViewMode::Channels)
    {
        juce::String title = "Select Channel: " + pendingFile.getFileName();
        g.drawText(title, bounds.getX() + 16, bounds.getY() + 12, bounds.getWidth() - 190.0f, 24.0f, juce::Justification::centredLeft, true);
    }
    else
    {
        g.drawText("Select Practice Melody", bounds.getX() + 16, bounds.getY() + 12, 260, 24, juce::Justification::centredLeft);
    }
}

// ==============================================================================
// MelodyListBoxModel Implementation
// ==============================================================================

MelodySelectorComponent::MelodyListBoxModel::MelodyListBoxModel(MelodySelectorComponent& parent)
    : owner(parent)
{
}

int MelodySelectorComponent::MelodyListBoxModel::getNumRows()
{
    return static_cast<int>(MelodyDatabase::getAllMelodies().size());
}

void MelodySelectorComponent::MelodyListBoxModel::paintListBoxItem(int rowNumber, juce::Graphics& g, int width, int height, bool rowIsSelected)
{
    const auto& all = MelodyDatabase::getAllMelodies();
    if (rowNumber < 0 || rowNumber >= static_cast<int>(all.size())) return;

    const auto& m = all[static_cast<size_t>(rowNumber)];
    const auto itemBounds = juce::Rectangle<float>(4.0f, 2.0f, width - 8.0f, height - 4.0f);

    // Row card background
    if (rowIsSelected)
    {
        g.setColour(juce::Colour::fromRGB(30, 58, 138)); // Deep blue
        g.fillRoundedRectangle(itemBounds, 8.0f);
        g.setColour(juce::Colour::fromRGB(56, 189, 248));
        g.drawRoundedRectangle(itemBounds, 8.0f, 1.2f);
    }
    else
    {
        g.setColour(juce::Colour::fromRGB(24, 32, 47));
        g.fillRoundedRectangle(itemBounds, 8.0f);
        g.setColour(juce::Colour::fromRGB(38, 49, 71));
        g.drawRoundedRectangle(itemBounds, 8.0f, 1.0f);
    }

    // Index number badge
    const float x = itemBounds.getX() + 10.0f;
    const float y = itemBounds.getY() + 8.0f;

    g.setColour(juce::Colour::fromRGB(30, 41, 59));
    g.fillRoundedRectangle(x, y + 4.0f, 24.0f, 24.0f, 6.0f);
    g.setColour(juce::Colour::fromRGB(56, 189, 248));
    g.setFont(juce::FontOptions(12.0f, juce::Font::bold));
    if (m.isCustom)
        g.drawText("M", x, y + 4.0f, 24.0f, 24.0f, juce::Justification::centred);
    else
        g.drawText(juce::String(rowNumber + 1), x, y + 4.0f, 24.0f, 24.0f, juce::Justification::centred);

    // Melody Title & Composer
    g.setColour(juce::Colours::white);
    g.setFont(juce::FontOptions(14.0f, juce::Font::bold));
    g.drawText(m.title, x + 34.0f, y, 200.0f, 18.0f, juce::Justification::centredLeft);

    // Custom or Difficulty badge
    const float badgeX = x + 240.0f;
    if (m.isCustom)
    {
        const auto badgeBounds = juce::Rectangle<float>(badgeX, y + 1.0f, 52.0f, 16.0f);
        g.setColour(juce::Colour::fromRGB(56, 189, 248).withAlpha(0.2f));
        g.fillRoundedRectangle(badgeBounds, 4.0f);
        g.setColour(juce::Colour::fromRGB(56, 189, 248));
        g.drawRoundedRectangle(badgeBounds, 4.0f, 1.0f);
        g.setFont(juce::FontOptions(9.0f, juce::Font::bold));
        g.drawText("CUSTOM", badgeBounds.toNearestInt(), juce::Justification::centred);
    }
    else
    {
        juce::Colour diffColor = (m.difficulty == "Easy") ? juce::Colour::fromRGB(16, 185, 129)
                              : (m.difficulty == "Medium") ? juce::Colour::fromRGB(245, 158, 11)
                              : juce::Colour::fromRGB(244, 63, 94);

        const auto badgeBounds = juce::Rectangle<float>(badgeX, y + 1.0f, 48.0f, 16.0f);
        g.setColour(diffColor.withAlpha(0.2f));
        g.fillRoundedRectangle(badgeBounds, 4.0f);
        g.setColour(diffColor);
        g.drawRoundedRectangle(badgeBounds, 4.0f, 1.0f);
        g.setFont(juce::FontOptions(9.0f, juce::Font::bold));
        g.drawText(m.difficulty.toUpperCase(), badgeBounds.toNearestInt(), juce::Justification::centred);
    }

    // Composer & Description
    g.setColour(juce::Colour::fromRGB(148, 163, 184));
    g.setFont(juce::FontOptions(11.0f, juce::Font::plain));
    g.drawText(m.composer + " - " + m.description, x + 34.0f, y + 20.0f, width - 160.0f, 16.0f, juce::Justification::centredLeft);

    // Right Side: Notes count and Key
    const float rightX = itemBounds.getRight() - 95.0f;
    g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
    g.setColour(juce::Colour::fromRGB(203, 213, 225));
    g.drawText(juce::String(m.notes.size()) + " notes", rightX, y + 4.0f, 85.0f, 16.0f, juce::Justification::centredRight);
    g.setFont(juce::FontOptions(10.0f, juce::Font::plain));
    g.setColour(juce::Colour::fromRGB(148, 163, 184));
    g.drawText(m.key, rightX, y + 20.0f, 85.0f, 16.0f, juce::Justification::centredRight);
}

void MelodySelectorComponent::MelodyListBoxModel::listBoxItemClicked(int rowNumber, const juce::MouseEvent& event)
{
    juce::ignoreUnused(event);
    const auto& all = MelodyDatabase::getAllMelodies();
    if (rowNumber >= 0 && rowNumber < static_cast<int>(all.size()))
    {
        if (owner.onMelodySelected)
        {
            owner.onMelodySelected(all[static_cast<size_t>(rowNumber)].id);
        }
    }
}

// ==============================================================================
// ChannelListBoxModel Implementation
// ==============================================================================

MelodySelectorComponent::ChannelListBoxModel::ChannelListBoxModel(MelodySelectorComponent& parent)
    : owner(parent)
{
}

int MelodySelectorComponent::ChannelListBoxModel::getNumRows()
{
    // Row 0 is "All Channels (Merged)", rows 1..N are individual channels
    return 1 + static_cast<int>(owner.pendingChannels.size());
}

void MelodySelectorComponent::ChannelListBoxModel::paintListBoxItem(int rowNumber, juce::Graphics& g, int width, int height, bool rowIsSelected)
{
    const auto itemBounds = juce::Rectangle<float>(4.0f, 2.0f, width - 8.0f, height - 4.0f);

    if (rowIsSelected)
    {
        g.setColour(juce::Colour::fromRGB(30, 58, 138));
        g.fillRoundedRectangle(itemBounds, 8.0f);
        g.setColour(juce::Colour::fromRGB(56, 189, 248));
        g.drawRoundedRectangle(itemBounds, 8.0f, 1.2f);
    }
    else
    {
        g.setColour(juce::Colour::fromRGB(24, 32, 47));
        g.fillRoundedRectangle(itemBounds, 8.0f);
        g.setColour(juce::Colour::fromRGB(38, 49, 71));
        g.drawRoundedRectangle(itemBounds, 8.0f, 1.0f);
    }

    const float x = itemBounds.getX() + 10.0f;
    const float y = itemBounds.getY() + 8.0f;

    if (rowNumber == 0)
    {
        // Row 0: All Channels (Merged)
        g.setColour(juce::Colour::fromRGB(16, 185, 129).withAlpha(0.2f));
        g.fillRoundedRectangle(x, y + 4.0f, 36.0f, 24.0f, 6.0f);
        g.setColour(juce::Colour::fromRGB(16, 185, 129));
        g.drawRoundedRectangle(x, y + 4.0f, 36.0f, 24.0f, 6.0f, 1.0f);
        g.setFont(juce::FontOptions(10.0f, juce::Font::bold));
        g.drawText("ALL", x, y + 4.0f, 36.0f, 24.0f, juce::Justification::centred);

        g.setColour(juce::Colours::white);
        g.setFont(juce::FontOptions(14.0f, juce::Font::bold));
        g.drawText("All Channels (Merged Polyphony)", x + 46.0f, y, 260.0f, 18.0f, juce::Justification::centredLeft);

        g.setColour(juce::Colour::fromRGB(148, 163, 184));
        g.setFont(juce::FontOptions(11.0f, juce::Font::plain));
        g.drawText("Combines all " + juce::String(owner.pendingChannels.size()) + " tracks into single melody practice line", x + 46.0f, y + 20.0f, width - 180.0f, 16.0f, juce::Justification::centredLeft);

        int totalNotes = 0;
        for (const auto& ch : owner.pendingChannels)
            totalNotes += ch.noteCount;

        const float rightX = itemBounds.getRight() - 95.0f;
        g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
        g.setColour(juce::Colour::fromRGB(16, 185, 129));
        g.drawText(juce::String(totalNotes) + " notes", rightX, y + 4.0f, 85.0f, 16.0f, juce::Justification::centredRight);
        g.setFont(juce::FontOptions(10.0f, juce::Font::plain));
        g.setColour(juce::Colour::fromRGB(148, 163, 184));
        g.drawText("Full Piece", rightX, y + 20.0f, 85.0f, 16.0f, juce::Justification::centredRight);
    }
    else
    {
        // Row 1..N: Specific Channel
        const size_t chIdx = static_cast<size_t>(rowNumber - 1);
        if (chIdx >= owner.pendingChannels.size()) return;

        const auto& ch = owner.pendingChannels[chIdx];

        // Channel Number Badge
        g.setColour(juce::Colour::fromRGB(56, 189, 248).withAlpha(0.2f));
        g.fillRoundedRectangle(x, y + 4.0f, 36.0f, 24.0f, 6.0f);
        g.setColour(juce::Colour::fromRGB(56, 189, 248));
        g.drawRoundedRectangle(x, y + 4.0f, 36.0f, 24.0f, 6.0f, 1.0f);
        g.setFont(juce::FontOptions(10.0f, juce::Font::bold));
        g.drawText("CH " + juce::String(ch.channelNumber), x, y + 4.0f, 36.0f, 24.0f, juce::Justification::centred);

        // Title: Track Name or Instrument Name
        juce::String title = ch.trackName.isNotEmpty() ? ch.trackName : ch.instrumentName;
        if (ch.isDrum) title += " [Percussion]";

        g.setColour(juce::Colours::white);
        g.setFont(juce::FontOptions(14.0f, juce::Font::bold));
        g.drawText(title, x + 46.0f, y, 260.0f, 18.0f, juce::Justification::centredLeft);

        // Subtitle: Instrument & Pitch Range
        juce::String rangeStr = MusicTheory::getNoteInfo(ch.lowestMidi).fullName + " to " + MusicTheory::getNoteInfo(ch.highestMidi).fullName;
        juce::String desc = ch.instrumentName + " - Pitch Range: " + rangeStr;

        g.setColour(juce::Colour::fromRGB(148, 163, 184));
        g.setFont(juce::FontOptions(11.0f, juce::Font::plain));
        g.drawText(desc, x + 46.0f, y + 20.0f, width - 180.0f, 16.0f, juce::Justification::centredLeft);

        // Right side: Note count & "Single Part"
        const float rightX = itemBounds.getRight() - 95.0f;
        g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
        g.setColour(juce::Colour::fromRGB(56, 189, 248));
        g.drawText(juce::String(ch.noteCount) + " notes", rightX, y + 4.0f, 85.0f, 16.0f, juce::Justification::centredRight);
        g.setFont(juce::FontOptions(10.0f, juce::Font::plain));
        g.setColour(juce::Colour::fromRGB(148, 163, 184));
        g.drawText("Part " + juce::String(ch.channelNumber), rightX, y + 20.0f, 85.0f, 16.0f, juce::Justification::centredRight);
    }
}

void MelodySelectorComponent::ChannelListBoxModel::listBoxItemClicked(int rowNumber, const juce::MouseEvent& event)
{
    juce::ignoreUnused(event);

    juce::String newMelodyId;
    int targetChannel = -1;

    if (rowNumber > 0)
    {
        const size_t chIdx = static_cast<size_t>(rowNumber - 1);
        if (chIdx < owner.pendingChannels.size())
        {
            targetChannel = owner.pendingChannels[chIdx].channelNumber;
        }
    }

    if (MelodyDatabase::loadMidiFile(owner.pendingFile, newMelodyId, targetChannel))
    {
        owner.switchToMelodiesView();
        if (owner.onMelodySelected)
        {
            owner.onMelodySelected(newMelodyId);
        }
    }
}

} // namespace MidiSheet
