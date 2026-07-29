@echo off
setlocal enabledelayedexpansion
REM ===================================================================
REM  Bricks Agent - migration (REAL RUN)
REM
REM  This does two things, in order:
REM    1. A dry run  - reads your data, changes NOTHING, shows the plan
REM    2. Asks you to confirm, then applies it for real
REM
REM  The dry run runs first on purpose: it is the only place conflicts
REM  show up (people who exist in two of the old account types). You
REM  see them before anything is written, and can still back out.
REM
REM  The migration only ADDS - it never deletes your old Builder,
REM  Masonry or Seller collections, and re-running it does not
REM  duplicate anything.
REM ===================================================================

cd /d "%~dp0"

echo.
echo  Bricks Agent - migration
echo  ==========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  ERROR: Node.js was not found on this computer.
  echo  Install it from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo  ERROR: no .env file found in this folder.
  echo  That file holds the database address, so this cannot run.
  echo.
  pause
  exit /b 1
)

echo  STEP 1 of 2 - Dry run (nothing will be changed)
echo  ----------------------------------------------------------
echo.

node Utils\migrations\001_builder_centric.js > migration-dryrun-output.txt 2>&1
if errorlevel 1 (
  type migration-dryrun-output.txt
  echo.
  echo  The dry run did not finish cleanly, so NOTHING was applied.
  echo  Send migration-dryrun-output.txt and we will work out why.
  echo.
  pause
  exit /b 1
)

type migration-dryrun-output.txt

echo.
echo  ==========================================================
echo   Nothing has been changed yet.
echo.
echo   Read the summary above - especially any lines under
echo   "need a human decision". Those are accounts that exist
echo   in more than one of the old types.
echo  ==========================================================
echo.

set /p CONFIRM="  Apply this for real? Type YES then press Enter: "

if /i not "!CONFIRM!"=="YES" (
  echo.
  echo  Cancelled. Nothing was changed.
  echo.
  pause
  exit /b 0
)

echo.
echo  STEP 2 of 2 - Applying...
echo  ----------------------------------------------------------
echo.

node Utils\migrations\001_builder_centric.js --apply > migration-apply-output.txt 2>&1
set EXITCODE=%errorlevel%

type migration-apply-output.txt

echo.
echo  ==========================================================
if %EXITCODE% neq 0 (
  echo   It did not finish cleanly. The migration only adds data
  echo   and can be safely re-run once the cause is fixed.
  echo   Send migration-apply-output.txt
) else (
  echo   Done. Send migration-apply-output.txt so it can be checked
  echo   before the backend is deployed.
)
echo  ==========================================================
echo.
pause
