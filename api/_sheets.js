// api/_sheets.js
// ─────────────────────────────────────────────────────────────
//  Shared helper: Google Sheets client + utilities
//
//  โครงสร้าง VOC_Tickets (ใหม่) — 18 columns:
//  col1  UserID                ← UUID (crypto.randomUUID)
//  col2  Ticket ID             ← VOC-2568-XXXXXXXX (UUID-based, ไม่ race condition)
//  col3  Username              ← เชื่อมบัญชี
//  col4  วันที่แจ้ง
//  col5  ประเภทผู้แจ้ง
//  col6  ชื่อ
//  col7  รหัสนักศึกษา/หน่วยงาน
//  col8  ประเภทเรื่อง
//  col9  ความเร่งด่วน
//  col10 หัวข้อ
//  col11 รายละเอียด
//  col12 หมายเหตุผู้ใช้
//  col13 สถานะ
//  col14 ผู้รับผิดชอบ
//  col15 กำหนดตอบกลับ
//  col16 Comments
//  col17 Pinned
//  col18 FileURL
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
    'UserID',               // A col1  UUID
    'Ticket ID',            // B col2  VOC-YYYY-XXXXXXXX
    'Username',             // C col3
    'วันที่แจ้ง',           // D col4
    'ประเภทผู้แจ้ง',        // E col5
    'ชื่อ',                 // F col6
    'รหัสนักศึกษา/หน่วยงาน', // G col7
    'ประเภทเรื่อง',         // H col8
    'ความเร่งด่วน',         // I col9
    'หัวข้อ',               // J col10
    'รายละเอียด',           // K col11
    'หมายเหตุผู้ใช้',       // L col12 user note
    'สถานะ',                // M col13
    'ผู้รับผิดชอบ',         // N col14
    'กำหนดตอบกลับ',        // O col15
    'Comments',             // P col16 ครู/อาจารย์
    'Pinned',               // Q col17 ปักหมุด
    'FileURL',              // R col18 ไฟล์แนบ
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

// ── สร้าง UserID แบบ UUID — ไม่มี Race Condition ──
// เปลี่ยนจาก auto-increment counter (อ่าน→บวก→เขียน) ซึ่งมีปัญหา Race Condition
// ใน Serverless environment มาเป็น UUID ที่สร้างบน client ทันที
// ตัวอย่าง: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
function generateUserID() {
  return crypto.randomUUID();
}

// ── สร้าง Ticket ID แบบ UUID-based — ไม่มี Race Condition ──
// Format: VOC-{ปีไทย}-{8 ตัวแรกของ UUID} เช่น VOC-2568-A1B2C3D4
// ยังคง prefix VOC-YYYY ไว้เพื่อให้ติดตามรายงานตามปีได้
// แต่ใช้ UUID แทน sequence number เพื่อป้องกัน race condition
function generateTicketId() {
  const thYear = String(new Date().getFullYear() + 543); // พ.ศ.
  // ใช้ 8 ตัวแรกของ UUID (hex) เป็น suffix — โอกาสซ้ำต่ำมากในทางปฏิบัติ
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `VOC-${thYear}-${suffix}`;
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
  generateUserID, generateTicketId,      // ← export ใหม่ (ไม่ใช้ sheets แล้ว)
  hashPassword, calcDueDate, formatDateThai, setCorsHeaders,
};
