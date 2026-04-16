// ============================================================
//  EXPENSE TRACKER BOT — v6
//  Interface : Telegram (polling, 1-min trigger)
//  Backend   : Google Apps Script
//  Storage   : Google Sheets (yearly FY tabs)
//
// ============================================================

// ─── CONFIG ──────────────────────────────────────────────────
var TOKEN       = 'YOUR_TELEGRAM_TOKEN_HERE';
var SHEET_ID    = 'YOUR_SHEET_ID_HERE';
var GEMINI_KEY  = 'YOUR_GEMINI_API_KEY_HERE';
var ALLOWED_UID = 0;   // Your Telegram user ID. 0 = allow all
var CHAT_ID     = 0;   // Your Telegram chat ID for bot notifications
// ─────────────────────────────────────────────────────────────


var MONTH_COL = {
  3:'C',4:'D',5:'E',6:'F',7:'G',8:'H',
  9:'I',10:'J',11:'K',0:'L',1:'M',2:'N'
};

var ROWS = {
  INCOME:4,DEDUCTIONS:5,TAX:6,BONUS:7,INHAND:8,
  NEED_ALLOC:12,WANT_ALLOC:13,INVEST_ALLOC:14,
  NEED_USED:17,WANT_USED:18,INVEST_USED:19,
  TOTAL_SAVINGS:22,
  ICICI_BAL:25,HDFC_BAL:26,SBI_BAL:27,
  CC_ICICI:30,CC_HDFC:31,CC_SBI:32,
  NEED_START:33,NEED_END:47,NEED_TOTAL:48,
  WANT_START:51,WANT_END:61,WANT_TOTAL:62,
  INVEST_START:65,INVEST_END:77,INVEST_TOTAL:78
};

// Lowercase keys — case-insensitive rollup matching
var CATEGORY_ROWS = {
  'rent':33,'recharge':34,'healthcare':35,'emi':36,
  'insurance emi':37,'insurances emi':37,'emergency fund':38,'food':39,
  'electricity & bill':40,'saloon':41,
  'fuel/transportation':42,'home general':43,'other need':44,'other':44,
  'party/dine-out':51,'party/dine out':51,'movies':52,'vacations':53,
  'vehicle':54,'gadgets':55,'gifts':56,'clothing':57,'other want':58,
  'ppf':65,'epf':66,'nps':67,'mutual fund':68,'mf':68,
  'fd':69,'stocks':70,'gold':71,'real estate':72,
  'crypto':73,'other investment':74
};

var FY_START_MONTH = 3; // April
var CACHE_KEY      = 'master_cats_v6';
var RECURRING_KEY  = 'recurring_expenses';


// ============================================================
//  POLLING
// ============================================================

function pollTelegram() {
  var props  = PropertiesService.getScriptProperties();
  var offset = parseInt(props.getProperty('offset') || '0');

  var res  = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + TOKEN +
    '/getUpdates?timeout=30&offset=' + offset,
    { muteHttpExceptions: true }
  );

  var data = JSON.parse(res.getContentText());
  if (!data.ok || !data.result.length) return;

  data.result.forEach(function(update) {
    try {
      var msg = update.message;
      if (msg && msg.text) {
        if (ALLOWED_UID !== 0 && msg.from.id !== ALLOWED_UID) {
          sendMessage(msg.chat.id, '⛔ Unauthorised.');
          return;
        }
        var reply = handleMessage(msg.text.trim(), msg.chat.id);
        if (reply) sendMessage(msg.chat.id, reply);
      }
    } catch(err) {
      Logger.log('Poll error: ' + err.message);
    }
    props.setProperty('offset', String(update.update_id + 1));
  });
}


// ============================================================
//  ROUTER
// ============================================================

function handleMessage(text, chatId) {
  var props      = PropertiesService.getScriptProperties();
  var pendingRaw = props.getProperty('pending_' + chatId);
  if (pendingRaw) return handleCategoryReply(text, chatId, pendingRaw);

  var t = text.toLowerCase().trim();

  if (t === '/ping')                   return '🟢 alive — ' + nowIST();
  if (t === '/myid')                   return 'Your chat ID: ' + chatId;
  if (t === '/help' || t === '/start') return helpText();
  if (t === '/setup')                  return cmdSetup();
  if (t === '/total')                  return cmdTotal();
  if (t === '/today')                  return cmdToday();
  if (t === '/week')                   return cmdWeek();
  if (t === '/summary')                return cmdSummary();
  if (t === '/report')                 return cmdReport();
  if (t === '/lends')                  return cmdLends(null);
  if (t === '/cats')                   return cmdCats();
  if (t === '/salary')                 return cmdGetSalary();
  if (t === '/newfy')                  return cmdNewFY(false);
  if (t === '/delete')                 return cmdDeleteLast();
  if (t === '/recurring')              return cmdListRecurring();

  if (t.startsWith('/lends '))         return cmdLends(text.slice(7).trim());
  if (t.startsWith('/lend '))          return cmdLend(text.slice(6).trim());
  if (t.startsWith('/rollup'))         return cmdRollup(text);
  if (t.startsWith('/month'))          return cmdMonth(text);
  if (t.startsWith('/setsalary'))      return cmdSetSalary(text);
  if (t.startsWith('/cc'))             return cmdCC(text);
  if (t.startsWith('/bal'))            return cmdBalance(text);
  if (t.startsWith('/addcat'))         return cmdAddCat(text);
  if (t.startsWith('/search'))         return cmdSearch(text);
  if (t.startsWith('/addrec'))         return cmdAddRecurring(text);
  if (t.startsWith('/delrec'))         return cmdDeleteRecurring(text);

  return handleExpense(text, chatId);
}


// ============================================================
//  EXPENSE HANDLER
// ============================================================

function handleExpense(text, chatId) {
  var parsed = parseWithGemini(text);

  if (!parsed) {
    return (
      '❓ Could not understand.\n\n' +
      'Try:\n' +
      '• 250 food\n' +
      '• 800 lunch with team\n' +
      '• 250 food on 10 apr\n' +
      '• 500 uber yesterday'
    );
  }

  // 1. Custom CategoryMap (word-level)
  var customMap = getCustomCategoryMap();
  var mapped    = matchCustomMap(parsed.category, customMap);
  if (mapped) { parsed.category = mapped.category; parsed.type = mapped.type; }

  // 2. Validate against MASTER
  var masterMap = getMasterCategoryMap();
  var catKey    = normalise(parsed.category);

  if (!masterMap[catKey]) {
    var cats = getMasterCategories();
    var opts = cats.slice(0, 10).map(function(c, i) {
      return (i+1) + '. ' + c.category + ' (' + c.type + ')';
    }).join('\n');

    props.setProperty('pending_' + chatId, JSON.stringify({
      originalText: text, amount: parsed.amount,
      date: parsed.date, geminiCat: parsed.category, geminiType: parsed.type
    }));

    return (
      '🤔 Gemini parsed:\n' +
      '💰 ₹' + fmt(parsed.amount) + ' — ' + parsed.date + '\n' +
      '🏷 "' + parsed.category + '" not in list\n\n' +
      'Pick a category:\n' + opts + '\n\n' +
      'Or type name. /cats for full list.'
    );
  }

  parsed.category = masterMap[catKey].category;
  parsed.type     = masterMap[catKey].type;

  var result = saveExpense(parsed, text);

  // Budget alert check (non-blocking)
  try {
    var alert = checkBudgetAlert(parsed.type);
    if (alert) result += '\n\n' + alert;
  } catch(e) { Logger.log('Budget alert error: ' + e.message); }

  return result;
}

var props = PropertiesService.getScriptProperties();

function handleCategoryReply(text, chatId, pendingRaw) {
  var pending = JSON.parse(pendingRaw);
  var master  = getMasterCategories();
  var chosen;

  var num = parseInt(text.trim());
  if (!isNaN(num) && num >= 1 && num <= master.length) {
    chosen = master[num - 1];
  } else {
    var lc = text.toLowerCase().trim();
    for (var i = 0; i < master.length; i++) {
      if (master[i].category.toLowerCase() === lc) { chosen = master[i]; break; }
    }
  }

  if (!chosen) return '❓ Not recognised. Try a number or /cats for full list.';

  saveCustomMapping(pending.geminiCat.toLowerCase(), chosen.category, chosen.type);
  props.deleteProperty('pending_' + chatId);

  return saveExpense({
    amount: pending.amount, date: pending.date,
    category: chosen.category, type: chosen.type
  }, pending.originalText) +
  '\n\n📌 "' + pending.geminiCat + '" → ' + chosen.category + ' saved for next time';
}

function saveExpense(parsed, rawText) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('Transactions');
    if (!sheet) return '⚠️ No Transactions sheet. Run /setup first.';

    var dateObj = strToDate(parsed.date) || new Date();
    var timeStr = nowTime();
    var lastRow = sheet.getLastRow() + 1;

    sheet.getRange(lastRow, 1, 1, 6).setValues([[
      dateObj, timeStr, parsed.amount, parsed.category, parsed.type, rawText
    ]]);

    return (
      '✅ Logged!\n' +
      '📅 ' + Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'dd-MMM-yyyy') + ' ' + timeStr + '\n' +
      '💰 ₹' + fmt(parsed.amount) + '\n' +
      '🏷 '  + parsed.category + '\n' +
      '📂 '  + parsed.type
    );
  } catch(err) {
    Logger.log('saveExpense: ' + err.message);
    return '⚠️ ' + err.message;
  }
}


