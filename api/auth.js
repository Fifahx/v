// api/auth.js v8 — superadmin ใช้ AES encrypted password จาก sheet (ไม่มี default account)
const {
  getSheetsClient, getSheetData, appendRow, withRetry,
  SHEET_USERS, SHEET_ADMINS, SPREADSHEET_ID,
  hashPassword, encryptPassword, decryptPassword,
  formatDateThai, setCorsHeaders,
} = require('./_sheets');
const { createToken, requireAuth } = require('./_jwt');

const SHEET_SUPERADMINS = 'VOC_SuperAdmins';

// เทียบ identifier ที่ผู้ใช้กรอก กับได้ทั้ง username และ email ของแถวนั้น
function matchesIdentifier(input, username, email) {
  const q = String(input || '').trim().toLowerCase();
  if (!q) return false;
  return q === String(username || '').trim().toLowerCase()
      || q === String(email || '').trim().toLowerCase();
}

// ── สิทธิ์การใช้งานของเจ้าหน้าที่ (admin) ──
// เก็บในคอลัมน์ F ของ VOC_Admins เป็นข้อความคั่นด้วยจุลภาค
// ถ้าเซลล์ว่าง = ได้ทุกสิทธิ์ (เพื่อให้บัญชีเดิมใช้งานได้ตามปกติ)
const ALL_PERMS = [
  'dashboard',      // ดูหน้าสถิติ
  'tickets',        // เข้าหน้าจัดการเรื่อง
  'ticket.update',  // เปลี่ยนสถานะ / ผู้รับผิดชอบ
  'ticket.comment', // เพิ่มความคิดเห็น
  'ticket.pin',     // ปักหมุดเรื่อง
  'reviews',        // ดูรีวิว
  'report',         // ดูรายงาน
];

function parsePerms(cell) {
  const raw = String(cell || '').trim();
  if (!raw) return [...ALL_PERMS];            // บัญชีเดิมที่ยังไม่เคยตั้งสิทธิ์
  if (raw === '-') return [];                  // ตั้งใจไม่ให้สิทธิ์ใด ๆ
  return raw.split(',').map(x => x.trim()).filter(x => ALL_PERMS.includes(x));
}

function stringifyPerms(list) {
  const clean = (Array.isArray(list) ? list : []).filter(x => ALL_PERMS.includes(x));
  return clean.length ? clean.join(',') : '-';
}

