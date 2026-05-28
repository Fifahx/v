// api/_sheets.js v7
// ─────────────────────────────────────────────────────────────
//  Shared helper: Google Sheets client + utilities
//
//  [แก้ไข v7] ปรับ getTicketHeaders() ให้ชื่อ header ตรงกับ
//  ที่ frontend (app.js) ใช้ดึงข้อมูลทุกจุด เพื่อป้องกัน
//  key mismatch ที่ทำให้ Comments / หมายเหตุ / FileURL ไม่แสดง
//
//  โครงสร้าง VOC_Tickets — 18 columns:
//  A: UserID        B: Ticket ID      C: Username
//  D: วันที่แจ้ง   E: ประเภทผู้แจ้ง  F: ชื่อ
//  G: รหัส          H: ประเภทเรื่อง  I: ความเร่งด่วน
//  J: หัวข้อ        K: รายละเอียด    L: หมายเหตุผู้ใช้
//  M: สถานะ         N: ผู้รับผิดชอบ  O: กำหนดตอบกลับ
//  P: Comments      Q: Pinned         R: FileURL
// ─────────────────────────────────────────────────────────────

const { google } = require('googleapis');
const crypto = require('crypto');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID ||
  '1XPFDbXV23vwtJ_Ikg-dxzQKKZGDpLiEgGTTV_9Uxohw';

const SHEET_TICKETS  = 'VOC_Tickets';
const SHEET_USERS    = 'VOC_Users';
const SHEET_COUNTERS = 'VOC_Counters';
const SHEET_ADMINS   = 'VOC_Admins';

// headers — ชื่อต้องตรงกับที่ frontend (app.js) ใช้ t['...'] ดึงข้อมูล
// ห้ามเปลี่ยนชื่อตาม Sheet header เพราะ rowToObj() จะส่ง key นี้ให้ frontend
function getTicketHeaders() {
  return [
    'UserID',          // A col1  — frontend ใช้ t['UserID']
    'Ticket ID',       // B col2  — frontend ใช้ t['Ticket ID']
    'Username',        // C col3  — frontend ใช้ t['Username']
    'วันที่แจ้ง',      // D col4
    'ประเภทผู้แจ้ง',   // E col5
    'ชื่อ',            // F col6
    'รหัส',            // G col7  — (นักศึกษา/หน่วยงาน)
    'ประเภทเรื่อง',    // H col8
    'ความเร่งด่วน',    // I col9
    'หัวข้อ',          // J col10
    'รายละเอียด',      // K col11
    'หมายเหตุผู้ใช้',  // L col12 — frontend ใช้ t['หมายเหตุผู้ใช้']
    'สถานะ',           // M col13
    'ผู้รับผิดชอบ',    // N col14
    'กำหนดตอบกลับ',   // O col15
    'Comments',        // P col16 — frontend ใช้ t['Comments']
    'Pinned',          // Q col17 — frontend ใช้ t['Pinned']
    'FileURL',         // R col18 — frontend ใช้ t['FileURL']
  ];
}

// ── สร้าง authenticated Sheets client ──
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

// ── อ่านข้อมูลทั้ง sheet ──
async function getSheetData(sheets, sheetName) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: sheetName,
    });
    return res.data.values || [];
  } catch (e) {
    return [];
  }
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

// ── อัปเดตหลาย cell พร้อมกัน ──
async function batchUpdate(sheets, updates) {
  const data = updates.map(u => ({
    range: u.range,
    values: [[u.value]],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: 'RAW', data },
  });
}

// ── Hash password (SHA-256) ──
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ── คำนวณ Due Date ──
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

// ── Format วันที่ไทย ──
function formatDateThai(date) {
  return new Date(date).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── CORS headers ──
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = {
  SPREADSHEET_ID,
  SHEET_TICKETS, SHEET_USERS, SHEET_COUNTERS, SHEET_ADMINS,
  getTicketHeaders,
  getSheetsClient, getSheetData, appendRow, batchUpdate,
  hashPassword, calcDueDate, formatDateThai, setCorsHeaders,
};
