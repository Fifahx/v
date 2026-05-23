// api/dashboard.js
// GET /api/dashboard — สถิติภาพรวม (admin)
// ใช้ตำแหน่งคอลัมน์ใหม่:
//   col9  = ความเร่งด่วน (I)
//   col8  = ประเภทเรื่อง (H)
//   col5  = ประเภทผู้แจ้ง (E)
//   col12 = สถานะ (L)
//   col4  = วันที่แจ้ง (D)

const {
  getSheetsClient, getSheetData,
  SHEET_TICKETS, setCorsHeaders,
} = require('./_sheets');

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
    };

    if (!data || data.length <= 1) return res.json({ success: true, stats });

    const headers      = data[0];
    const statusIdx    = headers.indexOf('สถานะ');
    const categoryIdx  = headers.indexOf('ประเภทเรื่อง');
    const custTypeIdx  = headers.indexOf('ประเภทผู้แจ้ง');
    const dateIdx      = headers.indexOf('วันที่แจ้ง');

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      stats.total++;

      const status   = String(data[i][statusIdx]   || '');
      const category = String(data[i][categoryIdx] || '');
      const custType = String(data[i][custTypeIdx] || '');
      const dateStr  = String(data[i][dateIdx]     || '');

      if      (status === 'รอดำเนินการ')        stats.pending++;
      else if (status === 'กำลังดำเนินการ')      stats.inprogress++;
      else if (status === 'เสร็จสิ้น')           stats.done++;
      else if (status === 'ปฏิเสธ')              stats.rejected++;

      if (category) stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
      if (custType) stats.byCustomer[custType] = (stats.byCustomer[custType] || 0) + 1;

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
