// api/tickets.js v6 — fixed pinned + column auto-init
// GET  /api/tickets?action=pinned
// GET  /api/tickets?action=byUsername&username=xxx
// GET  /api/tickets?action=byId&id=VOC-xxx
// GET  /api/tickets?action=all&filter=pending
// POST /api/tickets { action:'update', ticketId, newStatus, assignee }
// POST /api/tickets { action:'addComment', ticketId, comment, author }
// POST /api/tickets { action:'togglePin', ticketId, pinned:true|false }
//
// VOC_Tickets column order (must match _sheets.js getTicketHeaders):
// A  UserID         (col 1, index 0)
// B  Ticket ID      (col 2, index 1)
// C  Username       (col 3, index 2)
// D  วันที่แจ้ง     (col 4, index 3)
// E  ประเภทผู้แจ้ง  (col 5, index 4)
// F  ชื่อ           (col 6, index 5)
// G  รหัสนักศึกษา/หน่วยงาน (col 7, index 6)
// H  ประเภทเรื่อง   (col 8, index 7)
// I  ความเร่งด่วน   (col 9, index 8)
// J  หัวข้อ         (col 10, index 9)
// K  รายละเอียด     (col 11, index 10)
// L  หมายเหตุผู้ใช้ (col 12, index 11)
// M  สถานะ          (col 13, index 12)
// N  ผู้รับผิดชอบ   (col 14, index 13)
// O  กำหนดตอบกลับ  (col 15, index 14)
// P  Comments       (col 16, index 15)
// Q  Pinned         (col 17, index 16)
// R  FileURL        (col 18, index 17)

const {
  getSheetsClient, getSheetData, batchUpdate,
  SHEET_TICKETS, SPREADSHEET_ID, setCorsHeaders, formatDateThai,
} = require('./_sheets');

// แปลง 0-based column index → Excel letter (0=A, 1=B, ..., 25=Z, 26=AA ...)
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

// ── ตรวจสอบและเพิ่ม header ที่ขาดใน Sheet ──
// ป้องกันกรณี sheet เก่าไม่มีคอลัมน์ใหม่ (Pinned, Comments, หมายเหตุผู้ใช้, FileURL)
async function ensureHeaders(sheets, headers) {
  const required = [
    'หมายเหตุผู้ใช้', // L col12
    'Comments',       // P col16
    'Pinned',         // Q col17
    'FileURL',        // R col18
  ];
  const toAdd = required.filter(h => headers.indexOf(h) === -1);
  if (!toAdd.length) return headers; // ครบแล้ว ไม่ต้องทำอะไร

  // เพิ่ม header ที่ขาดต่อท้าย
  const updates = [];
  for (const h of toAdd) {
    const newIdx = headers.length;
    updates.push({
      range: `${SHEET_TICKETS}!${colLetter(newIdx)}1`,
      value: h,
    });
    headers.push(h); // อัปเดต local array ด้วย
  }
  await batchUpdate(sheets, updates);
  return headers;
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheets = await getSheetsClient();
    const data   = await getSheetData(sheets, SHEET_TICKETS);

    if (!data.length) return res.json({ success: true, tickets: [] });

    // ── ตรวจและเพิ่ม headers ที่ขาด ──
    let headers = [...(data[0] || [])];
    headers = await ensureHeaders(sheets, headers);

    // ── index ที่ใช้บ่อย (ค้นหาจาก header name เสมอ ไม่ hardcode) ──
    const idx = {
      ticketId  : headers.indexOf('Ticket ID'),
      username  : headers.indexOf('Username'),
      status    : headers.indexOf('สถานะ'),
      assignee  : headers.indexOf('ผู้รับผิดชอบ'),
      comments  : headers.indexOf('Comments'),
      pinned    : headers.indexOf('Pinned'),
    };

    // ════════════════ GET ════════════════
    if (req.method === 'GET') {
      const { action, username, id, filter } = req.query;

      // ── pinned tickets (หน้าหลัก) ──
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
          if (String(data[i][idx.username] || '').toLowerCase().trim() !== username.toLowerCase().trim()) continue;
          results.push(rowToObj(headers, data[i]));
        }
        return res.json({ success: true, tickets: results.reverse() });
      }

      // ── by ticket ID ──
      if (action === 'byId') {
        if (idx.ticketId === -1) return res.json({ success: false, message: 'ไม่พบ Ticket ID นี้' });
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

    // ════════════════ POST ════════════════
    if (req.method === 'POST') {
      const { action, ticketId, newStatus, assignee, comment, author, pinned } = req.body;

      // หา row (1-based) จาก ticket ID
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
        if (newStatus !== undefined && idx.status   !== -1) updates.push({ range: `${SHEET_TICKETS}!${colLetter(idx.status)}${row}`,   value: newStatus });
        if (assignee  !== undefined && idx.assignee !== -1) updates.push({ range: `${SHEET_TICKETS}!${colLetter(idx.assignee)}${row}`, value: assignee  });
        if (updates.length) await batchUpdate(sheets, updates);
        return res.json({ success: true });
      }

      // ── addComment — APPEND ──
      if (action === 'addComment') {
        const row = findRow(ticketId);
        if (row < 0) return res.json({ success: false, message: 'ไม่พบ Ticket' });
        if (idx.comments === -1) return res.json({ success: false, message: 'ไม่พบ column Comments' });

        const oldComments = String(data[row - 1][idx.comments] || '');
        const timestamp   = formatDateThai(new Date());
        const authorLabel = author || 'ผู้ดูแล';
        const newEntry    = `[${timestamp}] ${authorLabel}: ${comment}`;
        const merged      = oldComments ? oldComments + '\n---\n' + newEntry : newEntry;

        await batchUpdate(sheets, [{
          range: `${SHEET_TICKETS}!${colLetter(idx.comments)}${row}`, value: merged,
        }]);
        return res.json({ success: true, comments: merged });
      }

      // ── togglePin ──
      if (action === 'togglePin') {
        const row = findRow(ticketId);
        if (row < 0) return res.json({ success: false, message: 'ไม่พบ Ticket' });
        if (idx.pinned === -1) return res.json({ success: false, message: 'ไม่พบ column Pinned' });

        await batchUpdate(sheets, [{
          range: `${SHEET_TICKETS}!${colLetter(idx.pinned)}${row}`, value: String(pinned),
        }]);
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
