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

void MelodyScorer::loadMelodyObject(const Melody& melody)
{
    currentMelody = melody;
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
    recoveriesCount = 0;
    recoveryPointsTotal = 0;
    rhythmPointsTotal = 0.0;

    songStartTimeSec = -1.0;
    songStartPpq = -1.0;
    lastNoteTimestampSec = -1.0;
    lastProcessTimeSec = -1.0;
    countInStartTimeSec = -1.0;
    countInStartPpq = -1.0;
    countInElapsedBeats = 0.0;
    expectedCumulativeBeats = 0.0;
    currentPlayheadBeats = 0.0;
    hadRecentMissOrMistake = false;

    if (practiceMode == PracticeMode::FirstRead)
    {
        startSilentAnalysis(30.0);
    }
    else if (isTimeDrivenMode())
    {
        startCountIn(4);
    }
    else
    {
        isAnalyzing = false;
        analysisSecondsRemaining = 0.0;
        isCountingIn = false;
        countInBeat = 0;
    }

    lastFeedback = TimingFeedback();
    lastFeedback.text = "Ready - Play " + (currentMelody.notes.empty() ? "" : currentMelody.notes[0].name);

    noteEvaluations.clear();
    noteEvaluations.resize(currentMelody.notes.size());

    scorecard = PracticeScorecard();
    scorecard.totalNotes = static_cast<int>(currentMelody.notes.size());
    scorecard.pitchAccuracy = 100;
    scorecard.rhythmAccuracy = 100;
    scorecard.sightReadingScore = 100;
}

const MelodyNote* MelodyScorer::getCurrentTargetNote() const
{
    if (currentNoteIndex >= 0 && currentNoteIndex < static_cast<int>(currentMelody.notes.size()))
    {
        return &currentMelody.notes[static_cast<size_t>(currentNoteIndex)];
    }
    return nullptr;
}

void MelodyScorer::startSilentAnalysis(double durationSeconds)
{
    isAnalyzing = true;
    analysisSecondsRemaining = durationSeconds;
    analysisTotalSeconds = durationSeconds;
    isCountingIn = false;
    countInBeat = 0;
    countInStartTimeSec = -1.0;
    countInStartPpq = -1.0;
    countInElapsedBeats = 0.0;
    songStartTimeSec = -1.0;
    songStartPpq = -1.0;
    currentPlayheadBeats = 0.0;
}

void MelodyScorer::startCountIn(int totalBeats)
{
    isCountingIn = true;
    countInTotal = (totalBeats > 0) ? totalBeats : ((currentMelody.timeSignature.numerator > 0) ? currentMelody.timeSignature.numerator : 4);
    countInBeat = 1;
    countInStartTimeSec = -1.0;
    countInStartPpq = -1.0;
    countInElapsedBeats = 0.0;
    songStartTimeSec = -1.0;
    songStartPpq = -1.0;
    currentPlayheadBeats = 0.0;
}

void MelodyScorer::triggerHostTransportStart()
{
    if (finished || !isTimeDrivenMode())
        return;

    // Do not disrupt silent analysis if in progress
    if (isAnalyzing)
        return;

    startCountIn(4);
}

void MelodyScorer::updateSilentAnalysis(double elapsedSeconds)
{
    if (!isAnalyzing) return;
    analysisSecondsRemaining = std::max(0.0, analysisSecondsRemaining - elapsedSeconds);
    if (analysisSecondsRemaining <= 0.0)
    {
        skipSilentAnalysis();
    }
}

void MelodyScorer::skipSilentAnalysis()
{
    isAnalyzing = false;
    analysisSecondsRemaining = 0.0;
    startCountIn(4);
    if (onSilentAnalysisComplete)
        onSilentAnalysisComplete();
}

bool MelodyScorer::isMelodyFirstReadLocked(const juce::String& melodyId) const
{
    return firstReadRecords.find(melodyId) != firstReadRecords.end();
}

void MelodyScorer::recordFirstReadResult(const FirstReadRecord& record)
{
    firstReadRecords[record.melodyId] = record;
}

void MelodyScorer::resetFirstReadLockouts()
{
    firstReadRecords.clear();
}

