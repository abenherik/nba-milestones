# NBA Milestones

Track NBA players and see how close they are to notable milestones.

## Live Production App 🚀

**Production URL:** https://nba-milestones-20250822-123137-rhf7y4whw-abenheriks-projects.vercel.app

The app is deployed on Vercel with Turso cloud database. Visit the live app to explore NBA milestones!

### Production Status
- **Database:** Turso cloud SQLite (libsql)
- **Hosting:** Vercel deployment platform
- **Auto-updates:** Daily at 6 AM UTC via GitHub Actions (free tier)
- **Status endpoints:** `/api/debug`, `/api/test`, `/seed`

## Local Development (Optional)

Only needed for development/debugging:

1. **Prerequisites:** Node.js 18+, Turso CLI

2. **Install dependencies:**
```powershell
npm install
```

3. **Local development (connects to Turso):**
```powershell
npm run dev:lowmem
```

4. **Deploy to production:**
```powershell
npm run deploy:vercel
```

## Notes
 - Dev stability: see docs/runbooks/dev-port-and-ui-stability.md for avoiding port mix-ups and keeping UI working in dev.

## Data efficiency
- Fetch once, write once: aggregate in memory then upsert a single `careerTotals/<playerId>` doc.
- Store per-season game logs in one doc per season (`playerGameLogs/<playerId>_<season>_(REG|POST)`) to re-aggregate without extra external calls.
- Minimize reads: prefer direct doc gets by ID; constrain queries with `limit` and equality filters.
- Batch writes for migrations; use `{ merge: true }` to avoid rewriting whole docs.
- Network hygiene: NBA Stats API calls use timeouts, retries with backoff, and a small inter-call delay to avoid failures and duplicate work.

## Automated Updates

The app automatically updates active player stats daily via **GitHub Actions** (free):
- **Schedule:** Daily at 6:00 AM UTC
- **What it does:** Fetches latest games for all active players from NBA API
- **Cost:** $0/month (uses GitHub Actions free tier)

**📚 Setup Guides:**
- **� No GitHub repo yet?** [Push to GitHub First](docs/PUSH_TO_GITHUB.md) - Create your repository
- **�🚀 Start here:** [Step-by-Step Guide](docs/SETUP_STEP_BY_STEP.md) - Complete walkthrough with screenshots
- **📋 Checklist:** [Setup Checklist](docs/SETUP_CHECKLIST.md) - Track your progress
- **⚡ Quick setup:** [Quick Setup](docs/QUICK_SETUP.md) - For experienced users
- **🔧 Technical docs:** [Daily Updates](docs/DAILY_UPDATES.md) - API reference and troubleshooting

**Quick Setup Summary:**
1. **First time?** Push your code to GitHub (see PUSH_TO_GITHUB.md)
2. Generate a secret token (random password)
3. Add 2 secrets to GitHub: `CRON_SECRET` and `VERCEL_APP_URL`
4. Add 1 environment variable to Vercel: `CRON_SECRET` (same value)
5. Push the workflow file to GitHub
6. Test via GitHub Actions UI
7. Done! Updates run automatically every day

Manual trigger (optional):
```bash
curl -X POST https://your-app.vercel.app/api/cron/update-active-players \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Production Database Tasks (Turso)
- **Database seeding:** Visit `/seed` on live app or use `/api/seed` endpoint
- **Migration status:** Check `/api/migrate-full` with proper authentication
- **Data verification:** Use production endpoints `/api/players`, `/api/watchlist`
- **Database status:** Visit `/api/debug` for connection and data overview

### Local Development Tasks (if needed)
- Local data migration to Turso: `npm run migrate:turso`  
- CSV helpers and debug scripts under `scripts/` (use with caution)

### Data accuracy and precision
⚠️ **Critical**: Milestone calculations require exact NBA statistics, not approximations.
- Always use actual NBA API data when available (see `docs/runbooks/precise-nba-data-retrieval.md`)
- Verify totals match official NBA career stats exactly before committing
- Even "lockout seasons" often have complete API data available
- Small discrepancies (2-3%) can significantly impact age-based milestone calculations

### Required fields for leaderboard accuracy
🔧 **Essential**: When inserting player_stats data, always set `season_type = 'Regular Season'`
- Leaderboard queries filter by `season_type = 'Regular Season'` 
- NULL values are excluded from leaderboards, causing missing data
- After adding new season data, verify: `npm run validate:precision [player_id] [season]`
- If leaderboard shows wrong totals, check: `SELECT DISTINCT season_type FROM player_stats WHERE player_id = ? AND season = ?`

## Chat logs

- Create/open today’s chat log: `npm run chat:open`
- Create (without opening): `npm run chat:new`

Files are stored in `docs/chat/YYYY-MM-DD.md`. Commit them if you want the history in git.

## Homepage Configuration

**IMPORTANT:** The homepage (`src/app/page.tsx`) is configured to always show the Select Players functionality:

```tsx
// Re-export the Select Players page as the homepage
export { default } from './select-players/page';
```

This ensures users always land on the functional player selection interface. **Do not change this** unless you want to create a different homepage experience.

## CI guards (regressions)

- App Router only: the repo must not contain substantive files under `src/pages/`. A small preflight (Dev Doctor) runs before `dev:link` and will fail if non-trivial files remain. Use the App Router under `src/app/` exclusively.
- Dev Clean: run `npm run -s dev:clean` if dev artifacts look stale.
