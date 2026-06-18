// api/_sheets.js v8
// ─────────────────────────────────────────────────────────────
//  [แก้ไข v8] เพิ่ม Resilience & Error Handling
//
//  1. withRetry() — Exponential Backoff wrapper
//     ครอบทุก Google Sheets API call อัตโนมัติ
//     - retry สูงสุด MAX_RETRIES ครั้ง
//     - รอ 1s → 2s → 4s → 8s (exponential) + random jitter
//     - retry เฉพาะ 429 (Rate Limit) และ 5xx (Server Error)
//     - ไม่ retry 4xx อื่น (400, 403, 404) เพราะ retry ไม่ช่วย
//
//  2. alertDiscord() — Discord Webhook alert
//     แจ้งเตือนทันทีเมื่อเกิด 429 หรือ 500+ บน Google API
//     ตั้งค่าผ่าน Environment Variable: DISCORD_WEBHOOK_URL
//     (ถ้าไม่ตั้งค่า → ข้ามการแจ้งเตือน ไม่ error)
//
//  วิธีตั้งค่า Discord Webhook:
//    1. Discord Server → Settings → Integrations → Webhooks
//    2. "New Webhook" → ตั้งชื่อ เช่น "VOC Alert Bot"
//    3. Copy Webhook URL
//    4. Vercel Dashboard → Settings → Environment Variables
//       ชื่อ: DISCORD_WEBHOOK_URL
//       ค่า:  https://discord.com/api/webhooks/xxx/yyy
// ─────────────────────────────────────────────────────────────

const { google } = require('googleapis');
const crypto     = require('crypto');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID ||
  '1RXSA6H4brWbg1xefa73KG0JmHDJZtIBZWa_txYg2lTY';

const SHEET_TICKETS  = 'VOC_Tickets';
const SHEET_USERS    = 'VOC_Users';
const SHEET_COUNTERS = 'VOC_Counters';
const SHEET_ADMINS   = 'VOC_Admins';

// ═══════════════════════════════════════════════════
//  DISCORD WEBHOOK ALERT
// ═══════════════════════════════════════════════════
// ป้องกัน spam: ส่งแจ้งเตือนซ้ำได้ทุก ALERT_COOLDOWN_MS เท่านั้น
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 นาที
const _alertSent = new Map(); // key → timestamp ที่ส่งล่าสุด

async function alertDiscord(statusCode, operation, errorMessage) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return; // ไม่ได้ตั้งค่า → ข้ามไป

  // Cooldown: ป้องกัน alert flood ใน 5 นาที
  const key = `${statusCode}:${operation}`;
  const lastSent = _alertSent.get(key) || 0;
  if (Date.now() - lastSent < ALERT_COOLDOWN_MS) return;
  _alertSent.set(key, Date.now());

  const isRateLimit = statusCode === 429;
  const emoji       = isRateLimit ? '⚠️' : '🔴';
  const color       = isRateLimit ? 16776960 : 15158332; // Yellow / Red (Discord embed color)
  const title       = isRateLimit
    ? '⚠️ Google Sheets Rate Limit (429)'
    : `🔴 Google Sheets Server Error (${statusCode})`;
  const description = isRateLimit
    ? 'API ถูก Rate Limit — ระบบกำลัง Retry ด้วย Exponential Backoff อัตโนมัติ'
    : 'Google Sheets API ตอบกลับด้วย Server Error — กรุณาตรวจสอบ Vercel Logs';

  const now = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const payload = {
    username: 'VOC Alert Bot',
    avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
    embeds: [{
      title,
      description,
      color,
      fields: [
        { name: '📋 Operation',    value: `\`${operation}\``,   inline: true  },
        { name: '🔢 Status Code',  value: `\`${statusCode}\``,  inline: true  },
        { name: '⏰ เวลา',         value: now,                   inline: false },
        { name: '❌ Error',        value: `\`\`\`${String(errorMessage).slice(0, 500)}\`\`\``, inline: false },
        { name: '🔗 Vercel Logs',  value: '[เปิด Dashboard](https://vercel.com/dashboard)', inline: false },
      ],
      footer: { text: 'VOC System | คณะวิทยาศาสตร์ฯ มรย.' },
    }],
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // ถ้า Discord ล่ม → log เฉยๆ ไม่ throw เพราะไม่ควรทำให้ main flow พัง
    console.error('[Discord Alert] Failed to send:', e.message);
  }
}

