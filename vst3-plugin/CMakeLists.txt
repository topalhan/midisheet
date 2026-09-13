cmake_minimum_required(VERSION 3.22)

if(POLICY CMP0135)
    cmake_policy(SET CMP0135 NEW)
endif()

project(MidiSheet VERSION 0.3.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# -------------------------------------------------------------------------
# JUCE Framework FetchContent
# Automatically downloads JUCE 8 if not already provided locally
# -------------------------------------------------------------------------
if(NOT TARGET juce::juce_audio_utils)
    set(JUCE_TARGET_ARCHITECTURE "x86_64" CACHE STRING "Target architecture")
    include(FetchContent)
    message(STATUS "Fetching JUCE 8.0.4 framework...")
    FetchContent_Declare(
        juce
        URL https://github.com/juce-framework/JUCE/archive/refs/tags/8.0.4.zip
    )
    FetchContent_MakeAvailable(juce)
endif()

# -------------------------------------------------------------------------
# Plugin Target Definition
# Formats: VST3, Standalone, and AU (on macOS)
# -------------------------------------------------------------------------
juce_add_plugin(MidiSheet
    COMPANY_NAME "MidiSheet"
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT TRUE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    PLUGIN_MANUFACTURER_CODE MdSh
    PLUGIN_CODE MdSt
    FORMATS VST3 Standalone AU
    PRODUCT_NAME "MidiSheet"
)

# -------------------------------------------------------------------------
# Source Files
# -------------------------------------------------------------------------
target_sources(MidiSheet
    PRIVATE
        src/PluginProcessor.cpp
        src/PluginProcessor.h
        src/PluginEditor.cpp
        src/PluginEditor.h
        src/core/MidiQueue.h
        src/core/MusicTheory.cpp
        src/core/MusicTheory.h
        src/core/MelodyDatabase.cpp
        src/core/MelodyDatabase.h
        src/core/MelodyScorer.cpp
        src/core/MelodyScorer.h
        src/core/DailyRoutineManager.cpp
        src/core/DailyRoutineManager.h
        src/ui/GrandStaffComponent.cpp
        src/ui/GrandStaffComponent.h
        src/ui/ScoreboardComponent.cpp
        src/ui/ScoreboardComponent.h
        src/ui/DailyRoutineComponent.cpp
        src/ui/DailyRoutineComponent.h
        src/ui/MelodySelectorComponent.cpp
        src/ui/MelodySelectorComponent.h
        src/ui/VirtualPianoComponent.cpp
        src/ui/VirtualPianoComponent.h
)

target_include_directories(MidiSheet
    PRIVATE
        src
        src/core
        src/ui
)

# -------------------------------------------------------------------------
# Compiler Flags & Definitions
# -------------------------------------------------------------------------
target_compile_definitions(MidiSheet
    PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_DISPLAY_SPLASH_SCREEN=0
)

if(MSVC)
    target_compile_options(MidiSheet PRIVATE /utf-8)
endif()

target_link_libraries(MidiSheet
    PRIVATE
        juce::juce_audio_utils
        juce::juce_audio_processors
        juce::juce_gui_extra
        juce::juce_gui_basics
        juce::juce_graphics
        juce::juce_events
        juce::juce_core
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags
)
