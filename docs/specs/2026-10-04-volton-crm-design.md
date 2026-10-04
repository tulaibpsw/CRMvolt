# Volt On Solar CRM — Plan (foundation first)

## Context

Volt On Solar (Pakistan) has two departments — **Trading** (selling panels / inverters / batteries) and
**Solar Installation** (site projects) — each with its own manager and team of agents.

- **Today:**
  - Leads from Meta / Facebook / WhatsApp / Google land in a **Google Sheet**.
  - Agents pick them by hand, call from their **own mobiles (WhatsApp calls)**, write in the Sheet whether
    the customer picked up, and do **up to 3 follow-ups**.
  - A manager holds the company **WhatsApp Business app** number and boosts ads from it.
  - There is no proof of work, no fair distribution, and no live view.
- **Wanted:**
  - The Sheet feeds the CRM automatically.
  - The manager assigns each lead; otherwise it auto-assigns in fixed order User1 → User2 → User3 → User4
    → User1 …, to **checked-in** agents only.
  - Agents keep working from their mobiles, and every action (including WhatsApp messages) is **proof**
    on the lead.
  - Agent, manager and admin dashboards.
  - Later, the rest of the PDF blueprint: requirements, quotations, sales, payments, installation,
    commission and reports.

**Decisions (confirmed with you)**

| Topic | Decision |
|---|---|
| Build order | **Foundation first.** AI rules → app analysis → central theme → reusable components → database schema (Part A). Features are built on top of it afterwards (Part B) |
| AI tools | Must work with **Claude Code and Google Antigravity** (and other agents): one `AGENTS.md` rulebook plus shared skills (A1) |
| Project | New standalone repo, `volton-crm` (outside `officeFrontend`): Next.js + MongoDB Atlas + Vercel |
| Cost | **Phase 1 = free plans only, $0 a month, no card.** The client sees the app first; costs are discussed with them before phase 2 |
| Calling | Agents keep calling from their phones. **No Twilio, no browser dialer.** Call proof = outcome + screenshot; recorded WhatsApp calls are an optional add-on (B7) |
| WhatsApp | **In phase 1**, tested on your own test WhatsApp Business / Meta's free test number. Phase 2 gives **one company SIM + WhatsApp Business number per agent** via "Coexistence" |
| Daily log | Every working day gets `progress/YYYY-MM-DD/` with done / next / remaining (A6) |

Inputs: *Volt On Solar CRM — Developer Blueprint v1.0* (PDF, 28 sections — the acceptance contract), two
voice notes, the 3-item feature list, and research on current Meta / WhatsApp / Google / Vercel /
Antigravity behaviour (Oct 2026).

---

# PART A — Foundation (built first)

## A1. AI agent setup — one rulebook for every tool

Antigravity reads `AGENTS.md` and `.agents/rules/*.md` natively, and loads skills from
`.agents/skills/<name>/SKILL.md`. Those skills use the open Agent Skills format (agentskills.io) that Claude
Code also uses. Claude Code reads `CLAUDE.md`, which simply imports `AGENTS.md`. So the rules are written
**once**:

| File | Read by | Purpose |
|---|---|---|
| `AGENTS.md` (root) | Antigravity, Codex, Cursor…; Claude Code via `CLAUDE.md` | **The rulebook** — single source of truth, kept under 24 KB (Antigravity's per-file limit) |
| `CLAUDE.md` | Claude Code | Just `@AGENTS.md` |
| `docs/ai/architecture.md` | all (linked from AGENTS.md) | Folders, layers, server/client rules, data flow |
| `docs/ai/design-system.md` | all | Tokens, colours, typography, spacing, do / don't |
| `docs/ai/components.md` | all | **Component registry:** name · path · variants · when to use |
| `docs/ai/schema.md` | all | Collections, fields, enums, indexes, ERD, conventions |
| `docs/ai/integrations.md` | all | Sheets, WhatsApp webhooks, cron, Blob — rules & gotchas |
| `docs/ai/workflow.md` | all | How to work: small steps, tests, commits, daily log |
| `.agents/skills/<name>/SKILL.md` | Antigravity | **Canonical skills** |
| `.claude/skills/<name>/SKILL.md` | Claude Code | Identical copies made by `npm run ai:sync`; `npm run ai:check` fails if they drift |
| `.agents/rules/ui.md`, `.agents/rules/db.md` | Antigravity (`trigger: glob`) | "Editing UI / models → read design-system.md, components.md, schema.md first" |

**Skills (initial):**
- **`daily-progress`** — writes the dated log (A6).
- **`new-component`** — check the registry, then reuse or extend with a variant, use tokens only, add to
  the registry and the catalog.
- **`new-model`** — constants → Mongoose model → Zod schema → indexes → `schema.md` → seed → tests.
- Later: **`new-feature`** — page + Server Action + `scopeFilter` + tests.

**What `AGENTS.md` contains** (every agent follows these):
1. **What the project is**, with links to the spec and the latest progress folder.
2. **Session start / end:** start by reading `AGENTS.md` plus the latest `progress/*/next.md` and
   `remaining.md`; end by running `daily-progress`.
3. **Stack & versions:** read `node_modules/next/dist/docs` before using Next.js APIs. Keep the block that
   `next dev` writes into `AGENTS.md`; our rules go below it.
4. **Free-tier rules:** no paid service and no new dependency without asking. Mind Atlas M0's 512 MB,
   Blob's 1 GB and Hobby's cron limits.
5. **Architecture:**
   - Server Components by default.
   - Database code only in `src/server/**` (`server-only`); pages and actions call services.
   - **Every query goes through `scopeFilter`.**
   - Multi-document changes run in one transaction, with an activity and an audit entry.
6. **Design system:**
   - **Theme tokens only** — no hex codes, no `text-red-500`, no arbitrary colours.
   - **Reuse registry components**, and extend them with variants instead of copying.
   - A new reusable component goes into the registry and the catalog.
   - Mobile-first; lucide icons only; all text comes from `src/i18n/en.ts`.
7. **Schema:**
   - Enums come only from `src/domain/constants.ts`.
   - Model, Zod schema and indexes are created together.
   - Phones in E.164; store UTC and show PKT (via `dates-pkt`).
   - Soft delete; `createdBy` / `updatedBy` on records.
8. **Security:** an auth and role check in every action and route; verify webhook signatures; secrets
   only in env; never log phone numbers or CNICs.
9. **Done means:** `npm run check` (lint + typecheck + unit tests) is green; Playwright covers user flows.
10. **Never:**
    - Twilio or a browser dialer;
    - unofficial WhatsApp libraries;
    - hard-coded colours, text or enum values;
    - hard deletes;
    - committed secrets.

## A2. App analysis — phase 1 screens → shared components

| Screen | Who | Built from |
|---|---|---|
| Login | all | AuthCard, Input, Button |
| Home (agent) | agent | CheckInCard, KpiTile, LeadCard + SlaTimer (to accept), FollowUpItem, EmptyState |
| Home (manager / admin) | manager, admin | KpiGrid, TeamLiveBoard (TeamMemberRow), QueueList, AlertList, FunnelChart, SourceChart |
| Leads list | all (scoped) | PageHeader, FilterBar, SearchBox, DataTable (desktop) / LeadCard list (mobile), BulkActionBar, Pagination |
| Lead profile | all | LeadHeader (SourceBadge, StageBadge, DepartmentBadge, SlaTimer), ContactActions, OutcomeSheet, Timeline (AttemptCard + ProofChip, MessageBubble, ActivityItem), ChatPanel, FollowUpList, SiteBasicsForm, FileUploader |
| Pipeline board | manager, admin (agent: own) | KanbanBoard, KanbanColumn, LeadCard |
| Follow-ups | agent, manager | FollowUpItem, DateGroupHeader, FilterBar |
| Team & order | manager, admin | AssignmentOrderList (drag), TeamSettingsForm, StatusBadge |
| Attendance | manager, admin | DataTable, StatusBadge, DateRangePicker |
| Proof review | manager | ReviewQueueItem (AttemptCard + flags), ConfirmDialog |
| Users | admin | DataTable, UserForm (in a Sheet), RoleBadge |
| Settings (hours, SLA, Sheet, WhatsApp) | admin | SettingsSection, form fields, TimeRangeInput |
| Notifications | all | NotificationBell, NotificationItem |

**Most reused, so built first:**
- the **StatusBadge** family (stage / department / source / proof / SLA / attendance / role);
- **LeadCard**;
- **DataTable + FilterBar + SearchBox**;
- the **Timeline** items;
- **form fields** (react-hook-form + Zod);
- **Sheet / Dialog**;
- **AppShell + PageHeader**;
- **Empty / Loading / Error** states;
- **KpiTile**.

## A3. Central theme & colour scheme

- **One file: `src/styles/theme.css`** — Tailwind v4 `@theme` plus CSS variables, using shadcn/ui token
  names. It is **the only place colours exist**.
- **Three layers:** brand palette → semantic tokens → domain tones.
  - **Brand:** Volt On's exact colours, taken from the website/logo. Until those are confirmed the
    placeholders are solar amber (primary), deep navy (secondary) and energy green (accent).
  - **Semantic** (what components use): background, foreground, card, muted, border, input, ring, primary,
    secondary, accent, success, warning, danger, info. Each has `-foreground` and `-soft` (badge
    background).
  - **Domain tones come from maps, not new colours:** department (Trading / Installation), pipeline stages,
    proof chips, SLA (ok / due soon / breached) and attendance.
- **`src/domain/ui-maps.ts`**, e.g. `STAGE_META.quotation_sent = { label, tone: 'info', icon }`.
  `StatusBadge` turns tones into token classes, so changing a colour once updates the whole app.
- **Typography:** Inter via `next/font`, tabular numbers for KPIs, one type scale. An Urdu font (Noto
  Nastaliq Urdu) is added later.
- **Layout:** radius, shadows, a 4 px spacing scale, a z-index scale. Breakpoints are **mobile-first**
  (phone base, `md` tablet, `lg` desktop), and touch targets are at least 44 px.
- **Light theme by default;** dark tokens are defined too, with an optional toggle.
- **Later (free):** an admin "Brand colours" setting overrides the CSS variables at runtime, with no code
  change.
- **Guard rails:** a lint rule blocks hex/rgb literals and Tailwind palette or arbitrary colour classes
  outside `theme.css`. A unit test (with `culori`) checks that token pairs meet WCAG AA contrast.

## A4. Reusable component library

Three layers; each layer may only use the layers below it.

| Layer | Folder | Contents |
|---|---|---|
| 1 · Primitives | `src/components/ui/` | shadcn/ui — Button, Input, Select, Textarea, Checkbox, Switch, Badge, Card, Dialog, **Sheet (mobile bottom sheet)**, DropdownMenu, Tabs, Tooltip, Popover, Toast, Skeleton, Avatar, Table, Calendar, Command. Styled only through tokens |
| 2 · Patterns | `src/components/common/` | AppShell (sidebar + mobile BottomNav), PageHeader, DataTable, FilterBar, SearchBox, Pagination, EmptyState / ErrorState / LoadingState, ConfirmDialog, KpiTile, ChartCard, Timeline, FileUploader (signed URL, camera, compression), PhoneInput (+92), DateTimePicker (PKT), CountdownTimer, StatusBadge, form fields (RHF + Zod) |
| 3 · CRM | `src/components/crm/` | LeadCard, LeadHeader, SourceBadge, StageBadge, DepartmentBadge, SlaTimer, ContactActions, OutcomeSheet, AttemptCard, ProofChip, FollowUpItem, CheckInCard, TeamMemberRow, AssignmentOrderList, ChatPanel, MessageBubble, KanbanBoard, KpiGrid, SiteBasicsForm, NotificationBell, ReviewQueueItem |

**Rules**
- Variants come from `cva`; never copy a component to change it.
- Props are typed.
- Every component handles loading, empty, error and mobile.
- Components are accessible: labels, visible focus, keyboard use.

**Registry:** `docs/ai/components.md` lists every component — name, path, props and variants, when to use
it, and a screenshot.

**Catalog page `/dev/ui`** (dev builds and admins only): every component in every state, with demo data.
It is the living style guide (a free alternative to Storybook), and something to show the client early.

## A5. Database schema design

**One source for every enum: `src/domain/constants.ts`** (`as const` arrays). Mongoose `enum`, Zod
`z.enum` and the UI maps all use it, and a test fails if any enum value has no UI-map entry.

| Enum | Values |
|---|---|
| ROLES | admin, manager, agent |
| DEPARTMENTS | TRADING, INSTALLATION |
| LEAD_STATUS | open, won, lost, unreachable, junk |
| STAGES (installation) | new, contacted, interested, requirement_collected, site_survey, quotation_pending, quotation_sent, negotiation, won, lost |
| STAGES (trading) | same, without site_survey |
| LEAD_CHANNELS | sheet, whatsapp, website, manual, csv_import, meta_webhook |
| ASSIGNMENT_STATE | unassigned, manager_window, waiting, assigning, assigned, accepted |
| ASSIGNMENT_METHOD | manual, auto, timeout, transfer |
| ATTEMPT_CHANNELS | whatsapp_chat, whatsapp_call, phone_call |
| CALL_RESULTS | connected, no_answer, busy, number_off, wrong_number, could_not_call |
| CUSTOMER_RESPONSES | interested, not_interested, call_back_requested, already_has_solar |
| PROOF_STATUS | verified, evidenced, logged, flagged |
| FOLLOW_UP_STATUS | pending, done, missed, cancelled |
| ATTENDANCE_STATUS | checked_in, on_break, checked_out |
| MESSAGE_* | direction in / out · sentFrom customer / app / api · status sent / delivered / read / failed |
| DOCUMENT_CATEGORIES | attempt_screenshot, site_photo, layout_design, net_metering, electricity_bill, cnic, contract, receipt, installation_photo, other |
| ROOF_TYPES / SHADING | rcc_slab, metal_sheet, tile, shingle, ground_mount, other / none, partial, heavy |
| LOST_REASONS | price, competitor, not_interested, no_roof_space, financing, not_eligible, other |
| JOB_KINDS | manager_window_end, accept_due, contact_due, follow_up_due, follow_up_overdue, auto_checkout |

**Phase 1 collections**

| Collection | Key fields (short) |
|---|---|
| `users` | name, username/email, phone, role, departmentId, managerId, isActive, autoPausedAt (+ Better Auth fields) |
| `departments` | name, code, seeded pipeline stages, routing keywords, working hours |
| `teams` | departmentId, managerId, **memberOrder** (the only place order lives), rr {lastUid, lastPos}, version, managerWindowMin, paused, acceptWithinMin, contactWithinMin, maxPendingAccept, autoMoveOnAcceptTimeout |
| `attendance` | userId, date (PKT key), status, checkInAt, checkOutAt, breaks[] — unique {userId, date} |
| `contacts` | name, **phones [E.164]** (unique, multikey), whatsappE164, email, city, area, address, type |
| `leads` | leadNo, contactId, departmentId, teamId, stage, stageChangedAt, status, closedAt, lostReason, wonValue, receivedAt, assignableAt, **source** {channel, rowKey, metaLeadId, submittedAt, campaign/adset/ad/form IDs + names, platform, **ctwa** {source_id, source_type, source_url, headline, body, media_type, media URLs, ctwa_clid, welcome_message}}, **assignment** {agentId, state, assignedAt, assignedBy, method, acceptedAt, bounces}, firstContactAt, lastContactAt, attemptCount, noAnswerStreak, nextFollowUpAt, **site** {bill PKR, roof, shading, targetKw, battery, propertyType…}, **trading** {customerType, products, qty, city}, extra {}, version, deletedAt, createdBy/updatedBy |
| `lead_assignments` | leadId, agentId, by, method, assignedAt, acceptedAt, endedAt, reason |
| `contact_attempts` | leadId, agentId, channel, followUpNo, serverTapAt, leftAt, returnedAt, outcomeAt, result, response, remarks, durationSec?, proof {docIds, phash, messageIds}, proofStatus, flags[], review {status, by, at}, recording {blobKey, sourceId, durationSec} *(add-on)* — the PDF's `calls` / the feature list's "VoIP log" |
| `follow_ups` | leadId, agentId, number, dueAt, status, outcome, attemptId |
| `activities` | leadId, type, actorId, at, data — insert-only timeline (PDF `lead_activities`) |
| `audit_logs` | entity, entityId, action, before, after, actorId, at — insert-only (PDF §23) |
| `jobs` / `locks` | kind, leadId, assignmentId, dueAt, status, tries / _id, until |
| `notifications` | userId, type, title, body, link, **dedupeKey (unique)**, readAt — TTL 90 days; plus `push_subscriptions` |
| `documents` | owner, category, fileName, mime, size, blobKey, uploadedBy, at, deletedAt |
| `whatsapp_numbers` / `messages` | phoneNumberId, number, owner (agent or department ad number), status, lastEchoAt / waMessageId (unique), contactId, leadId, numberId, direction, type, text, mediaBlobKey, sentFrom, sentByUserId, status, at |
| `settings` / `ingest_events` / `counters` | hours, holidays, SLA defaults, Sheet config / raw webhooks + idempotency key (TTL 30 days) / lead no., quotation no. (VO-1025) |
| *Later (phases 3–4)* | `products`, `price_history`, `quotations` (items + price snapshot embedded, one doc per version), `site_surveys`, `sales`, `payments`, `commissions`, `commission_rules`, `targets`, `campaigns` |

**Conventions**
- camelCase field names and Mongoose timestamps.
- `createdBy` / `updatedBy` via a plugin.
- Soft delete with `deletedAt`.
- Phones in E.164; money as integer PKR; dates stored in UTC and shown in PKT.
- **Embed** one-to-one data (site basics, the current assignment); **reference** one-to-many data
  (attempts, follow-ups, activities, messages).
- The state change, its activity and its audit entry go in **one transaction**.

**Key indexes**
- leads `{departmentId, stage, status}` and `{assignment.agentId, status, nextFollowUpAt}`;
- **partial unique** leads `{contactId, departmentId}` where status is open;
- partial unique `source.metaLeadId` and `source.rowKey` (`$type: 'string'`);
- contacts `{phones}`; follow_ups `{agentId, status, dueAt}`; attempts `{agentId, serverTapAt}`;
  activities `{leadId, at}`; messages `{contactId, at}`; jobs `{status, dueAt}`.

**PDF §22 mapping**

| PDF collection | Here |
|---|---|
| `agents` | `users` |
| `calls` | `contact_attempts` |
| `lead_activities` | `activities` |
| `customer_requirements` | `lead.site` / `lead.trading` |
| `quotation_items` | embedded |
| `quotation_versions` | one quotation document per version |
| `product_prices` | `price_history` |

**Deliverables**
- `src/server/db/models/*.ts`;
- `src/domain/schemas/*.ts` (Zod);
- `docs/ai/schema.md` (Mermaid ERD + field tables);
- `scripts/seed.ts`: 2 departments, 2 managers, 8 agents and about 60 realistic demo leads with attempts
  and messages, used by the catalog and the client demo;
- an index-sync script.

## A6. Daily progress log

```
progress/
  README.md                 # index, newest first: date + one-line summary
  2026-10-04/
    done.md                 # built / changed today: files or commits, tests + result, decisions + why
    next.md                 # next session's tasks in order, tagged with milestone (e.g. "M0 — StatusBadge")
    remaining.md            # milestone checklist ✅ / 🔄 / ⬜ + open bugs, blockers, client questions
    screenshots/            # optional, for UI work
```

- The date uses Pakistan time, in `YYYY-MM-DD` format.
- If today's folder already exists, it is **updated, not overwritten** — new entries go under a time
  heading.
- The log is committed as `docs(progress): YYYY-MM-DD`.
- It is written by the `daily-progress` skill, and enforced by `AGENTS.md`: end every session with it, and
  start every session by reading the latest `next.md` and `remaining.md`.

## A7. Project structure

```
AGENTS.md  CLAUDE.md  docs/ai/*.md  docs/specs/2026-10-04-volton-crm-design.md
.agents/skills/*  .agents/rules/*  .claude/skills/*   # AI setup (A1)
progress/                                            # daily log (A6)
src/
  styles/theme.css                                   # the only place colours exist (A3)
  domain/ constants.ts  ui-maps.ts  schemas/         # enums, tone/label maps, Zod (A5)
  i18n/en.ts                                         # all user-facing text
  components/ ui/  common/  crm/                     # 3-layer library (A4)
  app/
    dev/ui/                                          # component catalog
    (auth)/login/   (crm)/{dashboard,leads,leads/[id],pipeline,follow-ups,team,attendance,review,settings}/
    api/cron/{tick,sheet-pull,nightly}  api/attempts/tap  api/webhooks/whatsapp
    api/ingest/website  api/push/subscribe  api/uploads/sign
  server/   # 'server-only': db/ (connection, models, audit plugin, withTransaction) · auth/ (rbac,
            # scopeFilter) · leads/ · assignment/ · jobs/ · attendance/ · attempts/ · followups/ ·
            # integrations/{google-sheets,whatsapp}/ · notifications/ · documents/ · reports/
  lib/ phone.ts  dates-pkt.ts  money.ts  env.ts
scripts/ seed.ts  sync-ai.mjs  check-ai.mjs
.github/workflows/backup.yml                         # free nightly mongodump
tests/ (unit, integration, e2e, fixtures)    vercel.json (daily cron)
```

## A8. Foundation — done when (milestone M0)

- **AI setup:** `AGENTS.md`, `CLAUDE.md`, `docs/ai/*`, the skills and the Antigravity rules exist, and
  `npm run ai:check` passes. Asking Claude Code and Antigravity "what are this project's colour and
  component rules?" gives the same answer.
- **Theme:** `theme.css` is the only file with colours; the colour lint rule and the contrast test pass.
- **Components:** `/dev/ui` shows every phase 1 component in its loading, empty, error, mobile and desktop
  states, and every component is in the registry.
- **Schema:**
  - phase 1 models, Zod schemas and indexes are in place;
  - `npm run seed` builds the demo data;
  - the enum ↔ UI-map test and the model validation tests pass on `MongoMemoryReplSet`.
- **Daily log:** `progress/<date>/` is written for each working day.

---

# PART B — App roadmap (built on the foundation, milestone by milestone)

## B1. End-to-end flow

```
Meta forms / FB / WhatsApp ads / Google ──► Google Sheet ──(CRM pulls every minute, writes back)──┐
Mobile quick-add / website form / CSV / WhatsApp webhook ──────────────────────────────────────────┤
                                                                                                    ▼
          ingestLead(): phone → +92, de-duplicate, route to department, create lead + timeline event
                                                                                                    ▼
     Manager window (5 min, only if the manager is checked in) → else auto-assign in fixed order to checked-in agents
                                                                                                    ▼
     Push alert → Accept → WhatsApp / Call buttons (server-timed) → 2-tap outcome → follow-up 1 / 2 / 3
                                                                                                    ▼
     Proof: Logged / Evidenced (screenshot) / Flagged → Verified when the WhatsApp message itself is saved
```

## B2. Roles & access

| Role | Sees | Can do |
|---|---|---|
| Admin | Everything | Users, teams, settings, reassign anything, reports, exports |
| Manager (Trading / Installation) | Own department + team | Assign, bulk-reassign, team order, pause auto-assign, review proof, export |
| Agent | Only their own leads | Check in/out, accept, contact, outcomes, follow-ups, notes, uploads |

- PDF terms: the PDF's "Admin" = our Admin plus the department Manager. The PDF's "Sign/Claim" = **Accept**.
- Every query and action goes through `scopeFilter(user)`.
- No hard deletes; everything is audited.

## B3. Lead intake

**Google Sheet → CRM.** *Sign-off line:* "Meta → Google Sheet → CRM. After import the CRM is the source of
truth, and later Sheet edits are ignored. The CRM writes Lead No and Assigned To back into the Sheet."
- **Setup:** a free Google Cloud service account, with the Sheet shared to it as Editor.
- **Schedule:** the pull runs every minute (B14), plus a **Sync now** button.
- **Columns:** found by header name; Meta's headers are auto-detected, with JSON overrides; unknown columns
  are kept in `lead.extra`.
- **Duplicates:** the guard is a unique `rowKey` (the Meta lead ID, or else a hash of tab + phone + created
  time). Write-back is only a convenience.
- **Never miss a row:** a cursor plus a nightly reconcile. Old rows are marked before the first pull so
  they don't flood the round-robin.
- **Why not a Google Apps Script:** `onEdit` doesn't fire for rows written by integrations, and a 1-minute
  trigger can exhaust the free Gmail quota.

**Other sources:**
- mobile quick-add with a duplicate warning (manager tags WhatsApp-ad chats until the real number is
  connected);
- the website form (API key) and CSV import;
- **WhatsApp chats (phase 1)**;
- the direct Meta `leadgen` webhook (phase 2, needs App Review).

**De-dup & routing:**
- Phones are normalised with `libphonenumber-js` (`0300-1234567` → `+923001234567`).
- A phone with an open lead in the same department creates a "Re-inquiry" event, not a new lead.
- Routing: Sheet tab → keyword in the campaign/form/ad name → department column → "Unrouted" queue.
- A manager can move a lead to the other department.

**Click-to-WhatsApp fields** come from the `referral` object on the first message (see the `ctwa` field).
Meta documents `source_type` only as `ad` — it is not Facebook vs Instagram. It sends no platform field, so
`platform` is a guess from `source_url`.

## B4. Check-in & assignment engine

**Check-in:** buttons on the agent's home screen. Eligible = checked in and not on break (no heartbeat).
Agents are checked out automatically at closing; the manager can force a check-out.

**Defaults:**

| Setting | Default |
|---|---|
| Manager window | 5 min (0 = auto at once) |
| Pause switch | off |
| Accept within | 5 min |
| Contact within | 15 / 30 / 60 min, counted from **assignment** in working minutes (PDF Rule 3) |
| Pending-accept cap | 3 per agent |
| Auto-move on accept timeout | off |

**Rules:**
1. **Night or holiday leads** become assignable at the next opening time.
2. **Manager window:** it runs only if the manager is checked in at that moment; a late check-in doesn't
   reopen it.
3. **Ordered round-robin:** the next eligible agent after the last one who got a lead
   (`rr {lastUid, lastPos}`). Anyone skipped loses that turn, with no catch-up bursts; "turns skipped" is
   reported.
4. **Nobody eligible:** the lead waits, and the queue drains oldest-first on each check-in, accept, close
   and tick.
5. **Accept timeout:** manager and admin are alerted; with auto-move on, the lead is re-assigned without
   that agent and the pointer advances. After 2 bounces it goes to the manager; 2 misses in a row
   auto-pause the agent.
6. **No contact within the limit:** manager and admin are alerted, naming the lead and the agent.
7. **History:** manual assigns and re-inquiries don't move the pointer; every change is kept in
   `lead_assignments`.
8. **Agent removed:** their sessions are revoked and their leads go back to the queue (logged).

**Concurrency:** one MongoDB transaction does the whole assignment, and push notifications are sent only
after it commits:
```ts
await withTransaction(async (s) => {
  const lead = await Lead.findOneAndUpdate({ _id, status: 'open', 'assignment.agentId': null },
    { $set: { 'assignment.state': 'assigning' } }, { session: s });
  if (!lead) return;
  const team = await Team.findOneAndUpdate({ _id: lead.teamId }, { $inc: { version: 1 } }, { session: s, new: true });
  const next = pickNext(team.memberOrder, team.rr, await eligibleAgents(team, lead, s));
  if (!next) return markWaiting(lead, s);
  await Team.updateOne({ _id: team._id }, { $set: { rr: next } }, { session: s });
  await assign(lead, next.uid, { method: 'auto', session: s });
});
```

## B5. Working a lead from the mobile — proof of work

**Buttons** (each tap is logged on the server first, then the app opens):
- **WhatsApp** → the WhatsApp Business app (Android intent `com.whatsapp.w4b`, falling back to `wa.me`),
  with a greeting pre-filled.
- **Call** → the phone dialer (`tel:`).
- **WhatsApp call** → opens the chat; the agent taps the call icon.

In phase 1 testing, agents reply from the CRM chat panel instead. An on-screen **pre-call script** replaces
the "whisper".

**Outcome sheet** (2 taps, PDF §9 wording):
1. **Call result:** Connected / No Answer / Busy / Number Off / Wrong Number / *Couldn't call now*.
2. **Customer response:** Interested / Not Interested / Call Back Requested / Already has solar.
3. **Also:** remarks, the next follow-up, an optional duration, and a screenshot (the manager can make it
   mandatory).

**3 follow-ups:** set on a cadence and moved into working hours, with reminders and escalation. A lead
becomes **Unreachable** only after 3 failed attempts on at least 2 different days.

**Fraud flags:**
- **Away time:** the server tap time plus Page Visibility leave/return times give an "away time"; never
  leaving the app is a flag.
- **Too fast:** each result has a minimum believable time, e.g. "No Answer" in under 15 seconds.
- **Screenshot checks:** reused across leads (perceptual hash), or taken far from the tap time.
- **Patterns:** batch logging, logging while off duty, an outlier no-answer rate, and leads a colleague
  later converts.

**How managers see it:**
- Proof chip on each attempt: **Verified / Evidenced / Logged / Flagged**.
- A manager review queue with Reviewed / Dispute actions (logged).
- Weekly spot-check callbacks.

## B6. WhatsApp — phase 1 build, phase 2 client numbers

**Phase 1 (free).**
- **Number:** Meta's free test number, which can message up to 5 verified phones; use a System User
  token.
- **Built:**
  - the webhook `/api/webhooks/whatsapp` — GET verify; POST checked with `X-Hub-Signature-256` over the raw
    body; de-dup by message ID (Meta retries for 36 h); raw payloads in `ingest_events`;
  - handling of `messages`, `statuses` and `smb_message_echoes`;
  - images and documents copied into Blob (videos skipped);
  - automatic leads, with the ad fields;
  - a chat panel and reply box on the lead, with Verified attempts.
- **Coexistence check (first 1–2 days):** try connecting your test WhatsApp Business **app** number
  through our Meta app's Embedded Signup. Meta normally limits this to Tech Providers and partners. If it
  doesn't work, echoes are tested with Meta's sample payloads.

**Phase 2 (after the cost discussion).**
- Each agent gets a company SIM and the WhatsApp Business app on their phone, linked through
  **Coexistence** (QR from the CRM's Connect screen). Messages typed in the app arrive as echoes and are
  saved under that agent; up to 180 days of history can be imported.
- The manager's ad number is linked too, so Click-to-WhatsApp leads are created automatically.
- **Onboarding route:** A = our own Tech Provider approval (no fee per number, takes weeks); B = a partner
  (360dialog / WATI / Interakt / respond.io, about $59 per number a month at 360dialog).
- **Limits:**
  - up to 20 numbers after Business Verification;
  - each phone must open WhatsApp Business at least every ~13 days or the number disconnects (monitored);
  - calls are not mirrored;
  - broadcast lists and disappearing messages are disabled;
  - several agents can't share one number and still be told apart.

## B7. Calls & recordings

**WhatsApp API recording exists.** The Calling API records calls and announces it to both sides, which is
the feature list's "whisper". But:
- it covers only calls made **through the API**;
- it does **not** work on Coexistence numbers, so it needs a separate API-only number, with agents calling
  from inside the CRM app (WebRTC);
- the customer must allow calls first (at most 1 request a day; the permission lasts 7 days or is
  permanent);
- the file has to be fetched within 5 minutes, and Meta keeps it for 7 days;
- calls the business starts are billed per 6-second pulse.

**Decision:** outcome + screenshot now. The **Recorded WhatsApp call** add-on (API-only number → Meta
recording → Blob → audio player) is decided in the phase 2 cost talk.

**Not doing:** Twilio / phone lines, Android call recorders (WhatsApp calls can't be captured on Android
10+), notification readers, unofficial WhatsApp libraries.

## B8. Pipelines

The lead pipeline ends at **Won / Lost**; post-sale steps live on the Sale record (PDF §16).

| Department | Stages |
|---|---|
| Installation | New → Contacted → Interested → Requirement Collected → Site Survey → Quotation Pending → Quotation Sent → Negotiation → Won · Lost |
| Trading | The same, without Site Survey |

- **Unreachable** and **Junk/Test** are separate closed states, and Lost needs a reason.
- **PDF §7 → here:**

  | PDF step | Here |
  |---|---|
  | Assigned / Signed / Contact Pending | Badges on the card |
  | Called | "Attempt n/3" chip |
  | Customer Response | Contacted / Interested |
  | Follow-up | A task filter |
  | In Process | Negotiation |

- **Phase 1 board:** read-only; drag-and-drop comes later.
- **Phase 4 Projects board** (the feature list's Kanban):
  - Installation: Contract Signed → Engineering/Permitting → Installation → Net-metering (PTO) → Completed.
  - Trading: Order Confirmed → Dispatched → Delivered → Fully Paid.

## B9. Lists, search, lead profile

- **Views** (PDF §21): All, New, Unassigned, My Leads, Follow-ups, Lost, Unreachable.
- **Filter bar:** date, agent, campaign, source, status, department.
- **Search** by phone (any format), name or lead number.
- **Manager tools** (audited): bulk reassign, redistribute an absent agent's leads, move department, mark
  Junk/Test, edit phone, CSV export.
- **Profile:** header (badges, SLA timer, buttons) plus tabs — Timeline, WhatsApp chat, Follow-ups,
  Site/Requirement, Documents. An agent sees only "open Installation lead — Agent X" for another
  department's lead.

## B10. Solar data & documents

- **Phase 1 site basics:**
  - Installation: WhatsApp number, city/area, property type, monthly bill (**PKR**), roof type, shading,
    target kW (suggested as units ÷ (30 × sun-hours × 0.8)), battery Y/N.
  - Trading: customer type, products, quantity, delivery city.
- **Phase 3:** the full PDF §11 form, the appliance load list, site surveys, and the document vault
  (survey photos, designs, net-metering papers, bill, CNIC, contract, receipts).
- **Uploads:** straight from the phone to private Blob via signed URLs; images compressed to about 150 KB.

## B11. Notifications

- **Channels:** in-app bell plus Web Push (free; on an iPhone only once the app is installed to the Home
  Screen). Each alert is sent once (`dedupeKey`).
- **Triggers (PDF §10/§20):**
  - new or unassigned lead;
  - assigned or reassigned;
  - new WhatsApp message;
  - not accepted / not contacted (manager + admin);
  - follow-up due or overdue;
  - Unreachable;
  - agent auto-paused;
  - WhatsApp number disconnected;
  - later: quotation, sale, commission.

## B12. Dashboards

- **KPI tiles use the PDF's exact labels** (§4/§8). Tiles for modules not built yet show "Phase n";
  filters cover date, agent, campaign and source.
- **Agent:** check-in, leads to accept, today's follow-ups, unread chats, my stages, attempts and pick-up
  rate.
- **Manager:** live team board, queue, alerts, per-agent table (attempts, messages, pick-up %, on-time
  follow-ups, flags, time to first contact, turns skipped, conversions), funnel, sources, review queue.
  Installation adds surveys and kW; Trading adds orders and top products.
- **Admin:** both departments, campaigns, attendance, and integration health (last Sheet pull, last tick,
  WhatsApp status).

## B13. Tech stack (phase 1 = all free)

| Concern | Choice |
|---|---|
| App | **Next.js (latest stable, 16+)**, App Router, TypeScript, Server Actions, `proxy.ts` for auth gating |
| UI | Tailwind v4 + shadcn/ui, PWA (manifest, service worker, `web-push` + VAPID) |
| Auth | **Better Auth** (username/email + password, admin plugin), MongoDB adapter |
| Hosting | **Vercel Hobby (free)** + `*.vercel.app`. Commercial use later needs Pro (phase 2 talk) |
| Database | **MongoDB Atlas M0 (free, 512 MB) + Mongoose**, free nightly backup via GitHub Actions `mongodump`, `attachDatabasePool` |
| Files | **Vercel Blob private store, free 1 GB**, signed URLs (fallback: Supabase Storage free) |
| Timers | **cron-job.org (free)** every minute + the app's own polling as a backup clock + Hobby's daily cron |
| Integrations | Meta WhatsApp Cloud API (free test number) · Google Sheets API (service account) |
| Later | `@react-pdf/renderer` (quotation PDFs), Resend free tier |
| Utilities | libphonenumber-js, Zod, react-hook-form, TanStack Table, Recharts, class-variance-authority, lucide-react, date-fns-tz, culori (dev) |
| Quality | Vitest + `MongoMemoryReplSet`, Playwright (mobile viewport), Vercel logs |

## B14. Background jobs (free)

- **Who triggers them:** cron-job.org calls `/api/cron/tick` and `/api/cron/sheet-pull` every minute with
  a secret header. The app's 15-second polling runs due jobs whenever the last tick is over a minute old.
  Hobby's daily cron runs `/api/cron/nightly` (Sheet reconcile, stats).
- **Safe to repeat:** each route takes a Mongo lease lock (`locks`, 50 s) and processes due `jobs` in small
  batches. Handlers re-check the lead's state, so a repeated tick is harmless.
- **Time:** all business time goes through `dates-pkt` (Asia/Karachi, working hours, holidays); never call
  `getHours()` on the server.

## B15. Phases & milestones

| PDF phase | This plan |
|---|---|
| 1 — login, roles, leads, Sheets, assignment, calls, notifications | **Phase 1** (+ WhatsApp, search, export, bulk tools, site basics) |
| 2 — requirements, products, quotations | Phase 3 |
| 3 — sales, payments, installation, commission | Phase 4 |
| 4 — reports, WhatsApp/email automation | WhatsApp + dashboards in phase 1; full reports in phase 5 |
| 5 — quotation revisions, portal, automation | Versions in phase 3; the rest in phase 5 |

**Phase 0 — free accounts and inputs** (no code, no card):
- **Accounts:** Vercel Hobby, Atlas M0, a Google Cloud service account, cron-job.org, a Meta developer app
  with WhatsApp (test number), and a private GitHub repo.
- **Inputs:**
  - a copy of the Sheet;
  - your test WhatsApp Business number plus up to 5 test phones;
  - **Volt On's brand colours / logo**;
  - the users and team order;
  - working hours, SLA values and the follow-up cadence.
- **Optional (free, slow):** Meta Business Verification.

**Phase 1 — Lead tracking MVP with WhatsApp**

| # | Milestone | Acceptance check |
|---|---|---|
| **M0** | **Foundation (Part A):** AI setup, theme, component library + catalog, schema + seed, daily log | A8 checklist passes |
| M1 | Auth & access: Better Auth, users/teams screens, `scopeFilter`, audit plugin, nightly backup | An agent calling another agent's lead action gets 403; the backup restores into a fresh database |
| M2 | Leads core: quick-add with duplicate warning, search, views, CSV export, timeline | "0300 1234567" finds +923001234567; two identical imports at once create one lead |
| M3 | Sheet pull + history import | A crash between insert and write-back creates no duplicate; sorting the Sheet loses no row; a new row is live within 2 min |
| M4 | Attendance + assignment engine + jobs | Leads go 1→2→3→1→2 with agent 4 offline; 100 parallel assignments, no doubles; timers fire with cron-job.org paused while the app is open |
| M5 | Agent PWA: buttons, outcome sheet, screenshots, follow-ups | A real Android phone records away time; 3 no-answers over 2 days → Unreachable + alert |
| M6 | WhatsApp: webhook, auto-leads, chat panel + reply, echoes, Verified, Coexistence check | A test-phone message creates and assigns a lead within seconds; a reply shows status ticks; a bad signature is rejected; a replayed echo verifies the attempt |
| M7 | Notifications, SLAs, Web Push | Each PDF §10 trigger fires exactly once; a push reaches a locked Android phone within 1 min |
| M8 | Manager tools: live board, queue, bulk reassign, absent-agent redistribution, transfer, proof review | Deactivating an agent returns their leads to the queue, logged |
| M9 | Pipelines + dashboards (PDF KPI names), site basics | KPI counts equal the CSV export for the same filters |
| M10 | **Client demo** on the free stack (+ an optional one-team pilot) | Sheet row → assigned → accepted → WhatsApp reply → outcome + screenshot → follow-up → dashboard, end to end |

**Later phases**
- **Phase 2 — go live (after the cost discussion):** paid upgrades only where needed, real WhatsApp
  numbers via Coexistence, Business Verification, the optional `leadgen` webhook, and the recorded-calls
  decision.
- **Phase 3 — solar sales tools:** the full requirement form, site surveys, document vault, products &
  pricing, and the quotation builder → PDF → versions → WhatsApp link with "Viewed" tracking.
- **Phase 4 — money:** sales, payments, the Projects board, and commissions (Pending / Approved / Paid /
  Adjusted with a reason).
- **Phase 5 — growth:** full reports, a CRM → Sheet backup, the Meta Conversions API (`lead_id`,
  `ctwa_clid`), customer portal, after-sales, targets, Urdu UI, AI summaries, and admin-editable brand
  colours.

## B16. Extra features (beyond the PDF)

- **Already in the MVP:**
  - time-to-first-contact;
  - re-inquiry alerts;
  - required lost reason;
  - the 2-day Unreachable rule;
  - the night-lead queue;
  - fraud flags + review queue;
  - absent-agent redistribution;
  - Sheet write-back;
  - Excel history import;
  - an unread-WhatsApp badge.
- **Later:**
  - phone masking;
  - WhatsApp templates;
  - lead scoring;
  - a solar savings calculator;
  - GPS site surveys;
  - quotation "Viewed" tracking;
  - campaign ROI;
  - targets and a leaderboard;
  - attendance reports;
  - AMC / warranty tickets;
  - referrals;
  - a customer portal.

## B17. Cost

**Phase 1: $0** — Vercel Hobby, Atlas M0, Blob 1 GB, cron-job.org, Sheets API, the WhatsApp test number,
Web Push and GitHub Actions.

**Phase 2 cost discussion with the client** (not needed for the demo):
- **Vercel Pro:** $20 per seat a month, required for commercial use.
- **Database with automatic backups:** Atlas Flex $8–30 or M10 ~$57 a month.
- **More storage,** only if needed.
- **WhatsApp API messages:** messages typed in the app are free. In Pakistan from 1 Oct 2026, API messages
  are ≈ $0.047 for marketing and ≈ $0.015 for utility/service — confirm.
- **Coexistence route:** A = $0, or B ≈ $59 per number a month.
- **Company SIMs.**
- **The optional recorded-calls add-on.**

## B18. Risks & sign-offs

- **Logging can be gamed in phase 1.** Covered by the flags, the review queue, spot-checks and Verified
  chats.
- **Agents may use personal WhatsApp.** The button opens WhatsApp Business only, plus a written policy.
- **Free-plan limits:**
  - M0 has 512 MB and no automatic backups (nightly dump, 30-day TTL on raw data);
  - Hobby is non-commercial (Pro before production);
  - cron-job.org can miss a minute (the backup clock covers it);
  - Blob has 1 GB;
  - the test number reaches only 5 phones.
- **Coexistence may need Meta approval or a partner.** The M6 check tells us early.
- **Sheet format and brand colours are unknown.** We need both in phase 0.
- **The client signs off:**
  - the Sheet direction;
  - assignment defaults;
  - the follow-up cadence and Unreachable rule;
  - stages;
  - working hours;
  - for phase 2: SIM per agent and the Coexistence route.

---

## Verification

- **Foundation (M0):**
  - `npm run check` (lint, typecheck, unit tests) passes;
  - `npm run ai:check` passes;
  - the colour lint rule and the contrast test pass;
  - the enum ↔ UI-map test passes;
  - model validation and index tests pass on `MongoMemoryReplSet`;
  - `npm run seed` loads the demo data;
  - `/dev/ui` is checked on a phone-sized and a desktop viewport (Playwright screenshots saved to
    `progress/<date>/screenshots/`);
  - Claude Code and Antigravity each answer "what are the colour / component / schema rules?" correctly
    from `AGENTS.md`.
- **Features:**
  - unit tests for the round-robin, timers, working-minute maths, de-dup, fraud flags, rowKey and the
    WhatsApp signature and normalising;
  - integration tests for an idempotent Sheet pull, no double-assignment, alerts sent exactly once, and
    WhatsApp fixtures saved once;
  - a Playwright end-to-end test: 4 agents in order, 3 checked in → Sheet rows go 1-2-3-1-2 → accept →
    WhatsApp → "No Answer" + screenshot → follow-up → overdue alert → dashboard;
  - a live WhatsApp test: a test phone messages the test number → lead created and assigned → CRM reply
    shows ticks → attempt Verified.
- **Client demo** on the free stack with a copy of their Sheet.

## Next steps after approval

1. Create `D:\Extras\volton-crm` (separate from `officeFrontend`). Save this plan as
   `docs/specs/2026-10-04-volton-crm-design.md` and start `progress/2026-10-04/`.
2. Save the working preferences to memory: free plans first, daily progress log, foundation first, and
   rules that work in any AI tool.
3. Write the detailed task-by-task plan for **M0 (Part A)** only, then build it. Feature milestones M1–M10
   get their own detailed plans after M0 is done.
