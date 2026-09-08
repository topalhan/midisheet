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
    const bool melodyChanged = (currentMelody != melody);
    const bool becameFinished = (!isMelodyFinished && isFinished);

    currentMelody = melody;
    currentNoteIndex = noteIndex;
    isMelodyFinished = isFinished;

    if (melodyChanged)
    {
        activeReviewMistakeIndex = -1;
        manualScrollOffset = 0.0f;
    }

    if (becameFinished)
    {
        manualScrollOffset = 0.0f;
        auto mistakes = getMistakeNoteIndices();
        if (!mistakes.empty())
        {
            activeReviewMistakeIndex = mistakes.front();
            notifyReviewNoteChanged();
        }
    }

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

std::vector<int> GrandStaffComponent::getMistakeNoteIndices() const
{
    std::vector<int> indices;
    if (noteEvaluations != nullptr && currentMelody != nullptr)
    {
        for (size_t i = 0; i < noteEvaluations->size() && i < currentMelody->notes.size(); ++i)
        {
            if ((*noteEvaluations)[i].mistakeAttempts > 0)
                indices.push_back(static_cast<int>(i));
        }
    }
    return indices;
}

void GrandStaffComponent::notifyReviewNoteChanged()
{
    if (onReviewNoteChanged && currentMelody != nullptr && activeReviewMistakeIndex >= 0 &&
        activeReviewMistakeIndex < static_cast<int>(currentMelody->notes.size()))
    {
        const int targetMidi = currentMelody->notes[static_cast<size_t>(activeReviewMistakeIndex)].midi;
        int wrongMidi = -1;
        if (noteEvaluations != nullptr && activeReviewMistakeIndex < static_cast<int>(noteEvaluations->size()))
        {
            wrongMidi = (*noteEvaluations)[static_cast<size_t>(activeReviewMistakeIndex)].lastWrongMidi;
        }
        onReviewNoteChanged(activeReviewMistakeIndex, targetMidi, wrongMidi);
    }
}

void GrandStaffComponent::jumpToMistake(int mistakeIndex)
{
    activeReviewMistakeIndex = mistakeIndex;
    manualScrollOffset = 0.0f;
    notifyReviewNoteChanged();
    repaint();
}

void GrandStaffComponent::nextMistake()
{
    auto mistakes = getMistakeNoteIndices();
    if (mistakes.empty()) return;

    auto it = std::upper_bound(mistakes.begin(), mistakes.end(), activeReviewMistakeIndex);
    if (it != mistakes.end())
        activeReviewMistakeIndex = *it;
    else
        activeReviewMistakeIndex = mistakes.front();

    manualScrollOffset = 0.0f;
    notifyReviewNoteChanged();
    repaint();
}

void GrandStaffComponent::previousMistake()
{
    auto mistakes = getMistakeNoteIndices();
    if (mistakes.empty()) return;

    auto it = std::lower_bound(mistakes.begin(), mistakes.end(), activeReviewMistakeIndex);
    if (it != mistakes.begin())
    {
        --it;
        activeReviewMistakeIndex = *it;
    }
    else
    {
        activeReviewMistakeIndex = mistakes.back();
    }

    manualScrollOffset = 0.0f;
    notifyReviewNoteChanged();
    repaint();
}

void GrandStaffComponent::mouseDown(const juce::MouseEvent& event)
{
    const auto pos = event.position;

    // 1. Check Prev button click
    if (!prevMistakeBtnBounds.isEmpty() && prevMistakeBtnBounds.contains(pos))
    {
        previousMistake();
        return;
    }

    // 2. Check Next button click
    if (!nextMistakeBtnBounds.isEmpty() && nextMistakeBtnBounds.contains(pos))
    {
        nextMistake();
        return;
    }

    // 3. If melody finished, check if clicked on any note that had mistakes
    if (isMelodyFinished)
    {
        for (const auto& hb : noteHitboxes)
        {
            if (hb.first.contains(pos))
            {
                if (noteEvaluations != nullptr && hb.second < static_cast<int>(noteEvaluations->size()))
                {
                    if ((*noteEvaluations)[static_cast<size_t>(hb.second)].mistakeAttempts > 0)
                    {
                        jumpToMistake(hb.second);
                        return;
                    }
                }
            }
        }
    }

    // 4. Begin dragging for horizontal score scroll
    isUserDragging = true;
    dragStartX = pos.x;
    dragStartScroll = manualScrollOffset;
}

void GrandStaffComponent::mouseDrag(const juce::MouseEvent& event)
{
    if (isUserDragging)
    {
        const float deltaX = event.position.x - dragStartX;
        manualScrollOffset = dragStartScroll - deltaX;
        repaint();
    }
}

