# Architecture

## Layers
| Folder | Holds | May import |
|---|---|---|
| `src/app` | Routes (Server Components by default), route handlers, Server Actions | everything below |
| `src/components/ui` | shadcn primitives (generated, themed by tokens) | `lib/utils` |
| `src/components/common` | Domain-agnostic patterns (StatusBadge, DataTable, AppShell…) | `ui`, `domain`, `lib`, `i18n` |
| `src/components/crm` | CRM components fed by view models | `common`, `ui`, `domain`, `lib`, `i18n` |
| `src/domain` | Enums (`constants.ts`), `ui-maps.ts`, `navigation.ts`, view models, Zod schemas, pure rules (`sla.ts`, `numbering.ts`) | `lib`, `i18n`, lucide icons as data |
| `src/i18n` | All user-facing text | — |
| `src/lib` | Pure helpers: env, phone, dates-pkt, duration, money, `cn` | `domain/constants`, `i18n` |
| `src/server` | Server-only: db connection, models, plugins, seed, (later) services, jobs, integrations | `domain`, `lib` |
| `src/styles/theme.css` | Every colour token | — |
| `src/dev` | Demo fixtures for `/dev/ui` only | `domain` |

Components never import `src/server`. `src/domain` and `src/lib` never import from `src/components`, `src/app` or `src/server`.

## Server vs client
- Default to Server Components. Add `'use client'` only for state, effects, event handlers or browser APIs (today: `SearchBox`, `CountdownTimer`/`SlaTimer`, `ConfirmDialog`, `AppShell`).
- Client components get plain serialisable props (view models; dates as ISO strings). Server Actions may be passed as props.
- Time-dependent rendering: server components receive `now`; client clocks use `useNow()` (null on the server) to avoid hydration mismatches.

## Data flow (feature milestones)
1. A page calls a service in `src/server/<area>/service.ts` with the session user.
2. The service builds its query with `scopeFilter(user)`, reads models, maps documents → view models.
3. Mutations are Server Actions: Zod-validate (`src/domain/schemas`), check role, run `withTransaction`, write `activities` (+ `audit_logs`), then `refresh()`/`updateTag()`. Push notifications after commit.
4. Webhooks/cron are idempotent: unique keys (`waMessageId`, `source.rowKey`, `notifications.dedupeKey`, `jobs.dedupeKey`) and lease locks (`locks`).

## Routing
- `src/app/(auth)` sign-in · `src/app/(crm)` signed-in app · `src/app/api` cron, webhooks, ingest, uploads · `src/app/dev/ui` catalog (dev, or `ENABLE_UI_CATALOG=true`).
- `params`/`searchParams` are Promises. `proxy.ts` only redirects unauthenticated users; authorisation lives in services.

## Conventions
- Phones E.164 (`normalizePhone`), dates UTC stored / PKT shown (`dates-pkt`), money integer PKR (`money`).
- Database scripts run with `tsx --conditions=react-server` so `server-only` imports resolve.
