# Setup Guide

Complete step-by-step setup from scratch.

## Quick reference

| What you need      | Where to get it             | Time   |
| ------------------ | --------------------------- | ------ |
| Telegram bot token | @BotFather on Telegram      | 2 min  |
| Google Sheet ID    | From sheet URL              | 1 min  |
| Gemini API key     | aistudio.google.com         | 2 min  |
| Apps Script setup  | Google Sheets → Extensions | 10 min |

Total: ~15 minutes

---

## Step 1 — Create Google Sheet

1. Open [sheets.google.com](https://sheets.google.com)
2. Click **+** → Blank spreadsheet
3. Rename to `Expense Tracker`
4. Copy Sheet ID from URL:

```
https://docs.google.com/spreadsheets/d/1ABC123xyz.../edit
                                        ^^^^^^^^^^^^
                                        This is your SHEET_ID
```

Leave the sheet empty. The bot creates all tabs via `/setup`.

---

## Step 2 — Create Telegram bot

1. Open Telegram → Search `@BotFather` (blue tick, official)
2. Tap **Start**
3. Send `/newbot`
4. Enter display name: `Expense Tracker` (anything you like)
5. Enter username: must end in `bot`, must be unique
   - Try: `myexpense2025_bot` or `[yourname]expense_bot`
6. BotFather sends your token:

```
Done! Use this token to access the HTTP API:
7312845691:AAFxyz_abc123defghijklmnopq
```

Save this token. Treat it like a password.

---

## Step 3 — Get Gemini API key

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click **Create API key**
4. Select your Google Cloud project (or create new)
5. Copy the key — starts with `AIzaSy...`

**Free tier:** 1,000 requests/day, 15 requests/minute. More than enough for personal use.

---

## Step 4 — Set up Apps Script

1. Open your Google Sheet
2. Top menu → **Extensions → Apps Script**
3. A new tab opens — you see `Code.gs` with an empty function
4. **Select all** (Ctrl+A) → **Delete** everything
5. Paste the entire contents of `Code.gs` from this repo
6. Fill in your credentials at the very top:

```javascript
var TOKEN       = '7312845691:KLJJsdafnjwef...';  // your bot token
var SHEET_ID    = '4534sdfsdksdhjdga...';         // your sheet ID
var GEMINI_KEY  = 'AIzaSyXXXXXXXX...';            // your Gemini key
var ALLOWED_UID = 0;                               // fill in later
var CHAT_ID     = 0;                               // fill in later
```

7. Click **Save** (Ctrl+S)

---

## Step 5 — Authorise

1. In the function dropdown (top bar), select `createTriggers`
2. Click **Run ▶**
3. A popup: **Review Permissions**
4. Choose your Google account
5. You may see "Google hasn't verified this app" → click **Advanced** → **Go to (project name)**
6. Click **Allow**

> This grants the script access to your Google Sheets. The script only touches the sheet you specified in SHEET_ID.

---

## Step 6 — Run createTriggers

After authorising, `createTriggers` should complete. Check the execution log:

```
✅ 3 triggers created:
  pollTelegram        → every 1 min
  dailyTrigger        → daily 7 AM
  weeklyDigestTrigger → daily 9 AM (Sunday only)
```

If you see an error, run it again.

To verify triggers were created:

- Left sidebar → **Triggers** (clock icon)
- You should see 3 triggers listed

---

## Step 7 — First bot interaction

1. Open Telegram on your phone
2. Search for your bot username
3. Tap **Start**
4. Send `/setup`
5. Wait up to 60 seconds

Bot replies:

```
✅ Setup complete!
Created: MASTER, Transactions, CategoryMap, Lending, 2025-2026

Next:
1. /setsalary 85000
2. Log: 250 food
3. /rollup at month end
```

Check your Google Sheet — you should see 5 new tabs.

---

## Step 8 — Get your Telegram user ID

1. Send `/myid` to the bot
2. It replies: `Your chat ID: 123456789`
3. Copy that number
4. In Apps Script, update `Code.gs`:

```javascript
var ALLOWED_UID = 123456789;  // paste your ID
var CHAT_ID     = 123456789;  // same number
```

5. Save — no redeployment needed

This does two things:

- `ALLOWED_UID` — only your account can use the bot (security)
- `CHAT_ID` — bot can send you proactive notifications

---

## Step 9 — Set your salary

```
/setsalary 85000
```

This writes to your FY sheet's income row for the current month. Required for budget alerts and `/summary` to work.

---

## Step 10 — Test

Run through these in order:

```
/ping                    → 🟢 alive
/myid                    → Your chat ID: ...
250 food                 → ✅ Logged! Food / Need
800 lunch with team      → ✅ Logged! Party/Dine-out / Want
3000 nifty sip           → ✅ Logged! Mutual Fund / Investment
500 uber yesterday       → ✅ Logged! with yesterday's date
/today                   → Shows today's entries
/total                   → Shows month totals
/summary                 → Shows 50-25-25 vs salary
/report                  → Top 5 categories
/cats                    → Full category list
```

If all of these work, you're set up. 🎉

---

## Optional: set up recurring expenses

For fixed monthly payments:

```
/addrec rent 12000
/addrec sip 5000
/addrec insurance 2182
/recurring
```

These auto-log on 1st of every month.

---

## Troubleshooting setup issues

**Script doesn't run / permission error**
→ Re-run `createTriggers()` and go through the permission flow again

**Bot doesn't respond**
→ Wait 60 seconds (polling interval)
→ Check Apps Script → Executions for errors

**"/setup" creates no sheets**
→ Check SHEET_ID is correct (no extra spaces)
→ Check you have edit access to the sheet

**Gemini returns null**
→ Check GEMINI_KEY is correct
→ Verify key at [aistudio.google.com](https://aistudio.google.com)
→ Check the model name: `gemini-2.5-flash-lite`

**Duplicate responses**
→ This is fixed in v6 via polling
→ If still happening, run `resetOffset()` in Apps Script

---

## Updating the bot

When a new version is released:

1. Copy the new `Code.gs` content
2. Open Apps Script → paste over existing content
3. Fill in your credentials again (or keep a local backup)
4. Save — triggers continue running automatically
5. No re-deployment needed

---

## Uninstalling

1. Apps Script → Triggers → delete all 3 triggers
2. Delete the Google Sheet (or keep your data)
3. Delete the Telegram bot via `@BotFather` → `/deletebot`
4. Revoke Gemini API key at [aistudio.google.com](https://aistudio.google.com) if desired
