// api/auth.js v7 — unified admin+superadmin login + JWT
// [แก้ไข v7] เพิ่ม JWT signing หลัง login สำเร็จ
// token ถูก sign ด้วย JWT_SECRET (env var) และมีอายุ 8 ชั่วโมง
// client เก็บ token ใน sessionStorage และส่งผ่าน Authorization: Bearer <token>
const {
  getSheetsClient, getSheetData, appendRow, withRetry,
  SHEET_USERS, SHEET_ADMINS, SPREADSHEET_ID,
  hashPassword, formatDateThai, setCorsHeaders,
} = require('./_sheets');
const { createToken } = require('./_jwt');

const SHEET_SUPERADMINS = 'VOC_SuperAdmins';

async function ensureSuperAdminSheet(sheets) {
  try {
    const d = await getSheetData(sheets, SHEET_SUPERADMINS);
    if (!d.length || d.length <= 1) throw new Error('empty');
  } catch {
    await withRetry(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_SUPERADMINS } } }] },
    }), 'auth:addSuperAdminSheet').catch(()=>{});
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID, range: `${SHEET_SUPERADMINS}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Username','Password','ชื่อ-นามสกุล','อีเมล','สถานะ']] },
    }), 'auth:initSuperAdminHeader').catch(()=>{});
    await appendRow(sheets, SHEET_SUPERADMINS,
      ['superadmin', hashPassword('super1234'), 'เจ้าหน้าที่ระดับสูง', 'superadmin@yru.ac.th', 'active'])
      .catch(()=>{});
  }
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action } = req.body;
  try {
    const sheets = await getSheetsClient();

    // ── LOGIN USER ──
    if (action === 'loginUser') {
      const { username, password } = req.body;
      const data = await getSheetData(sheets, SHEET_USERS);
      const h    = hashPassword(password);
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][6]||'').toLowerCase() === String(username).toLowerCase()
          && String(data[i][7]) === h && String(data[i][8]) === 'active') {
          const token = createToken({ username: data[i][6], role: 'user' });
          return res.json({ success:true, role:'user', token,
            username:data[i][6], firstname:data[i][1], lastname:data[i][2], email:data[i][3] });
        }
      }
      return res.json({ success:false, message:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    // ── LOGIN ADMIN (unified: ตรวจ superadmin ก่อน แล้วค่อย admin) ──
    if (action === 'loginAdmin') {
      const { username, password } = req.body;
      const h = hashPassword(password);

      // ตรวจ SuperAdmins ก่อน
      await ensureSuperAdminSheet(sheets);
      const saData = await getSheetData(sheets, SHEET_SUPERADMINS);
      for (let i = 1; i < saData.length; i++) {
        if (String(saData[i][0]||'').toLowerCase() === String(username).toLowerCase()
          && String(saData[i][1]) === h && String(saData[i][4]) === 'active') {
          const token = createToken({ username: saData[i][0], role: 'superadmin' });
          return res.json({ success:true, role:'superadmin', token,
            username:saData[i][0], fullname:saData[i][2], email:saData[i][3] });
        }
      }

      // ตรวจ Admins ปกติ
      let aData = await getSheetData(sheets, SHEET_ADMINS);
      if (aData.length <= 1) {
        await appendRow(sheets, SHEET_ADMINS,
          ['admin', hashPassword('admin1234'), 'เจ้าหน้าที่', 'admin@yru.ac.th', 'active']);
        aData = await getSheetData(sheets, SHEET_ADMINS);
      }
      for (let i = 1; i < aData.length; i++) {
        if (String(aData[i][0]||'').toLowerCase() === String(username).toLowerCase()
          && String(aData[i][1]) === h && String(aData[i][4]) === 'active') {
          const token = createToken({ username: aData[i][0], role: 'admin' });
          return res.json({ success:true, role:'admin', token,
            username:aData[i][0], fullname:aData[i][2], email:aData[i][3] });
        }
      }
      return res.json({ success:false, message:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    // ── LOGIN SUPERADMIN (legacy — ยังรองรับไว้กัน client เก่า) ──
    if (action === 'loginSuperAdmin') {
      const { username, password } = req.body;
      await ensureSuperAdminSheet(sheets);
      const data = await getSheetData(sheets, SHEET_SUPERADMINS);
      const h    = hashPassword(password);
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]||'').toLowerCase() === String(username).toLowerCase()
          && String(data[i][1]) === h && String(data[i][4]) === 'active') {
          const token = createToken({ username: data[i][0], role: 'superadmin' });
          return res.json({ success:true, role:'superadmin', token,
            username:data[i][0], fullname:data[i][2], email:data[i][3] });
        }
      }
      return res.json({ success:false, message:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    // ── REGISTER ──
    if (action === 'register') {
      const { firstname, lastname, email, lineId, phone, username, password } = req.body;
      const data = await getSheetData(sheets, SHEET_USERS);
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][6]||'').toLowerCase() === String(username).toLowerCase())
          return res.json({ success:false, message:'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
        if (String(data[i][3]||'').toLowerCase() === String(email).toLowerCase())
          return res.json({ success:false, message:'อีเมลนี้ถูกใช้แล้ว' });
      }
      await appendRow(sheets, SHEET_USERS, [
        formatDateThai(new Date()), firstname||'', lastname||'', email||'',
        lineId||'', phone||'', username||'', hashPassword(password||''), 'active',
      ]);
      return res.json({ success:true, message:'ลงทะเบียนสำเร็จ' });
    }

    // ── ADD ADMIN (superadmin เพิ่ม admin ใหม่) ──
    if (action === 'addAdmin') {
      const { username, password, fullname, email } = req.body;
      if (!username || !password) return res.json({ success:false, message:'ข้อมูลไม่ครบ' });
      const data = await getSheetData(sheets, SHEET_ADMINS);
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]||'').toLowerCase() === username.toLowerCase())
          return res.json({ success:false, message:'Username นี้มีอยู่แล้ว' });
      }
      await appendRow(sheets, SHEET_ADMINS, [
        username, hashPassword(password), fullname||username, email||'', 'active'
      ]);
      return res.json({ success:true, message:`เพิ่ม เจ้าหน้าที่ "${username}" สำเร็จ` });
    }

    // ── LIST ADMINS (superadmin ดูรายชื่อ) ──
    if (action === 'listAdmins') {
      const data = await getSheetData(sheets, SHEET_ADMINS);
      const admins = data.slice(1).filter(r=>r[0]).map(r=>({
        username: String(r[0]||''),
        fullname: String(r[2]||''),
        email:    String(r[3]||''),
        status:   String(r[4]||'active'),
      }));
      return res.json({ success:true, admins });
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, message: e.message });
  }
};
