// Gemini OCR Service with Multi-Model Fallback & Ban/Quota System

export const GEMINI_MODELS = [
  "gemini-3.7-flash",        // 🥇 ฉลาดและแม่นยำสูงสุด
  "gemini-3.5-flash",        // 🥈 ฉลาดระดับสูงมาก
  "gemini-3-flash-preview",  // 🥉 ตระกูล 3 Flash
  "gemini-2.5-flash",        // 🏅 มาตรฐานความแม่นยำสูง
  "gemini-3.1-flash-lite",   // 🛡️ ตัวรับจบ โควต้าสูงสุด 500 ครั้ง/วัน สแกนได้ต่อเนื่อง
  "gemini-2.5-flash-lite",   // 🛡️ สำรอง Lite
  "gemini-flash-lite-latest" // 🛡️ สำรอง Lite ตัวสุดท้าย
];

export const getNextResetTime = () => {
  const now = new Date();
  const resetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0, 0, 0));
  if (now.getTime() >= resetTime.getTime()) {
    resetTime.setUTCDate(resetTime.getUTCDate() + 1);
  }
  return resetTime.getTime();
};

export const checkAndClearBans = () => {
  try {
    const savedBans = JSON.parse(localStorage.getItem('gemini_model_bans') || '{}');
    const now = Date.now();
    let changed = false;
    for (const model in savedBans) {
      if (now >= savedBans[model]) {
        delete savedBans[model];
        changed = true;
      }
    }

    // หากทุกโมเดลถูกแบน ให้เคลียร์แบนทั้งหมดเพื่อลองใหม่
    const allBanned = GEMINI_MODELS.length > 0 && GEMINI_MODELS.every(m => savedBans[m]);
    if (allBanned) {
      localStorage.setItem('gemini_model_bans', '{}');
      return {};
    }

    if (changed) {
      localStorage.setItem('gemini_model_bans', JSON.stringify(savedBans));
    }
    return savedBans;
  } catch (e) {
    localStorage.setItem('gemini_model_bans', '{}');
    return {};
  }
};

export const banModel = (model) => {
  try {
    const savedBans = JSON.parse(localStorage.getItem('gemini_model_bans') || '{}');
    savedBans[model] = getNextResetTime();
    localStorage.setItem('gemini_model_bans', JSON.stringify(savedBans));
    console.warn(`[Quota System] โมเดล ${model} ติดโควต้า พักการใช้งานชั่วคราว`);
  } catch (e) {}
};

// ฟังก์ชันบีบอัดรูปภาพให้คมชัดและขนาดกะทัดรัด สำหรับแสดงผลบนทุกอุปกรณ์แบบไร้รอยต่อ
export const compressImageToBase64 = (file, maxDim = 1400, quality = 0.82) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const getFilterCSS = (filter = 'magic') => {
  switch (filter) {
    case 'bw': return 'grayscale(100%) contrast(150%) brightness(95%)';
    case 'invert': return 'invert(100%) contrast(150%)';
    case 'sharp': return 'contrast(160%) brightness(105%)';
    case 'magic': return 'grayscale(100%) contrast(250%) brightness(90%)';
    case 'hdr': return 'contrast(130%) brightness(115%) saturate(120%)';
    case 'normal': return 'none';
    default: return 'grayscale(100%) contrast(250%) brightness(90%)';
  }
};

export const safeParseGeminiJSON = (rawText) => {
  if (!rawText) throw new Error("ผลลัพธ์จาก AI ว่างเปล่า");
  let text = String(rawText).replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(text);
  } catch (initialErr) {
    try {
      let repaired = text.replace(/,\s*([\]}])/g, '$1');
      const quoteMatches = repaired.match(/"/g);
      if (quoteMatches && quoteMatches.length % 2 !== 0) {
        repaired += '"';
      }
      const openBrackets = (repaired.match(/\[/g) || []).length;
      const closeBrackets = (repaired.match(/\]/g) || []).length;
      const openBraces = (repaired.match(/\{/g) || []).length;
      const closeBraces = (repaired.match(/\}/g) || []).length;
      
      for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
      for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';
      
      return JSON.parse(repaired);
    } catch (repairErr) {
      throw new Error(`รูปแบบ JSON จาก AI ไม่สมบูรณ์: ${initialErr.message}`);
    }
  }
};

