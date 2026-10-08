# Next — after 2026-10-08

1. **Deploy** this version. After deploy, each manager opens Settings → Google Sheets:
   - The current Sheet shows as "Main sheet".
   - Press **"Start from now"** once, because the client's columns changed this week. Or rename the columns back first.
2. **Meta / WhatsApp** (when the credentials arrive):
   - WhatsApp Cloud API keys (docs/whatsapp-setup.md).
   - **Meta Lead Ads direct sync** (no Google Sheet): leads arrive by webhook in seconds. Needs a Page access token with `leads_retrieval` and `pages_manage_metadata`, the app subscribed to the Page's `leadgen` field, and the form ids.
3. Real-phone PWA install test.