// ============================================================
//  BUDGET ALERT — runs silently after each expense
// ============================================================

function checkBudgetAlert(type) {
  try {
    var now    = new Date();
    var col    = MONTH_COL[now.getMonth()];
    var fyName = getFYSheetName(now.getMonth(), now.getFullYear());
    var ss     = SpreadsheetApp.openById(SHEET_ID);
    var fy     = ss.getSheetByName(fyName);
    if (!fy) return null;

    var income = fy.getRange(col + ROWS.INCOME).getValue() || 0;
    if (income <= 0) return null;

    var bonus  = fy.getRange(col + ROWS.BONUS).getValue()       || 0;
    var deduct = fy.getRange(col + ROWS.DEDUCTIONS).getValue()  || 0;
    var tax    = fy.getRange(col + ROWS.TAX).getValue()         || 0;
    var inhand = (income + bonus) - (deduct + tax);
    if (inhand <= 0) return null;

    var rows   = getMonthRows(now.getMonth(), now.getFullYear());
    var totals = sumByType(rows);

    var limits = { Need: 50, Want: 25, Investment: 25 };
    var limit  = limits[type];
    if (!limit) return null;

    var pct    = Math.round((totals[type] / inhand) * 100);
    if (pct > limit) {
      return '⚠️ ' + type + ' budget alert!\n' +
        pct + '% of salary used (limit ' + limit + '%)';
    }
    return null;
  } catch(e) { return null; }
}


// ============================================================
//  GEMINI — text parsing + digest only
// ============================================================

function parseWithGemini(text) {
  var categories = getMasterCategories().map(function(c) { return c.category; }).join(', ');
  var today      = nowDate();
  var yesterday  = yesterdayDate();

  var prompt =
    'Parse this Indian expense: "' + text + '"\n' +
    'Today: ' + today + '. Yesterday: ' + yesterday + '.\n\n' +
    'Indian rules:\n' +
    '- lunch/dinner OUT or "with someone" or at restaurant/cafe/swiggy/zomato = Party/Dine-out (Want)\n' +
    '- grocery/food/vegetables/milk for home = Food (Need)\n' +
    '- nifty/sensex/index fund/ETF/SIP/mutual fund = Mutual Fund (Investment)\n' +
    '- direct stocks/equity/shares = Stocks (Investment)\n' +
    '- uber/ola/auto/cab/rapido/metro/bus/petrol/fuel = Fuel/Transportation (Need)\n' +
    '- recharge/jio/airtel/wifi/broadband = Recharge (Need)\n\n' +
    'Extract:\n' +
    '1. amount: INR number > 0 (required)\n' +
    '2. category: exactly one of: ' + categories + '\n' +
    '3. type: Need / Want / Investment\n' +
    '4. date: dd-MMM-yyyy. Parse "yesterday", "on 10 apr", "5th", "10/04". Default: ' + today + '\n\n' +
    'Return ONLY JSON or null:\n' +
    '{"amount":250,"category":"Food","type":"Need","date":"' + today + '"}\n\n' +
    'Examples:\n' +
    '"800 lunch with colleagues" → {"amount":800,"category":"Party/Dine-out","type":"Want","date":"' + today + '"}\n' +
    '"3000 nifty50 SIP" → {"amount":3000,"category":"Mutual Fund","type":"Investment","date":"' + today + '"}\n' +
    '"500 groceries" → {"amount":500,"category":"Food","type":"Need","date":"' + today + '"}';

  try {
    var res = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' + GEMINI_KEY,
      {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 80 }
        })
      }
    );

    if (res.getResponseCode() !== 200) { Logger.log('Gemini HTTP ' + res.getResponseCode()); return null; }

    var raw    = JSON.parse(res.getContentText());
    if (!raw.candidates || !raw.candidates.length) return null;
    var output = raw.candidates[0].content.parts[0].text.trim().replace(/```json|```/gi,'').trim();
    Logger.log('Gemini: ' + output);
    if (!output || output === 'null') return null;

    var result = JSON.parse(output);
    if (!result || !result.amount) return null;
    result.amount = parseFloat(result.amount);
    if (isNaN(result.amount) || result.amount <= 0) return null;
    if (!result.date) result.date = today;
    return result;

  } catch(err) { Logger.log('Gemini: ' + err.message); return null; }
}


// ============================================================
//  COMMANDS
// ============================================================

function cmdTotal() {
  try {
    var now    = new Date();
    var rows   = getMonthRows(now.getMonth(), now.getFullYear());
    var totals = sumByType(rows);
    return formatTotals(monthName(now.getMonth()) + ' ' + now.getFullYear(), totals);
  } catch(err) { return '⚠️ ' + err.message; }
}


function cmdToday() {
  try {
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('Transactions');
    if (!sheet) return '⚠️ No Transactions sheet.';

    var data  = sheet.getDataRange().getValues();
    var today = nowDate();
    var lines = [];
    var total = 0;

    for (var i = 1; i < data.length; i++) {
      var rowDate = dateToStr(data[i][0]);
      if (rowDate === today) {
        var amt = parseFloat(data[i][2]) || 0;
        lines.push('• ₹' + fmt(amt) + ' — ' + data[i][3]);
        total += amt;
      }
    }

    if (!lines.length) return '📭 Nothing logged today (' + today + ').';
    return '📋 Today (' + today + ')\n\n' + lines.join('\n') + '\n─────────────\n💸 Total: ₹' + fmt(total);
  } catch(err) { Logger.log('cmdToday: ' + err.message); return '⚠️ ' + err.message; }
}


function cmdWeek() {
  try {
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('Transactions');
    if (!sheet) return '⚠️ No Transactions sheet.';

    var data   = sheet.getDataRange().getValues();
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    cutoff.setHours(0,0,0,0);

    var byDay = {};
    var total = 0;

    for (var i = 1; i < data.length; i++) {
      var d = strToDate(dateToStr(data[i][0]));
      if (d && d >= cutoff) {
        var amt    = parseFloat(data[i][2]) || 0;
        var dk     = dateToStr(data[i][0]);
        byDay[dk]  = (byDay[dk] || 0) + amt;
        total     += amt;
      }
    }

    var lines = Object.keys(byDay).map(function(d) { return '• ' + d + ': ₹' + fmt(byDay[d]); });
    return '📅 Last 7 days\n\n' +
      (lines.length ? lines.join('\n') + '\n' : 'No expenses.\n') +
      '─────────────\n💸 Total: ₹' + fmt(total);
  } catch(err) { return '⚠️ ' + err.message; }
}


function cmdMonth(text) {
  try {
    var parts = text.trim().split(/\s+/);
    var mIdx, year;
    if (parts.length < 2) {
      var now = new Date(); mIdx = now.getMonth(); year = now.getFullYear();
    } else {
      mIdx = parseMonthStr(parts[1]);
      year = parts[2] ? parseInt(parts[2]) : new Date().getFullYear();
      if (mIdx === -1) return '❓ Try: /month april or /month april 2025';
    }
    return formatTotals(monthName(mIdx) + ' ' + year, sumByType(getMonthRows(mIdx, year)));
  } catch(err) { return '⚠️ ' + err.message; }
}


function cmdSummary() {
  try {
    var now    = new Date();
    var mIdx   = now.getMonth();
    var year   = now.getFullYear();
    var col    = MONTH_COL[mIdx];
    var fyName = getFYSheetName(mIdx, year);
    var ss     = SpreadsheetApp.openById(SHEET_ID);
    var fy     = ss.getSheetByName(fyName);

    if (!fy) return '⚠️ No FY sheet. Run /setup.';

    var income = fy.getRange(col + ROWS.INCOME).getValue()      || 0;
    var deduct = fy.getRange(col + ROWS.DEDUCTIONS).getValue()  || 0;
    var tax    = fy.getRange(col + ROWS.TAX).getValue()         || 0;
    var bonus  = fy.getRange(col + ROWS.BONUS).getValue()       || 0;
    var inhand = (income + bonus) - (deduct + tax);

    var rows   = getMonthRows(mIdx, year);
    var totals = sumByType(rows);
    var name   = monthName(mIdx);

    if (inhand <= 0) {
      return '⚠️ Salary not set. Use /setsalary 85000\n\n' +
        formatTotals(name + ' ' + year, totals);
    }

    var na = Math.round(inhand * 0.50);
    var wa = Math.round(inhand * 0.25);
    var ia = Math.round(inhand * 0.25);
    var np = Math.round((totals.Need       / inhand) * 100);
    var wp = Math.round((totals.Want       / inhand) * 100);
    var ip = Math.round((totals.Investment / inhand) * 100);

    return (
      '📊 ' + name + ' Summary\n\n' +
      '💰 In-hand: ₹' + fmt(inhand) + '\n\n' +
      '50-25-25:\n' +
      (np > 50 ? '🚨' : '✅') + ' Need:   ₹' + fmt(totals.Need)       + ' / ₹' + fmt(na) + ' (' + np + '%)\n' +
      (wp > 25 ? '🚨' : '✅') + ' Want:   ₹' + fmt(totals.Want)       + ' / ₹' + fmt(wa) + ' (' + wp + '%)\n' +
      (ip < 25 ? '⚠️' : '✅') + ' Invest: ₹' + fmt(totals.Investment) + ' / ₹' + fmt(ia) + ' (' + ip + '%)\n' +
      '─────────────\n' +
      '💸 Total: ₹' + fmt(totals.Total)
    );
  } catch(err) { return '⚠️ ' + err.message; }
}


