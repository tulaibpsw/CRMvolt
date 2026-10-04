<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Volt On CRM — rules for AI agents

These rules apply to **every** AI tool (Claude Code, Google Antigravity, Codex, Cursor…). This file is the single source of truth — `CLAUDE.md` only imports it. Detailed guides live in `docs/ai/`; read the one for the area you touch **before** editing.

## 1. What this project is
Volt On Solar CRM — a mobile-first web app for a Pakistani solar company with two departments (Trading, Installation). Leads arrive from a Google Sheet and WhatsApp, are auto-assigned round-robin (fixed order) to checked-in agents, and every agent action is recorded as proof on the lead. Field agents get site visits by least active kW. Installable as a PWA on Android and iPhone.
- Approved design: `docs/specs/2026-10-04-volton-crm-design.md` · Current plan: newest file in `docs/plans/` · Progress: newest folder in `progress/`

## 2. Read before you edit
| You are touching | Read first |
|---|---|
| Any Next.js API (routing, pages, layouts, fonts, actions, caching) | `node_modules/next/dist/docs/` (version-matched) |
| Colours, spacing, typography, `src/styles/**` | `docs/ai/design-system.md` |
| `src/components/**` or a page's JSX | `docs/ai/components.md` + `docs/ai/design-system.md` |
| `src/domain/**`, `src/server/db/**`, seed, enums | `docs/ai/schema.md` |
| Folders, server/client boundaries, data flow | `docs/ai/architecture.md` |
| Google Sheet, WhatsApp, cron, file storage, auth, PWA | `docs/ai/integrations.md` |
| How to work, test, commit, log progress | `docs/ai/workflow.md` |

## 3. Session start and end
- **Start:** read this file, then the newest `progress/<date>/next.md` and `remaining.md`.
- **End:** run the `daily-progress` skill — create/update `progress/<today>/` (Pakistan date, `YYYY-MM-DD`).

## 4. Stack
Next.js 16.3 (App Router, Turbopack, `src/`, `@/*`) · React 19.2 · TypeScript strict · Tailwind v4 · shadcn/ui (Radix, nova, RTL-ready) · MongoDB Atlas + Mongoose 9 · Zod 4 · Vitest 5 · mongodb-memory-server.
- `params`/`searchParams` are Promises — await them; use `PageProps<'/route'>` / `LayoutProps<'/'>`.
- `middleware` is now `proxy.ts`; `next lint` is gone — use `npm run lint`.
- Keep the managed Next.js block above; write project rules only below it.

## 5. Free-tier rules
Phase 1 costs $0: Vercel Hobby, Atlas M0 (512 MB), Cloudinary free plan (private uploads), cron-job.org, Meta WhatsApp test number. **Never add a paid service or a new npm dependency without asking the user.**

## 6. Architecture rules
- Server Components by default; `'use client'` only for state, effects or browser APIs.
- Database code lives only in `src/server/**`. Pages and Server Actions call services; components never import models.
- Components receive view models (`src/domain/view-models.ts`), never Mongoose documents.
- Roles: super_admin (owner: everything + manages managers/admins) ⊃ admin ⊃ manager (own department) ⊃ agent (own leads) · field_agent (own visits). `requireRole('admin')` also admits super_admin.
- **Actions load records only through `src/server/auth/guards.ts`** (`loadLeadFor(user, id, 'view'|'work'|'manage')`, `loadVisitFor`, `loadManagedUser`). Never `Lead.findById(idFromClient)` in an action. Queries combine scope with `$and: [scope, filter]` so a filter can never widen the scope. Never trust ids/roles from the client.
- Errors shown to users: throw `UserError('plain words')`; anything else becomes "Something went wrong". Actions that can fail return `ActionState` and are used with `<ActionForm>`; plain `<form action>` buttons use `<SubmitButton>` (spinner, no double tap).
- Anti-fraud rules (do not weaken): agents cannot set won/lost/late stages; agent closes (won/lost/Dead/junk) set `closeReview: pending` + flag `lead_closed` and count in sales only after a manager OK; phone-reported times are trusted only inside [tap, now]; one result per attempt (atomic claim).
- Multi-document changes run in `withTransaction` and write an `activities` entry (+ `audit_logs` for users/settings/money). Side effects (push, HTTP) only after commit.
- Webhooks and cron routes are idempotent (unique keys, lease locks).

