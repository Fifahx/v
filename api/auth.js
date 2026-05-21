// api/auth.js
// POST /api/auth  — Login user, Login admin, Register
// Body: { action: 'loginUser'|'loginAdmin'|'register', ...fields }

const {
  getSheetsClient, getSheetData, appendRow,
  SHEET_USERS, SHEET_ADMINS,
  hashPassword, formatDateThai, setCorsHeaders,
} = require('./_sheets');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body;

  try {
    const sheets = await getSheetsClient();

    // ── LOGIN USER ──────────────────────────────────────────
    if (action === 'loginUser') {
      const { username, password } = req.body;
      const data   = await getSheetData(sheets, SHEET_USERS);
      const hashed = hashPassword(password);

      for (let i = 1; i < data.length; i++) {
        if (
          String(data[i][6]).toLowerCase() === String(username).toLowerCase() &&
          String(data[i][7]) === hashed &&
          String(data[i][8]) === 'active'
        ) {
          return res.json({
            success:   true,
            role:      'user',
            username:  data[i][6],
            firstname: data[i][1],
            lastname:  data[i][2],
            email:     data[i][3],
          });
        }
      }
      return res.json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    // ── LOGIN ADMIN ─────────────────────────────────────────
    if (action === 'loginAdmin') {
      const { username, password } = req.body;
      const data   = await getSheetData(sheets, SHEET_ADMINS);
      const hashed = hashPassword(password);

      // ถ้ายังไม่มีข้อมูล admin ให้สร้าง default
      if (data.length <= 1) {
        await appendRow(sheets, SHEET_ADMINS, [
          'admin', hashPassword('admin1234'), 'ผู้ดูแลระบบ', 'admin@yru.ac.th', 'active',
        ]);
      }

      for (let i = 1; i < data.length; i++) {
        if (
          String(data[i][0]).toLowerCase() === String(username).toLowerCase() &&
          String(data[i][1]) === hashed &&
          String(data[i][4]) === 'active'
        ) {
          return res.json({
            success:  true,
            role:     'admin',
            username: data[i][0],
            fullname: data[i][2],
            email:    data[i][3],
          });
        }
      }
      return res.json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    // ── REGISTER ────────────────────────────────────────────
    if (action === 'register') {
      const { firstname, lastname, email, lineId, phone, username, password } = req.body;
      const data = await getSheetData(sheets, SHEET_USERS);

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][6]).toLowerCase() === String(username).toLowerCase())
          return res.json({ success: false, message: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
        if (String(data[i][3]).toLowerCase() === String(email).toLowerCase())
          return res.json({ success: false, message: 'อีเมลนี้ถูกใช้แล้วในระบบ' });
      }

      await appendRow(sheets, SHEET_USERS, [
        formatDateThai(new Date()),
        firstname || '', lastname || '',
        email     || '', lineId   || '',
        phone     || '', username || '',
        hashPassword(password || ''), 'active',
      ]);

      return res.json({ success: true, message: 'ลงทะเบียนสำเร็จ' });
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: e.message });
  }
};
