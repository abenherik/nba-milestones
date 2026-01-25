# NBA Milestones - Manual Update Guide

## Quick Update (Easiest Method)

**Just double-click `UPDATE_STATS.bat`** in the project folder!

This will:
1. Fetch latest games from NBA API for all 753 active players
2. Rebuild all leaderboards with the new data
3. Update your production website automatically

**Duration:** ~30-45 minutes  
**When to run:** Whenever you want to update stats (daily, weekly, etc.)

---

## What Gets Updated

When you run the update:
- ✅ All 753 active players get their latest 2025-26 season games
- ✅ Leaderboards recalculated across all metrics (points, rebounds, assists, steals, blocks)
- ✅ All ages (20-30) and milestone presets updated
- ✅ Changes automatically sync to production database (Turso)
- ✅ Website shows updated stats immediately (may need to click "Refresh milestones" for cached players)

---

## Manual Steps (If batch file doesn't work)

If the `UPDATE_STATS.bat` file doesn't work, run these commands manually:

### Step 1: Open Terminal
1. Open PowerShell in the project folder
2. Or open the folder in VS Code and use the terminal

### Step 2: Update Game Data
```powershell
npm run update:local
```
This fetches the latest games from NBA API and writes them to Turso database.
**Duration:** ~30-40 minutes

### Step 3: Rebuild Leaderboards
```powershell
npx tsx scripts/rebuild_slices.ts
```
This recalculates all precomputed leaderboards with the new data.
**Duration:** ~3-5 minutes

### Step 4: Verify
Visit your website: https://nba-milestones-20250822-123137.vercel.app
- Check watchlist players show updated stats
- Click "Refresh milestones" if needed to clear cache

---

## Troubleshooting

### "npm is not recognized"
- Make sure Node.js is installed
- Restart your terminal/computer after installing Node.js

### Update script hangs or times out
- The NBA API can be slow - just let it run
- It will retry automatically on timeouts
- Some players may show "No games found" - this is normal for injured/inactive players

### Stats don't show on website after update
1. Clear browser cache
2. Click "Refresh milestones" next to player name on watchlist
3. Try visiting with `?forcePrimary=true` parameter if Turso replicas are lagging

### "Database connection failed"
- Check that `.env.local` has TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
- Make sure you have internet connection

---

## Update Frequency Recommendations

- **Daily:** During active NBA season for most current stats
- **Weekly:** Off-season or if you check less frequently  
- **After big games:** When you know your watchlist players had notable performances

---

## What NOT to Do

❌ Don't run multiple updates simultaneously  
❌ Don't interrupt the update script while running  
❌ Don't delete the `.env.local` file (contains database credentials)

---

## Files Modified During Update

The update process writes to:
- **Turso cloud database** (production data)
  - `game_summary` table (new games)
  - `leaderboard_slices` table (precomputed rankings)

It does NOT modify:
- Any local files in your project
- Your code or configuration
- The deployed website (just the database)

---

## Production Website

Your live site: https://nba-milestones-20250822-123137.vercel.app

After updates, the website automatically uses the new data - no redeployment needed!
