// api/tickets.js v5
// GET  /api/tickets?action=byUsername&username=xxx
// GET  /api/tickets?action=byId&id=VOC-xxx
// GET  /api/tickets?action=all&filter=pending
// GET  /api/tickets?action=pinned
// POST /api/tickets { action:'update', ticketId, newStatus, assignee, comment }
// POST /api/tickets { action:'addComment', ticketId, comment, author }  ← append
// POST /api/tickets { action:'togglePin', ticketId, pinned }
//
// Column map (0-based index):
// 0:UserID 1:TicketID 2:Username 3:วันที่ 4:ประเภทผู้แจ้ง 5:ชื่อ
// 6:รหัส 7:ประเภทเรื่อง 8:ความเร่งด่วน 9:หัวข้อ 10:รายละเอียด
// 11:หมายเหตุผู้ใช้ 12:สถานะ 13:ผู้รับผิดชอบ 14:กำหนดตอบกลับ
// 15:Comments(ครู) 16:Pinned 17:FileURL

const {
  getSheetsClient, getSheetData, batchUpdate,
  SHEET_TICKETS, SPREADSHEET_ID, setCorsHeaders, formatDateThai,
} = require('./_sheets');

function rowToObj(headers, row) {
  const o = {};
  headers.forEach((h, i) => { o[h] = row[i] !== undefined ? String(row[i]) : ''; });
  return o;
}

// column letters (1-based col number → letter)
const COL = {
  STATUS:    'M', // 13
  ASSIGNEE:  'N', // 14
  COMMENTS:  'P', // 16
  PINNED:    'Q', // 17
};

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheets  = await getSheetsClient();
    const data    = await getSheetData(sheets, SHEET_TICKETS);
    if (!data.length) return res.json({ success: true, tickets: [] });
    const headers = data[0];

    // ─── GET ───────────────────────────────────────────────
    if (req.method === 'GET') {
      const { action, username, id, filter } = req.query;

      // pinned tickets (หน้าหลัก)
      if (action === 'pinned') {
        const pinnedIdx = headers.indexOf('Pinned');
        const results   = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i][0]) continue;
          if (String(data[i][pinnedIdx]||'').toLowerCase() === 'true')
            results.push(rowToObj(headers, data[i]));
        }
        return res.json({ success: true, tickets: results });
      }

      // by username
      if (action === 'byUsername') {
        if (!username) return res.json({ success: false, message: 'ไม่พบ username' });
        const colIdx = headers.indexOf('Username');
        if (colIdx === -1) return res.json({ success: true, tickets: [] });
        const results = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i][0]) continue;
          if (String(data[i][colIdx]||'').toLowerCase().trim() !== username.toLowerCase().trim()) continue;
          results.push(rowToObj(headers, data[i]));
        }
        results.reverse();
        return res.json({ success: true, tickets: results });
      }

      // by ticket ID
      if (action === 'byId') {
        const colIdx = headers.indexOf('Ticket ID');
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][colIdx]) === String(id))
            return res.json({ success: true, ticket: rowToObj(headers, data[i]) });
        }
        return res.json({ success: false, message: 'ไม่พบ Ticket ID นี้' });
      }

      // all (admin)
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
            const t = rowToObj(headers, data[i]);
            t['_row'] = i + 1;
            results.push(t);
          }
        }
        results.reverse();
        return res.json({ success: true, tickets: results });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    // ─── POST ──────────────────────────────────────────────
    if (req.method === 'POST') {
      const { action, ticketId, newStatus, assignee, comment, author, pinned } = req.body;
      const ticketColIdx = headers.indexOf('Ticket ID');

      // หาแถวของ ticket
      function findRow(tid) {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][ticketColIdx]) === String(tid)) return i + 1; // 1-based
        }
        return -1;
      }

      // update ticket (สถานะ / ผู้รับผิดชอบ)
      if (action === 'update') {
        const row = findRow(ticketId);
        if (row < 0) return res.json({ success: false, message: 'ไม่พบ Ticket' });
        const updates = [];
        if (newStatus !== undefined) updates.push({ range: `${SHEET_TICKETS}!${COL.STATUS}${row}`,   value: newStatus });
        if (assignee  !== undefined) updates.push({ range: `${SHEET_TICKETS}!${COL.ASSIGNEE}${row}`, value: assignee  });
        if (updates.length) await batchUpdate(sheets, updates);
        return res.json({ success: true });
      }

      // addComment — APPEND
      if (action === 'addComment') {
        const row = findRow(ticketId);
        if (row < 0) return res.json({ success: false, message: 'ไม่พบ Ticket' });

        // ดึง comment เดิม
        const commentsColIdx = headers.indexOf('Comments');
        const oldComments    = commentsColIdx >= 0
          ? String(data[row - 1][commentsColIdx] || '') : '';

        const timestamp   = formatDateThai(new Date());
        const authorLabel = author || 'ผู้ดูแล';
        const newEntry    = `[${timestamp}] ${authorLabel}: ${comment}`;
        const merged      = oldComments
          ? oldComments + '\n---\n' + newEntry
          : newEntry;

        await batchUpdate(sheets, [{
          range: `${SHEET_TICKETS}!${COL.COMMENTS}${row}`, value: merged,
        }]);
        return res.json({ success: true, comments: merged });
      }

      // togglePin
      if (action === 'togglePin') {
        const row = findRow(ticketId);
        if (row < 0) return res.json({ success: false, message: 'ไม่พบ Ticket' });
        await batchUpdate(sheets, [{
          range: `${SHEET_TICKETS}!${COL.PINNED}${row}`, value: String(pinned),
        }]);
        return res.json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
};
