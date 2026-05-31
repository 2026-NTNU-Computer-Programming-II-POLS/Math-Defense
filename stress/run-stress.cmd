@echo off
REM ==========================================================================
REM  One-click launcher for the Math Defense stress suite.
REM
REM  Double-click this file in Explorer, OR run it from a terminal. Any flags
REM  are passed straight through to run-stress.ps1, e.g.:
REM     run-stress.cmd            (full run, ~20 min - the default)
REM     run-stress.cmd -Quick     (smoke, ~3 min)
REM     run-stress.cmd -TearDown  (wipe the DB when done)
REM
REM  ASCII-only on purpose (Windows code page). %~dp0 = this file's folder, so
REM  it works no matter where the repo lives or what the path contains.
REM ==========================================================================
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-stress.ps1" %*
set "RC=%ERRORLEVEL%"
echo.
echo ============================================================
echo   Stress run finished (exit code %RC%).
echo   Summary : stress\RESULTS.md
echo   Logs    : stress\results\
echo ============================================================
echo.
REM Keep the window open when double-clicked; harmless from a terminal.
pause
exit /b %RC%
