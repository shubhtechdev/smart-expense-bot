// ============================================================
//  config.template.gs
//
//  Copy this file, rename to config_local.gs (gitignored),
//  and fill in your real values.
//
//  NEVER commit real values to GitHub.
// ============================================================

// ─── REQUIRED ────────────────────────────────────────────────

// 1. Your Telegram Bot Token
//    Get from @BotFather on Telegram → /newbot
//    Format: 1234567890:AAFxxxxxxxxxxxxxxxxxxxxxx
var TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN';

// 2. Your Google Sheet ID
//    From the sheet URL:
//    https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit
var SHEET_ID = 'YOUR_GOOGLE_SHEET_ID';

// 3. Your Gemini API Key
//    Get free from: https://aistudio.google.com/apikey
//    Used for expense parsing and weekly/monthly digests
var GEMINI_KEY = 'YOUR_GEMINI_API_KEY';

// ─── OPTIONAL (but recommended) ──────────────────────────────

// 4. Your Telegram User ID
//    Restricts bot to respond only to you.
//    Leave as 0 during initial testing.
//    Get your ID by sending /myid to the bot.
var ALLOWED_UID = 0;

// 5. Your Telegram Chat ID (same as user ID for personal bots)
//    Required for bot to send you automatic notifications:
//    - Monthly rollup confirmation
//    - Recurring expense log
//    - Weekly and monthly AI digests
//    Leave as 0 to disable notifications.
var CHAT_ID = 0;
