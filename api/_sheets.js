// api/_sheets.js v6
// ─────────────────────────────────────────────────────────────
//  Shared helper: Google Sheets client + utilities
//
//  [แก้ไข v6] ลบ generateUserID ที่ใช้ counter จาก Sheets ออก
//  เพราะมีปัญหา Race Condition ใน Serverless (Vercel)
//  ย้าย generateUserID และ generateTicketId ไปอยู่ใน submit.js แทน
//  โดยใช้ crypto.randomUUID() ที่ไม่ต้องพึ่ง Sheets เลย
//
//  โครงสร้าง VOC_Tickets — 18 columns:
//  A: UUID              B: Ticket ID        C: Username
//  D: วันที่แจ้ง        E: ประเภทผู้แจ้ง    F: ชื่อ
//  G: นักศึกษา/หน่วยงาน H: ประเภทเรื่อง    I: ความเร่งด่วน
//  J: หัวข้อ            K: รายละเอียด      L: หมายเหตุ(ผู้ใช้)
//  M: สถานะ             N: ผู้รับผิดชอบ     O: กำหนดตอบกลับ
//  P: Comments          Q: Pinned           R: ไฟล์แนบ
// ─────────────────────────────────────────────────────────────

const { google } = require('googleapis');
const crypto = require('crypto');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID ||
  '1XPFDbXV23vwtJ_Ikg-dxzQKKZGDpLiEgGTTV_9Uxohw';

const SHEET_TICKETS  = 'VOC_Tickets';
const SHEET_USERS    = 'VOC_Users';
const SHEET_COUNTERS = 'VOC_Counters';
const SHEET_ADMINS   = 'VOC_Admins';

// headers ตาม column order ของ Sheet จริง
function getTicketHeaders() {
  return [
    'UUID',                    // A col1
    'Ticket ID',               // B col2
    'Username',                // C col3
    'วันที่แจ้ง',              // D col4
    'ประเภทผู้แจ้ง',           // E col5
    'ชื่อ',                    // F col6
    'นักศึกษา/หน่วยงาน',      // G col7  (ชื่อตรงกับ sheet header)
    'ประเภทเรื่อง',            // H col8
    'ความเร่งด่วน',            // I col9
    'หัวข้อ',                  // J col10
    'รายละเอียด',              // K col11
    'หมายเหตุ(ผู้ใช้)',        // L col12  (ชื่อตรงกับ sheet header)
    'สถานะ',                   // M col13
    'ผู้รับผิดชอบ',            // N col14
    'กำหนดตอบกลับ',           // O col15
    'Comments',                // P col16
    'Pinned',                  // Q col17
    'ไฟล์แนบ',                 // R col18  (ชื่อตรงกับ sheet header)
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
