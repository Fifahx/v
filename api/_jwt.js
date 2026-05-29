// api/_jwt.js
// ─────────────────────────────────────────────────────────────
//  JWT helper — ใช้ Node.js built-in crypto (HMAC-SHA256)
//  ไม่ต้องติดตั้ง package เพิ่ม
//
//  Environment Variable ที่ต้องตั้งใน Vercel:
//    JWT_SECRET  =  (random string ยาวอย่างน้อย 32 ตัวอักษร)
//    เช่น:  openssl rand -base64 32
// ─────────────────────────────────────────────────────────────

const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'voc-fallback-secret-change-in-production-32chars';
const EXPIRES_IN_SECONDS = 60 * 60 * 8; // 8 ชั่วโมง

// ── Encode Base64URL (RFC 4648) ──
function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(JSON.stringify(input));
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ── Decode Base64URL → object ──
function parseB64url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

// ── HMAC-SHA256 signature ──
function sign(header, payload) {
  const data = `${b64url(header)}.${b64url(payload)}`;
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

// ── สร้าง JWT token ──
// payload ควรมี: { username, role, ... }
function createToken(payload) {
  const header  = { alg: 'HS256', typ: 'JWT' };
  const now     = Math.floor(Date.now() / 1000);
  const claims  = { ...payload, iat: now, exp: now + EXPIRES_IN_SECONDS };
  const h = b64url(header);
  const p = b64url(claims);
  const sig = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

// ── ตรวจสอบและถอดรหัส JWT token ──
// คืน decoded payload ถ้า valid, throw Error ถ้า invalid/expired
function verifyToken(token) {
  if (!token || typeof token !== 'string') throw new Error('ไม่พบ token');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('รูปแบบ token ไม่ถูกต้อง');

  const [h, p, sig] = parts;

  // ตรวจ signature
  const expectedSig = crypto
    .createHmac('sha256', SECRET)
    .update(`${h}.${p}`)
    .digest('base64url');

  // timing-safe compare เพื่อป้องกัน timing attack
  const sigBuf      = Buffer.from(sig, 'base64url');
  const expectedBuf = Buffer.from(expectedSig, 'base64url');
  if (sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error('Token ไม่ถูกต้อง');
  }

  // ถอดรหัส payload
  const payload = parseB64url(p);

  // ตรวจ expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) throw new Error('Token หมดอายุ กรุณาเข้าสู่ระบบใหม่');

  return payload;
}

// ── Express/Vercel middleware: ดึง token จาก Authorization header ──
// ใช้ใน endpoint ที่ต้องการ auth
// คืน { ok: true, payload } หรือ { ok: false, status, message }
function extractToken(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

// ── Helper: ตรวจ token และคืน payload หรือ response error ──
// ถ้าใช้ใน handler:
//   const auth = requireAuth(req, res);
//   if (!auth) return;   ← res ถูกส่งไปแล้วถ้า !auth
//   const { username, role } = auth;
function requireAuth(req, res, allowedRoles = null) {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อน (ไม่พบ token)' });
      return null;
    }
    const payload = verifyToken(token);
    if (allowedRoles && !allowedRoles.includes(payload.role)) {
      res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึง' });
      return null;
    }
    return payload;
  } catch (e) {
    res.status(401).json({ success: false, message: e.message });
    return null;
  }
}

module.exports = { createToken, verifyToken, extractToken, requireAuth };
