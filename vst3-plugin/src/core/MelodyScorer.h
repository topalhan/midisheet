#pragma once

#include <juce_core/juce_core.h>
#include "MelodyDatabase.h"
#include <map>
#include <functional>

namespace MidiSheet
{

enum class PracticeMode
{
    Wait,       // Waits for the correct note before advancing
    Tempo,      // Evaluates notes on beat against metronome / DAW playhead
    StrictTime, // No-Pause Metronome; relentless playhead; non-blocking mistake advance
    FirstRead   // 30s silent inspection -> 4-beat count-in -> 1-shot strict playback
};

enum class TimingRating
{
    None,
    Perfect,   // <= 65ms
    Early,     // 65ms to 150ms early
    Late,      // 65ms to 150ms late
    Missed     // > 150ms or expired
};

struct TimingFeedback
{
    TimingRating rating = TimingRating::None;
    double offsetMs = 0.0;
    juce::String text = "Ready";
    bool isRecovered = false;
};

struct NoteEvaluation
{
    int mistakeAttempts = 0;
    std::vector<int> wrongNotesPlayed;
    int lastWrongMidi = -1;
    TimingRating timing = TimingRating::None;
    double offsetMs = 0.0;
    bool completed = false;
    bool isRecovered = false; // Downbeat tempo recovery
};

struct FirstReadRecord
{
    juce::String melodyId;
    juce::String title;
    juce::String composer;
    juce::String difficulty;
    int64_t timestamp = 0;
    juce::String dateStr;
    int pitchAccuracy = 100;
    int rhythmAccuracy = 100;
    int sightReadingScore = 100;
    int recoveries = 0;
    int stars = 3;
    double durationSeconds = 0.0;
    double bpm = 108.0;
};

struct PracticeScorecard
{
    int totalNotes = 0;
    int correctNotes = 0;
    int mistakeCount = 0;
    int perfectHits = 0;
    int greatHits = 0;
    int missedNotes = 0;
    int recoveries = 0;       // Downbeat tempo recoveries
    int recoveryPoints = 0;   // Bonus points from tempo recoveries
    int pitchAccuracy = 100;
    int rhythmAccuracy = 100;
    int sightReadingScore = 100; // 60% rhythm + 40% pitch + recovery bonus
    int maxStreak = 0;
    int stars = 3;
    bool isCompleted = false;
    bool isFirstRead = false;
    FirstReadRecord firstReadRecord;
};

class MelodyScorer
{
public:
    MelodyScorer();

    void loadMelody(const juce::String& melodyId);
    void loadMelodyObject(const Melody& melody);
    void restart();

    void setPracticeMode(PracticeMode mode);
    PracticeMode getPracticeMode() const { return practiceMode; }
    bool isTimeDrivenMode() const noexcept { return practiceMode == PracticeMode::Tempo || practiceMode == PracticeMode::StrictTime || practiceMode == PracticeMode::FirstRead; }
    bool isStrictTimeMode() const noexcept { return practiceMode == PracticeMode::StrictTime || practiceMode == PracticeMode::FirstRead; }
    bool isFirstReadMode() const noexcept { return practiceMode == PracticeMode::FirstRead; }

    void setBpm(double bpm) { currentBpm = std::clamp(bpm, 30.0, 300.0); }
    double getBpm() const { return currentBpm; }

    const Melody& getCurrentMelody() const { return currentMelody; }
    int getCurrentNoteIndex() const { return currentNoteIndex; }
    const MelodyNote* getCurrentTargetNote() const;
    bool isFinished() const { return finished; }

    /**
     * Process continuous time / playhead beats (called from audio processor or GUI timer).
     * Auto-expires notes into "Missed" in time-driven modes if not struck within grace window.
     */
    void processTime(double currentSongBeats, double nowSec);

    /**
     * Process a Note On event played by the user.
     * @param midiNote Played note pitch
     * @param velocity Note velocity
     * @param noteTimestampSec High-precision timestamp in seconds
     * @param hostPpq Musical beat position in quarter notes (from DAW playhead, or -1 if stopped)
     */
    bool evaluateNote(int midiNote, int velocity, double noteTimestampSec = 0.0, double hostPpq = -1.0);

    // Silent Analysis phase (First-Read mode)
    void startSilentAnalysis(double durationSeconds = 30.0);
    void updateSilentAnalysis(double elapsedSeconds);
    void skipSilentAnalysis();
    bool isSilentAnalyzing() const noexcept { return isAnalyzing; }
    double getAnalysisSecondsRemaining() const noexcept { return analysisSecondsRemaining; }
    double getAnalysisTotalSeconds() const noexcept { return analysisTotalSeconds; }

    // Count-in state
    void startCountIn(int totalBeats = 4);
    void triggerHostTransportStart();
    bool getIsCountingIn() const noexcept { return isCountingIn; }
    int getCountInBeat() const noexcept { return countInBeat; }
    int getCountInTotal() const noexcept { return countInTotal; }
    double getCurrentPlayheadBeats() const noexcept { return currentPlayheadBeats; }

    // First-Read records management
    bool isMelodyFirstReadLocked(const juce::String& melodyId) const;
    void recordFirstReadResult(const FirstReadRecord& record);
    void resetFirstReadLockouts();
    const std::map<juce::String, FirstReadRecord>& getFirstReadRecords() const { return firstReadRecords; }

    const TimingFeedback& getLastTimingFeedback() const { return lastFeedback; }
    const PracticeScorecard& getScorecard() const { return scorecard; }
    int getCurrentStreak() const { return currentStreak; }
    int getPitchAccuracy() const { return scorecard.pitchAccuracy; }
    int getRhythmAccuracy() const { return scorecard.rhythmAccuracy; }
    int getSightReadingScore() const { return scorecard.sightReadingScore; }
    int getRecoveries() const { return scorecard.recoveries; }
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

    // Callbacks
    std::function<void()> onRecoveryTriggered;
    std::function<void()> onSilentAnalysisComplete;

private:
    void calculateLiveScorecard();
    void calculateFinalScorecard();
    void advanceToNextNote();

    Melody currentMelody;
    PracticeMode practiceMode = PracticeMode::Wait;
    double currentBpm = 108.0;

    int currentNoteIndex = 0;
    bool finished = false;

    // Per-note learning evaluations
    std::vector<NoteEvaluation> noteEvaluations;

    // Timing tracking
    double songStartTimeSec = -1.0;
    double songStartPpq = -1.0;
    double lastNoteTimestampSec = -1.0;
    double expectedCumulativeBeats = 0.0;
    double currentPlayheadBeats = 0.0;

    // Strict Sight-Reading & Downbeat Recovery State
    bool hadRecentMissOrMistake = false;

    // First-Read Challenge & Silent Analysis State
    bool isAnalyzing = false;
    double analysisSecondsRemaining = 30.0;
    double analysisTotalSeconds = 30.0;
    bool isCountingIn = false;
    int countInBeat = 0;
    int countInTotal = 4;
    double countInStartTimeSec = -1.0;
    double countInStartPpq = -1.0;
    double countInElapsedBeats = 0.0;
    double lastProcessTimeSec = -1.0;
    std::map<juce::String, FirstReadRecord> firstReadRecords;

    int currentStreak = 0;
    int maxStreak = 0;
    int correctCount = 0;
    int mistakeCount = 0;
    int perfectCount = 0;
    int greatCount = 0;
    int missedCount = 0;
    int recoveriesCount = 0;
    int recoveryPointsTotal = 0;
    double rhythmPointsTotal = 0.0;

    TimingFeedback lastFeedback;
    PracticeScorecard scorecard;
};

} // namespace MidiSheet
