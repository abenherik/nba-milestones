# Data Pipeline Runbook

## Principles
- Firestore is the source of truth; prefer FS cache for reads in cost-sensitive modes.
- Scripts are idempotent; use SKIP_EXISTING and delays to respect rate limits.

## Players
- Upsert a player:
  - `npm run db:upsert:player` with envs like PLAYER_ID, FULL_NAME, RETIRED, BIRTHDAY
- Clean player docs to slim schema:
  - `npm run db:cleanup:players` (DRY_RUN by default)
- Flag active season:
  - `npm run db:players:flag-active-2024_25`

## Gamelogs and aggregates
- Fetch gamelogs for a player: `npm run db:fetch:gamelogs` (PLAYER_ID required)
- Aggregate totals (incl. playoffs): `npm run db:aggregate:totals` (INCLUDE_PLAYOFFS=1)

## Leaderboards
- Before age (core metrics): `npm run db:leaderboards:beforeAge:core`
- Export recent to FS: `npm run db:leaderboards:export:recent`

## Rebound leaders workflows
- Ensure + fetch + aggregate: `npm run db:leaders:rebounds:ensure`
- Scan only: `npm run db:leaders:rebounds:scan`
- Only missing: `npm run db:leaders:rebounds:ensure-missing`
- Players only (no API calls): `npm run db:leaders:rebounds:players-only`

## Guardrails
- FS-first UI: `npm run ui:fs:start`
- Global lockdown toggles: `npm run lockdown:on` / `npm run lockdown:off`
- Script tuning: SKIP_EXISTING=1, DRY_RUN=1, ONLY_MISSING=1, PLAYERS_ONLY=1, DELAY_MS=600-1000
