#include "MelodyDatabase.h"

namespace MidiSheet
{

const std::vector<Melody>& MelodyDatabase::getAllMelodies()
{
    static const std::vector<Melody> library = createMelodyLibrary();
    return library;
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

    // 4. Für Elise
    {
        Melody m;
        m.id = "fur-elise";
        m.title = "Für Elise";
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
