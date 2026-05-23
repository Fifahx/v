// api/submit.js
// POST /api/submit — บันทึก ticket ใหม่ + ส่ง email แจ้งเตือน admin

const {
  getSheetsClient, getSheetData, appendRow, generateUserID,
  SHEET_TICKETS, SHEET_COUNTERS, SPREADSHEET_ID,
  calcDueDate, formatDateThai, setCorsHeaders,
} = require('./_sheets');

async function generateTicketId(sheets) {
  const thYear = String(new Date().getFullYear() + 543);
  const data   = await getSheetData(sheets, SHEET_COUNTERS);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === thYear) {
      const n = Number(data[i][1]) + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `VOC_Counters!B${i + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[n]] },
      });
      return `VOC-${thYear}-${String(n).padStart(4, '0')}`;
    }
  }
  await appendRow(sheets, SHEET_COUNTERS, [thYear, 1]);
  return `VOC-${thYear}-0001`;
}

// ── ส่ง email แจ้งเตือน (ถ้าตั้งค่าไว้) ──
async function sendNotifyEmail(ticketId, payload) {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://v-xi-beryl.vercel.app';
    await fetch(`${baseUrl}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:       'sendAlert',
        ticketId,
        subject:      payload.subject || '',
        priority:     payload.priority || 'medium',
        customerType: payload.customerType || '',
        detail:       payload.detail || '',
      }),
    });
  } catch (e) {
    // ไม่ให้ email error ทำให้ submit fail
    console.error('notify error:', e.message);
  }
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const payload  = req.body;
    const sheets   = await getSheetsClient();
    const [userId, ticketId] = await Promise.all([
      generateUserID(sheets),
      generateTicketId(sheets),
    ]);
    const now     = new Date();
    const dueDate = calcDueDate(now, payload.priority);

    await appendRow(sheets, SHEET_TICKETS, [
      userId,
      ticketId,
      payload.username || '',
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
    ]);

    // ส่ง email แจ้งเตือน (async ไม่บล็อก response)
    sendNotifyEmail(ticketId, payload);

    res.json({ success: true, ticketId, userId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
};
