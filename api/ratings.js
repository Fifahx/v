// api/ratings.js
// POST /api/ratings  { ticketId, username, score:1-5, comment }  ← user ให้คะแนน
// GET  /api/ratings?action=all          ← admin ดูทุก review
// GET  /api/ratings?action=byTicket&id=VOC-xxx
// GET  /api/ratings?action=summary      ← สรุปคะแนนเฉลี่ย

const {
  getSheetsClient, getSheetData, appendRow, withRetry,
  SPREADSHEET_ID, setCorsHeaders, formatDateThai,
} = require('./_sheets');

const SHEET_RATINGS = 'VOC_Ratings';

async function ensureRatingsSheet(sheets) {
  try {
    await getSheetData(sheets, SHEET_RATINGS);
  } catch (e) {
    // สร้าง sheet ใหม่ถ้ายังไม่มี
    await withRetry(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_RATINGS } } }] },
    }), 'ratings:addSheet');
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_RATINGS}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['วันที่', 'Ticket ID', 'Username', 'คะแนน', 'ความคิดเห็น']] },
    }), 'ratings:initHeader');
  }
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheets = await getSheetsClient();
    await ensureRatingsSheet(sheets);
    const data = await getSheetData(sheets, SHEET_RATINGS);

    // ── POST: ส่งคะแนน ──
    if (req.method === 'POST') {
      const { ticketId, username, score, comment } = req.body;
      if (!ticketId || !score) return res.json({ success: false, message: 'ข้อมูลไม่ครบ' });
      if (score < 1 || score > 5) return res.json({ success: false, message: 'คะแนนต้องอยู่ระหว่าง 1-5' });

      // ตรวจว่า ticket นี้เคยให้คะแนนแล้วหรือไม่
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][1]||'') === String(ticketId) &&
            String(data[i][2]||'').toLowerCase() === String(username||'').toLowerCase()) {
          return res.json({ success: false, message: 'คุณได้ให้คะแนน ticket นี้ไปแล้ว' });
        }
      }

      await appendRow(sheets, SHEET_RATINGS, [
        formatDateThai(new Date()), ticketId, username||'', score, comment||'',
      ]);
      return res.json({ success: true, message: 'ขอบคุณสำหรับการให้คะแนน' });
    }

    // ── GET ──
    if (req.method === 'GET') {
      const { action, id } = req.query;
      const headers = data[0] || [];
      const rows = data.slice(1).filter(r => r[0]);

      if (action === 'byTicket') {
        const found = rows.filter(r => String(r[1]||'') === String(id));
        return res.json({ success: true, ratings: found.map(r => ({
          date: r[0], ticketId: r[1], username: r[2], score: Number(r[3]), comment: r[4],
        }))});
      }

      if (action === 'all') {
        return res.json({ success: true, ratings: rows.map(r => ({
          date: r[0], ticketId: r[1], username: r[2], score: Number(r[3]), comment: r[4],
        })).reverse() });
      }

      if (action === 'summary') {
        if (!rows.length) return res.json({ success: true, summary: { avg: 0, total: 0, dist: {1:0,2:0,3:0,4:0,5:0} } });
        const dist = {1:0, 2:0, 3:0, 4:0, 5:0};
        let sum = 0;
        rows.forEach(r => { const s = Number(r[3])||0; sum += s; dist[s] = (dist[s]||0)+1; });
        return res.json({ success: true, summary: {
          avg: Math.round((sum / rows.length) * 10) / 10,
          total: rows.length,
          dist,
        }});
      }
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
};
