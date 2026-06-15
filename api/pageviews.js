// api/pageviews.js
// ─────────────────────────────────────────────────────
//  PageView counter — เก็บใน Google Sheet ชีท "PageViews"
//
//  โครงสร้าง Sheet "PageViews" (สร้างครั้งแรกอัตโนมัติ):
//    A1: key        B1: value
//    A2: total      B2: <จำนวนรวม>
//    A3: today      B3: <YYYY-MM-DD>|<จำนวนวันนี้>
//    A4: updated    B4: <ISO timestamp>
//
//  GET  /api/pageviews        → คืน stats (ไม่นับ view)
//  POST /api/pageviews        → นับ +1 แล้วคืน stats ใหม่
// ─────────────────────────────────────────────────────
'use strict';

const {
  getSheetsClient, getSheetData, batchUpdate, setCorsHeaders, SPREADSHEET_ID,
} = require('./_sheets');

const SHEET = 'PageViews';

// ── อ่าน stats ปัจจุบัน ──────────────────────────────
async function readStats(sheets) {
  const rows = await getSheetData(sheets, SHEET);
  // rows[0] = header, rows[1] = total, rows[2] = today, rows[3] = updated
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD (local TH ≈ UTC+7)

  let total = 0;
  let todayCount = 0;
  let updated = null;

  if (rows.length >= 2) {
    total = parseInt(rows[1]?.[1] || '0', 10) || 0;
  }
  if (rows.length >= 3) {
    const [storedDate, storedCount] = (rows[2]?.[1] || '').split('|');
    todayCount = storedDate === todayStr ? (parseInt(storedCount, 10) || 0) : 0;
  }
  if (rows.length >= 4) {
    updated = rows[3]?.[1] || null;
  }

  return { total, todayCount, updated, todayStr };
}

// ── สร้าง header row ถ้า Sheet ยังว่างอยู่ ──────────
async function ensureHeader(sheets) {
  const rows = await getSheetData(sheets, SHEET);
  if (rows.length === 0) {
    // ใช้ append สร้าง header + initial rows
    const { google } = require('googleapis');
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET,
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          ['key',     'value'],
          ['total',   '0'],
          ['today',   `${new Date().toLocaleDateString('en-CA')}|0`],
          ['updated', new Date().toISOString()],
        ],
      },
    });
  }
}

// ── increment แล้ว batchUpdate ──────────────────────
async function incrementAndSave(sheets) {
  await ensureHeader(sheets);
  const { total, todayCount, todayStr } = await readStats(sheets);

  const newTotal = total + 1;
  const newToday = todayCount + 1;
  const now      = new Date().toISOString();

  await batchUpdate(sheets, [
    { range: `${SHEET}!B2`, value: String(newTotal) },
    { range: `${SHEET}!B3`, value: `${todayStr}|${newToday}` },
    { range: `${SHEET}!B4`, value: now },
  ]);

  return { total: newTotal, todayCount: newToday, updated: now };
}

// ─────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheets = await getSheetsClient();

    if (req.method === 'POST') {
      // นับ view
      const stats = await incrementAndSave(sheets);
      return res.status(200).json({ success: true, ...stats });
    }

    // GET — แค่อ่าน ไม่นับ
    await ensureHeader(sheets);
    const { total, todayCount, updated } = await readStats(sheets);
    return res.status(200).json({ success: true, total, todayCount, updated });

  } catch (err) {
    console.error('[pageviews]', err.message);
    // คืน 0 เสมอ ไม่ให้ frontend พัง
    return res.status(200).json({ success: false, total: 0, todayCount: 0, updated: null });
  }
};
