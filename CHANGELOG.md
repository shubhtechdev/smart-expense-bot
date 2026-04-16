# Changelog

## v6.0 (Current)

### Added
- `/report` — top 5 spending categories ranked by amount
- `/addrec` — add recurring expenses that auto-log on 1st of month
- `/recurring` — view all recurring expenses
- `/delrec` — remove a recurring expense
- Monthly auto-rollup on 1st of every month
- Weekly AI digest every Sunday (Gemini summarisation)
- Monthly AI digest on 2nd of every month
- Budget alert after each expense (warns if bucket exceeds 50/25/25)
- Lending: `credit / debit / paid / settled` keywords (clearer than +/-)
- Lending: `/lend rahul settled` to mark all clear

### Fixed
- `/rollup` with no args now defaults to current month (was previous month)
- O-column yearly totals now added for every expense row in FY sheet
- Lending sheet updated to 7 columns (added Type column)

---

## v5.0

### Added
- `/summary` — 50-25-25 budget check with salary comparison
- `/delete` — undo last entry
- `/search keyword` — find expenses this month
- Word-level matching in CategoryMap (gym membership → gym)

### Fixed
- `/today` date comparison — handles both Date objects and strings from Sheets
- Gemini prompt improved for Indian context (lunch OUT vs groceries)
- nifty/ETF/index fund now correctly maps to Mutual Fund
- 50-25-25 formula fixed: uses fixed col B% not cumulative

---

## v4.0

### Added
- MASTER sheet as dynamic category schema
- Yearly FY sheet (April→March) with all formulas
- Auto-create new FY sheet on 1st April
- `/cc` command for credit card bills
- `/bal` command for bank balances
- `/addcat` to add categories from bot
- `/cats` to list all categories
- `/lend` with +/- shorthand
- `/lends person` for full history
- CacheService for MASTER categories (speed improvement)
- Date stored as plain text to avoid Sheets auto-conversion

### Fixed
- Rollup case-insensitive category matching
- Salary stored in FY sheet instead of ScriptProperties

---

## v3.0

### Added
- Full Gemini integration for expense parsing
- Backdated expense support ("250 food on 10 apr")
- Time column in Transactions sheet
- `/lend` and `/lends` for lending tracker
- `/setsalary` command
- `/newmonth` command
- Unknown category flow (bot asks, saves mapping)

---

## v2.0

### Added
- `/total`, `/today`, `/week`, `/month` commands
- `/rollup` to write to Dashboard sheet
- Category → Need/Want/Investment mapping
- `CategoryMap` sheet for custom keywords

---

## v1.0 — Initial release

- Basic polling (replaces webhook — solves duplicate response issue)
- `250 food` expense logging
- `/ping`, `/help`, `/myid`
- Google Sheets append