function cmdReport() {
  try {
    var now    = new Date();
    var rows   = getMonthRows(now.getMonth(), now.getFullYear());

    if (!rows.length) return '📭 No expenses this month yet.';

    // Sum by category in JS
    var catMap = {};
    rows.forEach(function(r) {
      catMap[r.category] = (catMap[r.category] || 0) + r.amount;
    });

    // Sort by amount descending
    var sorted = Object.keys(catMap).sort(function(a, b) {
      return catMap[b] - catMap[a];
    });

    var top5   = sorted.slice(0, 5);
    var total  = rows.reduce(function(s, r) { return s + r.amount; }, 0);
    var name   = monthName(now.getMonth());

    var lines  = top5.map(function(cat, i) {
      var pct = Math.round((catMap[cat] / total) * 100);
      return (i + 1) + '. ' + cat + ': ₹' + fmt(catMap[cat]) + ' (' + pct + '%)';
    });

    return (
      '📈 Top spends — ' + name + '\n\n' +
      lines.join('\n') + '\n' +
      '─────────────\n' +
      '💸 Total: ₹' + fmt(total) + ' across ' + rows.length + ' entries'
    );
  } catch(err) { return '⚠️ ' + err.message; }
}


// ── ROLLUP — default = current month ─────────────────────────
function cmdRollup(text) {
  try {
    var parts = text.trim().split(/\s+/);
    var mIdx, year;

    if (parts.length < 2) {
      // Default = CURRENT month (not previous — you have transactions now!)
      var now = new Date(); mIdx = now.getMonth(); year = now.getFullYear();
    } else {
      mIdx = parseMonthStr(parts[1]);
      year = parts[2] ? parseInt(parts[2]) : new Date().getFullYear();
      if (mIdx === -1) return '❓ Try: /rollup april or /rollup april 2025';
    }

    var col    = MONTH_COL[mIdx];
    var rows   = getMonthRows(mIdx, year);
    if (!rows.length) return '📭 No transactions for ' + monthName(mIdx) + ' ' + year;

    var fyName = getFYSheetName(mIdx, year);
    var ss     = SpreadsheetApp.openById(SHEET_ID);
    var fy     = ss.getSheetByName(fyName);
    if (!fy) {
      fy = createFYSheet(fyName);
      if (!fy) return '⚠️ Could not find or create ' + fyName + '. Run /setup.';
    }

    // Sum by category — pure JS
    var catTotals = {};
    rows.forEach(function(r) {
      var key = normalise(r.category);
      catTotals[key] = (catTotals[key] || 0) + r.amount;
    });

    // Clear old values in expense rows
    for (var r = ROWS.NEED_START; r <= ROWS.INVEST_END; r++) {
      fy.getRange(col + r).setValue('');
    }

    var updated = 0;
    var skipped = [];

    for (var cat in catTotals) {
      var rowNum = CATEGORY_ROWS[cat];
      if (!rowNum) {
        var plain = cat.replace(/[^a-z0-9 ]/g,'');
        for (var key in CATEGORY_ROWS) {
          if (key.replace(/[^a-z0-9 ]/g,'') === plain) { rowNum = CATEGORY_ROWS[key]; break; }
        }
      }
      if (rowNum) { fy.getRange(col + rowNum).setValue(Math.round(catTotals[cat])); updated++; }
      else skipped.push(cat + ' ₹' + fmt(catTotals[cat]));
    }

    var totals = sumByType(rows);
    var reply  = (
      '📊 Rollup: ' + monthName(mIdx) + ' ' + year + ' → ' + fyName + '\n\n' +
      '🔴 Need: ₹'       + fmt(totals.Need)       + '\n' +
      '🟡 Want: ₹'       + fmt(totals.Want)       + '\n' +
      '🟢 Investment: ₹' + fmt(totals.Investment) + '\n' +
      '─────────────\n'  +
      '💸 Total: ₹'      + fmt(totals.Total)      + '\n\n' +
      '✅ ' + updated + ' categories written to col ' + col
    );
    if (skipped.length) reply += '\n⚠️ Skipped: ' + skipped.join(', ');
    return reply;

  } catch(err) { Logger.log('Rollup: ' + err.message); return '⚠️ Rollup error: ' + err.message; }
}


// ============================================================
//  RECURRING EXPENSES
// ============================================================

/**
 * /addrec rent 12000 — add a recurring expense
 * Logs automatically on 1st of every month.
 */
function cmdAddRecurring(text) {
  try {
    var parts = text.trim().split(/\s+/);
    if (parts.length < 3) {
      return (
        '❓ Usage: /addrec category amount\n\n' +
        'Examples:\n' +
        '/addrec rent 12000\n' +
        '/addrec sip 5000\n' +
        '/addrec insurance 2182\n\n' +
        'These log automatically on 1st of every month.'
      );
    }

    var category = parts.slice(1, parts.length - 1).join(' ');
    var amount   = parseFloat(parts[parts.length - 1]);

    if (isNaN(amount) || amount <= 0) return '❓ Invalid amount.';

    // Validate category against MASTER
    var masterMap = getMasterCategoryMap();
    var catKey    = normalise(category);
    var matched   = masterMap[catKey];

    if (!matched) {
      return '❓ "' + category + '" not in categories.\n/cats to see all. /addcat to add new.';
    }

    var stored = getRecurring();
    // Check duplicate
    for (var i = 0; i < stored.length; i++) {
      if (normalise(stored[i].category) === normalise(matched.category)) {
        stored[i].amount = amount; // update amount
        saveRecurring(stored);
        return '✅ Updated recurring: ' + matched.category + ' → ₹' + fmt(amount) + '/month';
      }
    }

    stored.push({ category: matched.category, type: matched.type, amount: amount });
    saveRecurring(stored);

    return (
      '✅ Recurring added:\n' +
      '🏷 ' + matched.category + ' (' + matched.type + ')\n' +
      '💰 ₹' + fmt(amount) + '/month\n\n' +
      'Will auto-log on 1st of every month.\n' +
      '/recurring to see all.'
    );
  } catch(err) { return '⚠️ ' + err.message; }
}


function cmdListRecurring() {
  var stored = getRecurring();
  if (!stored.length) {
    return '📭 No recurring expenses set.\n\nUse /addrec rent 12000 to add one.';
  }

  var total = 0;
  var lines = stored.map(function(r, i) {
    total += r.amount;
    return (i+1) + '. ' + r.category + ' (' + r.type + '): ₹' + fmt(r.amount);
  });

  return (
    '🔁 Recurring expenses\n\n' +
    lines.join('\n') + '\n' +
    '─────────────\n' +
    '💸 Monthly: ₹' + fmt(total) + '\n\n' +
    'Use /delrec 1 to remove by number.'
  );
}


function cmdDeleteRecurring(text) {
  var parts = text.trim().split(/\s+/);
  if (parts.length < 2) return '❓ Usage: /delrec 1\n/recurring to see list.';

  var idx    = parseInt(parts[1]) - 1;
  var stored = getRecurring();

  if (isNaN(idx) || idx < 0 || idx >= stored.length) {
    return '❓ Invalid number. /recurring to see list.';
  }

  var removed = stored.splice(idx, 1)[0];
  saveRecurring(stored);
  return '✅ Removed: ' + removed.category + ' ₹' + fmt(removed.amount);
}


function getRecurring() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(RECURRING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}


function saveRecurring(arr) {
  PropertiesService.getScriptProperties().setProperty(RECURRING_KEY, JSON.stringify(arr));
}


/**
 * Logs all recurring expenses for the current month.
 * Called automatically on 1st of month by dailyTrigger.
 */
function logRecurringExpenses() {
  var stored = getRecurring();
  if (!stored.length) return;

  var logged = [];
  stored.forEach(function(r) {
    try {
      saveExpense({ date: nowDate(), amount: r.amount, category: r.category, type: r.type }, 'recurring');
      logged.push('• ' + r.category + ': ₹' + fmt(r.amount));
    } catch(e) { Logger.log('Recurring log error: ' + e.message); }
  });

  if (logged.length && CHAT_ID !== 0) {
    sendMessage(CHAT_ID,
      '🔁 Recurring expenses logged:\n\n' + logged.join('\n')
    );
  }
}


