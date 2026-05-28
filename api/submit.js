// api/submit.js v5
// POST /api/submit — บันทึก ticket พร้อมหมายเหตุผู้ใช้และไฟล์แนบ (base64)
//
// โครงสร้างคอลัมน์ VOC_Tickets (15 cols + Pinned + Comments):
// A:UserID B:TicketID C:Username D:วันที่ E:ประเภทผู้แจ้ง F:ชื่อ
// G:รหัส H:ประเภทเรื่อง I:ความเร่งด่วน J:หัวข้อ K:รายละเอียด
// L:หมายเหตุผู้ใช้ M:สถานะ N:ผู้รับผิดชอบ O:กำหนดตอบกลับ
// P:Comments(ครู) Q:Pinned R:FileURL

const {
  getSheetsClient, getSheetData, appendRow, generateUserID,
  SHEET_TICKETS, SHEET_COUNTERS, SPREADSHEET_ID,
  calcDueDate, formatDateThai, setCorsHeaders,
} = require('./_sheets');

async function generateTicketId(sheets) {
  const thYear = String(new Date().getFullYear() + 543);
  const data   = await getSheetData(sheets, SHEET_COUNTERS);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === thYear) {
      const n = Number(data[i][1]) + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID, range: `VOC_Counters!B${i+1}`,
        valueInputOption: 'RAW', requestBody: { values: [[n]] },
      });
      return `VOC-${thYear}-${String(n).padStart(4,'0')}`;
    }
  }
  await appendRow(sheets, SHEET_COUNTERS, [thYear, 1]);
  return `VOC-${thYear}-0001`;
}

async function sendNotifyEmail(ticketId, payload) {
  try {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}` : 'https://v-xi-beryl.vercel.app';
    await fetch(`${base}/api/notify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action:'sendAlert', ticketId,
        subject: payload.subject||'', priority: payload.priority||'medium',
        customerType: payload.customerType||'', detail: payload.detail||'' }),
    });
  } catch(e) { console.error('notify:', e.message); }
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const p      = req.body;
    const sheets = await getSheetsClient();
    const [userId, ticketId] = await Promise.all([
      generateUserID(sheets), generateTicketId(sheets)
    ]);
    const now     = new Date();
    const dueDate = calcDueDate(now, p.priority);

    // ไฟล์แนบ: เก็บ base64 ใน column R (ถ้ามี)
    // ในระบบจริงควร upload ไป Google Drive แล้วเก็บ URL
    // ตอนนี้เก็บชื่อไฟล์ไว้ก่อน
    // ไฟล์แนบ: ถ้า fileData (base64) มี ให้เก็บ base64 ถ้าไม่มีเก็บแค่ชื่อ
    const fileInfo = p.fileData
      ? p.fileData          // base64 data:xxx;base64,...
      : (p.fileName ? `[แนบไฟล์: ${p.fileName}]` : '');
    // Sanitize userNote: แทน newline ด้วย ↵ เพื่อป้องกัน Sheets แตกแถว
    const userNote = (p.userNote || '').replace(/\r?\n/g, ' ↵ ').trim();

    await appendRow(sheets, SHEET_TICKETS, [
      userId,                                                    // A: UserID
      ticketId,                                                  // B: Ticket ID
      p.username || '',                                          // C: Username
      formatDateThai(now),                                       // D: วันที่แจ้ง
      p.customerType || '',                                      // E: ประเภทผู้แจ้ง
      p.isAnon ? 'นิรนาม' : (p.name || ''),                    // F: ชื่อ
      p.isAnon ? '-'      : (p.studentId || ''),                 // G: รหัส
      (p.categories || []).join(', '),                           // H: ประเภทเรื่อง
      p.priority || 'medium',                                    // I: ความเร่งด่วน
      p.subject || '',                                           // J: หัวข้อ
      p.detail  || '',                                           // K: รายละเอียด
      userNote,                                                     // L: หมายเหตุ (ผู้ใช้)
      'รอดำเนินการ',                                             // M: สถานะ
      '',                                                        // N: ผู้รับผิดชอบ
      dueDate,                                                   // O: กำหนดตอบกลับ
      '',                                                        // P: Comments (ครู)
      '',                                                        // Q: Pinned
      fileInfo,                                                  // R: ไฟล์แนบ
    ]);

    sendNotifyEmail(ticketId, p);
    res.json({ success: true, ticketId, userId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
};
