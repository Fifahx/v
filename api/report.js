// api/report.js
// GET /api/report?type=service            — 2.1 รายงานสรุปการให้บริการ
// GET /api/report?type=users              — 2.2 รายการสรุปผู้ใช้บริการ
// GET /api/report?type=duration           — 2.3 สรุปเวลาให้บริการสำเร็จ
// GET /api/report?type=monthly            — 2.4 สรุปการให้บริการรายเดือน
// GET /api/report?type=userSummary&username=xxx — 3 สรุปรายบุคคล

const {
  getSheetsClient, getSheetData,
  SHEET_TICKETS, SHEET_USERS, setCorsHeaders,
} = require('./_sheets');

// คำนวณวันที่ระหว่าง 2 string วันไทย (dd/mm/yyyy hh:mm)
function parseDateThai(str) {
  if (!str) return null;
  // รูปแบบ: 15/05/2568 14:30 → แปลงปี BE→CE
  const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const year = Number(m[3]) > 2500 ? Number(m[3]) - 543 : Number(m[3]);
  return new Date(year, Number(m[2])-1, Number(m[1]),
    Number(m[4]||0), Number(m[5]||0));
}
function diffHours(a, b) {
  if (!a || !b) return null;
  const d = (b - a) / 3600000;
  return d >= 0 ? Math.round(d * 10) / 10 : null;
}
function monthKey(dateStr) {
  const d = parseDateThai(dateStr);
  if (!d) return 'ไม่ระบุ';
  return `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()+543}`;
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sheets  = await getSheetsClient();
    const data    = await getSheetData(sheets, SHEET_TICKETS);
    if (!data || data.length <= 1) return res.json({ success: true, report: {} });

    const headers     = data[0];
    const idx = {
      ticketId  : headers.indexOf('Ticket ID'),
      username  : headers.indexOf('Username'),
      status    : headers.indexOf('สถานะ'),
      category  : headers.indexOf('ประเภทเรื่อง'),
      custType  : headers.indexOf('ประเภทผู้แจ้ง'),
      priority  : headers.indexOf('ความเร่งด่วน'),
      date      : headers.indexOf('วันที่แจ้ง'),
      due       : headers.indexOf('กำหนดตอบกลับ'),
      subject   : headers.indexOf('หัวข้อ'),
      name      : headers.indexOf('ชื่อ'),
      assignee  : headers.indexOf('ผู้รับผิดชอบ'),
      comments  : headers.indexOf('Comments'),
      rating    : -1, // ดึงจาก VOC_Ratings แทน
    };

    const rows = data.slice(1).filter(r => r[0] && r[idx.ticketId]);

    const { type, username } = req.query;

    // ════ 2.1 รายงานสรุปการให้บริการ ════
    if (type === 'service') {
      const total     = rows.length;
      const byStatus  = {};
      const byCategory = {};
      const byPriority = { high: 0, medium: 0, low: 0 };
      const byAssignee = {};
      rows.forEach(r => {
        const s = r[idx.status] || 'ไม่ระบุ';
        const c = r[idx.category] || 'ไม่ระบุ';
        const p = (r[idx.priority] || 'medium').toLowerCase();
        const a = r[idx.assignee] || 'ยังไม่มอบหมาย';
        byStatus[s]   = (byStatus[s]||0) + 1;
        byCategory[c] = (byCategory[c]||0) + 1;
        if (p in byPriority) byPriority[p]++;
        byAssignee[a] = (byAssignee[a]||0) + 1;
      });
      const done      = byStatus['เสร็จสิ้น'] || 0;
      const rejected  = byStatus['ปฏิเสธ'] || 0;
      const pending   = (byStatus['รอดำเนินการ']||0) + (byStatus['กำลังดำเนินการ']||0);
      return res.json({ success: true, report: {
        total, done, rejected, pending,
        successRate: total ? Math.round(done/total*100) : 0,
        byStatus, byCategory, byPriority, byAssignee,
      }});
    }

    // ════ 2.2 รายการสรุปผู้ใช้บริการ ════
    if (type === 'users') {
      const userMap = {};
      rows.forEach(r => {
        const u = r[idx.username] || 'anonymous';
        if (!userMap[u]) userMap[u] = { username: u, name: r[idx.name]||'', total: 0, done: 0, pending: 0, categories: {} };
        userMap[u].total++;
        const s = r[idx.status] || '';
        if (s === 'เสร็จสิ้น') userMap[u].done++;
        else if (s === 'รอดำเนินการ' || s === 'กำลังดำเนินการ') userMap[u].pending++;
        const c = r[idx.category] || 'ไม่ระบุ';
        userMap[u].categories[c] = (userMap[u].categories[c]||0) + 1;
      });
      const users = Object.values(userMap)
        .sort((a,b) => b.total - a.total)
        .map(u => ({ ...u,
          topCategory: Object.entries(u.categories).sort((a,b)=>b[1]-a[1])[0]?.[0] || '-',
          successRate: u.total ? Math.round(u.done/u.total*100) : 0,
        }));
      return res.json({ success: true, report: { users, totalUsers: users.length }});
    }

    // ════ 2.3 สรุปเวลาให้บริการสำเร็จ ════
    if (type === 'duration') {
      const durations = [];
      const byPriority = { high: [], medium: [], low: [] };
      rows.forEach(r => {
        if ((r[idx.status]||'') !== 'เสร็จสิ้น') return;
        const start = parseDateThai(r[idx.date]);
        const due   = parseDateThai(r[idx.due]);
        const hours = diffHours(start, due);
        if (hours === null || hours <= 0) return;
        const p = (r[idx.priority]||'medium').toLowerCase();
        const entry = {
          ticketId: r[idx.ticketId], subject: r[idx.subject]||'',
          date: r[idx.date], priority: p, hours,
        };
        durations.push(entry);
        if (p in byPriority) byPriority[p].push(hours);
      });
      const avg = h => h.length ? Math.round(h.reduce((a,b)=>a+b,0)/h.length*10)/10 : null;
      return res.json({ success: true, report: {
        total: durations.length,
        avgHours: avg(durations.map(d=>d.hours)),
        avgByPriority: {
          high:   avg(byPriority.high),
          medium: avg(byPriority.medium),
          low:    avg(byPriority.low),
        },
        items: durations.slice(0,50),
      }});
    }

    // ════ 2.4 สรุปการให้บริการรายเดือน ════
    if (type === 'monthly') {
      const monthly = {};
      rows.forEach(r => {
        const mk = monthKey(r[idx.date]);
        if (!monthly[mk]) monthly[mk] = { month: mk, total:0, done:0, pending:0, rejected:0, high:0, medium:0, low:0 };
        monthly[mk].total++;
        const s = r[idx.status]||'';
        if (s==='เสร็จสิ้น') monthly[mk].done++;
        else if (s==='ปฏิเสธ') monthly[mk].rejected++;
        else monthly[mk].pending++;
        const p = (r[idx.priority]||'medium').toLowerCase();
        if (p in monthly[mk]) monthly[mk][p]++;
      });
      const months = Object.values(monthly).sort((a,b)=>a.month.localeCompare(b.month));
      return res.json({ success: true, report: { months }});
    }

    // ════ 3. สรุปรายบุคคล ════
    if (type === 'userSummary' && username) {
      const uRows = rows.filter(r =>
        String(r[idx.username]||'').toLowerCase() === username.toLowerCase()
      );
      const total = uRows.length;
      const byStatus  = {};
      const byCategory = {};
      const byPriority = { high:0, medium:0, low:0 };
      const byMonth = {};
      const recentTickets = [];
      uRows.forEach(r => {
        const s = r[idx.status]||'ไม่ระบุ';
        const c = r[idx.category]||'ไม่ระบุ';
        const p = (r[idx.priority]||'medium').toLowerCase();
        const mk = monthKey(r[idx.date]);
        byStatus[s]   = (byStatus[s]||0) + 1;
        byCategory[c] = (byCategory[c]||0) + 1;
        if (p in byPriority) byPriority[p]++;
        byMonth[mk]   = (byMonth[mk]||0) + 1;
        recentTickets.push({
          ticketId: r[idx.ticketId], subject: r[idx.subject]||'',
          status: s, priority: p, date: r[idx.date]||'',
          category: c, assignee: r[idx.assignee]||'',
        });
      });
      const done = byStatus['เสร็จสิ้น']||0;
      const months = Object.entries(byMonth).sort((a,b)=>a[0].localeCompare(b[0]));
      return res.json({ success: true, report: {
        username, total,
        done, pending: (byStatus['รอดำเนินการ']||0)+(byStatus['กำลังดำเนินการ']||0),
        rejected: byStatus['ปฏิเสธ']||0,
        successRate: total ? Math.round(done/total*100) : 0,
        byStatus, byCategory, byPriority, byMonth: months,
        recentTickets: recentTickets.reverse().slice(0,20),
      }});
    }

    res.status(400).json({ error: 'Unknown report type' });
  } catch(e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
};
