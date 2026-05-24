// api/auth.js v5 — user / admin / superadmin
const {
  getSheetsClient, getSheetData, appendRow,
  SHEET_USERS, SHEET_ADMINS, SPREADSHEET_ID,
  hashPassword, formatDateThai, setCorsHeaders,
} = require('./_sheets');

const SHEET_SUPERADMINS = 'VOC_SuperAdmins';

async function ensureSuperAdminSheet(sheets) {
  try {
    const d = await getSheetData(sheets, SHEET_SUPERADMINS);
    if (d.length <= 1)
      await appendRow(sheets, SHEET_SUPERADMINS,
        ['superadmin', hashPassword('super1234'), 'ผู้ดูแลระดับสูง', 'superadmin@yru.ac.th', 'active']);
  } catch {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_SUPERADMINS } } }] },
    }).catch(() => {});
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID, range: `${SHEET_SUPERADMINS}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Username','Password','ชื่อ-นามสกุล','อีเมล','สถานะ']] },
    });
    await appendRow(sheets, SHEET_SUPERADMINS,
      ['superadmin', hashPassword('super1234'), 'ผู้ดูแลระดับสูง', 'superadmin@yru.ac.th', 'active']);
  }
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action } = req.body;
  try {
    const sheets = await getSheetsClient();

    if (action === 'loginUser') {
      const { username, password } = req.body;
      const data = await getSheetData(sheets, SHEET_USERS);
      const h    = hashPassword(password);
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][6]||'').toLowerCase() === String(username).toLowerCase()
          && String(data[i][7]) === h && String(data[i][8]) === 'active')
          return res.json({ success:true, role:'user',
            username:data[i][6], firstname:data[i][1], lastname:data[i][2], email:data[i][3] });
      }
      return res.json({ success:false, message:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    if (action === 'loginAdmin') {
      const { username, password } = req.body;
      let data = await getSheetData(sheets, SHEET_ADMINS);
      if (data.length <= 1) {
        await appendRow(sheets, SHEET_ADMINS, ['admin', hashPassword('admin1234'), 'ผู้ดูแลระบบ', 'admin@yru.ac.th', 'active']);
        data = await getSheetData(sheets, SHEET_ADMINS);
      }
      const h = hashPassword(password);
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]||'').toLowerCase() === String(username).toLowerCase()
          && String(data[i][1]) === h && String(data[i][4]) === 'active')
          return res.json({ success:true, role:'admin',
            username:data[i][0], fullname:data[i][2], email:data[i][3] });
      }
      return res.json({ success:false, message:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    if (action === 'loginSuperAdmin') {
      const { username, password } = req.body;
      await ensureSuperAdminSheet(sheets);
      const data = await getSheetData(sheets, SHEET_SUPERADMINS);
      const h    = hashPassword(password);
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]||'').toLowerCase() === String(username).toLowerCase()
          && String(data[i][1]) === h && String(data[i][4]) === 'active')
          return res.json({ success:true, role:'superadmin',
            username:data[i][0], fullname:data[i][2], email:data[i][3] });
      }
      return res.json({ success:false, message:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

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

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, message: e.message });
  }
};
