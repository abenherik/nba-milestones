# Daily Active Player Stats Update

This document describes the automated daily update system for active NBA player statistics.

## Overview

The app automatically fetches and updates statistics for all active players every day at 6:00 AM UTC (after most NBA games have finished). This ensures the app always has the latest data without manual intervention.

**Implementation**: Uses **GitHub Actions** (100% free) to trigger daily updates instead of Vercel Cron (which requires a paid plan).

## How It Works

### 1. GitHub Actions Workflow

The system uses GitHub Actions scheduled workflows to trigger updates:

- **Schedule**: Daily at 6:00 AM UTC (`0 6 * * *`)
- **Endpoint**: `/api/cron/update-active-players`
- **Cost**: Free (GitHub Actions free tier: 2,000 minutes/month)
- **Manual trigger**: Available via GitHub Actions UI

Configured in `.github/workflows/daily-update.yml`:
```yaml
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:  # Allows manual triggering
```

### 2. Update Process

The cron endpoint performs the following steps:

1. **Get Active Players**: Queries database for all players where `is_active = 1`
2. **Determine Current Season**: Calculates current NBA season (e.g., "2024-25")
3. **Fetch Game Logs**: For each active player, fetches latest game logs from NBA API
4. **Insert New Games**: Adds any new games to the `game_summary` table
5. **Skip Existing**: Avoids duplicates by checking if game_id already exists
6. **Rate Limiting**: 500ms delay between players to respect NBA API limits

### 3. Security

The endpoint is protected by authentication:

**Authentication Method**: Bearer token using `CRON_SECRET` environment variable

```bash
# Manual trigger example
curl -X POST https://your-app.vercel.app/api/cron/update-active-players \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

The GitHub Actions workflow automatically includes this token from GitHub Secrets.

## Setup Instructions

### Step 1: Set GitHub Secrets

Add required secrets to your GitHub repository:

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add:

   **Secret 1: CRON_SECRET**
   - Name: `CRON_SECRET`
   - Value: Generate a secure random string
   ```bash
   # Generate on Mac/Linux
   openssl rand -hex 32
   
   # Or generate on Windows PowerShell
   -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
   ```

   **Secret 2: VERCEL_APP_URL**
   - Name: `VERCEL_APP_URL`
   - Value: Your Vercel app URL (e.g., `https://your-app.vercel.app`)
   - No trailing slash!

### Step 2: Set Vercel Environment Variable

Add the same `CRON_SECRET` to your Vercel project:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add variable:
   - Name: `CRON_SECRET`
   - Value: **Use the same value** as the GitHub secret
   - Environments: Production, Preview, Development

### Step 3: Push to GitHub

Push the workflow file to your repository:

```bash
git add .github/workflows/daily-update.yml
git commit -m "Add daily stats update workflow"
git push
```

The workflow will automatically be enabled in your repository.

## Manual Testing

### Test via GitHub Actions UI

1. Go to your GitHub repository
2. Click **Actions** tab
3. Select **Daily Active Player Stats Update** workflow
4. Click **Run workflow** → **Run workflow**
5. Wait for completion and check logs

### Test via Command Line

You can manually trigger an update using curl:

```bash
# Replace with your actual values
curl -X POST https://your-app.vercel.app/api/cron/update-active-players \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Or using the GET endpoint (same auth required)
curl https://your-app.vercel.app/api/cron/update-active-players \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response:
```json
{
  "success": true,
  "season": "2024-25",
  "playersProcessed": 450,
  "gamesAdded": 287,
  "gamesSkipped": 1234,
  "errors": 0,
  "duration": 125432,
  "playerDetails": [
    {
      "id": "2544",
      "name": "LeBron James",
      "added": 1,
      "skipped": 15,
      "errors": 0
    }
  ]
}
```

## Monitoring

### Check GitHub Actions Execution

1. Go to your GitHub repository
2. Navigate to **Actions** tab
3. View workflow runs and their status
4. Click on a run to see detailed logs
5. Check the **Summary** for quick results

### Monitor Database Updates

Check the `/api/debug` endpoint to verify data is being updated:

```bash
curl https://your-app.vercel.app/api/debug
```

Look for recent `game_summary` entries with today's date.

### Email Notifications

GitHub Actions can send you email notifications on failures:

1. Go to your GitHub account settings
2. Navigate to **Notifications** → **Actions**
3. Enable "Send notifications for failed workflows"

## Important Notes

### Season Type Handling

The system **always sets `season_type='Regular Season'`** when inserting game data. This is critical for consistency with the rest of the app's data patterns.

From the project requirements:
> CRITICAL: Always set season_type='Regular Season' when inserting player_stats

### Age Calculations

If a player's birthdate is available, the system calculates their age at each game:
- Uses strict cutoff (birthday games excluded)
- Follows pattern: `age_at_game_years < X`

### Duplicate Prevention

The system checks for existing games before inserting:
```sql
SELECT 1 FROM game_summary 
WHERE player_id = ? AND game_id = ? 
LIMIT 1
```

This means re-running the update is safe and won't create duplicates.

### Rate Limiting

- 500ms delay between players
- NBA API retries: 4 attempts with exponential backoff
- Timeout per request: 12 seconds

## Troubleshooting

### Workflow Not Running

1. Verify workflow file is in `.github/workflows/` directory
2. Check that the workflow is enabled in GitHub Actions settings
3. Ensure your repository has Actions enabled (Settings → Actions → General)
4. Note: Scheduled workflows may be disabled if repo has no activity for 60 days

### Authentication Errors

If seeing 401 Unauthorized:
1. Verify `CRON_SECRET` is set in both GitHub Secrets AND Vercel environment variables
2. Check that both values are **exactly the same**
3. Ensure the Vercel environment variable is available in Production
4. Verify `VERCEL_APP_URL` secret is correct (no trailing slash)

### Workflow Fails

If the workflow fails:
1. Check the workflow logs in GitHub Actions
2. Verify your Vercel app is accessible
3. Test the endpoint manually with curl
4. Check Vercel function logs for errors

### No Games Added

If `gamesAdded: 0` consistently:
1. Check that players have `is_active = 1` in database
2. Verify current season calculation is correct
3. Check NBA API availability (may have rate limits)
4. Review logs for API errors

### Timeouts

If the function times out:
1. GitHub Actions timeout: 6 hours (plenty of time)
2. Vercel function timeout: 10 seconds (Hobby) or 60 seconds (Pro)
3. The update endpoint has `maxDuration: 300` (5 minutes) which requires Vercel Pro
4. **If on Vercel Hobby plan**: Consider batching updates or reducing active players

## Alternative: Manual Script

For development or manual updates, you can also create a local script:

```typescript
// scripts/update_active_players.ts
import { openDatabase, dbAll, closeDatabase } from '../src/lib/database';
import { fetchPlayerGameLog, getCurrentSeason } from '../src/lib/nba-api';

// Implementation here...
```

Run with:
```bash
npm run tsx scripts/update_active_players.ts
```

## Cost Considerations

- **GitHub Actions**: **FREE** (2,000 minutes/month on free tier)
- **Vercel Hobby**: **FREE** (Serverless functions included)
- **Database Writes**: Varies by number of new games (typically 10-30 per day)
- **NBA API**: Free but rate-limited

**Monthly cost: $0** 🎉

## Future Improvements

1. **Incremental Updates**: Only fetch games from the last 7 days
2. **Parallel Processing**: Batch players into concurrent requests
3. **Smart Scheduling**: Run closer to game times (e.g., 11 PM PST)
4. **Slack/Discord Notifications**: Send alerts on completion or failures
5. **Playoffs Support**: Add separate workflow for playoff season updates
6. **Retry Logic**: Automatically retry failed updates with exponential backoff
