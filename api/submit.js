// api/submit.js v6
// POST /api/submit — บันทึก ticket พร้อมหมายเหตุผู้ใช้และไฟล์แนบ (base64)
//
// [แก้ไข v6] เปลี่ยน ID generation เป็น UUID-based
// ป้องกัน Race Condition ใน Serverless (Vercel) ที่รันหลาย instance พร้อมกัน
//
// Column mapping ตรงกับ VOC_Tickets sheet (18 cols):
// A: UUID        B: Ticket ID     C: Username       D: วันที่แจ้ง
// E: ประเภทผู้แจ้ง F: ชื่อ        G: นักศึกษา/หน่วยงาน H: ประเภทเรื่อง
// I: ความเร่งด่วน J: หัวข้อ       K: รายละเอียด    L: หมายเหตุ(ผู้ใช้)
// M: สถานะ       N: ผู้รับผิดชอบ  O: กำหนดตอบกลับ  P: Comments
// Q: Pinned      R: ไฟล์แนบ

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

    // ── ประมวลผลไฟล์แนบ ──
    // ถ้ามี base64 (fileData) ให้เก็บ, ถ้าไม่มีเก็บแค่ชื่อไฟล์
    // หมายเหตุ: base64 ขนาดใหญ่อาจเกิน limit ของ Google Sheets cell (~50000 chars)
    let fileInfo = '';
    if (p.fileData && p.fileData.startsWith('data:')) {
      if (p.fileData.length > 45000) {
        // ไฟล์ใหญ่เกินไป — เก็บแค่ชื่อไว้ก่อน
        fileInfo = p.fileName ? `[แนบไฟล์: ${p.fileName} — ไฟล์ใหญ่เกิน 30KB]` : '[ไฟล์ใหญ่เกินไป]';
      } else {
        fileInfo = p.fileData;
      }
    } else if (p.fileName) {
      fileInfo = `[แนบไฟล์: ${p.fileName}]`;
    }

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
      fileInfo,                        // R: ไฟล์แนบ
    ]);

    // ส่ง email แจ้งเตือน (fire-and-forget ไม่ block response)
    sendNotifyEmail(ticketId, p);

    return res.json({ success: true, ticketId, userId });

  } catch (e) {
    console.error('submit error:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
};
