// api/news.js
// GET  /api/news                       — ดึงข่าวทั้งหมด (public)
// POST /api/news { action:'add', title, content, tag, author }
// POST /api/news { action:'delete', newsId }
// POST /api/news { action:'update', newsId, title, content, tag }

const {
  getSheetsClient, getSheetData, appendRow, withRetry,
  SPREADSHEET_ID, setCorsHeaders, formatDateThai,
} = require('./_sheets');

const SHEET_NEWS = 'VOC_News';

async function ensureNewsSheet(sheets) {
  try {
    const d = await getSheetData(sheets, SHEET_NEWS);
    if (!d.length) throw new Error('empty');
  } catch {
    await withRetry(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NEWS } } }] },
    }), 'news:addSheet').catch(() => {});
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NEWS}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['NewsID', 'วันที่', 'หัวเรื่อง', 'เนื้อหา', 'Tag', 'Author', 'ImageURL']] },
    }), 'news:initHeader');
  }
}

let newsCounter = 0;

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheets = await getSheetsClient();
    await ensureNewsSheet(sheets);
    const data   = await getSheetData(sheets, SHEET_NEWS);

    // GET — ดึงข่าวทั้งหมด
    if (req.method === 'GET') {
      const rows = data.slice(1)
        .filter(r => r[0])
        .map(r => ({
          newsId:   String(r[0]||''),
          date:     String(r[1]||''),
          title:    String(r[2]||''),
          content:  String(r[3]||''),
          tag:      String(r[4]||'ทั่วไป'),
          author:   String(r[5]||''),
          imageUrl: String(r[6]||''),
        }))
        .reverse();
      return res.json({ success: true, news: rows });
    }

    if (req.method === 'POST') {
      const { action, newsId, title, content, tag, author } = req.body;

      if (action === 'add') {
        if (!title || !content) return res.json({ success: false, message: 'กรุณากรอกหัวเรื่องและเนื้อหา' });
        const existIds = data.slice(1).map(r => Number(r[0])||0);
        const newId    = existIds.length ? Math.max(...existIds) + 1 : 1;
        let { imageUrl } = req.body;
        // Limit base64 size to ~45000 chars (Google Sheets cell limit ~50000)
        if (imageUrl && imageUrl.startsWith('data:') && imageUrl.length > 45000) {
          return res.json({ success: false, message: 'รูปภาพใหญ่เกินไป กรุณาบีบอัดหรือใช้ URL แทน (ขนาดสูงสุดประมาณ 30KB)' });
        }
        await appendRow(sheets, SHEET_NEWS, [
          newId, formatDateThai(new Date()), title, content, tag||'ทั่วไป', author||'admin', imageUrl||''
        ]);
        return res.json({ success: true, message: 'เพิ่มข่าวสำเร็จ' });
      }

      if (action === 'delete') {
        // หา row แล้วลบ (clear)
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][0]) === String(newsId)) {
            await withRetry(() => sheets.spreadsheets.values.clear({
              spreadsheetId: SPREADSHEET_ID,
              range: `${SHEET_NEWS}!A${i+1}:F${i+1}`,
            }), 'news:delete');
            return res.json({ success: true });
          }
        }
        return res.json({ success: false, message: 'ไม่พบข่าว' });
      }

      if (action === 'update') {
        let { imageUrl } = req.body;
        // Limit base64 size
        if (imageUrl && imageUrl.startsWith('data:') && imageUrl.length > 45000) {
          return res.json({ success: false, message: 'รูปภาพใหญ่เกินไป กรุณาบีบอัดหรือใช้ URL แทน' });
        }
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][0]) === String(newsId)) {
            const row = i + 1;
            // อัปเดต C:G (title, content, tag, author, imageUrl)
            await withRetry(() => sheets.spreadsheets.values.update({
              spreadsheetId: SPREADSHEET_ID,
              range: `${SHEET_NEWS}!C${row}:G${row}`,
              valueInputOption: 'RAW',
              requestBody: { values: [[
                title    || data[i][2],
                content  || data[i][3],
                tag      || data[i][4],
                data[i][5] || '',        // author ไม่เปลี่ยน
                imageUrl !== undefined ? imageUrl : (data[i][6] || ''),
              ]] },
            }), 'news:update');
            return res.json({ success: true });
          }
        }
        return res.json({ success: false, message: 'ไม่พบข่าว' });
      }
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
};
