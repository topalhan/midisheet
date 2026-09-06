#include "VirtualPianoComponent.h"

namespace MidiSheet
{

VirtualPianoComponent::VirtualPianoComponent(int startMidi, int endMidi)
    : firstMidi(startMidi), lastMidi(endMidi)
{
    setOpaque(false);
}

bool VirtualPianoComponent::isBlackKey(int midi)
{
    const int semitone = (midi % 12 + 12) % 12;
    return (semitone == 1 || semitone == 3 || semitone == 6 || semitone == 8 || semitone == 10);
}

void VirtualPianoComponent::resized()
{
    whiteKeys.clear();
    blackKeys.clear();

    const auto bounds = getLocalBounds().toFloat();
    const float totalW = bounds.getWidth();
    const float totalH = bounds.getHeight();

    // Count white keys
    int whiteKeyCount = 0;
    for (int m = firstMidi; m <= lastMidi; ++m)
    {
        if (!isBlackKey(m)) whiteKeyCount++;
    }

    if (whiteKeyCount == 0) return;

    const float whiteKeyWidth = totalW / static_cast<float>(whiteKeyCount);
    const float blackKeyWidth = whiteKeyWidth * 0.62f;
    const float blackKeyHeight = totalH * 0.62f;

    float currentWhiteX = 0.0f;

    for (int m = firstMidi; m <= lastMidi; ++m)
    {
        if (!isBlackKey(m))
        {
            KeyGeometry geom;
            geom.midi = m;
            geom.isBlack = false;
            geom.rect = juce::Rectangle<float>(currentWhiteX, 0.0f, whiteKeyWidth, totalH);
            whiteKeys.push_back(geom);
            currentWhiteX += whiteKeyWidth;
        }
    }

    // Place black keys centered over boundaries of adjacent white keys
    for (size_t i = 0; i < whiteKeys.size(); ++i)
    {
        const int m = whiteKeys[i].midi;
        const int nextM = m + 1;
        if (nextM <= lastMidi && isBlackKey(nextM))
        {
            KeyGeometry geom;
            geom.midi = nextM;
            geom.isBlack = true;
            const float centerX = whiteKeys[i].rect.getRight();
            geom.rect = juce::Rectangle<float>(centerX - blackKeyWidth * 0.5f, 0.0f, blackKeyWidth, blackKeyHeight);
            blackKeys.push_back(geom);
        }
    }
}

int VirtualPianoComponent::getMidiAtPosition(juce::Point<float> pos) const
{
    // Black keys have click precedence
    for (const auto& k : blackKeys)
    {
        if (k.rect.contains(pos)) return k.midi;
    }
    for (const auto& k : whiteKeys)
    {
        if (k.rect.contains(pos)) return k.midi;
    }
    return -1;
}

void VirtualPianoComponent::mouseDown(const juce::MouseEvent& event)
{
    const int midi = getMidiAtPosition(event.position);
    if (midi != -1)
    {
        currentlyClickedMidi = midi;
        noteOn(midi);
        if (onNoteTriggered) onNoteTriggered(midi, 100);
    }
}

void VirtualPianoComponent::mouseUp(const juce::MouseEvent& event)
{
    juce::ignoreUnused(event);
    if (currentlyClickedMidi != -1)
    {
        noteOff(currentlyClickedMidi);
        if (onNoteReleased) onNoteReleased(currentlyClickedMidi);
        currentlyClickedMidi = -1;
    }
}

void VirtualPianoComponent::mouseDrag(const juce::MouseEvent& event)
{
    const int midi = getMidiAtPosition(event.position);
    if (midi != currentlyClickedMidi)
    {
        if (currentlyClickedMidi != -1)
        {
            noteOff(currentlyClickedMidi);
            if (onNoteReleased) onNoteReleased(currentlyClickedMidi);
        }
        currentlyClickedMidi = midi;
        if (midi != -1)
        {
            noteOn(midi);
            if (onNoteTriggered) onNoteTriggered(midi, 100);
        }
    }
}

void VirtualPianoComponent::noteOn(int midi)
{
    activeMidiNotes.insert(midi);
    repaint();
}

void VirtualPianoComponent::noteOff(int midi)
{
    activeMidiNotes.erase(midi);
    repaint();
}

void VirtualPianoComponent::paint(juce::Graphics& g)
{
    // Draw white keys first
    for (const auto& k : whiteKeys)
    {
        const bool isActive = (activeMidiNotes.find(k.midi) != activeMidiNotes.end());
        const bool isTarget = (k.midi == targetMidiNote);

        if (isActive)
        {
            g.setColour(juce::Colour::fromRGB(56, 189, 248)); // Sky 400 press glow
        }
        else if (isTarget)
        {
            g.setColour(juce::Colour::fromRGB(254, 243, 199)); // Warm amber highlight
        }
        else
        {
            g.setColour(juce::Colour::fromRGB(248, 250, 252)); // Slate 50 white key
        }

        g.fillRect(k.rect.reduced(0.5f));

        // Border
        g.setColour(juce::Colour::fromRGB(148, 163, 184));
        g.drawRect(k.rect.reduced(0.5f), 1.0f);

        // Key label at bottom of C keys
        if (k.midi % 12 == 0)
        {
            g.setFont(juce::FontOptions(10.0f, juce::Font::bold));
            g.setColour(isActive ? juce::Colours::white : juce::Colour::fromRGB(100, 116, 139));
            const juce::String label = "C" + juce::String((k.midi / 12) - 1);
            g.drawText(label, k.rect.getX(), k.rect.getBottom() - 18.0f, k.rect.getWidth(), 16.0f, juce::Justification::centred);
        }
    }

    // Draw black keys on top
    for (const auto& k : blackKeys)
    {
        const bool isActive = (activeMidiNotes.find(k.midi) != activeMidiNotes.end());
        const bool isTarget = (k.midi == targetMidiNote);

        if (isActive)
        {
            g.setColour(juce::Colour::fromRGB(14, 165, 233)); // Sky 500 active
        }
        else if (isTarget)
        {
            g.setColour(juce::Colour::fromRGB(217, 119, 6)); // Amber 600 target
        }
        else
        {
            g.setColour(juce::Colour::fromRGB(15, 23, 42)); // Slate 900 black key
        }

        g.fillRect(k.rect);

        // Black key bevel & border
        g.setColour(juce::Colour::fromRGB(51, 65, 85));
        g.drawRect(k.rect, 1.0f);
    }
}

} // namespace MidiSheet
