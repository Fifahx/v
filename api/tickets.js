// api/tickets.js
// GET  /api/tickets?action=byUsername&username=xxx
// GET  /api/tickets?action=byId&id=VOC-2568-0001
// GET  /api/tickets?action=search&q=ชื่อหรือรหัส
// GET  /api/tickets?action=all&filter=pending
// POST /api/tickets  { action:'update', ticketId, newStatus, assignee, feedback }

const {
  getSheetsClient, getSheetData,
  SHEET_TICKETS, SPREADSHEET_ID,
  setCorsHeaders,
} = require('./_sheets');

// ── แปลงแถวข้อมูล → object ──
function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]) : ''; });
  return obj;
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheets = await getSheetsClient();
    const data   = await getSheetData(sheets, SHEET_TICKETS);
    if (!data.length) return res.json({ success: true, tickets: [] });

    const headers = data[0];

    // ═══════════════════════════════════════════
    //  GET  — อ่านข้อมูล
    // ═══════════════════════════════════════════
    if (req.method === 'GET') {
      const { action, username, id, q, filter } = req.query;

      // ── ดึง ticket ของ user คนนี้ (login แล้ว) ──
      if (action === 'byUsername') {
        if (!username) return res.json({ success: false, message: 'ไม่พบ username' });
        const colIdx = headers.indexOf('Username');
        if (colIdx === -1) return res.json({ success: true, tickets: [] });

        const results = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i][0]) continue;
          if (String(data[i][colIdx]).toLowerCase().trim() !== username.toLowerCase().trim()) continue;
          results.push(rowToObject(headers, data[i]));
        }
        results.reverse();
        return res.json({ success: true, tickets: results });
      }

      // ── ค้นหาด้วย Ticket ID ──
      if (action === 'byId') {
        const colIdx = headers.indexOf('Ticket ID');
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][colIdx]) === String(id)) {
            return res.json({ success: true, ticket: rowToObject(headers, data[i]) });
          }
        }
        return res.json({ success: false, message: 'ไม่พบ Ticket ID นี้' });
      }

      // ── ค้นหาด้วยชื่อ/รหัสนักศึกษา ──
      if (action === 'search') {
        const results = [];
        for (let i = 1; i < data.length; i++) {
          const rowName = String(data[i][3] || '');
          const rowSid  = String(data[i][4] || '');
          if (
            rowName.toLowerCase().includes(q.toLowerCase()) ||
            rowSid.toLowerCase().includes(q.toLowerCase())
          ) {
            results.push(rowToObject(headers, data[i]));
          }
        }
        results.reverse();
        return res.json({ success: true, tickets: results });
      }

      // ── ดึงทั้งหมด (admin) ──
      if (action === 'all') {
        const results = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i][0]) continue;
          const status  = String(data[i][9]);
          const include = !filter || filter === 'all' ||
            (filter === 'pending' && (status === 'รอดำเนินการ' || status === 'กำลังดำเนินการ')) ||
            status === filter;
          if (include) {
            const t = rowToObject(headers, data[i]);
            t['_row'] = i + 1;
            results.push(t);
          }
        }
        results.reverse();
        return res.json({ success: true, tickets: results });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    // ═══════════════════════════════════════════
    //  POST — อัปเดต ticket (admin)
    // ═══════════════════════════════════════════
    if (req.method === 'POST') {
      const { action, ticketId, newStatus, assignee, feedback } = req.body;

      if (action === 'update') {
        const colIdx = headers.indexOf('Ticket ID');
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][colIdx]) === String(ticketId)) {
            const row = i + 1;
            const updates = [];
            if (newStatus) updates.push({ range: `VOC_Tickets!J${row}`, value: newStatus });
            if (assignee)  updates.push({ range: `VOC_Tickets!K${row}`, value: assignee });
            if (feedback)  updates.push({ range: `VOC_Tickets!M${row}`, value: feedback });

            for (const u of updates) {
              await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: u.range,
                valueInputOption: 'RAW',
                requestBody: { values: [[u.value]] },
              });
            }
            return res.json({ success: true });
          }
        }
        return res.json({ success: false, message: 'ไม่พบ Ticket' });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
};
