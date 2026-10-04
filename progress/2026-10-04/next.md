# Next — after 2026-10-04

## For the user (free, ~30 min)
1. **Deploy to Vercel:**
   - Import the GitHub repo.
   - Add the env vars from `.env.local`: `MONGODB_URI`, `AUTH_SECRET`, `MASTER_KEY`, `CLOUDINARY_*` and `CRON_SECRET`.
   - Add `WHATSAPP_*` once the Meta app exists.
2. **cron-job.org:** two jobs, both every minute, with the header `Authorization: Bearer <CRON_SECRET>`:
   - `https://<app>/api/cron/tick`
   - `https://<app>/api/cron/sheet-pull`
3. **First admin:** open `/setup` and enter `MASTER_KEY`. Then:
   - Create the real managers and agents in Settings → Users.
   - Settings → Google Sheet: "Import ALL rows as history" once, then live.
4. **WhatsApp test:**
   - Create a Meta app and add WhatsApp; use the test number.
   - Set the webhook to `https://<app>/api/webhooks/whatsapp` with `WHATSAPP_VERIFY_TOKEN`.
   - Fill in `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_APP_SECRET`.
5. **Security:** change the Atlas password (the current one is weak).

## Build next
1. The client demo walkthrough on real phones (Android + iPhone install), then fix what the client asks for.
2. Web Push (closed-app alerts) — works on Android, and on iPhone once the app is installed (iOS 16.4+).
3. Nightly `mongodump` backup via GitHub Actions (Atlas M0 has no backup).
4. Playwright smoke test for the agent flow on a phone viewport.
