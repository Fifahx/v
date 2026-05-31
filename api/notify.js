// api/notify.js
// POST /api/notify  { action:'setEmail', email }   ← admin ตั้ง email รับแจ้งเตือน
// POST /api/notify  { action:'sendAlert', ticketId, subject, priority } ← ส่ง email
// GET  /api/notify?action=getEmail               ← ดึง email ปัจจุบัน
//
// ใช้ Gmail SMTP ผ่าน Nodemailer
// ต้องตั้ง Environment Variables เพิ่ม:
//   NOTIFY_EMAIL   = admin@gmail.com   (email ผู้รับ)
//   GMAIL_USER     = sender@gmail.com  (email ผู้ส่ง)
//   GMAIL_PASS     = xxxx xxxx xxxx    (App Password จาก Google Account)
//
// วิธีสร้าง App Password:
//   Google Account → Security → 2-Step Verification → App passwords
//   สร้าง App สำหรับ "Mail" → คัดลอก 16 หลักมาใส่ GMAIL_PASS

const { getSheetsClient, getSheetData, withRetry, SHEET_COUNTERS, setCorsHeaders, SPREADSHEET_ID } = require('./_sheets');

// ── ส่ง email ผ่าน Gmail SMTP ──
async function sendEmail(to, subject, htmlBody) {
  // ใช้ fetch เรียก Gmail API แบบ basic แทน nodemailer
  // เพื่อไม่ต้องติดตั้ง package เพิ่ม
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_PASS;

  if (!user || !pass) throw new Error('ยังไม่ได้ตั้ง GMAIL_USER / GMAIL_PASS');

  // ใช้ nodemailer inline require (มาพร้อม node แต่ต้อง install ใน package.json)
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"VOC System มรย." <${user}>`,
    to,
    subject,
    html: htmlBody,
  });
}

// ── บันทึก/อ่าน notify email ใน VOC_Counters sheet ──
async function getNotifyEmail(sheets) {
  const data    = await getSheetData(sheets, SHEET_COUNTERS);
  const headers = data[0] || [];
  const colIdx  = headers.indexOf('NotifyEmail');
  if (colIdx === -1 || !data[1]) return process.env.NOTIFY_EMAIL || '';
  return String(data[1][colIdx] || process.env.NOTIFY_EMAIL || '');
}

async function setNotifyEmail(sheets, email) {
  const data    = await getSheetData(sheets, SHEET_COUNTERS);
  const headers = data[0] || [];
  let   colIdx  = headers.indexOf('NotifyEmail');

  if (colIdx === -1) {
    colIdx = headers.length;
    const colLetter = String.fromCharCode(65 + colIdx);
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `VOC_Counters!${colLetter}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['NotifyEmail']] },
    }), 'notify:setHeader');
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `VOC_Counters!${colLetter}2`,
      valueInputOption: 'RAW',
      requestBody: { values: [[email]] },
    }), 'notify:setValue1');
  } else {
    const colLetter = String.fromCharCode(65 + colIdx);
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `VOC_Counters!${colLetter}2`,
      valueInputOption: 'RAW',
      requestBody: { values: [[email]] },
    }), 'notify:setValue2');
  }
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheets = await getSheetsClient();

    if (req.method === 'GET') {
      const email = await getNotifyEmail(sheets);
      return res.json({ success: true, email });
    }

    if (req.method === 'POST') {
      const { action } = req.body;

      // ── ตั้ง email ──
      if (action === 'setEmail') {
        const { email } = req.body;
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          return res.json({ success: false, message: 'รูปแบบอีเมลไม่ถูกต้อง' });
        await setNotifyEmail(sheets, email);
        return res.json({ success: true, message: 'บันทึก email สำเร็จ' });
      }

      // ── ส่งแจ้งเตือน ticket ใหม่ ──
      if (action === 'sendAlert') {
        const { ticketId, subject, priority, customerType, detail } = req.body;
        const toEmail = await getNotifyEmail(sheets);
        if (!toEmail) return res.json({ success: false, message: 'ยังไม่ได้ตั้งค่า email' });

        const priorityLabel = { high: '🔴 เร่งด่วน', medium: '🟡 ปานกลาง', low: '🟢 ทั่วไป' };
        const pLabel = priorityLabel[priority] || priority;

        const html = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#2d6a4f;color:#fff;padding:20px;border-radius:8px 8px 0 0;">
              <h2 style="margin:0;">🔔 มี Ticket ใหม่เข้ามา</h2>
              <p style="margin:4px 0 0;opacity:.8;">VOC System | คณะวิทยาศาสตร์ฯ มรย.</p>
            </div>
            <div style="background:#f9f9f9;padding:24px;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px;">
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px;color:#666;width:140px;">Ticket ID</td><td style="padding:8px;font-weight:bold;color:#2d6a4f;">${ticketId}</td></tr>
                <tr style="background:#fff;"><td style="padding:8px;color:#666;">หัวข้อ</td><td style="padding:8px;">${subject}</td></tr>
                <tr><td style="padding:8px;color:#666;">ความเร่งด่วน</td><td style="padding:8px;">${pLabel}</td></tr>
                <tr style="background:#fff;"><td style="padding:8px;color:#666;">ประเภทผู้แจ้ง</td><td style="padding:8px;">${customerType || '-'}</td></tr>
                <tr><td style="padding:8px;color:#666;">รายละเอียด</td><td style="padding:8px;">${detail || '-'}</td></tr>
              </table>
              <div style="margin-top:20px;text-align:center;">
                <a href="https://v-xi-beryl.vercel.app/" style="background:#2d6a4f;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
                  เปิดระบบจัดการ
                </a>
              </div>
            </div>
          </div>`;

        await sendEmail(toEmail, `[VOC] Ticket ใหม่: ${ticketId} — ${subject}`, html);
        return res.json({ success: true, message: `ส่งแจ้งเตือนไปยัง ${toEmail} แล้ว` });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
};
