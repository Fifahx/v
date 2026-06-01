// api/submit.js v8
// POST /api/submit — บันทึก ticket พร้อม:
//   1. Cloudflare Turnstile server-side verification (anti-spam)
//   2. IP-based rate limiting via in-memory store (ป้องกัน script-spamming)
//   3. รับ fileUrl (string URL จาก /api/upload) เท่านั้น — ห้าม base64
//
// Environment Variables ที่ต้องเพิ่มใน Vercel:
//   TURNSTILE_SECRET_KEY  = <Secret Key จาก Cloudflare Turnstile Dashboard>
//   (ถ้าไม่ตั้งค่า → ระบบจะข้าม Turnstile verify เพื่อ backward-compat ในระหว่าง dev)
//
// วิธีหา Turnstile Secret Key:
//   1. ไปที่ https://dash.cloudflare.com → "Turnstile"
//   2. "Add Site" → ใส่โดเมน vercel ของคุณ
//   3. Widget Type: "Managed"
//   4. คัดลอก "Site Key" ไปใส่ใน index.html (data-sitekey)
//   5. คัดลอก "Secret Key" ไปใส่ใน Vercel Env Var: TURNSTILE_SECRET_KEY
//
// Column mapping ตรงกับ VOC_Tickets sheet (18 cols):
// A: UUID       B: Ticket ID     C: Username      D: วันที่แจ้ง
// E: ประเภทผู้แจ้ง F: ชื่อ       G: นักศึกษา/หน่วยงาน H: ประเภทเรื่อง
// I: ความเร่งด่วน J: หัวข้อ      K: รายละเอียด   L: หมายเหตุ(ผู้ใช้)
// M: สถานะ      N: ผู้รับผิดชอบ  O: กำหนดตอบกลับ P: Comments
// Q: Pinned     R: FileURL (Google Drive link)

const {
  getSheetsClient, appendRow,
  SHEET_TICKETS,
  calcDueDate, formatDateThai, setCorsHeaders,
} = require('./_sheets');

const crypto = require('crypto');

// ════════════════════════════════════════════════════════
//  1. CLOUDFLARE TURNSTILE — Server-side verify
// ════════════════════════════════════════════════════════
// Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
async function verifyTurnstile(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // ── Dev mode / No-widget mode ──
  // ถ้าไม่มี TURNSTILE_SECRET_KEY → skip (dev mode)
  if (!secret) {
    console.warn('[Turnstile] TURNSTILE_SECRET_KEY not set — skipping verification');
    return { success: true, skipped: true };
  }

  // placeholder token ที่ client ส่งมาเมื่อ widget ไม่มีบนหน้า
  if (!token || typeof token !== 'string' ||
      token === 'bypass-no-widget' || token.length < 10) {
    // ถ้าไม่มี secret → already returned above
    // ถ้ามี secret แต่ token เป็น placeholder → block (production ต้องมี widget จริง)
    return { success: false, error: 'กรุณายืนยัน CAPTCHA ก่อนส่งเรื่อง' };
  }

  try {
    const body = new URLSearchParams({
      secret,
      response: token,
      ...(remoteIp ? { remoteip: remoteIp } : {}),
    });

    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const result = await resp.json();

    if (result.success) {
      return { success: true };
    }

    // Cloudflare ส่ง error-codes กลับมา
    const errCode = (result['error-codes'] || [])[0] || 'unknown';
    const errMap = {
      'missing-input-secret'  : 'ไม่พบ Turnstile Secret Key (ตั้งค่า env var)',
      'invalid-input-secret'  : 'Turnstile Secret Key ไม่ถูกต้อง',
      'missing-input-response': 'ไม่พบ Turnstile token',
      'invalid-input-response': 'Turnstile token ไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่',
      'timeout-or-duplicate'  : 'Turnstile token หมดอายุหรือถูกใช้ไปแล้ว กรุณาลองใหม่',
    };
    return {
      success: false,
      error: errMap[errCode] || `CAPTCHA ไม่ผ่าน (${errCode})`,
    };
  } catch (e) {
    console.error('[Turnstile] verify error:', e.message);
    // ถ้า Cloudflare API ล่ม → allow ผ่านเพื่อไม่ให้ service down
    // (เลือกความ availability เหนือ strict security ในกรณีนี้)
    return { success: true, fallback: true };
  }
}

// ════════════════════════════════════════════════════════
//  2. IP-BASED RATE LIMITING (In-Memory)
// ════════════════════════════════════════════════════════
// เหมาะสำหรับ Vercel Serverless แบบ single-instance
// ถ้า traffic สูงมากควรเปลี่ยนไปใช้ Upstash Redis
//
// กฎ: 1 IP → ส่งได้สูงสุด MAX_REQUESTS ครั้ง ภายใน WINDOW_MS
const RATE_LIMIT = {
  WINDOW_MS    : 60 * 60 * 1000, // window 1 ชั่วโมง
  MAX_REQUESTS : 5,               // สูงสุด 5 เรื่องต่อ IP ต่อชั่วโมง
};

// Map<ip, { count, windowStart }>
const _ipStore = new Map();

