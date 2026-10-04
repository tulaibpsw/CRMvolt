---
name: daily-progress
description: Use at the end of every work session on Volt On CRM, or when asked to log progress, wrap up, or say what was done today. Writes progress/YYYY-MM-DD/ with done.md, next.md and remaining.md.
---

# Daily progress log

Every working day has a folder `progress/YYYY-MM-DD/` (Pakistan date) so the user and client always see what was done, what is next and what is left.

## Steps
1. **Date:** today's date in Asia/Karachi, `YYYY-MM-DD` (e.g. `node -e "console.log(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi'}).format(new Date()))"`).
2. **Gather facts:** `git log --since=midnight --oneline`, `git status --short`, and the result of `npm run check` if a phase was finished. Read the previous day's `next.md` and `remaining.md`.
3. **Create or update** `progress/<date>/` — if the folder exists, ADD a new `## <HH:MM PKT>` section to each file; never delete earlier entries.
   - `done.md` — one bullet per item: what was built/changed, files or commit hashes, tests run + result, decisions made and why.
   - `next.md` — the next session's tasks, in order, each tagged with its milestone (e.g. `M2 — lead search by phone`).
   - `remaining.md` — the milestone checklist M0–M10 with ✅ done / 🔄 in progress / ⬜ not started, then open bugs, blockers, and questions for the client.
   - `screenshots/` — optional, for UI work (`npm run ui:shots`).
4. **Index:** add/update the line for today at the top of `progress/README.md`: `- [YYYY-MM-DD](YYYY-MM-DD/done.md) — one-line summary`.
5. **Commit:** `git add progress && git commit -m "docs(progress): YYYY-MM-DD"`.

Write in plain, simple English — the user reads these on a phone.
