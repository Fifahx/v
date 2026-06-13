// api/translate.js v5 — Gemini (แปล+ขัดให้กระชับ) + Google Cloud Translate + Free Google fallback
// POST /api/translate  { texts: string[], targetLang: 'en'|'th' }
// Response: { success: true, translated: string[] }

const { setCorsHeaders } = require('./_sheets');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// In-memory cache — ป้องกัน API calls ซ้ำในทุก session ของ Vercel instance
const _cache = new Map();
const CACHE_MAX = 1000;

function _cacheKey(text) {
  return 'en:' + (text.length > 200 ? text.slice(0, 200) + text.length : text);
}

function _setCache(key, value) {
  if (_cache.size >= CACHE_MAX) _cache.delete(_cache.keys().next().value);
  _cache.set(key, value);
}

// ── strip HTML tags ออกก่อนแปล แล้วใส่กลับทีหลัง ──────────────────────────────
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

// ── 1) Gemini: แปลไทย→อังกฤษ พร้อมขัดให้กระชับ สื่อความหมายตรง ────────────────
async function _translateBatchGemini(items) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

  const numbered = items
    .map((t, i) => `${i + 1}. ${t.stripped.replace(/\n/g, ' ')}`)
    .join('\n');

  const prompt =
`You are a professional Thai-to-English translator and editor for a university website UI (VOC System).
Translate each numbered Thai line into natural, concise, professional English suitable for a website UI.
Rules:
- Keep the same meaning as the original Thai — do NOT add or remove information.
- Make it shorter and more natural where possible (UI labels, buttons, short sentences should be concise).
- Keep placeholders like __TAG0__, __TAG1__ exactly as-is, do not translate or remove them.
- Keep numbers, dates, and proper nouns (names, "VOC", "YRU", etc.) unchanged.
- Return ONLY a valid JSON array of strings, same length and same order as the input, with no extra text, no markdown code fences.

Input:
${numbered}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}`);

    const data = await resp.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('Gemini empty response');

    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    const arr = JSON.parse(cleaned);
    if (!Array.isArray(arr) || arr.length !== items.length) {
      throw new Error(`Gemini result length mismatch (${Array.isArray(arr) ? arr.length : 'n/a'} vs ${items.length})`);
    }
    return arr.map(s => String(s || '').trim());
  } finally {
    clearTimeout(timer);
  }
}

// ── 2) Free Google Translate (translate.googleapis.com) — fallback สุดท้าย ──
async function _translateBatchFree(items, sourceLang, targetLang) {
  const combinedText = items.map(it => it.stripped.trim()).join('\n');
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(combinedText)}`;

  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`Free Google Translate HTTP ${resp.status}`);

  const data = await resp.json();
  const segments = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
  const translatedCombined = segments.map(seg => (Array.isArray(seg) ? seg[0] : '')).join('');
  const lines = translatedCombined.split('\n');
  if (lines.length !== items.length) throw new Error('Free Google Translate line mismatch');
  return lines.map(l => l.trim());
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

  // TH → คืนเดิมทันที (ไม่มีการแปล)
  if (targetLang === 'th') {
    return res.json({ success: true, translated: texts });
  }

  const sourceLang = 'th';

  try {
    const finalResult = new Array(texts.length);
    const indicesToTranslate = [];
    const itemsToTranslate = [];

    // 1. แยกข้อความ: ตัวไหนดึงจาก Cache ได้ หรือไม่ต้องแปล ให้ใส่รอไว้เลย
    texts.forEach((text, idx) => {
      if (!text || !text.trim() || /^[\d\s\W]+$/.test(text)) {
        finalResult[idx] = text;
        return;
      }
      const ckey = _cacheKey(text);
      if (_cache.has(ckey)) {
        finalResult[idx] = _cache.get(ckey);
        return;
      }
      const { stripped, tags } = _stripHtml(text);
      const textToTranslate = stripped.trim();
      if (!textToTranslate) {
        finalResult[idx] = text;
        return;
      }
      indicesToTranslate.push(idx);
      itemsToTranslate.push({ original: text, stripped: textToTranslate, tags });
    });

    if (itemsToTranslate.length === 0) {
      return res.json({ success: true, translated: finalResult });
    }

    let translatedTexts = null;
    let usedEngine = '';

    // 2. ลำดับ: Gemini (แปล+ขัดให้กระชับ) → Free Google Translate (fallback)
    try {
      translatedTexts = await _translateBatchGemini(itemsToTranslate);
      usedEngine = 'gemini';
    } catch (e1) {
      console.warn(`[translate] Gemini failed: ${e1.message} — trying Free Google Translate`);
      try {
        translatedTexts = await _translateBatchFree(itemsToTranslate, sourceLang, targetLang);
        usedEngine = 'free';
      } catch (e3) {
        console.warn(`[translate] Free Google Translate failed: ${e3.message}`);
      }
    }

    if (translatedTexts) {
      indicesToTranslate.forEach((originalIdx, i) => {
        const item = itemsToTranslate[i];
        let transText = translatedTexts[i] || '';
        if (item.tags.length > 0) transText = _restoreHtml(transText, item.tags);
        transText = transText.trim();

        finalResult[originalIdx] = transText || texts[originalIdx];

        if (transText) {
          _setCache(_cacheKey(texts[originalIdx]), transText);
        }
      });
    } else {
      // ทุกวิธีพัง — คืนข้อความเดิมไปก่อน
      indicesToTranslate.forEach((originalIdx) => {
        finalResult[originalIdx] = texts[originalIdx];
      });
    }

    return res.json({ success: true, translated: finalResult, engine: usedEngine || 'none' });

  } catch (e) {
    console.error('[translate] fatal error:', e.message);
    return res.json({ success: true, translated: texts, fallback: true, error: e.message });
  }
};
