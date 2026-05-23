// api/dashboard.js
// GET /api/dashboard — สถิติภาพรวม + ความเร่งด่วน (admin)

const { getSheetsClient, getSheetData, SHEET_TICKETS, setCorsHeaders } = require('./_sheets');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sheets = await getSheetsClient();
    const data   = await getSheetData(sheets, SHEET_TICKETS);

    const stats = {
      total: 0, pending: 0, inprogress: 0, done: 0, rejected: 0,
      byCategory: {}, byCustomer: {}, byMonth: {},
      byPriority: { high: 0, medium: 0, low: 0 },
      // สรุปเฉพาะ ticket เร่งด่วนที่ยังไม่เสร็จ
      urgentTickets: [],
    };

    if (!data || data.length <= 1) return res.json({ success: true, stats });

    const headers      = data[0];
    const statusIdx    = headers.indexOf('สถานะ');
    const categoryIdx  = headers.indexOf('ประเภทเรื่อง');
    const custTypeIdx  = headers.indexOf('ประเภทผู้แจ้ง');
    const dateIdx      = headers.indexOf('วันที่แจ้ง');
    const priorityIdx  = headers.indexOf('ความเร่งด่วน');
    const subjectIdx   = headers.indexOf('หัวข้อ');
    const ticketIdIdx  = headers.indexOf('Ticket ID');
    const dueIdx       = headers.indexOf('กำหนดตอบกลับ');
    const assigneeIdx  = headers.indexOf('ผู้รับผิดชอบ');

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      stats.total++;

      const status   = String(data[i][statusIdx]   || '');
      const category = String(data[i][categoryIdx] || '');
      const custType = String(data[i][custTypeIdx] || '');
      const dateStr  = String(data[i][dateIdx]     || '');
      const priority = String(data[i][priorityIdx] || 'medium').toLowerCase();

      if      (status === 'รอดำเนินการ')        stats.pending++;
      else if (status === 'กำลังดำเนินการ')      stats.inprogress++;
      else if (status === 'เสร็จสิ้น')           stats.done++;
      else if (status === 'ปฏิเสธ')              stats.rejected++;

      if (category) stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
      if (custType) stats.byCustomer[custType] = (stats.byCustomer[custType] || 0) + 1;

      // นับตามความเร่งด่วน
      if      (priority === 'high')   stats.byPriority.high++;
      else if (priority === 'medium') stats.byPriority.medium++;
      else                            stats.byPriority.low++;

      // เก็บ ticket เร่งด่วนที่ยังไม่เสร็จ
      if (priority === 'high' && status !== 'เสร็จสิ้น' && status !== 'ปฏิเสธ') {
        stats.urgentTickets.push({
          ticketId: String(data[i][ticketIdIdx] || ''),
          subject:  String(data[i][subjectIdx]  || ''),
          status,
          due:      String(data[i][dueIdx]      || ''),
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
