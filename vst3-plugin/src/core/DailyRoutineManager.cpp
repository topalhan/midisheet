#include "DailyRoutineManager.h"
#include "MusicTheory.h"
#include <cmath>
#include <algorithm>

namespace MidiSheet
{

struct KeyScaleDef
{
    int root = 60;
    std::vector<int> scale;
    bool preferFlats = false;
};

static KeyScaleDef getKeyScaleDef(const juce::String& keyName)
{
    if (keyName == "G Major")
        return { 55, { 0, 2, 4, 5, 7, 9, 11 }, false };
    if (keyName == "F Major")
        return { 53, { 0, 2, 4, 5, 7, 9, 11 }, true };
    if (keyName == "D Major")
        return { 62, { 0, 2, 4, 5, 7, 9, 11 }, false };
    if (keyName == "Bb Major")
        return { 58, { 0, 2, 4, 5, 7, 9, 11 }, true };
    if (keyName == "A Minor")
        return { 57, { 0, 2, 3, 5, 7, 8, 10 }, false };
    if (keyName == "D Minor")
        return { 62, { 0, 2, 3, 5, 7, 8, 10 }, true };

    // Default C Major
    return { 60, { 0, 2, 4, 5, 7, 9, 11 }, false };
}

Melody DailyRoutineManager::generateBrokenThirds(const juce::String& keyName, double bpm)
{
    const auto def = getKeyScaleDef(keyName);
    std::vector<int> fullScale;

    for (int oct = 0; oct < 2; ++oct)
    {
        for (int step : def.scale)
            fullScale.push_back(def.root + (oct * 12) + step);
    }
    fullScale.push_back(def.root + 24);

    const int rangeLen = std::min(9, static_cast<int>(fullScale.size()) - 2);
    std::vector<MelodyNote> notes;
    double curBeat = 0.0;

    // Ascending
    for (int i = 0; i < rangeLen; ++i)
    {
        const int n1 = fullScale[static_cast<size_t>(i)];
        const int n2 = fullScale[static_cast<size_t>(i + 2)];
        notes.push_back({ n1, 1.0f, MusicTheory::getNoteInfo(n1, def.preferFlats).fullName, curBeat });
        curBeat += 1.0;
        notes.push_back({ n2, 1.0f, MusicTheory::getNoteInfo(n2, def.preferFlats).fullName, curBeat });
        curBeat += 1.0;
    }
    const int peak = fullScale[static_cast<size_t>(rangeLen)];
    notes.push_back({ peak, 2.0f, MusicTheory::getNoteInfo(peak, def.preferFlats).fullName, curBeat });
    curBeat += 2.0;

    // Descending
    for (int i = rangeLen; i >= 2; --i)
    {
        const int n1 = fullScale[static_cast<size_t>(i)];
        const int n2 = fullScale[static_cast<size_t>(i - 2)];
        notes.push_back({ n1, 1.0f, MusicTheory::getNoteInfo(n1, def.preferFlats).fullName, curBeat });
        curBeat += 1.0;
        notes.push_back({ n2, 1.0f, MusicTheory::getNoteInfo(n2, def.preferFlats).fullName, curBeat });
        curBeat += 1.0;
    }
    const int rootN = fullScale[0];
    notes.push_back({ rootN, 2.0f, MusicTheory::getNoteInfo(rootN, def.preferFlats).fullName, curBeat });

    Melody m;
    m.id = "routine-thirds-" + keyName.toLowerCase().replaceCharacters(" ", "-");
    m.title = "Klose Diatonic Thirds (" + keyName + ")";
    m.composer = "H. Klose / Daily Routine";
    m.difficulty = "Daily Routine";
    m.bpm = static_cast<int>(bpm);
    m.timeSigNum = 4;
    m.timeSigDen = 4;
    m.timeSignature = { 4, 4 };
    m.key = keyName;
    m.description = "Slur smoothly with continuous sound. Feel tactile interval shifts.";
    m.notes = std::move(notes);
    return m;
}

Melody DailyRoutineManager::getAwkwardPairs(const juce::String& keyName)
{
    const bool isFlat = keyName.contains("F") || keyName.contains("Bb") || keyName.contains("D Minor");
    Melody m;
    m.id = "routine-awkward-pairs";
    m.title = "Isolated Awkward Pairs (Tactile Execution)";
    m.composer = "Mechanical Calibration";
    m.difficulty = "Block 1";
    m.bpm = 60;
    m.timeSigNum = 4;
    m.timeSigDen = 4;
    m.timeSignature = { 4, 4 };
    m.key = keyName;
    m.description = "Slur slowly at 60 BPM. Zero hand tension. Unified block finger lifts.";

    m.notes = {
        { 62, 2.0f, "D4", 0.0 }, { 65, 2.0f, "F4", 2.0 },
        { 62, 1.0f, "D4", 4.0 }, { 65, 1.0f, "F4", 5.0 }, { 62, 2.0f, "D4", 6.0 },

        { 59, 2.0f, "B3", 8.0 }, { 60, 2.0f, "C4", 10.0 },
        { 59, 1.0f, "B3", 12.0 }, { 60, 1.0f, "C4", 13.0 }, { 59, 2.0f, "B3", 14.0 },

        { 69, 2.0f, "A4", 16.0 }, { 71, 2.0f, "B4", 18.0 },
        { 69, 1.0f, "A4", 20.0 }, { 71, 1.0f, "B4", 21.0 }, { 69, 2.0f, "A4", 22.0 },

        { 60, 2.0f, "C4", 24.0 }, { 63, 2.0f, isFlat ? "Eb4" : "D#4", 26.0 },
        { 60, 1.0f, "C4", 28.0 }, { 63, 1.0f, isFlat ? "Eb4" : "D#4", 29.0 }, { 60, 2.0f, "C4", 30.0 }
    };
    return m;
}

Melody DailyRoutineManager::getSightReadingExcerpt(const juce::String& keyName)
{
    Melody m;
    m.id = "sr-excerpt-" + keyName.toLowerCase().replaceCharacters(" ", "-");
    m.difficulty = "Grade 2";
    m.timeSigNum = 4;
    m.timeSigDen = 4;
    m.timeSignature = { 4, 4 };
    m.key = keyName;

    if (keyName == "G Major")
    {
        m.title = "Morning Air in G";
        m.composer = "Sight-Reading Excerpt";
        m.bpm = 92;
        m.timeSigNum = 3;
        m.timeSignature = { 3, 4 };
        m.description = "Graceful 3/4 waltz movement featuring the F#4 leading tone.";
        m.notes = {
            { 67, 1.0f, "G4", 0.0 }, { 71, 1.0f, "B4", 1.0 }, { 74, 1.0f, "D5", 2.0 },
            { 72, 1.5f, "C5", 3.0 }, { 71, 0.5f, "B4", 4.5 }, { 69, 1.0f, "A4", 5.0 },
            { 66, 1.0f, "F#4", 6.0 }, { 67, 2.0f, "G4", 7.0 }
        };
    }
    else if (keyName == "F Major")
    {
        m.title = "Riverside Promenade in F";
        m.composer = "Sight-Reading Excerpt";
        m.bpm = 88;
        m.description = "Arching lyrical phrase featuring key signature Bb4.";
        m.notes = {
            { 65, 1.0f, "F4", 0.0 }, { 69, 1.0f, "A4", 1.0 }, { 70, 1.5f, "Bb4", 2.0 },
            { 69, 0.5f, "A4", 3.5 }, { 67, 2.0f, "G4", 4.0 }, { 65, 2.0f, "F4", 6.0 },
            { 64, 1.0f, "E4", 8.0 }, { 65, 3.0f, "F4", 9.0 }
        };
    }
    else
    {
        m.title = "Pastoral Promenade in C";
        m.composer = "Sight-Reading Excerpt";
        m.bpm = 96;
        m.description = "Lyrical stepping line with broken thirds and measure 3 downbeat leap.";
        m.notes = {
            { 60, 1.0f, "C4", 0.0 }, { 64, 1.0f, "E4", 1.0 }, { 62, 1.0f, "D4", 2.0 }, { 65, 1.0f, "F4", 3.0 },
            { 64, 2.0f, "E4", 4.0 }, { 67, 2.0f, "G4", 6.0 }, { 65, 1.0f, "F4", 8.0 }, { 64, 1.0f, "E4", 9.0 },
            { 62, 1.0f, "D4", 10.0 }, { 60, 1.0f, "C4", 11.0 }, { 67, 2.0f, "G4", 12.0 }, { 60, 2.0f, "C4", 14.0 }
        };
    }
    return m;
}

std::vector<Melody> DailyRoutineManager::getFlashReadingLines(const juce::String& keyName)
{
    std::vector<Melody> lines(3);

    // Line 1: Stepping scales
    lines[0].id = "flash-line-1";
    lines[0].title = "Flash Line 1: Stepping Motion";
    lines[0].composer = "Volume Flash Reading";
    lines[0].difficulty = "Very Easy";
    lines[0].bpm = 108;
    lines[0].timeSigNum = 4;
    lines[0].timeSignature = { 4, 4 };
    lines[0].key = keyName;
    lines[0].description = "Stepwise motion: 10s flash scan, play straight through once.";
    lines[0].notes = {
        { 60, 1.0f, "C4", 0.0 }, { 62, 1.0f, "D4", 1.0 }, { 64, 1.0f, "E4", 2.0 }, { 65, 1.0f, "F4", 3.0 },
        { 67, 2.0f, "G4", 4.0 }, { 65, 1.0f, "F4", 6.0 }, { 64, 1.0f, "E4", 7.0 }, { 62, 2.0f, "D4", 8.0 },
        { 60, 2.0f, "C4", 10.0 }
    };

    // Line 2: Broken arpeggio
    lines[1].id = "flash-line-2";
    lines[1].title = "Flash Line 2: Triad Skips";
    lines[1].composer = "Volume Flash Reading";
    lines[1].difficulty = "Very Easy";
    lines[1].bpm = 108;
    lines[1].timeSigNum = 4;
    lines[1].timeSignature = { 4, 4 };
    lines[1].key = keyName;
    lines[1].description = "Tonic skips: 10s scan, brisk tempo.";
    lines[1].notes = {
        { 60, 1.0f, "C4", 0.0 }, { 64, 1.0f, "E4", 1.0 }, { 67, 2.0f, "G4", 2.0 },
        { 64, 1.0f, "E4", 4.0 }, { 60, 1.0f, "C4", 5.0 }, { 62, 2.0f, "D4", 6.0 },
        { 60, 4.0f, "C4", 8.0 }
    };

    // Line 3: Repeated cadence
    lines[2].id = "flash-line-3";
    lines[2].title = "Flash Line 3: Repeated Rhythm Accent";
    lines[2].composer = "Volume Flash Reading";
    lines[2].difficulty = "Very Easy";
    lines[2].bpm = 112;
    lines[2].timeSigNum = 4;
    lines[2].timeSignature = { 4, 4 };
    lines[2].key = keyName;
    lines[2].description = "Rhythmic focus: 10s scan, single play lockout!";
    lines[2].notes = {
        { 64, 1.0f, "E4", 0.0 }, { 64, 1.0f, "E4", 1.0 }, { 65, 1.0f, "F4", 2.0 }, { 67, 1.0f, "G4", 3.0 },
        { 67, 1.0f, "G4", 4.0 }, { 65, 1.0f, "F4", 5.0 }, { 64, 2.0f, "E4", 6.0 }, { 62, 2.0f, "D4", 8.0 },
        { 60, 2.0f, "C4", 10.0 }
    };

    return lines;
}

DailyRoutineManager::DailyRoutineManager(MelodyScorer& s)
    : scorer(s)
{
    stats.streak = getStreak();
    buildPlan();
}

void DailyRoutineManager::setTargetKey(const juce::String& keyName)
{
    targetKey = keyName;
    if (!isRunning)
    {
        buildPlan();
        loadSubPhase(0);
    }
}

void DailyRoutineManager::buildPlan()
{
    subPhases.clear();
    const auto excerpt = getSightReadingExcerpt(targetKey);
    take1Excerpt = excerpt;
    const auto flashLines = getFlashReadingLines(targetKey);

    // Block 1
    subPhases.push_back({ "block1_awkward", 1, "Block 1: Mechanical Calibration",
                          "Part 1: Isolated Awkward Pairs (60 BPM)", 120.0, 60.0, "awkward",
                          "Muscle memory & awkward intervals. Slur slowly at 60 BPM. Zero hand tension. Tactile execution.",
                          false, true, false, false, false, 0.0, 0, getAwkwardPairs(targetKey) });

    subPhases.push_back({ "block1_thirds", 1, "Block 1: Mechanical Calibration",
                          "Part 2: Diatonic Broken Thirds (Klose Intervals)", 180.0, 76.0, "thirds",
                          "Klose diatonic broken thirds in " + targetKey + ". Continuous sound and smooth physical transitions.",
                          false, true, false, false, false, 0.0, 0, generateBrokenThirds(targetKey, 76.0) });

    // Block 2
    subPhases.push_back({ "block2_rhythm", 2, "Block 2: Pre-Flight Analysis",
                          "Part 1: Rhythm Tap & Subdivision (Paul Harris)", 120.0, static_cast<double>(excerpt.bpm), "rhythm_tap",
                          "Synth audio is MUTED. Metronome is clicking. Tap rhythm along (Spacebar) and vocalize subdivisions aloud.",
                          false, false, false, true, true, 0.0, 0, excerpt });

    subPhases.push_back({ "block2_audit", 2, "Block 2: Pre-Flight Analysis",
                          "Part 2: Visual Interval Audit & Ghost-Fingering", 180.0, static_cast<double>(excerpt.bpm), "audit",
                          "Trace melodic contour across the staff. Do NOT name note letters. Silently pre-finger keys on instrument.",
                          false, true, false, true, false, 0.0, 0, excerpt });

    // Block 3
    subPhases.push_back({ "block3_take1", 3, "Block 3: The Cold Sight-Read",
                          "Take 1: Cold Strict Sight-Read (No Stopping!)", 150.0, static_cast<double>(excerpt.bpm), "take1",
                          "Strict execution with metronome: Never stop! Recover immediately on downbeats for bonus recovery points.",
                          true, false, false, false, false, 0.0, 0, excerpt });

    subPhases.push_back({ "block3_fix", 3, "Block 3: The Cold Sight-Read",
                          "Targeted Fix: Isolate & Loop Stumbling Measure", 120.0, std::max(60.0, excerpt.bpm - 16.0), "targeted_fix",
                          "Isolating stumbling measure from Take 1. Loop repeatedly at steady tempo until hesitation vanishes.",
                          false, false, false, false, false, 0.0, 0, {} });

    subPhases.push_back({ "block3_take2", 3, "Block 3: The Cold Sight-Read",
                          "Take 2: Buffered Read (Eye-Ahead Lookahead)", 150.0, static_cast<double>(excerpt.bpm), "take2",
                          "Lookahead buffer active: Push your eyes 1 full measure ahead of the playhead. Feed working memory.",
                          true, false, true, false, false, 0.0, 0, excerpt });

    // Block 4
    subPhases.push_back({ "block4_flash1", 4, "Block 4: Volume Flash Reading",
                          "Line 1 of 3: 10s Flash Scan -> Single Play", 60.0, static_cast<double>(flashLines[0].bpm), "flash",
                          "Scan 4-bar line for 10 seconds. Play ONCE at tempo. Single-play lockout rule enforced!",
                          true, false, false, false, false, 10.0, 0, flashLines[0] });

    subPhases.push_back({ "block4_flash2", 4, "Block 4: Volume Flash Reading",
                          "Line 2 of 3: 10s Flash Scan -> Single Play", 60.0, static_cast<double>(flashLines[1].bpm), "flash",
                          "Second flash line! 10s scan preview -> One brisk playthrough.",
                          true, false, false, false, false, 10.0, 1, flashLines[1] });

    subPhases.push_back({ "block4_flash3", 4, "Block 4: Volume Flash Reading",
                          "Line 3 of 3: 10s Flash Scan -> Single Play", 60.0, static_cast<double>(flashLines[2].bpm), "flash",
                          "Final flash line! Lock in automatic sight-reading reflexes. Scan 10s -> Play cleanly once.",
                          true, false, false, false, false, 10.0, 2, flashLines[2] });
}

void DailyRoutineManager::startOrResume()
{
    if (isRunning) return;
    isRunning = true;
    loadSubPhase(currentSubPhaseIndex);
}

void DailyRoutineManager::pause()
{
    isRunning = false;
    if (onSynthMuteChanged) onSynthMuteChanged(false);
}

void DailyRoutineManager::togglePlay()
{
    if (isRunning)
        pause();
    else
        startOrResume();
}

void DailyRoutineManager::reset()
{
    pause();
    totalElapsedSeconds = 0.0;
    currentSubPhaseIndex = 0;
    subPhaseElapsedSeconds = 0.0;
    flashPreviewActive = false;
    completedFlashLines.clear();
    take1Mistakes.clear();
    hasTargetedFixExercise = false;
    stats = RoutineStats();
    stats.streak = getStreak();
    buildPlan();
    loadSubPhase(0);
}

void DailyRoutineManager::skipSubPhase()
{
    if (currentSubPhaseIndex < static_cast<int>(subPhases.size()) - 1)
    {
        currentSubPhaseIndex++;
        subPhaseElapsedSeconds = 0.0;
        loadSubPhase(currentSubPhaseIndex);
    }
    else
    {
        finishRoutine();
    }
}

void DailyRoutineManager::prevSubPhase()
{
    if (currentSubPhaseIndex > 0)
    {
        currentSubPhaseIndex--;
        subPhaseElapsedSeconds = 0.0;
        loadSubPhase(currentSubPhaseIndex);
    }
}

void DailyRoutineManager::loadSubPhase(int index)
{
    if (index < 0 || index >= static_cast<int>(subPhases.size())) return;
    currentSubPhaseIndex = index;
    subPhaseElapsedSeconds = 0.0;
    auto& phase = subPhases[static_cast<size_t>(index)];

    if (phase.type == "targeted_fix")
    {
        if (!hasTargetedFixExercise)
        {
            targetedFixExercise = buildTargetedFixExercise();
            hasTargetedFixExercise = true;
        }
        phase.exercise = targetedFixExercise;
    }

    if (onSynthMuteChanged)
        onSynthMuteChanged(phase.audioMuted);

    if (onLookaheadChanged)
        onLookaheadChanged(phase.lookahead);

    scorer.loadMelodyObject(phase.exercise);
    scorer.setBpm(phase.bpm);

    if (phase.strictMode)
        scorer.setPracticeMode(PracticeMode::StrictTime);
    else if (phase.waitMode)
        scorer.setPracticeMode(PracticeMode::Wait);
    else
        scorer.setPracticeMode(PracticeMode::Tempo);

    if (phase.type == "flash")
    {
        flashPreviewActive = true;
        flashCountdownRemaining = phase.flashPreviewSeconds > 0.0 ? phase.flashPreviewSeconds : 10.0;
    }
    else
    {
        flashPreviewActive = false;
    }

    if (onPhaseChanged)
        onPhaseChanged(phase);
}

Melody DailyRoutineManager::buildTargetedFixExercise()
{
    const auto base = take1Excerpt;
    const int beatsPerMeasure = base.timeSignature.numerator > 0 ? base.timeSignature.numerator : 4;
    const auto& notes = base.notes;

    int targetMeasure = 0;
    if (!take1Mistakes.empty() && take1Mistakes[0] >= 0 && take1Mistakes[0] < static_cast<int>(notes.size()))
    {
        targetMeasure = static_cast<int>(std::floor(notes[static_cast<size_t>(take1Mistakes[0])].startBeat / beatsPerMeasure));
    }
    else
    {
        int maxJump = 0;
        for (size_t i = 0; i + 1 < notes.size(); ++i)
        {
            const int jump = std::abs(notes[i + 1].midi - notes[i].midi);
            if (jump > maxJump)
            {
                maxJump = jump;
                targetMeasure = static_cast<int>(std::floor(notes[i].startBeat / beatsPerMeasure));
            }
        }
    }

    std::vector<MelodyNote> mNotes;
    for (const auto& n : notes)
    {
        const int m = static_cast<int>(std::floor(n.startBeat / beatsPerMeasure));
        if (m == targetMeasure)
            mNotes.push_back(n);
    }
    if (mNotes.empty())
        mNotes.assign(notes.begin(), notes.begin() + std::min<size_t>(4, notes.size()));

    std::vector<MelodyNote> looped;
    double b = 0.0;
    for (int l = 0; l < 3; ++l)
    {
        for (auto n : mNotes)
        {
            n.startBeat = b;
            b += n.duration;
            looped.push_back(n);
        }
    }

    Melody out;
    out.id = "targeted-fix-m" + juce::String(targetMeasure + 1);
    out.title = "Targeted Fix: Measure " + juce::String(targetMeasure + 1) + " Isolation (Looped)";
    out.composer = "Deliberate Practice Loop";
    out.difficulty = "Targeted Fix";
    out.bpm = std::max(60, static_cast<int>(base.bpm - 16));
    out.timeSigNum = base.timeSigNum;
    out.timeSigDen = base.timeSigDen;
    out.timeSignature = base.timeSignature;
    out.key = base.key;
    out.description = "Measure " + juce::String(targetMeasure + 1) + " isolated. Loop smoothly with zero hesitation.";
    out.notes = std::move(looped);
    return out;
}

void DailyRoutineManager::advanceTime(double dt)
{
    if (!isRunning) return;

    totalElapsedSeconds += dt;
    subPhaseElapsedSeconds += dt;

    if (currentSubPhaseIndex >= 0 && currentSubPhaseIndex < static_cast<int>(subPhases.size()))
    {
        auto& phase = subPhases[static_cast<size_t>(currentSubPhaseIndex)];

        if (flashPreviewActive)
        {
            flashCountdownRemaining -= dt;
            if (onFlashCountdown)
                onFlashCountdown(std::max(0, static_cast<int>(std::ceil(flashCountdownRemaining))));

            if (flashCountdownRemaining <= 0.0)
            {
                flashPreviewActive = false;
                scorer.restart();
            }
        }

        if (subPhaseElapsedSeconds >= phase.durationSeconds)
        {
            skipSubPhase();
            return;
        }
    }

    if (totalElapsedSeconds >= totalDurationSeconds)
    {
        finishRoutine();
        return;
    }

    if (onTick)
        onTick(getProgress());
}

RoutineProgress DailyRoutineManager::getProgress() const
{
    RoutineProgress p;
    p.currentPhase = getCurrentPhase();
    p.phaseIndex = currentSubPhaseIndex;
    p.totalPhases = static_cast<int>(subPhases.size());
    p.phaseElapsedSeconds = subPhaseElapsedSeconds;
    p.phaseRemainingSeconds = (p.currentPhase != nullptr) ? std::max(0.0, p.currentPhase->durationSeconds - subPhaseElapsedSeconds) : 0.0;
    p.totalElapsedSeconds = totalElapsedSeconds;
    p.totalDurationSeconds = totalDurationSeconds;
    p.percentTotal = static_cast<int>(std::clamp((totalElapsedSeconds / totalDurationSeconds) * 100.0, 0.0, 100.0));
    p.isRunning = isRunning;
    p.targetKey = targetKey;
    p.flashPreviewActive = flashPreviewActive;
    p.flashCountdownSeconds = static_cast<int>(std::ceil(flashCountdownRemaining));
    p.streak = stats.streak;
    return p;
}

const RoutineSubPhase* DailyRoutineManager::getCurrentPhase() const
{
    if (currentSubPhaseIndex >= 0 && currentSubPhaseIndex < static_cast<int>(subPhases.size()))
        return &subPhases[static_cast<size_t>(currentSubPhaseIndex)];
    return nullptr;
}

TimingFeedback DailyRoutineManager::registerRhythmTap(double nowSec)
{
    const auto* phase = getCurrentPhase();
    TimingFeedback fb;
    if (phase == nullptr || phase->type != "rhythm_tap") return fb;

    const double beatDuration = 60.0 / phase->bpm;
    double offsetSec = 0.0;

    if (lastBeatTimestamp > 0.0)
    {
        const double delta = nowSec - lastBeatTimestamp;
        const double mod = std::fmod(delta, beatDuration);
        offsetSec = (mod < beatDuration * 0.5) ? mod : (mod - beatDuration);
    }

    const double offsetMs = offsetSec * 1000.0;
    const double absMs = std::abs(offsetMs);

    fb.offsetMs = offsetMs;
    stats.totalTaps++;

    if (absMs <= 50.0)
    {
        fb.rating = TimingRating::Perfect;
        fb.text = "Perfect Beat! 🎯";
        stats.goodTaps++;
    }
    else if (absMs <= 120.0)
    {
        fb.rating = (offsetMs < 0.0) ? TimingRating::Early : TimingRating::Late;
        fb.text = (offsetMs < 0.0) ? ("Early (" + juce::String(std::round(offsetMs)) + "ms)")
                                   : ("Late (+" + juce::String(std::round(offsetMs)) + "ms)");
        stats.goodTaps++;
    }
    else
    {
        fb.rating = TimingRating::Missed;
        fb.text = "Offbeat (" + juce::String(std::round(offsetMs)) + "ms)";
    }

    if (onTapFeedback)
        onTapFeedback(fb);

    return fb;
}

void DailyRoutineManager::onMelodyCompleted(const PracticeScorecard& scorecard)
{
    stats.notesPlayed += scorecard.totalNotes;
    stats.correctNotes += scorecard.correctNotes;
    stats.recoveries += scorecard.recoveries;
    stats.recoveryPoints += scorecard.recoveryPoints;

    const auto* phase = getCurrentPhase();
    if (phase == nullptr) return;

    if (phase->type == "take1")
    {
        take1Mistakes = scorer.getMistakeIndices();
        hasTargetedFixExercise = false;
        skipSubPhase();
    }
    else if (phase->type == "flash")
    {
        completedFlashLines.insert(phase->flashLineIndex);
        skipSubPhase();
    }
    else if (phase->type == "targeted_fix")
    {
        if (subPhaseElapsedSeconds < phase->durationSeconds - 5.0)
        {
            scorer.restart();
        }
    }
}

void DailyRoutineManager::finishRoutine()
{
    pause();
    totalElapsedSeconds = totalDurationSeconds;
    stats.streak = incrementStreak();

    if (onRoutineCompleted)
        onRoutineCompleted(stats);
}

int DailyRoutineManager::getStreak() const
{
    const auto appData = juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory).getChildFile("MidiSheet");
    const auto file = appData.getChildFile("routine_streak.txt");
    if (file.existsAsFile())
    {
        const auto text = file.loadFileAsString().trim();
        return text.getIntValue();
    }
    return 0;
}

int DailyRoutineManager::incrementStreak()
{
    const auto appData = juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory).getChildFile("MidiSheet");
    if (!appData.exists())
        appData.createDirectory();

    const auto file = appData.getChildFile("routine_streak.txt");
    int s = getStreak() + 1;
    file.replaceWithText(juce::String(s));
    return s;
}

} // namespace MidiSheet