// ═══════════════════════════════════════════════════
//  EXPONENTIAL BACKOFF RETRY WRAPPER
// ═══════════════════════════════════════════════════
const MAX_RETRIES   = 4;    // retry สูงสุด 4 ครั้ง (รวม attempt แรก = 5 ครั้ง)
const BASE_DELAY_MS = 1000; // delay เริ่มต้น 1 วินาที
const MAX_DELAY_MS  = 16000; // delay สูงสุด 16 วินาที

// ดึง status code จาก Google API error object
function _extractStatus(err) {
  return (
    err?.response?.status ||
    err?.code ||
    (typeof err?.status === 'number' ? err.status : null)
  );
}

// ตัดสินใจว่าควร retry หรือไม่
function _shouldRetry(status) {
  if (status === 429) return true;          // Rate Limit — retry เสมอ
  if (status >= 500 && status < 600) return true; // Server Error — retry
  return false;                             // 4xx อื่น — ไม่ retry
}

/**
 * withRetry(fn, operationName)
 * ─────────────────────────────
 * ครอบ async function ให้ retry อัตโนมัติด้วย Exponential Backoff
 *
 * @param {() => Promise<any>} fn            - async function ที่จะ retry
 * @param {string}             operationName - ชื่อ operation สำหรับ log และ alert
 * @returns {Promise<any>}
 *
 * @example
 * const data = await withRetry(
 *   () => sheets.spreadsheets.values.get({ ... }),
 *   'getSheetData:VOC_Tickets'
 * );
 */
async function withRetry(fn, operationName = 'sheets_api') {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = _extractStatus(err);

      // ── บันทึก log ทุก error ──
      console.error(
        `[Sheets] ${operationName} failed` +
        ` (attempt ${attempt + 1}/${MAX_RETRIES + 1})` +
        ` status=${status || 'unknown'}:`,
        err.message
      );

      // ── ส่ง Discord alert สำหรับ 429 และ 5xx ──
      if (status === 429 || (status >= 500 && status < 600)) {
        alertDiscord(status, operationName, err.message); // fire-and-forget
      }

      // ── ตัดสินใจ retry ──
      const isLastAttempt = attempt === MAX_RETRIES;
      if (isLastAttempt || !_shouldRetry(status)) {
        throw err; // หมด retry หรือ error ที่ไม่ควร retry → throw ออกไป
      }

      // ── คำนวณ delay: exponential backoff + jitter ──
      const exponential = BASE_DELAY_MS * Math.pow(2, attempt);
      const jitter      = Math.random() * 500; // สุ่ม 0–500ms เพื่อป้องกัน thundering herd
      const delay       = Math.min(exponential + jitter, MAX_DELAY_MS);

      console.log(
        `[Sheets] Retrying ${operationName} in ${Math.round(delay)}ms` +
        ` (status ${status})...`
      );

      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError; // safety net (ไม่ควรถึงจุดนี้)
}

// ═══════════════════════════════════════════════════
//  GOOGLE SHEETS CLIENT
// ═══════════════════════════════════════════════════
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ═══════════════════════════════════════════════════
//  SHEET OPERATIONS (ห่อด้วย withRetry ทั้งหมด)
// ═══════════════════════════════════════════════════

