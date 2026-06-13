// api/translate.js v4 — Optimized Google & MyMemory API
// POST /api/translate  { texts: string[], targetLang: 'en'|'th' }
// Response: { success: true, translated: string[] }

const { setCorsHeaders } = require('./_sheets');

// In-memory cache — ป้องกัน API calls ซ้ำในทุก session ของ Vercel instance
const _cache = new Map();
const CACHE_MAX = 500;

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

// แปล 1 string ผ่าน Google Translate (เดี่ยว - ใช้เป็น Fallback)
async function _translateOneGoogle(text, sourceLang, targetLang) {
  if (!text || !text.trim()) return text;
  if (/^[\d\s\W]+$/.test(text)) return text;

  const { stripped, tags } = _stripHtml(text);
  const textToTranslate = stripped.trim();
  if (!textToTranslate) return text;

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(textToTranslate)}`;

  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (!resp.ok) throw new Error(`Google HTTP ${resp.status}`);

  const data = await resp.json();
  const segments = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
  const translatedText = segments.map(seg => (Array.isArray(seg) ? seg[0] : '')).join('');
  if (!translatedText) throw new Error('Google returned empty translation');

  return tags.length > 0 ? _restoreHtml(translatedText, tags) : translatedText;
}

// แปล 1 string ผ่าน MyMemory (เดี่ยว - ใช้เป็น Fallback ลำดับสุดท้าย)
async function _translateOneMyMemory(text, sourceLang, targetLang) {
  if (!text || !text.trim()) return text;
  if (/^[\d\s\W]+$/.test(text)) return text;

  const { stripped, tags } = _stripHtml(text);
  const textToTranslate = stripped.trim();
  if (!textToTranslate) return text;

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=${sourceLang}|${targetLang}&de=voc-system@yru.ac.th`;

  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (!resp.ok) throw new Error(`MyMemory HTTP ${resp.status}`);

  const data = await resp.json();
  if (data.responseStatus === 403) throw new Error('MyMemory quota exceeded for today');

  const translatedText = data.responseData?.translatedText;
  if (!translatedText) throw new Error('MyMemory returned empty translation');

  return tags.length > 0 ? _restoreHtml(translatedText, tags) : translatedText;
}

// แปลเดี่ยวแบบมีระบบ Fallback
async function _translateOne(text, sourceLang, targetLang) {
  if (!text || !text.trim()) return text;
  if (/^[\d\s\W]+$/.test(text)) return text;

  const ckey = _cacheKey(text);
  if (_cache.has(ckey)) return _cache.get(ckey);

  let result;
  try {
    result = await _translateOneGoogle(text, sourceLang, targetLang);
  } catch (e) {
    console.warn(`[translate] Google single fallback failed: ${e.message} — trying MyMemory`);
    try {
      result = await _translateOneMyMemory(text, sourceLang, targetLang);
    } catch (err2) {
      result = text; // คืนค่าเดิมถ้าพังหมด
    }
  }

  if (result && result !== text) {
    if (_cache.size >= CACHE_MAX) _cache.delete(_cache.keys().next().value);
    _cache.set(ckey, result);
  }
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
    const finalResult = new Array(texts.length);
    const indicesToTranslate = [];
    const textsToTranslate = [];

    // 1. แยกข้อความ: ตัวไหนดึงจาก Cache ได้ หรือไม่ต้องแปล ให้ใส่รอไว้เลย
    texts.forEach((text, idx) => {
      if (!text || !text.trim() || /^[\d\s\W]+$/.test(text)) {
        finalResult[idx] = text;
      } else {
        const ckey = _cacheKey(text);
        if (_cache.has(ckey)) {
          finalResult[idx] = _cache.get(ckey);
        } else {
          indicesToTranslate.push(idx);
          textsToTranslate.push(text);
        }
      }
    });

    // ถ้าทุกคำมีใน Cache ครบแล้ว ส่งกลับได้ทันที ไม่ต้องยิง API
    if (textsToTranslate.length === 0) {
      return res.json({ success: true, translated: finalResult });
    }

    // 2. รวบรวมคำที่เหลือ แปลแบบรวมกลุ่ม (Batch) เพื่อลดภาระและเลี่ยง Rate Limit (ยิงทีเดียวจบ)
    try {
      const combinedText = textsToTranslate.join('\n');
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(combinedText)}`;

      const resp = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(12000),
      });

      if (!resp.ok) throw new Error(`Google Batch HTTP ${resp.status}`);

      const data = await resp.json();
      const segments = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
      const translatedCombined = segments.map(seg => (Array.isArray(seg) ? seg[0] : '')).join('');

      // แยกคำแปลกลับมาเป็นรายบรรทัด
      const translatedLines = translatedCombined.split('\n');

      if (translatedLines.length === textsToTranslate.length) {
        // จำนวนตรงกันอย่างสมบูรณ์ ผูกค่ากลับคืนและบันทึก Cache
        indicesToTranslate.forEach((originalIdx, i) => {
          const transText = translatedLines[i].trim();
          finalResult[originalIdx] = transText || texts[originalIdx];

          if (transText) {
            const ckey = _cacheKey(texts[originalIdx]);
            if (_cache.size >= CACHE_MAX) _cache.delete(_cache.keys().next().value);
            _cache.set(ckey, transText);
          }
        });

        return res.json({ success: true, translated: finalResult });
      } else {
        throw new Error(`Line mismatch in batch (${translatedLines.length} vs ${textsToTranslate.length})`);
      }

    } catch (batchError) {
      console.warn(`[translate] Batch failed (${batchError.message}), falling back to safe individual sequence...`);

      // 3. แผนสำรอง (Fallback): แปลเรียงตัวแบบจำกัดความถี่ เพื่อความทนทานสูงสุด
      for (let i = 0; i < indicesToTranslate.length; i++) {
        const originalIdx = indicesToTranslate[i];
        finalResult[originalIdx] = await _translateOne(texts[originalIdx], sourceLang, targetLang);

        // หน่วงเวลาเล็กน้อย 50ms ระหว่างตัวเพื่อไม่ให้โดน Rate limit บล็อกซ้ำสอง
        await new Promise(r => setTimeout(r, 50));
      }

      return res.json({ success: true, translated: finalResult });
    }

  } catch (e) {
    console.error('[translate] fatal error:', e.message);
    return res.json({ success: true, translated: texts, fallback: true, error: e.message });
  }
};