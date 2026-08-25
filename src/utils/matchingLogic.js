import { supabase } from '../supabaseClient.js';
// อัลกอริทึมหาความเหมือนของตัวอักษร (Levenshtein Distance)
const levenshteinDistance = (a, b) => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

// ค้นหาและจับคู่เลขตู้ (อ้างอิงจาก V2 old_match_logic.txt)
export const findTopContainerMatches = (ocrCno, dbList, limit = 3) => {
  if (!ocrCno) return [];
  
  const ocrClean = String(ocrCno).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!ocrClean) return [];

  const ocrLetters = ocrClean.replace(/[^A-Z]/g, '');
  const ocrDigits = ocrClean.replace(/[^0-9]/g, '');
  const ocrPrefix = ocrLetters.length >= 4 ? ocrLetters.slice(-4) : ocrLetters;

  // หา Valid prefixes ใน DB
  const validPrefixes = new Set();
  dbList.forEach(dbItem => {
    const letters = String(dbItem.container_no).toUpperCase().replace(/[^A-Z]/g, '');
    if (letters.length >= 4) validPrefixes.add(letters.slice(0, 4));
  });

  const isOcrPrefixValid = validPrefixes.has(ocrPrefix);
  let candidates = [];

  for (const dbItem of dbList) {
    const dbCno = dbItem.container_no;
    if (!dbCno) continue;
    
    const dbClean = String(dbCno).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const dbLetters = dbClean.replace(/[^A-Z]/g, '');
    const dbDigits = dbClean.replace(/[^0-9]/g, '');
    const dbPrefix = dbLetters.slice(0, 4);

    // 1. Substring Match (ถ้ามีตัวอักษรหรือตัวเลขตรงกันเป็นคำค้นหา)
    if (ocrClean.length >= 1 && dbClean.includes(ocrClean)) {
      const score = 0.85 + (ocrClean.length / dbClean.length) * 0.14;
      candidates.push({ record: dbItem, score });
      continue;
    }

    let prefixRatio = 1.0;
    let prefixMismatch = false;

    if (ocrLetters.length > 0) {
      const dist = levenshteinDistance(dbPrefix, ocrLetters);
      const maxLen = Math.max(dbPrefix.length, ocrLetters.length, 1);
      prefixRatio = 1.0 - (dist / maxLen);

      if (ocrLetters.length >= 3) {
        const distLast4 = levenshteinDistance(dbPrefix, ocrLetters.slice(-4));
        prefixRatio = Math.max(prefixRatio, 1.0 - (distLast4 / maxLen));
      }

      const isPartialSubstring = ocrLetters.length <= 2 && dbPrefix.includes(ocrLetters);
      if (isPartialSubstring) {
        prefixRatio = Math.max(prefixRatio, 0.7);
        prefixMismatch = false;
      } else {
        prefixMismatch = ocrPrefix !== dbPrefix;
      }
    }

    // RULE 1: Prefix Clash (เฉพาะเมื่อมีอักษร 4 ตัวเต็มแล้วไม่ตรงกันเลย)
    if (ocrLetters.length >= 4 && isOcrPrefixValid && validPrefixes.has(dbPrefix) && prefixMismatch) {
      const pDist = levenshteinDistance(dbPrefix, ocrPrefix);
      const pMax = Math.max(dbPrefix.length, ocrPrefix.length, 1);
      const pRatio = 1.0 - (pDist / pMax);
      if (pRatio < 0.70) continue;
    }

    // RULE 2: Minimum prefix similarity
    if (ocrLetters.length >= 4 && prefixRatio < 0.40) continue;

    const digitCandidates = [ocrDigits];
    if (ocrDigits.length > 7) {
      digitCandidates.push(ocrDigits.slice(-7));
      digitCandidates.push(ocrDigits.slice(0, 7));
    }

    let bestDigitScore = 0.0;
    for (const dCandidate of digitCandidates) {
      if (dCandidate.length >= 3 && dbDigits.includes(dCandidate)) {
        const subScore = 0.75 + (dCandidate.length / Math.max(dbDigits.length, 1)) * 0.24;
        if (subScore > bestDigitScore) bestDigitScore = subScore;
      } else if (dCandidate.length > 0 && dbDigits.length > 0) {
        const dist = levenshteinDistance(dbDigits, dCandidate);
        const maxLen = Math.max(dbDigits.length, dCandidate.length, 1);
        const ratio = 1.0 - (dist / maxLen);
        if (ratio > bestDigitScore) bestDigitScore = ratio;
      }
    }

    let totalScore = 0.0;
    if (ocrLetters.length > 0 && ocrDigits.length > 0) {
      totalScore = (prefixRatio * 0.35) + (bestDigitScore * 0.65);
    } else if (ocrDigits.length > 0) {
      totalScore = bestDigitScore;
    } else {
      totalScore = prefixRatio;
    }

    if (totalScore >= 0.40) {
      candidates.push({ record: dbItem, score: totalScore });
    }
  }

  // เรียงลำดับจากคะแนนมากไปน้อย
  candidates.sort((a, b) => b.score - a.score);

  // หา Sibling Records (กรณีตู้เดียวกันแต่มีหลายงาน/หลายบรรทัด)
  const result = [];
  const seenCnos = new Set();

  for (const cand of candidates) {
    if (!seenCnos.has(cand.record.container_no)) {
      seenCnos.add(cand.record.container_no);
      const siblingRecords = dbList.filter(d => d.container_no === cand.record.container_no);
      const pct = Math.round((cand.score > 1 ? cand.score : cand.score * 100));
      result.push({
        record: cand.record,
        container_no: cand.record.container_no,
        score: cand.score,
        matchRate: pct,
        similarity: pct,
        siblings: siblingRecords
      });
      if (result.length >= limit) break;
    }
  }

  return result;
};

