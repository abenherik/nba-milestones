# Quick Update from VS Code

## Easiest Method - Use VS Code Terminal

1. **Open terminal** in VS Code (Terminal → New Terminal or Ctrl+`)
2. **Run the update command:**
   ```powershell
   npm run update
   ```
3. Wait 30-45 minutes - it will:
   - Fetch latest games from NBA API
   - Rebuild all leaderboards
   - Auto-update production database

## If You Get Errors

**Error: Module not found**
- Make sure you're in the project root directory
- Run: `cd C:\Users\Markus\Backups\NBA-Milestones_20250822_123137`

**Error: npm not recognized**
- Close and reopen VS Code
- Or run: `npm install` first

## Run Steps Separately

If the combined command fails, run individually:

```powershell
# Step 1: Fetch games (30-40 minutes)
npm run update:local

# Step 2: Rebuild leaderboards (2-3 minutes)
npm run rebuild:slices
```

## Check If Update Worked

After running, verify in VS Code terminal:
```powershell
npx tsx scripts/verify_data.ts
```

You should see November 2025 games listed.

## Production Website

The changes automatically sync to your production site:
- **URL:** https://nba-milestones-20250822-123137.vercel.app
- **Refresh:** May need to click "Refresh milestones" button on watchlist for cached players

---

**Tip:** Keep the VS Code terminal open while updating so you can see progress!
