# Done — 2026-10-05

## Production hardening (from the QA report of 2026-10-04)
- **All Critical and High loopholes are fixed or reduced.** Report: `docs/qa/2026-10-05-QA-report-after-fixes.xlsx`. 48 fixed, 7 reduced, 7 low ones left for phase 2.
- **Fake sales stopped:**
  - Agents can only move a lead forward to Contacted, Interested or Requirement collected.
  - A sale is saved from the call result ("Deal done" + value) and counts in sales only after a manager approves it in Proof review.
- **Agent closes need a manager:** Not interested, Close lead, Dead after 3 no-answers and Wrong number all need a written reason and go to manager review. "Dispute" re-opens the lead for another agent.
- **Proof of work:**
  - Times reported by the phone are checked against the server's clock.
  - A typed call length longer than the time away is capped and flagged.
  - A screenshot must be the agent's own upload made after the tap; a reused screenshot is flagged.
  - 10% of normal calls go to the manager for a call-back spot check.
  - One result per call (double tap is safe).
  - "Verified" WhatsApp proof is no longer overwritten.
- **Permissions:**
  - Every action loads records through `src/server/auth/guards.ts`.
  - Managers are limited to their own department.
  - Field agents can only report their own visits.
  - The agent-list filter (`?agentId=`) leak is closed.
  - Phone numbers stay hidden until the agent accepts.
- **Login:**
  - 5 wrong tries lock the account for 15 minutes.
  - Same answer time for unknown users.
  - Open-redirect fixed.
  - Weak passwords refused.
  - Anyone whose password was set by someone else must choose their own at first sign-in.
  - "Change password" in the menu.
- **Google Sheet:**
  - Rows are tracked by key (`sheetrows`), so deleted or sorted rows lose nothing.
  - One bad row no longer blocks the rest; failed rows are listed in Settings.
  - The first live pull waits for "history" or "start from now".
- **Assignment:**
  - Paused teams really pause.
  - Old timers can't fire on a new agent.
  - Deactivating or removing a user releases their leads and visits.
- **Check-in:** a re-check-in after closing time is no longer auto-checked-out within a minute, and the agent is told when checked out.
- **APIs:**
  - Cron secret compared in constant time.
  - The webhook rejects broken JSON, and failed WhatsApp events are retried by the cron.
  - Upload signing is images only, in each user's own folder, rate-limited.
- **UX:**
  - Spinner on every save button ("Checking in…", "Accepting…").
  - A friendly error page and a "no access" notice replace the server-error screen.
  - The review queue shows problems first.
  - Field-agent wording is about visits.

## New features (user request)
- **Super admin** role and a **Company admin** page (`/admin`):
  - departments, managers and agents, who is checked in, open leads, approved sales this month
  - add, deactivate and remove managers and admins (super admin only)
  - system health and a recent admin activity log
- **Brand colours** in Settings → Appearance (admin and super admin): 5 presets or any 2 colours; text contrast is automatic.
- Owner (super admin) account created with `npm run create-super-admin` (password given on the command line, not stored in the repo).
- WhatsApp setup guide for the client: `docs/whatsapp-setup.md`.

## Tests
- 44 new tests. 4 old tests were changed for the new rules (accept before calling, optional follow-up date).
- The full business flow runs through the real server actions (`tests/db/production-flow.test.ts`):
  - super admin → manager → employees, each changing their password
  - check in → Sheet row → pull → manual assign → accept
  - try 1 → day 2 → day 3 → deal won → manager approves → sales update
  - the Dead → dispute → re-open path
- `tests/db/security.test.ts` covers the loopholes; `tests/db/api-routes.test.ts` covers every API route and the proxy.
- The browser walkthrough on a phone-sized screen confirmed the same flow and the colour change.
