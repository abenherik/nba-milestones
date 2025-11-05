Generic debug/audits toolkit
============================

Purpose
 - Replace ad-hoc, player-specific debug scripts with a small set of generic tools.
 - Ensure we can quickly recreate focused checks without cluttering the repo.

Key scripts
 - scripts/audit_player_metric.ts
   - Inputs (env): PLAYER_ID, METRIC (points|rebounds|assists|steals|blocks)
   - Mode: Regular Season only, combines boxscores (game_summary) + season_totals_override
   - Output: per-season box, override, combined, and totals

Examples (PowerShell)
 - $env:PLAYER_ID='17'; $env:METRIC='steals'; npm run -s local:audit:player:metric
 - $env:PLAYER_ID='788'; $env:METRIC='rebounds'; npm run -s local:audit:player:metric

Notes
 - Do not modify boxscores to match official totals. Use season_totals_override per season with season_type='Regular Season'.
 - After any data changes, rebuild summary: npm run -s local:build:summary
 - Use the assists/steals/rebounds dedicated auditors for focused tasks; the generic tool is for quick one-offs.