// ============================================================
//  AI DIGESTS — Gemini summarisation
// ============================================================

/**
 * Weekly digest — sent every Sunday.
 * Analyses last 7 days of spending.
 */
function sendWeeklyDigest() {
  if (CHAT_ID === 0) { Logger.log('CHAT_ID not set — skipping weekly digest'); return; }

  try {
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('Transactions');
    if (!sheet) return;

    var data   = sheet.getDataRange().getValues();
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    var expenses = [];
    var total    = 0;

    for (var i = 1; i < data.length; i++) {
      var d = strToDate(dateToStr(data[i][0]));
      if (d && d >= cutoff) {
        var amt = parseFloat(data[i][2]) || 0;
        expenses.push(data[i][0] + ' ₹' + amt + ' ' + data[i][3] + ' (' + data[i][4] + ')');
        total += amt;
      }
    }

    if (!expenses.length) {
      sendMessage(CHAT_ID, '📅 Weekly digest: No expenses logged this week.');
      return;
    }

    var prompt =
      'You are a personal finance assistant for an Indian user.\n' +
      'Analyse this week\'s expenses (last 7 days):\n\n' +
      expenses.join('\n') + '\n\n' +
      'Total: ₹' + Math.round(total) + '\n\n' +
      'Write a brief 3-4 line summary covering:\n' +
      '1. Biggest spending category\n' +
      '2. Any unusual or one-off expense\n' +
      '3. One practical tip for next week\n\n' +
      'Keep it friendly, concise, and specific to the data. Use ₹ symbol for amounts.';

    var summary = callGeminiText(prompt);

    sendMessage(CHAT_ID,
      '📅 Weekly Digest\n' +
      nowDate() + '\n\n' +
      summary + '\n\n' +
      '💸 Week total: ₹' + fmt(total)
    );

  } catch(err) { Logger.log('Weekly digest: ' + err.message); }
}


/**
 * Monthly digest — sent on 2nd of every month.
 * Analyses previous month's full spending.
 */
function sendMonthlyDigest() {
  if (CHAT_ID === 0) { Logger.log('CHAT_ID not set — skipping monthly digest'); return; }

  try {
    var prev  = new Date();
    prev.setMonth(prev.getMonth() - 1);
    var mIdx  = prev.getMonth();
    var year  = prev.getFullYear();
    var rows  = getMonthRows(mIdx, year);

    if (!rows.length) {
      sendMessage(CHAT_ID, '📊 Monthly digest: No data for ' + monthName(mIdx) + '.');
      return;
    }

    var totals  = sumByType(rows);
    var catMap  = {};
    rows.forEach(function(r) { catMap[r.category] = (catMap[r.category] || 0) + r.amount; });

    var sorted  = Object.keys(catMap).sort(function(a,b) { return catMap[b] - catMap[a]; });
    var top3    = sorted.slice(0,3).map(function(c) { return c + ' ₹' + Math.round(catMap[c]); }).join(', ');

    // Get salary for context
    var col    = MONTH_COL[mIdx];
    var fyName = getFYSheetName(mIdx, year);
    var ss     = SpreadsheetApp.openById(SHEET_ID);
    var fy     = ss.getSheetByName(fyName);
    var income = 0;
    if (fy) {
      var inc  = fy.getRange(col + ROWS.INCOME).getValue()     || 0;
      var bon  = fy.getRange(col + ROWS.BONUS).getValue()      || 0;
      var ded  = fy.getRange(col + ROWS.DEDUCTIONS).getValue() || 0;
      var tax  = fy.getRange(col + ROWS.TAX).getValue()        || 0;
      income   = (inc + bon) - (ded + tax);
    }

    var prompt =
      'You are a personal finance coach for an Indian user.\n' +
      monthName(mIdx) + ' ' + year + ' expense summary:\n\n' +
      'Need: ₹' + totals.Need + '\n' +
      'Want: ₹' + totals.Want + '\n' +
      'Investment: ₹' + totals.Investment + '\n' +
      'Total: ₹' + totals.Total + '\n' +
      (income > 0 ? 'In-hand salary: ₹' + Math.round(income) + '\n' : '') +
      'Top categories: ' + top3 + '\n\n' +
      'Write a 4-5 line monthly review covering:\n' +
      '1. How well the 50-25-25 rule was followed\n' +
      '2. What went well\n' +
      '3. What to improve next month\n' +
      '4. One specific actionable suggestion\n\n' +
      'Be specific to the numbers. Use ₹ symbol. Keep it encouraging but honest.';

    var summary = callGeminiText(prompt);

    sendMessage(CHAT_ID,
      '📊 Monthly Digest — ' + monthName(mIdx) + ' ' + year + '\n\n' +
      summary + '\n\n' +
      '🔴 Need: ₹'       + fmt(totals.Need)       + '\n' +
      '🟡 Want: ₹'       + fmt(totals.Want)       + '\n' +
      '🟢 Investment: ₹' + fmt(totals.Investment) + '\n' +
      '💸 Total: ₹'      + fmt(totals.Total)
    );

  } catch(err) { Logger.log('Monthly digest: ' + err.message); }
}


function callGeminiText(prompt) {
  try {
    var res = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' + GEMINI_KEY,
      {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 250 }
        })
      }
    );
    if (res.getResponseCode() !== 200) return '(Could not generate summary)';
    var raw = JSON.parse(res.getContentText());
    return raw.candidates[0].content.parts[0].text.trim();
  } catch(e) { return '(Could not generate summary)'; }
}


// ============================================================
//  LENDING — simplified credit/debit
// ============================================================

/**
 * /lend rahul credit 500  — you gave Rahul ₹500 (he owes you)
 * /lend rahul debit 500   — you owe Rahul ₹500 (you borrowed)
 * /lend rahul paid 500    — Rahul paid you ₹500 back
 * /lend rahul settled     — mark everything settled between you two
 *
 * Shorthand still works:
 * /lend rahul +500        — same as credit 500
 * /lend rahul -500        — same as paid 500 (they returned)
 */
function cmdLend(args) {
  try {
    var parts = args.trim().split(/\s+/);
    if (parts.length < 2) {
      return (
        '❓ Usage:\n' +
        '/lend rahul credit 500   (you gave)\n' +
        '/lend rahul debit 500    (you owe)\n' +
        '/lend rahul paid 500     (they returned)\n' +
        '/lend rahul settled      (all clear)\n\n' +
        'Shorthand:\n' +
        '/lend rahul +500   = credit\n' +
        '/lend rahul -500   = paid back'
      );
    }

    var person  = cap(parts[0]);
    var keyword = parts[1].toLowerCase();
    var amount  = 0;
    var note    = '';
    var entry   = 0;
    var action  = '';

    // Handle settled separately
    if (keyword === 'settled' || keyword === 'clear' || keyword === 'done') {
      return settleLending(person);
    }

    // Parse amount and note
    if (keyword === 'credit' || keyword === 'debit' || keyword === 'paid') {
      amount = parseFloat(parts[2]);
      note   = parts.slice(3).join(' ');
    } else if (keyword.charAt(0) === '+' || keyword.charAt(0) === '-') {
      amount = parseFloat(keyword.replace(/[+\-]/g,''));
      keyword = keyword.charAt(0) === '+' ? 'credit' : 'paid';
      note   = parts.slice(2).join(' ');
    } else {
      // Try: /lend rahul 500 (assume credit)
      amount  = parseFloat(keyword);
      keyword = 'credit';
      note    = parts.slice(2).join(' ');
    }

    if (isNaN(amount) || amount <= 0) return '❓ Invalid amount.';

    // credit = you gave them, positive balance (they owe you)
    // debit  = you owe them, negative balance
    // paid   = they returned money, reduces their debt
    if (keyword === 'credit') { entry = amount;  action = 'You gave ₹' + fmt(amount) + ' to ' + person; }
    else if (keyword === 'debit') { entry = -amount; action = 'You owe ' + person + ' ₹' + fmt(amount); }
    else if (keyword === 'paid') { entry = amount; action = person + ' paid back ₹' + fmt(amount); }
    // Note: 'paid' also positive (reduces their debt) because we track from your perspective

    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('Lending');
    if (!sheet) {
      sheet = ss.insertSheet('Lending');
      sheet.appendRow(['Date','Time','Person','Type','Amount','Note','Running Balance']);
      sheet.getRange(1,1,1,7).setFontWeight('bold');
    }

    // Get current balance for this person
    var data    = sheet.getDataRange().getValues();
    var balance = 0;
    for (var i = 1; i < data.length; i++) {
      if (data[i][2] === person && data[i][6] !== 'SETTLED') {
        balance = parseFloat(data[i][6]) || 0;
      }
    }

    balance += entry;
    sheet.appendRow([nowDate(), nowTime(), person, keyword, entry, note, balance]);

    var balMsg = balance > 0
      ? person + ' owes you ₹' + fmt(balance)
      : balance < 0
        ? 'You owe ' + person + ' ₹' + fmt(Math.abs(balance))
        : '✅ All clear with ' + person + '!';

    return (
      '💸 ' + action + '\n' +
      (note ? '📝 ' + note + '\n' : '') +
      '─────────────\n' +
      '📊 Balance: ' + balMsg
    );
  } catch(err) { return '⚠️ ' + err.message; }
}


