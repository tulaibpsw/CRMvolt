# Component registry

**Check here before building anything.** Reuse → extend with a `cva` variant → only then create (skill `new-component`). Every component is shown live at **`/dev/ui`** (shell preview: `/dev/ui/shell?role=agent|manager|admin`).

Layers: `ui` (primitives) ← `common` (patterns) ← `crm` (domain). A layer imports only from layers to its left.

## Layer 1 — primitives (`src/components/ui`, shadcn radix-nova, generated)
avatar · badge · button · card · checkbox · dialog · dropdown-menu · input · label · popover · select · separator · sheet · skeleton · switch · table · tabs · textarea · tooltip
- Local changes: Button `size="touch"` (h-11 mobile actions), `link` variant uses `text-foreground`; Dialog/Sheet backdrop uses `bg-overlay`.
- Add more with `npx shadcn@latest add <name> -y`, then run `npm run lint` (fix any palette class with a token).

## Layer 2 — patterns (`src/components/common`)
| Component | File | Props | Use for |
|---|---|---|---|
| StatusBadge | status-badge.tsx | `label, tone, icon?, size? sm\|md, variant? soft\|solid` | Every coloured status. Spread a ui-maps meta: `<StatusBadge {...STAGE_META[s]} />`. Also exports `statusBadgeVariants`, `toneTextClass` |
| KpiTile | kpi-tile.tsx | `label, value, hint?, icon?, tone?, comingIn?` | One number; `comingIn` shows "Phase n" |
| EmptyState / ErrorState / LoadingState | states.tsx | `title?, description?, action?` / same / `rows?, variant? list\|cards` | Every list/page state |
| PageHeader | page-header.tsx | `title, description?, actions?, backHref?` | Top of every page |
| SectionCard | section-card.tsx | `title, description?, actions?, children` | Dashboard sections, profile panels |
| FilterBar + FilterChip | filter-bar.tsx | `children` / `label, href, active?, count?` | URL-driven filters (PDF §21 views) |
| SearchBox (client) | search-box.tsx | `placeholder?, paramKey? = 'q', delayMs?` | Debounced `?q=` search. Wrap in `<Suspense>` |
| DataTable | data-table.tsx | `columns: Column<T>[], rows, getRowKey, sort?, sortHref?, empty?, caption?` | Desktop tables; sorting via URL (server does the work) |
| Timeline + TimelineItem | timeline.tsx | `children` / `icon?, tone?, title, time, children?` | Lead activity (PDF §18) |
| CountdownTimer (client) | countdown-timer.tsx | `deadline (ISO)` · hook `useNow()` | Live "Due in / Overdue" |
| ConfirmDialog (client) | confirm-dialog.tsx | `trigger, title, description?, confirmLabel?, destructive?, onConfirm` | Confirm risky actions; `onConfirm` may be a Server Action |
| AppShell (client) | app-shell.tsx | `role, userName, children` | Signed-in layout: sidebar (lg+), top bar + bottom nav (phones). Items from `src/domain/navigation.ts` |

## Layer 3 — CRM (`src/components/crm`)
| Component | File | Props |
|---|---|---|
| StageBadge, DepartmentBadge, LeadStatusBadge, RoleBadge, AttendanceBadge, AssignmentBadge, CallResultBadge, ResponseBadge | badges.tsx | one enum value + `size?` |
| SourceBadge | badges.tsx | `channel, detail?` (campaign / ad headline) |
| ProofChip | badges.tsx | `status, flags?` |
| SlaTimer (client) | sla-timer.tsx | `startedAt, deadline` — green → amber (last 25%) → red |
| LeadCard | lead-card.tsx | `lead: LeadSummary, href?, showAgent?` — phone-first list row |
| LeadHeader | lead-header.tsx | `lead: LeadDetail, actions?` — top of lead profile |
| AttemptCard | attempt-card.tsx | `attempt: AttemptView` — proof card (tap → left → back → logged) |
| FollowUpItem | follow-up-item.tsx | `followUp: FollowUpView, href?` |
| CheckInCard | check-in-card.tsx | `status, since?, onCheckIn?, onCheckOut?, onToggleBreak?` (Server Actions; disabled when absent) |
| TeamMemberRow | team-member-row.tsx | `member: TeamMemberView, now: Date` |
| MessageBubble | message-bubble.tsx | `message: MessageView` |
| KpiGrid | kpi-grid.tsx | `items: KpiItem[]` — PDF KPI labels |

View-model types: `src/domain/view-models.ts`. Demo data: `src/dev/fixtures.ts`.

## Planned (built in the milestone that first uses them — same rules)
| Component | Milestone |
|---|---|
| Form fields (RHF + Zod), toast | M1 |
| PhoneInput, BulkActionBar, Pagination | M2 |
| AssignmentOrderList (drag reorder), TeamSettingsForm | M4 |
| ContactActions (WhatsApp/Call buttons + server-timed tap), OutcomeSheet, FileUploader, SiteBasicsForm | M5 |
| ChatPanel | M6 |
| NotificationBell | M7 |
| ReviewQueueItem, DateRangePicker | M8 |
| KanbanBoard / KanbanColumn | M9 |
