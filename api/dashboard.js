// api/dashboard.js
// GET /api/dashboard         — สถิติภาพรวม + ความเร่งด่วน (admin)
// GET /api/dashboard?action=pageviews  — อ่าน pageview stats
// POST /api/dashboard?action=pageviews — นับ pageview +1

const {
  getSheetsClient, getSheetData, batchUpdate,
  SHEET_TICKETS, SPREADSHEET_ID, setCorsHeaders,
} = require('./_sheets');

// ══════════════════════════════════════════════════════
//  PAGEVIEW HELPERS
// ══════════════════════════════════════════════════════
const PV_SHEET = 'PageViews';

async function _pvEnsureHeader(sheets) {
  const rows = await getSheetData(sheets, PV_SHEET);
  if (rows.length === 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: PV_SHEET,
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          ['key', 'value'],
          ['total', '0'],
          ['today', `${new Date().toLocaleDateString('en-CA')}|0`],
          ['updated', new Date().toISOString()],
        ],
      },
    });
  }
}

async function _pvRead(sheets) {
  const rows = await getSheetData(sheets, PV_SHEET);
  const todayStr = new Date().toLocaleDateString('en-CA');
  let total = 0, todayCount = 0, updated = null;
  if (rows.length >= 2) total = parseInt(rows[1]?.[1] || '0', 10) || 0;
  if (rows.length >= 3) {
    const [d, c] = (rows[2]?.[1] || '').split('|');
    todayCount = d === todayStr ? (parseInt(c, 10) || 0) : 0;
  }
  if (rows.length >= 4) updated = rows[3]?.[1] || null;
  return { total, todayCount, updated, todayStr };
}

async function _pvIncrement(sheets) {
  await _pvEnsureHeader(sheets);
  const { total, todayCount, todayStr } = await _pvRead(sheets);
  const now = new Date().toISOString();
  await batchUpdate(sheets, [
    { range: `${PV_SHEET}!B2`, value: String(total + 1) },
    { range: `${PV_SHEET}!B3`, value: `${todayStr}|${todayCount + 1}` },
    { range: `${PV_SHEET}!B4`, value: now },
  ]);
  return { total: total + 1, todayCount: todayCount + 1, updated: now };
}

// ══════════════════════════════════════════════════════
//  HANDLER
// ══════════════════════════════════════════════════════
module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query?.action || '';

  // ── Pageview branch ──
  if (action === 'pageviews') {
    try {
      const sheets = await getSheetsClient();
      let data;
      if (req.method === 'POST') {
        data = await _pvIncrement(sheets);
      } else {
        await _pvEnsureHeader(sheets);
        data = await _pvRead(sheets);
      }
      return res.status(200).json({ success: true, ...data });
    } catch (err) {
      console.error('[pageviews]', err.message);
      return res.status(200).json({ success: false, total: 0, todayCount: 0, updated: null });
    }
  }

  // ── Dashboard stats branch (เดิม) ──
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sheets = await getSheetsClient();
    const data = await getSheetData(sheets, SHEET_TICKETS);

    const stats = {
      total: 0, pending: 0, approved: 0, inprogress: 0, done: 0, rejected: 0,
      byCategory: {}, byCustomer: {}, byMonth: {},
      byPriority: { high: 0, medium: 0, low: 0 },
      urgentTickets: [],
    };

    if (!data || data.length <= 1) return res.json({ success: true, stats });

    const headers = data[0];
    const statusIdx = headers.indexOf('สถานะ');
    const categoryIdx = headers.indexOf('ประเภทเรื่อง');
    const custTypeIdx = headers.indexOf('ประเภทผู้แจ้ง');
    const dateIdx = headers.indexOf('วันที่แจ้ง');
    const priorityIdx = headers.indexOf('ความเร่งด่วน');
    const subjectIdx = headers.indexOf('หัวข้อ');
    const ticketIdIdx = headers.indexOf('Ticket ID');
    const dueIdx = headers.indexOf('กำหนดตอบกลับ');
    const assigneeIdx = headers.indexOf('ผู้รับผิดชอบ');

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      stats.total++;

      const status = String(data[i][statusIdx] || '');
      const category = String(data[i][categoryIdx] || '');
      const custType = String(data[i][custTypeIdx] || '');
      const dateStr = String(data[i][dateIdx] || '');
      const priority = String(data[i][priorityIdx] || 'medium').toLowerCase();

      if (status === 'รอดำเนินการ') stats.pending++;
      else if (status === 'รอตรวจสอบ') stats.approved++;
      else if (status === 'กำลังดำเนินการ') stats.inprogress++;
      else if (status === 'เสร็จสิ้น') stats.done++;
      else if (status === 'ปฏิเสธ') stats.rejected++;

      if (category) stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
      if (custType) stats.byCustomer[custType] = (stats.byCustomer[custType] || 0) + 1;

      if (priority === 'high') stats.byPriority.high++;
      else if (priority === 'medium') stats.byPriority.medium++;
      else stats.byPriority.low++;

      if (priority === 'high' && status !== 'เสร็จสิ้น' && status !== 'ปฏิเสธ') {
        stats.urgentTickets.push({
          ticketId: String(data[i][ticketIdIdx] || ''),
          subject: String(data[i][subjectIdx] || ''),
          status,
          due: String(data[i][dueIdx] || ''),
          assignee: String(data[i][assigneeIdx] || ''),
        });
      }

      if (dateStr.length >= 10) {
        const parts = dateStr.split('/');
        if (parts.length >= 3) {
          const monthKey = parts[1] + '/' + parts[2].substring(0, 4);
          stats.byMonth[monthKey] = (stats.byMonth[monthKey] || 0) + 1;
        }
      }
    }

    res.json({ success: true, stats });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
};