// api/translate.js v1
// POST /api/translate  { texts: string[], targetLang: 'en'|'th' }
// แปลภาษาผ่าน OpenAI GPT-4o-mini — ประหยัดต้นทุน เหมาะกับ UI strings
//
// Environment Variable ที่ต้องเพิ่มใน Vercel:
//   OPENAI_API_KEY = sk-...
//
// Response: { success: true, translated: string[] }

const { setCorsHeaders } = require('./_sheets');

// Cache อย่างง่าย (in-memory per instance) เพื่อลด API calls ซ้ำ
const _cache = new Map();
const CACHE_MAX = 500;

function _cacheKey(texts, lang) {
  return lang + ':' + texts.join('|||');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { texts, targetLang } = req.body;

  if (!Array.isArray(texts) || texts.length === 0) {
    return res.status(400).json({ success: false, error: 'texts must be a non-empty array' });
  }
  if (!['en', 'th'].includes(targetLang)) {
    return res.status(400).json({ success: false, error: 'targetLang must be en or th' });
  }

  // ถ้าขอแปลเป็น TH แต่ texts เป็น TH อยู่แล้ว → คืนเดิม
  if (targetLang === 'th') {
    return res.json({ success: true, translated: texts, cached: true });
  }

  // ตรวจ cache
  const ckey = _cacheKey(texts, targetLang);
  if (_cache.has(ckey)) {
    return res.json({ success: true, translated: _cache.get(ckey), cached: true });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // ถ้าไม่มี API key → คืน texts เดิม (fallback gracefully)
    console.warn('[translate] OPENAI_API_KEY not set — returning original texts');
    return res.json({ success: true, translated: texts, fallback: true });
  }

  try {
    const langLabel = targetLang === 'en' ? 'English' : 'Thai';

    // ส่งเป็น JSON array เพื่อรับ JSON array กลับ — หลีกเลี่ยงการ parse ผิดพลาด
    const prompt = `Translate the following JSON array of UI strings from Thai to ${langLabel}.
Return ONLY a valid JSON array with the same number of elements, in the same order.
Preserve HTML tags, emojis, and placeholders exactly as-is.
Do not add explanations.

Input: ${JSON.stringify(texts)}`;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: Math.min(texts.join('').length * 3 + 200, 2000),
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`OpenAI API error ${resp.status}: ${err.slice(0, 200)}`);
    }

    const data = await resp.json();
    const raw  = data.choices?.[0]?.message?.content || '[]';

    // Parse JSON — strip markdown fences if any
    const clean = raw.replace(/```json|```/gi, '').trim();
    let translated;
    try {
      translated = JSON.parse(clean);
    } catch (e) {
      // fallback: split by newline if JSON parse fails
      translated = clean.split('\n').filter(Boolean);
    }

    // ต้องให้จำนวนตรงกัน
    if (!Array.isArray(translated) || translated.length !== texts.length) {
      console.warn('[translate] length mismatch, using fallback');
      translated = texts; // fallback ป้องกัน UI พัง
    }

    // เก็บ cache (ป้องกัน memory leak)
    if (_cache.size >= CACHE_MAX) {
      const firstKey = _cache.keys().next().value;
      _cache.delete(firstKey);
    }
    _cache.set(ckey, translated);

    return res.json({ success: true, translated });

  } catch (e) {
    console.error('[translate] error:', e.message);
    // Graceful fallback — คืน texts เดิม ไม่ให้ UI พัง
    return res.json({ success: true, translated: texts, fallback: true, error: e.message });
  }
};
