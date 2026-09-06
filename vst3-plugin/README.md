# MidiSheet VST3 / AU / Standalone Plugin

A cross-platform **Real-Time MIDI Grand Staff Sheet Music & Melody Practice Scoring Plugin** built with **JUCE 8** and **Modern C++20**.

---

## What It Does
- **Zero-Latency MIDI Pass-Through**: Consumes live MIDI keyboard / EWI input and passes events directly to subsequent synthesizers or virtual instruments (Vital, Kontakt, Pianoteq, Odin 2, etc.) with 0 samples of added latency.
- **Interactive Grand Staff Notation**: Real-time treble and bass clef notation showing active notes with accidental spelling and pitch names.
- **Melody Practice & Accuracy Scorer**: Built-in library of 10 classic practice melodies with real-time rhythm timing feedback (Perfect, Early, Late), streak counter, and scorecard assessment.
- **DAW Host Sync**: Automatically locks to DAW tempo (BPM), time signature, and playhead position.

---

## Prerequisites by Platform

### Windows
1. **Visual Studio 2022 Community** (or Professional/Enterprise):
   - Install workload: **"Desktop development with C++"**
2. **Git for Windows**: [git-scm.com](https://git-scm.com/)
3. **CMake 3.22+**: [cmake.org/download](https://cmake.org/download/)

### macOS
1. **Xcode** (from the Mac App Store) and Command Line Tools (`xcode-select --install`)
2. **CMake**: `brew install cmake`
3. **Git**: Pre-installed with Xcode

### Linux (Ubuntu / Debian / Fedora)
Install build tools and audio libraries:
```bash
sudo apt update
sudo apt install -y build-essential cmake git libasound2-dev libx11-dev libxinerama-dev libxext-dev libfreetype-dev libgl1-mesa-dev
```

---

## How to Build

### 1. Configure and Build with CMake
From inside the `vst3-plugin` directory:

```bash
# Generate build configuration (CMake will automatically fetch JUCE 8)
cmake -B build -DCMAKE_BUILD_TYPE=Release

# Build the plugin targets (VST3, Standalone, AU)
cmake --build build --config Release
```

### 2. Output Artifacts
Once compiled, your build output will be located at:
- **Windows**:
  - VST3: `build/MidiSheet_artefacts/Release/VST3/MidiSheet.vst3`
  - Standalone: `build/MidiSheet_artefacts/Release/Standalone/MidiSheet.exe`
- **macOS**:
  - VST3: `build/MidiSheet_artefacts/Release/VST3/MidiSheet.vst3`
  - AU: `build/MidiSheet_artefacts/Release/AU/MidiSheet.component`
  - Standalone: `build/MidiSheet_artefacts/Release/Standalone/MidiSheet.app`
- **Linux**:
  - VST3: `build/MidiSheet_artefacts/Release/VST3/MidiSheet.vst3`
  - Standalone: `build/MidiSheet_artefacts/Release/Standalone/MidiSheet`

---

## DAW Installation
Copy `MidiSheet.vst3` to your system's standard VST3 folder:
- **Windows**: `C:\Program Files\Common Files\VST3\`
- **macOS**: `~/Library/Audio/Plug-Ins/VST3/`
- **Linux**: `~/.vst3/`
