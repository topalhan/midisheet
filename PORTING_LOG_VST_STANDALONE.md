# MidiSheet: VST3 & Standalone Porting Log & Technical Specification

This document details the architectural specifications, data structures, algorithms, and C++20 / JUCE 8 code modifications required to port the web sight-reading features to the **MidiSheet VST3, AU, and Standalone** applications.

---

## 1. Feature Overview & Design Philosophy

### The "Synthesia Trap" vs. Sight-Reading Momentum
Traditional piano learning applications halt the playhead or cursor and wait for the user to strike the correct key before advancing. While helpful for early finger placement, this mechanism destroys sight-reading fluency. When sight-reading with a real ensemble or metronome, **time is absolute**. Sight-readers must:
1. Keep their internal pulse relentless.
2. If an error occurs, skip or drop the note and land cleanly on the next downbeat rather than stopping to correct pitch.
3. Prioritize rhythmic timeliness over pitch correctness.

### Ported Features:
1. **Strict Time-Based Scroll (No-Pause Metronome)**:
   - Playhead advances strictly based on DAW PPQ (VST3) or sample-accurate high-resolution audio clock (Standalone).
   - Pitch errors do not halt the playhead; notes expire into "Missed" if not struck within their musical duration window.
   - Non-blocking stroke evaluation: striking on the beat awards rhythm timeliness credit even if the pitch is wrong.
   - **Downbeat Tempo Recovery Bonus**: Partial credit awarded if the player misses a note but recovers on the next downbeat in tempo.
2. **"First-Read" Lockout Challenge**:
   - Practice mode where a chosen MIDI excerpt can only be loaded and played **once**.
   - 30-second silent analysis phase with audio muted before a 4-beat count-in.
   - Permanent lockout saved to plugin persistent state (`juce::PropertiesFile` or `juce::ValueTree`).

---

## 2. Core Engine Porting: `MelodyScorer.h` & `MelodyScorer.cpp`

