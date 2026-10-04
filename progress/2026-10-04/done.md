# Done — 2026-10-04

## Planning
- Read the client blueprint PDF ("Volt On Solar CRM — Developer Blueprint v1.0") and the voice notes.
- Researched Meta Lead Ads, the WhatsApp Cloud API (Coexistence, Calling API recording), Google Sheets limits, Vercel free plan, storage and Antigravity rule files.
- Approved spec: `docs/specs/2026-10-04-volton-crm-design.md`. Key decisions:
  - **Cost:** free plans only in phase 1.
  - **Calls:** no Twilio; agents call from their own mobiles, and call proof is the outcome + a screenshot.
  - **WhatsApp:** in phase 1 on the Meta test number; one company number per agent in phase 2.
  - **Build order:** foundation first.
- M0 plan: `docs/plans/2026-10-04-m0-foundation.md`.

## M0 — Foundation (built)
- **Project:** a new repo `D:\Extras\volton-crm` (Next.js 16.3.8, React 19.2, Tailwind v4, shadcn radix-nova with RTL).
- **AI setup (works in Claude Code and Antigravity):**
  - `AGENTS.md` is the one rulebook (6.4 KB, under the 24 KB limit); `CLAUDE.md` imports it.
  - 6 guides in `docs/ai/`.
  - Skills `daily-progress`, `new-component` and `new-model` live in `.agents/skills`, synced to `.claude/skills`.
  - Antigravity glob rules live in `.agents/rules`.
  - `npm run ai:check` verifies all of it.
- **Domain:**
  - Every enum is in `src/domain/constants.ts`; every label is in `src/i18n/en.ts`.
  - Colours and icons per status live in `src/domain/ui-maps.ts`; navigation in `src/domain/navigation.ts`.
  - The view models are defined, plus helpers for phone (E.164), Pakistan time, durations, PKR money, SLA state and lead numbers.
- **Theme:**
  - `src/styles/theme.css` is the only place colours exist: solar amber, navy and green placeholders, 8 status tones, light + dark.
  - An ESLint rule blocks raw colours anywhere else, and every colour pair passes WCAG AA.
- **Components:**
  - 19 shadcn primitives (plus a Button `touch` size and an overlay token).
  - 12 patterns: StatusBadge, KpiTile, states, PageHeader, SectionCard, FilterBar, SearchBox, DataTable, Timeline, CountdownTimer, ConfirmDialog, AppShell.
  - 12 CRM components: the badges, SlaTimer, LeadCard, LeadHeader, AttemptCard, FollowUpItem, CheckInCard, TeamMemberRow, MessageBubble, KpiGrid.
  - All of them are registered in `docs/ai/components.md`.
- **Catalog:** `/dev/ui` plus the `/dev/ui/shell?role=` previews. Screenshots are in `screenshots/`.
- **Database:**
  - Mongoose models for 21 collections, the connection with `attachDatabasePool`, `withTransaction`, the audit/soft-delete/insert-only plugins, and `nextSequence`.
  - Zod input schemas.
  - The demo seed (2 departments, 11 users, 60 leads), with `npm run seed` and `npm run db:indexes`.

## Checks
- `npm run check` passes: lint, typecheck, **165 tests** (unit, components, theme contrast, lint rule, AI setup, Zod, DB models on an in-memory replica set, seed) and the AI check.
- `npm run build` passes.

## Decisions & fixes
- The insert-only guard (activities, audit logs) blocked reset wipes, so the seed and tests now wipe through the raw collection on purpose.
- The `cn` package (shadcn's new merge tool) handles our tone classes correctly; this was verified.
- Our own DataTable replaces TanStack Table, which moved to v9 with an unknown API, so there is no extra dependency.
