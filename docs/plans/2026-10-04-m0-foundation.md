# M0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Volt On CRM foundation, so that every later feature reuses one design system and one data model. The foundation has four parts:
- an AI-agent rulebook that works in any tool;
- one central theme;
- a reusable component library with a live catalog;
- the MongoDB schema with demo seed data.

**Architecture:**
- **App:** a Next.js 16 App Router app in `D:\Extras\volton-crm`.
- **One source per concern:** enums live in `src/domain/constants.ts`, user-facing text in `src/i18n/en.ts`, tone/icon maps in `src/domain/ui-maps.ts`, and colours only in `src/styles/theme.css`.
- **Components** are layered: `ui` (shadcn, generated) ← `common` (patterns) ← `crm` (domain, fed by view models).
- **Data:** Mongoose models in `src/server/db/models` use the same constants; Zod input schemas live in `src/domain/schemas`.
- **AI rules** are written once, in `AGENTS.md` and `docs/ai/`. Shared skills live in `.agents/skills` and are copied to `.claude/skills`.

**Tech Stack:**
- **Framework:** Next.js 16.3.8, React 19.2.8, TypeScript 5 (strict), Tailwind CSS v4.
- **UI:** shadcn 4.21 (Radix base, `nova` preset, RTL-ready), `cn`, lucide-react 1.52.
- **Data & validation:** Mongoose 9.10, Zod 4.6, libphonenumber-js 1.13.
- **Testing & tooling:** Vitest 5 + Testing Library + jsdom, mongodb-memory-server 11 (`MongoMemoryReplSet`), culori 4, tsx 4, Playwright 1.63 (screenshots only).

## Global Constraints

- **Where to work:**
  - Repo root is `D:\Extras\volton-crm` (`/d/Extras/volton-crm` in Git Bash). Run every command from the repo root (`cd /d/Extras/volton-crm` first).
  - Never touch `D:\Extras\officeFrontend`.
- **Next.js:**
  - Read `node_modules/next/dist/docs/` before using a Next.js API.
  - `params` and `searchParams` are Promises.
  - Keep the managed `<!-- BEGIN:nextjs-agent-rules -->` block at the top of `AGENTS.md`.
- **Dependencies:** phase 1 must cost $0, so install only the dependencies named in this plan.
- **Single sources:**
  - Colour values exist only in `src/styles/theme.css` (lint-enforced from Task 5).
  - Enum values are defined only in `src/domain/constants.ts`. Elsewhere, use the exported union types so TypeScript checks every literal.
  - User-facing text lives only in `src/i18n/en.ts`.
- **Data formats:** phones are stored as E.164 (`+923001234567`); dates are stored in UTC and shown in Asia/Karachi (UTC+5, no DST); money is integer PKR.
- **Mobile-first:** touch targets are at least 44 px (`min-h-11`, or Button `size="touch"`).
- **Size limit:** `AGENTS.md` must stay under 24,000 bytes (Antigravity limit).
- **Commits:** conventional style (`feat:`, `chore:`, `docs:`, `test:`), one commit at the end of every task.
- **Checks:** every task ends with `npm run test` green; from Task 2 on, `npm run check` must also be green.

## M0 scope note

M0 builds everything needed for **layout and display**.

The interactive, data-bound CRM components are listed as *planned* in `docs/ai/components.md`. Each is built in the milestone that first uses it, following the same rules:
- OutcomeSheet, ChatPanel, KanbanBoard and AssignmentOrderList;
- SiteBasicsForm, FileUploader and the form fields;
- NotificationBell, ReviewQueueItem and ContactActions.

## File structure (what M0 creates)

