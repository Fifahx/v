// api/translate.js v3 — MyMemory API (ฟรี 100%, ไม่ต้องมี API key)
// POST /api/translate  { texts: string[], targetLang: 'en'|'th' }
// Response: { success: true, translated: string[] }
//
// MyMemory: https://mymemory.translated.net/doc/spec.php
// Free tier: 5,000 คำ/วัน (เกินพอสำหรับ UI strings)
// แม่นยำ: ใช้ฐานข้อมูล human translation + machine translation ร่วมกัน

const { setCorsHeaders } = require('./_sheets');

// In-memory cache — ป้องกัน API calls ซ้ำในทุก session ของ Vercel instance
const _cache = new Map();
const CACHE_MAX = 300;

// ── helpers ─────────────────────────────────────────────────────────────────

function _cacheKey(text) {
  return 'en:' + (text.length > 200 ? text.slice(0, 200) + text.length : text);
}

// strip HTML tags ออกก่อนแปล แล้วใส่กลับทีหลัง
function _stripHtml(html) {
  const tags = [];
  let idx = 0;
  const stripped = html.replace(/<[^>]+>/g, (tag) => {
    const placeholder = `__TAG${idx}__`;
    tags.push({ placeholder, tag });
    idx++;
    return placeholder;
  });
  return { stripped, tags };
}

function _restoreHtml(translated, tags) {
  let result = translated;
  for (const { placeholder, tag } of tags) {
    result = result.replace(placeholder, tag);
  }
  return result;
}

// แปล 1 string ผ่าน MyMemory
async function _translateOne(text, sourceLang, targetLang) {
  // ข้ามถ้าว่างหรือเป็นตัวเลข/emoji/สัญลักษณ์เท่านั้น
  if (!text || !text.trim()) return text;
  if (/^[\d\s\W]+$/.test(text)) return text;

  const ckey = _cacheKey(text);
  if (_cache.has(ckey)) return _cache.get(ckey);

  // strip HTML ก่อนส่งไปแปล (MyMemory ไม่เข้าใจ HTML tags)
  const { stripped, tags } = _stripHtml(text);
  const textToTranslate = stripped.trim();
  if (!textToTranslate) return text;

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=${sourceLang}|${targetLang}&de=voc-system@yru.ac.th`;

  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000), // timeout 8 วิ
  });

  if (!resp.ok) throw new Error(`MyMemory HTTP ${resp.status}`);

  const data = await resp.json();

  // responseStatus 200 = สำเร็จ, 403 = quota หมด
  if (data.responseStatus === 403) {
    throw new Error('MyMemory quota exceeded for today');
  }

  const translatedText = data.responseData?.translatedText;
  if (!translatedText) throw new Error('MyMemory returned empty translation');

  // restore HTML tags กลับ
  const result = tags.length > 0 ? _restoreHtml(translatedText, tags) : translatedText;

  // cache
  if (_cache.size >= CACHE_MAX) _cache.delete(_cache.keys().next().value);
  _cache.set(ckey, result);

  return result;
}

// ── main handler ─────────────────────────────────────────────────────────────

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

  // TH → คืนเดิมทันที
  if (targetLang === 'th') {
    return res.json({ success: true, translated: texts });
  }

  const sourceLang = 'th';

  try {
    // แปลแบบ parallel (จำกัดไว้ 5 ต่อครั้งเพื่อไม่ให้ rate limit)
    const CONCURRENCY = 5;
    const translated = new Array(texts.length);

    for (let i = 0; i < texts.length; i += CONCURRENCY) {
      const chunk = texts.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(t => _translateOne(t, sourceLang, targetLang))
      );
      results.forEach((r, j) => {
        // ถ้าแปลสำเร็จใช้ผลลัพธ์, ถ้า fail คืนต้นฉบับ
        translated[i + j] = r.status === 'fulfilled' ? r.value : texts[i + j];
        if (r.status === 'rejected') {
          console.warn(`[translate] item ${i+j} failed: ${r.reason?.message}`);
        }
      });
    }

    return res.json({ success: true, translated });

  } catch (e) {
    console.error('[translate] fatal error:', e.message);
    // graceful fallback — คืนต้นฉบับไทยแทนที่จะพัง
    return res.json({ success: true, translated: texts, fallback: true, error: e.message });
  }
};