// จัดหมวดหมู่สีตามลอจิก พร้อมระบบคลี่คลายตู้ซ้ำอัจฉริยะจากรอยติ๊ก Dis/Load (Failsafe Null Protected)
export const evaluateMatchStatus = (ocrRow, candidates) => {
  try {
    if (!ocrRow || !ocrRow.container_no) return { color: 'red', candidates: [] };
    
    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) return { color: 'red', candidates: [] };

    const topMatch = candidates[0];
    if (!topMatch || !topMatch.container_no) return { color: 'red', candidates: candidates || [] };

    const ocrClean = String(ocrRow.container_no || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const dbClean = String(topMatch.container_no || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const isDuplicate = Boolean(topMatch.siblings && Array.isArray(topMatch.siblings) && topMatch.siblings.length > 1);

    // ตรวจสอบว่า OCR สแกนรอยติ๊ก DIS หรือ LOAD มาได้หรือไม่
    const ocrJob = ocrRow.job_type ? String(ocrRow.job_type).trim().toLowerCase() : null;

    if (ocrClean === dbClean) {
      if (isDuplicate) {
        if (ocrJob && Array.isArray(topMatch.siblings)) {
          const matchedSib = topMatch.siblings.find(s => 
            s && s.dis_load && String(s.dis_load).toLowerCase().includes(ocrJob)
          );
          if (matchedSib) {
            return { 
              color: 'green', 
              candidates, 
              isDuplicate: true, 
              autoResolvedDuplicate: true, 
              matchedSibling: matchedSib 
            };
          }
        }
        return { color: 'yellow', candidates, isDuplicate: true };
      }
      return { color: 'green', candidates, isDuplicate: false };
    } else if (topMatch.score >= 0.85) {
      if (isDuplicate) {
        if (ocrJob && Array.isArray(topMatch.siblings)) {
          const matchedSib = topMatch.siblings.find(s => 
            s && s.dis_load && String(s.dis_load).toLowerCase().includes(ocrJob)
          );
          if (matchedSib) {
            return { 
              color: 'blue', 
              candidates, 
              isDuplicate: true, 
              autoResolvedDuplicate: true, 
              matchedSibling: matchedSib 
            };
          }
        }
        return { color: 'yellow', candidates, isDuplicate: true };
      }
      return { color: 'blue', candidates, isDuplicate: false };
    } else {
      return { color: 'yellow', candidates, isDuplicate: isDuplicate };
    }
  } catch (err) {
    console.error("evaluateMatchStatus error:", err);
    return { color: 'red', candidates: candidates || [] };
  }
};

// ✂️ ฟังก์ชันตัดคำชื่อไฟล์ให้ได้ชื่อรอบงาน (Clean Batch Name)
export const cleanBatchName = (filename) => {
  if (!filename) return 'General_Batch';
  let name = String(filename).replace(/\.xlsx?$/i, '');
  name = name.replace(/^วางบิล\s*DG\s*/i, '');
  name = name.replace(/^วางบิล\s*/i, '');
  name = name.replace(/\s*TSAW\s*$/i, '');
  name = name.replace(/^LINE_ALBUM_/i, '');
  return name.trim() || 'General_Batch';
};

// 🗳️ โหวตเสียงส่วนใหญ่ (Majority Vote) เพื่อหารอบงานที่แท้จริงของใบงาน
export const determineMajorityBatch = (matchingResults, fallbackBatch = null) => {
  if (!matchingResults || matchingResults.length === 0) {
    return fallbackBatch || 'General_Batch';
  }

  const batchCounts = {};
  
  matchingResults.forEach(res => {
    if (res.selectedRecord) {
      const rawBatch = res.selectedRecord.source_file || res.selectedRecord.batch_name;
      if (rawBatch) {
        const cleaned = cleanBatchName(rawBatch);
        batchCounts[cleaned] = (batchCounts[cleaned] || 0) + 1;
      }
    } else if (res.candidates && res.candidates.length > 0) {
      const topCand = res.candidates[0];
      const rawBatch = topCand.record?.source_file || topCand.record?.batch_name;
      if (rawBatch) {
        const cleaned = cleanBatchName(rawBatch);
        batchCounts[cleaned] = (batchCounts[cleaned] || 0) + 1;
      }
    }
  });

  let majorityBatch = null;
  let maxCount = 0;

  for (const batch in batchCounts) {
    if (batchCounts[batch] > maxCount) {
      maxCount = batchCounts[batch];
      majorityBatch = batch;
    }
  }

  return majorityBatch || fallbackBatch || 'General_Batch';
};

/**
 * 📅 Helper ตรวจสอบว่าวันที่ 2 ค่าตรงกันหรือไม่ (รองรับ ISO YYYY-MM-DD, 5/Apr/2026, 05/04/2026, 5/4/26)
 */
export const isDateMatching = (date1, date2) => {
  if (!date1 || !date2 || date1 === '-' || date2 === '-') return false;
  const d1 = String(date1).trim().toLowerCase();
  const d2 = String(date2).trim().toLowerCase();
  if (d1 === d2) return true;

  // 1. เปรียบเทียบมาตรฐาน ISO YYYY-MM-DD ผ่าน normalizeExcelDate
  const norm1 = normalizeExcelDate(date1);
  const norm2 = normalizeExcelDate(date2);
  if (norm1 && norm2 && norm1 === norm2) return true;

  // 2. ถ้ามีฝั่งใดฝั่งหนึ่งเป็นวันในเดือน (เช่น 5 และ 05/04/2026)
  const day1 = d1.match(/^(\d{1,2})/)?.[1];
  const day2 = d2.match(/^(\d{1,2})/)?.[1];
  if (day1 && day2 && Number(day1) === Number(day2)) {
    return true;
  }
  return false;
};

export const findBestMasterDbMatch = (containerNo, port, truckNo, masterDbList = [], jobType = null, dateJob = null) => {
  if (!containerNo || !masterDbList || masterDbList.length === 0) return null;
  const cleanCno = String(containerNo).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleanCno) return null;
  const cleanPort = String(port || '').trim().toUpperCase();
  const cleanTruck = String(truckNo || '').trim();
  const cleanJob = String(jobType || '').trim().toUpperCase();
  const cleanDate = String(dateJob || '').trim();

  const allMatches = masterDbList.filter(m => {
    const mCno = String(m.container_no || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return mCno === cleanCno;
  });

  if (allMatches.length === 0) return null;

  // 🚚 1. ต้องเป็น "เบอร์รถเดียวกัน" เท่านั้น (Truck-First Strict)
  if (!cleanTruck || cleanTruck === '-') {
    return null; // ไม่มีเบอร์รถ -> แจ้งให้ตรวจสอบ
  }

  const truckMatches = allMatches.filter(m => String(m.truck_no || '').trim() === cleanTruck);
  if (truckMatches.length === 0) {
    return null; // ไม่พบงานของรถคันนี้ใน Master DB -> แจ้งให้ตรวจสอบ
  }

  // ถ้าในกลุ่มรถคันนี้มีเพียง 1 รายการ
  if (truckMatches.length === 1) {
    return truckMatches[0];
  }

  // 🎯 2. กรณีมีมากกว่า 1 งานในรถคันเดียวกัน:
  // ⭐️ ระดับ 1: [เบอร์รถ] + [ประเภทงาน Dis/Load] + [ท่าเรือ] + [วันที่ Date Job / date_job_parsed]
  if (cleanJob && cleanJob !== '-' && cleanPort && cleanPort !== '-' && cleanDate && cleanDate !== '-') {
    const match1 = truckMatches.find(m => {
      const mJob = String(m.dis_load || '').trim().toUpperCase();
      const mPort = String(m.port || '').trim().toUpperCase();
      const jobMatches = (cleanJob.includes('DIS') && mJob.includes('DIS')) || (cleanJob.includes('LOAD') && mJob.includes('LOAD'));
      const portMatches = mPort === cleanPort || mPort.includes(cleanPort) || cleanPort.includes(mPort);
      const dateMatches = isDateMatching(cleanDate, m.date_job_parsed || m.date_job);
      return jobMatches && portMatches && dateMatches;
    });
    if (match1) return match1;
  }

  // ⭐️ ระดับ 2: [เบอร์รถ] + [ประเภทงาน Dis/Load] + [ท่าเรือ]
  if (cleanJob && cleanJob !== '-' && cleanPort && cleanPort !== '-') {
    const match2 = truckMatches.find(m => {
      const mJob = String(m.dis_load || '').trim().toUpperCase();
      const mPort = String(m.port || '').trim().toUpperCase();
      const jobMatches = (cleanJob.includes('DIS') && mJob.includes('DIS')) || (cleanJob.includes('LOAD') && mJob.includes('LOAD'));
      const portMatches = mPort === cleanPort || mPort.includes(cleanPort) || cleanPort.includes(mPort);
      return jobMatches && portMatches;
    });
    if (match2) return match2;
  }

  // ⭐️ ระดับ 3: [เบอร์รถ] + [ประเภทงาน Dis/Load] + [วันที่ Date Job / date_job_parsed]
  if (cleanJob && cleanJob !== '-' && cleanDate && cleanDate !== '-') {
    const match3 = truckMatches.find(m => {
      const mJob = String(m.dis_load || '').trim().toUpperCase();
      const jobMatches = (cleanJob.includes('DIS') && mJob.includes('DIS')) || (cleanJob.includes('LOAD') && mJob.includes('LOAD'));
      const dateMatches = isDateMatching(cleanDate, m.date_job_parsed || m.date_job);
      return jobMatches && dateMatches;
    });
    if (match3) return match3;
  }

  // ⭐️ ระดับ 4: [เบอร์รถ] + [ประเภทงาน Dis/Load]
  if (cleanJob && cleanJob !== '-') {
    const match4 = truckMatches.find(m => {
      const mJob = String(m.dis_load || '').trim().toUpperCase();
      return (cleanJob.includes('DIS') && mJob.includes('DIS')) || (cleanJob.includes('LOAD') && mJob.includes('LOAD'));
    });
    if (match4) return match4;
  }

  // ⭐️ ระดับ 5: [เบอร์รถ] + [ท่าเรือ]
  if (cleanPort && cleanPort !== '-') {
    const match5 = truckMatches.find(m => {
      const mPort = String(m.port || '').trim().toUpperCase();
      return mPort === cleanPort || mPort.includes(cleanPort) || cleanPort.includes(mPort);
    });
    if (match5) return match5;
  }

  // ⭐️ ระดับ 6: [เบอร์รถ] + [วันที่ Date Job / date_job_parsed]
  if (cleanDate && cleanDate !== '-') {
    const match6 = truckMatches.find(m => isDateMatching(cleanDate, m.date_job_parsed || m.date_job));
    if (match6) return match6;
  }

  // ⚠️ ถ้ายังไม่แมตช์ตามลำดับนี้ -> คืนค่า null เพื่อแจ้งให้ผู้ใช้ตรวจสอบ
  return null;
};

// 🔄 ระบบ Auto-Reconciliation: ซิงค์และจับคู่ ref_master_id ของทุกรายการใน job_sheet_items กับ Master DB อัตโนมัติ (1:1 Consumption)
export const autoReconcileUnmatchedRecords = async () => {
  try {
    // 1. ดึง Master DB (container_records) และ job_sheets ทั้งหมด
    const [{ data: masterData, error: masterErr }, { data: sheetsData }] = await Promise.all([
      supabase.from('container_records').select('*'),
      supabase.from('job_sheets').select('*').neq('status', 'deleted')
    ]);

    if (masterErr || !masterData || masterData.length === 0) {
      return { updatedCount: 0 };
    }

    const sheetMap = {};
    (sheetsData || []).forEach(s => { sheetMap[s.id] = s; });

    let updatedCount = 0;
    const affectedSheetIds = new Set();

    // 2. ดึงรายการตู้ทั้งหมดใน job_sheet_items เพื่อ re-link ID ให้ตรงกับ Master DB ใหม่เสมอ
    const { data: allItems } = await supabase
      .from('job_sheet_items')
      .select('*')
      .order('id', { ascending: true });

    if (allItems && allItems.length > 0) {
      // 🎯 ติดตามการจับคู่แบบ 1:1 Consumption (ป้องกันไม่ให้แถวใน Master DB ถูกใช้ซ้ำ)
      const consumedMasterIds = new Set();

      for (const item of allItems) {
        if (!item.container_no) continue;
        const sheet = sheetMap[item.job_sheet_id] || {};
        const truck = sheet.truck_no || item.truck_no;

        // กรองเฉพาะ Master DB ที่ยังไม่ถูกจับคู่ในรอบนี้
        const availableMasterData = masterData.filter(m => !consumedMasterIds.has(Number(m.id)));
        const matched = findBestMasterDbMatch(item.container_no, item.port, truck, availableMasterData, item.job_type, item.date_job);

        if (matched) {
          consumedMasterIds.add(Number(matched.id));
          // ถ้าจับคู่ได้ และ id หรือสถานะมีการเปลี่ยนแปลง -> อัปเดต
          if (item.ref_master_id !== matched.id || item.match_status !== 'matched_green') {
            await supabase
              .from('job_sheet_items')
              .update({
                match_status: 'matched_green',
                port: item.port && item.port !== '-' ? item.port : (matched.port || null),
                size: item.size && item.size !== '-' ? item.size : (matched.size || null),
                job_type: item.job_type && item.job_type !== '-' ? item.job_type : (matched.dis_load || null),
                date_job: item.date_job && item.date_job !== '-' ? item.date_job : (matched.date_job || null),
                ref_master_id: matched.id
              })
              .eq('id', item.id);

            if (item.job_sheet_id) affectedSheetIds.add(item.job_sheet_id);
            updatedCount++;
          }
        } else {
          // ถ้าไม่พบใน Master DB -> มาร์กเป็นตู้แดงและเคลียร์ ref_master_id
          if (item.ref_master_id !== null || item.match_status !== 'manual_red') {
            await supabase
              .from('job_sheet_items')
              .update({
                match_status: 'manual_red',
                ref_master_id: null
              })
              .eq('id', item.id);

            if (item.job_sheet_id) affectedSheetIds.add(item.job_sheet_id);
            updatedCount++;
          }
        }
      }
    }

    // 3. ปรับยอดสรุป matched_count และ unmatched_count ใน job_sheets อัตโนมัติ
    if (affectedSheetIds.size > 0) {
      for (const sId of affectedSheetIds) {
        const { data: sheetItems } = await supabase
          .from('job_sheet_items')
          .select('match_status')
          .eq('job_sheet_id', sId);

        if (sheetItems) {
          const green = sheetItems.filter(i => i.match_status === 'matched_green').length;
          const red = sheetItems.filter(i => i.match_status === 'manual_red').length;
          await supabase
            .from('job_sheets')
            .update({
              matched_count: green,
              unmatched_count: red
            })
            .eq('id', sId);
        }
      }
    }

    // 4. อัปเดต ocr_records (Backward Compatibility)
    const { data: unmatchedOcr } = await supabase
      .from('ocr_records')
      .select('*')
      .eq('match_status', 'manual_red');

    if (unmatchedOcr && unmatchedOcr.length > 0) {
      for (const ocrItem of unmatchedOcr) {
        if (!ocrItem.container_no) continue;
        const matched = findBestMasterDbMatch(ocrItem.container_no, ocrItem.port, ocrItem.truck_no, masterData, ocrItem.job_type, ocrItem.date_job);

        if (matched) {
          await supabase
            .from('ocr_records')
            .update({
              match_status: 'matched_green',
              port: matched.port || ocrItem.port,
              size: matched.size || ocrItem.size,
              date_job: matched.date_job || ocrItem.date_job
            })
            .eq('id', ocrItem.id);
        }
      }
    }

    return { updatedCount };
  } catch (err) {
    console.error('Auto reconcile error:', err);
    return { updatedCount: 0, error: err };
  }
};

/**
 * 📅 แปลงวันที่จาก Excel ทุกรูปแบบ (เช่น 1/Apr/2026, 15/04/2026, Serial Number 46113) ให้เป็นมาตรฐาน ISO YYYY-MM-DD
 */
export const normalizeExcelDate = (val) => {
  if (!val && val !== 0) return '';
  
  // 1. กรณีเป็นตัวเลข Excel Serial Number (เช่น 46113)
  if (typeof val === 'number') {
    if (val > 30000 && val < 60000) {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
  }

  let s = String(val).trim();
  if (!s || s === '-' || s === 'null' || s === 'undefined') return '';

  // 2. ถ้าเป็นมาตรฐาน YYYY-MM-DD อยู่แล้ว
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // 3. รูปแบบ DD/MM/YYYY หรือ D/M/YYYY (รวม พ.ศ. 2569 -> 2026)
  const slashNumMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slashNumMatch) {
    const day = slashNumMatch[1].padStart(2, '0');
    const m = slashNumMatch[2].padStart(2, '0');
    let y = parseInt(slashNumMatch[3], 10);
    if (y < 100) y += 2000;
    else if (y > 2400) y -= 543;
    return `${y}-${m}-${day}`;
  }

  // 4. รูปแบบ D/MMM/YYYY หรือ DD/MMM/YYYY (เช่น 1/Apr/2026, 15-Apr-2026, 15/เม.ย./2569)
  const monthMap = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    'ม.ค.': '01', 'ก.พ.': '02', 'มี.ค.': '03', 'เม.ย.': '04', 'พ.ค.': '05', 'มิ.ย.': '06',
    'ก.ค.': '07', 'ส.ค.': '08', 'ก.ย.': '09', 'ต.ค.': '10', 'พ.ย.': '11', 'ธ.ค.': '12'
  };
  const dMmmMatch = s.match(/^(\d{1,2})[\/\-\s]+([a-zA-Z\u0E00-\u0E7F\.]+)[^\d]+(\d{2,4})$/);
  if (dMmmMatch) {
    const day = dMmmMatch[1].padStart(2, '0');
    const mKey = dMmmMatch[2].toLowerCase().slice(0, 3);
    const m = monthMap[mKey] || monthMap[dMmmMatch[2]];
    let y = parseInt(dMmmMatch[3], 10);
    if (y < 100) y += 2000;
    else if (y > 2400) y -= 543;
    if (m) return `${y}-${m}-${day}`;
  }

  // 5. Fallback ลอง parse ด้วย Date constructor
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    let y = d.getFullYear();
    if (y > 2400) y -= 543;
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return s;
};

/**
 * ฟังก์ชันปรับรายการตู้ให้มีจำนวนคงที่ 25 แถวเสมอ (ตรงตามมาตรฐานใบงานกระดาษ 25 บรรทัด)
 */
export const padTo25Rows = (rows = []) => {
  const fixed = [];
  for (let i = 0; i < 25; i++) {
    if (rows && rows[i]) {
      fixed.push({
        ...rows[i],
        original_seq: i,
        isCancelled: !!rows[i].isCancelled
      });
    } else {
      fixed.push({
        original_seq: i,
        raw_ocr_no: '',
        container_no: '',
        port: '',
        size: '',
        isManuallyEdited: false,
        isConfirmedCustom: false,
        isYellowMatch: false,
        isBlueMatch: false,
        isConfirmedMatch: false,
        isCancelled: false
      });
    }
  }
  return fixed;
};


