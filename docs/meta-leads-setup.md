# Meta Lead Ads → CRM directly (no Google Sheet)

When a customer fills in a Facebook / Instagram instant form, Meta tells the CRM in seconds, the CRM fetches the
answers and creates the lead. It goes to the next checked-in agent like any other lead. No Google Sheet needed.

The code is ready. It needs **4 values** in Vercel and **3 clicks** in Meta. Everything is free.

## What you need before starting
- Admin access to the **Volton Solar Facebook Page** that runs the lead ads.
- That Page is inside the **Volton Solar business portfolio** (business.facebook.com → Settings → Accounts → Pages).
- The **Meta developer app** (developers.facebook.com → My Apps). Use the **same app** as WhatsApp if you made one (type **Business**, connected to the Volton business).

## Step 1 — find the Page ID → `META_PAGE_ID`
Facebook Page → **About** → **Page transparency** → "Page ID" (only digits, e.g. `104512345678901`).
Or: business.facebook.com → Settings → Accounts → **Pages** → click the page → the ID is shown under its name.

## Step 2 — make a token that never expires → `META_PAGE_ACCESS_TOKEN`
1. business.facebook.com → **Settings** → Users → **System users** → **Add** → name `CRM`, role **Admin**.
   (If you already made one for WhatsApp, use that one.)
2. Click the system user → **Assign assets**:
   - **Pages** → Volton Solar Page → turn on **Full control** (or at least "Leads" + "Manage Page").
   - **Apps** → your app → **Full control**.
3. **Generate token** → choose your app → expiry **Never** → tick these permissions:
   - `leads_retrieval`
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_metadata`
   - `pages_manage_ads`
   - `business_management`
   - (keep the WhatsApp ones ticked too if this is the same system user: `whatsapp_business_messaging`, `whatsapp_business_management`)
4. Copy the token. It is shown only once.

## Step 3 — app secret and verify token
- `META_APP_SECRET`: app → **App settings → Basic** → App secret → Show.
  If it is the same app as WhatsApp, **leave it empty** — the CRM uses `WHATSAPP_APP_SECRET`.
- `META_VERIFY_TOKEN`: any long random text you choose. If it is the same app as WhatsApp, **leave it empty** —
  the CRM uses `WHATSAPP_VERIFY_TOKEN`.

## Step 4 — put the values in Vercel
Vercel → Project → **Settings → Environment Variables** → add `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN`
(and `META_APP_SECRET` / `META_VERIFY_TOKEN` only if different from WhatsApp) → **Redeploy**.

> Never send these in WhatsApp chats, email or GitHub.

## Step 5 — connect the webhook in Meta (one time)
1. developers.facebook.com → your app → **Webhooks** (add the product if it is not there).
2. In the drop-down choose **Page** → **Subscribe to this object**:
   - Callback URL: `https://<your-vercel-domain>/api/webhooks/meta-leads`
     (CRM → Settings → **Meta lead forms** shows the exact URL)
   - Verify token: the same verify token as above
   - **Verify and save**
3. In the list of Page fields find **leadgen** → **Subscribe**.
4. App → **App settings → Basic** → Privacy policy URL: `https://<your-vercel-domain>/privacy` → Save.
   Then at the top switch the app from **Development** to **Live**. (In Development mode Meta sends only test leads.)

## Step 6 — turn it on in the CRM
CRM → **Settings → Meta lead forms (Facebook / Instagram)**:
1. Press **Turn on live leads** (subscribes the Page to the app — one time).
2. Press **Fetch leads from Meta** with "2 days". Your lead forms now appear in the list.
3. For each form choose the **department** (Installation / Trading) → **Save departments**.
   "Auto" uses the campaign/form name keywords, else the default department.

## Step 7 — test (2 minutes)
1. Open **developers.facebook.com/tools/lead-ads-testing**.
2. Choose the Page and a form → **Create lead**. (Delete the previous test lead first if Meta asks.)
3. Within a few seconds the lead is in the CRM (channel "Meta form"), and goes to the next checked-in agent.
4. Company admin → System health → "Meta lead forms: Connected".

## If Leads Access is turned on for the Page
business.facebook.com → Settings → **Integrations → Leads access** → choose the Page → **CRMs** tab → add your app.
(If this list is empty for your Page, nothing to do.)

## Moving off the Google Sheet
- Meta and the Sheet can run together for a few days: the same Meta lead id is never imported twice, and the
  "Fetch" button skips customers already in the CRM.
- When Meta leads are arriving, remove the Sheet in Settings → Google Sheets (or stop the Sheet integration in Meta).

## Safety net
- Every webhook is saved first and retried by the cron tick if anything fails.
- The cron tick also checks Meta every 15 minutes for the last day's leads, so a missed webhook never loses a lead.
- Meta keeps leads for **90 days** — "Fetch leads from Meta" can bring back up to 90 days.

## If something is wrong
| Symptom | Fix |
|---|---|
| "callback URL could not be verified" | Verify token in Meta and in Vercel are different, or Vercel was not redeployed |
| Test lead does not appear | Field **leadgen** not subscribed, or "Turn on live leads" not pressed, or the app is not Live (real leads) |
| "Meta token is expired or was removed" | Make a new system-user token (Step 2) → update Vercel → Redeploy |
| "(#200) … permission" | The system user is not assigned to the Page, or a permission from Step 2 was not ticked |
| Leads go to the wrong department | Settings → Meta lead forms → pick the department per form |
