// api/submit.js
// POST /api/submit — บันทึก ticket ใหม่ตามโครงสร้างคอลัมน์ใหม่

const {
  getSheetsClient, getSheetData, appendRow, generateUserID,
  SHEET_TICKETS, SHEET_COUNTERS, SPREADSHEET_ID,
  calcDueDate, formatDateThai, setCorsHeaders,
} = require('./_sheets');

// ── สร้าง Ticket ID (VOC-2568-XXXX) ──
async function generateTicketId(sheets) {
  const thYear = String(new Date().getFullYear() + 543);
  const data   = await getSheetData(sheets, SHEET_COUNTERS);

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === thYear) {
      const n = Number(data[i][1]) + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `VOC_Counters!B${i + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[n]] },
      });
      return `VOC-${thYear}-${String(n).padStart(4, '0')}`;
    }
  }
  await appendRow(sheets, SHEET_COUNTERS, [thYear, 1]);
  return `VOC-${thYear}-0001`;
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const payload  = req.body;
    const sheets   = await getSheetsClient();

    // สร้าง UserID (primary key) และ Ticket ID พร้อมกัน
    const [userId, ticketId] = await Promise.all([
      generateUserID(sheets),
      generateTicketId(sheets),
    ]);

    const now     = new Date();
    const dueDate = calcDueDate(now, payload.priority);

    // บันทึกตามลำดับคอลัมน์ใหม่:
    // UserID | Ticket ID | Username | วันที่แจ้ง | ประเภทผู้แจ้ง | ชื่อ |
    // รหัสนักศึกษา/หน่วยงาน | ประเภทเรื่อง | ความเร่งด่วน | หัวข้อ |
    // รายละเอียด | สถานะ | ผู้รับผิดชอบ | กำหนดตอบกลับ | หมายเหตุ
    await appendRow(sheets, 'VOC_Tickets', [
      userId,                                                          // col 1  UserID
      ticketId,                                                        // col 2  Ticket ID
      payload.username || '',                                          // col 3  Username
      formatDateThai(now),                                             // col 4  วันที่แจ้ง
      payload.customerType || '',                                      // col 5  ประเภทผู้แจ้ง
      payload.isAnon ? 'นิรนาม' : (payload.name     || ''),           // col 6  ชื่อ
      payload.isAnon ? '-'      : (payload.studentId || ''),           // col 7  รหัสนักศึกษา/หน่วยงาน
      (payload.categories || []).join(', '),                           // col 8  ประเภทเรื่อง
      payload.priority  || 'medium',                                   // col 9  ความเร่งด่วน
      payload.subject   || '',                                         // col 10 หัวข้อ
      payload.detail    || '',                                         // col 11 รายละเอียด
      'รอดำเนินการ',                                                   // col 12 สถานะ
      '',                                                              // col 13 ผู้รับผิดชอบ
      dueDate,                                                         // col 14 กำหนดตอบกลับ
      '',                                                              // col 15 หมายเหตุ
    ]);

    res.json({ success: true, ticketId, userId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
};
