# Done — 2026-10-09

## Auto-assign — what was wrong and the fix
- The live database showed **75 of 79 open leads "held until the office opens"**. They had been imported after 7 PM, and the office hours are 10:00–19:00 Mon–Sat.
- **Nobody was checked in.** Auto-assign gives leads only to checked-in agents, and only 2 check-ins had ever happened.
- Held leads waited for a cron timer. Checking in did not release them.
- Fixes:
  - **Self-healing queue.** Every waiting, held or unassigned lead is given out once its hold ends: on check-in, on accept (a slot frees up), on every cron tick and on every page poll. No cron is needed.
  - **New team switches** (Team page → Timings): "Give new leads only to checked-in agents" (on by default) and "Give out leads at night / on holidays too" (off by default).
  - **"Waiting for assignment" panel** on the manager dashboard and the Unassigned leads view. It says why leads wait (nobody checked in / office opens at … / everyone at their accept limit / team paused / no agents in the order), with an **"Assign waiting leads now"** button.

## Step-by-step lead page
- **"What to do now"** box at the top, in one sentence (accept by …, first contact, try 2 due now, nothing to do until …, close the lead, waiting for the manager).
- **Lead steps:** Accept → Try 1 → Try 2 (next day) → Try 3 (3 days later) → Close → Manager check. Each step is marked done ✓, current ● or upcoming ○, with the result and date of each try.
- "How a lead works" explanation on every lead, plus a new **Help** page in the menu (agents, field agents, managers).
- **Call screen:**
  - It shows "This will be try 2 of 3 · last time: …".
  - The pop-up says why it opened ("Welcome back from WhatsApp · you were away 1 min 20 s", "you already tapped …", "save your last …").
  - It shows try X of 3, the last result, the current stage, and numbered steps.
  - **"What happens next"** explains the result before saving (next try tomorrow / in 3 days / lead becomes Dead / closes and goes to the manager).
- **"I tapped by mistake"** cancels a tap without counting a try. It's only allowed right after the tap (away less than 2 minutes) and shows on the lead as "Cancelled — tapped by mistake".
- **A second tap** before saving the first opens the first one instead.

## Manager alerts and Ping
- **Settings → My alerts:** pick which employee actions to hear about:
  - accepted a lead
  - tapped WhatsApp / WA call / Call (with the customer name and lead number)
  - saved a result
  - cancelled a tap
  - check-in, check-out, break
  - visit updates

  Choose all employees or only ticked ones. Managers get everything by default; admins only if they opt in.
- **Ping:** a manager can nudge the agent from the lead page (Manage) or the Team page. The agent gets an alert, and it's noted on the lead.

## Tests
- 265 tests pass (10 new). Lint, types and the build are clean.
- Checked in the browser on a local test database. The live database was only read (counts only) to find the auto-assign cause.

## Later — delete leads (managers)
- **Leads page:**
  - Managers and admins get a tick box on every lead and "Select all on this page".
  - Then write a reason (required) → **Delete N** → **"Yes, delete N leads"**.
- **Lead page → Manage:** "Delete this lead…" (reason + confirm tick).
- Managers can delete only their own department's leads; admins can delete any lead. Agents can't delete.
- **What deleting does:**
  - The lead is hidden everywhere (lists, numbers, the agent's screens).
  - Timers, follow-ups and linked site visits stop.
  - The agent is told, and the delete is written in the admin activity log with the reason.
  - The record and its history are kept (soft delete), so a mistaken delete can be undone.
  - The Sheet won't import that row again.
  - The same customer can still come back later as a new lead.
- Test added (security.test.ts).
