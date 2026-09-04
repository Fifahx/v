// api/mgmt.js
// จัดการรายชื่อ/รูปภาพผู้บริหารที่แสดงในสไลด์หน้าแรก
// GET  /api/mgmt                                   — ดึงรายการทั้งหมด (public)
// POST /api/mgmt { action:'add',    name, pos, img }
// POST /api/mgmt { action:'update', mgmtId, name, pos, img }
// POST /api/mgmt { action:'delete', mgmtId }
// POST /api/mgmt { action:'move',   mgmtId, dir:-1|1 }
// ทุก action ที่เขียนข้อมูลต้องเป็น superadmin เท่านั้น

const {
  getSheetsClient, getSheetData, appendRow, withRetry,
  SPREADSHEET_ID, setCorsHeaders,
} = require('./_sheets');
const { requireAuth } = require('./_jwt');

const SHEET_MGMT = 'VOC_Mgmt';
// เซลล์ Google Sheets รับได้ ~50,000 ตัวอักษร
// รูปที่ใหญ่กว่านี้ฝั่ง client จะอัปขึ้น Drive แล้วส่งมาเป็น URL สั้น ๆ แทน
const MAX_IMG_CHARS = 45000;

// รายชื่อเริ่มต้น — ใช้ครั้งแรกที่ยังไม่มีชีต เพื่อให้หน้าเว็บไม่ว่าง
const DEFAULT_PEOPLE = [
  ['/img/คณะผู้บริหารคณะวิทย์/wilaiwan.png', 'ผศ.ดร.วิไลวัลย์ แก้วตาทิพย์', 'คณบดีคณะวิทยาศาสตร์เทคโนโลยีและการเกษตร'],
  ['/img/คณะผู้บริหารคณะวิทย์/ดาว.png', 'ผศ.ดร.ปัทมา พิศภักดิ์', 'รองคณบดีฝ่ายบริหารและเครือข่ายสัมพันธ์'],
  ['/img/คณะผู้บริหารคณะวิทย์/ely(nw).png', 'ผศ.ดร.อีลีหย๊ะ สนิโซ', 'รองคณบดีฝ่ายวิจัย บริการวิชาการและกิจการนักศึกษา'],
  ['/img/คณะผู้บริหารคณะวิทย์/อาบีดีน.png', 'ผศ.ดร.อาบีดีน ดะแซสาเมาะ', 'รองคณบดีฝ่ายวิชาการและพัฒนาคุณภาพบัณฑิต'],
  ['/img/คณะผู้บริหารคณะวิทย์/1759376222_.png', 'นางอธิพร สมจิตต์', 'รักษาการในตำแหน่งผู้อำนวยการสำนักงานคณบดี'],
  ['/img/คณะผู้บริหารคณะวิทย์/zl.png', 'ผศ.ดร.อิมรอน มีชัย', 'ผู้ช่วยคณบดี ฝ่ายการสรรหานักศึกษาเชิงรุก'],
  ['/img/คณะผู้บริหารคณะวิทย์/Screenshot 2025_09_24 153629.png', 'ผศ.รอมลี เจะดอเลาะ', 'ผู้ช่วยคณบดี ฝ่ายการประเมินผลกระทบการบริการวิชาการ'],
  ['/img/คณะผู้บริหารคณะวิทย์/Gemini_Generated_Image_z9sopgz9sopgz9so_removebg_preview.png', 'อ.ดร.อดุลย์สมาน สุขแก้ว', 'ผู้ช่วยคณบดี ฝ่ายงานวิเทศสัมพันธ์และการสื่อสารองค์กร'],
];

async function ensureMgmtSheet(sheets) {
  try {
    const d = await getSheetData(sheets, SHEET_MGMT);
    if (!d.length) throw new Error('empty');
  } catch {
    await withRetry(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_MGMT } } }] },
    }), 'mgmt:addSheet').catch(() => { });
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_MGMT}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['MgmtID', 'ชื่อ', 'ตำแหน่ง', 'ImageURL', 'ลำดับ', 'สถานะ']] },
    }), 'mgmt:initHeader');
    let order = 1;
    for (const [img, name, pos] of DEFAULT_PEOPLE) {
      await appendRow(sheets, SHEET_MGMT, [order, name, pos, img, order, 'active']);
      order++;
    }
  }
}

