#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../core/MusicTheory.h"
#include "../core/MelodyDatabase.h"
#include "../core/MelodyScorer.h"
#include <set>
#include <vector>

namespace MidiSheet
{

class GrandStaffComponent : public juce::Component
{
public:
    GrandStaffComponent();

    void paint(juce::Graphics& g) override;
    void resized() override;

    void noteOn(int midi, int velocity);
    void noteOff(int midi);
    void clearNotes();

    void setPracticeMelody(const Melody* melody, int noteIndex, bool isFinished);
    void setPracticeState(const Melody* melody, int noteIndex, bool isFinished,
                          PracticeMode mode, double playheadBeats, bool isCountingIn,
                          bool isAnalyzing, double analysisSecRemaining,
                          int countInBeat = 0, int countInTotal = 4);
    void setNoteEvaluations(const std::vector<NoteEvaluation>* evals) { noteEvaluations = evals; }
    void setTargetNote(const MelodyNote* note);
    void triggerMistakeFlash();
    void triggerRecoveryFlash();

    void setPreferFlats(bool prefer) { preferFlats = prefer; repaint(); }
    void setShowLabels(bool show) { showLabels = show; repaint(); }
    void setAccidentalAlertEnabled(bool enabled) { accidentalAlertEnabled = enabled; repaint(); }
    void setIntervalContourEnabled(bool enabled) { intervalContourEnabled = enabled; repaint(); }
    void setKeySignature(const juce::String& keyName) { activeKeySignature = KeySignature::getByKeyName(keyName); repaint(); }
    void setVisualDisrupterMode(VisualDisrupterMode mode) { disrupterMode = mode; repaint(); }
    VisualDisrupterMode getVisualDisrupterMode() const noexcept { return disrupterMode; }
    void setDecoupledEyeCursorEnabled(bool enabled) { decoupledEyeCursorEnabled = enabled; repaint(); }
    bool isDecoupledEyeCursorEnabled() const noexcept { return decoupledEyeCursorEnabled; }

    void jumpToMistake(int mistakeIndex);
    void nextMistake();
    void previousMistake();
    int getActiveReviewMistakeIndex() const { return activeReviewMistakeIndex; }

    std::function<void(int noteIndex, int targetMidi, int wrongMidi)> onReviewNoteChanged;
    std::function<void()> onSkipSilentAnalysisClicked;

    void mouseDown(const juce::MouseEvent& event) override;
    void mouseDrag(const juce::MouseEvent& event) override;
    void mouseUp(const juce::MouseEvent& event) override;
    void mouseWheelMove(const juce::MouseEvent& event, const juce::MouseWheelDetails& wheel) override;

private:
    void drawStaffLines(juce::Graphics& g, float xLeft, float width, float trebleTopY, float bassTopY, float lineSpacing);
    void drawClefs(juce::Graphics& g, float clefX, float trebleTopY, float bassTopY, float lineSpacing);
    void drawTimeSignature(juce::Graphics& g, float x, float trebleTopY, float bassTopY, float lineSpacing, int num, int den);
    void drawMeasureBarlines(juce::Graphics& g, const std::vector<float>& barlineXs, float scrollX, float trebleTopY, float bassBottomY, float lineSpacing);
    void drawScoreNote(juce::Graphics& g, const MelodyNote& note, float x, float trebleBottomY, float bassBottomY, float lineSpacing,
                       bool isTarget, bool isPast, double timestampMs, const NoteEvaluation* eval, float labelBaselineY, bool isReviewActive = false);
    void drawActivePlayedNotes(juce::Graphics& g, float targetX, float trebleBottomY, float bassBottomY, float lineSpacing);
    void drawLedgerLines(juce::Graphics& g, float x, int diatonicStep, float clefBottomY, float lineSpacing, bool isTreble, juce::Colour color, float headW);
    void drawIntervalRibbon(juce::Graphics& g, juce::Point<float> p1, int midi1, juce::Point<float> p2, int midi2, float alpha, bool isHarmonic);
    void drawVanishingBarMask(juce::Graphics& g, const std::vector<float>& barlineXs, float scrollX, float notesStartX, float staffRightX, float trebleTopY, float bassBottomY, float beatsPerMeasure);
    void drawAdvanceCurtain(juce::Graphics& g, float curtainX, float notesStartX, float trebleTopY, float bassBottomY);
    void drawDecoupledEyeCursor(juce::Graphics& g, float eyeX, float trebleTopY, float bassBottomY);

    std::vector<int> getMistakeNoteIndices() const;
    void notifyReviewNoteChanged();

    const Melody* currentMelody = nullptr;
    int currentNoteIndex = 0;
    bool isMelodyFinished = false;
    const MelodyNote* currentTargetNote = nullptr;
    const std::vector<NoteEvaluation>* noteEvaluations = nullptr;

    // Sight-reading & playhead tracking state
    PracticeMode practiceMode = PracticeMode::Wait;
    double currentPlayheadBeats = 0.0;
    bool isCountingIn = false;
    int countInBeat = 0;
    int countInTotal = 4;
    bool isSilentAnalyzing = false;
    double analysisSecondsRemaining = 30.0;
    double recoveryFlashTimeMs = 0.0;

    // Feature toggles
    bool accidentalAlertEnabled = true;
    bool intervalContourEnabled = true;
    VisualDisrupterMode disrupterMode = VisualDisrupterMode::None;
    bool decoupledEyeCursorEnabled = false;
    KeySignature activeKeySignature;

    std::set<int> activeMidiNotes;
    bool preferFlats = false;
    bool showLabels = true;

    double lastMistakeTimeMs = 0.0;

    int activeReviewMistakeIndex = -1;
    float manualScrollOffset = 0.0f;
    bool isUserDragging = false;
    float dragStartX = 0.0f;
    float dragStartScroll = 0.0f;

    juce::Rectangle<float> prevMistakeBtnBounds;
    juce::Rectangle<float> nextMistakeBtnBounds;
    juce::Rectangle<float> skipAnalysisBtnBounds;
    std::vector<std::pair<juce::Rectangle<float>, int>> noteHitboxes;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(GrandStaffComponent)
};

} // namespace MidiSheet
