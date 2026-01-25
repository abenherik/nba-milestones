Session-start notice

- When there is no prior conversation context, begin your first reply with these two lines and then proceed normally:
	New session detected — I don't have prior context. Share any repo-specific context you want me to remember today.
	Production app: You're working with Turso cloud database + Vercel deployment. Check live status at your deployed URL.

- Keep it to exactly two lines. If this is a continuation thread with existing context, skip the notice.

PROJECT CONTEXT (NBA Milestones Tracker)

Core App Purpose:
- NBA milestone tracker focused on age-based achievements
- Choose a player (e.g., Paolo Banchero) and see upcoming milestones
- Examples: "How close is Paolo to top 10 players with most 20+ point games before age 24?"
- Track stats like total points/blocks/steals/rebounds before ages 20-30, game counts (20+pts, 30+pts, 40+pts), combo stats (20+pts with 10+assists), double/triple doubles, 5+5+5+5+5 games

Technical Stack:
- Next.js App Router (src/app/ only, NO src/pages/)
- Turso cloud SQLite database (libsql) - production hosted
- Vercel deployment platform for hosting
- NBA API via nba_api with rate limiting considerations
- Materialized game_summary table for performance

Key Data Patterns:
- Age calculations: strict cutoff (birthday games excluded, age_at_game_years < X)
- Season types: 'Regular Season' vs 'Playoffs' with UI toggle
- Two data modes: boxscores (per-game sums) vs league-adjusted (with season_totals_override)
- CRITICAL: Always set season_type='Regular Season' when inserting player_stats

- [x] Verify that the copilot-instructions.md file in the .github directory is created.

- [x] Clarify Project Requirements

- [x] Scaffold the Project

- [x] Customize the Project

 - [x] Install Required Extensions
	 - Installed: ESLint, Prettier, Tailwind CSS IntelliSense, Prisma

 - [x] Compile the Project
	 - Next.js production build completed successfully

 - [x] Create and Run Task
	 - Build task executed; Dev server task is running

- [x] Deploy to Production
	 - Live app deployed on Vercel with Turso cloud database
	 - Production URL: Check Vercel dashboard or /api/debug for current deployment status

 - [x] Ensure Documentation is Complete
	 - README includes deployment guide, Turso setup, and Vercel configuration

Production App Access

- Goal: When the user asks for the app URL, provide the live Vercel deployment link
- Primary: Run VS Code task "Production: Show URL" to display current live URL
- Fallback: Use /api/debug endpoint to verify deployment status and database connectivity
- Local Development: Only use localhost for debugging/development when specifically requested
- Important:
	- Production app runs on Turso cloud database (not local SQLite)
	- All data operations use TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables
	- Vercel handles automatic deployments from main branch

Common Workflow Commands:
- **Update data (VERIFIED APPROACH)**: Double-click `UPDATE_STATS.bat` or desktop shortcut "Update NBA Stats"
  - Fetches latest games for all 753 active players from NBA API
  - Rebuilds leaderboards automatically
  - Updates production Turso database
  - Takes ~30-45 minutes, runs unattended
  - Creates desktop shortcut: Run `powershell -ExecutionPolicy Bypass -File "create_desktop_shortcut.ps1"`
- Deploy to production: `npm run deploy:vercel` (deploys to Vercel)
- Deploy preview: `npm run deploy:preview` (creates preview deployment)
- Local dev (if needed): `npm run dev:lowmem` (connects to Turso, not local SQLite)
- Database status: Check `/api/debug` endpoint on live app
- Migrate data to Turso: `npm run migrate:turso`
- Open chat log: `npm run chat:open`
- Daily updates: Automatic via GitHub Actions at 6 AM UTC (see docs/DAILY_UPDATES.md)
- Manual update trigger: Use GitHub Actions UI or POST to `/api/cron/update-active-players` with Bearer token

