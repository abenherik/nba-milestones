# Dev Runbook

## Start dev server
- VS Code task: Dev: Next.js
- Or: `npm run dev` (Windows PowerShell friendly)

The dev launcher checks if :3000 is already used and exits early if so (see `scripts/dev-single.ts`).

## Troubleshooting HMR 404s
- Transient 404s for `/_next/static/*` during Fast Refresh are normal.
- If UI looks broken, hard-refresh or restart the dev task to clear `.next` cache.

## Lockdown modes
- Prefer FS-first to avoid Firestore reads:
  - `npm run ui:fs:start`
  - Or set: `QUOTA_LOCKDOWN=1` or `NO_COST=1` (middleware hints to FS mode)

## Useful endpoints
- App: http://localhost:3000
- Players API: http://localhost:3000/api/players?q=wil
- Blocks Leaderboard: http://localhost:3000/leaderboards/blocks-before-age?age=21