### 2.1. Practice Mode & Timing Rating Enums
In [MelodyScorer.h](file:///n:/projects/learning/vst3-plugin/src/core/MelodyScorer.h):

```cpp
enum class PracticeMode
{
    Wait,       // Traditional: waits for the correct note before advancing
    Tempo,      // In-Tempo: metronome-guided evaluation
    StrictTime, // NEW: No-Pause Metronome; relentless playhead; non-blocking evaluation
    FirstRead   // NEW: 30s silent inspection -> 4-beat count-in -> 1-shot strict playback
};
```

### 2.2. Data Structure Updates
Update `NoteEvaluation` and `PracticeScorecard`:

```cpp
struct NoteEvaluation
{
    int mistakeAttempts = 0;
    std::vector<int> wrongNotesPlayed;
    int lastWrongMidi = -1;
    TimingRating timing = TimingRating::None;
    double offsetMs = 0.0;
    bool completed = false;
    bool isRecovered = false; // NEW: true if recovered on downbeat
};

struct FirstReadRecord
{
    juce::String melodyId;
    juce::String title;
    juce::Time completionTime;
    int pitchAccuracy = 0;
    int rhythmAccuracy = 0;
    int sightReadingScore = 0;
    int recoveries = 0;
    int stars = 0;
    double bpm = 120.0;
};

struct PracticeScorecard
{
    int totalNotes = 0;
    int correctNotes = 0;
    int mistakeCount = 0;
    int perfectHits = 0;
    int greatHits = 0;
    int missedNotes = 0;
    int recoveries = 0;       // NEW: Count of successful downbeat tempo recoveries
    int recoveryPoints = 0;   // NEW: Bonus points earned from tempo recoveries
    int pitchAccuracy = 100;
    int rhythmAccuracy = 100;
    int sightReadingScore = 100; // NEW: 60% rhythm + 40% pitch + recovery bonus
    int maxStreak = 0;
    int stars = 3;
    bool isCompleted = false;
    bool isFirstRead = false; // NEW: Flag for first-read completion
};
```

### 2.3. Downbeat Recovery Bonus Logic
In `MelodyScorer.cpp`:

```cpp
// Check if current note qualifies as a measure downbeat or strong beat
bool isMeasureDownbeat = (targetNote.startBeat % beatsPerMeasure == 0);
bool isGoodTiming = (timing.rating == TimingRating::Perfect || 
                     timing.rating == TimingRating::Early || 
                     timing.rating == TimingRating::Late);

if (hadRecentMissOrMistake && isGoodTiming && isMeasureDownbeat)
{
    const int bonusPoints = 35;
    scorecard.recoveries++;
    scorecard.recoveryPoints += bonusPoints;
    eval.isRecovered = true;
    lastFeedback.text = "⚡ In-Tempo Recovery! (+Bonus)";
    hadRecentMissOrMistake = false;
}
else if (isGoodTiming)
{
    hadRecentMissOrMistake = false;
}
```

### 2.4. Non-Blocking Note Stride in Strict Mode
When `practiceMode == PracticeMode::StrictTime` or `PracticeMode::FirstRead`:

```cpp
if (midiNote == expectedMidi)
{
    // Correct pitch struck
    eval.completed = true;
    currentStreak++;
    scorecard.correctNotes++;
    advanceToNextNote();
}
else
{
    // Incorrect pitch struck
    eval.mistakeAttempts++;
    eval.wrongNotesPlayed.push_back(midiNote);
    eval.lastWrongMidi = midiNote;
    scorecard.mistakeCount++;
    currentStreak = 0;
    hadRecentMissOrMistake = true;

    if (practiceMode == PracticeMode::StrictTime || practiceMode == PracticeMode::FirstRead)
    {
        // RHYTHM-FIRST: Still evaluate timing delta and award rhythm points for the stroke!
        eval.timing = timingFeedback.rating;
        eval.offsetMs = timingFeedback.offsetMs;
        eval.completed = true;
        
        // CRUCIAL SIGHT-READING ADVANCEMENT:
        // Advance immediately so user is NEVER stuck trying to correct the note!
        advanceToNextNote();
    }
}
```

### 2.5. Continuous Time-Based Auto-Advance (Playhead Expiration)
In `MelodyScorer::processTime(double currentSongBeats)` (called from audio processor):

```cpp
void MelodyScorer::processTime(double currentSongBeats)
{
    if (finished || practiceMode == PracticeMode::Wait)
        return;

    if (currentNoteIndex < (int)currentMelody.notes.size())
    {
        const auto& target = currentMelody.notes[(size_t)currentNoteIndex];
        const double noteEndBeat = target.startBeat + target.duration;
        const double graceBeats = (practiceMode == PracticeMode::StrictTime || practiceMode == PracticeMode::FirstRead)
                                  ? std::min(0.35, target.duration * 0.40)
                                  : 0.50;

        if (currentSongBeats > (noteEndBeat + graceBeats))
        {
            // Note window elapsed without user strike -> auto-advance as Missed
            auto& eval = noteEvaluations[(size_t)currentNoteIndex];
            if (!eval.completed)
            {
                eval.completed = true;
                eval.timing = TimingRating::Missed;
                scorecard.missedNotes++;
                currentStreak = 0;
                hadRecentMissOrMistake = true;
                
                lastFeedback.rating = TimingRating::Missed;
                lastFeedback.text = "🔴 Missed";
            }
            advanceToNextNote();
        }
    }
}
```

---

## 3. UI & Notation Porting: `GrandStaffComponent.h` & `GrandStaffComponent.cpp`

### 3.1. Relentless Playhead Cursor Rendering
In [GrandStaffComponent.cpp](file:///n:/projects/learning/vst3-plugin/src/ui/GrandStaffComponent.cpp):

```cpp
void GrandStaffComponent::paint(juce::Graphics& g)
{
    // ... Staves, clefs, and notes rendering ...

    // Render Continuous Glowing Playhead Cursor in Strict Time & First-Read modes
    if ((practiceMode == PracticeMode::StrictTime || practiceMode == PracticeMode::FirstRead) &&
        !isFinished && !isCountingIn && !isSilentAnalyzing)
    {
        const float playheadX = calculateXForBeat(currentPlayheadBeats) - scrollOffset;

        if (playheadX >= notesStartX && playheadX <= staffRightX)
        {
            const auto cursorColour = isRecoveryFlashActive() ? juce::Colour(0xff10b981) 
                                                              : juce::Colour(0xff38bdf8);

            // 1. Aura glow
            juce::ColourGradient glowGrad(cursorColour.withAlpha(0.35f), playheadX, 0.0f,
                                         juce::Colours::transparentBlack, playheadX + 10.0f, 0.0f, true);
            g.setGradientFill(glowGrad);
            g.fillRect(playheadX - 8.0f, trebleTopY - 12.0f, 16.0f, staffTotalHeight + 24.0f);

            // 2. Playhead cursor line
            g.setColour(cursorColour);
            g.drawLine(playheadX, trebleTopY - 10.0f, playheadX, bassBottomY + 10.0f, 2.2f);

            // 3. Top pointer triangle cap
            juce::Path topCap;
            topCap.addTriangle(playheadX, trebleTopY - 4.0f,
                               playheadX - 6.0f, trebleTopY - 12.0f,
                               playheadX + 6.0f, trebleTopY - 12.0f);
            g.fillPath(topCap);

            // 4. Bottom pointer triangle cap
            juce::Path botCap;
            botCap.addTriangle(playheadX, bassBottomY + 4.0f,
                               playheadX - 5.0f, bassBottomY + 12.0f,
                               playheadX + 5.0f, bassBottomY + 12.0f);
            g.fillPath(botCap);

            // 5. In-Tempo Recovery Text Banner
            if (isRecoveryFlashActive())
            {
                g.setColour(juce::Colour(0xff10b981));
                g.setFont(juce::FontOptions(11.0f).withStyle("Bold"));
                g.drawText("⚡ IN-TEMPO RECOVERY!", playheadX - 80.0f, trebleTopY - 26.0f, 160.0f, 14.0f,
                           juce::Justification::centred);
            }
        }
    }
}
```

### 3.2. Smooth Viewport Auto-Scrolling Locked to Playhead
```cpp
if (practiceMode == PracticeMode::StrictTime || practiceMode == PracticeMode::FirstRead)
{
    const float rawPlayheadX = calculateXForBeat(currentPlayheadBeats);
    const float focalTargetX = notesStartX + (availableStaffWidth * 0.28f);
    targetScrollOffset = std::max(0.0f, rawPlayheadX - focalTargetX);
    // Smooth dampening towards target scroll offset
    scrollOffset += (targetScrollOffset - scrollOffset) * 0.15f;
}
```

---

## 4. First-Read Lockout State Machine: `PluginProcessor` & `PluginEditor`

### 4.1. Lockout Persistence using `juce::PropertiesFile`
In `PluginProcessor.h`:

```cpp
class MidiSheetAudioProcessor : public juce::AudioProcessor
{
public:
    // ...
    bool isMelodyFirstReadLocked(const juce::String& melodyId) const;
    void recordFirstReadResult(const FirstReadRecord& record);
    void resetFirstReadLockouts();

private:
    std::unique_ptr<juce::PropertiesFile> persistentSettings;
    std::map<juce::String, FirstReadRecord> firstReadRecords;
};
```

In `PluginProcessor.cpp`:

```cpp
bool MidiSheetAudioProcessor::isMelodyFirstReadLocked(const juce::String& melodyId) const
{
    return firstReadRecords.find(melodyId) != firstReadRecords.end();
}

void MidiSheetAudioProcessor::recordFirstReadResult(const FirstReadRecord& record)
{
    firstReadRecords[record.melodyId] = record;
    if (persistentSettings != nullptr)
    {
        auto* xml = persistentSettings->createXml("FirstReadRecords");
        for (const auto& [id, rec] : firstReadRecords)
        {
            auto* child = xml->createNewChildElement("Record");
            child->setAttribute("id", rec.melodyId);
            child->setAttribute("pitchAcc", rec.pitchAccuracy);
            child->setAttribute("rhythmAcc", rec.rhythmAccuracy);
            child->setAttribute("score", rec.sightReadingScore);
            child->setAttribute("recoveries", rec.recoveries);
            child->setAttribute("timestamp", rec.completionTime.toMilliseconds());
        }
        persistentSettings->setValue("FirstReadXml", xml);
        persistentSettings->saveIfNeeded();
    }
}
```

### 4.2. 30-Second Silent Analysis Countdown
In `MelodyScorer`:
1. Start state: `isSilentAnalyzing = true`, `analysisSecondsRemaining = 30.0`.
2. Audio pass-through / internal synth muted during this phase:
   ```cpp
   void MidiSheetAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
   {
       // If in Silent Analysis, suppress internal synthesizer generation
       if (scorer.isSilentAnalyzing())
       {
           // Do not trigger internal sampler/synth
           return;
       }
       // Normal processing...
   }
   ```
3. Skip button triggers `skipSilentAnalysis()`, transitioning straight to 4-beat count-in.

---

## 5. Interval & Shape Recognition (Interval Heatmap & Contour Overlay) in C++20 / JUCE 8

### 5.1. Design Objective
Train the sight-reader's visual cortex to perceive **relative spatial motion and contours** (steps, broken thirds, leaps) instantly without calculating pitch letter-names ("C-D-E-F").

### 5.2. Classification Enum & Math

In `MusicTheory.h`:

```cpp
enum class IntervalCategory
{
    Unison, // 0 semitones
    Step,   // 1-2 semitones (diatonic 2nd) -> Emerald Green
    Skip,   // 3-4 semitones (diatonic 3rd / broken thirds) -> Vivid Orange
    Leap    // 5+ semitones (4ths, 5ths, 6ths, octaves) -> Royal Purple
};

struct IntervalInfo
{
    IntervalCategory category;
    int semitones = 0;
    int diatonicSteps = 0;
    juce::String shortLabel; // "2nd", "3rd", "4th", "5th", "8ve"
    juce::Colour color;
    juce::Colour glow;
};

class MusicTheory
{
public:
    static IntervalInfo classifyInterval(int midi1, int midi2)
    {
        int semi = std::abs(midi2 - midi1);
        int stepDist = std::abs(getDiatonicStep(midi2) - getDiatonicStep(midi1));

        if (semi == 0)
        {
            return { IntervalCategory::Unison, 0, 0, "1st",
                     juce::Colour(0xFF38BDF8), juce::Colour(0x6638BDF8) };
        }
        else if (stepDist == 1 || semi <= 2)
        {
            // Step (2nd): Emerald Green
            return { IntervalCategory::Step, semi, 1, "2nd",
                     juce::Colour(0xFF22C55E), juce::Colour(0x6622C55E) };
        }
        else if (stepDist == 2 || (semi >= 3 && semi <= 4))
        {
            // Skip (3rd): Vivid Orange
            return { IntervalCategory::Skip, semi, 2, "3rd",
                     juce::Colour(0xFFF97316), juce::Colour(0x66F97316) };
        }
        else
        {
            // Leap: Royal Purple
            juce::String label = juce::String(stepDist + 1) + "th";
            if (stepDist == 3 || semi == 5) label = "4th";
            else if (stepDist == 4 || semi == 7) label = "5th";
            else if (stepDist == 5 || semi == 9) label = "6th";
            else if (stepDist == 6 || semi == 11) label = "7th";
            else if (stepDist == 7 || semi == 12) label = "8ve";

            return { IntervalCategory::Leap, semi, stepDist, label,
                     juce::Colour(0xFFA855F7), juce::Colour(0x66A855F7) };
        }
    }
};
```

### 5.3. Bezier Ribbon & Badge Rendering (`GrandStaffComponent.cpp`)

```cpp
void GrandStaffComponent::drawIntervalRibbon(juce::Graphics& g,
                                            juce::Point<float> p1, int midi1,
                                            juce::Point<float> p2, int midi2,
                                            float alpha, bool isHarmonic)
{
    auto info = MusicTheory::classifyInterval(midi1, midi2);
    if (info.category == IntervalCategory::Unison && isHarmonic)
        return;

    g.saveState();
    g.setOpacity(juce::jlimit(0.2f, 1.0f, alpha));

    float dx = p2.x - p1.x;
    float dy = p2.y - p1.y;

    juce::Path ribbonPath;
    ribbonPath.startNewSubPath(p1);

    juce::Point<float> cp1, cp2;
    if (isHarmonic)
    {
        // Outward curve arch for chord notes
        float arch = juce::jlimit(12.0f, 32.0f, std::abs(dy) * 0.35f + 8.0f);
        cp1 = { p1.x + arch, p1.y + dy * 0.25f };
        cp2 = { p2.x + arch, p1.y + dy * 0.75f };
    }
    else
    {
        // Smooth horizontal S-curve for melodic motion
        float tension = juce::jlimit(0.32f, 0.48f, std::abs(dx) / 180.0f);
        cp1 = { p1.x + dx * tension, p1.y };
        cp2 = { p2.x - dx * tension, p2.y };
    }

    ribbonPath.cubicTo(cp1, cp2, p2);

    // Glowing stroke
    juce::PathStrokeType stroke(3.5f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded);
    g.setColour(info.glow);
    g.strokePath(ribbonPath, juce::PathStrokeType(6.0f));

    g.setColour(info.color);
    g.strokePath(ribbonPath, stroke);

    // Floating interval badge at midpoint (t = 0.5)
    float t = 0.5f;
    float mt = 1.0f - t;
    float midX = mt*mt*mt*p1.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*p2.x;
    float midY = mt*mt*mt*p1.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*p2.y;

    auto font = juce::Font(10.0f, juce::Font::bold);
    int textW = font.getStringWidth(info.shortLabel) + 10;
    int textH = 16;
    juce::Rectangle<float> badgeBounds(midX - textW / 2.0f, midY - textH / 2.0f, (float)textW, (float)textH);

    g.setColour(juce::Colour(0xEE090D16));
    g.fillRoundedRectangle(badgeBounds, 7.0f);

    g.setColour(info.color);
    g.drawRoundedRectangle(badgeBounds, 7.0f, 1.3f);
    g.setFont(font);
    g.drawFittedText(info.shortLabel, badgeBounds.toNearestInt(), juce::Justification::centred, 1);

    g.restoreState();
}
```

---

## 6. "Accidental Alert" Flash Engine & Key Signature Muscle Memory

### 6.1. Design Objective
Allow default diatonic notes to be executed through subconscious scale muscle memory (neutral appearance), while triggering an instantaneous, high-visibility **warning flash** exclusively on notes bearing printed accidentals that deviate from the key signature.

### 6.2. Bitmask Key Signature Representation

In `KeySignature.h`:

```cpp
struct KeySignature
{
    juce::String name;
    int accidentalCount = 0; // positive for sharps, negative for flats
    uint16_t diatonicMask = 0; // Bitmask of diatonic pitch classes (0 = C, 1 = C#, etc.)

    bool isDiatonic(int midi) const noexcept
    {
        int pitchClass = ((midi % 12) + 12) % 12;
        return (diatonicMask & (1 << pitchClass)) != 0;
    }

    static KeySignature getCMajor()
    {
        // C(0), D(2), E(4), F(5), G(7), A(9), B(11)
        uint16_t mask = (1 << 0) | (1 << 2) | (1 << 4) | (1 << 5) |
                        (1 << 7) | (1 << 9) | (1 << 11);
        return { "C Major", 0, mask };
    }

    static KeySignature getGMajor()
    {
        // G(7), A(9), B(11), C(0), D(2), E(4), F#(6)
        uint16_t mask = (1 << 7) | (1 << 9) | (1 << 11) | (1 << 0) |
                        (1 << 2) | (1 << 4) | (1 << 6);
        return { "G Major", 1, mask };
    }
};
```

### 6.3. Accidental Alert Paint Routine (`GrandStaffComponent.cpp`)

```cpp
void GrandStaffComponent::drawNoteheadWithAccidentalAlert(juce::Graphics& g,
                                                          const NoteItem& note,
                                                          const KeySignature& activeKey,
                                                          bool accidentalAlertEnabled)
{
    bool isDeviation = !activeKey.isDiatonic(note.midi);
    bool shouldAlert = accidentalAlertEnabled && isDeviation;

    float rx = lineSpacing * 0.62f;
    float ry = lineSpacing * 0.44f;

    if (shouldAlert)
    {
        // Luminous Amber Warning Pulse Halo
        g.saveState();
        g.setColour(juce::Colour(0x44F59E0B)); // Amber halo
        g.fillEllipse(note.x - rx * 1.4f, note.y - ry * 1.4f, rx * 2.8f, ry * 2.8f);

        g.setColour(juce::Colour(0xFFF59E0B)); // Dashed warning ring
        float dashes[] = { 3.0f, 2.0f };
        g.drawEllipse(note.x - rx * 1.35f, note.y - ry * 1.35f, rx * 2.7f, ry * 2.7f, 1.4f);
        g.restoreState();
    }

    // Main notehead body
    juce::Path notehead;
    notehead.addEllipse(note.x - rx, note.y - ry, rx * 2.0f, ry * 2.0f);
    notehead.applyTransform(juce::AffineTransform::rotation(-0.32f, note.x, note.y));

    if (note.isActive)
    {
        g.setColour(shouldAlert ? juce::Colour(0xFFFBBF24) : juce::Colour(0xFF38BDF8));
    }
    else
    {
        // Diatonic notehead remains completely neutral pearl!
        g.setColour(shouldAlert ? juce::Colour(0xFFFBBF24) : juce::Colour(0xFFF8FAFC));
    }
    g.fillPath(notehead);
}
```

---

## 8. In-Tempo Synchronization & Lag-Free Clock Architecture

### 8.1 Unified Time-Driven Abstraction (`isTimeDrivenMode`)
In [MelodyScorer.h](file:///n:/projects/learning/vst3-plugin/src/core/MelodyScorer.h):
```cpp
bool isTimeDrivenMode() const noexcept
{
    return practiceMode == PracticeMode::InTempo ||
           practiceMode == PracticeMode::StrictTime ||
           practiceMode == PracticeMode::FirstRead;
}
```
* **Wait Mode (`PracticeMode::Wait`)**: Pauses and waits for the user to strike the correct pitch. Metronome (if enabled) re-aligns its phase when Note 0 is played.
* **Time-Driven Modes (`InTempo`, `StrictTime`, `FirstRead`)**: Governed by an unpausing metronome clock. Visual cues, active note targets, playhead cursor, and auto-scroll march forward relentlessly.

### 8.2 Seamless Count-In Handoff (Zero-Lag Transition)
A critical flaw in naive count-in implementations is dismissing the count-in banner at beat 4 while delaying `songStartTime` until the subsequent tick, causing a 1-beat freeze where `elapsedMs <= 0`.

**Correct C++ Porting Implementation**:
```cpp
void MelodyScorer::handleMetronomeTick(int currentCountInBeat)
{
    if (isTimeDrivenMode() && isCountingIn)
    {
        if (currentCountInBeat <= countInTotal)
        {
            // Play count-in click (e.g., Beat 1, 2, 3, 4)
            playMetronomeClick(currentCountInBeat == 1);
            broadcastCountIn(currentCountInBeat, countInTotal);
        }
        else
        {
            // Clean handoff: Beat 5 IS Measure 1 Beat 1!
            isCountingIn = false;
            songStartTimeMs = juce::Time::getMillisecondCounterHiRes();
            currentPlayheadBeats = 0.0;
            currentBeatIndex = 1;

            dismissCountInBanner();
            playMetronomeClick(true); // Downbeat accent click
        }
    }
}
```

### 8.3 Note 0 Timing Anchoring
In time-driven modes, `songStartTimeMs` is fixed at the downbeat click of Measure 1.
* In **Wait mode**, Note 0 strike sets `songStartTimeMs = now` and awards 100 points.
* In **Time-Driven modes**, Note 0 must **NOT** overwrite `songStartTimeMs`. Instead, Note 0 is evaluated against `songStartTimeMs + (note.startBeat * beatMs)`. This preserves the audio metronome phase and visual playhead alignment.

### 8.4 Relentless Advancement on Pitch Mistake
In `InTempo` mode, striking an incorrect pitch must not freeze or wait for correction.
```cpp
if (isTimeDrivenMode())
{
    // Evaluate rhythm timing and award credit for keeping time
    auto timing = evaluateTiming(nowMs);
    currentEvaluation.timing = timing;
    advanceToNextNote(); // Do not pause for pitch fix!
}
else
{
    // Wait mode: keep currentNoteIndex active until user corrects pitch
}
```

### 8.5 Multi-Note Expiry Loop & Musical Grace Window
Using a single `if` condition per audio block or animation frame to expire notes causes a multi-frame cascading catch-up effect ("lagging behind then moving extra fast").
Instead, process expired notes in a `while` loop with a tight musical grace window:

```cpp
const double beatMs = (60.0 / currentBpm) * 1000.0;
const double nowMs = juce::Time::getMillisecondCounterHiRes();
const double elapsedMs = std::max(0.0, nowMs - songStartTimeMs);
currentPlayheadBeats = elapsedMs / beatMs;

// Catch up all expired notes in one pass
while (currentNoteIndex < totalNotes)
{
    const auto& target = melodyNotes[(size_t)currentNoteIndex];
    const double noteStartMs = songStartTimeMs + (target.startBeat * beatMs);
    const double noteDurationMs = target.duration * beatMs;
    // Tight musical grace window: max 140ms or 35% of note duration
    const double graceMs = std::min(140.0, noteDurationMs * 0.35);
    const double noteExpiryMs = noteStartMs + noteDurationMs + graceMs;

    if (nowMs > noteExpiryMs)
    {
        recordMissedNote(currentNoteIndex);
        currentNoteIndex++;
    }
    else
    {
        break; // Active target note is current
    }
}
```

### 8.6 Unified Playhead Cursor & Viewport Auto-Scroll
In `GrandStaffComponent.cpp`:
* Render glowing playhead beam and arrow caps whenever `isTimeDrivenMode()` is true.
* Scroll smoothly along `playheadXRaw - focusX` to give the user continuous visual anticipation rather than stepped note jumping.

---

## 9. Summary Checklist for Porting to C++

- [ ] **Enums**: Add `PracticeMode::StrictTime` and `PracticeMode::FirstRead` to `MelodyScorer.h`.
- [ ] **Unified Mode Helper**: Implement `isTimeDrivenMode()` for `InTempo`, `StrictTime`, and `FirstRead`.
- [ ] **Count-In Handoff**: Transition from count-in to Measure 1 Beat 1 on downbeat tick with exact zero-offset `songStartTimeMs`.
- [ ] **Note 0 Anchoring**: Prevent Note 0 strike from overwriting `songStartTimeMs` in time-driven modes.
- [ ] **Relentless Advancement**: Advance `currentNoteIndex` on pitch mistake in all time-driven modes.
- [ ] **Multi-Note Expiration**: Use `while` loop with `min(140ms, duration * 0.35)` grace period to eliminate cascading catch-up lag.
- [ ] **Playhead Cursor**: Draw glowing line and arrow caps in `GrandStaffComponent::paint` across all time-driven modes.
- [ ] **Auto-Scroll**: Implement playhead-following horizontal scroll interpolation for `isTimeDrivenMode()`.
- [ ] **Downbeat Recovery**: Track `hadRecentMissOrMistake` and award +35 bonus points on downbeat strike with good timing.
- [ ] **Scoring Formula**: Implement composite sight-reading metric ($60\%\text{ rhythm} + 40\%\text{ pitch} + \text{recovery bonus}$).
- [ ] **Silent Analysis**: Implement 30s timer with audio synth mute in `processBlock`.
- [ ] **Lockout File**: Store completed First-Read records using JUCE `PropertiesFile`.
- [ ] **Interval Classification**: Implement `MusicTheory::classifyInterval` with green steps, orange skips, and purple leaps.
- [x] **Interval Ribbon Rendering**: Build `juce::Path` with cubic bezier curves and centered interval badges.
- [x] **Accidental Alert Engine**: Implement `KeySignature::isDiatonic` bitmask lookup and amber halo rendering.

---

## 10. Eye-Ahead & Buffer Training (The Visual Disrupter)

### 10.1 Cognitive Problem: The Audio-Playhead Anchor
Most music and sight-reading software pins a visual cursor directly over the currently sounding note. This actively trains the eye to look only at what is currently sounding, which is the antithesis of fluent sight-reading. Fluent reading requires a look-ahead buffer of 1 to 2 measures in working memory.

### 10.2 Features & Implementations

#### 1. The Vanishing Bar (`VisualDisrupterMode::VanishingBar`)
* **Behavior**: The moment an active measure begins playing (e.g. Bar $N$), the entire bar is blanked out with a frosted semi-transparent slate mask (`#0F172A`, 92% opacity) bounded by an amber dashed outline and a prominent warning pill: `🧠 BUFFER BAR N (PLAY FROM MEMORY)`.
* **Effect**: Forces the musician to buffer the measure into working memory ahead of time and focus their eyes on Bar $N+1$ or $N+2$ while their hands execute Bar $N$.
* **C++ Implementation**: `GrandStaffComponent::drawVanishingBarMask(g, activeMeasure, staffLeft, staffRight)` calculates measure boundary offsets from `barlineXPositions` and applies a rounded rectangle mask with dashed stroke.

#### 2. The Advance Curtain (`VisualDisrupterMode::AdvanceCurtain`)
* **Behavior**: A trailing horizontal gradient shutter that moves synchronously with the playhead cursor, blanking out notes as soon as they sound with an amber leading edge and a `⛔ NO LINGER` warning badge.
* **Effect**: Eliminates regression and backward eye saccades. Once a note sounds, it is visually removed.
* **C++ Implementation**: `GrandStaffComponent::drawAdvanceCurtain(g, curtainX, staffLeft)` renders a 3-stop linear gradient from `notesStartX` to `curtainX` with a vertical shutter edge.

#### 3. Decoupled Eye Cursor (`decoupledEyeCursorEnabled`)
* **Behavior**: Renders an independent look-ahead cursor positioned exactly **1 measure ahead** (`currentPlayheadBeats + beatsPerMeasure`) using an Electric Sky (`#38BDF8`) dashed guide line, dual pointer arrows, soft aura glow, and a `👁 LOOK HERE` badge.
* **Audio Playhead Attenuation**: When active, the audio playhead line is dimmed to 38% opacity and reduced line weight, turning it into a secondary peripheral reference.
* **C++ Implementation**: `GrandStaffComponent::drawDecoupledEyeCursor(g, eyeX, staffLeft, staffRight)` uses `getXForBeat(playheadBeats + beatsPerMeasure)` to calculate look-ahead coordinates.

### 10.3 State Persistence & UI Integration
* **PluginProcessor**: Serializes `disrupter` mode (`none`, `vanishing`, `curtain`) and `eyeCursor` boolean flag in `getStateInformation` / `setStateInformation` XML trees.
* **ScoreboardComponent**: Houses a dark-themed `ComboBox` selector and an `eyeCursorButton` toggle button with dynamic styling matching the Web HUD.