void MelodyScorer::processTime(double currentSongBeats, double nowSec)
{
    if (finished || !isTimeDrivenMode())
        return;

    const double bpm = (currentMelody.bpm > 0) ? static_cast<double>(currentMelody.bpm) : currentBpm;
    const double beatDurationSec = 60.0 / bpm;

    if (lastProcessTimeSec <= 0.0)
    {
        lastProcessTimeSec = nowSec;
        return;
    }
    const double dt = std::max(0.0, nowSec - lastProcessTimeSec);
    lastProcessTimeSec = nowSec;

    // 1. Silent Analysis phase (First-Read mode)
    if (isAnalyzing)
    {
        analysisSecondsRemaining = std::max(0.0, analysisSecondsRemaining - dt);
        if (analysisSecondsRemaining <= 0.0)
        {
            skipSilentAnalysis();
        }
        return;
    }

    // 2. Count-In phase (StrictTime, Tempo, and after Silent Analysis in FirstRead)
    if (isCountingIn)
    {
        if (currentSongBeats >= 0.0)
        {
            // Host transport is playing: sample-accurately quantize count-in to host PPQ grid
            if (countInStartPpq < 0.0)
            {
                countInStartPpq = std::ceil(currentSongBeats);
                countInStartTimeSec = nowSec;
            }

            if (currentSongBeats < countInStartPpq)
            {
                // Pre-roll: waiting for the upcoming downbeat / integer beat
                countInElapsedBeats = 0.0;
                countInBeat = 1;
            }
            else
            {
                countInElapsedBeats = currentSongBeats - countInStartPpq;
                countInBeat = std::min(countInTotal, 1 + static_cast<int>(std::floor(countInElapsedBeats)));

                if (countInElapsedBeats >= static_cast<double>(countInTotal))
                {
                    // Count-in finished! Exact zero-offset downbeat handoff to Measure 1 Beat 1 on host grid
                    isCountingIn = false;
                    countInBeat = 0;
                    songStartPpq = countInStartPpq + static_cast<double>(countInTotal);
                    songStartTimeSec = nowSec;
                    currentPlayheadBeats = std::max(0.0, currentSongBeats - songStartPpq);
                }
            }
            return;
        }

        // Host is not playing: fallback to smooth high-precision monotonic clock
        if (countInStartTimeSec <= 0.0)
        {
            countInStartTimeSec = nowSec;
            countInElapsedBeats = 0.0;
            countInBeat = 1;
        }
        else
        {
            countInElapsedBeats = std::max(0.0, (nowSec - countInStartTimeSec) / beatDurationSec);
            countInBeat = std::min(countInTotal, 1 + static_cast<int>(std::floor(countInElapsedBeats)));

            if (countInElapsedBeats >= static_cast<double>(countInTotal))
            {
                // Count-in finished! Exact zero-offset downbeat handoff to Measure 1 Beat 1
                isCountingIn = false;
                countInBeat = 0;
                songStartTimeSec = countInStartTimeSec + (countInTotal * beatDurationSec);
                currentPlayheadBeats = std::max(0.0, (nowSec - songStartTimeSec) / beatDurationSec);
            }
        }
        return;
    }

    // 3. Active Playback phase
    if (currentSongBeats >= 0.0)
    {
        if (songStartPpq < 0.0)
            songStartPpq = currentSongBeats;
        currentPlayheadBeats = std::max(0.0, currentSongBeats - songStartPpq);
    }
    else if (songStartTimeSec > 0.0)
    {
        const double elapsedSec = std::max(0.0, nowSec - songStartTimeSec);
        currentPlayheadBeats = elapsedSec / beatDurationSec;
    }
    else
    {
        songStartTimeSec = nowSec;
        currentPlayheadBeats = 0.0;
    }

    // Multi-note expiration loop: auto-advance elapsed notes in strict sight-reading
    while (currentNoteIndex < static_cast<int>(currentMelody.notes.size()))
    {
        const auto& target = currentMelody.notes[static_cast<size_t>(currentNoteIndex)];
        const double noteDurationBeats = target.duration;
        const double graceBeats = std::min(0.35, noteDurationBeats * 0.40);
        const double expiryBeat = target.startBeat + noteDurationBeats + graceBeats;

        if (currentPlayheadBeats > expiryBeat)
        {
            if (currentNoteIndex >= 0 && currentNoteIndex < static_cast<int>(noteEvaluations.size()))
            {
                auto& ev = noteEvaluations[static_cast<size_t>(currentNoteIndex)];
                if (!ev.completed)
                {
                    ev.completed = true;
                    ev.timing = TimingRating::Missed;
                    missedCount++;
                    currentStreak = 0;
                    hadRecentMissOrMistake = true;

                    lastFeedback.rating = TimingRating::Missed;
                    lastFeedback.text = juce::String::fromUTF8("\xF0\x9F\x94\xB4 Missed");
                }
            }
            advanceToNextNote();
        }
        else
        {
            break;
        }
    }
}

