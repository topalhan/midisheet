#include "MelodyScorer.h"
#include "MusicTheory.h"
#include <cmath>
#include <algorithm>

namespace MidiSheet
{

MelodyScorer::MelodyScorer()
{
    loadMelody("ode-to-joy");
}

void MelodyScorer::loadMelody(const juce::String& melodyId)
{
    const auto* found = MelodyDatabase::getMelodyById(melodyId);
    if (found != nullptr)
    {
        currentMelody = *found;
    }
    else
    {
        const auto& all = MelodyDatabase::getAllMelodies();
        if (!all.empty()) currentMelody = all[0];
    }
    currentBpm = (currentMelody.bpm > 0) ? currentMelody.bpm : 108.0;
    restart();
}

void MelodyScorer::setPracticeMode(PracticeMode mode)
{
    practiceMode = mode;
    restart();
}

void MelodyScorer::restart()
{
    currentNoteIndex = 0;
    finished = false;
    currentStreak = 0;
    maxStreak = 0;
    correctCount = 0;
    mistakeCount = 0;
    perfectCount = 0;
    greatCount = 0;
    missedCount = 0;
    rhythmPointsTotal = 0.0;

    songStartTimeSec = -1.0;
    lastNoteTimestampSec = -1.0;
    expectedCumulativeBeats = 0.0;

    lastFeedback = TimingFeedback();
    lastFeedback.text = "Ready - Play " + (currentMelody.notes.empty() ? "" : currentMelody.notes[0].name);

    noteEvaluations.clear();
    noteEvaluations.resize(currentMelody.notes.size());

    scorecard = PracticeScorecard();
    scorecard.totalNotes = static_cast<int>(currentMelody.notes.size());
    scorecard.pitchAccuracy = 100;
    scorecard.rhythmAccuracy = 100;
}

const MelodyNote* MelodyScorer::getCurrentTargetNote() const
{
    if (currentNoteIndex >= 0 && currentNoteIndex < static_cast<int>(currentMelody.notes.size()))
    {
        return &currentMelody.notes[static_cast<size_t>(currentNoteIndex)];
    }
    return nullptr;
}

bool MelodyScorer::evaluateNote(int midiNote, int velocity, double noteTimestampSec, double hostPpq)
{
    juce::ignoreUnused(velocity);

    if (finished || currentMelody.notes.empty())
        return false;

    const auto* target = getCurrentTargetNote();
    if (target == nullptr)
        return false;

    // Use monotonic high-resolution timestamp if not explicitly passed
    const double nowSec = (noteTimestampSec > 0.0)
        ? noteTimestampSec
        : (juce::Time::getMillisecondCounterHiRes() * 0.001);

    const double bpm = (currentMelody.bpm > 0) ? static_cast<double>(currentMelody.bpm) : currentBpm;
    const double beatDurationSec = 60.0 / bpm;

    if (midiNote == target->midi)
    {
        // Correct pitch struck!
        correctCount++;
        currentStreak++;
        maxStreak = std::max(maxStreak, currentStreak);

        // Rhythm timing evaluation
        double diffMs = 0.0;
        bool isTimingEvaluated = false;

        if (currentNoteIndex == 0)
        {
            // Note 0 initiates the phrase/song timing
            songStartTimeSec = nowSec;
            lastNoteTimestampSec = nowSec;
            expectedCumulativeBeats = target->duration;

            lastFeedback.rating = TimingRating::Perfect;
            lastFeedback.offsetMs = 0.0;
            lastFeedback.text = juce::String("Perfect (Start)");
            perfectCount++;
            rhythmPointsTotal += 100.0;
            isTimingEvaluated = true;
        }
        else if (practiceMode == PracticeMode::Tempo)
        {
            // In Tempo mode: lock to DAW playhead (PPQ) or internal song timeline
            if (hostPpq >= 0.0)
            {
                const double beatDiff = hostPpq - expectedCumulativeBeats;
                diffMs = beatDiff * beatDurationSec * 1000.0;
            }
            else if (songStartTimeSec > 0.0)
            {
                const double expectedTimeSec = songStartTimeSec + (expectedCumulativeBeats * beatDurationSec);
                diffMs = (nowSec - expectedTimeSec) * 1000.0;
            }
            isTimingEvaluated = true;
            expectedCumulativeBeats += target->duration;
            lastNoteTimestampSec = nowSec;
        }
        else
        {
            // In Wait mode: evaluate inter-onset duration from the previous note
            const size_t prevIdx = static_cast<size_t>(currentNoteIndex - 1);
            const float prevDurationBeats = currentMelody.notes[prevIdx].duration;
            const double expectedIntervalSec = static_cast<double>(prevDurationBeats) * beatDurationSec;

            if (lastNoteTimestampSec > 0.0)
            {
                const double actualIntervalSec = nowSec - lastNoteTimestampSec;
                diffMs = (actualIntervalSec - expectedIntervalSec) * 1000.0;
                isTimingEvaluated = true;
            }
            lastNoteTimestampSec = nowSec;
            expectedCumulativeBeats += target->duration;
        }

        if (isTimingEvaluated && currentNoteIndex > 0)
        {
            lastFeedback.offsetMs = diffMs;
            const double absDiff = std::abs(diffMs);

            if (absDiff <= 65.0)
            {
                // Tight on-tempo strike: <= 65ms
                lastFeedback.rating = TimingRating::Perfect;
                perfectCount++;
                rhythmPointsTotal += 100.0;
                lastFeedback.text = juce::String("Perfect (") + (diffMs >= 0 ? "+" : "") + juce::String(std::round(diffMs)) + "ms)";
            }
            else if (absDiff <= 150.0)
            {
                // Slightly early or late: 65ms to 150ms
                greatCount++;
                rhythmPointsTotal += 75.0;
                if (diffMs < 0.0)
                {
                    lastFeedback.rating = TimingRating::Early;
                    lastFeedback.text = juce::String("Early (") + juce::String(std::round(diffMs)) + "ms)";
                }
                else
                {
                    lastFeedback.rating = TimingRating::Late;
                    lastFeedback.text = juce::String("Late (+") + juce::String(std::round(diffMs)) + "ms)";
                }
            }
            else
            {
                // Dragging or rushed off-beat: > 150ms
                lastFeedback.rating = TimingRating::Missed;
                missedCount++;
                rhythmPointsTotal += 30.0;
                lastFeedback.text = juce::String("Off-beat (") + (diffMs >= 0 ? "+" : "") + juce::String(std::round(diffMs)) + "ms)";
            }
        }

        // Record completed note evaluation
        if (currentNoteIndex >= 0 && currentNoteIndex < static_cast<int>(noteEvaluations.size()))
        {
            auto& ev = noteEvaluations[static_cast<size_t>(currentNoteIndex)];
            ev.completed = true;
            ev.timing = lastFeedback.rating;
            ev.offsetMs = lastFeedback.offsetMs;
        }

        // Advance to next note and update dynamic live scoreboard
        currentNoteIndex++;
        calculateLiveScorecard();

        if (currentNoteIndex >= static_cast<int>(currentMelody.notes.size()))
        {
            finished = true;
            calculateFinalScorecard();
        }

        return true;
    }
    else
    {
        // Incorrect pitch struck
        const auto playedInfo = MusicTheory::getNoteInfo(midiNote);
        if (currentNoteIndex >= 0 && currentNoteIndex < static_cast<int>(noteEvaluations.size()))
        {
            auto& ev = noteEvaluations[static_cast<size_t>(currentNoteIndex)];
            ev.mistakeAttempts++;
            ev.lastWrongMidi = midiNote;
            ev.wrongNotesPlayed.push_back(midiNote);
        }

        mistakeCount++;
        currentStreak = 0;
        lastFeedback.rating = TimingRating::Missed;
        lastFeedback.offsetMs = 0.0;
        lastFeedback.text = "Played " + playedInfo.fullName + " (Expected " + target->name + ")";
        calculateLiveScorecard();
        return false;
    }
}

void MelodyScorer::calculateLiveScorecard()
{
    const int total = static_cast<int>(currentMelody.notes.size());
    scorecard.totalNotes = total;
    scorecard.correctNotes = correctCount;
    scorecard.mistakeCount = mistakeCount;
    scorecard.perfectHits = perfectCount;
    scorecard.greatHits = greatCount;
    scorecard.missedNotes = missedCount;
    scorecard.maxStreak = maxStreak;

    // Live pitch accuracy percentage
    const int totalAttempts = correctCount + mistakeCount;
    scorecard.pitchAccuracy = (totalAttempts > 0)
        ? std::clamp(static_cast<int>(std::round((static_cast<double>(correctCount) / totalAttempts) * 100.0)), 0, 100)
        : 100;

    // Live rhythm accuracy percentage based on actual scored notes
    const int scoredNotes = perfectCount + greatCount + missedCount;
    scorecard.rhythmAccuracy = (scoredNotes > 0)
        ? std::clamp(static_cast<int>(std::round(rhythmPointsTotal / static_cast<double>(scoredNotes))), 0, 100)
        : 100;

    // Real-time star rating calculation
    if (scorecard.pitchAccuracy >= 95 && scorecard.rhythmAccuracy >= 85)
        scorecard.stars = 3;
    else if (scorecard.pitchAccuracy >= 80 && scorecard.rhythmAccuracy >= 65)
        scorecard.stars = 2;
    else
        scorecard.stars = 1;
}

void MelodyScorer::calculateFinalScorecard()
{
    calculateLiveScorecard();
    scorecard.isCompleted = true;
}

} // namespace MidiSheet
