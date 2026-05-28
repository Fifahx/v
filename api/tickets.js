// api/tickets.js v8
// [แก้ไข v8] แก้ปัญหา comment ไม่แสดงบนเว็บ
//
// สาเหตุจริง: rowToObj() ใช้ header จาก Sheet จริงเป็น key
// แต่ frontend (app.js) ดึงข้อมูลด้วย key ชุดเก่า เช่น:
//   t['UserID']       ← Sheet มี 'UUID'
//   t['หมายเหตุผู้ใช้'] ← Sheet มี 'หมายเหตุ(ผู้ใช้)'
//   t['FileURL']      ← Sheet มี 'ไฟล์แนบ'
//   t['Comments']     ← ตรงแล้ว แต่ index ผิดเพราะ header อื่นเพี้ยน
//
// วิธีแก้: ใช้ HEADER_MAP แมปชื่อ Sheet → ชื่อที่ frontend เข้าใจ
// ทำให้ rowToObj() ส่ง key ที่ถูกต้องไปให้ frontend เสมอ

const {
  getSheetsClient, getSheetData, batchUpdate,
  SHEET_TICKETS, SPREADSHEET_ID, setCorsHeaders, formatDateThai,
} = require('./_sheets');

// แมปชื่อ header ใน Sheet จริง → ชื่อ key ที่ frontend (app.js) ใช้
// ถ้าชื่อตรงกันอยู่แล้วไม่ต้องใส่
const HEADER_MAP = {
  'UUID':              'UserID',          // Sheet: UUID  → frontend: UserID
  'หมายเหตุ(ผู้ใช้)': 'หมายเหตุผู้ใช้', // Sheet: หมายเหตุ(ผู้ใช้) → frontend: หมายเหตุผู้ใช้
  'ไฟล์แนบ':          'FileURL',          // Sheet: ไฟล์แนบ → frontend: FileURL
  'นักศึกษา/หน่วยงาน': 'รหัส',           // Sheet: นักศึกษา/หน่วยงาน → frontend ไม่ได้ใช้ แต่ map ไว้
};

// แปลง 0-based column index → Excel letter
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

// แปลงแถว → object โดยแมป key ตาม HEADER_MAP
function rowToObj(headers, row) {
  const o = {};
  headers.forEach((h, i) => {
    const key = HEADER_MAP[h] || h;  // แมปชื่อถ้ามี ไม่งั้นใช้ชื่อเดิม
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

    // หา index จากชื่อ header ใน Sheet จริง (ทั้งชื่อเดิมและชื่อที่อาจเปลี่ยน)
    // รองรับทั้ง 2 รูปแบบเพื่อความปลอดภัย
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
      comments : findIdx('Comments'),                          // col P
      pinned   : findIdx('Pinned'),                            // col Q
    };

    // ════════════════ GET ════════════════
    if (req.method === 'GET') {
      const { action, username, id, filter } = req.query;

      if (action === 'pinned') {
        if (idx.pinned === -1) return res.json({ success: true, tickets: [] });
        const results = [];
        for (let i = 1; i < data.length; i++) {
          if (!data[i] || !data[i][0]) continue;
          if (String(data[i][idx.pinned] || '').trim().toLowerCase() === 'true')
            results.push(rowToObj(headers, data[i]));
        }
        return res.json({ success: true, tickets: results });
      }

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

      if (action === 'byId') {
        if (idx.ticketId === -1)
          return res.json({ success: false, message: 'ไม่พบ Ticket ID นี้' });
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][idx.ticketId] || '') === String(id))
            return res.json({ success: true, ticket: rowToObj(headers, data[i]) });
        }
        return res.json({ success: false, message: 'ไม่พบ Ticket ID นี้' });
      }

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

      function findRow(tid) {
        if (idx.ticketId === -1) return -1;
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][idx.ticketId] || '') === String(tid)) return i + 1;
        }
        return -1;
      }

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
        if (row < 0)
          return res.json({ success: false, message: 'ไม่พบ Ticket' });
        if (idx.comments === -1)
          return res.json({ success: false, message: 'ไม่พบ column "Comments" ใน Sheet — header row อาจไม่ตรง' });

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
