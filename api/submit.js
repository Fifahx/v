// api/submit.js
// POST /api/submit  — รับเรื่องร้องเรียนใหม่ (เทียบเท่า handleSubmit ใน code.gs)

const {
  getSheetsClient, getSheetData, appendRow,
  SHEET_TICKETS, SHEET_COUNTERS,
  calcDueDate, formatDateThai, setCorsHeaders,
} = require('./_sheets');

// ── สร้าง Ticket ID แบบเดิม (VOC-2568-XXXX) ──
async function generateTicketId(sheets) {
  const thYear = String(new Date().getFullYear() + 543);
  const data   = await getSheetData(sheets, 'VOC_Counters');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === thYear) {
      const n = Number(data[i][1]) + 1;
      // อัปเดต running number
      const { google } = require('googleapis');
      const auth = new (require('googleapis').google.auth.GoogleAuth)({
        credentials: {
          client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      // ใช้ sheets ที่รับมาอัปเดตตรง ๆ
      const { SPREADSHEET_ID } = require('./_sheets');
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `VOC_Counters!B${i + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[n]] },
      });
      return `VOC-${thYear}-${String(n).padStart(4, '0')}`;
    }
  }
  // ปีใหม่ → เริ่ม 0001
  await appendRow(sheets, 'VOC_Counters', [thYear, 1]);
  return `VOC-${thYear}-0001`;
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const payload  = req.body;
    const sheets   = await getSheetsClient();
    const ticketId = await generateTicketId(sheets);
    const now      = new Date();
    const dueDate  = calcDueDate(now, payload.priority);

    await appendRow(sheets, 'VOC_Tickets', [
      ticketId,
      formatDateThai(now),
      payload.customerType || '',
      payload.isAnon ? 'นิรนาม' : (payload.name     || ''),
      payload.isAnon ? '-'      : (payload.studentId || ''),
      (payload.categories || []).join(', '),
      payload.priority  || 'medium',
      payload.subject   || '',
      payload.detail    || '',
      'รอดำเนินการ',
      '',
      dueDate,
      '',
      payload.username || '',
    ]);

    res.json({ success: true, ticketId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
};
