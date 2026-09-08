#include "MelodyDatabase.h"
#include "MusicTheory.h"
#include <algorithm>
#include <cmath>

namespace MidiSheet
{

std::vector<Melody>& MelodyDatabase::getCustomMelodiesList()
{
    static std::vector<Melody> customList;
    return customList;
}

std::vector<Melody>& MelodyDatabase::getCombinedMelodiesList()
{
    static std::vector<Melody> combinedList;
    return combinedList;
}

void MelodyDatabase::rebuildCombinedList()
{
    auto& combined = getCombinedMelodiesList();
    combined.clear();

    // Custom imported melodies appear at the top
    for (const auto& m : getCustomMelodiesList())
        combined.push_back(m);

    static const std::vector<Melody> library = createMelodyLibrary();
    for (const auto& m : library)
        combined.push_back(m);
}

const std::vector<Melody>& MelodyDatabase::getAllMelodies()
{
    auto& combined = getCombinedMelodiesList();
    if (combined.empty())
        rebuildCombinedList();
    return combined;
}

const Melody* MelodyDatabase::getMelodyById(const juce::String& id)
{
    const auto& list = getAllMelodies();
    for (const auto& m : list)
    {
        if (m.id == id)
            return &m;
    }
    return list.empty() ? nullptr : &list[0];
}

void MelodyDatabase::addCustomMelody(const Melody& melody)
{
    auto& custom = getCustomMelodiesList();
    for (auto& existing : custom)
    {
        if (existing.id == melody.id)
        {
            existing = melody;
            rebuildCombinedList();
            return;
        }
    }
    custom.insert(custom.begin(), melody);
    rebuildCombinedList();
}

void MelodyDatabase::removeCustomMelody(const juce::String& id)
{
    auto& custom = getCustomMelodiesList();
    custom.erase(std::remove_if(custom.begin(), custom.end(),
        [&id](const Melody& m) { return m.id == id; }), custom.end());
    rebuildCombinedList();
}

static juce::String getGMInstrumentName(int program)
{
    static const char* const names[] = {
        "Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano", "Honky-tonk Piano",
        "Electric Piano 1", "Electric Piano 2", "Harpsichord", "Clavinet",
        "Celesta", "Glockenspiel", "Music Box", "Vibraphone", "Marimba", "Xylophone", "Tubular Bells", "Dulcimer",
        "Drawbar Organ", "Percussive Organ", "Rock Organ", "Church Organ", "Reed Organ", "Accordion", "Harmonica", "Tango Accordion",
        "Acoustic Guitar (nylon)", "Acoustic Guitar (steel)", "Electric Guitar (jazz)", "Electric Guitar (clean)",
        "Electric Guitar (muted)", "Overdriven Guitar", "Distortion Guitar", "Guitar Harmonics",
        "Acoustic Bass", "Electric Bass (finger)", "Electric Bass (pick)", "Fretless Bass",
        "Slap Bass 1", "Slap Bass 2", "Synth Bass 1", "Synth Bass 2",
        "Violin", "Viola", "Cello", "Contrabass", "Tremolo Strings", "Pizzicato Strings", "Orchestral Harp", "Timpani",
        "String Ensemble 1", "String Ensemble 2", "Synth Strings 1", "Synth Strings 2",
        "Choir Aahs", "Voice Oohs", "Synth Choir", "Orchestra Hit",
        "Trumpet", "Trombone", "Tuba", "Muted Trumpet", "French Horn", "Brass Section", "Synth Brass 1", "Synth Brass 2",
        "Soprano Sax", "Alto Sax", "Tenor Sax", "Baritone Sax", "Oboe", "English Horn", "Bassoon", "Clarinet",
        "Piccolo", "Flute", "Recorder", "Pan Flute", "Blown Bottle", "Shakuhachi", "Whistle", "Ocarina",
        "Lead 1 (square)", "Lead 2 (sawtooth)", "Lead 3 (calliope)", "Lead 4 (chiff)",
        "Lead 5 (charang)", "Lead 6 (voice)", "Lead 7 (fifths)", "Lead 8 (bass + lead)",
        "Pad 1 (new age)", "Pad 2 (warm)", "Pad 3 (polysynth)", "Pad 4 (choir)",
        "Pad 5 (bowed)", "Pad 6 (metallic)", "Pad 7 (halo)", "Pad 8 (sweep)"
    };
    if (program >= 0 && program < static_cast<int>(sizeof(names) / sizeof(names[0])))
        return names[program];
    return "Instrument";
}

std::vector<MidiChannelInfo> MelodyDatabase::inspectMidiChannels(const juce::File& file)
{
    std::vector<MidiChannelInfo> result;
    if (!file.existsAsFile())
        return result;

    juce::FileInputStream inputStream(file);
    if (!inputStream.openedOk())
        return result;

    juce::MidiFile midiFile;
    if (!midiFile.readFrom(inputStream))
        return result;

    struct ChannelStat {
        int noteCount = 0;
        juce::String trackName;
        int program = -1;
        int lowestMidi = 127;
        int highestMidi = 0;
    };
    std::vector<ChannelStat> stats(17); // Channels 1-16

    for (int t = 0; t < midiFile.getNumTracks(); ++t)
    {
        const auto* track = midiFile.getTrack(t);
        if (track == nullptr) continue;

        juce::String trkName;
        for (int e = 0; e < track->getNumEvents(); ++e)
        {
            const auto& msg = track->getEventPointer(e)->message;
            if (msg.isTextMetaEvent())
            {
                juce::String txt = msg.getTextFromTextMetaEvent().trim();
                if (txt.isNotEmpty() && trkName.isEmpty())
                    trkName = txt;
            }
        }

        for (int e = 0; e < track->getNumEvents(); ++e)
        {
            const auto& msg = track->getEventPointer(e)->message;
            int ch = msg.getChannel();
            if (ch >= 1 && ch <= 16)
            {
                if (trkName.isNotEmpty() && stats[ch].trackName.isEmpty())
                    stats[ch].trackName = trkName;

                if (msg.isProgramChange())
                {
                    stats[ch].program = msg.getProgramChangeNumber();
                }
                else if (msg.isNoteOn())
                {
                    stats[ch].noteCount++;
                    int note = msg.getNoteNumber();
                    if (note < stats[ch].lowestMidi) stats[ch].lowestMidi = note;
                    if (note > stats[ch].highestMidi) stats[ch].highestMidi = note;
                }
            }
        }
    }

    for (int ch = 1; ch <= 16; ++ch)
    {
        if (stats[ch].noteCount > 0)
        {
            MidiChannelInfo info;
            info.channelNumber = ch;
            info.noteCount = stats[ch].noteCount;
            info.trackName = stats[ch].trackName;
            info.lowestMidi = stats[ch].lowestMidi;
            info.highestMidi = stats[ch].highestMidi;
            info.isDrum = (ch == 10);

            if (info.isDrum)
                info.instrumentName = "Drums & Percussion";
            else if (stats[ch].program >= 0)
                info.instrumentName = getGMInstrumentName(stats[ch].program);
            else
                info.instrumentName = "Instrument";

            result.push_back(info);
        }
    }

    return result;
}

bool MelodyDatabase::loadMidiFile(const juce::File& file, juce::String& outMelodyId, int targetChannel)
{
    if (!file.existsAsFile())
        return false;

    juce::FileInputStream inputStream(file);
    if (!inputStream.openedOk())
        return false;

    juce::MidiFile midiFile;
    if (!midiFile.readFrom(inputStream))
        return false;

    short timeFormat = midiFile.getTimeFormat();
    double ticksPerQuarter = (timeFormat > 0) ? static_cast<double>(timeFormat) : 480.0;

    juce::MidiMessageSequence sequence;

    const bool isSpecificChannel = (targetChannel >= 1 && targetChannel <= 16);
    if (isSpecificChannel)
    {
        for (int t = 0; t < midiFile.getNumTracks(); ++t)
        {
            if (const auto* track = midiFile.getTrack(t))
            {
                for (int e = 0; e < track->getNumEvents(); ++e)
                {
                    const auto* holder = track->getEventPointer(e);
                    if (holder->message.getChannel() == targetChannel || holder->message.isMetaEvent())
                    {
                        sequence.addEvent(holder->message);
                    }
                }
            }
        }
    }
    else
    {
        int bestTrack = 0;
        int maxNoteEvents = 0;
        for (int t = 0; t < midiFile.getNumTracks(); ++t)
        {
            const auto* trackSeq = midiFile.getTrack(t);
            if (trackSeq != nullptr)
            {
                int noteCount = 0;
                for (int e = 0; e < trackSeq->getNumEvents(); ++e)
                {
                    if (trackSeq->getEventPointer(e)->message.isNoteOn())
                        noteCount++;
                }
                if (noteCount > maxNoteEvents)
                {
                    maxNoteEvents = noteCount;
                    bestTrack = t;
                }
            }
        }

        if (maxNoteEvents > 0 && midiFile.getTrack(bestTrack) != nullptr)
        {
            sequence.addSequence(*midiFile.getTrack(bestTrack), 0.0);
        }
        else
        {
            for (int t = 0; t < midiFile.getNumTracks(); ++t)
            {
                if (const auto* track = midiFile.getTrack(t))
                    sequence.addSequence(*track, 0.0);
            }
        }
    }

    sequence.updateMatchedPairs();

    if (sequence.getNumEvents() == 0)
        return false;

    Melody m;
    m.id = "custom-" + juce::String(juce::Time::currentTimeMillis());
    m.title = file.getFileNameWithoutExtension();
    m.composer = "Imported MIDI";
    m.difficulty = "Medium";
    m.bpm = 120;
    m.timeSigNum = 4;
    m.timeSigDen = 4;
    m.key = "C Major";
    m.isCustom = true;

    // Extract meta info (tempo, time signature, track name)
    for (int i = 0; i < sequence.getNumEvents(); ++i)
    {
        const auto& msg = sequence.getEventPointer(i)->message;
        if (msg.isTempoMetaEvent())
        {
            double tempoSec = msg.getTempoSecondsPerQuarterNote();
            if (tempoSec > 0.0)
            {
                int bpmVal = static_cast<int>(std::round(60.0 / tempoSec));
                m.bpm = juce::jlimit(40, 240, bpmVal);
            }
        }
        else if (msg.isTimeSignatureMetaEvent())
        {
            int num = 4, den = 4;
            msg.getTimeSignatureInfo(num, den);
            m.timeSigNum = num;
            m.timeSigDen = den;
        }
        else if (msg.isTextMetaEvent() && !isSpecificChannel)
        {
            juce::String text = msg.getTextFromTextMetaEvent().trim();
            if (text.isNotEmpty() && text.length() > 1 && m.title == file.getFileNameWithoutExtension())
            {
                m.title = text;
            }
        }
    }

    if (isSpecificChannel)
    {
        m.title = file.getFileNameWithoutExtension() + " (Ch " + juce::String(targetChannel) + ")";
    }

    struct RawNote {
        int midi = 60;
        double startTick = 0.0;
        float duration = 1.0f;
    };
    std::vector<RawNote> rawNotes;

    for (int i = 0; i < sequence.getNumEvents(); ++i)
    {
        const auto* holder = sequence.getEventPointer(i);
        const auto& msg = holder->message;
        if (msg.isNoteOn())
        {
            double startTick = msg.getTimeStamp();
            double endTick = holder->noteOffObject != nullptr
                ? holder->noteOffObject->message.getTimeStamp()
                : startTick + ticksPerQuarter;

            float rawDuration = static_cast<float>((endTick - startTick) / ticksPerQuarter);
            
            // Quantize duration to musical subdivisions (min 0.25 beats)
            float quantized = std::max(0.25f, std::round(rawDuration * 4.0f) / 4.0f);
            if (quantized > 4.0f) quantized = 4.0f;

            RawNote rn;
            rn.midi = msg.getNoteNumber();
            rn.startTick = startTick;
            rn.duration = quantized;
            rawNotes.push_back(rn);
        }
    }

    if (rawNotes.empty())
        return false;

    // Sort chronologically
    std::sort(rawNotes.begin(), rawNotes.end(), [](const RawNote& a, const RawNote& b) {
        if (std::abs(a.startTick - b.startTick) < 0.001)
            return a.midi > b.midi; // Highest note first for chords
        return a.startTick < b.startTick;
    });

    // Chord filter: keep highest note at each start tick
    double lastTick = -9999.0;
    double tickTolerance = ticksPerQuarter / 8.0;

    for (const auto& rn : rawNotes)
    {
        if (m.notes.size() >= 80) // Limit practice length
            break;

        if (!m.notes.empty() && std::abs(rn.startTick - lastTick) <= tickTolerance)
        {
            continue;
        }

        MelodyNote mn;
        mn.midi = rn.midi;
        mn.duration = rn.duration;
        mn.name = MusicTheory::getNoteInfo(rn.midi).fullName;
        m.notes.push_back(mn);
        lastTick = rn.startTick;
    }

    if (m.notes.empty())
        return false;

    if (isSpecificChannel)
        m.description = "Imported from " + file.getFileName() + " [Ch " + juce::String(targetChannel) + "] (" + juce::String(m.notes.size()) + " notes)";
    else
        m.description = "Imported from " + file.getFileName() + " (" + juce::String(m.notes.size()) + " notes)";

    // Estimate difficulty
    if (m.notes.size() > 50 || m.bpm >= 130)
        m.difficulty = "Hard";
    else if (m.notes.size() > 25 || m.bpm >= 115)
        m.difficulty = "Medium";
    else
        m.difficulty = "Easy";

    outMelodyId = m.id;
    addCustomMelody(m);
    return true;
}

std::vector<Melody> MelodyDatabase::createMelodyLibrary()
{
    std::vector<Melody> list;

    // 1. Ode to Joy
    {
        Melody m;
        m.id = "ode-to-joy";
        m.title = "Ode to Joy";
        m.composer = "L. van Beethoven";
        m.difficulty = "Easy";
        m.bpm = 108;
        m.timeSigNum = 4;
        m.timeSigDen = 4;
        m.key = "C Major";
        m.description = "The triumphant anthem from Symphony No. 9";
        m.notes = {
            { 64, 1.0f, "E4" }, { 64, 1.0f, "E4" }, { 65, 1.0f, "F4" }, { 67, 1.0f, "G4" },
            { 67, 1.0f, "G4" }, { 65, 1.0f, "F4" }, { 64, 1.0f, "E4" }, { 62, 1.0f, "D4" },
            { 60, 1.0f, "C4" }, { 60, 1.0f, "C4" }, { 62, 1.0f, "D4" }, { 64, 1.0f, "E4" },
            { 64, 1.5f, "E4" }, { 62, 0.5f, "D4" }, { 62, 2.0f, "D4" }
        };
        list.push_back(m);
    }

    // 2. Twinkle, Twinkle, Little Star
    {
        Melody m;
        m.id = "twinkle-twinkle";
        m.title = "Twinkle, Twinkle, Little Star";
        m.composer = "Traditional";
        m.difficulty = "Easy";
        m.bpm = 96;
        m.timeSigNum = 4;
        m.timeSigDen = 4;
        m.key = "C Major";
        m.description = "Universal childhood classic based on French melody";
        m.notes = {
            { 60, 1.0f, "C4" }, { 60, 1.0f, "C4" }, { 67, 1.0f, "G4" }, { 67, 1.0f, "G4" },
            { 69, 1.0f, "A4" }, { 69, 1.0f, "A4" }, { 67, 2.0f, "G4" },
            { 65, 1.0f, "F4" }, { 65, 1.0f, "F4" }, { 64, 1.0f, "E4" }, { 64, 1.0f, "E4" },
            { 62, 1.0f, "D4" }, { 62, 1.0f, "D4" }, { 60, 2.0f, "C4" }
        };
        list.push_back(m);
    }

    // 3. Canon in D
    {
        Melody m;
        m.id = "canon-in-d";
        m.title = "Canon in D";
        m.composer = "J. Pachelbel";
        m.difficulty = "Easy";
        m.bpm = 76;
        m.timeSigNum = 4;
        m.timeSigDen = 4;
        m.key = "D Major";
        m.description = "Timeless Baroque progression and melody";
        m.notes = {
            { 74, 2.0f, "D5" }, { 73, 2.0f, "C#5" }, { 71, 2.0f, "B4" }, { 69, 2.0f, "A4" },
            { 67, 2.0f, "G4" }, { 66, 2.0f, "F#4" }, { 67, 2.0f, "G4" }, { 69, 2.0f, "A4" }
        };
        list.push_back(m);
    }

    // 4. Fur Elise
    {
        Melody m;
        m.id = "fur-elise";
        m.title = juce::String::fromUTF8("F\xC3\xBCr Elise");
        m.composer = "L. van Beethoven";
        m.difficulty = "Medium";
        m.bpm = 132;
        m.timeSigNum = 3;
        m.timeSigDen = 8;
        m.key = "A Minor";
        m.description = "Iconic Romantic masterpiece with chromatic motif";
        m.notes = {
            { 76, 1.0f, "E5" }, { 75, 1.0f, "D#5" }, { 76, 1.0f, "E5" }, { 75, 1.0f, "D#5" },
            { 76, 1.0f, "E5" }, { 71, 1.0f, "B4" }, { 74, 1.0f, "D5" }, { 72, 1.0f, "C5" },
            { 69, 2.0f, "A4" }
        };
        list.push_back(m);
    }

    // 5. The Entertainer
    {
        Melody m;
        m.id = "the-entertainer";
        m.title = "The Entertainer";
        m.composer = "S. Joplin";
        m.difficulty = "Medium";
        m.bpm = 88;
        m.timeSigNum = 2;
        m.timeSigDen = 4;
        m.key = "C Major";
        m.description = "Celebrated ragtime standard with syncopated bounce";
        m.notes = {
            { 62, 0.5f, "D4" }, { 63, 0.5f, "D#4" }, { 64, 0.5f, "E4" }, { 72, 1.0f, "C5" },
            { 64, 0.5f, "E4" }, { 72, 1.0f, "C5" }, { 64, 0.5f, "E4" }, { 72, 1.5f, "C5" }
        };
        list.push_back(m);
    }

    // 6. Autumn Leaves
    {
        Melody m;
        m.id = "autumn-leaves";
        m.title = "Autumn Leaves";
        m.composer = "J. Kosma";
        m.difficulty = "Medium";
        m.bpm = 120;
        m.timeSigNum = 4;
        m.timeSigDen = 4;
        m.key = "G Minor";
        m.description = "Essential jazz standard with ii-V-I circle progression";
        m.notes = {
            { 62, 1.0f, "D4" }, { 64, 1.0f, "E4" }, { 65, 1.0f, "F#4" }, { 67, 3.0f, "G4" },
            { 60, 1.0f, "C4" }, { 62, 1.0f, "D4" }, { 64, 1.0f, "E4" }, { 65, 3.0f, "F4" }
        };
        list.push_back(m);
    }

    // 7. Greensleeves
    {
        Melody m;
        m.id = "greensleeves";
        m.title = "Greensleeves";
        m.composer = "Traditional";
        m.difficulty = "Medium";
        m.bpm = 100;
        m.timeSigNum = 6;
        m.timeSigDen = 8;
        m.key = "D Dorian";
        m.description = "Tudor English folk melody in lilting compound meter";
        m.notes = {
            { 62, 1.0f, "D4" }, { 65, 2.0f, "F4" }, { 67, 1.0f, "G4" }, { 69, 1.5f, "A4" },
            { 70, 0.5f, "Bb4" }, { 69, 1.0f, "A4" }, { 67, 2.0f, "G4" }, { 64, 1.0f, "E4" }
        };
        list.push_back(m);
    }

    // 8. Fly Me to the Moon
    {
        Melody m;
        m.id = "fly-me-to-the-moon";
        m.title = "Fly Me to the Moon";
        m.composer = "B. Howard";
        m.difficulty = "Hard";
        m.bpm = 120;
        m.timeSigNum = 4;
        m.timeSigDen = 4;
        m.key = "C Major";
        m.description = "Swing jazz classic made famous by Frank Sinatra";
        m.notes = {
            { 72, 1.0f, "C5" }, { 71, 1.0f, "B4" }, { 69, 1.0f, "A4" }, { 67, 1.0f, "G4" },
            { 65, 2.0f, "F4" }, { 67, 1.0f, "G4" }, { 69, 1.0f, "A4" }, { 72, 2.0f, "C5" }
        };
        list.push_back(m);
    }

    // 9. Clair de Lune
    {
        Melody m;
        m.id = "clair-de-lune";
        m.title = "Clair de Lune";
        m.composer = "C. Debussy";
        m.difficulty = "Hard";
        m.bpm = 60;
        m.timeSigNum = 9;
        m.timeSigDen = 8;
        m.key = "Db Major";
        m.description = "Impressionist masterpiece evoking shimmering moonlight";
        m.notes = {
            { 73, 2.0f, "Db5" }, { 72, 1.0f, "C5" }, { 70, 2.0f, "Bb4" }, { 68, 1.0f, "Ab4" },
            { 65, 3.0f, "F4" }
        };
        list.push_back(m);
    }

    // 10. Giant Steps
    {
        Melody m;
        m.id = "giant-steps";
        m.title = "Giant Steps";
        m.composer = "J. Coltrane";
        m.difficulty = "Hard";
        m.bpm = 220;
        m.timeSigNum = 4;
        m.timeSigDen = 4;
        m.key = "B Major";
        m.description = "Legendary Coltrane changes with rapid tonal shifts";
        m.notes = {
            { 71, 2.0f, "B4" }, { 67, 2.0f, "G4" }, { 63, 2.0f, "Eb4" }, { 66, 2.0f, "F#4" },
            { 70, 2.0f, "Bb4" }
        };
        list.push_back(m);
    }

    return list;
}

} // namespace MidiSheet