// ── อ่านข้อมูลทั้ง sheet ──
async function getSheetData(sheets, sheetName) {
  try {
    const res = await withRetry(
      () => sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: sheetName,
      }),
      `getSheetData:${sheetName}`
    );
    return res.data.values || [];
  } catch (e) {
    // คืน array ว่างเพื่อไม่ให้ caller crash
    // (caller จะได้ข้อมูลว่าง แต่ยังทำงานต่อได้)
    console.error(`[Sheets] getSheetData(${sheetName}) ultimately failed:`, e.message);
    return [];
  }
}

// ── เพิ่มแถวใหม่ ──
async function appendRow(sheets, sheetName, values) {
  await withRetry(
    () => sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: sheetName,
      valueInputOption: 'RAW',
      requestBody: { values: [values] },
    }),
    `appendRow:${sheetName}`
  );
}

// ── อัปเดตหลาย cell พร้อมกัน ──
async function batchUpdate(sheets, updates) {
  const data = updates.map(u => ({
    range: u.range,
    values: [[u.value]],
  }));
  await withRetry(
    () => sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { valueInputOption: 'RAW', data },
    }),
    `batchUpdate(${updates.map(u => u.range).join(', ')})`
  );
}

// ═══════════════════════════════════════════════════
//  TICKET HEADERS
// ═══════════════════════════════════════════════════
function getTicketHeaders() {
  return [
    'UserID',          // A col1
    'Ticket ID',       // B col2
    'Username',        // C col3
    'วันที่แจ้ง',      // D col4
    'ประเภทผู้แจ้ง',   // E col5
    'ชื่อ',            // F col6
    'รหัส',            // G col7
    'ประเภทเรื่อง',    // H col8
    'ความเร่งด่วน',    // I col9
    'หัวข้อ',          // J col10
    'รายละเอียด',      // K col11
    'หมายเหตุผู้ใช้',  // L col12
    'สถานะ',           // M col13
    'ผู้รับผิดชอบ',    // N col14
    'กำหนดตอบกลับ',   // O col15
    'Comments',        // P col16
    'Pinned',          // Q col17
    'FileURL',         // R col18
  ];
}

// ═══════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ── AES-256-CBC encrypt/decrypt สำหรับรหัสผ่าน SuperAdmin ──
// key ดึงจาก AES_SECRET_KEY (env var) — ต้องยาว >= 32 ตัวอักษร
function getAesKey() {
  const raw = process.env.AES_SECRET_KEY || '';
  if (!raw) throw new Error('AES_SECRET_KEY is not set in environment variables');
  return crypto.createHash('sha256').update(raw).digest(); // 32 bytes
}

function encryptPassword(plainText) {
  const key = getAesKey();
  const iv  = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  // เก็บเป็น iv:ciphertext (hex) เพื่อให้อ่านใน sheet ง่าย
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptPassword(cipherText) {
  try {
    const [ivHex, encHex] = cipherText.split(':');
    if (!ivHex || !encHex) return null;
    const key       = getAesKey();
    const iv        = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher  = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

function calcDueDate(fromDate, priority) {
  const d = new Date(fromDate);
  if      (priority === 'high')   d.setHours(d.getHours() + 24);
  else if (priority === 'medium') d.setDate(d.getDate() + 3);
  else                            d.setDate(d.getDate() + 7);
  return d.toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function formatDateThai(date) {
  return new Date(date).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,PATCH,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ═══════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════
module.exports = {
  SPREADSHEET_ID,
  SHEET_TICKETS, SHEET_USERS, SHEET_COUNTERS, SHEET_ADMINS,
  getTicketHeaders,
  getSheetsClient, getSheetData, appendRow, batchUpdate,
  withRetry,      // export ไว้ให้ไฟล์อื่นใช้ครอบ API call โดยตรงได้
  alertDiscord,   // export ไว้ให้ alert เพิ่มเติมจากภายนอกได้
  hashPassword, encryptPassword, decryptPassword, calcDueDate, formatDateThai, setCorsHeaders,
};
