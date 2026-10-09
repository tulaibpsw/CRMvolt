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
| BrandLogo | brand-logo.tsx | `height?, surface? bare\|tile, priority?` | The Volt-On logo. `tile` on light backgrounds |
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
| ActionTile | action-tile.tsx | `href, label, icon, count?, tone?` | Big shortcut to waiting work ("5 leads to assign") — top of dashboards. `count 0` = calm |
| RefreshButton (client) | refresh-button.tsx | `className?` | Re-loads the page's data (router.refresh). Lives in the top bar, so every page has it |
| UsernameField (client) | username-field.tsx | `label?, name?` | Username input with live "Signs in as: talha.khan" preview (same cleaning as the server, src/lib/username.ts) |
| SubmitButton (client) | submit-button.tsx | Button props + `pendingText?` | Submit button for plain server-action forms: spinner + disabled while saving |
| ActionForm (client) | action-form.tsx | `action, onSuccess?, children` | Every form posting to a Server Action (`useActionState`, shows errors) |
| TextField / TextAreaField / SelectField / CheckboxField | fields.tsx | `label, name, …input props` | Labelled ≥ 44 px form fields |
| ServiceWorker / InstallPrompt (client) | pwa.tsx | — | SW registration (root layout) and the "Install app" banner (Android button, iPhone Share steps) |
| AppShell (client) | app-shell.tsx | `role, userName, actions?, children` | Signed-in layout: sidebar (lg+), top bar + bottom nav (phones). Items from `src/domain/navigation.ts` |

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
| ContactActions (client) | contact-actions.tsx | `leadId, leadName, leadNo, attemptCount, pending, lastResult, stageLabel` — big WhatsApp / WA call / Call tiles; outcome sheet explains why it opened (back from WhatsApp / unsaved tap / second tap), try X of 3, last result, "what happens next", "I tapped by mistake" |
| ChatPanel (client) | chat-panel.tsx | `leadId, messages` — WhatsApp thread + send box |
| NotificationBell (client) | notification-bell.tsx | — polls `/api/me/poll` every 20 s |
| QuickAddLead (client) | quick-add-lead.tsx | — manual lead sheet |
| LeadDetailsDialog (client) | lead-details-dialog.tsx | `leadId, label?, compact?` — "Sheet details" pop-up: source, form answers and every extra Sheet column (loads on open) |
| SheetSources / SheetColumnGuide | sheet-sources.tsx | `sources, statusOf, isAdmin, defaultDepartment` — Settings → Google Sheets cards + the column rules |
| NextStepCard / LeadJourney | lead-journey.tsx | `next` / `steps` from `leadJourney()` (src/domain/lead-journey.ts) — "what to do now" + Accept → Try 1–3 → Close → Manager check |
| LeadBulkActions / LeadSelectBox (client) | lead-bulk-actions.tsx | — / `leadId, label` — managers tick leads → reason → confirm → soft delete (`deleteLeadsAction`) |
| ProofStorage | proof-storage.tsx | `stats, account, scopeLabel` — Settings → Proof storage: MB used, clear screenshots by date (preview → type CLEAR) |
| MetaLeadsPanel | meta-leads-panel.tsx | `missing, webhookUrl, state, leadCount` — Settings → Meta lead forms (admins): connection status, Turn on live leads, form → department, Fetch leads from Meta |
| QueuePanel | queue-panel.tsx | `teams` from `getQueuePanels()` — why leads wait + "Assign waiting leads now" |
| AlertPrefsForm | alert-prefs-form.tsx | `prefs, employees` — Settings → My alerts |
| UserAdminList | user-admin-list.tsx | `users, viewer` — users with the actions the viewer may use (deactivate, temp password, remove) |

View-model types: `src/domain/view-models.ts`. Demo data: `src/dev/fixtures.ts`.

## Planned (phase 2 — same rules)
| Component | Why |
|---|---|
| PhoneInput, BulkActionBar, DateRangePicker | Faster data entry / bulk work |
| Drag-to-reorder AssignmentOrderList | Today: up/down buttons on /team |
| Drag-and-drop Kanban | Today: /pipeline columns + stage select on the lead |
