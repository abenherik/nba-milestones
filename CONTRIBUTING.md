# Contributing

Thanks for your interest in contributing!

- Tech: Next.js (app router), TypeScript, TailwindCSS, SQLite, tsx scripts.
- Data: SQLite (`data/app.sqlite`) is the source of truth; CSV cache in `data/raw/`.
- Style: ESLint + Next config, Prettier default settings.

## Setup
- Node 18+ recommended.
- Install deps: `npm ci`
- Dev server: `npm run dev` (or run VS Code task: Dev: Next.js)
- Build: `npm run build`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`

## Environments & guardrails
- LOWMEM, SQLITE_LOW_MEM, SQLITE_CACHE_KB can be used to constrain dev/build memory.
- INCLUDE_PLAYOFFS, SKIP_EXISTING, DRY_RUN, ONLY_MISSING, PLAYERS_ONLY, DELAY_MS are supported by scripts.

## Data tasks (common)
- Seed to SQLite: `npm run local:seed:players`
- Fetch actives to SQLite: `npm run local:fetch:active`
- Build summary: `npm run local:build:summary`

## PR guidelines
- Keep public behavior stable unless required; add tests or a note.
- Prefer minimal changes; avoid unrelated formatting.
- Include a short "how to test".

## Commit hygiene
- Conventional commits or clear imperative messages.
- Keep changes focused; split large changes.

## Security
- Never commit credentials. Use `credentials/*.json` locally; ignore is configured.