void MelodyScorer::advanceToNextNote()
{
    currentNoteIndex++;
    calculateLiveScorecard();

    if (currentNoteIndex >= static_cast<int>(currentMelody.notes.size()))
    {
        finished = true;
        calculateFinalScorecard();
    }
}

bool MelodyScorer::evaluateNote(int midiNote, int velocity, double noteTimestampSec, double hostPpq)
{
    juce::ignoreUnused(velocity);

    if (finished || currentMelody.notes.empty() || isAnalyzing || isCountingIn)
        return false;

    const auto* target = getCurrentTargetNote();
    if (target == nullptr)
        return false;

    const double nowSec = (noteTimestampSec > 0.0)
        ? noteTimestampSec
        : (juce::Time::getMillisecondCounterHiRes() * 0.001);

    const double bpm = (currentMelody.bpm > 0) ? static_cast<double>(currentMelody.bpm) : currentBpm;
    const double beatDurationSec = 60.0 / bpm;

    // Rhythm timing calculation
    double diffMs = 0.0;
    bool isTimingEvaluated = false;

    if (currentNoteIndex == 0)
    {
        if (practiceMode == PracticeMode::Wait)
        {
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
        else
        {
            // In time-driven modes: note 0 is locked to songStartPpq or songStartTimeSec
            if (hostPpq >= 0.0)
            {
                if (songStartPpq < 0.0)
                    songStartPpq = hostPpq;
                const double relativePpq = hostPpq - songStartPpq;
                const double beatDiff = relativePpq - target->startBeat;
                diffMs = beatDiff * beatDurationSec * 1000.0;
            }
            else
            {
                if (songStartTimeSec <= 0.0)
                    songStartTimeSec = nowSec;

                const double expectedTimeSec = songStartTimeSec + (target->startBeat * beatDurationSec);
                diffMs = (nowSec - expectedTimeSec) * 1000.0;
            }
            isTimingEvaluated = true;
            expectedCumulativeBeats = target->duration;
            lastNoteTimestampSec = nowSec;
        }
    }
    else if (isTimeDrivenMode())
    {
        if (hostPpq >= 0.0)
        {
            if (songStartPpq < 0.0)
                songStartPpq = hostPpq;
            const double relativePpq = hostPpq - songStartPpq;
            const double beatDiff = relativePpq - target->startBeat;
            diffMs = beatDiff * beatDurationSec * 1000.0;
        }
        else
        {
            if (songStartTimeSec <= 0.0)
                songStartTimeSec = nowSec;

            const double expectedTimeSec = songStartTimeSec + (target->startBeat * beatDurationSec);
            diffMs = (nowSec - expectedTimeSec) * 1000.0;
        }
        isTimingEvaluated = true;
        expectedCumulativeBeats += target->duration;
        lastNoteTimestampSec = nowSec;
    }
    else
    {
        // In Wait mode: evaluate inter-onset duration from previous note
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

    if (isTimingEvaluated)
    {
        if (practiceMode != PracticeMode::Wait || currentNoteIndex > 0)
        {
            lastFeedback.offsetMs = diffMs;
            const double absDiff = std::abs(diffMs);

            if (absDiff <= 65.0)
            {
                lastFeedback.rating = TimingRating::Perfect;
                perfectCount++;
                rhythmPointsTotal += 100.0;
                lastFeedback.text = juce::String("Perfect (") + (diffMs >= 0 ? "+" : "") + juce::String(std::round(diffMs)) + "ms)";
            }
            else if (absDiff <= 150.0)
            {
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
                lastFeedback.rating = TimingRating::Missed;
                missedCount++;
                rhythmPointsTotal += 30.0;
                lastFeedback.text = juce::String("Off-beat (") + (diffMs >= 0 ? "+" : "") + juce::String(std::round(diffMs)) + "ms)";
            }
        }
    }

    if (midiNote == target->midi)
    {
        // Correct pitch struck!
        correctCount++;
        currentStreak++;
        maxStreak = std::max(maxStreak, currentStreak);

        // Downbeat Recovery Bonus Check
        const int beatsPerMeasure = (currentMelody.timeSignature.numerator > 0) ? currentMelody.timeSignature.numerator : 4;
        const bool isMeasureDownbeat = (static_cast<int>(std::round(target->startBeat)) % beatsPerMeasure == 0);
        const bool isGoodTiming = (lastFeedback.rating == TimingRating::Perfect || lastFeedback.rating == TimingRating::Early || lastFeedback.rating == TimingRating::Late);

        if (hadRecentMissOrMistake && isGoodTiming && isMeasureDownbeat)
        {
            const int bonus = 35;
            recoveriesCount++;
            recoveryPointsTotal += bonus;
            lastFeedback.isRecovered = true;
            lastFeedback.text = juce::String::fromUTF8("\xE2\x9A\xA1 In-Tempo Recovery! (+Bonus)");
            hadRecentMissOrMistake = false;
            if (onRecoveryTriggered) onRecoveryTriggered();
        }
        else if (isGoodTiming)
        {
            hadRecentMissOrMistake = false;
        }

        // Record completed evaluation
        if (currentNoteIndex >= 0 && currentNoteIndex < static_cast<int>(noteEvaluations.size()))
        {
            auto& ev = noteEvaluations[static_cast<size_t>(currentNoteIndex)];
            ev.completed = true;
            ev.timing = lastFeedback.rating;
            ev.offsetMs = lastFeedback.offsetMs;
            ev.isRecovered = lastFeedback.isRecovered;
        }

        advanceToNextNote();
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
        hadRecentMissOrMistake = true;

        if (isTimeDrivenMode())
        {
            // RHYTHM-FIRST: Record timing and advance immediately! Never wait for pitch fix in strict mode!
            if (currentNoteIndex >= 0 && currentNoteIndex < static_cast<int>(noteEvaluations.size()))
            {
                auto& ev = noteEvaluations[static_cast<size_t>(currentNoteIndex)];
                ev.completed = true;
                ev.timing = lastFeedback.rating;
                ev.offsetMs = lastFeedback.offsetMs;
            }
            lastFeedback.text = juce::String::fromUTF8("\xE2\x9D\x8C ") + playedInfo.fullName + " (Expected " + target->name + ")";
            advanceToNextNote();
        }
        else
        {
            lastFeedback.rating = TimingRating::Missed;
            lastFeedback.offsetMs = 0.0;
            lastFeedback.text = "Played " + playedInfo.fullName + " (Expected " + target->name + ")";
            calculateLiveScorecard();
        }

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
    scorecard.recoveries = recoveriesCount;
    scorecard.recoveryPoints = recoveryPointsTotal;
    scorecard.maxStreak = maxStreak;

    // Pitch accuracy percentage: correct notes out of (correct + mistakes + missed)
    const int pitchDenominator = correctCount + mistakeCount + missedCount;
    scorecard.pitchAccuracy = (pitchDenominator > 0)
        ? std::clamp(static_cast<int>(std::round((static_cast<double>(correctCount) / static_cast<double>(pitchDenominator)) * 100.0)), 0, 100)
        : 100;

    // Rhythm accuracy percentage
    const int scoredNotes = perfectCount + greatCount + missedCount + (isTimeDrivenMode() ? mistakeCount : 0);
    if (scoredNotes > 0)
    {
        const double maxRhythmPoints = scoredNotes * 100.0;
        const double totalWithBonus = rhythmPointsTotal + recoveryPointsTotal;
        scorecard.rhythmAccuracy = std::clamp(static_cast<int>(std::round((totalWithBonus / maxRhythmPoints) * 100.0)), 0, 100);
    }
    else
    {
        scorecard.rhythmAccuracy = 100;
    }

    // Composite Sight-Reading score: 60% rhythm + 40% pitch + recovery bonus
    if (isTimeDrivenMode())
    {
        scorecard.sightReadingScore = std::clamp(static_cast<int>(std::round(
            (scorecard.rhythmAccuracy * 0.60) + (scorecard.pitchAccuracy * 0.40)
        )), 0, 100);
    }
    else
    {
        scorecard.sightReadingScore = scorecard.pitchAccuracy;
    }

    // Star rating
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

    if (practiceMode == PracticeMode::FirstRead)
    {
        FirstReadRecord record;
        record.melodyId = currentMelody.id;
        record.title = currentMelody.title;
        record.composer = currentMelody.composer;
        record.difficulty = currentMelody.difficulty;
        record.timestamp = juce::Time::currentTimeMillis();
        record.dateStr = juce::Time::getCurrentTime().formatted("%b %d, %Y");
        record.pitchAccuracy = scorecard.pitchAccuracy;
        record.rhythmAccuracy = scorecard.rhythmAccuracy;
        record.sightReadingScore = scorecard.sightReadingScore;
        record.recoveries = scorecard.recoveries;
        record.stars = scorecard.stars;
        record.bpm = (currentMelody.bpm > 0) ? currentMelody.bpm : currentBpm;

        recordFirstReadResult(record);
        scorecard.isFirstRead = true;
        scorecard.firstReadRecord = record;
    }
}

} // namespace MidiSheet
