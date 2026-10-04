# WhatsApp API — what we need from you

The CRM already has the WhatsApp code. It only needs **4 keys** from Meta and **1 setting** in Meta after you deploy.
Phase 1 uses Meta's **free test number** (no monthly bill).

## What the app does with WhatsApp
- A customer messages the company number → a **new lead** is created automatically (Click-to-WhatsApp ad details are saved too).
- Customer messages show on the lead's **WhatsApp tab**; the agent gets an alert.
- Agents can reply from the CRM (within 24 hours of the customer's last message — Meta's rule).
- When the agent taps **WhatsApp** on a lead and then really sends a message, the attempt is marked **Verified** (strongest proof).

## Step 1 — Meta accounts (15 minutes, free)
1. Open **business.facebook.com** and create (or use) the **Volton Solar** business account.
2. Open **developers.facebook.com** → *My Apps* → **Create app** → type **Business** → connect it to the Volton business account.
3. In the app, click **Add product** → **WhatsApp** → *Set up*.

## Step 2 — copy these 4 values (send them to me privately, or paste them into Vercel yourself)
| Key in Vercel | Where to find it in Meta |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → **API Setup** → "Phone number ID" (under the test number) |
| `WHATSAPP_TOKEN` | **Permanent token**: Business Settings → *Users* → **System users** → Add (role Admin) → *Assign assets*: your app + WhatsApp account (full control) → **Generate token** → choose the app → tick `whatsapp_business_messaging` and `whatsapp_business_management` → expiry **Never**. (The 24-hour token on the API Setup page is only for a quick test.) |
| `WHATSAPP_APP_SECRET` | App → **App settings → Basic** → "App secret" → *Show* |
| `WHATSAPP_VERIFY_TOKEN` | Any long random text you choose (I already generated one in `.env.local` — use the same value in Vercel and in Meta) |

> Never put these keys in WhatsApp chats, email or GitHub. Vercel → Project → **Settings → Environment Variables** is the right place. After adding them, click **Redeploy**.

## Step 3 — test phone numbers (free test number limit)
WhatsApp → **API Setup** → "To" → **Manage phone number list** → add up to **5** phones (yours, the manager's) and confirm each with the code Meta sends.
The test number can only talk to these 5 numbers.

## Step 4 — connect the webhook (after Vercel is live)
WhatsApp → **Configuration** → Webhook → **Edit**:
- **Callback URL**: `https://<your-vercel-domain>/api/webhooks/whatsapp`
- **Verify token**: the same `WHATSAPP_VERIFY_TOKEN`
- Click **Verify and save** (the CRM answers Meta automatically).
- Under *Webhook fields* → **Subscribe** to `messages` (and later `smb_message_echoes` for Coexistence).

## Step 5 — check it works (2 minutes)
1. From one of the 5 test phones, send "Salam, price for 10 kW?" to the test number.
2. In the CRM: a new lead appears (channel WhatsApp) and goes to the next checked-in agent.
3. Open the lead → **WhatsApp** tab → the message is there → type a reply → it arrives on the phone.
4. Super admin → **Company admin** page → *System health* → "WhatsApp API: Connected".

## Phase 2 (after the cost talk) — real company numbers
- Meta **business verification** (company documents) and a **display name** ("Volton Solar").
- Register the company number(s). With **Coexistence**, agents keep using the WhatsApp Business app on their phones and every message they send is copied to the CRM as proof.
- **Costs**: replies to customers within 24 hours are free; messages the business *starts* (templates such as reminders) are charged per message by Meta — we check the current Pakistan rates before going live.
- Call recording: WhatsApp calls are not recorded by the Cloud API on Coexistence numbers; call proof stays outcome + screenshot (already built).

## If something is wrong
| Symptom | Fix |
|---|---|
| Meta says "callback URL could not be verified" | `WHATSAPP_VERIFY_TOKEN` in Vercel and in Meta are different, or the app was not redeployed after adding it |
| No lead appears | Webhook field `messages` not subscribed, or the sender is not one of the 5 test numbers |
| "WhatsApp is not connected yet" when replying | `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` missing in Vercel |
| Reply fails after a day | The 24-hour window closed — chat from the phone with the WhatsApp button |
