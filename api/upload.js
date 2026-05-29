// api/upload.js v1
// POST /api/upload  (multipart/form-data, field name = "file")
//
// Flow:
//   Client ส่งไฟล์มา → Service Account อัปโหลดไป Google Drive
//   → ตั้ง permission anyone+reader → คืน { url: "https://drive.google.com/file/d/.../view" }
//   → Client เอา url นี้ส่งไปกับ /api/submit (field: fileUrl)
//
// ทำไมถึงต้องทำแบบนี้:
//   Google Sheets จำกัด 50,000 ตัวอักษรต่อ Cell
//   ไฟล์ 5 MB แปลง Base64 = ~6.7 ล้านตัวอักษร → Crash ทันที
//   วิธีนี้บันทึกแค่ URL (ประมาณ 60 ตัวอักษร) ลง Sheets
//
// Environment Variables ที่ต้องเพิ่มใน Vercel (นอกเหนือจากของเดิม):
//   DRIVE_FOLDER_ID  = ID ของโฟลเดอร์ Google Drive ที่ Service Account มีสิทธิ์ Editor
//
// วิธีหา DRIVE_FOLDER_ID:
//   1. สร้างโฟลเดอร์ใน Google Drive ชื่อ "VOC_Attachments"
//   2. Share → เพิ่ม GOOGLE_SERVICE_ACCOUNT_EMAIL เป็น Editor
//   3. เปิดโฟลเดอร์ → ดู URL: drive.google.com/drive/folders/[FOLDER_ID]
//   4. คัดลอก FOLDER_ID ไปตั้งใน Vercel Environment Variables

const { google }     = require('googleapis');
const { Readable }   = require('stream');
const { setCorsHeaders } = require('./_sheets');
const { requireAuth }    = require('./_jwt');

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ── Google Drive Auth (ใช้ credential เดียวกับ Sheets) ──
function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  return google.drive({ version: 'v3', auth });
}

// ── Multipart parser (ไม่ต้องติดตั้ง package เพิ่ม — ใช้ Node.js built-in เท่านั้น) ──
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) return reject(new Error('No boundary in Content-Type'));

    const boundary = '--' + boundaryMatch[1].trim();
    const chunks   = [];
    let totalSize  = 0;

    req.on('data', chunk => {
      totalSize += chunk.length;
      if (totalSize > MAX_BYTES) {
        req.destroy(new Error(`ไฟล์ใหญ่เกินไป (สูงสุด ${MAX_BYTES / 1024 / 1024} MB)`));
        return;
      }
      chunks.push(chunk);
    });

    req.on('error', reject);

    req.on('end', () => {
      try {
        const body    = Buffer.concat(chunks);
        const bodyStr = body.toString('binary');
        const parts   = bodyStr.split(boundary).slice(1, -1); // ตัด boundary แรก+สุดท้าย

        for (const part of parts) {
          const [headerSection, ...bodyParts] = part.split('\r\n\r\n');
          const partBody    = bodyParts.join('\r\n\r\n').replace(/\r\n$/, '');
          const nameMatch   = headerSection.match(/name="([^"]+)"/);
          const fileMatch   = headerSection.match(/filename="([^"]+)"/);
          const ctMatch     = headerSection.match(/Content-Type:\s*(.+)/i);

          if (nameMatch && nameMatch[1] === 'file' && fileMatch) {
            return resolve({
              fileBuffer: Buffer.from(partBody, 'binary'),
              fileName:   fileMatch[1],
              mimeType:   ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
            });
          }
        }
        reject(new Error('ไม่พบ field "file" ใน request'));
      } catch (e) {
        reject(e);
      }
    });
  });
}

// ── Config สำหรับ Vercel: ปิด bodyParser เพราะ parse multipart เอง ──
module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // ต้อง login ก่อนอัปโหลดไฟล์ (ป้องกันคนแปลกหน้าใช้ storage)
  const auth = requireAuth(req, res);
  if (!auth) return; // requireAuth ส่ง 401 ไปแล้ว

  try {
    // 1. Parse multipart
    const { fileBuffer, fileName, mimeType } = await parseMultipart(req);

    // 2. อัปโหลดไป Google Drive
    const drive    = getDriveClient();
    const folderId = process.env.DRIVE_FOLDER_ID;

    const uploadRes = await drive.files.create({
      requestBody: {
        name:    `VOC_${Date.now()}_${fileName}`,
        parents: folderId ? [folderId] : [],
      },
      media: {
        mimeType,
        body: Readable.from(fileBuffer),
      },
      fields: 'id,name',
    });

    const fileId = uploadRes.data.id;

    // 3. ตั้ง permission: anyone + reader (ให้ admin เปิดลิงก์ได้โดยไม่ต้อง login Google)
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    // 4. คืน URL
    const url = `https://drive.google.com/file/d/${fileId}/view`;
    return res.status(200).json({ success: true, url, fileId });

  } catch (err) {
    console.error('[upload] error:', err.message);

    if (err.message?.includes('ใหญ่เกินไป')) {
      return res.status(413).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: 'อัปโหลดไฟล์ล้มเหลว: ' + err.message });
  }
};

// ── บอก Vercel ให้ปิด bodyParser สำหรับ endpoint นี้ ──
module.exports.config = { api: { bodyParser: false } };
