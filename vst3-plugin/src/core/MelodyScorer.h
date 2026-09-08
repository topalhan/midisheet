#pragma once

#include <juce_core/juce_core.h>
#include "MelodyDatabase.h"

namespace MidiSheet
{

enum class PracticeMode
{
    Wait,  // Waits for the correct note before advancing
    Tempo  // Evaluates notes on beat against metronome / DAW playhead
};

enum class TimingRating
{
    None,
    Perfect,   // Within +/- 50ms
    Early,     // 50ms to 110ms early
    Late,      // 50ms to 110ms late
    Missed     // Beyond tolerance or wrong note
};

struct TimingFeedback
{
    TimingRating rating = TimingRating::None;
    double offsetMs = 0.0;
    juce::String text = "Ready";
};

struct NoteEvaluation
{
    int mistakeAttempts = 0;
    std::vector<int> wrongNotesPlayed;
    int lastWrongMidi = -1;
    TimingRating timing = TimingRating::None;
    double offsetMs = 0.0;
    bool completed = false;
};

struct PracticeScorecard
{
    int totalNotes = 0;
    int correctNotes = 0;
    int mistakeCount = 0;
    int perfectHits = 0;
    int greatHits = 0;
    int missedNotes = 0;
    int pitchAccuracy = 100;
    int rhythmAccuracy = 100;
    int maxStreak = 0;
    int stars = 3;
    bool isCompleted = false;
};

class MelodyScorer
{
public:
    MelodyScorer();

    void loadMelody(const juce::String& melodyId);
    void restart();

    void setPracticeMode(PracticeMode mode);
    PracticeMode getPracticeMode() const { return practiceMode; }

    void setBpm(double bpm) { currentBpm = std::clamp(bpm, 30.0, 300.0); }
    double getBpm() const { return currentBpm; }

    const Melody& getCurrentMelody() const { return currentMelody; }
    int getCurrentNoteIndex() const { return currentNoteIndex; }
    const MelodyNote* getCurrentTargetNote() const;
    bool isFinished() const { return finished; }

    /**
     * Process a Note On event played by the user.
     * @param midiNote Played note pitch
     * @param velocity Note velocity
     * @param noteTimestampSec High-precision timestamp in seconds
     * @param hostPpq Musical beat position in quarter notes (from DAW playhead, or -1 if stopped)
     */
    bool evaluateNote(int midiNote, int velocity, double noteTimestampSec = 0.0, double hostPpq = -1.0);

    const TimingFeedback& getLastTimingFeedback() const { return lastFeedback; }
    const PracticeScorecard& getScorecard() const { return scorecard; }
    int getCurrentStreak() const { return currentStreak; }
    int getPitchAccuracy() const { return scorecard.pitchAccuracy; }
    int getRhythmAccuracy() const { return scorecard.rhythmAccuracy; }
    const std::vector<NoteEvaluation>& getNoteEvaluations() const { return noteEvaluations; }

    std::vector<int> getMistakeIndices() const
    {
        std::vector<int> indices;
        for (size_t i = 0; i < noteEvaluations.size(); ++i)
        {
            if (noteEvaluations[i].mistakeAttempts > 0)
                indices.push_back(static_cast<int>(i));
        }
        return indices;
    }

    int getFirstMistakeIndex() const
    {
        for (size_t i = 0; i < noteEvaluations.size(); ++i)
        {
            if (noteEvaluations[i].mistakeAttempts > 0)
                return static_cast<int>(i);
        }
        return -1;
    }

private:
    void calculateLiveScorecard();
    void calculateFinalScorecard();

    Melody currentMelody;
    PracticeMode practiceMode = PracticeMode::Wait;
    double currentBpm = 108.0;

    int currentNoteIndex = 0;
    bool finished = false;

    // Per-note learning evaluations
    std::vector<NoteEvaluation> noteEvaluations;

    // Timing tracking
    double songStartTimeSec = -1.0;
    double lastNoteTimestampSec = -1.0;
    double expectedCumulativeBeats = 0.0;

    int currentStreak = 0;
    int maxStreak = 0;
    int correctCount = 0;
    int mistakeCount = 0;
    int perfectCount = 0;
    int greatCount = 0;
    int missedCount = 0;
    double rhythmPointsTotal = 0.0;

    TimingFeedback lastFeedback;
    PracticeScorecard scorecard;
};

} // namespace MidiSheet
