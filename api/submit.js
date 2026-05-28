// api/submit.js v6 — UUID-based IDs (ไม่มี Race Condition)
// POST /api/submit — บันทึก ticket พร้อมหมายเหตุผู้ใช้และไฟล์แนบ (base64)
//
// [แก้ไข] เปลี่ยน generateUserID และ generateTicketId เป็น UUID-based
// เพื่อป้องกัน Race Condition ใน Serverless (Vercel) ที่รันหลาย instance พร้อมกัน
// ไม่ต้องอ่าน/เขียน Counter ใน Google Sheets อีกต่อไป
//
// โครงสร้างคอลัมน์ VOC_Tickets (15 cols + Pinned + Comments):
// A:UserID B:TicketID C:Username D:วันที่ E:ประเภทผู้แจ้ง F:ชื่อ
// G:รหัส H:ประเภทเรื่อง I:ความเร่งด่วน J:หัวข้อ K:รายละเอียด
// L:หมายเหตุผู้ใช้ M:สถานะ N:ผู้รับผิดชอบ O:กำหนดตอบกลับ
// P:Comments(ครู) Q:Pinned R:FileURL

const {
  getSheetsClient, appendRow,
  generateUserID, generateTicketId,   // ← ใหม่: ไม่รับ sheets เป็น argument
  SHEET_TICKETS,
  calcDueDate, formatDateThai, setCorsHeaders,
} = require('./_sheets');

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

    // [แก้ไข] สร้าง ID ทันทีบน server โดยไม่ต้องอ่าน/เขียน Sheets
    // ป้องกัน Race Condition อย่างสมบูรณ์
    const userId   = generateUserID();     // UUID เต็ม: "a1b2c3d4-e5f6-..."
    const ticketId = generateTicketId();   // VOC-2568-A1B2C3D4

    const now     = new Date();
    const dueDate = calcDueDate(now, p.priority);

    const fileInfo = p.fileData
      ? p.fileData
      : (p.fileName ? `[แนบไฟล์: ${p.fileName}]` : '');
    const userNote = (p.userNote || '').replace(/\r?\n/g, ' ↵ ').trim();

    await appendRow(sheets, SHEET_TICKETS, [
      userId,                                                    // A: UserID (UUID)
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
      userNote,                                                  // L: หมายเหตุ (ผู้ใช้)
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
