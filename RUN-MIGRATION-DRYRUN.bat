@echo off
REM ===================================================================
REM  Bricks Agent - migration DRY RUN
REM
REM  SAFE: this makes NO changes to your database. It only reads your
REM  data and prints what the real migration *would* do.
REM
REM  Just double-click this file. When it finishes, a file called
REM  migration-dryrun-output.txt appears in this folder - send that.
REM ===================================================================

cd /d "%~dp0"

echo.
echo  Bricks Agent - migration DRY RUN (no changes will be made)
echo  ----------------------------------------------------------
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
  echo  That file holds the database address, so the script cannot run.
  echo.
  pause
  exit /b 1
)

echo  Connecting to the database and reading your data...
echo.

node Utils\migrations\001_builder_centric.js > migration-dryrun-output.txt 2>&1
set EXITCODE=%errorlevel%

type migration-dryrun-output.txt

echo.
echo  ----------------------------------------------------------
if %EXITCODE% neq 0 (
  echo  It did not finish cleanly. Send migration-dryrun-output.txt
  echo  and we will work out why.
) else (
  echo  Done. NOTHING was changed.
  echo  Send the file: migration-dryrun-output.txt
)
echo  ----------------------------------------------------------
echo.
pause