const OCR_PROMPT = `
You are an expert OCR assistant for SCG JWD Logistics driver job sheets.
Analyze the driver sheet in the image. It has numbered rows (1 to 25).

Extract:
1. truck_no: The truck number from top right (e.g. "505")
2. rows: Array of row objects for all filled rows:
   - seq_no: 1 to 25
   - port: Port code (e.g. "B1", "B5", "C1", "BA")
   - container_no: Standard container number (4 uppercase letters + 7 digits, e.g. "TEMU5533461")
   - size: Container size ("20", "40", "45")
   - job_type: Check the table columns for "DIS" and "LOAD". If there is a checkmark (✓, ✕, slash, dot, or tick) in the DIS column, set "Dis". If in the LOAD column, set "Load". If blank or unclear, set null.

Return JSON format:
{
  "truck_no": "505",
  "rows": [
    { "seq_no": 1, "port": "B5", "container_no": "TEMU5533461", "size": "40", "job_type": "Dis" }
  ]
}
`;

/**
 * Execute Gemini OCR with multi-model fallback hierarchy
 * @param {Object} options
 * @param {string} options.base64Data - Base64 JPEG data string
 * @param {string} options.apiKey - Google Gemini API Key
 * @param {Function} [options.onLog] - Optional logger callback (msg, type)
 * @returns {Promise<{ parsed: Object, usedModel: string }>}
 */
export const executeGeminiOCR = async ({ base64Data, apiKey, onLog }) => {
  if (!apiKey) {
    throw new Error("ยังไม่ได้ตั้งค่า Gemini API Key! กรุณาไปตั้งค่าที่เมนู Owner Settings ก่อนครับ");
  }
  if (!base64Data) {
    throw new Error("ไม่สามารถอ่านข้อมูลไฟล์รูปภาพได้ กรุณาตรวจสอบไฟล์รูปภาพอีกครั้ง");
  }

  const log = (msg, type = 'info') => {
    if (onLog) onLog(msg, type);
  };

  let activeBans = checkAndClearBans();
  let parsed = null;
  let usedModel = null;

  for (let m = 0; m < GEMINI_MODELS.length; m++) {
    const model = GEMINI_MODELS[m];
    if (activeBans[model]) {
      log(`⏭️ ข้าม ${model} (เนื่องจากติดโควต้า 429 ในวันนี้)`, 'warn');
      continue;
    }
    
    const shortModel = model.replace('gemini-', '');
    log(`🤖 กำลังเรียก [${m + 1}/${GEMINI_MODELS.length}] ${model}...`, 'info');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: OCR_PROMPT }, { inline_data: { mime_type: "image/jpeg", data: base64Data } }] }],
          generationConfig: { 
            responseMimeType: "application/json", 
            temperature: 0.1,
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      });
      clearTimeout(timeoutId);

      if (response.status === 429) {
        banModel(model);
        activeBans = checkAndClearBans();
        log(`⚠️ ${shortModel} ติดโควต้า (429) ➡️ สลับไปยังโมเดลถัดไป...`, 'warn');
        continue;
      }
      if (response.status === 404 || response.status === 503) {
        log(`⚠️ ${shortModel} ไม่พร้อมใช้งาน (${response.status}) ➡️ สลับตัวถัดไป...`, 'warn');
        continue;
      }
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`API Error ${response.status}: ${errText.substring(0, 80)}`);
      }
      
      const rawData = await response.json();
      const rawText = rawData.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!rawText) {
        throw new Error("ไม่มีข้อความตอบกลับจาก AI");
      }

      parsed = safeParseGeminiJSON(rawText);
      usedModel = model;
      log(`✨ ${shortModel} ตอบกลับและพาร์สข้อมูลสำเร็จ!`, 'success');
      break; 
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') {
        log(`⏱️ ${shortModel} ตอบสนองช้าเกิน 15 วินาที (Timeout) ➡️ สลับตัวถัดไปทันที`, 'warn');
      } else {
        log(`❌ ${shortModel} ข้อผิดพลาด: ${fetchErr.message} ➡️ สลับตัวถัดไป...`, 'warn');
      }
      if (m === GEMINI_MODELS.length - 1 && !parsed) throw fetchErr;
    }
  }

  if (!parsed) {
    throw new Error("โมเดล Gemini ทั้งหมดติดโควต้าหรือเกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
  }

  return { parsed, usedModel };
};
