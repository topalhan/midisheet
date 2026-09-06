#include "GrandStaffComponent.h"
#include <cmath>
#include <algorithm>

namespace MidiSheet
{

GrandStaffComponent::GrandStaffComponent()
{
    setOpaque(false);
}

void GrandStaffComponent::resized()
{
    repaint();
}

void GrandStaffComponent::noteOn(int midi, int velocity)
{
    juce::ignoreUnused(velocity);
    activeMidiNotes.insert(midi);
    repaint();
}

void GrandStaffComponent::noteOff(int midi)
{
    activeMidiNotes.erase(midi);
    repaint();
}

void GrandStaffComponent::clearNotes()
{
    activeMidiNotes.clear();
    repaint();
}

void GrandStaffComponent::setPracticeMelody(const Melody* melody, int noteIndex, bool isFinished)
{
    currentMelody = melody;
    currentNoteIndex = noteIndex;
    isMelodyFinished = isFinished;

    if (currentMelody != nullptr && currentNoteIndex >= 0 && currentNoteIndex < static_cast<int>(currentMelody->notes.size()))
    {
        currentTargetNote = &currentMelody->notes[static_cast<size_t>(currentNoteIndex)];
    }
    else
    {
        currentTargetNote = nullptr;
    }

    repaint();
}

void GrandStaffComponent::setTargetNote(const MelodyNote* note)
{
    currentTargetNote = note;
    repaint();
}

void GrandStaffComponent::triggerMistakeFlash()
{
    lastMistakeTimeMs = juce::Time::getMillisecondCounterHiRes();
    repaint();
}

void GrandStaffComponent::paint(juce::Graphics& g)
{
    const auto bounds = getLocalBounds().toFloat();
    const float w = bounds.getWidth();
    const float h = bounds.getHeight();

    // 1. Dark sleek backdrop with subtle card border
    g.fillAll(juce::Colour::fromRGB(11, 15, 25)); // Slate 950
    g.setColour(juce::Colour::fromRGB(30, 41, 59));
    g.drawRoundedRectangle(bounds.reduced(1.0f), 12.0f, 1.5f);

    // 2. Header banner with melody info and progress
    const float headerY = 10.0f;
    if (currentMelody != nullptr)
    {
        // Melody Title & details
        g.setFont(juce::FontOptions(13.0f, juce::Font::bold));
        g.setColour(juce::Colour::fromRGB(241, 245, 249)); // Slate 100
        const juce::String titleText = currentMelody->title;
        g.drawText(titleText, 24.0f, headerY, 260.0f, 20.0f, juce::Justification::centredLeft);

        g.setFont(juce::FontOptions(11.0f, juce::Font::plain));
        g.setColour(juce::Colour::fromRGB(148, 163, 184)); // Slate 400
        const juce::String detailsText = currentMelody->composer + " | " + currentMelody->key + " | " + juce::String(currentMelody->bpm) + " BPM";
        g.drawText(detailsText, 24.0f + g.getCurrentFont().getStringWidth(titleText) + 12.0f, headerY + 1.0f, 320.0f, 20.0f, juce::Justification::centredLeft);

        // Progress counter with review feedback
        const int totalNotes = static_cast<int>(currentMelody->notes.size());
        const int displayNoteNum = std::clamp(currentNoteIndex + 1, 1, std::max(1, totalNotes));

        int mistakeNotesCount = 0;
        if (noteEvaluations != nullptr)
        {
            for (const auto& ev : *noteEvaluations)
            {
                if (ev.mistakeAttempts > 0) mistakeNotesCount++;
            }
        }

        juce::String progressText;
        if (isMelodyFinished)
        {
            if (mistakeNotesCount == 0)
                progressText = "Complete! Perfect run";
            else
                progressText = "Complete! " + juce::String(mistakeNotesCount) + " note(s) to review";
        }
        else
        {
            progressText = "Note " + juce::String(displayNoteNum) + " of " + juce::String(totalNotes);
        }

        g.setFont(juce::FontOptions(12.0f, juce::Font::bold));
        g.setColour(isMelodyFinished ? (mistakeNotesCount == 0 ? juce::Colour::fromRGB(74, 222, 128) : juce::Colour::fromRGB(251, 191, 36))
                                     : juce::Colour::fromRGB(56, 189, 248));
        g.drawText(progressText, w - 240.0f, headerY, 216.0f, 20.0f, juce::Justification::centredRight);

        // Subtle progress track line
        const float progTrackY = headerY + 24.0f;
        const float trackLeft = 24.0f;
        const float trackWidth = w - 48.0f;
        g.setColour(juce::Colour::fromRGBA(51, 65, 85, 120));
        g.drawLine(trackLeft, progTrackY, trackLeft + trackWidth, progTrackY, 2.0f);

        if (totalNotes > 0)
        {
            const float frac = std::clamp(static_cast<float>(currentNoteIndex) / static_cast<float>(totalNotes), 0.0f, 1.0f);
            g.setColour(juce::Colour::fromRGB(56, 189, 248));
            g.drawLine(trackLeft, progTrackY, trackLeft + trackWidth * frac, progTrackY, 2.0f);
        }
    }

    // 3. Staff Layout Dimensions
    const float lineSpacing = std::clamp(h * 0.040f, 13.0f, 17.0f);
    const float staffHeight = lineSpacing * 4.0f;
    const float staffGap = lineSpacing * 4.5f; // Gap between Treble bottom line and Bass top line
    const float totalStaffHeight = staffHeight * 2.0f + staffGap;

    const float startY = std::max(46.0f, (h - totalStaffHeight) * 0.50f);
    const float trebleTopY = startY;
    const float trebleBottomY = trebleTopY + staffHeight;
    const float bassTopY = trebleBottomY + staffGap;
    const float bassBottomY = bassTopY + staffHeight;

    const float staffLeftX = 36.0f;
    const float staffRightX = w - 36.0f;
    const float staffWidth = staffRightX - staffLeftX;

    // 4. Draw Grand Staff Lines
    drawStaffLines(g, staffLeftX, staffWidth, trebleTopY, bassTopY, lineSpacing);

    // 5. Draw Left System Barline & Brace
    g.setColour(juce::Colour::fromRGB(148, 163, 184));
    g.drawLine(staffLeftX, trebleTopY, staffLeftX, bassBottomY, 2.5f);

    // 6. Draw Clefs
    const float clefX = staffLeftX + 26.0f;
    drawClefs(g, clefX, trebleTopY, bassTopY, lineSpacing);

    // 7. Draw Time Signature (e.g. 4/4 or 3/4)
    const float timeSigX = staffLeftX + 64.0f;
    const int num = (currentMelody != nullptr) ? currentMelody->timeSigNum : 4;
    const int den = (currentMelody != nullptr) ? currentMelody->timeSigDen : 4;
    drawTimeSignature(g, timeSigX, trebleTopY, bassTopY, lineSpacing, num, den);

    // Section barline separating clefs/time sig from the Live Input column
    const float clefDividerX = staffLeftX + 90.0f;
    g.setColour(juce::Colour::fromRGBA(148, 163, 184, 100));
    g.drawLine(clefDividerX, trebleTopY, clefDividerX, trebleBottomY, 1.2f);
    g.drawLine(clefDividerX, bassTopY, clefDividerX, bassBottomY, 1.2f);

    // 8. Dedicated Live MIDI Input Column (fixed on the left, NEVER overlaps score notes!)
    const float inputColumnX = staffLeftX + 124.0f;

    // Header label above input column
    g.setFont(juce::FontOptions(9.5f, juce::Font::bold));
    juce::Colour inputColColour = juce::Colour::fromRGBA(148, 163, 184, 130);
    if (!activeMidiNotes.empty())
    {
        if (currentMelody != nullptr && !isMelodyFinished)
        {
            bool anyMatch = false;
            for (int midi : activeMidiNotes)
            {
                if ((currentTargetNote != nullptr && midi == currentTargetNote->midi)
                    || (currentNoteIndex > 0
                        && currentNoteIndex - 1 < static_cast<int>(currentMelody->notes.size())
                        && midi == currentMelody->notes[static_cast<size_t>(currentNoteIndex - 1)].midi))
                {
                    anyMatch = true;
                    break;
                }
            }
            inputColColour = anyMatch ? juce::Colour::fromRGB(34, 197, 94) : juce::Colour::fromRGB(244, 63, 94);
        }
        else
        {
            inputColColour = juce::Colour::fromRGB(56, 189, 248);
        }
    }
    g.setColour(inputColColour);
    g.drawText("INPUT", inputColumnX - 22.0f, trebleTopY - lineSpacing * 1.7f, 44.0f, 14.0f, juce::Justification::centred);

    // Subtle vertical guide line for input column
    g.setColour(inputColColour.withAlpha(activeMidiNotes.empty() ? 0.15f : 0.45f));
    g.drawLine(inputColumnX, trebleTopY - lineSpacing * 0.4f, inputColumnX, bassBottomY + lineSpacing * 0.4f, 1.0f);

    // Draw active played MIDI notes in the dedicated Live Input column
    drawActivePlayedNotes(g, inputColumnX, trebleBottomY, bassBottomY, lineSpacing);

    // Section barline separating Live Input column from the Scrolling Melody Score
    const float scoreDividerX = staffLeftX + 158.0f;
    g.setColour(juce::Colour::fromRGBA(148, 163, 184, 140));
    g.drawLine(scoreDividerX, trebleTopY, scoreDividerX, trebleBottomY, 1.5f);
    g.drawLine(scoreDividerX, bassTopY, scoreDividerX, bassBottomY, 1.5f);

    // 9. Render Melody Note Sheet
    const double timestampMs = juce::Time::getMillisecondCounterHiRes();

    if (currentMelody != nullptr && !currentMelody->notes.empty())
    {
        const float notesStartX = scoreDividerX + 24.0f;
        const float availableWidth = staffRightX - notesStartX - 16.0f;
        const int totalNotes = static_cast<int>(currentMelody->notes.size());
        const float beatsPerMeasure = static_cast<float>(currentMelody->timeSigNum > 0 ? currentMelody->timeSigNum : 4);

        // Compute beat timeline for each note
        std::vector<float> noteStartBeats;
        noteStartBeats.reserve(static_cast<size_t>(totalNotes));
        float totalSongBeats = 0.0f;
        for (int i = 0; i < totalNotes; ++i)
        {
            noteStartBeats.push_back(totalSongBeats);
            totalSongBeats += currentMelody->notes[static_cast<size_t>(i)].duration;
        }

        const int totalMeasures = std::max(1, static_cast<int>(std::ceil(totalSongBeats / beatsPerMeasure - 0.001f)));

        // Proportional measure sizing
        const float minMeasureWidth = beatsPerMeasure * 38.0f + 32.0f;
        const float fitMeasureWidth = availableWidth / static_cast<float>(totalMeasures);
        const float measureWidth = std::max(minMeasureWidth, fitMeasureWidth);
        const float totalScoreWidth = totalMeasures * measureWidth;

        const float padLeft = 18.0f;
        const float padRight = 16.0f;
        const float beatSpanWidth = measureWidth - padLeft - padRight;
        const float pixelsPerBeat = beatSpanWidth / beatsPerMeasure;

        auto computeNoteX = [&](int index) -> float {
            if (index < 0 || index >= totalNotes) return notesStartX;
            const float beat = noteStartBeats[static_cast<size_t>(index)];
            const int m = static_cast<int>(beat / beatsPerMeasure);
            const float localBeat = beat - (static_cast<float>(m) * beatsPerMeasure);
            return notesStartX + static_cast<float>(m) * measureWidth + padLeft + (localBeat * pixelsPerBeat);
        };

        // Smooth horizontal scrolling calculation
        float scrollX = 0.0f;
        if (totalScoreWidth > availableWidth)
        {
            if (isMelodyFinished)
            {
                scrollX = totalScoreWidth - availableWidth + 24.0f;
            }
            else
            {
                const float activeX = computeNoteX(currentNoteIndex);
                const float focusX = availableWidth * 0.35f;
                scrollX = std::max(0.0f, activeX - focusX);
                const float maxScroll = totalScoreWidth - availableWidth + 24.0f;
                scrollX = std::min(scrollX, maxScroll);
            }
        }

        // Restrict note drawing to the score viewport so notes don't overlap clefs
        {
            juce::Graphics::ScopedSaveState clipSave(g);
            g.reduceClipRegion(juce::Rectangle<int>(
                static_cast<int>(notesStartX - 8.0f),
                0,
                static_cast<int>(availableWidth + 18.0f),
                static_cast<int>(h)
            ));

            // Measure Barlines
            drawMeasureBarlines(g, notesStartX, measureWidth, totalMeasures, scrollX, trebleTopY, bassBottomY, lineSpacing);

            // Draw all melody notes in sequence across the staff
            for (int i = 0; i < totalNotes; ++i)
            {
                const float noteX = computeNoteX(i) - scrollX;

                // Off-screen culling
                if (noteX < notesStartX - 50.0f || noteX > staffRightX + 50.0f)
                    continue;

                const bool isTarget = (i == currentNoteIndex && !isMelodyFinished);
                const bool isPast = (i < currentNoteIndex);

                const auto* eval = (noteEvaluations != nullptr && i < static_cast<int>(noteEvaluations->size()))
                                 ? &(*noteEvaluations)[static_cast<size_t>(i)]
                                 : nullptr;

                drawScoreNote(g, currentMelody->notes[static_cast<size_t>(i)], noteX,
                              trebleBottomY, bassBottomY, lineSpacing,
                              isTarget, isPast, timestampMs, eval);
            }
        }
    }
}

void GrandStaffComponent::drawStaffLines(juce::Graphics& g, float xLeft, float width, float trebleTopY, float bassTopY, float lineSpacing)
{
    g.setColour(juce::Colour::fromRGBA(148, 163, 184, 150)); // Slate 400

    // Treble 5 lines
    for (int i = 0; i < 5; ++i)
    {
        const float y = trebleTopY + i * lineSpacing;
        g.drawLine(xLeft, y, xLeft + width, y, 1.2f);
    }

    // Bass 5 lines
    for (int i = 0; i < 5; ++i)
    {
        const float y = bassTopY + i * lineSpacing;
        g.drawLine(xLeft, y, xLeft + width, y, 1.2f);
    }
}

void GrandStaffComponent::drawClefs(juce::Graphics& g, float clefX, float trebleTopY, float bassTopY, float lineSpacing)
{
    // Treble Clef
    g.setFont(juce::FontOptions(lineSpacing * 3.4f, juce::Font::bold));
    g.setColour(juce::Colour::fromRGB(226, 232, 240));
    g.drawText(juce::CharPointer_UTF8("\xF0\x9D\x84\x9E"), clefX - 10.0f, trebleTopY - lineSpacing * 0.2f, 38.0f, lineSpacing * 4.4f, juce::Justification::centred);

    // Bass Clef
    g.setFont(juce::FontOptions(lineSpacing * 2.8f, juce::Font::bold));
    g.drawText(juce::CharPointer_UTF8("\xF0\x9D\x84\xA2"), clefX - 10.0f, bassTopY - lineSpacing * 0.1f, 38.0f, lineSpacing * 3.6f, juce::Justification::centred);
}

void GrandStaffComponent::drawTimeSignature(juce::Graphics& g, float x, float trebleTopY, float bassTopY, float lineSpacing, int num, int den)
{
    g.setFont(juce::FontOptions(lineSpacing * 1.75f, juce::Font::bold));
    g.setColour(juce::Colour::fromRGB(203, 213, 225)); // Slate 300

    const juce::String numStr = juce::String(num);
    const juce::String denStr = juce::String(den);

    // Treble time signature
    g.drawText(numStr, x - 12.0f, trebleTopY + lineSpacing * 0.15f, 24.0f, lineSpacing * 1.8f, juce::Justification::centred);
    g.drawText(denStr, x - 12.0f, trebleTopY + lineSpacing * 2.05f, 24.0f, lineSpacing * 1.8f, juce::Justification::centred);

    // Bass time signature
    g.drawText(numStr, x - 12.0f, bassTopY + lineSpacing * 0.15f, 24.0f, lineSpacing * 1.8f, juce::Justification::centred);
    g.drawText(denStr, x - 12.0f, bassTopY + lineSpacing * 2.05f, 24.0f, lineSpacing * 1.8f, juce::Justification::centred);
}

void GrandStaffComponent::drawMeasureBarlines(juce::Graphics& g, float notesStartX, float measureWidth, int totalMeasures,
                                             float scrollX, float trebleTopY, float bassBottomY, float lineSpacing)
{
    if (currentMelody == nullptr) return;

    for (int m = 0; m < totalMeasures; ++m)
    {
        const float barX = notesStartX + static_cast<float>(m + 1) * measureWidth - scrollX;
        const bool isLastMeasure = (m == totalMeasures - 1);

        if (isLastMeasure)
        {
            // Final Double Barline (thin line + 4px gap + thick line)
            g.setColour(juce::Colour::fromRGBA(203, 213, 225, 200)); // Slate 300
            g.drawLine(barX - 5.0f, trebleTopY, barX - 5.0f, trebleTopY + lineSpacing * 4.0f, 1.4f);
            g.drawLine(barX - 5.0f, bassBottomY - lineSpacing * 4.0f, barX - 5.0f, bassBottomY, 1.4f);

            g.setColour(juce::Colour::fromRGBA(241, 245, 249, 240)); // Slate 100 bold
            g.drawLine(barX, trebleTopY, barX, trebleTopY + lineSpacing * 4.0f, 3.5f);
            g.drawLine(barX, bassBottomY - lineSpacing * 4.0f, barX, bassBottomY, 3.5f);
        }
        else
        {
            // Standard measure barline: drawn across treble and bass
            g.setColour(juce::Colour::fromRGBA(148, 163, 184, 110));
            g.drawLine(barX, trebleTopY, barX, trebleTopY + lineSpacing * 4.0f, 1.2f);
            g.drawLine(barX, bassBottomY - lineSpacing * 4.0f, barX, bassBottomY, 1.2f);
        }
    }
}

void GrandStaffComponent::drawScoreNote(juce::Graphics& g, const MelodyNote& note, float x,
                                       float trebleBottomY, float bassBottomY, float lineSpacing,
                                       bool isTarget, bool isPast, double timestampMs, const NoteEvaluation* eval)
{
    const auto info = MusicTheory::getNoteInfo(note.midi, preferFlats);
    const bool isTreble = (note.midi >= 60);
    const float stepHeight = lineSpacing * 0.5f;
    const float clefBottomY = isTreble ? trebleBottomY : bassBottomY;
    const int baseStep = isTreble ? 2 : -10; // E4 = step 2, G2 = step -10
    const float noteY = clefBottomY - static_cast<float>(info.diatonicStep - baseStep) * stepHeight;

    const float headW = lineSpacing * 1.30f;
    const float headH = lineSpacing * 0.92f;

    const bool hadMistakes = (eval != nullptr && eval->mistakeAttempts > 0);
    const bool hadTimingOffset = (eval != nullptr && (eval->timing == TimingRating::Early || eval->timing == TimingRating::Late));

    // 1. Determine note colors based on learning state
    juce::Colour noteColor;
    if (isPast)
    {
        if (hadMistakes)
        {
            // Note had pitch mistakes before being completed: highlighted in Rose / Red
            noteColor = juce::Colour::fromRGB(244, 63, 94); // Rose 500
        }
        else if (hadTimingOffset)
        {
            // Note timing was early or late: highlighted in Amber
            noteColor = juce::Colour::fromRGB(245, 158, 11); // Amber 500
        }
        else
        {
            // Clean note completed on first try with good timing: fresh emerald green
            noteColor = juce::Colour::fromRGB(34, 197, 94); // Emerald 500
        }
    }
    else if (isTarget)
    {
        // Current target note in bright sky blue (or rose if recently made a mistake)
        const bool isFlashing = (timestampMs - lastMistakeTimeMs < 450.0);
        noteColor = isFlashing ? juce::Colour::fromRGB(244, 63, 94) : juce::Colour::fromRGB(56, 189, 248);
    }
    else
    {
        // Upcoming notes in clear crisp slate-white
        noteColor = juce::Colour::fromRGB(203, 213, 225); // Slate 300
    }

    // 2. Draw Ledger Lines
    drawLedgerLines(g, x, info.diatonicStep, clefBottomY, lineSpacing, isTreble, noteColor.withAlpha(0.75f), headW);

    // 3. Target Note Pulse Halo & Caret Arrow
    if (isTarget)
    {
        const float pulse = 0.5f + 0.5f * std::sin(static_cast<float>(timestampMs) * 0.008f);

        // Pulsing radial aura
        g.setColour(noteColor.withAlpha(0.20f + 0.18f * pulse));
        g.fillEllipse(x - headW * (0.85f + 0.35f * pulse), noteY - headH * (0.85f + 0.35f * pulse),
                      headW * (1.7f + 0.7f * pulse), headH * (1.7f + 0.7f * pulse));

        // Outer focus ring
        g.setColour(noteColor.withAlpha(0.85f));
        g.drawEllipse(x - headW * 0.70f, noteY - headH * 0.70f, headW * 1.4f, headH * 1.4f, 2.0f);

        // Downward target caret pointer
        const float caretY = trebleBottomY - lineSpacing * 5.4f;
        juce::Path caret;
        caret.addTriangle(x - 6.0f, caretY, x + 6.0f, caretY, x, caretY + 8.0f);
        g.setColour(noteColor);
        g.fillPath(caret);

        // Prominent target note pitch badge above caret
        g.setFont(juce::FontOptions(12.0f, juce::Font::bold));
        g.setColour(juce::Colour::fromRGB(254, 240, 138)); // Amber 200
        g.drawText(info.fullName, x - 25.0f, caretY - 17.0f, 50.0f, 16.0f, juce::Justification::centred);

        // If wrong keys were struck while on this target, show retry counter
        if (hadMistakes)
        {
            g.setFont(juce::FontOptions(9.5f, juce::Font::bold));
            g.setColour(juce::Colour::fromRGB(251, 113, 133));
            g.drawText(juce::String(eval->mistakeAttempts) + " missed", x - 30.0f, caretY - 29.0f, 60.0f, 13.0f, juce::Justification::centred);
        }
    }

    // 4. Completed status indicator above note
    if (isPast)
    {
        const float badgeY = (isTreble ? trebleBottomY : bassBottomY) - lineSpacing * 5.1f;

        if (hadMistakes)
        {
            // Mistake badge: rose badge with '!' or '2x'
            const float badgeW = (eval->mistakeAttempts > 1) ? 20.0f : 15.0f;
            const float badgeH = 14.0f;
            g.setColour(juce::Colour::fromRGB(244, 63, 94).withAlpha(0.25f));
            g.fillRoundedRectangle(x - badgeW * 0.5f, badgeY, badgeW, badgeH, 4.0f);
            g.setColour(juce::Colour::fromRGB(244, 63, 94));
            g.drawRoundedRectangle(x - badgeW * 0.5f, badgeY, badgeW, badgeH, 4.0f, 1.0f);

            g.setFont(juce::FontOptions(9.5f, juce::Font::bold));
            const juce::String badgStr = (eval->mistakeAttempts > 1)
                ? (juce::String(eval->mistakeAttempts) + "x")
                : "!";
            g.drawText(badgStr, x - badgeW * 0.5f, badgeY, badgeW, badgeH, juce::Justification::centred);
        }
        else if (hadTimingOffset)
        {
            // Timing badge: subtle amber offset label (e.g. +75ms or -60ms)
            const float badgeW = 26.0f;
            const float badgeH = 13.0f;
            g.setColour(juce::Colour::fromRGB(245, 158, 11).withAlpha(0.2f));
            g.fillRoundedRectangle(x - badgeW * 0.5f, badgeY, badgeW, badgeH, 3.0f);
            g.setColour(juce::Colour::fromRGB(245, 158, 11));
            g.drawRoundedRectangle(x - badgeW * 0.5f, badgeY, badgeW, badgeH, 3.0f, 1.0f);

            g.setFont(juce::FontOptions(8.5f, juce::Font::bold));
            const int roundedOffset = static_cast<int>(std::round(eval->offsetMs));
            const juce::String offStr = (roundedOffset >= 0 ? "+" : "") + juce::String(roundedOffset);
            g.drawText(offStr, x - badgeW * 0.5f, badgeY, badgeW, badgeH, juce::Justification::centred);
        }
        else
        {
            // Clean green checkmark for perfect note
            juce::Path checkPath;
            checkPath.startNewSubPath(x - 5.0f, badgeY + 4.0f);
            checkPath.lineTo(x - 1.0f, badgeY + 8.0f);
            checkPath.lineTo(x + 5.0f, badgeY);
            g.setColour(juce::Colour::fromRGB(74, 222, 128)); // Green 400
            g.strokePath(checkPath, juce::PathStrokeType(1.8f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
        }
    }

    // 5. Tilted Elliptical Notehead
    juce::Path notePath;
    notePath.addEllipse(-headW * 0.5f, -headH * 0.5f, headW, headH);
    const juce::AffineTransform transform = juce::AffineTransform::rotation(-0.28f).translated(x, noteY);

    const bool isHollow = (note.duration >= 2.0f); // Half or Whole note is hollow
    if (isHollow)
    {
        g.setColour(noteColor);
        g.strokePath(notePath, juce::PathStrokeType(2.4f), transform);
    }
    else
    {
        g.setColour(noteColor);
        g.fillPath(notePath, transform);
    }

    // 5b. Augmentation Dot for dotted notes (e.g. 1.5f, 3.0f, 0.75f beats)
    const bool isDotted = (std::abs(note.duration - 1.5f) < 0.05f ||
                           std::abs(note.duration - 3.0f) < 0.05f ||
                           std::abs(note.duration - 0.75f) < 0.05f);
    if (isDotted)
    {
        const float dotRadius = lineSpacing * 0.20f;
        const float dotX = x + headW * 0.74f;
        // If notehead is on a staff line (even diatonic step), place dot in space above
        const bool onLine = (info.diatonicStep % 2 == 0);
        const float dotY = onLine ? (noteY - lineSpacing * 0.42f) : noteY;

        g.setColour(noteColor);
        g.fillEllipse(dotX - dotRadius, dotY - dotRadius, dotRadius * 2.0f, dotRadius * 2.0f);
    }

    // 6. Note Stem (unless whole note)
    const bool isWholeNote = (note.duration >= 4.0f);
    if (!isWholeNote)
    {
        const bool stemUp = (info.diatonicStep < (isTreble ? 6 : -6));
        const float stemX = stemUp ? (x + headW * 0.40f) : (x - headW * 0.40f);
        const float stemLen = lineSpacing * 3.3f;
        const float stemEndY = stemUp ? (noteY - stemLen) : (noteY + stemLen);

        g.setColour(noteColor);
        g.drawLine(stemX, noteY, stemX, stemEndY, 1.8f);

        // 6b. Eighth note (and sixteenth) flag
        if (note.duration <= 0.55f)
        {
            juce::Path flagPath;
            if (stemUp)
            {
                flagPath.startNewSubPath(stemX, stemEndY);
                flagPath.cubicTo(stemX + lineSpacing * 0.85f, stemEndY + lineSpacing * 0.6f,
                                 stemX + lineSpacing * 1.05f, stemEndY + lineSpacing * 1.5f,
                                 stemX + lineSpacing * 0.25f, stemEndY + lineSpacing * 2.2f);
                flagPath.cubicTo(stemX + lineSpacing * 0.65f, stemEndY + lineSpacing * 1.4f,
                                 stemX + lineSpacing * 0.55f, stemEndY + lineSpacing * 0.8f,
                                 stemX, stemEndY + lineSpacing * 0.5f);
                flagPath.closeSubPath();
            }
            else
            {
                flagPath.startNewSubPath(stemX, stemEndY);
                flagPath.cubicTo(stemX + lineSpacing * 0.85f, stemEndY - lineSpacing * 0.6f,
                                 stemX + lineSpacing * 1.05f, stemEndY - lineSpacing * 1.5f,
                                 stemX + lineSpacing * 0.25f, stemEndY - lineSpacing * 2.2f);
                flagPath.cubicTo(stemX + lineSpacing * 0.65f, stemEndY - lineSpacing * 1.4f,
                                 stemX + lineSpacing * 0.55f, stemEndY - lineSpacing * 0.8f,
                                 stemX, stemEndY - lineSpacing * 0.5f);
                flagPath.closeSubPath();
            }
            g.setColour(noteColor);
            g.fillPath(flagPath);
        }
    }

    // 7. Accidental (# or b)
    if (!info.isNatural)
    {
        g.setFont(juce::FontOptions(lineSpacing * 1.35f, juce::Font::bold));
        g.setColour(noteColor);
        const float accX = x - headW * 1.20f;
        g.drawText(info.accidental, accX - 10.0f, noteY - lineSpacing * 0.7f, 20.0f, lineSpacing * 1.4f, juce::Justification::centred);
    }

    // 8. Pitch Name Label below/above stem
    if (showLabels && !isTarget)
    {
        g.setFont(juce::FontOptions(10.5f, juce::Font::bold));
        juce::Colour labelColor = isPast ? (hadMistakes ? juce::Colour::fromRGB(251, 113, 133)
                                          : hadTimingOffset ? juce::Colour::fromRGB(251, 191, 36)
                                          : juce::Colour::fromRGB(187, 247, 208))
                                         : juce::Colour::fromRGB(148, 163, 184);
        g.setColour(labelColor);
        const bool stemUp = (info.diatonicStep < (isTreble ? 6 : -6));
        const float labelY = stemUp ? (noteY + lineSpacing * 0.85f) : (noteY - lineSpacing * 1.4f);
        g.drawText(info.fullName, x - 14.0f, labelY, 28.0f, 15.0f, juce::Justification::centred);
    }
}

void GrandStaffComponent::drawLedgerLines(juce::Graphics& g, float x, int diatonicStep, float clefBottomY, float lineSpacing, bool isTreble, juce::Colour color, float headW)
{
    const float ledgerWidth = headW * 1.75f;
    const float stepHeight = lineSpacing * 0.5f;
    g.setColour(color);

    if (isTreble)
    {
        // Middle C and below on Treble (step <= 0)
        // Step 0 = Middle C, Step -2 = A3, Step -4 = F3
        if (diatonicStep <= 0)
        {
            const int lowestStep = (diatonicStep % 2 == 0) ? diatonicStep : diatonicStep + 1;
            for (int s = 0; s >= lowestStep; s -= 2)
            {
                const float ly = clefBottomY - static_cast<float>(s - 2) * stepHeight;
                g.drawLine(x - ledgerWidth * 0.5f, ly, x + ledgerWidth * 0.5f, ly, 1.6f);
            }
        }
        // High notes above Treble (step >= 12, A5 and above)
        // Step 12 = A5, Step 14 = C6, Step 16 = E6
        else if (diatonicStep >= 12)
        {
            const int highestStep = (diatonicStep % 2 == 0) ? diatonicStep : diatonicStep - 1;
            for (int s = 12; s <= highestStep; s += 2)
            {
                const float ly = clefBottomY - static_cast<float>(s - 2) * stepHeight;
                g.drawLine(x - ledgerWidth * 0.5f, ly, x + ledgerWidth * 0.5f, ly, 1.6f);
            }
        }
    }
    else
    {
        // Middle C above Bass (step >= 0)
        if (diatonicStep >= 0)
        {
            const float ly = clefBottomY - static_cast<float>(0 - (-10)) * stepHeight;
            g.drawLine(x - ledgerWidth * 0.5f, ly, x + ledgerWidth * 0.5f, ly, 1.6f);
        }
        // Low notes below Bass (step <= -12, E2 and below)
        else if (diatonicStep <= -12)
        {
            const int lowestStep = (diatonicStep % 2 == 0) ? diatonicStep : diatonicStep + 1;
            for (int s = -12; s >= lowestStep; s -= 2)
            {
                const float ly = clefBottomY - static_cast<float>(s - (-10)) * stepHeight;
                g.drawLine(x - ledgerWidth * 0.5f, ly, x + ledgerWidth * 0.5f, ly, 1.6f);
            }
        }
    }
}

void GrandStaffComponent::drawActivePlayedNotes(juce::Graphics& g, float targetX, float trebleBottomY, float bassBottomY, float lineSpacing)
{
    if (activeMidiNotes.empty()) return;

    int idx = 0;
    const int count = static_cast<int>(activeMidiNotes.size());
    const float stepHeight = lineSpacing * 0.5f;

    for (int midi : activeMidiNotes)
    {
        const auto info = MusicTheory::getNoteInfo(midi, preferFlats);
        const bool isTreble = (midi >= 60);
        const float clefBottomY = isTreble ? trebleBottomY : bassBottomY;
        const int baseStep = isTreble ? 2 : -10;
        const float noteY = clefBottomY - static_cast<float>(info.diatonicStep - baseStep) * stepHeight;

        const float headW = lineSpacing * 1.35f;
        const float headH = lineSpacing * 0.95f;

        // Position slightly offset if multiple chord notes
        const float xOffset = (count > 1) ? (static_cast<float>(idx) - static_cast<float>(count - 1) * 0.5f) * 26.0f : 0.0f;
        const float noteX = targetX + xOffset;

        juce::Colour color = juce::Colour::fromRGB(56, 189, 248); // Electric Sky 400 default (free play)

        if (currentMelody != nullptr && !isMelodyFinished)
        {
            const bool matchesCurrent = (currentTargetNote != nullptr && midi == currentTargetNote->midi);
            const bool matchesPrev = (currentNoteIndex > 0
                                      && currentNoteIndex - 1 < static_cast<int>(currentMelody->notes.size())
                                      && midi == currentMelody->notes[static_cast<size_t>(currentNoteIndex - 1)].midi);

            if (matchesCurrent || matchesPrev)
            {
                color = juce::Colour::fromRGB(34, 197, 94); // Emerald 500 (correct note hit)
            }
            else
            {
                color = juce::Colour::fromRGB(244, 63, 94); // Rose 500 (wrong note struck)
            }
        }

        // Ledger lines
        drawLedgerLines(g, noteX, info.diatonicStep, clefBottomY, lineSpacing, isTreble, color.withAlpha(0.8f), headW);

        // Radiant active pulse glow
        g.setColour(color.withAlpha(0.35f));
        g.fillEllipse(noteX - headW * 0.9f, noteY - headH * 0.9f, headW * 1.8f, headH * 1.8f);

        // Filled active notehead
        juce::Path notePath;
        notePath.addEllipse(-headW * 0.5f, -headH * 0.5f, headW, headH);
        g.setColour(color);
        g.fillPath(notePath, juce::AffineTransform::rotation(-0.28f).translated(noteX, noteY));

        // Stem
        const bool stemUp = (info.diatonicStep < (isTreble ? 6 : -6));
        const float stemX = stemUp ? (noteX + headW * 0.40f) : (noteX - headW * 0.40f);
        const float stemLen = lineSpacing * 3.2f;
        const float stemEndY = stemUp ? (noteY - stemLen) : (noteY + stemLen);
        g.drawLine(stemX, noteY, stemX, stemEndY, 2.0f);

        // Accidental
        if (!info.isNatural)
        {
            g.setFont(juce::FontOptions(lineSpacing * 1.35f, juce::Font::bold));
            const float accX = noteX - headW * 1.20f;
            g.drawText(info.accidental, accX - 10.0f, noteY - lineSpacing * 0.7f, 20.0f, lineSpacing * 1.4f, juce::Justification::centred);
        }

        // Active pitch tag
        g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
        g.setColour(color.brighter(0.35f));
        const float labelY = stemUp ? (noteY + lineSpacing * 0.85f) : (noteY - lineSpacing * 1.4f);
        g.drawText(info.fullName, noteX - 25.0f, labelY, 50.0f, 15.0f, juce::Justification::centred);

        idx++;
    }
}

} // namespace MidiSheet
