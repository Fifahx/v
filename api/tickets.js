// api/tickets.js v7
// GET  /api/tickets?action=pinned
// GET  /api/tickets?action=byUsername&username=xxx
// GET  /api/tickets?action=byId&id=VOC-xxx
// GET  /api/tickets?action=all&filter=pending
// POST /api/tickets { action:'update', ticketId, newStatus, assignee }
// POST /api/tickets { action:'addComment', ticketId, comment, author }
// POST /api/tickets { action:'togglePin', ticketId, pinned:true|false }
// POST /api/tickets { action:'deleteTicket', ticketId }
//
// [แก้ไข v7]
// 1. ลบ ensureHeaders ออก — ไม่ auto-add column อีกต่อไป
//    เพราะ sheet ตั้งค่า header ตายตัวแล้ว และชื่อ header ที่เช็คเก่า
//    ไม่ตรงกับ sheet จริง (FileURL vs ไฟล์แนบ, หมายเหตุผู้ใช้ vs หมายเหตุ(ผู้ใช้))
//    ทำให้ idx.comments = -1 ตลอด → addComment fail
// 2. ลบ hadMissingHeaders ออก — logic เขียนผิด (double negation) ทำให้ true เสมอ
// 3. ค้นหา idx จาก header name ตาม sheet จริง ครบทุก field

const {
  getSheetsClient, getSheetData, batchUpdate,
  SHEET_TICKETS, SPREADSHEET_ID, setCorsHeaders, formatDateThai,
} = require('./_sheets');

// แปลง 0-based column index → Excel letter (A, B, ..., Z, AA, AB, ...)
function colLetter(idx) {
  let s = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// แปลงแถว → object ตาม headers
function rowToObj(headers, row) {
  const o = {};
  headers.forEach((h, i) => { o[h] = row[i] !== undefined ? String(row[i]) : ''; });
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

    // ── หา index จาก header name จริงใน Sheet ──
    // ใช้ indexOf เสมอ ไม่ hardcode เลข เพื่อรองรับถ้า column เคลื่อน
    const idx = {
      ticketId : headers.indexOf('Ticket ID'),
      username : headers.indexOf('Username'),
      status   : headers.indexOf('สถานะ'),
      assignee : headers.indexOf('ผู้รับผิดชอบ'),
      comments : headers.indexOf('Comments'),   // col P (index 15)
      pinned   : headers.indexOf('Pinned'),     // col Q (index 16)
    };

    // ════════════════ GET ════════════════
    if (req.method === 'GET') {
      const { action, username, id, filter } = req.query;

      // ── pinned tickets ──
      if (action === 'pinned') {
        if (idx.pinned === -1) return res.json({ success: true, tickets: [] });
        const results = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i] || !data[i][0]) continue;
          const val = String(data[i][idx.pinned] || '').trim().toLowerCase();
          if (val === 'true') results.push(rowToObj(headers, data[i]));
        }
        return res.json({ success: true, tickets: results });
      }

      // ── by username ──
      if (action === 'byUsername') {
        if (!username) return res.json({ success: false, message: 'ไม่พบ username' });
        if (idx.username === -1) return res.json({ success: true, tickets: [] });
        const results = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i] || !data[i][0]) continue;
          if (String(data[i][idx.username] || '').toLowerCase().trim()
              !== username.toLowerCase().trim()) continue;
          results.push(rowToObj(headers, data[i]));
        }
        return res.json({ success: true, tickets: results.reverse() });
      }

      // ── by ticket ID ──
      if (action === 'byId') {
        if (idx.ticketId === -1)
          return res.json({ success: false, message: 'ไม่พบ Ticket ID นี้' });
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][idx.ticketId] || '') === String(id))
            return res.json({ success: true, ticket: rowToObj(headers, data[i]) });
        }
        return res.json({ success: false, message: 'ไม่พบ Ticket ID นี้' });
      }

      // ── all (admin) ──
      if (action === 'all') {
        if (idx.status === -1) return res.json({ success: true, tickets: [] });
        const results = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i] || !data[i][0]) continue;
          const status  = String(data[i][idx.status] || '');
          const include = !filter || filter === 'all' ||
            (filter === 'pending' &&
              (status === 'รอดำเนินการ' || status === 'กำลังดำเนินการ')) ||
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

    // ════════════════ POST ════════════════
    if (req.method === 'POST') {
      const { action, ticketId, newStatus, assignee, comment, author, pinned } = req.body;

      // หา row number (1-based, ตรงกับ Sheets row จริง)
      function findRow(tid) {
        if (idx.ticketId === -1) return -1;
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][idx.ticketId] || '') === String(tid)) return i + 1;
        }
        return -1;
      }

      // ── update สถานะ / ผู้รับผิดชอบ ──
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

      // ── addComment — APPEND ต่อท้าย ไม่ลบของเก่า ──
      if (action === 'addComment') {
        const row = findRow(ticketId);
        if (row < 0)
          return res.json({ success: false, message: 'ไม่พบ Ticket' });

        // [แก้ไข] ตรวจ idx.comments ก่อนเสมอ
        if (idx.comments === -1)
          return res.json({ success: false, message: 'ไม่พบ column "Comments" ใน Sheet — กรุณาตรวจสอบ header row' });

        // อ่าน comment เก่าจาก data array (row 1-based → index row-1)
        const dataRow     = data[row - 1];
        const oldComments = (dataRow && dataRow[idx.comments] !== undefined)
          ? String(dataRow[idx.comments]).trim()
          : '';

        const timestamp   = formatDateThai(new Date());
        const authorLabel = (author || 'ผู้ดูแล').trim();
        const newEntry    = `[${timestamp}] ${authorLabel}: ${comment}`;
        const merged      = oldComments
          ? `${oldComments}\n---\n${newEntry}`
          : newEntry;

        await batchUpdate(sheets, [{
          range: `${SHEET_TICKETS}!${colLetter(idx.comments)}${row}`,
          value: merged,
        }]);

        return res.json({ success: true, comments: merged });
      }

      // ── togglePin ──
      if (action === 'togglePin') {
        const row = findRow(ticketId);
        if (row < 0) return res.json({ success: false, message: 'ไม่พบ Ticket' });
        if (idx.pinned === -1)
          return res.json({ success: false, message: 'ไม่พบ column "Pinned" ใน Sheet' });
        await batchUpdate(sheets, [{
          range: `${SHEET_TICKETS}!${colLetter(idx.pinned)}${row}`,
          value: String(pinned),
        }]);
        return res.json({ success: true });
      }

      // ── deleteTicket (superadmin only) ──
      if (action === 'deleteTicket') {
        const row = findRow(ticketId);
        if (row < 0) return res.json({ success: false, message: 'ไม่พบ Ticket' });
        const lastCol = colLetter(headers.length - 1);
        await sheets.spreadsheets.values.clear({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_TICKETS}!A${row}:${lastCol}${row}`,
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
