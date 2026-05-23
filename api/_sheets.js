// api/_sheets.js
// ─────────────────────────────────────────────────────────────
//  Shared helper: Google Sheets client + utilities
//
//  โครงสร้าง VOC_Tickets (ใหม่) — 15 columns:
//  col1  UserID                ← primary key (auto-increment, unique)
//  col2  Ticket ID             ← VOC-2568-XXXX
//  col3  Username              ← เชื่อมบัญชี
//  col4  วันที่แจ้ง
//  col5  ประเภทผู้แจ้ง
//  col6  ชื่อ
//  col7  รหัสนักศึกษา/หน่วยงาน
//  col8  ประเภทเรื่อง
//  col9  ความเร่งด่วน
//  col10 หัวข้อ
//  col11 รายละเอียด
//  col12 สถานะ
//  col13 ผู้รับผิดชอบ
//  col14 กำหนดตอบกลับ
//  col15 หมายเหตุ              ← เดิมชื่อ "ผลการพิจารณา/Feedback"
// ─────────────────────────────────────────────────────────────

const { google } = require('googleapis');
const crypto = require('crypto');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID ||
  '1XPFDbXV23vwtJ_Ikg-dxzQKKZGDpLiEgGTTV_9Uxohw';

const SHEET_TICKETS  = 'VOC_Tickets';
const SHEET_USERS    = 'VOC_Users';
const SHEET_COUNTERS = 'VOC_Counters';
const SHEET_ADMINS   = 'VOC_Admins';

// headers ใหม่ตามลำดับที่กำหนด
function getTicketHeaders() {
  return [
    'UserID',                      // col 1  ← primary key
    'Ticket ID',                   // col 2
    'Username',                    // col 3
    'วันที่แจ้ง',                  // col 4
    'ประเภทผู้แจ้ง',               // col 5
    'ชื่อ',                        // col 6
    'รหัสนักศึกษา/หน่วยงาน',      // col 7
    'ประเภทเรื่อง',                // col 8
    'ความเร่งด่วน',                // col 9
    'หัวข้อ',                      // col 10
    'รายละเอียด',                  // col 11
    'สถานะ',                       // col 12
    'ผู้รับผิดชอบ',                // col 13
    'กำหนดตอบกลับ',               // col 14
    'หมายเหตุ',                    // col 15
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

// ── อัปเดตหลาย cell พร้อมกัน (batchUpdate) ──
async function batchUpdate(sheets, updates) {
  // updates = [{ range: 'SheetName!A2', value: 'xxx' }, ...]
  const data = updates.map(u => ({
    range: u.range,
    values: [[u.value]],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data,
    },
  });
}

// ── สร้าง UserID ใหม่ (auto-increment, unique) ──
// เก็บ counter แยกใน VOC_Counters sheet คอลัมน์ "UserID_Counter"
async function generateUserID(sheets) {
  const data = await getSheetData(sheets, SHEET_COUNTERS);
  const headers = data[0] || [];

  // หา index ของ UserID_Counter
  let colIdx = headers.indexOf('UserID_Counter');

  if (colIdx === -1) {
    // เพิ่ม header ใหม่ถ้ายังไม่มี
    colIdx = headers.length;
    const colLetter = String.fromCharCode(65 + colIdx);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_COUNTERS}!${colLetter}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['UserID_Counter']] },
    });
    // เริ่มที่ 1
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_COUNTERS}!${colLetter}2`,
      valueInputOption: 'RAW',
      requestBody: { values: [[1]] },
    });
    return 1;
  }

  // อ่านค่าปัจจุบัน
  const colLetter = String.fromCharCode(65 + colIdx);
  const currentVal = data[1] ? Number(data[1][colIdx] || 0) : 0;
  const newVal = currentVal + 1;

  // อัปเดต counter
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_COUNTERS}!${colLetter}2`,
    valueInputOption: 'RAW',
    requestBody: { values: [[newVal]] },
  });

  return newVal;
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = {
  SPREADSHEET_ID,
  SHEET_TICKETS, SHEET_USERS, SHEET_COUNTERS, SHEET_ADMINS,
  getTicketHeaders,
  getSheetsClient, getSheetData, appendRow, batchUpdate,
  generateUserID, hashPassword, calcDueDate, formatDateThai, setCorsHeaders,
};