function rowToObj(r) {
  return {
    mgmtId: String(r[0] || ''),
    name: String(r[1] || ''),
    pos: String(r[2] || ''),
    img: String(r[3] || ''),
    order: Number(r[4]) || 0,
    status: String(r[5] || 'active'),
  };
}

// เขียนทั้งชีตใหม่ (ใช้ตอนสลับลำดับ/ลบ เพื่อให้เลขลำดับเรียงต่อเนื่อง)
async function rewriteAll(sheets, list) {
  await withRetry(() => sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_MGMT}!A2:F10000`,
  }), 'mgmt:clearAll');
  if (!list.length) return;
  const values = list.map((p, i) => [p.mgmtId, p.name, p.pos, p.img, i + 1, p.status || 'active']);
  await withRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_MGMT}!A2`,
    valueInputOption: 'RAW',
    requestBody: { values },
  }), 'mgmt:rewriteAll');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheets = await getSheetsClient();
    await ensureMgmtSheet(sheets);
    const data = await getSheetData(sheets, SHEET_MGMT);
    const all = data.slice(1).filter(r => r[0]).map(rowToObj)
      .sort((a, b) => a.order - b.order);

    if (req.method === 'GET') {
      const activeOnly = String(req.query?.all || '') !== '1';
      const list = activeOnly ? all.filter(p => p.status === 'active') : all;
      return res.json({ success: true, people: list });
    }

    if (req.method === 'POST') {
      // เขียนข้อมูลได้เฉพาะ superadmin
      const auth = requireAuth(req, res, ['superadmin']);
      if (!auth) return;

      const { action, mgmtId, name, pos, img, status, dir } = req.body || {};

      if (action === 'add') {
        if (!name || !pos) return res.json({ success: false, message: 'กรุณากรอกชื่อและตำแหน่ง' });
        if (String(img || '').length > MAX_IMG_CHARS) {
          return res.json({ success: false, message: 'ข้อมูลรูปภาพยาวเกินกว่าที่ชีตเก็บได้ กรุณาลองอัปโหลดใหม่' });
        }
        const ids = all.map(p => Number(p.mgmtId) || 0);
        const newId = ids.length ? Math.max(...ids) + 1 : 1;
        const newOrder = all.length + 1;
        await appendRow(sheets, SHEET_MGMT, [newId, name, pos, img || '', newOrder, 'active']);
        return res.json({ success: true, mgmtId: newId });
      }

      if (action === 'update') {
        if (String(img || '').length > MAX_IMG_CHARS) {
          return res.json({ success: false, message: 'ข้อมูลรูปภาพยาวเกินกว่าที่ชีตเก็บได้ กรุณาลองอัปโหลดใหม่' });
        }
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][0]) !== String(mgmtId)) continue;
          await withRetry(() => sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_MGMT}!B${i + 1}:F${i + 1}`,
            valueInputOption: 'RAW',
            requestBody: {
              values: [[
                name != null ? name : data[i][1],
                pos != null ? pos : data[i][2],
                // ส่ง img มาเป็นสตริงว่างแปลว่า "ไม่เปลี่ยนรูป"
                img ? img : String(data[i][3] || ''),
                data[i][4] || (i),
                status || data[i][5] || 'active',
              ]],
            },
          }), 'mgmt:update');
          return res.json({ success: true });
        }
        return res.json({ success: false, message: 'ไม่พบรายการนี้' });
      }

      if (action === 'delete') {
        const left = all.filter(p => String(p.mgmtId) !== String(mgmtId));
        if (left.length === all.length) return res.json({ success: false, message: 'ไม่พบรายการนี้' });
        await rewriteAll(sheets, left);
        return res.json({ success: true });
      }

      if (action === 'move') {
        const idx = all.findIndex(p => String(p.mgmtId) === String(mgmtId));
        if (idx < 0) return res.json({ success: false, message: 'ไม่พบรายการนี้' });
        const to = idx + (Number(dir) || 0);
        if (to < 0 || to >= all.length) return res.json({ success: false, message: 'อยู่สุดขอบแล้ว' });
        const list = [...all];
        [list[idx], list[to]] = [list[to], list[idx]];
        await rewriteAll(sheets, list);
        return res.json({ success: true });
      }

      return res.status(400).json({ success: false, message: 'Unknown action' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[mgmt]', e);
    res.status(500).json({ success: false, message: e.message });
  }
};