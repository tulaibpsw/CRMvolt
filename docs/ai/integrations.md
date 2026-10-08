# Integrations — rules and gotchas

## Google Sheets → CRM
- **Several sheets, one per department or more**: `settings.sheet_config.sources[]` (`SheetSource`: id, name, department, spreadsheetId, tabs, headerOverrides). Managers add/edit/remove/sync only their department's sheets (Settings → Google Sheets); admins all. The old single-sheet fields are read as source id `legacy` (keeps old rows known). Leads of a sheet always go to its department.
- Read as **public CSV** (no Google keys): `docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:csv&headers=1&sheet=<tab>`. Sheet must be "Anyone with the link → Viewer" — keep the link private.
- `/api/cron/sheet-pull` every minute + "Sync now" (Settings, Leads page). Modes: `live`, `history` (old rows, quiet, pre-assigned by "Call Agent" name), `skip` ("start / use new columns from now").
- Rows are tracked by key in `sheetrows` (tab key = `rowTab(source, tab)`); one bad row never blocks the rest.
- **Column-change guard**: `settings.sheet_status[statusKey]` stores which header held each field at the last good pull. If a KEY field (phone, whatsapp, date, lead id) appears or disappears, that tab stops, the department's managers get a `sheet_problem` alert, and Settings shows the problem until the column is renamed back or someone presses "Use new columns from now". Lost name/city/campaign columns are warnings only.
- Every unknown column is kept in `lead.extra` and shown in the "Sheet details" pop-up (LeadDetailsDialog).
- The column guide shown to users lives in `SHEET_COLUMN_GUIDE` (src/domain/sheet-columns.ts).

## WhatsApp Cloud API (M6)
- Phase 1: Meta's free test number (≤ 5 verified recipients). Use a System User token, not the 24 h token.
- Webhook `/api/webhooks/whatsapp`: GET verify (`hub.verify_token` → echo `hub.challenge`); POST verify `X-Hub-Signature-256` = HMAC-SHA256(app secret, **raw body**). Meta retries up to 36 h → de-dup by `waMessageId`. Store raw payloads in `ingestevents`.
- Handle `messages` (customer), `statuses`, `smb_message_echoes` (agent typed in the Business app — Coexistence). Echo payloads have no device/agent field: attribute by the number's owner.
- CTWA `referral` arrives only on the first inbound message: map to `lead.source.ctwa`. `source_type` is `ad`, not Facebook/Instagram.
- Media IDs expire — copy images/documents to Cloudinary immediately (skip video on the free tier).
- Coexistence limits: calls are NOT mirrored; phone must open the app every ~13 days; Calling API not available on Coexistence numbers.
- Never use unofficial libraries (whatsapp-web.js, Baileys) — numbers get banned.

## Cron / timers (M4)
- Vercel Hobby cron runs once a day → cron-job.org (free) calls `/api/cron/tick` and `/api/cron/sheet-pull` every minute with `Authorization: Bearer $CRON_SECRET`. App polling is the backup clock.
- Each run takes a lease in `locks`; jobs are idempotent (`dedupeKey`); handlers re-check lead state and that the job belongs to the CURRENT assignment. The tick also retries stored WhatsApp webhook events that failed (up to 5 times).

## File storage (M5) — Cloudinary (free plan)
- Account keys: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (server only — never `NEXT_PUBLIC_`).
- Upload **straight from the phone** to Cloudinary with a server-signed upload signature (bypasses Vercel's 4.5 MB body limit). Use `type: 'authenticated'` so files are private; store the `public_id` in `storageKey`.
- Show files only through short-lived signed delivery URLs generated on the server after the role check.
- Compress images on the phone to ~150 KB; folder per lead: `volton/leads/<leadId>/<category>`. Skip videos (free-plan credits).

## Auth
- Roles and dashboards: super admin → `/admin` (company overview, managers & admins, system health, audit). First owner: `/setup` with MASTER_KEY or `npm run create-super-admin -- <email> <password>`.
- Own code, no library: `src/server/auth/*`. scrypt hashes; random session token in the httpOnly `volton_session` cookie, only its SHA-256 stored in `sessions` (30 days, TTL index). `proxy.ts` only checks the cookie exists — pages/actions call `requireUser`/`requireRole`, and data goes through `leadScope`/`visitScope`/`userScope`.
- First admin: `/setup` with `MASTER_KEY`. Admin creates everyone else in Settings → Users.

## PWA (installable app)
- `src/app/manifest.ts` (start `/dashboard`, standalone, navy theme), icons in `public/icons` (rebuild: `node scripts/make-icons.mjs`), iOS meta via `metadata.appleWebApp`.
- `public/sw.js`: network-only for pages + `/offline.html` fallback; cache-first only for `/_next/static`, `/icons`, `/brand`. Registered in production only. Served with no-cache headers (`next.config.ts`).
- Android shows a real "Install app" button; iPhone (Safari) has none — the banner explains Share → Add to Home Screen.
- PWA files are public in `proxy.ts` (manifest, sw.js, offline.html, icons).

## Brand colours
- Settings → Appearance (admin/super admin) saves `settings.theme {brand, ink}`; the root layout injects CSS variables from `src/styles/runtime-theme.ts`, which computes readable text colours. Presets live there too.

## Database
- Atlas M0 (512 MB, no automatic backups) → nightly `mongodump` via GitHub Actions. `connectDb()` caches the connection and calls `attachDatabasePool`.