function settleLending(person) {
  try {
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('Lending');
    if (!sheet) return '📭 No lending records.';

    var data    = sheet.getDataRange().getValues();
    var balance = 0;
    for (var i = 1; i < data.length; i++) {
      if (data[i][2] === person) balance = parseFloat(data[i][6]) || 0;
    }

    sheet.appendRow([nowDate(), nowTime(), person, 'settled', 0, 'settled', 'SETTLED']);

    return (
      '✅ ' + person + ' settled!\n' +
      (balance > 0
        ? 'Was owed: ₹' + fmt(balance)
        : balance < 0
          ? 'You owed: ₹' + fmt(Math.abs(balance))
          : 'Was already clear.') +
      '\nAll records archived.'
    );
  } catch(err) { return '⚠️ ' + err.message; }
}


function cmdLends(person) {
  try {
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('Lending');
    if (!sheet) return '📭 No lending records yet.';
    var data  = sheet.getDataRange().getValues();

    if (person) {
      var pc    = cap(person);
      var lines = [];
      var bal   = 0;

      for (var i = 1; i < data.length; i++) {
        if (data[i][2] === pc) {
          var type = data[i][3];
          var amt  = parseFloat(data[i][4]) || 0;
          if (type === 'settled') { lines.push('— Settled on ' + data[i][0]); continue; }
          var symbol = amt >= 0 ? '↑' : '↓';
          lines.push(symbol + ' ' + type + ' ₹' + fmt(Math.abs(amt)) +
            ' on ' + data[i][0] + (data[i][5] ? ' — ' + data[i][5] : ''));
          bal = data[i][6];
        }
      }

      if (!lines.length) return '📭 No records for ' + pc;

      var summary = bal === 'SETTLED' ? '✅ All settled'
        : bal > 0  ? pc + ' owes you ₹' + fmt(bal)
        : bal < 0  ? 'You owe ' + pc + ' ₹' + fmt(Math.abs(bal))
        : '✅ All clear';

      return '📒 ' + pc + '\n\n' + lines.join('\n') + '\n─────────────\n' + summary;
    }

    // Net balances for all people — use latest non-settled entry
    var latest = {};
    for (var j = 1; j < data.length; j++) {
      if (data[j][2]) {
        var b = data[j][6];
        if (b === 'SETTLED') { delete latest[data[j][2]]; }
        else { latest[data[j][2]] = parseFloat(b) || 0; }
      }
    }

    var owedToMe = [], iOwe = [];
    Object.keys(latest).forEach(function(p) {
      var b = latest[p];
      if (b > 0)      owedToMe.push('• ' + p + ': owes you ₹' + fmt(b));
      else if (b < 0) iOwe.push('• ' + p + ': you owe ₹' + fmt(Math.abs(b)));
    });

    if (!owedToMe.length && !iOwe.length) return '✅ All clear — no pending balances!';

    var reply = '💰 Lending Summary\n\n';
    if (owedToMe.length) reply += '📥 Owed to you:\n' + owedToMe.join('\n') + '\n\n';
    if (iOwe.length)     reply += '📤 You owe:\n'     + iOwe.join('\n');
    return reply;

  } catch(err) { return '⚠️ ' + err.message; }
}


// ============================================================
//  SALARY / CC / BAL / CATS / ADDCAT / SEARCH / DELETE
// ============================================================

function cmdSetSalary(text) {
  try {
    var amount = parseFloat(text.trim().split(/\s+/)[1]);
    if (isNaN(amount) || amount <= 0) return '❓ Usage: /setsalary 85000';
    var now    = new Date();
    var col    = MONTH_COL[now.getMonth()];
    var fyName = getFYSheetName(now.getMonth(), now.getFullYear());
    var ss     = SpreadsheetApp.openById(SHEET_ID);
    var fy     = ss.getSheetByName(fyName);
    if (!fy) return '⚠️ Sheet ' + fyName + ' not found. Run /newfy.';
    fy.getRange(col + ROWS.INCOME).setValue(amount);
    return '✅ Salary ₹' + fmt(amount) + ' set for ' + monthName(now.getMonth()) + ' in ' + fyName;
  } catch(err) { return '⚠️ ' + err.message; }
}

function cmdGetSalary() {
  try {
    var now    = new Date();
    var col    = MONTH_COL[now.getMonth()];
    var fyName = getFYSheetName(now.getMonth(), now.getFullYear());
    var ss     = SpreadsheetApp.openById(SHEET_ID);
    var fy     = ss.getSheetByName(fyName);
    if (!fy) return '⚠️ Sheet ' + fyName + ' not found.';
    var val = fy.getRange(col + ROWS.INCOME).getValue();
    return val ? '💰 Salary (' + monthName(now.getMonth()) + '): ₹' + fmt(val) : '📭 Not set. Use /setsalary 85000';
  } catch(err) { return '⚠️ ' + err.message; }
}

function cmdCC(text) {
  try {
    var parts  = text.trim().split(/\s+/);
    if (parts.length < 3) return '❓ Usage: /cc icici 5000\nOptions: icici, hdfc, sbi';
    var bank   = parts[1].toLowerCase();
    var amount = parseFloat(parts[2]);
    if (isNaN(amount)) return '❓ Invalid amount.';
    var rowMap = {icici:ROWS.CC_ICICI,hdfc:ROWS.CC_HDFC,sbi:ROWS.CC_SBI};
    var rowNum = rowMap[bank];
    if (!rowNum) return '❓ Unknown bank. Use: icici, hdfc, sbi';
    var now    = new Date();
    var col    = MONTH_COL[now.getMonth()];
    var fyName = getFYSheetName(now.getMonth(), now.getFullYear());
    var ss     = SpreadsheetApp.openById(SHEET_ID);
    var fy     = ss.getSheetByName(fyName);
    if (!fy) return '⚠️ Sheet ' + fyName + ' not found. Run /newfy.';
    fy.getRange(col + rowNum).setValue(amount);
    return '✅ CC ' + bank.toUpperCase() + ': ₹' + fmt(amount) + ' — ' + monthName(now.getMonth());
  } catch(err) { return '⚠️ ' + err.message; }
}

function cmdBalance(text) {
  try {
    var parts  = text.trim().split(/\s+/);
    if (parts.length < 3) return '❓ Usage: /bal icici 45000\nOptions: icici, hdfc, sbi';
    var bank   = parts[1].toLowerCase();
    var amount = parseFloat(parts[2]);
    if (isNaN(amount)) return '❓ Invalid amount.';
    var rowMap = {icici:ROWS.ICICI_BAL,hdfc:ROWS.HDFC_BAL,sbi:ROWS.SBI_BAL};
    var rowNum = rowMap[bank];
    if (!rowNum) return '❓ Unknown bank. Use: icici, hdfc, sbi';
    var now    = new Date();
    var col    = MONTH_COL[now.getMonth()];
    var fyName = getFYSheetName(now.getMonth(), now.getFullYear());
    var ss     = SpreadsheetApp.openById(SHEET_ID);
    var fy     = ss.getSheetByName(fyName);
    if (!fy) return '⚠️ Sheet ' + fyName + ' not found. Run /newfy.';
    fy.getRange(col + rowNum).setValue(amount);
    return '✅ ' + bank.toUpperCase() + ' balance: ₹' + fmt(amount) + ' — ' + monthName(now.getMonth());
  } catch(err) { return '⚠️ ' + err.message; }
}

function cmdCats() {
  try {
    var cats   = getMasterCategories();
    var needs  = [], wants = [], invests = [];
    cats.forEach(function(c) {
      if (c.type === 'Need')       needs.push(c.category);
      else if (c.type === 'Want')  wants.push(c.category);
      else                         invests.push(c.category);
    });
    return (
      '📋 Categories\n\n' +
      '🔴 Need (' + needs.length + '):\n'         + needs.join(', ')   + '\n\n' +
      '🟡 Want (' + wants.length + '):\n'         + wants.join(', ')   + '\n\n' +
      '🟢 Investment (' + invests.length + '):\n' + invests.join(', ')
    );
  } catch(err) { return '⚠️ ' + err.message; }
}