Data Accuracy Notes:
- Always use actual NBA API data (see docs/runbooks/precise-nba-data-retrieval.md)
- Verify totals match official NBA stats exactly
- When inserting player_stats, always set season_type='Regular Season'
- Run `npm run validate:precision [player_id] [season]` after adding data

Database Debugging Guidelines (Turso Cloud):
- Production database: Use /api/debug endpoint to check connection and data status
- Database queries: Use /api/test route for simple connectivity tests
- Data verification: Check live app endpoints (/api/players, /api/watchlist, etc.)
- Local debugging (if needed): NEVER use `npm run tsx` scripts - they can hang indefinitely
- Emergency local access: Use `data/sqlite3.exe data/app.sqlite "QUERY"` for local fallback only
- CRITICAL: Production data lives in Turso cloud, not local files
- Database migrations: Use /api/migrate-full endpoint with proper authentication

Database Read Optimization (IMPLEMENTED):
- Problem: Turso free tier hit 497M/500M read limit (99.4% usage)
- Solution: Aggressive server-side and browser caching across all API endpoints
- Milestones API: 6-hour server cache + 6hr browser cache, 12hr stale-while-revalidate
- Leaderboards: 10-minute browser cache, 30min stale-while-revalidate (doubled from 5min)
- Slices cache: 5-minute in-memory TTL (increased from 30 seconds, 10x improvement)
- Watchlist API: 5-second server cache (increased from 500ms, 10x improvement)
- Players API: 6-hour browser cache with 12hr stale period, eliminated COUNT(*) overhead
- Cache philosophy: 6-hour caches allow twice-daily checks (evening + morning after update)
- Expected impact: 80-95% reduction in database reads
- Details: See CACHE_OPTIMIZATION.md for full breakdown
- Monitoring: Check X-Cache: HIT/MISS headers on /api/milestones responses

Watchlist Performance Fix (PROVEN SOLUTION):
- Problem: Turso replica lag causes 20-30 second delays when adding players to watchlist
- WRONG approach: Trying to fix database consistency with cache invalidation, primary forcing, retry mechanisms
- CORRECT approach: Optimistic UI - show players instantly using localStorage, load milestones progressively
- Implementation: Enhanced localStorage tracking in select-players, optimistic-first loading in watchlist
- Key files: src/app/select-players/page.tsx (optimistic storage), src/app/watchlist/page.tsx (optimistic loading)
- Result: Instant player appearance, progressive milestone loading, excellent user experience
- Note: User insight was correct - "immediately show the player in the watchlist and then load stats afterwards"

Watchlist Loading Behavior:
- Players show instantly (optimistic UI from localStorage)
- Milestones load progressively with 50ms stagger between players (prevents API overload)
- Visual loading indicator shows "Loading milestones..." while fetching
- If milestones don't appear immediately after page load, wait 3-5 seconds for progressive loading to complete
- "Refresh all" button forces immediate fresh fetch of all milestones
- Fast mobile loading: Reduced stagger delay from 200ms to 50ms for better perceived performance

Critical Fix Details (Complete Optimistic UI):
- Issue: Players reappeared after removal + page reload due to incomplete removal tracking
- Root cause: Watchlist "Toggle Watch" button didn't set optimistic removal flags like select-players did
- Solution: Added identical optimistic removal tracking to both removal paths (watchlist + select-players)
- Key components: localStorage flags (watchlist:removed:, watchlist:optimistic list), API merge filtering
- Result: Players stay gone when removed, no reappearing after page reload, consistent across both UIs

Workflow Efficiency Guidelines:
- Batch related changes into single operations when possible to minimize user "Apply" clicks
- Be decisive: if investigation reveals a clear fix, apply it immediately rather than asking for permission
- Only seek confirmation for potentially destructive operations (deletes, major schema changes)
- Combine file edits that serve the same goal (e.g., update multiple related files in one action)
- Use parallel tool calls for read-only operations (searches, file reads) to gather context efficiently
- Exception: Always confirm before running scripts that modify data or could hang the system
