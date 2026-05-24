// api/news.js
// GET  /api/news                       — ดึงข่าวทั้งหมด (public)
// POST /api/news { action:'add', title, content, tag, author }
// POST /api/news { action:'delete', newsId }
// POST /api/news { action:'update', newsId, title, content, tag }

const {
  getSheetsClient, getSheetData, appendRow,
  SPREADSHEET_ID, setCorsHeaders, formatDateThai,
} = require('./_sheets');

const SHEET_NEWS = 'VOC_News';

async function ensureNewsSheet(sheets) {
  try {
    const d = await getSheetData(sheets, SHEET_NEWS);
    if (!d.length) throw new Error('empty');
  } catch {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NEWS } } }] },
    }).catch(() => {}); // ถ้า sheet มีอยู่แล้ว ไม่ error
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NEWS}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['NewsID', 'วันที่', 'หัวเรื่อง', 'เนื้อหา', 'Tag', 'Author']] },
    });
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
          newsId:  String(r[0]||''),
          date:    String(r[1]||''),
          title:   String(r[2]||''),
          content: String(r[3]||''),
          tag:     String(r[4]||'ทั่วไป'),
          author:  String(r[5]||''),
        }))
        .reverse();
      return res.json({ success: true, news: rows });
    }

    if (req.method === 'POST') {
      const { action, newsId, title, content, tag, author } = req.body;

      if (action === 'add') {
        if (!title || !content) return res.json({ success: false, message: 'กรุณากรอกหัวเรื่องและเนื้อหา' });
        // สร้าง ID ใหม่
        const existIds = data.slice(1).map(r => Number(r[0])||0);
        const newId    = existIds.length ? Math.max(...existIds) + 1 : 1;
        await appendRow(sheets, SHEET_NEWS, [
          newId, formatDateThai(new Date()), title, content, tag||'ทั่วไป', author||'admin'
        ]);
        return res.json({ success: true, message: 'เพิ่มข่าวสำเร็จ' });
      }

      if (action === 'delete') {
        // หา row แล้วลบ (clear)
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][0]) === String(newsId)) {
            await sheets.spreadsheets.values.clear({
              spreadsheetId: SPREADSHEET_ID,
              range: `${SHEET_NEWS}!A${i+1}:F${i+1}`,
            });
            return res.json({ success: true });
          }
        }
        return res.json({ success: false, message: 'ไม่พบข่าว' });
      }

      if (action === 'update') {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][0]) === String(newsId)) {
            const row = i + 1;
            await sheets.spreadsheets.values.update({
              spreadsheetId: SPREADSHEET_ID,
              range: `${SHEET_NEWS}!C${row}:E${row}`,
              valueInputOption: 'RAW',
              requestBody: { values: [[title||data[i][2], content||data[i][3], tag||data[i][4]]] },
            });
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
