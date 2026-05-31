// api/faq.js
// GET  /api/faq          — ดึงคำถามทั้งหมด (public)
// POST /api/faq { action:'add', question, answer, category }
// POST /api/faq { action:'delete', faqId }
// POST /api/faq { action:'update', faqId, question, answer, category }

const {
  getSheetsClient, getSheetData, appendRow, withRetry,
  SPREADSHEET_ID, setCorsHeaders,
} = require('./_sheets');

const SHEET_FAQ = 'VOC_FAQ';

async function ensureFaqSheet(sheets) {
  try {
    const d = await getSheetData(sheets, SHEET_FAQ);
    if (!d.length) throw new Error('empty');
  } catch {
    await withRetry(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_FAQ } } }] },
    }), 'ensureSheet:addSheet').catch(() => {});
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_FAQ}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['FaqID', 'หมวดหมู่', 'คำถาม', 'คำตอบ']] },
    }), 'faq:initHeader');
    // เพิ่มคำถาม default
    const defaults = [
      [1, 'การใช้งาน', 'จะแจ้งเรื่องร้องเรียนได้อย่างไร?', 'กด "แจ้งเรื่อง" ในเมนูหลัก กรอกข้อมูลให้ครบ แล้วกดยืนยัน ระบบจะให้ Ticket ID ไว้ติดตามสถานะ'],
      [2, 'การใช้งาน', 'ติดตามสถานะเรื่องร้องเรียนได้อย่างไร?', 'ไปที่เมนู "ติดตามสถานะ" แล้วกรอก Ticket ID ที่ได้รับตอนแจ้งเรื่อง'],
      [3, 'การใช้งาน', 'จำเป็นต้องลงทะเบียนก่อนแจ้งเรื่องไหม?', 'ใช่ ต้องลงทะเบียนและเข้าสู่ระบบก่อน เพื่อให้ระบบสามารถติดตามและแจ้งสถานะกลับให้ท่านได้'],
      [4, 'ความเร่งด่วน', 'ระดับความเร่งด่วนมีกี่ระดับ?', 'มี 3 ระดับ คือ ทั่วไป (7 วัน), ปานกลาง (3 วัน), และเร่งด่วน (24 ชั่วโมง)'],
      [5, 'ความปลอดภัย', 'ข้อมูลของฉันจะถูกเก็บไว้อย่างปลอดภัยไหม?', 'ข้อมูลทั้งหมดถูกจัดเก็บใน Google Sheets ที่ควบคุมการเข้าถึงโดยทีมงานเท่านั้น'],
    ];
    for (const row of defaults) {
      await appendRow(sheets, SHEET_FAQ, row);
    }
  }
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheets = await getSheetsClient();
    await ensureFaqSheet(sheets);
    const data   = await getSheetData(sheets, SHEET_FAQ);

    if (req.method === 'GET') {
      const rows = data.slice(1)
        .filter(r => r[0])
        .map(r => ({
          faqId:    String(r[0]||''),
          category: String(r[1]||'ทั่วไป'),
          question: String(r[2]||''),
          answer:   String(r[3]||''),
        }));
      return res.json({ success: true, faqs: rows });
    }

    if (req.method === 'POST') {
      const { action, faqId, question, answer, category } = req.body;

      if (action === 'add') {
        if (!question || !answer) return res.json({ success: false, message: 'กรุณากรอกคำถามและคำตอบ' });
        const existIds = data.slice(1).map(r => Number(r[0])||0);
        const newId    = existIds.length ? Math.max(...existIds) + 1 : 1;
        await appendRow(sheets, SHEET_FAQ, [newId, category||'ทั่วไป', question, answer]);
        return res.json({ success: true });
      }

      if (action === 'delete') {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][0]) === String(faqId)) {
            await withRetry(() => sheets.spreadsheets.values.clear({
              spreadsheetId: SPREADSHEET_ID,
              range: `${SHEET_FAQ}!A${i+1}:D${i+1}`,
            }), 'faq:delete');
            return res.json({ success: true });
          }
        }
        return res.json({ success: false, message: 'ไม่พบ FAQ' });
      }

      if (action === 'update') {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][0]) === String(faqId)) {
            await withRetry(() => sheets.spreadsheets.values.update({
              spreadsheetId: SPREADSHEET_ID,
              range: `${SHEET_FAQ}!B${i+1}:D${i+1}`,
              valueInputOption: 'RAW',
              requestBody: { values: [[category||data[i][1], question||data[i][2], answer||data[i][3]]] },
            }), 'faq:update');
            return res.json({ success: true });
          }
        }
        return res.json({ success: false, message: 'ไม่พบ FAQ' });
      }
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
};
