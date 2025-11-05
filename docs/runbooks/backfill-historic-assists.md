# Backfill Historic Assists (Precise)

Goal: Raise boxscores totals for historic players by inserting exact per-game logs (Regular Season only). Do not use overrides to influence boxscores.

Key invariants:
- Always set season_type = 'Regular Season' when inserting player_stats
- Prefer NBA Stats API playergamelog; validate season coverage
- Rebuild game_summary after writes

Workflow
1) Detect season gaps or low totals
- Offline gaps: npm run -s report:missing:offline
- Targeted per-player assists audit: PLAYER_ID=ID npm run -s local:audit:assists

2) Fetch missing seasons via NBA API (preferred)
- Single player: IDS=ID FROM_YEAR=YYYY TO_YEAR=YYYY ONLY_REGULAR=1 SKIP_EXISTING=0 npm run -s local:fetch:ids
- Batch from report: npm run -s backfill:offline

3) Optional: Import CSVs when API is incomplete
- Prepare CSV with headers (NBA style) or Basketball-Reference style (Date, TRB supported)
- Example: CSV_PATH=./data/bref/ID_SEASON.csv PLAYER_ID=ID PLAYER_NAME="Name" SEASON=YYYY-YY npm run -s local:import:csv

4) Rebuild and validate
- npm run -s local:build:summary
- npm run -s validate:precision ID SEASON

Troubleshooting
- If totals don’t show on leaderboards, check season_type NULLs and rebuild summary
- Use scripts/audit_assists_deltas.ts to compare per-season box vs overrides
