# Top-25 Slices: Caching and Publish Runbook

This app precomputes Top-25 slices for Watchlist speed and consistent results.

## What is a slice?
- before-age slice: (metric, season group, age) → list of Top 25 players and values.
- milestone slice: (preset definition, season group, age) → list of Top 25.

Slices are stored in `slices_top25` keyed by a hashed `slice_key`, versioned via `app_meta.slices_current_version`. APIs read only the current version.

## Workflow
1. Ingest/refetch game logs and rebuild `game_summary` as usual.
2. Rebuild slices into a new version:
   - `npm run -s slices:rebuild`
3. When all slices are written, the script publishes the new version atomically by updating `app_meta.slices_current_version`.

API reads the current version only; no partial updates are visible.

## Season groups
- RS = Regular Season only
- ALL = Regular Season + Playoffs

The `slices:rebuild` script respects `SLICE_PLAYOFFS=1` to build ALL; otherwise RS.

## Developer tips
- Missing slice fallback: The API computes a slice on-demand once and writes it, so new presets work immediately.
- Versioning: The script publishes `v<unix ms>`. You can bump or pin versions by editing `app_meta` if needed.
- Safety: Use `npm run -s slices:rebuild` after any schema or preset changes.

## Troubleshooting
- If Watchlist shows stale data, check `app_meta` and `updated_at` in `slices_top25`.
- If a slice is absent, it will be computed on the first request.
- If a rebuild fails midway, APIs continue to serve the previous version.
