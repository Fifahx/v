// api/dashboard.js
// GET /api/dashboard  — สถิติภาพรวม (admin)

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

    const stats = { total:0, pending:0, inprogress:0, done:0, rejected:0,
                    byCategory:{}, byCustomer:{}, byMonth:{} };

    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      stats.total++;
      const status   = String(data[i][9]  || '');
      const category = String(data[i][5]  || '');
      const custType = String(data[i][2]  || '');
      const dateStr  = String(data[i][1]  || '');

      if      (status === 'รอดำเนินการ')        stats.pending++;
      else if (status === 'กำลังดำเนินการ')      stats.inprogress++;
      else if (status === 'เสร็จสิ้น')           stats.done++;
      else if (status === 'ปฏิเสธ')              stats.rejected++;

      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
      stats.byCustomer[custType] = (stats.byCustomer[custType] || 0) + 1;

      // วันที่รูปแบบ dd/MM/yyyy HH:mm → ดึง month/year
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
