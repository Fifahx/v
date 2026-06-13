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

// แปล 1 string ผ่าน Google Translate (endpoint สาธารณะ ไม่ต้องใช้ API key)
// โควต้าสูงกว่า MyMemory มาก เหมาะเป็นตัวหลัก
async function _translateOneGoogle(text, sourceLang, targetLang) {
  if (!text || !text.trim()) return text;
  if (/^[\d\s\W]+$/.test(text)) return text;

  const { stripped, tags } = _stripHtml(text);
  const textToTranslate = stripped.trim();
  if (!textToTranslate) return text;

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(textToTranslate)}`;

  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`Google HTTP ${resp.status}`);

  const data = await resp.json();
  const segments = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
  const translatedText = segments.map(seg => (Array.isArray(seg) ? seg[0] : '')).join('');
  if (!translatedText) throw new Error('Google returned empty translation');

  return tags.length > 0 ? _restoreHtml(translatedText, tags) : translatedText;
}

// แปล 1 string ผ่าน MyMemory — ใช้เป็น fallback เมื่อ Google ใช้ไม่ได้
async function _translateOneMyMemory(text, sourceLang, targetLang) {
  if (!text || !text.trim()) return text;
  if (/^[\d\s\W]+$/.test(text)) return text;

  const { stripped, tags } = _stripHtml(text);
  const textToTranslate = stripped.trim();
  if (!textToTranslate) return text;

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=${sourceLang}|${targetLang}&de=voc-system@yru.ac.th`;

  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`MyMemory HTTP ${resp.status}`);

  const data = await resp.json();
  if (data.responseStatus === 403) throw new Error('MyMemory quota exceeded for today');

  const translatedText = data.responseData?.translatedText;
  if (!translatedText) throw new Error('MyMemory returned empty translation');

  return tags.length > 0 ? _restoreHtml(translatedText, tags) : translatedText;
}

// แปล 1 string — ลอง Google ก่อน (โควต้าสูง) ถ้าพังให้ fallback ไป MyMemory
async function _translateOne(text, sourceLang, targetLang) {
  // ข้ามถ้าว่างหรือเป็นตัวเลข/emoji/สัญลักษณ์เท่านั้น
  if (!text || !text.trim()) return text;
  if (/^[\d\s\W]+$/.test(text)) return text;

  const ckey = _cacheKey(text);
  if (_cache.has(ckey)) return _cache.get(ckey);

  let result;
  try {
    result = await _translateOneGoogle(text, sourceLang, targetLang);
  } catch (e) {
    console.warn(`[translate] Google ล้มเหลว ("${text.slice(0,30)}..."): ${e.message} — ลอง MyMemory แทน`);
    result = await _translateOneMyMemory(text, sourceLang, targetLang);
  }

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