void GrandStaffComponent::mouseUp(const juce::MouseEvent& event)
{
    juce::ignoreUnused(event);
    isUserDragging = false;
}

void GrandStaffComponent::mouseWheelMove(const juce::MouseEvent& event, const juce::MouseWheelDetails& wheel)
{
    juce::ignoreUnused(event);
    const float delta = (std::abs(wheel.deltaX) > 0.001f ? wheel.deltaX : wheel.deltaY) * 60.0f;
    manualScrollOffset -= delta;
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
    noteHitboxes.clear();

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

        const auto mistakeIndices = getMistakeNoteIndices();
        const int mistakeNotesCount = static_cast<int>(mistakeIndices.size());

        if (isMelodyFinished)
        {
            if (mistakeNotesCount == 0)
            {
                prevMistakeBtnBounds = {};
                nextMistakeBtnBounds = {};
                g.setFont(juce::FontOptions(12.0f, juce::Font::bold));
                g.setColour(juce::Colour::fromRGB(74, 222, 128));
                g.drawText("Complete! Perfect run", w - 240.0f, headerY, 216.0f, 20.0f, juce::Justification::centredRight);
            }
            else
            {
                // Find current mistake order (1-based, e.g. "Mistake 1 of 2")
                int currentMistakeOrder = 1;
                for (size_t m = 0; m < mistakeIndices.size(); ++m)
                {
                    if (mistakeIndices[m] == activeReviewMistakeIndex)
                    {
                        currentMistakeOrder = static_cast<int>(m + 1);
                        break;
                    }
                }

                const float ctrlRight = w - 24.0f;
                const float btnW = 24.0f;
                const float btnH = 20.0f;
                const float pillW = 142.0f;

                nextMistakeBtnBounds = juce::Rectangle<float>(ctrlRight - btnW, headerY, btnW, btnH);
                prevMistakeBtnBounds = juce::Rectangle<float>(ctrlRight - btnW - pillW - 6.0f - btnW, headerY, btnW, btnH);
                const auto reviewPill = juce::Rectangle<float>(prevMistakeBtnBounds.getRight() + 3.0f, headerY, pillW, btnH);

                // Prev button
                g.setColour(juce::Colour::fromRGB(30, 41, 59));
                g.fillRoundedRectangle(prevMistakeBtnBounds, 4.0f);
                g.setColour(juce::Colour::fromRGB(71, 85, 105));
                g.drawRoundedRectangle(prevMistakeBtnBounds, 4.0f, 1.0f);
                {
                    const float cx = prevMistakeBtnBounds.getCentreX();
                    const float cy = prevMistakeBtnBounds.getCentreY();
                    juce::Path leftArrow;
                    leftArrow.addTriangle(cx + 3.0f, cy - 4.5f,
                                          cx + 3.0f, cy + 4.5f,
                                          cx - 3.5f, cy);
                    g.setColour(juce::Colour::fromRGB(226, 232, 240));
                    g.fillPath(leftArrow);
                }

                // Review Pill badge (e.g. "Mistake 1 of 2")
                g.setColour(juce::Colour::fromRGB(244, 63, 94).withAlpha(0.2f));
                g.fillRoundedRectangle(reviewPill, 4.0f);
                g.setColour(juce::Colour::fromRGB(244, 63, 94));
                g.drawRoundedRectangle(reviewPill, 4.0f, 1.0f);
                g.setColour(juce::Colour::fromRGB(251, 113, 133));
                g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
                g.drawText("Review " + juce::String(currentMistakeOrder) + " of " + juce::String(mistakeNotesCount),
                           reviewPill, juce::Justification::centred);

                // Next button
                g.setColour(juce::Colour::fromRGB(30, 41, 59));
                g.fillRoundedRectangle(nextMistakeBtnBounds, 4.0f);
                g.setColour(juce::Colour::fromRGB(71, 85, 105));
                g.drawRoundedRectangle(nextMistakeBtnBounds, 4.0f, 1.0f);
                {
                    const float cx = nextMistakeBtnBounds.getCentreX();
                    const float cy = nextMistakeBtnBounds.getCentreY();
                    juce::Path rightArrow;
                    rightArrow.addTriangle(cx - 3.0f, cy - 4.5f,
                                           cx - 3.0f, cy + 4.5f,
                                           cx + 3.5f, cy);
                    g.setColour(juce::Colour::fromRGB(226, 232, 240));
                    g.fillPath(rightArrow);
                }
            }
        }
        else
        {
            prevMistakeBtnBounds = {};
            nextMistakeBtnBounds = {};
            const juce::String progressText = "Note " + juce::String(displayNoteNum) + " of " + juce::String(totalNotes);
            g.setFont(juce::FontOptions(12.0f, juce::Font::bold));
            g.setColour(juce::Colour::fromRGB(56, 189, 248));
            g.drawText(progressText, w - 240.0f, headerY, 216.0f, 20.0f, juce::Justification::centredRight);
        }

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
        const float notesStartX = scoreDividerX + 28.0f;
        const float availableWidth = staffRightX - notesStartX - 16.0f;
        const int totalNotes = static_cast<int>(currentMelody->notes.size());
        const float beatsPerMeasure = static_cast<float>(currentMelody->timeSigNum > 0 ? currentMelody->timeSigNum : 4);

        // Precompute generous, non-linear duration spacing and barline locations
        std::vector<float> noteXPositions;
        noteXPositions.reserve(static_cast<size_t>(totalNotes));
        std::vector<float> barlineXPositions;

        float curX = notesStartX + 24.0f;
        float currentMeasureBeats = 0.0f;

        for (int i = 0; i < totalNotes; ++i)
        {
            const auto& currentNote = currentMelody->notes[static_cast<size_t>(i)];
            const auto info = MusicTheory::getNoteInfo(currentNote.midi, preferFlats);

            if (i > 0)
            {
                const auto& prevNote = currentMelody->notes[static_cast<size_t>(i - 1)];

                // Standard musical spacing: min 72px, scaled up generously with note duration
                float spacing = std::max(72.0f, 90.0f * std::pow(std::max(0.25f, prevNote.duration), 0.55f));

                // Extra buffer if current note has an accidental
                if (!info.isNatural)
                    spacing += 18.0f;

                // Check if measure boundary falls between prevNote and currentNote
                if (currentMeasureBeats + prevNote.duration >= beatsPerMeasure - 0.01f)
                {
                    // Place barline halfway in the gap
                    float barX = curX + spacing * 0.5f;
                    barlineXPositions.push_back(barX);
                    spacing += 32.0f; // Dedicated space around measure barline
                    currentMeasureBeats = std::fmod(currentMeasureBeats + prevNote.duration, beatsPerMeasure);
                }
                else
                {
                    currentMeasureBeats += prevNote.duration;
                }

                curX += spacing;
            }
            else
            {
                if (!info.isNatural)
                    curX += 16.0f;
            }

            noteXPositions.push_back(curX);
        }

        // Final double barline after the last note
        if (!noteXPositions.empty())
        {
            const auto& lastNote = currentMelody->notes.back();
            float lastSpacing = std::max(72.0f, 90.0f * std::pow(std::max(0.25f, lastNote.duration), 0.55f));
            barlineXPositions.push_back(noteXPositions.back() + lastSpacing * 0.75f);
        }

        // Total score length and smooth focal scrolling
        const float totalScoreWidth = (!noteXPositions.empty())
            ? (noteXPositions.back() - notesStartX + 140.0f)
            : availableWidth;

        float scrollX = 0.0f;
        if (totalScoreWidth > availableWidth)
        {
            if (isMelodyFinished)
            {
                if (activeReviewMistakeIndex >= 0 && activeReviewMistakeIndex < totalNotes)
                {
                    const float mistakeX = noteXPositions[static_cast<size_t>(activeReviewMistakeIndex)];
                    const float focusX = notesStartX + availableWidth * 0.40f;
                    scrollX = std::max(0.0f, mistakeX - focusX);
                    const float maxScroll = totalScoreWidth - availableWidth + 40.0f;
                    scrollX = std::min(scrollX, maxScroll);
                }
                else
                {
                    scrollX = totalScoreWidth - availableWidth + 40.0f;
                }
            }
            else
            {
                const float activeX = (currentNoteIndex >= 0 && currentNoteIndex < totalNotes)
                                    ? noteXPositions[static_cast<size_t>(currentNoteIndex)]
                                    : notesStartX;
                const float focusX = notesStartX + availableWidth * 0.30f; // Anchor active note at ~30%
                scrollX = std::max(0.0f, activeX - focusX);
                const float maxScroll = totalScoreWidth - availableWidth + 40.0f;
                scrollX = std::min(scrollX, maxScroll);
            }
        }

        // Apply manual drag / wheel offset if user scrolled
        const float maxScrollLimit = std::max(0.0f, totalScoreWidth - availableWidth + 40.0f);
        scrollX = std::clamp(scrollX + manualScrollOffset, 0.0f, maxScrollLimit);

        const float labelBaselineY = bassBottomY + lineSpacing * 1.05f;

        // Clip region to prevent notes from drawing over clefs or input column
        {
            juce::Graphics::ScopedSaveState clipSave(g);
            g.reduceClipRegion(juce::Rectangle<int>(
                static_cast<int>(notesStartX - 8.0f),
                0,
                static_cast<int>(availableWidth + 18.0f),
                static_cast<int>(h)
            ));

            // Measure Barlines with measure numbers
            drawMeasureBarlines(g, barlineXPositions, scrollX, trebleTopY, bassBottomY, lineSpacing);

            // Draw notes in sequence
            for (int i = 0; i < totalNotes; ++i)
            {
                const float noteX = noteXPositions[static_cast<size_t>(i)] - scrollX;

                // Record note hitbox for direct click inspection
                noteHitboxes.push_back({ juce::Rectangle<float>(noteX - 18.0f, trebleTopY - 25.0f, 36.0f, bassBottomY - trebleTopY + 50.0f), i });

                if (noteX < notesStartX - 60.0f || noteX > staffRightX + 60.0f)
                    continue;

                const bool isTarget = (i == currentNoteIndex && !isMelodyFinished);
                const bool isPast = (i < currentNoteIndex);
                const bool isReviewActive = (isMelodyFinished && i == activeReviewMistakeIndex);

                const auto* eval = (noteEvaluations != nullptr && i < static_cast<int>(noteEvaluations->size()))
                                 ? &(*noteEvaluations)[static_cast<size_t>(i)]
                                 : nullptr;

                drawScoreNote(g, currentMelody->notes[static_cast<size_t>(i)], noteX,
                              trebleBottomY, bassBottomY, lineSpacing,
                              isTarget, isPast, timestampMs, eval, labelBaselineY, isReviewActive);
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

void GrandStaffComponent::drawMeasureBarlines(juce::Graphics& g, const std::vector<float>& barlineXs,
                                             float scrollX, float trebleTopY, float bassBottomY, float lineSpacing)
{
    if (barlineXs.empty()) return;

    for (size_t m = 0; m < barlineXs.size(); ++m)
    {
        const float barX = barlineXs[m] - scrollX;
        const bool isLast = (m == barlineXs.size() - 1);

        if (isLast)
        {
            // Final Double Barline
            g.setColour(juce::Colour::fromRGBA(203, 213, 225, 200));
            g.drawLine(barX - 5.0f, trebleTopY, barX - 5.0f, trebleTopY + lineSpacing * 4.0f, 1.4f);
            g.drawLine(barX - 5.0f, bassBottomY - lineSpacing * 4.0f, barX - 5.0f, bassBottomY, 1.4f);

            g.setColour(juce::Colour::fromRGBA(241, 245, 249, 240));
            g.drawLine(barX, trebleTopY, barX, trebleTopY + lineSpacing * 4.0f, 3.5f);
            g.drawLine(barX, bassBottomY - lineSpacing * 4.0f, barX, bassBottomY, 3.5f);
        }
        else
        {
            // Standard Measure Barline
            g.setColour(juce::Colour::fromRGBA(148, 163, 184, 110));
            g.drawLine(barX, trebleTopY, barX, trebleTopY + lineSpacing * 4.0f, 1.2f);
            g.drawLine(barX, bassBottomY - lineSpacing * 4.0f, barX, bassBottomY, 1.2f);

            // Subtle Measure Number Pill above treble staff (e.g. "2", "3", "4")
            const auto measureNumPill = juce::Rectangle<float>(barX - 10.0f, trebleTopY - lineSpacing * 1.35f, 20.0f, 13.0f);
            g.setColour(juce::Colour::fromRGB(15, 23, 42));
            g.fillRoundedRectangle(measureNumPill, 3.0f);
            g.setColour(juce::Colour::fromRGBA(100, 116, 139, 140));
            g.drawRoundedRectangle(measureNumPill, 3.0f, 0.8f);
g.setFont(juce::FontOptions(8.5f, juce::Font::bold));
            g.setColour(juce::Colour::fromRGB(148, 163, 184));
            g.drawText(juce::String(static_cast<int>(m + 2)), measureNumPill.toNearestInt(), juce::Justification::centred);
        }
    }
}

void GrandStaffComponent::drawScoreNote(juce::Graphics& g, const MelodyNote& note, float x,
                                       float trebleBottomY, float bassBottomY, float lineSpacing,
                                       bool isTarget, bool isPast, double timestampMs, const NoteEvaluation* eval,
                                       float labelBaselineY, bool isReviewActive)
{
    const auto info = MusicTheory::getNoteInfo(note.midi, preferFlats);
    const bool isTreble = (note.midi >= 60);
    const float stepHeight = lineSpacing * 0.5f;
    const float clefBottomY = isTreble ? trebleBottomY : bassBottomY;
    const int baseStep = isTreble ? 2 : -10; // E4 = step 2, G2 = step -10
    const float noteY = clefBottomY - static_cast<float>(info.diatonicStep - baseStep) * stepHeight;

    const float headW = lineSpacing * 1.32f;
    const float headH = lineSpacing * 0.94f;

    const bool hadMistakes = (eval != nullptr && eval->mistakeAttempts > 0);
    const bool hadTimingOffset = (eval != nullptr && std::abs(eval->offsetMs) > 60.0);

    // 1. Determine notehead color
    juce::Colour noteColor;
    if (isTarget)
    {
        noteColor = juce::Colour::fromRGB(56, 189, 248); // Electric Sky 400
    }
    else if (isPast)
    {
        if (hadMistakes)
            noteColor = juce::Colour::fromRGB(244, 63, 94); // Rose 500
        else if (hadTimingOffset)
            noteColor = juce::Colour::fromRGB(245, 158, 11); // Amber 500
        else
            noteColor = juce::Colour::fromRGB(34, 197, 94); // Emerald 500
    }
    else
    {
        noteColor = juce::Colour::fromRGB(226, 232, 240); // Slate 200 (crisp, readable white)
    }

    // 2. Draw Ledger Lines
    drawLedgerLines(g, x, info.diatonicStep, clefBottomY, lineSpacing, isTreble, noteColor.withAlpha(0.75f), headW);

    // 3. Target Note Pulse Halo & Caret Pointer
    if (isTarget)
    {
        const float pulse = 0.5f + 0.5f * std::sin(static_cast<float>(timestampMs) * 0.008f);

        // Smooth radial aura behind notehead
        g.setColour(noteColor.withAlpha(0.18f + 0.16f * pulse));
        g.fillEllipse(x - headW * (0.8f + 0.3f * pulse), noteY - headH * (0.8f + 0.3f * pulse),
                      headW * (1.6f + 0.6f * pulse), headH * (1.6f + 0.6f * pulse));

        // Outer focus ring
        g.setColour(noteColor.withAlpha(0.85f));
        g.drawEllipse(x - headW * 0.68f, noteY - headH * 0.68f, headW * 1.36f, headH * 1.36f, 1.8f);

        // Downward target caret pointer
        const float caretY = trebleBottomY - lineSpacing * 5.3f;
        juce::Path caret;
        caret.addTriangle(x - 5.5f, caretY, x + 5.5f, caretY, x, caretY + 7.5f);
        g.setColour(noteColor);
        g.fillPath(caret);
    }

    // 3b. Active Review Mistake Pulse Halo
    if (isReviewActive)
    {
        const float pulse = 0.5f + 0.5f * std::sin(static_cast<float>(timestampMs) * 0.009f);

        // Vibrant glowing rose aura behind notehead
        g.setColour(juce::Colour::fromRGB(244, 63, 94).withAlpha(0.22f + 0.18f * pulse));
        g.fillEllipse(x - headW * (1.1f + 0.35f * pulse), noteY - headH * (1.1f + 0.35f * pulse),
                      headW * (2.2f + 0.7f * pulse), headH * (2.2f + 0.7f * pulse));

        // Bright rose outer beacon ring
        g.setColour(juce::Colour::fromRGB(251, 113, 133));
        g.drawEllipse(x - headW * 0.9f, noteY - headH * 0.9f, headW * 1.8f, headH * 1.8f, 2.0f);
    }

    // 4. Notehead
    juce::Path notePath;
    notePath.addEllipse(-headW * 0.5f, -headH * 0.5f, headW, headH);
    const juce::AffineTransform transform = juce::AffineTransform::rotation(-0.28f).translated(x, noteY);

    const bool isHollow = (note.duration >= 2.0f);
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

    // 4b. Augmentation Dot
    const bool isDotted = (std::abs(note.duration - 1.5f) < 0.05f ||
                           std::abs(note.duration - 3.0f) < 0.05f ||
                           std::abs(note.duration - 0.75f) < 0.05f);
    if (isDotted)
    {
        const float dotRadius = lineSpacing * 0.20f;
        const float dotX = x + headW * 0.74f;
        const bool onLine = (info.diatonicStep % 2 == 0);
        const float dotY = onLine ? (noteY - lineSpacing * 0.42f) : noteY;

        g.setColour(noteColor);
        g.fillEllipse(dotX - dotRadius, dotY - dotRadius, dotRadius * 2.0f, dotRadius * 2.0f);
    }

    // 5. Note Stem (unless whole note)
    const bool isWholeNote = (note.duration >= 4.0f);
    if (!isWholeNote)
    {
        const bool stemUp = (info.diatonicStep < (isTreble ? 6 : -6));
        const float stemX = stemUp ? (x + headW * 0.44f) : (x - headW * 0.44f);
        const float stemLen = lineSpacing * 3.1f;
        const float stemEndY = stemUp ? (noteY - stemLen) : (noteY + stemLen);

        g.setColour(noteColor);
        g.drawLine(stemX, noteY, stemX, stemEndY, 1.8f);

        // Eighth note flag
        if (note.duration <= 0.55f)
        {
            juce::Path flagPath;
            if (stemUp)
            {
                flagPath.startNewSubPath(stemX, stemEndY);
                flagPath.cubicTo(stemX + lineSpacing * 1.1f, stemEndY + lineSpacing * 0.8f,
                                 stemX + lineSpacing * 0.9f, stemEndY + lineSpacing * 2.0f,
                                 stemX, stemEndY + lineSpacing * 2.2f);
                flagPath.lineTo(stemX, stemEndY + lineSpacing * 1.7f);
                flagPath.cubicTo(stemX + lineSpacing * 0.6f, stemEndY + lineSpacing * 1.4f,
                                 stemX + lineSpacing * 0.7f, stemEndY + lineSpacing * 0.7f,
                                 stemX, stemEndY + lineSpacing * 0.5f);
                flagPath.closeSubPath();
            }
            else
            {
                flagPath.startNewSubPath(stemX, stemEndY);
                flagPath.cubicTo(stemX + lineSpacing * 1.1f, stemEndY - lineSpacing * 0.8f,
                                 stemX + lineSpacing * 0.9f, stemEndY - lineSpacing * 2.0f,
                                 stemX, stemEndY - lineSpacing * 2.2f);
                flagPath.lineTo(stemX, stemEndY - lineSpacing * 1.7f);
                flagPath.cubicTo(stemX + lineSpacing * 0.6f, stemEndY - lineSpacing * 1.4f,
                                 stemX + lineSpacing * 0.7f, stemEndY - lineSpacing * 0.7f,
                                 stemX, stemEndY - lineSpacing * 0.5f);
                flagPath.closeSubPath();
            }
            g.setColour(noteColor);
            g.fillPath(flagPath);
        }
    }

    // 6. Accidental (# or b)
    if (!info.isNatural)
    {
        g.setFont(juce::FontOptions(lineSpacing * 1.4f, juce::Font::bold));
        g.setColour(noteColor);
        const auto accBounds = juce::Rectangle<float>(x - headW * 1.05f - 14.0f, noteY - lineSpacing * 0.75f, 18.0f, lineSpacing * 1.5f);
        g.drawText(info.accidental, accBounds.toNearestInt(), juce::Justification::centred);
    }

    // 7. UNIFIED Pitch Name Label Lane (Clean horizontal baseline below the staff)
    if (showLabels)
    {
        if (isReviewActive)
        {
            // Highlighted active review pill
            const float pillW = 44.0f;
            const auto reviewPillBounds = juce::Rectangle<float>(x - pillW * 0.5f, labelBaselineY, pillW, 18.0f);
            g.setColour(juce::Colour::fromRGB(244, 63, 94)); // Rose 500
            g.fillRoundedRectangle(reviewPillBounds, 5.0f);
            g.setColour(juce::Colour::fromRGB(15, 23, 42)); // Dark text for maximum contrast
            g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
            g.drawText(info.fullName, reviewPillBounds.toNearestInt(), juce::Justification::centred);
        }
        else if (isTarget)
        {
            const auto pillBounds = juce::Rectangle<float>(x - 17.0f, labelBaselineY, 34.0f, 18.0f);
            // Illuminated Target Note Pill
            g.setColour(juce::Colour::fromRGB(56, 189, 248)); // Sky 400
            g.fillRoundedRectangle(pillBounds, 5.0f);
            g.setColour(juce::Colour::fromRGB(15, 23, 42)); // Dark text for contrast
            g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
            g.drawText(info.fullName, pillBounds.toNearestInt(), juce::Justification::centred);
        }
        else
        {
            const auto pillBounds = juce::Rectangle<float>(x - 17.0f, labelBaselineY, 34.0f, 18.0f);
            // Dark sleek pill with subtle border
            g.setColour(juce::Colour::fromRGB(15, 23, 42)); // Slate 900
            g.fillRoundedRectangle(pillBounds, 4.0f);

            juce::Colour textCol = isPast
                ? (hadMistakes ? juce::Colour::fromRGB(244, 63, 94)
                               : juce::Colour::fromRGB(34, 197, 94))
                : juce::Colour::fromRGB(148, 163, 184); // Slate 400

            juce::Colour borderCol = isPast
                ? (hadMistakes ? juce::Colour::fromRGB(244, 63, 94).withAlpha(0.4f)
                               : juce::Colour::fromRGB(34, 197, 94).withAlpha(0.35f))
                : juce::Colour::fromRGB(51, 65, 85);

            g.setColour(borderCol);
            g.drawRoundedRectangle(pillBounds, 4.0f, 1.0f);

            g.setFont(juce::FontOptions(10.0f, isPast ? juce::Font::bold : juce::Font::plain));
            g.setColour(textCol);
            g.drawText(info.fullName, pillBounds.toNearestInt(), juce::Justification::centred);
        }
    }

    // 8. Mistake Callout Badge / Flag
    if (hadMistakes)
    {
        const juce::String wrongName = (eval->lastWrongMidi >= 0)
            ? MusicTheory::getNoteInfo(eval->lastWrongMidi, preferFlats).fullName
            : "?";

        if (isReviewActive)
        {
            // Floating Callout Card positioned above treble staff
            const float calloutY = trebleBottomY - lineSpacing * 5.8f;
            juce::String calloutText = "Played " + wrongName + " (Expected " + info.fullName + ")";
            if (eval->mistakeAttempts > 1)
                calloutText += " [" + juce::String(eval->mistakeAttempts) + " tries]";
            if (eval->completed)
            {
                const int ro = static_cast<int>(std::round(eval->offsetMs));
                calloutText += " | " + (ro >= 0 ? juce::String("+") : juce::String()) + juce::String(ro) + "ms";
            }

            g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
            const float textWidth = g.getCurrentFont().getStringWidth(calloutText);
            const float iconSize = 13.0f;
            const float iconGap = 6.0f;
            const float padX = 8.0f;
            const float cardW = padX * 2.0f + iconSize + iconGap + textWidth;
            const float cardH = 22.0f;
            const auto cardRect = juce::Rectangle<float>(x - cardW * 0.5f, calloutY, cardW, cardH);

            // Card background & glowing rose border
            g.setColour(juce::Colour::fromRGB(15, 23, 42)); // Slate 900
            g.fillRoundedRectangle(cardRect, 6.0f);
            g.setColour(juce::Colour::fromRGB(244, 63, 94)); // Rose 500
            g.drawRoundedRectangle(cardRect, 6.0f, 1.5f);

            // Downward pointing arrow to notehead
            juce::Path arrow;
            arrow.addTriangle(x - 5.0f, cardRect.getBottom(), x + 5.0f, cardRect.getBottom(), x, cardRect.getBottom() + 6.0f);
            g.setColour(juce::Colour::fromRGB(244, 63, 94));
            g.fillPath(arrow);

            // Draw crisp red circle with white 'X' icon
            const float iconX = cardRect.getX() + padX;
            const float iconY = cardRect.getY() + (cardH - iconSize) * 0.5f;
            const auto iconRect = juce::Rectangle<float>(iconX, iconY, iconSize, iconSize);

            g.setColour(juce::Colour::fromRGB(244, 63, 94)); // Rose 500
            g.fillEllipse(iconRect);

            // White 'X' inside circle
            g.setColour(juce::Colours::white);
            const float inset = 3.5f;
            g.drawLine(iconRect.getX() + inset, iconRect.getY() + inset,
                       iconRect.getRight() - inset, iconRect.getBottom() - inset, 1.6f);
            g.drawLine(iconRect.getRight() - inset, iconRect.getY() + inset,
                       iconRect.getX() + inset, iconRect.getBottom() - inset, 1.6f);

            // Callout text
            const auto textRect = juce::Rectangle<float>(iconRect.getRight() + iconGap, cardRect.getY(), textWidth + 4.0f, cardH);
            g.setColour(juce::Colour::fromRGB(254, 205, 211)); // Rose 200
            g.drawText(calloutText, textRect, juce::Justification::centredLeft);
        }
        else if (isMelodyFinished)
        {
            // Compact flag for other mistake notes across the piece
            const float flagY = trebleBottomY - lineSpacing * 5.0f;
            const juce::String flagText = wrongName;
            g.setFont(juce::FontOptions(10.0f, juce::Font::bold));
            const float textWidth = g.getCurrentFont().getStringWidth(flagText);
            const float iconSize = 10.0f;
            const float iconGap = 4.0f;
            const float padX = 6.0f;
            const float flagW = padX * 2.0f + iconSize + iconGap + textWidth;
            const float flagH = 16.0f;
            const auto flagRect = juce::Rectangle<float>(x - flagW * 0.5f, flagY, flagW, flagH);

            g.setColour(juce::Colour::fromRGB(15, 23, 42));
            g.fillRoundedRectangle(flagRect, 4.0f);
            g.setColour(juce::Colour::fromRGB(244, 63, 94).withAlpha(0.7f));
            g.drawRoundedRectangle(flagRect, 4.0f, 1.0f);

            // Mini red circle with X
            const float iconX = flagRect.getX() + padX;
            const float iconY = flagRect.getY() + (flagH - iconSize) * 0.5f;
            const auto iconRect = juce::Rectangle<float>(iconX, iconY, iconSize, iconSize);

            g.setColour(juce::Colour::fromRGB(244, 63, 94));
            g.fillEllipse(iconRect);

            g.setColour(juce::Colours::white);
            const float inset = 2.5f;
            g.drawLine(iconRect.getX() + inset, iconRect.getY() + inset,
                       iconRect.getRight() - inset, iconRect.getBottom() - inset, 1.2f);
            g.drawLine(iconRect.getRight() - inset, iconRect.getY() + inset,
                       iconRect.getX() + inset, iconRect.getBottom() - inset, 1.2f);

            // Wrong note text
            const auto textRect = juce::Rectangle<float>(iconRect.getRight() + iconGap, flagRect.getY(), textWidth + 2.0f, flagH);
            g.setColour(juce::Colour::fromRGB(251, 113, 133));
            g.drawText(flagText, textRect, juce::Justification::centredLeft);
        }
    }

    // 9. Per-Note Timing Accuracy Badge (Milliseconds Offset)
    if (isPast && !hadMistakes && eval != nullptr && eval->completed)
    {
        const int roundedOffset = static_cast<int>(std::round(eval->offsetMs));
        const juce::String offStr = (roundedOffset >= 0 ? "+" : "") + juce::String(roundedOffset) + "ms";

        const bool stemUp = (info.diatonicStep < (isTreble ? 6 : -6));
        const float topOfNote = noteY - (stemUp ? lineSpacing * 3.2f : headH * 0.5f);
        const float staffTopY = clefBottomY - lineSpacing * 4.0f;
        const float badgeY = std::min(staffTopY - lineSpacing * 1.1f, topOfNote - lineSpacing * 0.9f);

        g.setFont(juce::FontOptions(9.0f, juce::Font::bold));
        const float textW = g.getCurrentFont().getStringWidth(offStr);
        const float badgeW = textW + 8.0f;
        const float badgeH = 14.0f;
        const auto badgeRect = juce::Rectangle<float>(x - badgeW * 0.5f, badgeY, badgeW, badgeH);

        juce::Colour bgCol;
        juce::Colour borderCol;
        juce::Colour textCol;

        const int absOffset = std::abs(roundedOffset);
        if (absOffset <= 65)
        {
            // Tight / On-tempo (Emerald)
            bgCol = juce::Colour::fromRGB(34, 197, 94).withAlpha(0.20f);
            borderCol = juce::Colour::fromRGB(34, 197, 94).withAlpha(0.65f);
            textCol = juce::Colour::fromRGB(134, 239, 172);
        }
        else if (absOffset <= 150)
        {
            // Early / Late (Amber)
            bgCol = juce::Colour::fromRGB(245, 158, 11).withAlpha(0.22f);
            borderCol = juce::Colour::fromRGB(245, 158, 11).withAlpha(0.80f);
            textCol = juce::Colour::fromRGB(253, 224, 71);
        }
        else
        {
            // Off-beat (Rose / Orange)
            bgCol = juce::Colour::fromRGB(244, 63, 94).withAlpha(0.22f);
            borderCol = juce::Colour::fromRGB(244, 63, 94).withAlpha(0.80f);
            textCol = juce::Colour::fromRGB(254, 205, 211);
        }

        g.setColour(juce::Colour::fromRGB(15, 23, 42)); // Base backing for dark contrast
        g.fillRoundedRectangle(badgeRect, 3.5f);
        g.setColour(bgCol);
        g.fillRoundedRectangle(badgeRect, 3.5f);
        g.setColour(borderCol);
        g.drawRoundedRectangle(badgeRect, 3.5f, 1.0f);
        g.setColour(textCol);
        g.drawText(offStr, badgeRect, juce::Justification::centred);
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
            const auto accBounds = juce::Rectangle<float>(accX - 10.0f, noteY - lineSpacing * 0.7f, 20.0f, lineSpacing * 1.4f);
            g.drawText(info.accidental, accBounds.toNearestInt(), juce::Justification::centred);
        }

        // Active pitch tag
        g.setFont(juce::FontOptions(11.0f, juce::Font::bold));
        g.setColour(color.brighter(0.35f));
        const float labelY = stemUp ? (noteY + lineSpacing * 0.85f) : (noteY - lineSpacing * 1.4f);
        const auto tagBounds = juce::Rectangle<float>(noteX - 25.0f, labelY, 50.0f, 15.0f);
        g.drawText(info.fullName, tagBounds.toNearestInt(), juce::Justification::centred);

        idx++;
    }
}

} // namespace MidiSheet
