// api/profile.js
// GET   /api/profile?username=xxx
// PATCH /api/profile  { username, email?, phone?, lineId? }  ← แก้ได้เฉพาะ 3 field

const { getSheetsClient, getSheetData, SHEET_USERS, SPREADSHEET_ID, setCorsHeaders } = require('./_sheets');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheets = await getSheetsClient();
    const data   = await getSheetData(sheets, SHEET_USERS);

    // ── GET profile ──
    if (req.method === 'GET') {
      const { username } = req.query;
      if (!username) return res.status(400).json({ success: false, message: 'ไม่พบ username' });
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][6]||'').toLowerCase() === username.toLowerCase()) {
          return res.json({ success: true, profile: {
            registeredAt: String(data[i][0]||''),
            firstname:    String(data[i][1]||''),
            lastname:     String(data[i][2]||''),
            email:        String(data[i][3]||''),
            lineId:       String(data[i][4]||''),
            phone:        String(data[i][5]||''),
            username:     String(data[i][6]||''),
            status:       String(data[i][8]||''),
          }});
        }
      }
      return res.json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้' });
    }

    // ── PATCH profile (email, phone, lineId เท่านั้น) ──
    if (req.method === 'PATCH') {
      const { username, email, phone, lineId } = req.body;
      if (!username) return res.status(400).json({ success: false, message: 'ไม่พบ username' });

      // ตรวจ email format ถ้ามีการส่งมา
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.json({ success: false, message: 'รูปแบบอีเมลไม่ถูกต้อง' });

      // ตรวจเบอร์โทร
      if (phone && (!/^\d+$/.test(phone) || phone.length < 9 || phone.length > 10))
        return res.json({ success: false, message: 'เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก' });

      // ตรวจ email ซ้ำ
      for (let i = 1; i < data.length; i++) {
        if (email && String(data[i][3]||'').toLowerCase() === email.toLowerCase()
            && String(data[i][6]||'').toLowerCase() !== username.toLowerCase())
          return res.json({ success: false, message: 'อีเมลนี้ถูกใช้แล้วในระบบ' });
      }

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][6]||'').toLowerCase() === username.toLowerCase()) {
          const row = i + 1;
          const updates = [];
          if (email  !== undefined) updates.push({ range: `${SHEET_USERS}!D${row}`, value: email });
          if (lineId !== undefined) updates.push({ range: `${SHEET_USERS}!E${row}`, value: lineId });
          if (phone  !== undefined) updates.push({ range: `${SHEET_USERS}!F${row}`, value: phone });

          if (updates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
              spreadsheetId: SPREADSHEET_ID,
              requestBody: {
                valueInputOption: 'RAW',
                data: updates.map(u => ({ range: u.range, values: [[u.value]] })),
              },
            });
          }
          return res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
        }
      }
      return res.json({ success: false, message: 'ไม่พบผู้ใช้' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
};
