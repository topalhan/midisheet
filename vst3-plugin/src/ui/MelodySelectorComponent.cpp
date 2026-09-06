#include "MelodySelectorComponent.h"

namespace MidiSheet
{

MelodySelectorComponent::MelodySelectorComponent()
    : listBoxModel(*this)
{
    listBox.setModel(&listBoxModel);
    listBox.setRowHeight(56);
    listBox.setColour(juce::ListBox::backgroundColourId, juce::Colour::fromRGB(15, 23, 42)); // Slate 900
    addAndMakeVisible(listBox);

    closeButton.setButtonText("X");
    closeButton.setColour(juce::TextButton::buttonColourId, juce::Colour::fromRGB(30, 41, 59));
    closeButton.setColour(juce::TextButton::textColourOffId, juce::Colour::fromRGB(226, 232, 240));
    closeButton.onClick = [this]() {
        if (onCloseClicked) onCloseClicked();
    };
    addAndMakeVisible(closeButton);
}

void MelodySelectorComponent::resized()
{
    const auto bounds = getLocalBounds();
    closeButton.setBounds(bounds.getRight() - 36, bounds.getY() + 10, 26, 26);
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
    g.drawText("Select Practice Melody", bounds.getX() + 16, bounds.getY() + 12, 300, 24, juce::Justification::centredLeft);
}

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
    g.drawText(juce::String(rowNumber + 1), x, y + 4.0f, 24.0f, 24.0f, juce::Justification::centred);

    // Melody Title & Composer
    g.setColour(juce::Colours::white);
    g.setFont(juce::FontOptions(14.0f, juce::Font::bold));
    g.drawText(m.title, x + 34.0f, y, 220.0f, 18.0f, juce::Justification::centredLeft);

    // Difficulty badge
    juce::Colour diffColor = (m.difficulty == "Easy") ? juce::Colour::fromRGB(16, 185, 129)
                          : (m.difficulty == "Medium") ? juce::Colour::fromRGB(245, 158, 11)
                          : juce::Colour::fromRGB(244, 63, 94);

    const float badgeX = x + 240.0f;
    g.setColour(diffColor.withAlpha(0.2f));
    g.fillRoundedRectangle(badgeX, y + 1.0f, 48.0f, 16.0f, 4.0f);
    g.setColour(diffColor);
    g.drawRoundedRectangle(badgeX, y + 1.0f, 48.0f, 16.0f, 4.0f, 1.0f);
    g.setFont(juce::FontOptions(9.0f, juce::Font::bold));
    g.drawText(m.difficulty.toUpperCase(), badgeX, y + 1.0f, 48.0f, 16.0f, juce::Justification::centred);

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

} // namespace MidiSheet
