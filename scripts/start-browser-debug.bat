@echo off
rem ============================================================
rem  OpenCode Go Usage Panel - Browser debug launcher
rem
rem  Starts a Chromium browser with remote debugging port 9222
rem  using an isolated profile (does not affect your daily browser).
rem  The plugin reads the opencode.ai auth cookie via CDP
rem  (v20 encryption supported).
rem
rem  First run: log in to opencode.ai once in the new window.
rem  Security: while the debug port is open, other local
rem  programs can access this window's browsing data;
rem  close the window when done.
rem ============================================================

set "BROWSER=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" set "BROWSER=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" set "BROWSER=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER%" set "BROWSER=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%BROWSER%" set "BROWSER=C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
if not exist "%BROWSER%" (
    echo No Chromium browser found. Install Edge, Chrome, or Brave.
    pause
    exit /b 1
)

start "" "%BROWSER%" --remote-debugging-port=9222 "--user-data-dir=%USERPROFILE%\.ocgo-browser-debug" https://opencode.ai
echo Debug browser started. Waiting for CDP port 9222...
for /l %%i in (1,1,26) do (
    timeout /t 1 /nobreak >nul
    curl.exe -s -m 1 http://127.0.0.1:9222/json >nul 2>&1
    if not errorlevel 1 goto ready
)
echo Browser did not listen on port 9222 within 26 seconds.
exit /b 3

:ready
echo If this is the first run, log in to opencode.ai in the new window, then close it.