function cmdAddCat(text) {
  try {
    var parts = text.trim().split(/\s+/);
    if (parts.length < 3) return '❓ Usage: /addcat CategoryName Type\nType: Need, Want, Investment\n\nExamples:\n/addcat Gym Need\n/addcat Subscriptions Want';

    var type    = cap(parts[parts.length - 1]);
    var catName = parts.slice(1, parts.length - 1).join(' ');
    if (!['Need','Want','Investment'].includes(type)) return '❓ Type must be: Need, Want, or Investment';

    var ss     = SpreadsheetApp.openById(SHEET_ID);
    var master = ss.getSheetByName('MASTER');
    if (!master) return '⚠️ MASTER sheet not found. Run /setup first.';

    var existing = getMasterCategories();
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].category.toLowerCase() === catName.toLowerCase()) return '⚠️ "' + catName + '" already exists.';
    }

    var data    = master.getDataRange().getValues();
    var lastRow = 1;
    for (var j = 1; j < data.length; j++) {
      if (data[j][2] && data[j][2].toString() === type) lastRow = j + 1;
    }

    master.insertRowAfter(lastRow);
    master.getRange(lastRow + 1, 1, 1, 3).setValues([[type, catName, type]]);
    var colors = {Need:'#e8f5e9', Want:'#fff3e0', Investment:'#e3f2fd'};
    master.getRange(lastRow + 1, 1, 1, 3).setBackground(colors[type]);

    try { CacheService.getScriptCache().remove(CACHE_KEY); } catch(e) {}

    return '✅ Added "' + catName + '" (' + type + ') to MASTER\n\nNote: add a row to your FY sheet manually for rollup to include it in the right section.';
  } catch(err) { return '⚠️ ' + err.message; }
}

