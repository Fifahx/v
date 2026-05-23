// api/tickets.js
// GET  /api/tickets?action=byUsername&username=xxx
// GET  /api/tickets?action=byId&id=VOC-2568-0001
// GET  /api/tickets?action=byUserId&userId=5
// GET  /api/tickets?action=search&q=ชื่อหรือรหัส
// GET  /api/tickets?action=all&filter=pending
// GET  /api/tickets?action=pinned          ← ticket ที่ admin pin ให้แสดงหน้าหลัก
// POST /api/tickets  { action:'update', ticketId, newStatus, assignee, feedback, pinned }
// POST /api/tickets  { action:'togglePin', ticketId, pinned:true|false }

const {
  getSheetsClient, getSheetData, batchUpdate,
  SHEET_TICKETS, SPREADSHEET_ID,
  setCorsHeaders,
} = require('./_sheets');

// ── แปลงแถว → object ตาม headers ──
function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((h, i) => {
    obj[h] = row[i] !== undefined ? String(row[i]) : '';
  });
  return obj;
}

// ── mapping คอลัมน์ตำแหน่งใหม่ (1-based → letter) ──
// UserID=A(1), TicketID=B(2), Username=C(3), วันที่=D(4), ประเภทผู้แจ้ง=E(5)
// ชื่อ=F(6), รหัส=G(7), ประเภทเรื่อง=H(8), ความเร่งด่วน=I(9), หัวข้อ=J(10)
// รายละเอียด=K(11), สถานะ=L(12), ผู้รับผิดชอบ=M(13), กำหนดตอบกลับ=N(14)
// หมายเหตุ=O(15), Pinned=P(16) ← เพิ่มอัตโนมัติถ้ายังไม่มี

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheets = await getSheetsClient();
    const data   = await getSheetData(sheets, SHEET_TICKETS);
    if (!data.length) return res.json({ success: true, tickets: [] });

    const headers = data[0];

    // ── ตรวจสอบและเพิ่ม column "Pinned" ถ้ายังไม่มี ──
    let pinnedColIdx = headers.indexOf('Pinned');
    if (pinnedColIdx === -1) {
      pinnedColIdx = headers.length;
      const colLetter = String.fromCharCode(65 + pinnedColIdx);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_TICKETS}!${colLetter}1`,
        valueInputOption: 'RAW',
        requestBody: { values: [['Pinned']] },
      });
      headers.push('Pinned');
    }

    // ════════════════════════════════════════
    //  GET
    // ════════════════════════════════════════
    if (req.method === 'GET') {
      const { action, username, id, userId, q, filter } = req.query;

      // ── ticket ที่ pin ให้แสดงหน้าหลัก ──
      if (action === 'pinned') {
        const results = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i][0]) continue;
          if (String(data[i][pinnedColIdx] || '').toLowerCase() === 'true') {
            results.push(rowToObject(headers, data[i]));
          }
        }
        return res.json({ success: true, tickets: results });
      }

      // ── ดึงด้วย Username ──
      if (action === 'byUsername') {
        if (!username) return res.json({ success: false, message: 'ไม่พบ username' });
        const colIdx = headers.indexOf('Username');
        if (colIdx === -1) return res.json({ success: true, tickets: [] });
        const results = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i][0]) continue;
          if (String(data[i][colIdx] || '').toLowerCase().trim() !== username.toLowerCase().trim()) continue;
          results.push(rowToObject(headers, data[i]));
        }
        results.reverse();
        return res.json({ success: true, tickets: results });
      }

      // ── ดึงด้วย Ticket ID ──
      if (action === 'byId') {
        const colIdx = headers.indexOf('Ticket ID');
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][colIdx]) === String(id)) {
            return res.json({ success: true, ticket: rowToObject(headers, data[i]) });
          }
        }
        return res.json({ success: false, message: 'ไม่พบ Ticket ID นี้' });
      }

      // ── ดึงด้วย UserID (primary key) ──
      if (action === 'byUserId') {
        const colIdx = headers.indexOf('UserID');
        const results = [];
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][colIdx]) === String(userId)) {
            results.push(rowToObject(headers, data[i]));
          }
        }
        return res.json({ success: true, tickets: results });
      }

      // ── ค้นหาด้วยชื่อ/รหัส ──
      if (action === 'search') {
        const nameColIdx = headers.indexOf('ชื่อ');
        const sidColIdx  = headers.indexOf('รหัสนักศึกษา/หน่วยงาน');
        const results    = [];
        for (let i = 1; i < data.length; i++) {
          const rowName = String(data[i][nameColIdx] || '');
          const rowSid  = String(data[i][sidColIdx]  || '');
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
        const statusColIdx = headers.indexOf('สถานะ');
        const results      = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i][0]) continue;
          const status  = String(data[i][statusColIdx]);
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

    // ════════════════════════════════════════
    //  POST
    // ════════════════════════════════════════
    if (req.method === 'POST') {
      const { action, ticketId, newStatus, assignee, feedback, pinned } = req.body;

      const ticketColIdx = headers.indexOf('Ticket ID');

      // ── อัปเดต ticket (admin) ──
      if (action === 'update') {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][ticketColIdx]) === String(ticketId)) {
            const row     = i + 1;
            const updates = [];
            // ตำแหน่งคอลัมน์ใหม่:
            // สถานะ=L(12), ผู้รับผิดชอบ=M(13), หมายเหตุ=O(15), Pinned=P(16)
            if (newStatus !== undefined) updates.push({ range: `${SHEET_TICKETS}!L${row}`, value: newStatus });
            if (assignee  !== undefined) updates.push({ range: `${SHEET_TICKETS}!M${row}`, value: assignee });
            if (feedback  !== undefined) updates.push({ range: `${SHEET_TICKETS}!O${row}`, value: feedback });
            if (pinned    !== undefined) updates.push({ range: `${SHEET_TICKETS}!P${row}`, value: String(pinned) });

            if (updates.length) await batchUpdate(sheets, updates);
            return res.json({ success: true });
          }
        }
        return res.json({ success: false, message: 'ไม่พบ Ticket' });
      }

      // ── toggle pin (admin) ──
      if (action === 'togglePin') {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][ticketColIdx]) === String(ticketId)) {
            const row        = i + 1;
            const colLetter  = String.fromCharCode(65 + pinnedColIdx);
            await batchUpdate(sheets, [{
              range: `${SHEET_TICKETS}!${colLetter}${row}`,
              value: String(pinned),
            }]);
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
