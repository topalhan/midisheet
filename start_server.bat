@echo off
title MidiSheet Local Web Server
echo ========================================================
echo Starting MidiSheet Web Server on http://localhost:8000
echo ========================================================
echo Press Ctrl+C at any time to stop the server.
echo.

:: Launch the Python HTTP server with no-cache and dual-stack support
py server.py
if %ERRORLEVEL% neq 0 (
    python server.py
)

pause
