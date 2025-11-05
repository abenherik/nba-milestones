# Deprecate Firestore (local-first SQLite)

UI/API now use SQLite via `src/lib/sqlite.ts` and `game_summary`.
Blocks-before-age migrated to `beforeAgeSqlite`.
Milestones API still references Firestore (`src/app/api/milestones/route.ts`); migrate next.

Steps to finish removal:
- Migrate `api/milestones` to aggregate from `game_summary` (or a lightweight totals helper).
- Replace remaining pages/routes that import from `src/lib/leaderboards/*` Firestore modules.
- Move Firestore scripts under `scripts/` into `legacy/firestore/scripts` if not needed.
- Optionally remove `firebase-admin` from dependencies once nothing imports `src/lib/db.ts`.