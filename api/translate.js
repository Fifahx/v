// api/translate.js v2 — แก้ปัญหา max_tokens น้อย, CSP, และ debug ดีขึ้น
// POST /api/translate  { texts: string[], targetLang: 'en'|'th' }
//
// Environment Variable ที่ต้องเพิ่มใน Vercel:
//   OPENAI_API_KEY = sk-...

const { setCorsHeaders } = require('./_sheets');

const _cache = new Map();
const CACHE_MAX = 200; // ลดลงเพราะ texts มีขนาดใหญ่

function _cacheKey(texts, lang) {
  // hash เบาๆ เพื่อป้องกัน key ยาวเกิน
  const raw = lang + ':' + texts.join('|||');
  return raw.length > 2000 ? lang + ':hash:' + raw.length + ':' + raw.slice(0, 100) : raw;
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { texts, targetLang } = req.body || {};

  if (!Array.isArray(texts) || texts.length === 0) {
    return res.status(400).json({ success: false, error: 'texts must be a non-empty array' });
  }
  if (!['en', 'th'].includes(targetLang)) {
    return res.status(400).json({ success: false, error: 'targetLang must be en or th' });
  }

  // คืน TH เดิมทันที
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
    console.warn('[translate] OPENAI_API_KEY not set');
    return res.json({ success: true, translated: texts, fallback: true, reason: 'no_api_key' });
  }

  try {
    // แบ่ง texts เป็น batch เพื่อป้องกัน token overflow (max 40 items ต่อครั้ง)
    const BATCH = 40;
    let translated = [];

    for (let i = 0; i < texts.length; i += BATCH) {
      const chunk = texts.slice(i, i + BATCH);
      const chunkTranslated = await _translateChunk(chunk, apiKey);
      translated = translated.concat(chunkTranslated);
    }

    // ตรวจจำนวนต้องตรงกัน
    if (translated.length !== texts.length) {
      console.warn(`[translate] length mismatch: got ${translated.length}, expected ${texts.length}`);
      translated = texts;
    }

    // cache
    if (_cache.size >= CACHE_MAX) {
      _cache.delete(_cache.keys().next().value);
    }
    _cache.set(ckey, translated);

    return res.json({ success: true, translated });

  } catch (e) {
    console.error('[translate] error:', e.message);
    return res.json({ success: true, translated: texts, fallback: true, error: e.message });
  }
};

async function _translateChunk(chunk, apiKey) {
  const prompt = `Translate the following JSON array of Thai UI strings to English.
Return ONLY a valid JSON array with exactly ${chunk.length} elements in the same order.
Preserve HTML tags (<i>, <strong>, etc.), emojis, brand names, and numbers exactly as-is.
Do not add explanations or markdown.

Input: ${JSON.stringify(chunk)}`;

  // คำนวณ token ที่ต้องการ: input * 1.5 (EN มักสั้นกว่า TH) + buffer
  const inputLen = chunk.join('').length;
  const maxTokens = Math.min(Math.max(inputLen * 2 + 300, 500), 4000);

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' }, // บังคับ JSON mode
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err.slice(0, 300)}`);
  }

  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content || '{}';

  // JSON mode คืน object → ต้องดึง array ออกมา
  let parsed;
  try {
    const obj = JSON.parse(raw);
    // ลอง key ต่างๆ ที่ GPT มักใช้
    parsed = obj.translations || obj.translated || obj.result || obj.items || Object.values(obj)[0];
    if (!Array.isArray(parsed)) {
      // บางครั้ง GPT คืน {"0":"...", "1":"..."} 
      parsed = Object.values(obj);
    }
  } catch (e) {
    // fallback: strip fences แล้ว parse
    const clean = raw.replace(/```json|```/gi, '').trim();
    try {
      parsed = JSON.parse(clean);
      if (!Array.isArray(parsed)) parsed = Object.values(parsed);
    } catch {
      parsed = chunk; // worst case: คืนเดิม
    }
  }

  // ปรับขนาดให้ตรง
  if (!Array.isArray(parsed) || parsed.length !== chunk.length) {
    console.warn(`[translate] chunk mismatch: got ${Array.isArray(parsed) ? parsed.length : 'non-array'}, expected ${chunk.length}`);
    return chunk;
  }

  return parsed.map((t, i) => (typeof t === 'string' && t.trim() ? t : chunk[i]));
}