// cleanup เมื่อ store ใหญ่เกิน (ป้องกัน memory leak)
const _IP_STORE_MAX = 2000;
function _cleanupStore() {
  if (_ipStore.size < _IP_STORE_MAX) return;
  const now = Date.now();
  for (const [ip, entry] of _ipStore) {
    if (now - entry.windowStart > RATE_LIMIT.WINDOW_MS) _ipStore.delete(ip);
  }
}

function checkRateLimit(ip) {
  _cleanupStore();
  const now = Date.now();
  const entry = _ipStore.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT.WINDOW_MS) {
    // window ใหม่ หรือ IP ใหม่
    _ipStore.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT.MAX_REQUESTS - 1 };
  }

  if (entry.count >= RATE_LIMIT.MAX_REQUESTS) {
    const resetInMin = Math.ceil((RATE_LIMIT.WINDOW_MS - (now - entry.windowStart)) / 60000);
    return {
      allowed: false,
      resetInMin,
      message: `คุณส่งเรื่องครบ ${RATE_LIMIT.MAX_REQUESTS} ครั้งต่อชั่วโมงแล้ว กรุณารออีก ${resetInMin} นาที`,
    };
  }

  entry.count += 1;
  return { allowed: true, remaining: RATE_LIMIT.MAX_REQUESTS - entry.count };
}

// ════════════════════════════════════════════════════════
//  3. TICKET ID & USER ID
// ════════════════════════════════════════════════════════
function generateUserID() {
  return crypto.randomUUID();
}
function generateTicketId() {
  const thYear = String(new Date().getFullYear() + 543);
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `VOC-${thYear}-${suffix}`;
}

// ════════════════════════════════════════════════════════
//  4. NOTIFY EMAIL (fire-and-forget)
// ════════════════════════════════════════════════════════
async function sendNotifyEmail(ticketId, payload) {
  try {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}` : 'https://v-xi-beryl.vercel.app';
    await fetch(`${base}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sendAlert',
        ticketId,
        subject:      payload.subject      || '',
        priority:     payload.priority     || 'medium',
        customerType: payload.customerType || '',
        detail:       payload.detail       || '',
      }),
    });
  } catch (e) {
    console.error('notify error:', e.message);
  }
}

// ════════════════════════════════════════════════════════
//  5. MAIN HANDLER
// ════════════════════════════════════════════════════════
module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const p = req.body;

    // ── Validation เบื้องต้น ──
    if (!p.subject || !p.detail) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกหัวข้อและรายละเอียด' });
    }

    // ── ดึง IP จาก Vercel headers ──
    const remoteIp =
      String(req.headers['x-real-ip'] ||
             req.headers['x-forwarded-for'] ||
             req.socket?.remoteAddress || 'unknown')
        .split(',')[0].trim();

    // ── [A] IP Rate Limit ──
    const rateLimitResult = checkRateLimit(remoteIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        success: false,
        message: rateLimitResult.message,
        retryAfterMin: rateLimitResult.resetInMin,
      });
    }

    // ── [B] Cloudflare Turnstile Verify ──
    const turnstileResult = await verifyTurnstile(p.turnstileToken, remoteIp);
    if (!turnstileResult.success) {
      // ถ้า Turnstile fail → คืน count กลับ (ไม่นับ quota)
      const entry = _ipStore.get(remoteIp);
      if (entry && entry.count > 0) entry.count -= 1;

      return res.status(400).json({
        success: false,
        message: turnstileResult.error || 'CAPTCHA ไม่ผ่าน กรุณาลองใหม่',
      });
    }

    // ── [C] ประมวลผลข้อมูล ──
    const sheets   = await getSheetsClient();
    const userId   = generateUserID();
    const ticketId = generateTicketId();
    const now      = new Date();
    const dueDate  = calcDueDate(now, p.priority);

    // รับเฉพาะ URL จาก /api/upload — ห้าม base64
    const fileUrl = (typeof p.fileUrl === 'string' && p.fileUrl.startsWith('https://'))
      ? p.fileUrl.slice(0, 500)
      : '';

    const userNote = (p.userNote || '').replace(/\r?\n/g, ' ↵ ').trim();

    const displayName = p.isAnon ? 'นิรนาม' : (p.name      || '');
    const displayId   = p.isAnon ? '-'       : (p.studentId || '');

    const categories = Array.isArray(p.categories)
      ? p.categories.join(', ')
      : (p.categories || '');

    await appendRow(sheets, SHEET_TICKETS, [
      userId,
      ticketId,
      p.username      || 'guest',
      formatDateThai(now),
      p.customerType  || '',
      displayName,
      displayId,
      categories,
      p.priority      || 'medium',
      p.subject       || '',
      p.detail        || '',
      userNote,
      'รอดำเนินการ',
      '',
      dueDate,
      '',
      '',
      fileUrl,
    ]);

    sendNotifyEmail(ticketId, p);

    return res.json({
      success: true,
      ticketId,
      userId,
      rateLimitRemaining: rateLimitResult.remaining,
    });

  } catch (e) {
    console.error('submit error:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
};
