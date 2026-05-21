// api/_sheets.js
// ─────────────────────────────────────────────────────────────
//  Shared helper: เปิด Google Sheets ด้วย Service Account
//
//  ตั้ง Environment Variables ใน Vercel Dashboard:
//    GOOGLE_SERVICE_ACCOUNT_EMAIL  = your-sa@project.iam.gserviceaccount.com
//    GOOGLE_PRIVATE_KEY            = -----BEGIN PRIVATE KEY-----\n...
//    SPREADSHEET_ID                = 1XPFDbXV23vwtJ_Ikg-dxzQKKZGDpLiEgGTTV_9Uxohw
// ─────────────────────────────────────────────────────────────

const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID ||
  '1XPFDbXV23vwtJ_Ikg-dxzQKKZGDpLiEgGTTV_9Uxohw';

const SHEET_TICKETS  = 'VOC_Tickets';
const SHEET_USERS    = 'VOC_Users';
const SHEET_COUNTERS = 'VOC_Counters';
const SHEET_ADMINS   = 'VOC_Admins';

// ── สร้าง authenticated Sheets client ──
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // Vercel env ต้องแทน \n ด้วย newline จริง
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ── อ่านข้อมูลทั้ง sheet ──
async function getSheetData(sheets, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
  });
  return res.data.values || [];
}

// ── เพิ่มแถวใหม่ ──
async function appendRow(sheets, sheetName, values) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

// ── อัปเดตเซลล์เดียว (rowIndex คือ 1-based) ──
async function updateCell(sheets, sheetName, row, col, value) {
  const colLetter = String.fromCharCode(64 + col); // 1=A, 2=B, ...
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!${colLetter}${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  });
}

// ── Hash password (SHA-256 ใน Node.js) ──
const crypto = require('crypto');
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ── คำนวณ Due Date ──
function calcDueDate(fromDate, priority) {
  const d = new Date(fromDate);
  if      (priority === 'high')   d.setHours(d.getHours() + 24);
  else if (priority === 'medium') d.setDate(d.getDate() + 3);
  else                            d.setDate(d.getDate() + 7);
  return d.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' });
}

// ── Format วันที่ไทย ──
function formatDateThai(date) {
  return new Date(date).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── CORS headers สำหรับ API routes ──
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = {
  SPREADSHEET_ID, SHEET_TICKETS, SHEET_USERS, SHEET_COUNTERS, SHEET_ADMINS,
  getSheetsClient, getSheetData, appendRow, updateCell,
  hashPassword, calcDueDate, formatDateThai, setCorsHeaders,
};
