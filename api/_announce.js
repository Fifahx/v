// api/_announce.js  (เรียกผ่าน /api/content?module=announce)
// ประกาศการอัปเดตระบบ — แสดงเป็นป็อปอัพครั้งแรกที่ผู้ใช้เข้าเว็บ และในแถบ "อัปเดตล่าสุด"
//
// GET  ?module=announce            — รายการที่เปิดใช้งาน (public)
// GET  ?module=announce&all=1      — รวมที่ปิดอยู่ด้วย (สำหรับหน้าจัดการ)
// POST { action:'add'|'update'|'delete', ... }  — admin / superadmin

const {
  getSheetsClient, getSheetData, appendRow, withRetry,
  SPREADSHEET_ID, setCorsHeaders, formatDateThai,
} = require('./_sheets');
const { requireAuth } = require('./_jwt');

const SHEET_ANN = 'VOC_Announcements';
const HEADER = [
  'AnnID', 'วันที่สร้าง', 'หัวข้อ', 'เนื้อหา', 'ประเภท', 'ผู้ประกาศ',
  'แสดงป็อปอัพ', 'หน่วงกี่วัน', 'แสดงถึง', 'สถานะ',
];

async function ensureSheet(sheets) {
  try {
    const d = await getSheetData(sheets, SHEET_ANN);
    if (!d.length) throw new Error('empty');
  } catch {
    await withRetry(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_ANN } } }] },
    }), 'ann:addSheet').catch(() => { });
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_ANN}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER] },
    }), 'ann:initHeader');
  }
}

function rowToObj(r) {
  return {
    annId: String(r[0] || ''),
    createdAt: String(r[1] || ''),
    title: String(r[2] || ''),
    content: String(r[3] || ''),
    type: String(r[4] || 'update'),
    author: String(r[5] || ''),
    popup: String(r[6] || 'true') === 'true',
    delayDays: Number(r[7]) || 0,
    showUntil: String(r[8] || ''),
    status: String(r[9] || 'active'),
  };
}

// ยังอยู่ในช่วงเวลาที่ประกาศไว้หรือไม่ (ไม่ระบุ = ไม่มีวันหมดอายุ)
function notExpired(a) {
  if (!a.showUntil) return true;
  const end = new Date(a.showUntil);
  return isNaN(end.getTime()) ? true : Date.now() <= end.getTime();
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheets = await getSheetsClient();
    await ensureSheet(sheets);
    const data = await getSheetData(sheets, SHEET_ANN);
    const all = data.slice(1).filter(r => r[0]).map(rowToObj)
      .sort((a, b) => Number(b.annId) - Number(a.annId)); // ใหม่สุดขึ้นก่อน

    if (req.method === 'GET') {
      const wantAll = String(req.query?.all || '') === '1';
      const list = wantAll ? all : all.filter(a => a.status === 'active' && notExpired(a));
      return res.json({ success: true, announcements: list });
    }

    if (req.method === 'POST') {
      const auth = requireAuth(req, res, ['admin', 'superadmin']);
      if (!auth) return;

      const { action, annId, title, content, type, popup, delayDays, showUntil, status } = req.body || {};

      if (action === 'add') {
        if (!title || !content) return res.json({ success: false, message: 'กรุณากรอกหัวข้อและเนื้อหา' });
        const ids = all.map(a => Number(a.annId) || 0);
        const newId = ids.length ? Math.max(...ids) + 1 : 1;
        await appendRow(sheets, SHEET_ANN, [
          newId, formatDateThai(new Date()), title, content, type || 'update',
          auth.username || 'admin',
          popup === false ? 'false' : 'true',
          String(Number(delayDays) || 0),
          showUntil || '',
          'active',
        ]);
        return res.json({ success: true, annId: newId });
      }

      if (action === 'update') {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][0]) !== String(annId)) continue;
          await withRetry(() => sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_ANN}!C${i + 1}:J${i + 1}`,
            valueInputOption: 'RAW',
            requestBody: {
              values: [[
                title != null ? title : data[i][2],
                content != null ? content : data[i][3],
                type || data[i][4] || 'update',
                data[i][5] || '',
                popup === undefined ? (data[i][6] || 'true') : (popup ? 'true' : 'false'),
                delayDays === undefined ? (data[i][7] || '0') : String(Number(delayDays) || 0),
                showUntil === undefined ? (data[i][8] || '') : (showUntil || ''),
                status || data[i][9] || 'active',
              ]],
            },
          }), 'ann:update');
          return res.json({ success: true });
        }
        return res.json({ success: false, message: 'ไม่พบประกาศนี้' });
      }

      if (action === 'delete') {
        const left = all.filter(a => String(a.annId) !== String(annId));
        if (left.length === all.length) return res.json({ success: false, message: 'ไม่พบประกาศนี้' });
        await withRetry(() => sheets.spreadsheets.values.clear({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_ANN}!A2:J10000`,
        }), 'ann:clear');
        if (left.length) {
          await withRetry(() => sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_ANN}!A2`,
            valueInputOption: 'RAW',
            requestBody: {
              values: left.map(a => [
                a.annId, a.createdAt, a.title, a.content, a.type, a.author,
                a.popup ? 'true' : 'false', String(a.delayDays), a.showUntil, a.status,
              ]),
            },
          }), 'ann:rewrite');
        }
        return res.json({ success: true });
      }

      return res.status(400).json({ success: false, message: 'Unknown action' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[announce]', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
