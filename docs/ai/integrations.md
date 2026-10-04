# Integrations — rules and gotchas

## Google Sheet → CRM (M3)
- Phase 1 reads the Sheet as **public CSV** (no Google account, no keys): `docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:csv&headers=1&sheet=<tab>`. The Sheet must be shared "Anyone with the link → Viewer" — anyone with the link can see customer phones, so keep the link private (phase 2: service account).
- `/api/cron/sheet-pull` every minute (cron-job.org) with a lease lock, plus "Pull now" in Settings. Modes: `live` (new rows → round-robin), `history` (old rows, quiet, pre-assigned by the Sheet's "Call Agent" first name), `skip` (start from now).
- Headers: blank → "Column A", repeats → "Comment (2)". Detection = admin overrides → exact aliases → "contains" rules (Meta form questions). Everything else → `lead.extra`; unrecognised form answers are kept in `extra` as text.
- Dates: "10/3/26" = month/day/year (Google); first number > 12 → day/month/year. All Pakistan time.
- **Duplicate guard = unique `source.rowKey`** (Meta lead ID, else hash of tab + phone + date). Cursor per tab in `settings.sheet_config`.

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
- Each run takes a lease in `locks`; jobs are idempotent (`dedupeKey`); handlers re-check lead state.

## File storage (M5) — Cloudinary (free plan)
- Account keys: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (server only — never `NEXT_PUBLIC_`).
- Upload **straight from the phone** to Cloudinary with a server-signed upload signature (bypasses Vercel's 4.5 MB body limit). Use `type: 'authenticated'` so files are private; store the `public_id` in `storageKey`.
- Show files only through short-lived signed delivery URLs generated on the server after the role check.
- Compress images on the phone to ~150 KB; folder per lead: `volton/leads/<leadId>/<category>`. Skip videos (free-plan credits).

## Auth
- Own code, no library: `src/server/auth/*`. scrypt hashes; random session token in the httpOnly `volton_session` cookie, only its SHA-256 stored in `sessions` (30 days, TTL index). `proxy.ts` only checks the cookie exists — pages/actions call `requireUser`/`requireRole`, and data goes through `leadScope`/`visitScope`/`userScope`.
- First admin: `/setup` with `MASTER_KEY`. Admin creates everyone else in Settings → Users.

## PWA (installable app)
- `src/app/manifest.ts` (start `/dashboard`, standalone, navy theme), icons in `public/icons` (rebuild: `node scripts/make-icons.mjs`), iOS meta via `metadata.appleWebApp`.
- `public/sw.js`: network-only for pages + `/offline.html` fallback; cache-first only for `/_next/static`, `/icons`, `/brand`. Registered in production only. Served with no-cache headers (`next.config.ts`).
- Android shows a real "Install app" button; iPhone (Safari) has none — the banner explains Share → Add to Home Screen.
- PWA files are public in `proxy.ts` (manifest, sw.js, offline.html, icons).

## Database
- Atlas M0 (512 MB, no automatic backups) → nightly `mongodump` via GitHub Actions. `connectDb()` caches the connection and calls `attachDatabasePool`.
