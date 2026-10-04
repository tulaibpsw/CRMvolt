# Next — after 2026-10-05

## For the user
1. **Deploy to Vercel** with the env vars from `.env.local` (MONGODB_URI, AUTH_SECRET, MASTER_KEY, CLOUDINARY_*, CRON_SECRET).
2. **Before real staff use it**, clear the demo data:
   - Option 1 — ask me to wipe it and keep only the super admin and settings.
   - Option 2 — in Company admin, remove the demo users (admin / bilal / sana / talha …, password volton@123).
3. Sign in with the owner (super admin) account and change its password (menu → Change password) — the current one contains the username.
4. cron-job.org: `/api/cron/tick` and `/api/cron/sheet-pull` every minute (header `Authorization: Bearer <CRON_SECRET>`).
5. Settings → Google Sheet → **"First time: start from now"** (or "import history") once.
6. WhatsApp: follow `docs/whatsapp-setup.md` and send me the 4 keys (or put them in Vercel).

## Build next
- Install test on real Android and iPhone after deploy.
- Phase 2 items left open: check-in location / Wi-Fi rule, break limits, automatic take-back of uncontacted leads, holidays, a full Content-Security-Policy, Coexistence company numbers.
