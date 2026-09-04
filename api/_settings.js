// api/settings.js
// เก็บการตั้งค่าระบบแบบ key/value ในชีต VOC_Settings
// GET  /api/settings                        — ดึงการตั้งค่าทั้งหมด (public — ใช้แสดงผลหน้าเว็บ)
// POST /api/settings { action:'set', settings:{ key:value, ... } }  — superadmin เท่านั้น

const {
  getSheetsClient, getSheetData, withRetry,
  SPREADSHEET_ID, setCorsHeaders,
} = require('./_sheets');
const { requireAuth } = require('./_jwt');

const SHEET_SETTINGS = 'VOC_Settings';

// ค่าเริ่มต้น — ใช้เมื่อยังไม่เคยตั้งค่า
const DEFAULTS = {
  'navIcon.enabled': 'false',
  'navIcon.url': '',
  'navIcon.label': 'ประเมินความพึงพอใจ',
  'navIcon.popupEnabled': 'true',
  'navIcon.popupText': 'อย่าลืมกดประเมินประสิทธิภาพของระบบได้ที่นี่นะ',
  'navIcon.popupInterval': '10',   // วินาที — เว้นระยะก่อนเด้งรอบถัดไป
  'navIcon.popupDuration': '3',    // วินาที — ค้างไว้นานเท่าไรก่อนหาย
};

async function ensureSettingsSheet(sheets) {
  try {
    const d = await getSheetData(sheets, SHEET_SETTINGS);
    if (!d.length) throw new Error('empty');
  } catch {
    await withRetry(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_SETTINGS } } }] },
    }), 'settings:addSheet').catch(() => { });
    const values = [['Key', 'Value'], ...Object.entries(DEFAULTS)];
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_SETTINGS}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values },
    }), 'settings:initHeader');
  }
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheets = await getSheetsClient();
    await ensureSettingsSheet(sheets);
    const data = await getSheetData(sheets, SHEET_SETTINGS);

    const current = { ...DEFAULTS };
    for (let i = 1; i < data.length; i++) {
      const k = String(data[i][0] || '');
      if (k) current[k] = String(data[i][1] != null ? data[i][1] : '');
    }

    if (req.method === 'GET') {
      return res.json({ success: true, settings: current });
    }

    if (req.method === 'POST') {
      const auth = requireAuth(req, res, ['superadmin']);
      if (!auth) return;

      const { action, settings } = req.body || {};
      if (action !== 'set' || !settings || typeof settings !== 'object') {
        return res.status(400).json({ success: false, message: 'Unknown action' });
      }

      const merged = { ...current, ...Object.fromEntries(
        Object.entries(settings).map(([k, v]) => [k, String(v == null ? '' : v)])
      ) };
      const values = [['Key', 'Value'], ...Object.entries(merged)];
      await withRetry(() => sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_SETTINGS}!A1:B500`,
      }), 'settings:clear');
      await withRetry(() => sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_SETTINGS}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values },
      }), 'settings:save');

      return res.json({ success: true, settings: merged });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[settings]', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
