// api/content.js
// รวม 4 endpoint (news / faq / mgmt / settings) ไว้ใน Serverless Function เดียว
// เพื่อไม่ให้ชนเพดานจำนวน function ของ Vercel
//
// เรียกใช้:  /api/content?module=news   (GET/POST)
//           /api/content?module=faq
//           /api/content?module=mgmt&all=1
//           /api/content?module=settings
//
// URL เดิม (/api/news, /api/faq, /api/mgmt, /api/settings) ยังใช้ได้
// เพราะ vercel.json rewrite มาที่นี่ให้อัตโนมัติ
//
// ตัว handler จริงอยู่ใน api/_news.js, _faq.js, _mgmt.js, _settings.js
// (ชื่อขึ้นต้นด้วย _ Vercel จะไม่นับเป็น function)

const { setCorsHeaders } = require('./_sheets');

const HANDLERS = {
  news: () => require('./_news'),
  faq: () => require('./_faq'),
  mgmt: () => require('./_mgmt'),
  settings: () => require('./_settings'),
};

function resolveModule(req) {
  // 1) query string ปกติ
  const fromQuery = req.query?.module;
  if (fromQuery) return String(fromQuery);
  // 2) body (เผื่อ client ส่งมาใน POST)
  const fromBody = req.body?.module;
  if (fromBody) return String(fromBody);
  // 3) อ่านจาก req.url ตรง ๆ — กันกรณี rewrite ไม่ได้ merge query เข้า req.query
  const m = String(req.url || '').match(/[?&]module=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  // 4) เดาจาก path เดิมก่อน rewrite
  const p = String(req.url || '').match(/^\/api\/(news|faq|mgmt|settings)\b/);
  return p ? p[1] : '';
}

module.exports = async function handler(req, res) {
  const mod = resolveModule(req);
  const load = HANDLERS[mod];

  if (!load) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    return res.status(400).json({
      success: false,
      message: `ไม่รู้จัก module "${mod}" — ต้องเป็นหนึ่งใน: ${Object.keys(HANDLERS).join(', ')}`,
    });
  }

  return load()(req, res);
};
