// api/upload.js v2
// [แก้ไข v2] รองรับ Shared Drive (supportsAllDrives: true)
// แก้ error: "Service Accounts do not have storage quota"
// → ต้องใช้ Shared Drive แทน My Drive
//
// ขั้นตอนตั้งค่า Google Drive (ทำครั้งเดียว):
//   1. drive.google.com → "+ New" → "Shared Drive" → ตั้งชื่อ "VOC_Attachments"
//   2. Shared Drive → Manage members → เพิ่ม GOOGLE_SERVICE_ACCOUNT_EMAIL → role "Contributor"
//   3. เปิด Shared Drive → URL: drive.google.com/drive/u/0/folders/[FOLDER_ID]
//   4. Vercel Dashboard → Settings → Environment Variables
//      DRIVE_FOLDER_ID = [FOLDER_ID] ที่คัดลอกมา

const { google }   = require('googleapis');
const { Readable } = require('stream');
const { setCorsHeaders } = require('./_sheets');

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

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
        const parts   = bodyStr.split(boundary).slice(1, -1);

        for (const part of parts) {
          const [headerSection, ...bodyParts] = part.split('\r\n\r\n');
          const partBody  = bodyParts.join('\r\n\r\n').replace(/\r\n$/, '');
          const nameMatch = headerSection.match(/name="([^"]+)"/);
          const fileMatch = headerSection.match(/filename="([^"]+)"/);
          const ctMatch   = headerSection.match(/Content-Type:\s*(.+)/i);

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

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  let _uploadUser = null;
  try {
    const { extractToken, verifyToken } = require('./_jwt');
    const tok = extractToken(req);
    if (tok) _uploadUser = verifyToken(tok);
  } catch (e) { /* guest mode */ }

  try {
    const { fileBuffer, fileName, mimeType } = await parseMultipart(req);

    const drive    = getDriveClient();
    const folderId = process.env.DRIVE_FOLDER_ID;

    if (!folderId) {
      return res.status(500).json({
        success: false,
        error: 'ยังไม่ได้ตั้งค่า DRIVE_FOLDER_ID ใน Environment Variables',
      });
    }

    // ── อัปโหลดไป Shared Drive (ต้องมี supportsAllDrives: true) ──
    const uploadRes = await drive.files.create({
      supportsAllDrives: true,          // ← จำเป็นสำหรับ Shared Drive
      requestBody: {
        name:    `VOC_${Date.now()}_${fileName}`,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: Readable.from(fileBuffer),
      },
      fields: 'id,name',
    });

    const fileId = uploadRes.data.id;

    // ── ตั้ง public permission (supportsAllDrives ต้องใส่ตรงนี้ด้วย) ──
    await drive.permissions.create({
      fileId,
      supportsAllDrives: true,          // ← จำเป็นสำหรับ Shared Drive
      requestBody: { role: 'reader', type: 'anyone' },
    });

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

module.exports.config = { api: { bodyParser: false } };