| Path | Responsibility |
|---|---|
| `AGENTS.md`, `CLAUDE.md` | Rulebook for every AI tool; Claude imports it |
| `docs/ai/{architecture,design-system,components,schema,integrations,workflow}.md` | Detailed guides |
| `docs/specs/2026-10-04-volton-crm-design.md` | Approved spec |
| `.agents/skills/*/SKILL.md`, `.claude/skills/**` | Canonical skills + synced copies |
| `.agents/rules/{ui,db}.md` | Antigravity glob rules |
| `scripts/lib/ai-files.mjs`, `scripts/{sync-ai,check-ai}.mjs` | Skill sync + AI-setup check |
| `progress/**` | Daily log |
| `src/lib/{env,phone,dates-pkt,duration,money,utils}.ts` | Env parsing, phone/date/money helpers, `cn` |
| `src/domain/constants.ts` | Every enum + defaults |
| `src/domain/ui-maps.ts`, `src/domain/navigation.ts` | Enum → label/tone/icon maps; nav config |
| `src/domain/sla.ts`, `src/domain/numbering.ts` | Pure SLA-state and number-format helpers |
| `src/domain/view-models.ts` | UI-facing data shapes |
| `src/domain/schemas/*.ts` | Zod input schemas |
| `src/i18n/en.ts` | All user-facing text |
| `src/styles/theme.css` | All colour tokens (light + dark) |
| `src/components/ui/*` | shadcn primitives (generated) |
| `src/components/common/*` | Patterns |
| `src/components/crm/*` | Domain components |
| `src/app/dev/ui/**`, `src/dev/fixtures.ts` | Component catalog + demo data |
| `src/server/db/**` | Connection, transaction helper, plugins, models, seed builder |
| `scripts/{seed,sync-indexes}.ts`, `scripts/screenshot-catalog.mjs` | CLI scripts |
| `tests/unit/**`, `tests/db/**`, `tests/global-setup.ts` | Vitest suites |

---

### Task 1: Tooling baseline (dependencies, scripts, Vitest, env module, spec copy)

**Files:**
- Modify: `package.json`, `.gitignore`
- Create: `vitest.config.mts`, `tests/setup.ts`, `tests/stubs/server-only.ts`, `tests/global-setup.ts`, `src/lib/env.ts`, `tests/unit/env.test.ts`, `.env.example`, `docs/specs/2026-10-04-volton-crm-design.md`

**Interfaces:**
- Produces (`@/lib/env`): `parseServerEnv(source: Record<string, string | undefined>): ServerEnv`, `getServerEnv(): ServerEnv`, `isCatalogEnabled(env?: ServerEnv): boolean`, `requireMongoUri(env?: ServerEnv): string`, `type ServerEnv = { NODE_ENV: 'development' | 'test' | 'production'; MONGODB_URI?: string; ENABLE_UI_CATALOG: 'true' | 'false' }`.
- Produces (tests): Vitest `inject('mongoUri')` gives a running single-node replica-set URI to every test file.

- [ ] **Step 1: Install dependencies**

```bash
cd /d/Extras/volton-crm
npm install mongoose@^9.10.4 zod@^4.6.5 libphonenumber-js@^1.13.14 server-only@^0.0.1 @vercel/functions@^3.9.11
npm install -D vitest@^5.0.3 @vitejs/plugin-react@^6.1.1 vite-tsconfig-paths@^6.1.1 jsdom@^30.1.2 @testing-library/react@^16.3.3 @testing-library/dom@^10.4.2 @testing-library/jest-dom@^7.0.1 mongodb-memory-server@^11.3.0 culori@^4.0.2 @types/culori@^4.0.1 tsx@^4.23.15
```
Expected: both installs finish. npm may warn that some packages' install scripts are not approved — ignore it; mongodb-memory-server downloads its MongoDB binary on the first test run instead.

- [ ] **Step 2: Add scripts**

```bash
npm pkg set scripts.typecheck="next typegen && tsc --noEmit" scripts.test="vitest run" scripts.test:watch="vitest" scripts.check="npm run lint && npm run typecheck && npm run test"
```

- [ ] **Step 3: Create the Vitest config, setup, stub and global setup**

`vitest.config.mts`:
```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // 'server-only' throws outside React Server Components; tests import server modules directly.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
})
```

`tests/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  if (typeof document !== 'undefined') cleanup()
})
```

`tests/stubs/server-only.ts`:
```ts
// Test stand-in for the 'server-only' package (see vitest.config.mts).
export {}
```