async function ensureSuperAdminSheet(sheets) {
  // สร้าง sheet และ header เท่านั้น — ไม่เพิ่ม default account
  try {
    await getSheetData(sheets, SHEET_SUPERADMINS);
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
        if (matchesIdentifier(username, data[i][6], data[i][3])
          && String(data[i][7]) === h && String(data[i][8]) === 'active') {
          const token = createToken({ username: data[i][6], role: 'user' });
          return res.json({ success:true, role:'user', token,
            username:data[i][6], firstname:data[i][1], lastname:data[i][2], email:data[i][3] });
        }
      }
      return res.json({ success:false, message:'ชื่อผู้ใช้ / อีเมล หรือรหัสผ่านไม่ถูกต้อง' });
    }

    // ── LOGIN ADMIN (unified: ตรวจ superadmin ก่อน แล้วค่อย admin) ──
    if (action === 'loginAdmin') {
      const { username, password } = req.body;
      const h = hashPassword(password);

      // ตรวจ SuperAdmins ก่อน (password เก็บแบบ AES encrypted)
      await ensureSuperAdminSheet(sheets);
      const saData = await getSheetData(sheets, SHEET_SUPERADMINS);
      for (let i = 1; i < saData.length; i++) {
        const rowUser   = String(saData[i][0]||'').toLowerCase();
        const rowStatus = String(saData[i][4]||'');
        if (!matchesIdentifier(username, rowUser, saData[i][3]) || rowStatus !== 'active') continue;
        const decrypted = decryptPassword(String(saData[i][1]||''));
        if (decrypted === password) {
          const token = createToken({ username: saData[i][0], role: 'superadmin' });
          return res.json({ success:true, role:'superadmin', token,
            username:saData[i][0], fullname:saData[i][2], email:saData[i][3] });
        }
      }

      // ตรวจ Admins ปกติ
      const aData = await getSheetData(sheets, SHEET_ADMINS);
      for (let i = 1; i < aData.length; i++) {
        if (matchesIdentifier(username, aData[i][0], aData[i][3])
          && String(aData[i][1]) === h && String(aData[i][4]) === 'active') {
          const perms = parsePerms(aData[i][5]);
          const token = createToken({ username: aData[i][0], role: 'admin', perms });
          return res.json({ success:true, role:'admin', token, permissions: perms,
            username:aData[i][0], fullname:aData[i][2], email:aData[i][3] });
        }
      }
      return res.json({ success:false, message:'ชื่อผู้ใช้ / อีเมล หรือรหัสผ่านไม่ถูกต้อง' });
    }

    // ── LOGIN SUPERADMIN (legacy — ยังรองรับไว้กัน client เก่า) ──
    if (action === 'loginSuperAdmin') {
      const { username, password } = req.body;
      await ensureSuperAdminSheet(sheets);
      const data = await getSheetData(sheets, SHEET_SUPERADMINS);
      for (let i = 1; i < data.length; i++) {
        const rowUser   = String(data[i][0]||'').toLowerCase();
        const rowStatus = String(data[i][4]||'');
        if (!matchesIdentifier(username, rowUser, data[i][3]) || rowStatus !== 'active') continue;
        const decrypted = decryptPassword(String(data[i][1]||''));
        if (decrypted === password) {
          const token = createToken({ username: data[i][0], role: 'superadmin' });
          return res.json({ success:true, role:'superadmin', token,
            username:data[i][0], fullname:data[i][2], email:data[i][3] });
        }
      }
      return res.json({ success:false, message:'ชื่อผู้ใช้ / อีเมล หรือรหัสผ่านไม่ถูกต้อง' });
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
        username, hashPassword(password), fullname||username, email||'', 'active',
        stringifyPerms(Array.isArray(req.body.permissions) ? req.body.permissions : ALL_PERMS)
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
        permissions: parsePerms(r[5]),
      }));
      return res.json({ success:true, admins, allPermissions: ALL_PERMS });
    }

    // ── SET ADMIN PERMISSIONS (superadmin เท่านั้น) ──
    if (action === 'setAdminPermissions') {
      const auth = requireAuth(req, res, ['superadmin']);
      if (!auth) return;
      const { username, permissions } = req.body;
      if (!username) return res.json({ success:false, message:'ไม่ระบุ username' });
      const data = await getSheetData(sheets, SHEET_ADMINS);
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]||'').toLowerCase() !== String(username).toLowerCase()) continue;
        await withRetry(() => sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_ADMINS}!F${i+1}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[stringifyPerms(permissions)]] },
        }), 'auth:setAdminPermissions');
        return res.json({ success:true, message:`บันทึกสิทธิ์ของ "${username}" แล้ว` });
      }
      return res.json({ success:false, message:'ไม่พบเจ้าหน้าที่นี้' });
    }

    // ── SET ADMIN STATUS (เปิด/ปิดการใช้งานบัญชี — superadmin เท่านั้น) ──
    if (action === 'setAdminStatus') {
      const auth = requireAuth(req, res, ['superadmin']);
      if (!auth) return;
      const { username, status } = req.body;
      const newStatus = status === 'active' ? 'active' : 'disabled';
      const data = await getSheetData(sheets, SHEET_ADMINS);
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]||'').toLowerCase() !== String(username).toLowerCase()) continue;
        await withRetry(() => sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_ADMINS}!E${i+1}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[newStatus]] },
        }), 'auth:setAdminStatus');
        return res.json({ success:true });
      }
      return res.json({ success:false, message:'ไม่พบเจ้าหน้าที่นี้' });
    }

    // ── ADD SUPERADMIN (เพิ่ม superadmin ใหม่ พร้อม AES encrypted password) ──
    if (action === 'addSuperAdmin') {
      const { username, password, fullname, email } = req.body;
      if (!username || !password) return res.json({ success:false, message:'ข้อมูลไม่ครบ (username และ password จำเป็น)' });
      await ensureSuperAdminSheet(sheets);
      const data = await getSheetData(sheets, SHEET_SUPERADMINS);
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]||'').toLowerCase() === username.toLowerCase())
          return res.json({ success:false, message:'Username นี้มีอยู่แล้ว' });
      }
      await appendRow(sheets, SHEET_SUPERADMINS, [
        username, encryptPassword(password), fullname||username, email||'', 'active'
      ]);
      return res.json({ success:true, message:`เพิ่ม SuperAdmin "${username}" สำเร็จ` });
    }

    // ── LIST SUPERADMINS ──
    if (action === 'listSuperAdmins') {
      await ensureSuperAdminSheet(sheets);
      const data = await getSheetData(sheets, SHEET_SUPERADMINS);
      const list = data.slice(1).filter(r=>r[0]).map(r=>({
        username: String(r[0]||''),
        fullname: String(r[2]||''),
        email:    String(r[3]||''),
        status:   String(r[4]||'active'),
      }));
      return res.json({ success:true, superadmins: list });
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, message: e.message });
  }
};
