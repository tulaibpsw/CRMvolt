# Workflow

1. **Start a session:** read `AGENTS.md`, then the newest `progress/<date>/next.md` and `remaining.md`.
2. **Pick the next task** from `next.md` (tagged with its milestone, e.g. `M2`). Check `docs/ai/components.md` and `docs/ai/schema.md` before creating anything.
3. **Build the phase**, small steps. Use the skills: `new-component`, `new-model`.
4. **When the phase is complete:** write/extend tests (`tests/unit`, `tests/db`), then `npm run check` (lint + typecheck + tests + AI check) and look at the UI at 390 px and 1280 px (`npm run dev`, `/dev/ui`). `npm run ui:shots` saves catalog screenshots into today's progress folder.
5. **Commit** with conventional messages: `feat:`, `fix:`, `chore:`, `docs:`, `test:`. Never `--no-verify`.
6. **End the session:** run the `daily-progress` skill.

## Commands
| Command | Does |
|---|---|
| `npm run dev` | Dev server (catalog at `/dev/ui`) |
| `npm run check` | lint + typecheck + tests + AI check |
| `npm run test` / `test:watch` | Vitest (starts an in-memory MongoDB replica set) |
| `npm run ai:sync` / `ai:check` | Copy `.agents/skills` → `.claude/skills` / verify the AI setup |
| `npm run seed` / `db:indexes` | Demo data / sync indexes (needs `.env.local`) |
| `npm run ui:shots` | Catalog screenshots (dev server must be running) |

## Phases
M0 foundation → M1 auth & access → M2 leads core → M3 Sheet pull → M4 attendance + assignment + jobs → M5 agent PWA → M6 WhatsApp → M7 notifications → M8 manager tools → M9 pipelines + dashboards → M10 client demo. Details: `docs/specs/2026-10-04-volton-crm-design.md`.
