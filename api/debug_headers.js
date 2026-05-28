// api/debug_headers.js
// GET /api/debug_headers — ดู header row และ index จริงๆ ใน Sheet
// ⚠️ ใช้แค่ debug แล้วลบออก อย่า deploy ทิ้งไว้

const { getSheetsClient, getSheetData, SHEET_TICKETS, setCorsHeaders } = require('./_sheets');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  try {
    const sheets  = await getSheetsClient();
    const data    = await getSheetData(sheets, SHEET_TICKETS);
    const headers = data[0] || [];

    // แสดง header แต่ละตัวพร้อม index และ column letter
    const headerInfo = headers.map((h, i) => {
      const col = String.fromCharCode(65 + i);
      return { index: i, col, header: h };
    });

    // แสดง row แรกของข้อมูลด้วย (row 2 ใน Sheet)
    const firstRow = data[1] || [];
    const firstRowInfo = headers.map((h, i) => ({
      col: String.fromCharCode(65 + i),
      header: h,
      value: firstRow[i] || '(ว่าง)',
    }));

    return res.json({
      success: true,
      totalHeaders: headers.length,
      headers: headerInfo,
      firstRowSample: firstRowInfo,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
