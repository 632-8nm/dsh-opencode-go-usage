@echo off
rem ============================================================
rem  OpenCode Go Usage Panel - Browser debug launcher
rem
rem  Starts Edge with remote debugging port 9222 using an
rem  isolated profile (does not affect your daily Edge).
rem  The plugin reads the opencode.ai auth cookie via CDP
rem  (v20 encryption supported).
rem
rem  First run: log in to opencode.ai once in the new window.
rem  Security: while the debug port is open, other local
rem  programs can access this window's browsing data;
rem  close the window when done.
rem ============================================================

set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" (
    echo Edge not found. Edit EDGE path in this script, or use Chrome:
    echo e.g. set EDGE=C:\Program Files\Google\Chrome\Application\chrome.exe
    pause
    exit /b 1
)

start "" "%EDGE%" --remote-debugging-port=9222 "--user-data-dir=%USERPROFILE%\.ocgo-browser-debug" https://opencode.ai
echo Debug Edge started (port 9222).
echo If this is the first run, log in to opencode.ai in the new window, then close it.