`tests/global-setup.ts`:
```ts
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string
  }
}

let replSet: MongoMemoryReplSet | undefined

/** One single-node replica set for the whole run (transactions need a replica set). Each DB test file uses its own database name. */
export async function setup(project: TestProject) {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  project.provide('mongoUri', replSet.getUri())
}

export async function teardown() {
  await replSet?.stop()
}
```

- [ ] **Step 4: Write the failing test** — `tests/unit/env.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isCatalogEnabled, parseServerEnv, requireMongoUri } from '@/lib/env'

describe('parseServerEnv', () => {
  it('applies defaults', () => {
    const env = parseServerEnv({})
    expect(env.NODE_ENV).toBe('development')
    expect(env.ENABLE_UI_CATALOG).toBe('false')
    expect(env.MONGODB_URI).toBeUndefined()
  })

  it('treats empty strings as unset', () => {
    expect(parseServerEnv({ MONGODB_URI: '' }).MONGODB_URI).toBeUndefined()
  })

  it('accepts a MongoDB URI', () => {
    const uri = 'mongodb+srv://user:pass@cluster0.example.mongodb.net/volton'
    expect(parseServerEnv({ MONGODB_URI: uri }).MONGODB_URI).toBe(uri)
  })

  it('rejects a non-MongoDB URI with a clear message', () => {
    expect(() => parseServerEnv({ MONGODB_URI: 'postgres://x' })).toThrow(/MONGODB_URI/)
  })
})

describe('isCatalogEnabled', () => {
  it('is on outside production', () => {
    expect(isCatalogEnabled(parseServerEnv({ NODE_ENV: 'development' }))).toBe(true)
  })

  it('is off in production unless ENABLE_UI_CATALOG is true', () => {
    expect(isCatalogEnabled(parseServerEnv({ NODE_ENV: 'production' }))).toBe(false)
    expect(isCatalogEnabled(parseServerEnv({ NODE_ENV: 'production', ENABLE_UI_CATALOG: 'true' }))).toBe(true)
  })
})

describe('requireMongoUri', () => {
  it('points to .env.example when the URI is missing', () => {
    expect(() => requireMongoUri(parseServerEnv({}))).toThrow(/\.env\.example/)
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm run test -- tests/unit/env.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/env"`. (The first run also downloads the MongoDB binary for the global setup; this can take a few minutes once.)

- [ ] **Step 6: Implement `src/lib/env.ts`**
```ts
import { z } from 'zod'

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z.string().startsWith('mongodb', 'MONGODB_URI must start with mongodb:// or mongodb+srv://').optional(),
  ENABLE_UI_CATALOG: z.enum(['true', 'false']).default('false'),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

/** Parse an env-like object. Empty strings count as "not set". Throws one readable error listing every problem. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''))
  const result = serverEnvSchema.safeParse(cleaned)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid environment variables — ${issues}`)
  }
  return result.data
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env)
}

/** The /dev/ui catalog is always on in development; on a deployment it needs ENABLE_UI_CATALOG=true. */
export function isCatalogEnabled(env: ServerEnv = getServerEnv()): boolean {
  return env.NODE_ENV !== 'production' || env.ENABLE_UI_CATALOG === 'true'
}

export function requireMongoUri(env: ServerEnv = getServerEnv()): string {
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set — copy .env.example to .env.local and fill it in')
  }
  return env.MONGODB_URI
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run test -- tests/unit/env.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 8: Add `.env.example`, un-ignore it, copy the spec**

`.env.example`:
```bash
# Copy to .env.local and fill in. Never commit real values.

# MongoDB Atlas free M0 cluster — Atlas → Connect → Drivers → copy the mongodb+srv:// string
MONGODB_URI=

# "true" shows the /dev/ui component catalog on a Vercel deployment (always on in development)
ENABLE_UI_CATALOG=false
```

Append to `.gitignore` (directly after the `.env*` line):
```gitignore
!.env.example
```

```bash
mkdir -p docs/specs
cp "/c/Users/tulaib.siddiqui/.claude/plans/c-users-tulaib-siddiqui-downloads-dvazz-rosy-allen.md" docs/specs/2026-10-04-volton-crm-design.md
```

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 10: Commit**
```bash
git add -A
git commit -m "chore: add test tooling, env module and approved design spec"
```