function cmdSearch(text) {
  try {
    var parts   = text.trim().split(/\s+/);
    if (parts.length < 2) return '❓ Usage: /search uber';
    var keyword = parts.slice(1).join(' ').toLowerCase();
    var ss      = SpreadsheetApp.openById(SHEET_ID);
    var sheet   = ss.getSheetByName('Transactions');
    if (!sheet) return '⚠️ No Transactions sheet.';
    var data    = sheet.getDataRange().getValues();
    var now     = new Date();
    var lines   = [];
    var total   = 0;

    for (var i = 1; i < data.length; i++) {
      var d = strToDate(dateToStr(data[i][0]));
      if (!d || d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
      var raw = (data[i][5] || '').toString().toLowerCase();
      var cat = (data[i][3] || '').toString().toLowerCase();
      if (raw.includes(keyword) || cat.includes(keyword)) {
        var amt = parseFloat(data[i][2]) || 0;
        lines.push('• ' + data[i][0] + ' ₹' + fmt(amt) + ' — ' + data[i][3]);
        total += amt;
      }
    }

    if (!lines.length) return '📭 No results for "' + keyword + '" this month.';
    return '🔍 "' + keyword + '" — ' + monthName(now.getMonth()) + '\n\n' +
      lines.join('\n') + '\n─────────────\n💸 Total: ₹' + fmt(total);
  } catch(err) { return '⚠️ ' + err.message; }
}

function cmdDeleteLast() {
  try {
    var ss      = SpreadsheetApp.openById(SHEET_ID);
    var sheet   = ss.getSheetByName('Transactions');
    if (!sheet) return '⚠️ No Transactions sheet.';
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return '📭 No expenses to delete.';
    var data    = sheet.getRange(lastRow, 1, 1, 6).getValues()[0];
    sheet.deleteRow(lastRow);
    return '🗑 Deleted: ₹' + fmt(data[2]) + ' — ' + data[3] + ' on ' + data[0];
  } catch(err) { return '⚠️ ' + err.message; }
}


// ============================================================
//  FY SHEET MANAGEMENT
// ============================================================

function getFYSheetName(mIdx, year) {
  var fyYear = mIdx >= FY_START_MONTH ? year : year - 1;
  return fyYear + '-' + (fyYear + 1);
}


function createFYSheet(fyName) {
  var ss       = SpreadsheetApp.openById(SHEET_ID);
  var existing = ss.getSheetByName(fyName);
  if (existing) return existing;

  var sheet  = ss.insertSheet(fyName);
  var cols   = ['C','D','E','F','G','H','I','J','K','L','M','N'];
  var months = ['April','May','June','July','August','September',
                'October','November','December','January','February','March'];

  // Row 1
  sheet.getRange('A1').setValue('Year ' + fyName);
  months.forEach(function(m,i) { sheet.getRange(1, i+3).setValue(m); });
  sheet.getRange('O1').setValue('Total');
  sheet.getRange('A2').setValue('Ignore Highlighted Cells');

  // Summary
  sheet.getRange('A4').setValue('Summary');
  [['B4','Income'],['B5','Deductions'],['B6','Tax'],['B7','Bonus'],['B8','In-hand']].forEach(function(r) {
    sheet.getRange(r[0]).setValue(r[1]);
  });
  cols.forEach(function(c) {
    sheet.getRange(c+'8').setFormula('=SUM('+c+'4,'+c+'7)-SUM('+c+'5:'+c+'6)');
  });
  [4,5,6,7,8].forEach(function(r) {
    sheet.getRange('O'+r).setFormula('=SUM(C'+r+':N'+r+')');
  });

  // 50-25-25 — fixed col B for % (correct formula)
  sheet.getRange('A11').setValue('50-25-25 RULE');
  sheet.getRange('B11').setValue('Allocations in %');
  sheet.getRange('A12').setValue('Need');       sheet.getRange('B12').setValue(50);
  sheet.getRange('A13').setValue('Wants');      sheet.getRange('B13').setValue(25);
  sheet.getRange('A14').setValue('Investment'); sheet.getRange('B14').setValue(25);
  cols.forEach(function(c) {
    sheet.getRange(c+'12').setFormula('='+c+'8*$B$12/100');
    sheet.getRange(c+'13').setFormula('='+c+'8*$B$13/100');
    sheet.getRange(c+'14').setFormula('='+c+'8*$B$14/100');
  });
  [12,13,14].forEach(function(r) { sheet.getRange('O'+r).setFormula('=SUM(C'+r+':N'+r+')'); });

  // Amount Used
  sheet.getRange('A17').setValue('Amount Used');
  sheet.getRange('B17').setValue('Need');
  sheet.getRange('B18').setValue('Wants');
  sheet.getRange('B19').setValue('Investment');
  cols.forEach(function(c) {
    sheet.getRange(c+'17').setFormula('='+c+'48');
    sheet.getRange(c+'18').setFormula('='+c+'62');
    sheet.getRange(c+'19').setFormula('='+c+'78');
  });
  [17,18,19].forEach(function(r) { sheet.getRange('O'+r).setFormula('=SUM(C'+r+':N'+r+')'); });

  // Total Savings — exact from ref: MINUS((alloc),(used))
  sheet.getRange('A22').setValue('Total Savings');
  sheet.getRange('B22').setValue('(Need & Wants)');
  cols.forEach(function(c) {
    sheet.getRange(c+'22').setFormula('=('+c+'12+'+c+'13)-('+c+'17+'+c+'18)');
  });
  sheet.getRange('O22').setFormula('=SUM(C22:N22)');

  // Bank balances
  sheet.getRange('A25').setValue('Closed Balance');
  sheet.getRange('B25').setValue('ICICI');
  sheet.getRange('B26').setValue('HDFC');
  sheet.getRange('B27').setValue('SBI');

  // CC Bill
  sheet.getRange('A30').setValue('CC Bill');
  sheet.getRange('B30').setValue('ICICI');
  sheet.getRange('B31').setValue('HDFC');
  sheet.getRange('B32').setValue('SBI');

  // ── Need section ───────────────────────────────────────────
  sheet.getRange('A33').setValue('Need');
  var needCats = ['Rent','Recharge','Healthcare','EMI','Insurance EMI',
    'Emergency Fund','Food','Electricity & bill','Saloon',
    'Fuel/Transportation','Home General','Other Need','Custom 1','Custom 2','Custom 3'];
  needCats.forEach(function(cat,i) {
    var r = 33+i;
    sheet.getRange('B'+r).setValue(cat);
    // O column = yearly total for this category ← WAS MISSING
    sheet.getRange('O'+r).setFormula('=SUM(C'+r+':N'+r+')');
  });
  sheet.getRange('B48').setValue('Total');
  cols.forEach(function(c) { sheet.getRange(c+'48').setFormula('=SUM('+c+'33:'+c+'47)'); });
  sheet.getRange('O48').setFormula('=SUM(C48:N48)');

  // ── Want section ───────────────────────────────────────────
  sheet.getRange('A51').setValue('Wants');
  var wantCats = ['Party/Dine-out','Movies','Vacations','Vehicle','Gadgets',
    'Gifts','Clothing','Other Want','Custom 1','Custom 2','Custom 3'];
  wantCats.forEach(function(cat,i) {
    var r = 51+i;
    sheet.getRange('B'+r).setValue(cat);
    // O column = yearly total ← WAS MISSING
    sheet.getRange('O'+r).setFormula('=SUM(C'+r+':N'+r+')');
  });
  sheet.getRange('B62').setValue('Total');
  cols.forEach(function(c) { sheet.getRange(c+'62').setFormula('=SUM('+c+'51:'+c+'61)'); });
  sheet.getRange('O62').setFormula('=SUM(C62:N62)');

  // ── Investment section ─────────────────────────────────────
  sheet.getRange('A65').setValue('Investment');
  var investCats = ['PPF','EPF','NPS','Mutual Fund','FD','Stocks','Gold',
    'Real Estate','Crypto','Other Investment','Custom 1','Custom 2','Custom 3'];
  investCats.forEach(function(cat,i) {
    var r = 65+i;
    sheet.getRange('B'+r).setValue(cat);
    // O column = yearly total ← WAS MISSING
    sheet.getRange('O'+r).setFormula('=SUM(C'+r+':N'+r+')');
  });
  sheet.getRange('B78').setValue('Total');
  cols.forEach(function(c) { sheet.getRange(c+'78').setFormula('=SUM('+c+'65:'+c+'77)'); });
  sheet.getRange('O78').setFormula('=SUM(C78:N78)');

  // Formatting
  sheet.getRange('A1:O1').setFontWeight('bold');
  ['A4:B8','A11:B14','A17:B19','A22:B22','A25:B27','A30:B32'].forEach(function(r) {
    sheet.getRange(r).setFontWeight('bold');
  });
  ['B48','B62','B78'].forEach(function(r) { sheet.getRange(r).setFontWeight('bold'); });
  sheet.getRange(33,1,16,15).setBackground('#e8f5e9');
  sheet.getRange(51,1,12,15).setBackground('#fff3e0');
  sheet.getRange(65,1,14,15).setBackground('#e3f2fd');
  sheet.getRange(4, 1, 5, 15).setBackground('#f3e5f5');

  Logger.log('Created FY sheet: ' + fyName);
  return sheet;
}


function cmdNewFY(silent) {
  try {
    var now    = new Date();
    var fyName = getFYSheetName(now.getMonth(), now.getFullYear());
    var ss     = SpreadsheetApp.openById(SHEET_ID);

    if (ss.getSheetByName(fyName)) {
      if (silent) return;
      return '📋 ' + fyName + ' already exists.';
    }

    createFYSheet(fyName);
    var msg = '📅 New FY sheet created: ' + fyName + '\n\nNext:\n• /setsalary 85000\n• Start logging\n• /rollup at month end';
    if (!silent) return msg;
    if (CHAT_ID !== 0) sendMessage(CHAT_ID, msg);
  } catch(err) {
    if (!silent) return '⚠️ ' + err.message;
    Logger.log('cmdNewFY: ' + err.message);
  }
}


function cmdSetup() {
  try {
    var ss      = SpreadsheetApp.openById(SHEET_ID);
    var created = [];

    if (!ss.getSheetByName('MASTER')) { buildMasterSheet(ss.insertSheet('MASTER')); created.push('MASTER'); }

    var tx = ss.getSheetByName('Transactions');
    if (!tx) {
      tx = ss.insertSheet('Transactions');
      tx.appendRow(['Date','Time','Amount','Category','Type','Raw Input']);
      tx.getRange(1,1,1,6).setFontWeight('bold');
      created.push('Transactions');
    }

    if (!ss.getSheetByName('CategoryMap')) {
      var cm = ss.insertSheet('CategoryMap');
      cm.appendRow(['Keyword','Category','Type','Added On']);
      cm.getRange(1,1,1,4).setFontWeight('bold');
      created.push('CategoryMap');
    }

    if (!ss.getSheetByName('Lending')) {
      var lend = ss.insertSheet('Lending');
      lend.appendRow(['Date','Time','Person','Type','Amount','Note','Running Balance']);
      lend.getRange(1,1,1,7).setFontWeight('bold');
      created.push('Lending');
    }

    var now    = new Date();
    var fyName = getFYSheetName(now.getMonth(), now.getFullYear());
    if (!ss.getSheetByName(fyName)) { createFYSheet(fyName); created.push(fyName); }

    return (
      '✅ Setup complete!\n\n' +
      (created.length ? 'Created: ' + created.join(', ') + '\n\n' : 'All sheets exist.\n\n') +
      'Next:\n1. /setsalary 85000\n2. Log: 250 food\n3. /rollup at month end'
    );
  } catch(err) { Logger.log('Setup: ' + err.message); return '⚠️ ' + err.message; }
}


function buildMasterSheet(sheet) {
  sheet.appendRow(['Section','Category','Type']);
  sheet.getRange(1,1,1,3).setFontWeight('bold');
  var cats = [
    ['Need','Rent','Need'],['Need','Recharge','Need'],['Need','Healthcare','Need'],
    ['Need','EMI','Need'],['Need','Insurance EMI','Need'],['Need','Emergency Fund','Need'],
    ['Need','Food','Need'],['Need','Electricity & bill','Need'],['Need','Saloon','Need'],
    ['Need','Fuel/Transportation','Need'],['Need','Home General','Need'],['Need','Other Need','Need'],
    ['Want','Party/Dine-out','Want'],['Want','Movies','Want'],['Want','Vacations','Want'],
    ['Want','Vehicle','Want'],['Want','Gadgets','Want'],['Want','Gifts','Want'],
    ['Want','Clothing','Want'],['Want','Other Want','Want'],
    ['Investment','PPF','Investment'],['Investment','EPF','Investment'],
    ['Investment','NPS','Investment'],['Investment','Mutual Fund','Investment'],
    ['Investment','FD','Investment'],['Investment','Stocks','Investment'],
    ['Investment','Gold','Investment'],['Investment','Real Estate','Investment'],
    ['Investment','Crypto','Investment'],['Investment','Other Investment','Investment']
  ];
  cats.forEach(function(row) { sheet.appendRow(row); });
  sheet.getRange(2, 1,12,3).setBackground('#e8f5e9');
  sheet.getRange(14,1, 8,3).setBackground('#fff3e0');
  sheet.getRange(22,1,10,3).setBackground('#e3f2fd');
}


// ============================================================
//  MASTER CATEGORY HELPERS — cached for speed
// ============================================================

function getMasterCategories() {
  try {
    var cached = CacheService.getScriptCache().get(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch(e) {}

  try {
    var ss     = SpreadsheetApp.openById(SHEET_ID);
    var master = ss.getSheetByName('MASTER');
    if (!master) return getDefaultCategories();
    var data   = master.getDataRange().getValues();
    var cats   = [];
    for (var i = 1; i < data.length; i++) {
      if (data[i][1] && data[i][2]) cats.push({ category: data[i][1].toString().trim(), type: data[i][2].toString().trim() });
    }
    var result = cats.length ? cats : getDefaultCategories();
    try { CacheService.getScriptCache().put(CACHE_KEY, JSON.stringify(result), 3600); } catch(e) {}
    return result;
  } catch(err) { return getDefaultCategories(); }
}

function getMasterCategoryMap() {
  var map = {};
  getMasterCategories().forEach(function(c) { map[normalise(c.category)] = c; });
  return map;
}

function getDefaultCategories() {
  return [
    {category:'Food',type:'Need'},{category:'Rent',type:'Need'},
    {category:'Recharge',type:'Need'},{category:'Healthcare',type:'Need'},
    {category:'EMI',type:'Need'},{category:'Insurance EMI',type:'Need'},
    {category:'Emergency Fund',type:'Need'},{category:'Electricity & bill',type:'Need'},
    {category:'Saloon',type:'Need'},{category:'Fuel/Transportation',type:'Need'},
    {category:'Home General',type:'Need'},{category:'Other Need',type:'Need'},
    {category:'Party/Dine-out',type:'Want'},{category:'Movies',type:'Want'},
    {category:'Vacations',type:'Want'},{category:'Vehicle',type:'Want'},
    {category:'Gadgets',type:'Want'},{category:'Gifts',type:'Want'},
    {category:'Clothing',type:'Want'},{category:'Other Want',type:'Want'},
    {category:'Mutual Fund',type:'Investment'},{category:'PPF',type:'Investment'},
    {category:'EPF',type:'Investment'},{category:'NPS',type:'Investment'},
    {category:'FD',type:'Investment'},{category:'Stocks',type:'Investment'},
    {category:'Gold',type:'Investment'},{category:'Real Estate',type:'Investment'},
    {category:'Crypto',type:'Investment'},{category:'Other Investment',type:'Investment'}
  ];
}


// ============================================================
//  CATEGORY MAP HELPERS
// ============================================================

function getCustomCategoryMap() {
  try {
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('CategoryMap');
    if (!sheet) return {};
    var data  = sheet.getDataRange().getValues();
    var map   = {};
    for (var i = 1; i < data.length; i++) {
      if (data[i][0]) map[normalise(data[i][0])] = { category: data[i][1], type: data[i][2] };
    }
    return map;
  } catch(e) { return {}; }
}

function matchCustomMap(rawCat, customMap) {
  var key = normalise(rawCat);
  if (customMap[key]) return customMap[key];
  var words = key.split(/\s+/);
  for (var i = 0; i < words.length; i++) {
    if (words[i].length > 2 && customMap[words[i]]) return customMap[words[i]];
  }
  return null;
}

function saveCustomMapping(keyword, category, type) {
  try {
    var ss    = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('CategoryMap');
    if (!sheet) {
      sheet = ss.insertSheet('CategoryMap');
      sheet.appendRow(['Keyword','Category','Type','Added On']);
      sheet.getRange(1,1,1,4).setFontWeight('bold');
    }
    sheet.appendRow([normalise(keyword), category, type, nowDate()]);
  } catch(e) { Logger.log('saveCustomMapping: ' + e.message); }
}


// ============================================================
//  SHARED HELPERS
// ============================================================

function getMonthRows(mIdx, year) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Transactions');
  if (!sheet) return [];
  var data  = sheet.getDataRange().getValues();
  var rows  = [];
  for (var i = 1; i < data.length; i++) {
    var d = strToDate(dateToStr(data[i][0]));
    if (d && d.getMonth() === mIdx && d.getFullYear() === year) {
      rows.push({
        amount:   parseFloat(data[i][2]) || 0,
        category: data[i][3] ? data[i][3].toString().trim() : '',
        type:     data[i][4] ? data[i][4].toString().trim() : 'Need'
      });
    }
  }
  return rows;
}

function sumByType(rows) {
  var t = {Need:0,Want:0,Investment:0,Total:0};
  rows.forEach(function(r) { if (t[r.type] !== undefined) t[r.type] += r.amount; t.Total += r.amount; });
  for (var k in t) t[k] = Math.round(t[k]);
  return t;
}

function formatTotals(label, totals) {
  return (
    '📊 ' + label + '\n\n' +
    '🔴 Need: ₹'       + fmt(totals.Need)       + '\n' +
    '🟡 Want: ₹'       + fmt(totals.Want)       + '\n' +
    '🟢 Investment: ₹' + fmt(totals.Investment) + '\n' +
    '─────────────\n'  +
    '💸 Total: ₹'      + fmt(totals.Total)
  );
}

/**
 * Converts any date value from getValues() to dd-MMM-yyyy string.
 *
 * Handles all 4 cases Google Sheets can return:
 * 1. Proper Date object (date-formatted cell)
 * 2. Date object with year < 1970 (Sheets serial misread as Date)
 * 3. Plain number (Sheets serial, e.g. 46127) — most common cause of 1899 bug
 * 4. String — already formatted or ISO format
 */
function dateToStr(val) {
  if (!val && val !== 0) return '';

  // Case 3 — plain number (Sheets serial date)
  // Most common cause of the 1899 bug
  // Sheets epoch = 30-Dec-1899, so serial 46127 = 15-Apr-2026
  if (typeof val === 'number') {
    var sheetsEpoch = new Date(1899, 11, 30); // 30-Dec-1899
    var realDate    = new Date(sheetsEpoch.getTime() + val * 86400000);
    return Utilities.formatDate(realDate, 'Asia/Kolkata', 'dd-MMM-yyyy');
  }

  // Case 1 & 2 — Date object
  if (val instanceof Date) {
    // Case 2 — year looks wrong (serial misread as Date by Apps Script)
    if (val.getFullYear() < 1970) {
      // Convert using Sheets epoch math
      var sheetsEpoch2 = new Date(1899, 11, 30);
      var diffDays     = Math.round((val.getTime() - sheetsEpoch2.getTime()) / 86400000);
      var realDate2    = new Date(sheetsEpoch2.getTime() + diffDays * 86400000);
      return Utilities.formatDate(realDate2, 'Asia/Kolkata', 'dd-MMM-yyyy');
    }
    // Case 1 — normal Date object
    return Utilities.formatDate(val, 'Asia/Kolkata', 'dd-MMM-yyyy');
  }

  // Case 4 — string
  var s = val.toString().trim();

  // Already in dd-MMM-yyyy format
  if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(s)) return s;

  // ISO or other parseable format
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, 'Asia/Kolkata', 'dd-MMM-yyyy');
  }

  return s; // return as-is if nothing works
}

