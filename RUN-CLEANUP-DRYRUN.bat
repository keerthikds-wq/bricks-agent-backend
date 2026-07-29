@echo off
REM Reports what the legacy-account cleanup WOULD delete. Changes nothing.
cd /d "%~dp0"
echo.
echo   Legacy account cleanup - DRY RUN (nothing will be deleted)
echo.
node scripts\cleanup-legacy-accounts.js
echo.
pause
