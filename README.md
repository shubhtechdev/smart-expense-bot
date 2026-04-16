# 💸 Expense Tracker Bot

Track expenses in seconds. Get AI insights. Stay within budget — automatically.
![Status](https://img.shields.io/badge/status-active-success)
![AI](https://img.shields.io/badge/AI-Gemini-orange)
![Built with](https://img.shields.io/badge/built%20with-Apps%20Script-blue)
![License](https://img.shields.io/badge/license-MIT-green)

A personal finance bot that lets you log expenses from your phone in seconds — no app, no manual entry, no spreadsheet fumbling. Just send a message like `250 food` to Telegram and it's saved.

Built entirely on **free tools**: Telegram + Google Apps Script + Google Sheets + Gemini AI.

---

> ## What it looks like

```
You:  800 lunch with colleagues
Bot:  ✅ Logged!
      📅 15-Apr-2026 13:42
      💰 ₹800
      🏷 Party/Dine-out
      📂 Want

You:  /summary
Bot:  📊 April Summary
      💰 In-hand: ₹85,000
      50-25-25:
      ✅ Need:   ₹18,200 / ₹42,500 (21%)
      ✅ Want:   ₹6,400  / ₹21,250 (7%)
      ⚠️ Invest: ₹0      / ₹21,250 (0%)
      ─────────────
      💸 Total: ₹24,600

You:  /lend rahul credit 500
Bot:  💸 You gave ₹500 to Rahul
      ─────────────
      📊 Balance: Rahul owes you ₹500
```

---

## Features

### Core

- Log expenses in plain English — `250 food`, `800 lunch with team`, `500 uber yesterday`
- Gemini AI parses natural language — no rigid format required
- Backdated entries — `250 food on 10 apr`, `500 uber last monday`
- Auto-maps to categories — Need / Want / Investment buckets
- Unknown categories — bot asks, you confirm, mapping saved forever

### Tracking

- `/today` — all expenses today
- `/total` — this month's spend by bucket
- `/week` — last 7 days breakdown
- `/month april` — any month's summary
- `/summary` — 50-25-25 budget check with salary comparison
- `/report` — top 5 spending categories ranked
- `/search uber` — find expenses by keyword

### Sheet management

- `/rollup april` — writes monthly totals to your yearly Google Sheet
- Auto-rollup on 1st of every month (no manual trigger needed)
- Yearly FY sheet (April→March) created automatically on 1st April
- All formulas pre-built: section totals, savings, 50-25-25 allocations

### Salary & banking

- `/setsalary 85000` — sets your in-hand for the month
- `/cc icici 5000` — log credit card bill
- `/bal icici 45000` — log bank closing balance

### Recurring expenses

- `/addrec rent 12000` — add a recurring expense
- Auto-logs on 1st of every month
- `/recurring` to view, `/delrec 1` to remove

### Lending tracker

- `/lend rahul credit 500` — you gave Rahul money
- `/lend rahul debit 500` — you owe Rahul money
- `/lend rahul paid 500` — Rahul paid you back
- `/lend rahul settled` — mark all settled
- `/lends` — see all balances

### AI digests

- **Weekly** — every Sunday, Gemini analyses last 7 days
- **Monthly** — 2nd of each month, full review with 50-25-25 assessment

### Utilities

- `/delete` — undo last entry
- `/cats` — list all categories
- `/addcat Gym Need` — add a new category
- `/ping` — health check

---

## How it works

```
Your phone (Telegram)
        ↓
Telegram Bot API
        ↓
Google Apps Script (polls every 60 seconds)
        ↓
Gemini AI parses your message
        ↓
Writes to Google Sheets
        ↑
Monthly rollup fills your yearly FY sheet
```

No server. No hosting. No database. Everything runs free on Google's infrastructure.

---

## Setup guide

### Prerequisites

- A Google account (personal Gmail works)
- Telegram installed on your phone
- 20 minutes

---

### Step 1 — Create your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → click **+** (Blank spreadsheet)
2. Rename it: `Expense Tracker`
3. Copy the **Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/COPY_THIS_PART/edit
   ```

> The bot will create all required tabs automatically when you run `/setup`. Do not create any tabs manually.

---

### Step 2 — Create your Telegram bot

1. Open Telegram → search `@BotFather` → tap **Start**
2. Send `/newbot`
3. Enter a display name: `Expense Tracker`
4. Enter a username (must end in `bot`): e.g. `myexpense_tracker_bot`
5. BotFather replies with your **bot token**:
   ```
   7312845691:AAFxyz_abc123...
   ```
6. Save this token — it's your bot's password. Never share it publicly.

---

### Step 3 — Get your Gemini API key

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Click **Create API key**
3. Copy the key — looks like `AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXX`

> The free tier gives you 1,000 requests/day — more than enough for personal use.

---

### Step 4 — Set up Google Apps Script

1. Go to your Google Sheet → **Extensions → Apps Script**
2. Delete all content in the default `Code.gs` file
3. Paste the entire contents of `Code.gs` from this repo
4. At the top of the file, fill in your credentials:
   ```javascript
   var TOKEN      = 'your_telegram_token_here';
   var SHEET_ID   = 'your_sheet_id_here';
   var GEMINI_KEY = 'your_gemini_api_key_here';
   var ALLOWED_UID = 0;   // fill in later
   var CHAT_ID     = 0;   // fill in later
   ```
5. Click **Save** (Ctrl+S / Cmd+S)

---

### Step 5 — Authorise the script

1. In Apps Script, click the function dropdown → select `createTriggers`
2. Click **Run ▶**
3. A popup appears: **Review Permissions** → select your Google account → **Allow**

> It will ask for permission to access your Google Sheets. This is expected and safe — the script only touches the sheet you configured.

---

### Step 6 — Create triggers

Still in Apps Script with `createTriggers` selected, click **Run ▶** again.

The execution log should show:

```
✅ 3 triggers created:
  pollTelegram        → every 1 min
  dailyTrigger        → daily 7 AM
  weeklyDigestTrigger → daily 9 AM (Sunday only)
```

---

### Step 7 — Set up your sheets

1. Open Telegram → find your bot (search the username you chose) → tap **Start**
2. Send `/setup`
3. Wait up to 60 seconds for the reply

The bot will create these tabs in your Google Sheet:

| Tab              | Purpose                                               |
| ---------------- | ----------------------------------------------------- |
| `MASTER`       | Category schema — edit this to add/remove categories |
| `Transactions` | Raw daily log — bot writes here every time           |
| `2025-2026`    | Yearly FY sheet with all formulas                     |
| `CategoryMap`  | Custom keyword mappings learned from your corrections |
| `Lending`      | Credit/debit ledger                                   |

---

### Step 8 — Find your Telegram user ID

1. Send `/myid` to your bot
2. Copy the number it replies with
3. In `Code.gs`, update:
   ```javascript
   var ALLOWED_UID = 123456789;  // your actual ID
   var CHAT_ID     = 123456789;  // same number for personal bots
   ```
4. Save the file — **no new deployment needed** (polling picks up changes automatically)

---

### Step 9 — Test it

Send these to your bot one at a time:

```
/ping
250 food
1200 rent
800 lunch with team
/today
/summary
```

After confirming everything works, set your salary:

```
/setsalary 85000
```

---

## Your Google Sheet explained

### MASTER tab

The schema for all categories. The bot reads this dynamically — no hardcoded category lists in the code.

| A (Section) | B (Category) | C (Type)   |
| ----------- | ------------ | ---------- |
| Need        | Rent         | Need       |
| Need        | Food         | Need       |
| Want        | Movies       | Want       |
| Investment  | Mutual Fund  | Investment |

**To add a category:** Either edit this tab directly, or send `/addcat Gym Need` to the bot.

---

### Transactions tab

The raw log. Every expense you send becomes one row here.

| Date        | Time  | Amount | Category       | Type | Raw Input           |
| ----------- | ----- | ------ | -------------- | ---- | ------------------- |
| 15-Apr-2026 | 13:42 | 800    | Party/Dine-out | Want | 800 lunch with team |

This is the source of truth for all summaries and rollups.

---

### Yearly FY tab (e.g. `2025-2026`)

Mirrors your personal finance template — Indian financial year (April → March).

```
Columns: A=Labels, B=Category, C=April, D=May ... N=March, O=Yearly Total

Row 4-8:   Income summary (Income, Deductions, Tax, Bonus, In-hand)
Row 12-14: 50-25-25 allocations (auto-calculated from in-hand)
Row 17-19: Amount used per bucket (linked from section totals)
Row 22:    Total savings
Row 25-27: Bank closing balances (ICICI, HDFC, SBI)
Row 30-32: CC bills
Row 33-48: Need expenses + total
Row 51-62: Want expenses + total
Row 65-78: Investment expenses + total
```

All formulas are pre-built. Fill in income → everything calculates automatically.

The bot fills the monthly columns when you run `/rollup april` (or automatically on 1st of month).

---

### How budget allocations work

The system uses the **50-25-25 rule** — a popular personal finance framework that splits your take-home salary into three buckets: Needs (50%), Wants (25%), and Investments (25%).

You only need to enter three numbers. Everything else is calculated automatically.

#### What you enter (once a month)

| Command               | What it sets                    |
| --------------------- | ------------------------------- |
| `/setsalary 85000`  | Your gross salary for the month |
| Deductions (in sheet) | PF, professional tax, etc.      |
| Tax (in sheet)        | TDS or advance tax              |
| Bonus (in sheet)      | Variable pay, if any            |

Deductions, tax, and bonus are entered directly in your FY sheet (rows 5, 6, 7 of the current month's column). They're typically the same every month so you set them once and rarely change them.

#### What gets calculated automatically

```
In-hand = (Salary + Bonus) - (Deductions + Tax)

Need allocation   = In-hand × 50%
Want allocation   = In-hand × 25%
Invest allocation = In-hand × 25%

Amount Used (Need)   = sum of all Need expenses this month
Amount Used (Want)   = sum of all Want expenses this month
Amount Used (Invest) = sum of all Investment expenses this month

Total Savings = (Need alloc + Want alloc) - (Need used + Want used)
```

None of this requires any manual input beyond your salary. The sheet formulas handle it. The bot reads these values when you run `/summary`.

#### Customising the percentages

The default is 50-25-25. If your situation is different — say you want to invest more aggressively — just edit cells `B12`, `B13`, `B14` in your FY sheet directly:

| Cell           | Default | Example (aggressive saving) |
| -------------- | ------- | --------------------------- |
| B12 (Need %)   | 50      | 45                          |
| B13 (Want %)   | 25      | 15                          |
| B14 (Invest %) | 25      | 40                          |

The formulas in all month columns reference these cells with `$B$12`, so changing them once updates all 12 months automatically.

#### Example — full calculation with real numbers

Assume: Salary ₹1,00,000 · PF ₹12,000 · Tax ₹3,000 · No bonus

```
In-hand = (1,00,000 + 0) - (12,000 + 3,000) = ₹85,000

Allocations (50-25-25):
  Need       = 85,000 × 50% = ₹42,500
  Want       = 85,000 × 25% = ₹21,250
  Investment = 85,000 × 25% = ₹21,250

Actual spend logged in April:
  Need       = ₹38,400  (rent + food + fuel + bills)
  Want       = ₹9,800   (dining out + movies + clothes)
  Investment = ₹15,000  (SIP + PPF)

Budget status:
  Need:   ₹38,400 / ₹42,500 — 45% ✅ within limit
  Want:   ₹9,800  / ₹21,250 — 12% ✅ within limit
  Invest: ₹15,000 / ₹21,250 — 18% ⚠️ below target

Total savings = (₹42,500 + ₹21,250) - (₹38,400 + ₹9,800) = ₹15,550
```

This is exactly what `/summary` shows you — the same numbers, pulled live from your sheet.

#### What the FY sheet looks like for this example

```
                    April       May         ...   Total
────────────────────────────────────────────────────────
Income              1,00,000
Deductions            12,000
Tax                    3,000
Bonus                      0
In-hand               85,000

50-25-25 Rule
Need (50%)            42,500
Want (25%)            21,250
Investment (25%)      21,250

Amount Used
Need                  38,400    ← auto-linked from Need total row
Want                   9,800    ← auto-linked from Want total row
Investment            15,000    ← auto-linked from Investment total row

Total Savings         15,550    ← formula: (alloc) - (used)

────────────────────────────────────────────────────────
NEED EXPENSES
Rent                  12,000
Recharge               1,200
Healthcare                 0
EMI                    8,500
Food                   6,400
Electricity & bill     2,800
Fuel/Transportation    4,500
...
Total                 38,400    ← sum of all Need rows

WANT EXPENSES
Party/Dine-out         4,200
Movies                 1,600
Clothing               4,000
...
Total                  9,800

INVESTMENT
Mutual Fund           10,000
PPF                    5,000
...
Total                 15,000
────────────────────────────────────────────────────────
```

The bot fills in all the expense rows when you run `/rollup april`. You only ever touch the income section.

---

### CategoryMap tab

Learned mappings from your corrections. When you tell the bot "gym membership is Healthcare", it saves `gym → Healthcare` here. Next time you type anything with "gym", it maps automatically without asking.

---

### Lending tab

Full credit/debit ledger per person. Running balance tracked after every transaction.

---

## Cost

Everything is free for personal use.

| Component             | Cost                                                       |
| --------------------- | ---------------------------------------------------------- |
| Telegram Bot API      | Free forever                                               |
| Google Apps Script    | Free (90 min/day execution limit — you'll use ~3 min/day) |
| Google Sheets         | Free                                                       |
| Gemini 2.5 Flash-Lite | Free tier: 1,000 requests/day                              |

**Worst case if you somehow exceed Gemini free tier:**

| Usage                       | Monthly cost           |
| --------------------------- | ---------------------- |
| 10 expenses/day = 300/month | ~$0.004 = ₹0.35/month |
| 30 expenses/day = 900/month | ~$0.012 = ₹1/month    |

You would have to log expenses every few minutes all day to exceed the free tier.

---

## Customisation

### Minimum changes required

Only 3 values in `Code.gs`:

```javascript
var TOKEN      = 'your_telegram_token';
var SHEET_ID   = 'your_sheet_id';
var GEMINI_KEY = 'your_gemini_api_key';
```

### Recommended changes

```javascript
var ALLOWED_UID = 123456789;  // your Telegram user ID (security)
var CHAT_ID     = 123456789;  // for notifications
```

### Optional customisation

**Change the FY start month** (default is April for Indian FY):

```javascript
var FY_START_MONTH = 3;  // 3 = April. Change to 0 for January FY.
```

**Add your own categories** — two ways:

1. Bot command: `/addcat Subscriptions Want`
2. Edit the `MASTER` tab directly in Google Sheets

**Add recurring expenses:**

```
/addrec rent 12000
/addrec sip 5000
/addrec insurance 2182
```

**Adjust budget allocation** (if not using 50-25-25):
In your FY sheet, edit cells `B12`, `B13`, `B14` to change the percentages.
The formulas reference these cells, so changing them updates all calculations automatically.

---

## All commands

| Command                        | Description             | Example                    |
| ------------------------------ | ----------------------- | -------------------------- |
| `amount description`         | Log an expense          | `250 food`               |
| `amount description on date` | Log backdated expense   | `500 rent on 1 apr`      |
| `/today`                     | Today's expenses        | `/today`                 |
| `/total`                     | This month's total      | `/total`                 |
| `/week`                      | Last 7 days             | `/week`                  |
| `/month`                     | Current month detail    | `/month`                 |
| `/month name`                | Specific month          | `/month april`           |
| `/month name year`           | Specific month + year   | `/month april 2025`      |
| `/summary`                   | 50-25-25 budget check   | `/summary`               |
| `/report`                    | Top 5 spend categories  | `/report`                |
| `/search keyword`            | Find expenses           | `/search uber`           |
| `/rollup`                    | Rollup current month    | `/rollup`                |
| `/rollup month`              | Rollup specific month   | `/rollup april`          |
| `/rollup month year`         | Rollup month + year     | `/rollup april 2025`     |
| `/setsalary amount`          | Set monthly salary      | `/setsalary 85000`       |
| `/salary`                    | View current salary     | `/salary`                |
| `/cc bank amount`            | Log CC bill             | `/cc icici 5000`         |
| `/bal bank amount`           | Log bank balance        | `/bal hdfc 45000`        |
| `/cats`                      | List all categories     | `/cats`                  |
| `/addcat name type`          | Add new category        | `/addcat Gym Need`       |
| `/addrec category amount`    | Add recurring expense   | `/addrec rent 12000`     |
| `/recurring`                 | List recurring expenses | `/recurring`             |
| `/delrec number`             | Delete recurring        | `/delrec 1`              |
| `/lend person credit amount` | You gave money          | `/lend rahul credit 500` |
| `/lend person debit amount`  | You owe money           | `/lend mom debit 1000`   |
| `/lend person paid amount`   | They paid you back      | `/lend rahul paid 500`   |
| `/lend person settled`       | Mark all settled        | `/lend rahul settled`    |
| `/lends`                     | All lending balances    | `/lends`                 |
| `/lends person`              | One person's history    | `/lends rahul`           |
| `/delete`                    | Undo last entry         | `/delete`                |
| `/newfy`                     | Create new FY sheet     | `/newfy`                 |
| `/setup`                     | First-time setup        | `/setup`                 |
| `/myid`                      | Get your Telegram ID    | `/myid`                  |
| `/ping`                      | Health check            | `/ping`                  |
| `/help`                      | Show all commands       | `/help`                  |

---

## Automatic triggers

| Trigger                 | When                     | What it does                    |
| ----------------------- | ------------------------ | ------------------------------- |
| `pollTelegram`        | Every 1 minute           | Checks for new messages         |
| `dailyTrigger`        | 7 AM daily               | —                              |
|                         | 1st of month             | Auto-rollup previous month      |
|                         | 1st of month             | Auto-log recurring expenses     |
|                         | 2nd of month             | Send monthly AI digest          |
|                         | 1st April                | Create new FY sheet (2026-2027) |
| `weeklyDigestTrigger` | 9 AM daily (Sunday only) | Send weekly AI digest           |

---

## Troubleshooting

**Bot not responding**

- Check Apps Script → Executions tab for errors
- Verify triggers are active: run `checkTriggers()` in Apps Script
- Send `/ping` and wait up to 60 seconds

**Expenses going to wrong category**

- Send the expense again and correct the bot when it asks
- Or add a custom mapping: `/addcat Gym Need`
- The bot learns from every correction

**Sheet not updating after /rollup**

- Check that your FY sheet tab exists (e.g. `2025-2026`)
- Verify the category name in Transactions matches MASTER exactly
- Run `debugRollup()` in Apps Script and check the execution log

**/today showing no results**

- Check date format in Transactions sheet — should be `dd-MMM-yyyy` (e.g. `15-Apr-2026`)
- If dates appear as `2026-04-15` format, the date column was auto-converted by Sheets
- Delete those rows and re-log the expenses — v6 forces text format on save

**Gemini not parsing correctly**

- Try being more explicit: `250 food grocery` instead of `250 grocery`
- Add custom mappings for your common patterns
- Check your API key is valid at [aistudio.google.com](https://aistudio.google.com)

---

## Architecture

```
expense-tracker-bot/
│
├── Code.gs                 ← Main file — everything in one place
│   ├── CONFIG              ← 5 variables to fill in
│   ├── POLLING             ← Telegram getUpdates loop
│   ├── ROUTER              ← Message dispatcher
│   ├── EXPENSE HANDLER     ← Gemini parse → validate → save
│   ├── GEMINI              ← Text parsing + digest generation
│   ├── COMMANDS            ← All /commands
│   ├── RECURRING           ← Auto-log on 1st of month
│   ├── AI DIGESTS          ← Weekly + monthly Gemini summaries
│   ├── LENDING             ← Credit/debit ledger
│   ├── FY SHEET MGMT       ← Create + populate yearly sheets
│   ├── MASTER HELPERS      ← Category cache + validation
│   └── TRIGGERS            ← Setup + scheduling
│
├── config.template.gs      ← Copy this, fill in, never commit
├── .gitignore
├── docs/
│   ├── SETUP.md            ← Detailed setup guide
│   └── CONTRIBUTING.md     ← How to contribute
└── README.md               ← This file
```

### Design decisions

**Single file** — the entire bot is in one `Code.gs` file. This makes it easy to copy-paste into a new Apps Script project without any build step or file management.

**Polling over webhooks** — Google Apps Script has a cold-start time that exceeds Telegram's 3-second webhook timeout, causing duplicate responses. Time-based polling every minute solves this permanently at the cost of up to 60-second response delay — acceptable for a personal finance tool.

**Gemini for parsing only** — all calculations (totals, budgets, summaries) are done in JavaScript. Gemini is only called for natural language parsing and digest generation. This keeps costs near zero and makes the maths auditable.

**MASTER sheet as schema** — category definitions live in the sheet, not the code. Adding a new category doesn't require a code change — just edit the MASTER tab or send `/addcat`.

---

## 🎯 Why this project?

Most expense trackers require discipline, manual entry, and constant follow-up.

This bot removes that friction:

- Just type → everything is tracked
- Budget auto-calculated (50-25-25)
- Insights generated without effort

Built for simplicity, speed, and real-world usage.

---

## Contributing

Contributions welcome! Please read [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) before opening a PR.

Ideas especially welcome for:

- More category keyword mappings
- Better Gemini prompts
- Additional Indian-specific expense categories
- Multi-language support

---

## Licence

MIT — free to use, modify, and share.

---

## Built with

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Google Apps Script](https://developers.google.com/apps-script)
- [Google Sheets API](https://developers.google.com/sheets/api)
- [Gemini API](https://ai.google.dev/)

---

*Built for personal use, designed to be reusable. If this saves you time, give it a ⭐*
