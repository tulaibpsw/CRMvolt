# Done — 2026-10-08

Client feedback round.

- **Managers connect their own Google Sheets** (Settings → Google Sheets). Each Sheet belongs to one department and its leads go there. Managers see, sync, edit and remove only their department's Sheets; admins see all. One department can have several Sheets.
- **Column guide** under every Sheet link: which columns are read (a phone/WhatsApp column is required) and the rules (do not rename, add new columns at the end, one header row).
- **Column-change guard**:
  - If the phone, WhatsApp, date or lead-id column is renamed or removed (or a new one appears), syncing stops for that tab.
  - The department's managers get an alert, and Settings shows what changed.
  - Fix it by renaming the column back, or press **"Use new columns from now"**. Before, this caused missing or duplicate leads with no warning.
  - Lost name/city/campaign columns show as warnings only.
  - Saving a Sheet reads it once to check the link and the phone column, so problems show immediately.
- **"Sheet details" pop-up** on every lead (button on each row of the leads list and on the lead page): when and where the lead came from, the form answers, and **every extra column with its value**. Agents see it after accepting the lead.
- **Refresh button** in the top bar on every page (re-loads the data), plus **"Sync Google Sheet now"** on the Leads page for managers and admins.
- **Username rules made easy**: what people type is cleaned ("Talha Khan" → talha.khan), with a live preview. The browser pattern error is gone, and messages are clear (taken username → suggests talha.khan2; bad phone → shows the format).
- Fix: on desktop the leads table now hides the phone number until the agent accepts (it was only hidden on phones).
- Note: the client's live Sheet changed its columns this week (blank column A → "Date", "whatsapp_number" → "phone"). The new guard catches changes like this.

## Tests
- 255 tests pass, with lint, types and the build clean.
- New tests:
  - a manager connects their own Sheet
  - another department's Sheet is invisible to them
  - a renamed column stops the sync and alerts the manager, and "use new columns from now" resumes it with nothing imported twice
  - the Sheet details pop-up
  - usernames are cleaned
  - the column-change detector
- Checked in the browser on a temporary local test database (the live database now holds real users and leads, so it was not touched).
