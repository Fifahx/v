// api/submit.js v7
// POST /api/submit — บันทึก ticket พร้อมหมายเหตุผู้ใช้และ URL ไฟล์แนบ
//
// [แก้ไข v7] เปลี่ยนการรับไฟล์แนบ:
//   เดิม: รับ fileData (base64) → crash เมื่อไฟล์ > ~35 KB
//   ใหม่: รับ fileUrl (string URL จาก /api/upload) เท่านั้น
//         ห้ามบันทึก base64 ลง Google Sheets โดยตรง
//
// Column mapping ตรงกับ VOC_Tickets sheet (18 cols):
// A: UUID        B: Ticket ID     C: Username       D: วันที่แจ้ง
// E: ประเภทผู้แจ้ง F: ชื่อ        G: นักศึกษา/หน่วยงาน H: ประเภทเรื่อง
// I: ความเร่งด่วน J: หัวข้อ       K: รายละเอียด    L: หมายเหตุ(ผู้ใช้)
// M: สถานะ       N: ผู้รับผิดชอบ  O: กำหนดตอบกลับ  P: Comments
// Q: Pinned      R: FileURL (Google Drive link)

const {
  getSheetsClient, appendRow,
  SHEET_TICKETS,
  calcDueDate, formatDateThai, setCorsHeaders,
} = require('./_sheets');

const crypto = require('crypto');

// ── สร้าง UserID แบบ UUID (ไม่มี Race Condition) ──
function generateUserID() {
  return crypto.randomUUID();
}

// ── สร้าง Ticket ID แบบ UUID-based (ไม่มี Race Condition) ──
// Format: VOC-{ปีไทย}-{8 hex} เช่น VOC-2568-A1B2C3D4
function generateTicketId() {
  const thYear = String(new Date().getFullYear() + 543);
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `VOC-${thYear}-${suffix}`;
}

async function sendNotifyEmail(ticketId, payload) {
  try {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}` : 'https://v-xi-beryl.vercel.app';
    await fetch(`${base}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sendAlert',
        ticketId,
        subject:      payload.subject      || '',
        priority:     payload.priority     || 'medium',
        customerType: payload.customerType || '',
        detail:       payload.detail       || '',
      }),
    });
  } catch (e) {
    console.error('notify error:', e.message);
  }
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const p = req.body;

    // Validation เบื้องต้น
    if (!p.subject || !p.detail) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกหัวข้อและรายละเอียด' });
    }

    const sheets   = await getSheetsClient();

    // สร้าง ID ทันทีบน server — ไม่ต้องอ่าน/เขียน Sheets เลย ไม่มี Race Condition
    const userId   = generateUserID();    // UUID เต็ม เช่น "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    const ticketId = generateTicketId(); // VOC-2568-A1B2C3D4

    const now     = new Date();
    const dueDate = calcDueDate(now, p.priority);

    // ── ประมวลผลไฟล์แนบ (v7) ──
    // รับเฉพาะ URL จาก /api/upload (Google Drive) เท่านั้น
    // ❌ ห้ามรับ base64 (fileData) — จะทำให้ Google Sheets Crash ทันที
    //    (ไฟล์ 5 MB → base64 ~6.7 ล้านตัวอักษร แต่ Sheets จำกัด 50,000 ต่อ cell)
    const fileUrl = (typeof p.fileUrl === 'string' && p.fileUrl.startsWith('https://'))
      ? p.fileUrl.slice(0, 500)   // ป้องกัน string ยาวผิดปกติ
      : '';

    // ── Sanitize userNote ──
    // แทน newline ด้วย ↵ เพื่อป้องกัน Google Sheets แตกแถว
    const userNote = (p.userNote || '').replace(/\r?\n/g, ' ↵ ').trim();

    // ── ชื่อและรหัส: แยกกรณีนิรนาม ──
    const displayName = p.isAnon ? 'นิรนาม' : (p.name      || '');
    const displayId   = p.isAnon ? '-'       : (p.studentId || '');

    // ── ประเภทเรื่อง: รองรับทั้ง Array และ String ──
    const categories = Array.isArray(p.categories)
      ? p.categories.join(', ')
      : (p.categories || '');

    // ── append ลง Sheet ตาม column order ที่กำหนด ──
    await appendRow(sheets, SHEET_TICKETS, [
      userId,                          // A: UUID
      ticketId,                        // B: Ticket ID (VOC-2568-XXXXXXXX)
      p.username      || 'guest',      // C: Username
      formatDateThai(now),             // D: วันที่แจ้ง
      p.customerType  || '',           // E: ประเภทผู้แจ้ง
      displayName,                     // F: ชื่อ
      displayId,                       // G: นักศึกษา/หน่วยงาน
      categories,                      // H: ประเภทเรื่อง
      p.priority      || 'medium',     // I: ความเร่งด่วน
      p.subject       || '',           // J: หัวข้อ
      p.detail        || '',           // K: รายละเอียด
      userNote,                        // L: หมายเหตุ(ผู้ใช้)
      'รอดำเนินการ',                   // M: สถานะ
      '',                              // N: ผู้รับผิดชอบ
      dueDate,                         // O: กำหนดตอบกลับ
      '',                              // P: Comments (ครู/อาจารย์)
      '',                              // Q: Pinned
      fileUrl,                         // R: FileURL (Google Drive link หรือ '')
    ]);

    // ส่ง email แจ้งเตือน (fire-and-forget ไม่ block response)
    sendNotifyEmail(ticketId, p);

    return res.json({ success: true, ticketId, userId });

  } catch (e) {
    console.error('submit error:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
};
