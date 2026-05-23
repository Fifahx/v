// api/profile.js
// GET /api/profile?username=xxx  ← ดึงข้อมูล profile ของ user

const { getSheetsClient, getSheetData, SHEET_USERS, setCorsHeaders } = require('./_sheets');

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { username } = req.query;
  if (!username) return res.status(400).json({ success: false, message: 'ไม่พบ username' });

  try {
    const sheets = await getSheetsClient();
    const data   = await getSheetData(sheets, SHEET_USERS);

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][6] || '').toLowerCase() === username.toLowerCase()) {
        return res.json({
          success:   true,
          profile: {
            registeredAt: String(data[i][0] || ''),
            firstname:    String(data[i][1] || ''),
            lastname:     String(data[i][2] || ''),
            email:        String(data[i][3] || ''),
            lineId:       String(data[i][4] || ''),
            phone:        String(data[i][5] || ''),
            username:     String(data[i][6] || ''),
            status:       String(data[i][8] || ''),
          },
        });
      }
    }
    return res.json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
};
