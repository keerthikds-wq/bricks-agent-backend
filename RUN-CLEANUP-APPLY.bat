@echo off
REM Really deletes the retired silos, test accounts and stale auth records.
REM Shows the dry run first and requires you to type YES.
cd /d "%~dp0"
echo.
echo   Legacy account cleanup - this will DELETE data.
echo   Showing the dry run first.
echo.
node scripts\cleanup-legacy-accounts.js
echo.
set /p ok="Type YES to delete the documents listed above: "
if /i not "%ok%"=="YES" (
  echo Cancelled. Nothing was deleted.
  pause
  exit /b
)
node scripts\cleanup-legacy-accounts.js --apply
echo.
pause
