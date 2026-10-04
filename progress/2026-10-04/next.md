# Next — after 2026-10-04

## Needed from the client / user (phase 0, free)
1. **Volt On brand colours or logo** — needed to replace the placeholder palette in `src/styles/theme.css`.
2. **A copy of the Google Sheet** (or just its column headers).
3. **The list of users:** who manages each department, and the agent order (User 1, 2, 3, 4).
4. **Office details:** working hours, holidays, and the SLA numbers (accept within, contact within 15/30/60 min).
5. **Free accounts:**
   - MongoDB Atlas M0, with its connection string in `.env.local`;
   - Vercel Hobby;
   - a Google Cloud service account;
   - cron-job.org;
   - a Meta developer app with the WhatsApp test number.

## Build (M1 — auth & access)
1. M1 — Install Better Auth (MongoDB adapter, username + password, admin plugin), sharing the `user` collection.
2. M1 — `proxy.ts` redirects signed-out users; `(auth)/login` page.
3. M1 — `scopeFilter(user)` + role guard helpers used by every service and action.
4. M1 — Users and teams screens (create a user, pick department/manager, drag the team order).
5. M1 — Audit log writes for user/team changes, plus the GitHub Actions nightly `mongodump` backup.
6. M1 — Form field components (RHF + Zod) and toasts, registered in `docs/ai/components.md`.
7. End of phase: tests + `npm run check`.
