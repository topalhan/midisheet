#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../core/MusicTheory.h"
#include <set>

namespace MidiSheet
{

class VirtualPianoComponent : public juce::Component
{
public:
    VirtualPianoComponent(int startMidi = 36, int endMidi = 96); // C2 to C7 (61 keys)

    void paint(juce::Graphics& g) override;
    void resized() override;

    void mouseDown(const juce::MouseEvent& event) override;
    void mouseUp(const juce::MouseEvent& event) override;
    void mouseDrag(const juce::MouseEvent& event) override;

    void noteOn(int midi);
    void noteOff(int midi);
    void setTargetNote(int midi) { targetMidiNote = midi; repaint(); }
    void setReviewNotes(int targetMidi, int wrongMidi)
    {
        reviewTargetMidi = targetMidi;
        reviewWrongMidi = wrongMidi;
        repaint();
    }
    void clearReviewNotes()
    {
        reviewTargetMidi = -1;
        reviewWrongMidi = -1;
        repaint();
    }

    std::function<void(int midi, int velocity)> onNoteTriggered;
    std::function<void(int midi)> onNoteReleased;

private:
    struct KeyGeometry
    {
        int midi = 60;
        bool isBlack = false;
        juce::Rectangle<float> rect;
    };

    static bool isBlackKey(int midi);
    int getMidiAtPosition(juce::Point<float> pos) const;

    const int firstMidi;
    const int lastMidi;
    int targetMidiNote = -1;
    int reviewTargetMidi = -1;
    int reviewWrongMidi = -1;
    int currentlyClickedMidi = -1;

    std::set<int> activeMidiNotes;
    std::vector<KeyGeometry> whiteKeys;
    std::vector<KeyGeometry> blackKeys;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(VirtualPianoComponent)
};

} // namespace MidiSheet
