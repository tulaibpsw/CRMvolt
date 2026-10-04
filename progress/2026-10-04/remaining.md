# Remaining — as of 2026-10-04

## Phase 1 milestones
- ✅ M0 — Foundation (AI rules, theme, components + catalog, schema + seed)
- ⬜ M1 — Auth & access (Better Auth, scopeFilter, users/teams screens, audit, backup)
- ⬜ M2 — Leads core (quick-add, search, views, CSV export, timeline)
- ⬜ M3 — Google Sheet pull + history import
- ⬜ M4 — Attendance + assignment engine (manager window → fixed-order round-robin) + jobs/cron
- ⬜ M5 — Agent mobile app: WhatsApp/Call buttons, outcome sheet, screenshot proof, 3 follow-ups
- ⬜ M6 — WhatsApp (webhook, auto leads, chat panel, Verified attempts, Coexistence check)
- ⬜ M7 — Notifications, SLAs, Web Push
- ⬜ M8 — Manager tools (live board, bulk reassign, proof review)
- ⬜ M9 — Pipelines + dashboards (PDF KPI names)
- ⬜ M10 — Client demo on the free stack

## Later phases
- ⬜ Phase 2: go live after the cost discussion (real WhatsApp numbers per agent, paid tiers only if needed).
- ⬜ Phase 3: solar sales tools and quotations.
- ⬜ Phase 4: sales, payments and commission.
- ⬜ Phase 5: reports and growth.

## Open questions for the client
- Brand colours and logo.
- How do rows reach the Sheet today — Meta's connector, Zapier, or by hand? Is there a lead-ID column?
- Are 5-minute manager window, 5-minute accept and 15-minute contact the right defaults?
- The follow-up cadence (e.g. same day / +1 day / +3 days)?

## Known limits (free plan)
- **Vercel Hobby** is for non-commercial use — fine for the demo, but Pro is needed before real production use.
- **Atlas M0** has 512 MB and no automatic backup — the nightly dump comes in M1.
