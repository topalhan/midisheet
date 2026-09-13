#pragma once

#include <juce_core/juce_core.h>
#include "MelodyDatabase.h"
#include "MelodyScorer.h"
#include <vector>
#include <set>
#include <functional>

namespace MidiSheet
{

struct RoutineSubPhase
{
    juce::String id;
    int blockIndex = 1;
    juce::String blockName;
    juce::String title;
    double durationSeconds = 120.0;
    double bpm = 96.0;
    juce::String type; // "awkward", "thirds", "rhythm_tap", "audit", "take1", "targeted_fix", "take2", "flash"
    juce::String methodology;
    bool strictMode = false;
    bool waitMode = false;
    bool lookahead = false;
    bool audioMuted = false;
    bool interactiveTap = false;
    double flashPreviewSeconds = 0.0;
    int flashLineIndex = 0;
    Melody exercise;
};

struct RoutineStats
{
    int notesPlayed = 0;
    int correctNotes = 0;
    int recoveries = 0;
    int recoveryPoints = 0;
    int goodTaps = 0;
    int totalTaps = 0;
    int streak = 0;
};

struct RoutineProgress
{
    const RoutineSubPhase* currentPhase = nullptr;
    int phaseIndex = 0;
    int totalPhases = 0;
    double phaseElapsedSeconds = 0.0;
    double phaseRemainingSeconds = 0.0;
    double totalElapsedSeconds = 0.0;
    double totalDurationSeconds = 1200.0;
    int percentTotal = 0;
    bool isRunning = false;
    juce::String targetKey = "C Major";
    bool flashPreviewActive = false;
    int flashCountdownSeconds = 0;
    int streak = 0;
};

class DailyRoutineManager
{
public:
    explicit DailyRoutineManager(MelodyScorer& scorer);

    void setTargetKey(const juce::String& keyName);
    const juce::String& getTargetKey() const noexcept { return targetKey; }

    void startOrResume();
    void pause();
    void togglePlay();
    void reset();
    void skipSubPhase();
    void prevSubPhase();
    void advanceTime(double deltaSeconds);

    RoutineProgress getProgress() const;
    const RoutineSubPhase* getCurrentPhase() const;

    TimingFeedback registerRhythmTap(double nowSec);
    void onMelodyCompleted(const PracticeScorecard& scorecard);

    int getStreak() const;
    int incrementStreak();

    // Exercise generator helpers
    static Melody generateBrokenThirds(const juce::String& keyName, double bpm);
    static Melody getAwkwardPairs(const juce::String& keyName);
    static Melody getSightReadingExcerpt(const juce::String& keyName);
    static std::vector<Melody> getFlashReadingLines(const juce::String& keyName);

    // Callbacks
    std::function<void(const RoutineProgress&)> onTick;
    std::function<void(const RoutineSubPhase&)> onPhaseChanged;
    std::function<void(const RoutineStats&)> onRoutineCompleted;
    std::function<void(const TimingFeedback&)> onTapFeedback;
    std::function<void(int seconds)> onFlashCountdown;
    std::function<void(bool synthMuted)> onSynthMuteChanged;
    std::function<void(bool lookaheadEnabled)> onLookaheadChanged;

private:
    void buildPlan();
    void loadSubPhase(int index);
    Melody buildTargetedFixExercise();
    void finishRoutine();

    MelodyScorer& scorer;
    juce::String targetKey = "C Major";
    double totalDurationSeconds = 1200.0; // 20 minutes
    double totalElapsedSeconds = 0.0;
    bool isRunning = false;

    int currentSubPhaseIndex = 0;
    double subPhaseElapsedSeconds = 0.0;
    std::vector<RoutineSubPhase> subPhases;

    // Block 3 Take 1 results for targeted fix
    Melody take1Excerpt;
    std::vector<int> take1Mistakes;
    Melody targetedFixExercise;
    bool hasTargetedFixExercise = false;

    // Block 4 Flash Reading tracking
    bool flashPreviewActive = false;
    double flashCountdownRemaining = 10.0;
    std::set<int> completedFlashLines;

    RoutineStats stats;
    double lastBeatTimestamp = 0.0;
};

} // namespace MidiSheet