function strToDate(str) {
  if (!str) return null;
  var mm = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  var parts = str.split('-');
  if (parts.length === 3) {
    var dd = parseInt(parts[0]);
    var mo = mm[parts[1].toLowerCase().substring(0,3)];
    var yy = parseInt(parts[2]);
    if (!isNaN(dd) && mo !== undefined && !isNaN(yy)) return new Date(yy, mo, dd);
  }
  var d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function normalise(str) { return str.toString().toLowerCase().trim().replace(/\s+/g,' '); }
function nowDate()      { return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM-yyyy'); }
function nowTime()      { return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'HH:mm'); }
function nowIST()       { return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM-yyyy HH:mm'); }
function yesterdayDate(){ var d = new Date(); d.setDate(d.getDate()-1); return Utilities.formatDate(d,'Asia/Kolkata','dd-MMM-yyyy'); }
function fmt(num)       { return Math.round(num).toLocaleString('en-IN'); }
function cap(str)       { return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : ''; }
function monthName(idx) {
  return ['January','February','March','April','May','June',
          'July','August','September','October','November','December'][idx];
}
function parseMonthStr(str) {
  var map = {jan:0,january:0,feb:1,february:1,mar:2,march:2,apr:3,april:3,may:4,
             jun:5,june:5,jul:6,july:6,aug:7,august:7,sep:8,september:8,oct:9,october:9,
             nov:10,november:10,dec:11,december:11};
  return map[str.toLowerCase()] !== undefined ? map[str.toLowerCase()] : -1;
}

function sendMessage(chatId, text) {
  UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + TOKEN + '/sendMessage',
    { method:'post', contentType:'application/json', muteHttpExceptions:true,
      payload: JSON.stringify({chat_id:chatId, text:text}) }
  );
}

function helpText() {
  return (
    '🤖 Expense Tracker Bot\n\n' +
    '💸 Log:\n250 food\n800 lunch with team\n250 food on 10 apr\n500 uber yesterday\n\n' +
    '📊 View:\n/total  /today  /week\n/summary  /report\n/month april\n/search uber\n\n' +
    '📋 Rollup:\n/rollup  /rollup april  /rollup april 2025\n\n' +
    '🔁 Recurring:\n/addrec rent 12000\n/recurring  /delrec 1\n\n' +
    '💰 Salary & CC:\n/setsalary 85000  /salary\n/cc icici 5000\n/bal icici 45000\n\n' +
    '🏷 Categories:\n/cats  /addcat Gym Need\n\n' +
    '🤝 Lending:\n/lend rahul credit 500\n/lend rahul debit 500\n/lend rahul paid 500\n/lend rahul settled\n/lends  /lends rahul\n\n' +
    '🗑 Undo:\n/delete\n\n' +
    '⚙️ Setup:\n/setup  /newfy  /ping'
  );
}


// ============================================================
//  TRIGGERS
// ============================================================

/**
 * Runs daily at 7 AM IST.
 * April 1  → create new FY sheet + notify
 * 1st      → auto-rollup previous month + log recurring expenses
 * 2nd      → send monthly AI digest
 * Sunday   → handled by weeklyDigestTrigger
 */
function dailyTrigger() {
  var now  = new Date();
  var date = now.getDate();
  var mon  = now.getMonth();
  var day  = now.getDay(); // 0=Sun

  // April 1st — new financial year
  if (mon === FY_START_MONTH && date === 1) {
    cmdNewFY(true);
  }

  // 1st of every month — auto-rollup previous month + log recurring
  if (date === 1) {
    // Rollup previous month automatically
    var prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    var prevMonth = monthName(prev.getMonth()).toLowerCase().slice(0,3);
    var prevYear  = prev.getFullYear();

    try {
      var rollupResult = cmdRollup('/rollup ' + prevMonth + ' ' + prevYear);
      if (CHAT_ID !== 0) sendMessage(CHAT_ID, '📊 Auto-rollup:\n' + rollupResult);
    } catch(e) { Logger.log('Auto-rollup error: ' + e.message); }

    // Log recurring expenses
    logRecurringExpenses();
  }

  // 2nd of every month — monthly digest
  if (date === 2) {
    sendMonthlyDigest();
  }
}


/**
 * Separate trigger for weekly digest — runs every Sunday.
 */
function weeklyDigestTrigger() {
  var now = new Date();
  if (now.getDay() === 0) { // Sunday
    sendWeeklyDigest();
  }
}


function createTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });

  // Poll Telegram every minute
  ScriptApp.newTrigger('pollTelegram').timeBased().everyMinutes(1).create();

  // Daily trigger at 7 AM for rollup, recurring, monthly digest, new FY
  ScriptApp.newTrigger('dailyTrigger').timeBased().everyDays(1).atHour(7).create();

  // Weekly digest — runs daily but only fires on Sunday
  ScriptApp.newTrigger('weeklyDigestTrigger').timeBased().everyDays(1).atHour(9).create();

  Logger.log('✅ 3 triggers created:');
  Logger.log('  pollTelegram      → every 1 min');
  Logger.log('  dailyTrigger      → daily 7 AM (rollup on 1st, digest on 2nd, FY on 1 Apr)');
  Logger.log('  weeklyDigestTrigger → daily 9 AM (fires Sunday only)');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
  Logger.log('✅ All triggers removed');
}

function resetOffset() {
  PropertiesService.getScriptProperties().setProperty('offset','0');
  Logger.log('✅ Offset reset');
}

function checkTriggers() {
  var t = ScriptApp.getProjectTriggers();
  Logger.log('Active: ' + t.length);
  t.forEach(function(tr) { Logger.log('• ' + tr.getHandlerFunction()); });
}
