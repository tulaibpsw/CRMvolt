# Integrations — rules and gotchas

## Google Sheet → CRM (M3)
- The CRM **pulls** the Sheet with a Google service account (Sheets API, free, no billing). The client shares the Sheet with the service-account email as Editor.
- `/api/cron/sheet-pull` every minute (cron-job.org) with its own lease lock + a "Sync now" button.
- Columns by header name; Meta headers auto-detected (`id, created_time, campaign_name, adset_name, ad_name, form_name, platform, full_name, phone_number, email, city`); unknown columns → `lead.extra`.
- **Duplicate guard = unique `source.rowKey`** (Meta lead ID, else hash of tab + phone + created time). Write-back (Lead No, Assigned To) is only a convenience.
- Row cursor + nightly reconcile. Mark historic rows before the first pull. Read the Sheet's timezone for dates.
- Do NOT use Apps Script triggers (`onEdit` misses integration rows; 1-min triggers exhaust free quotas).

## WhatsApp Cloud API (M6)
- Phase 1: Meta's free test number (≤ 5 verified recipients). Use a System User token, not the 24 h token.
- Webhook `/api/webhooks/whatsapp`: GET verify (`hub.verify_token` → echo `hub.challenge`); POST verify `X-Hub-Signature-256` = HMAC-SHA256(app secret, **raw body**). Meta retries up to 36 h → de-dup by `waMessageId`. Store raw payloads in `ingestevents`.
- Handle `messages` (customer), `statuses`, `smb_message_echoes` (agent typed in the Business app — Coexistence). Echo payloads have no device/agent field: attribute by the number's owner.
- CTWA `referral` arrives only on the first inbound message: map to `lead.source.ctwa`. `source_type` is `ad`, not Facebook/Instagram.
- Media IDs expire — copy images/documents to Blob immediately (skip video on the free tier).
- Coexistence limits: calls are NOT mirrored; phone must open the app every ~13 days; Calling API not available on Coexistence numbers.
- Never use unofficial libraries (whatsapp-web.js, Baileys) — numbers get banned.

## Cron / timers (M4)
- Vercel Hobby cron runs once a day → cron-job.org (free) calls `/api/cron/tick` and `/api/cron/sheet-pull` every minute with `Authorization: Bearer $CRON_SECRET`. App polling is the backup clock.
- Each run takes a lease in `locks`; jobs are idempotent (`dedupeKey`); handlers re-check lead state.

## File storage (M5)
- Vercel Blob **private** store, free 1 GB. Upload straight from the phone with a signed URL (bypasses the 4.5 MB function body limit); download via short-lived signed URLs. Compress images to ~150 KB.

## Database
- Atlas M0 (512 MB, no automatic backups) → nightly `mongodump` via GitHub Actions. `connectDb()` caches the connection and calls `attachDatabasePool`.