## 7. Design-system rules
- **Colours exist only in `src/styles/theme.css`.** No hex/rgb/oklch, no Tailwind palette classes (`text-red-500`, `bg-black/10`), no arbitrary colours — ESLint blocks them.
- Use semantic utilities (`bg-background`, `text-muted-foreground`, `bg-primary`) and tone utilities (`bg-tone-info-soft text-tone-info-soft-foreground`).
- Status colours come only from `src/domain/ui-maps.ts` → `StatusBadge`. To recolour, change the map or the token — never the component.
- **Reuse before you build:** check `docs/ai/components.md`; extend with a `cva` variant, never copy. New reusable components go into the registry and `/dev/ui` (skill `new-component`).
- Layers: `components/ui` ← `components/common` ← `components/crm`. A layer imports only from layers to its left.
- **Easy for busy agents on a phone:** the main action of a screen uses `Button size="xl"` (56 px); every other button is ≥ 44 px (`size="touch"`, icon buttons `size="icon-touch"`) — never `size="sm"`/`icon-lg` on app screens. Dashboards open with `ActionTile` shortcuts to the work that is waiting; numbers (KPIs) come after.
- Mobile-first (design at 390 px first); `min-h-11` for tappable rows; respect `env(safe-area-inset-*)` (iPhone notch/home bar); icons only from `lucide-react`; logical classes (`ps-`, `pe-`, `start-`, `end-`) for future Urdu RTL.
- All user-facing text comes from `src/i18n/en.ts`. Primary (amber) is a fill colour — never use `text-primary` for text on light backgrounds.

## 8. Schema rules
- Enum values are defined only in `src/domain/constants.ts`. Elsewhere use the exported union types (`Stage`, `Role`…) so TypeScript checks every literal; never declare a parallel list. New enums must be classified in `ui-maps.ts` (a test enforces it).
- Model + Zod schema + indexes change together (skill `new-model`).
- Phones in E.164 via `src/lib/phone.ts`; dates stored UTC, shown in Pakistan time via `src/lib/dates-pkt.ts` (never `getHours()`/`toLocale*()`); money as integer PKR via `src/lib/money.ts`.
- No hard deletes (`deletedAt`); records carry `createdBy`/`updatedBy`; `activities` and `audit_logs` are insert-only.

## 9. Security rules
- Every Server Action and route handler checks the session and role first.
- Verify webhook signatures (Meta `X-Hub-Signature-256`) and the cron secret (constant-time, `src/server/http/cron-auth.ts`).
- Login/setup are rate-limited (`src/server/services/rate-limit.ts`); passwords set by someone else force a change at first sign-in (`mustChangePassword`); `passwordProblem()` refuses weak passwords. Redirect targets go through `safeNext()`.
- Auth is our own (no auth library): scrypt password hashes, sessions in Mongo (`sessions`, token hash only) behind the httpOnly `volton_session` cookie. First admin via `/setup` + `MASTER_KEY`.
- The service worker (`public/sw.js`) caches only static files — never pages, API responses or customer data. Bump its `VERSION` when you change it.
- Secrets only in env vars; never commit `.env*` except `.env.example`. Never log phone numbers, CNICs or message text.

## 10. Testing and "done"
- Build a phase first; write/run tests when the phase is complete (`tests/unit`, DB tests in `tests/db` on MongoMemoryReplSet).
- Before calling a phase done: `npm run check` (lint + typecheck + tests + AI check) passes and UI is checked at 390 px and 1280 px.

## 11. Never
- Twilio or a browser dialer; unofficial WhatsApp libraries (whatsapp-web.js, Baileys).
- Hard-coded colours, user-facing strings or enum lists; hard deletes; committed secrets; `--no-verify`.
- Editing `.claude/skills/**` directly — edit `.agents/skills/**`, then `npm run ai:sync`.
