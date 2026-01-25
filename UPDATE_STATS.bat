@echo off
REM NBA Milestones - Update Player Stats
REM Double-click this file to update all player stats
echo ============================================================
echo NBA Milestones - Player Stats Update
echo ============================================================
echo.
echo This will update stats for all 753 active players.
echo Expected duration: 30-45 minutes
echo.
pause

echo.
echo Step 1/2: Fetching latest games from NBA API...
echo --------------------------------------------------------
cd /d "%~dp0"
call npm run update:local
if errorlevel 1 (
    echo.
    echo ERROR: Failed to fetch games from NBA API
    echo.
    pause
    exit /b 1
)

echo.
echo.
echo Step 2/2: Rebuilding leaderboards...
echo --------------------------------------------------------
cd /d "%~dp0"
call npm run rebuild:slices
if errorlevel 1 (
    echo.
    echo ERROR: Failed to rebuild leaderboards
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo SUCCESS! All stats updated successfully.
echo ============================================================
echo.
echo Your website now has the latest NBA stats:
echo https://nba-milestones-20250822-123137.vercel.app
echo.
echo You can close this window or press any key to exit.
pause
