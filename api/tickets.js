// api/tickets.js v10
// [แก้ไข v10] หลังลบ column ซ้ำ S-V ออกจาก Sheet แล้ว
// ใช้ findIdx ค้นหา header จริงทุกครั้ง ไม่ hardcode index

const {
  getSheetsClient, getSheetData, batchUpdate,
  SHEET_TICKETS, SPREADSHEET_ID, setCorsHeaders, formatDateThai,
} = require('./_sheets');

function colLetter(idx) {
  let s = '', n = idx + 1;
  while (n > 0) {
    s = String.fromCharCode(65 + (n - 1) % 26) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// แมปชื่อ header ใน Sheet → ชื่อ key ที่ frontend (app.js) ใช้
const HEADER_MAP = {
  'หมายเหตุ(ผู้ใช้)' : 'หมายเหตุผู้ใช้',  // col L — frontend ใช้ t['หมายเหตุผู้ใช้']
  'ความคิดเห็น'       : 'Comments',          // เผื่อ sheet ใช้ชื่อไทย
  'ปักหมุด'           : 'Pinned',            // เผื่อ sheet ใช้ชื่อไทย
  'ไฟล์แนบ'           : 'FileURL',           // เผื่อ sheet ใช้ชื่อไทย
};

function rowToObj(headers, row) {
  const o = {};
  headers.forEach((h, i) => {
    if (!h) return;
    const key = HEADER_MAP[h] || h;
    o[key] = row[i] !== undefined ? String(row[i]) : '';
  });
  return o;
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheets = await getSheetsClient();
    const data   = await getSheetData(sheets, SHEET_TICKETS);
    if (!data.length) return res.json({ success: true, tickets: [] });

    const headers = data[0] || [];

    // ค้นหา index จากชื่อ header จริงในแถวแรก
    const findIdx = (...names) => {
      for (const n of names) {
        const i = headers.indexOf(n);
        if (i !== -1) return i;
      }
      return -1;
    };

    const idx = {
      ticketId : findIdx('Ticket ID'),
      username : findIdx('Username'),
      status   : findIdx('สถานะ'),
      assignee : findIdx('ผู้รับผิดชอบ'),
      comments : findIdx('Comments', 'ความคิดเห็น'),
      pinned   : findIdx('Pinned', 'ปักหมุด'),
    };

    // ════ GET ════
    if (req.method === 'GET') {
      const { action, username, id, filter } = req.query;

      if (action === 'pinned') {
        if (idx.pinned === -1) return res.json({ success: true, tickets: [] });
        const results = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i]?.[0]) continue;
          if (String(data[i][idx.pinned] || '').trim().toLowerCase() === 'true')
            results.push(rowToObj(headers, data[i]));
        }
        return res.json({ success: true, tickets: results });
      }

      if (action === 'byUsername') {
        if (!username) return res.json({ success: false, message: 'ไม่พบ username' });
        const results = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i]?.[0]) continue;
          if (String(data[i][idx.username] || '').toLowerCase().trim()
              === username.toLowerCase().trim())
            results.push(rowToObj(headers, data[i]));
        }
        return res.json({ success: true, tickets: results.reverse() });
      }

      if (action === 'byId') {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][idx.ticketId] || '') === String(id))
            return res.json({ success: true, ticket: rowToObj(headers, data[i]) });
        }
        return res.json({ success: false, message: 'ไม่พบ Ticket ID นี้' });
      }

      if (action === 'all') {
        const results = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i]?.[0]) continue;
          const status  = String(data[i][idx.status] || '');
          const include = !filter || filter === 'all' ||
            (filter === 'pending' && (status === 'รอดำเนินการ' || status === 'กำลังดำเนินการ')) ||
            status === filter;
          if (include) {
            const t = rowToObj(headers, data[i]);
            t['_row'] = i + 1;
            results.push(t);
          }
        }
        return res.json({ success: true, tickets: results.reverse() });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    // ════ POST ════
    if (req.method === 'POST') {
      const { action, ticketId, newStatus, assignee, comment, author, pinned } = req.body;

      const findRow = (tid) => {
        for (let i = 1; i < data.length; i++)
          if (String(data[i][idx.ticketId] || '') === String(tid)) return i + 1;
        return -1;
      };

      if (action === 'update') {
        const row = findRow(ticketId);
        if (row < 0) return res.json({ success: false, message: 'ไม่พบ Ticket' });
        const updates = [];
        if (newStatus !== undefined && idx.status   !== -1)
          updates.push({ range: `${SHEET_TICKETS}!${colLetter(idx.status)}${row}`,   value: newStatus });
        if (assignee  !== undefined && idx.assignee !== -1)
          updates.push({ range: `${SHEET_TICKETS}!${colLetter(idx.assignee)}${row}`, value: assignee });
        if (updates.length) await batchUpdate(sheets, updates);
        return res.json({ success: true });
      }

      if (action === 'addComment') {
        const row = findRow(ticketId);
        if (row < 0) return res.json({ success: false, message: 'ไม่พบ Ticket' });
        if (idx.comments === -1)
          return res.json({ success: false, message: `ไม่พบ column Comments ใน Sheet (headers: ${headers.join(', ')})` });

        const dataRow     = data[row - 1];
        const oldComments = String(dataRow?.[idx.comments] || '').trim();
        const timestamp   = formatDateThai(new Date());
        const authorLabel = (author || 'ผู้ดูแล').trim();
        const newEntry    = `[${timestamp}] ${authorLabel}: ${comment}`;
        const merged      = oldComments ? `${oldComments}\n---\n${newEntry}` : newEntry;

        await batchUpdate(sheets, [{
          range: `${SHEET_TICKETS}!${colLetter(idx.comments)}${row}`,
          value: merged,
        }]);
        return res.json({ success: true, comments: merged });
      }

      if (action === 'togglePin') {
        const row = findRow(ticketId);
        if (row < 0) return res.json({ success: false, message: 'ไม่พบ Ticket' });
        if (idx.pinned === -1)
          return res.json({ success: false, message: 'ไม่พบ column Pinned ใน Sheet' });
        await batchUpdate(sheets, [{
          range: `${SHEET_TICKETS}!${colLetter(idx.pinned)}${row}`,
          value: String(pinned),
        }]);
        return res.json({ success: true });
      }

      if (action === 'deleteTicket') {
        const row = findRow(ticketId);
        if (row < 0) return res.json({ success: false, message: 'ไม่พบ Ticket' });
        await sheets.spreadsheets.values.clear({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_TICKETS}!A${row}:${colLetter(headers.length - 1)}${row}`,
        });
        return res.json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('tickets.js error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
};
