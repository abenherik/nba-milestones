# Dev port and UI stability runbook

This runbook captures the fixes and guardrails we added to avoid dev-time pitfalls (wrong port, missing error components, and brittle search UI).

## TL;DR
- Always open the live URL via Dev: Link (auto-start). It prints the active URL and starts dev if needed.
- We pin to port 3001 by default with STRICT_PORT=1. If 3001 is busy, we do NOT hop to 3002; we reuse the existing server or wait.
- Root error components (`src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`) must exist to avoid the “missing required error components” dev overlay loop.
- Select Players search shows results even if overlays are blocked—there’s an inline fallback list under the input.
- On Windows, free port 3001 safely using netstat/taskkill when needed.

## Port stability
- The dev launcher (`scripts/dev-single.ts`) honors STRICT_PORT=1. In strict mode:
  - If port 3001 is busy, we don’t start a second server on 3002.
  - Instead, we exit cleanly so the link task can point to the existing server.
- The default Dev task sets STRICT_PORT=1 via `dev:lowmem` in `package.json`.
- Helper scripts (`scripts/ensure_dev_and_print_url.ts`, `scripts/print_dev_url.ts`) read `.next/dev-port.json` and `.next/dev-url.txt` and probe ports to print the correct URL.

## Getting the live URL (no HTTP polling)
- Preferred: VS Code task “Dev: Link (auto-start)”
  - It auto-starts dev if needed, waits on TCP, and prints the right URL.
- Fallback script: `npm run -s dev:url`
- Avoid ad-hoc HTTP health checks; TCP wait is more reliable for Next dev.

## Required error components
- Ensure the following exist in `src/app/`:
  - `error.tsx` (route-level)
  - `global-error.tsx` (app-wide)
  - `not-found.tsx`
- Without them, dev can show “missing required error components, refreshing…” and pages may look blank.

## Select Players search resiliency
- Endpoint: `GET /api/players?q=<query>` (SQLite-backed)
- UI improvements:
  - Keeps the portal-based overlay dropdown for ideal UX.
  - Adds an inline fallback list under the input. If overlays are blocked or CSS conflicts occur, results still appear.
  - Debounced fetch (200ms). Click to add and toggle watchlist immediately.

## Freeing port 3001 on Windows
- Inspect listeners:
  - `netstat -ano | findstr :3001`
- Kill the PID (replace <PID>):
  - `taskkill /F /PID <PID>`
- Then re-run the Dev link task to restart on 3001.

## Troubleshooting
- Chunks 404 on 3001:
  - You’re likely on the wrong port tab. Use Dev: Link (auto-start) to get the active URL.
- Suggestions don’t show while typing:
  - Check the console for network errors.
  - Verify `/api/players?q=pa` returns JSON.
  - The inline fallback list should still render even if overlays are blocked.

---
Last updated: 2025-09-20