### Tasks 2–16 (checklist — built directly, details live in the code + docs/ai)

- [ ] **T2 — AI rulebook:**
  - `AGENTS.md` rules below the Next block, plus `docs/ai/*` (6 guides).
  - Skills in `.agents/skills/{daily-progress,new-component,new-model}`, rules in `.agents/rules/{ui,db}.md`.
  - `scripts/lib/ai-files.mjs` + `sync-ai`/`check-ai` with tests, the `ai:sync`/`ai:check` scripts, and `check` including `ai:check`.
  - The first `progress/2026-10-04/` log.
- [ ] **T3 — Domain & text:** `src/domain/constants.ts`, `src/i18n/en.ts`, `src/domain/ui-maps.ts` and `src/domain/navigation.ts`, plus the enum↔UI-map coverage test (every constant array is classified).
- [ ] **T4 — Helpers:** `src/lib/phone.ts`, `dates-pkt.ts`, `duration.ts` and `money.ts`; `src/domain/sla.ts` and `numbering.ts`, each with tests.
- [ ] **T5 — Theme:**
  - `shadcn init -t next -b radix -p nova --rtl -y`, with components.json `css` pointing at `src/styles/theme.css`.
  - Write `theme.css` (tokens + 8 tones, light/dark) and `globals.css`.
  - Inter font in the layout, plus a home page.
  - The colour lint rule in `eslint.config.mjs`, with a lint test and a contrast test.
- [ ] **T6 — Primitives:**
  - `shadcn add` input, label, textarea, select, checkbox, switch, badge, card, dialog, sheet, dropdown-menu, tabs, tooltip, popover, skeleton, avatar, separator, table.
  - Swap `bg-black/10` for `bg-overlay`.
  - Add a Button `touch` size, and set the `link` variant to `text-foreground`.
  - Write a `cn` test.
- [ ] **T7 — Patterns (part 1):** StatusBadge, KpiTile, EmptyState, ErrorState, LoadingState, PageHeader and SectionCard, with tests.
- [ ] **T8 — Patterns (part 2):** FilterBar/FilterChip, SearchBox (URL-driven), DataTable (server-friendly, link-sorted), Timeline, CountdownTimer, ConfirmDialog and AppShell, with tests.
- [ ] **T9 — View models & badges:** `src/domain/view-models.ts`, `src/dev/fixtures.ts`, the CRM badges and SlaTimer, with tests.
- [ ] **T10 — CRM components:** LeadCard, LeadHeader, AttemptCard, FollowUpItem, CheckInCard, TeamMemberRow, MessageBubble and KpiGrid, with tests.
- [ ] **T11 — Catalog:**
  - `/dev/ui` (guarded by `isCatalogEnabled`) and `/dev/ui/shell?role=`.
  - Playwright screenshot script `npm run ui:shots`.
  - Fill in the `docs/ai/components.md` registry.
- [ ] **T12 — Zod input schemas:** `src/domain/schemas/*` (contact, lead, attempt, follow-up, team, user), with tests.
- [ ] **T13 — DB core:** connection with `attachDatabasePool`, `withTransaction`, the plugins, and the models Department, Team, User, Attendance, Contact, Lead and LeadAssignment, with DB tests.
- [ ] **T14 — Supporting models:**
  - ContactAttempt, FollowUp, Activity (insert-only), AuditLog (insert-only), Job and Lock.
  - Notification, PushSubscription, Document, WhatsAppNumber, Message, Setting and IngestEvent (TTL).
  - Counter, plus the `models/index.ts` barrel and `ALL_MODELS`.
  - DB tests.
- [ ] **T15 — Seed & indexes:**
  - `src/server/db/seed/build-seed.ts`: 2 departments, 1 admin, 2 managers, 8 agents, 60 leads plus attempts, follow-ups and messages.
  - `scripts/seed.ts` and `scripts/sync-indexes.ts`.
  - A seed test.
- [ ] **T16 — Verify:** `npm run check`, `npm run build`, catalog screenshots, `docs/ai/schema.md` ERD, update the progress log, commit.
