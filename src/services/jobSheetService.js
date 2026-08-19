import { supabase } from '../supabaseClient';
import { getAllPendingFromDB } from '../utils/pendingDb';
import { findTopContainerMatches, evaluateMatchStatus, cleanBatchName } from '../utils/matchingLogic';

/**
 * 📅 Helper ตรวจสอบว่าวันที่ 2 ค่าตรงกันหรือไม่ (รองรับหลายรูปแบบ เช่น 5/Apr/2026, 05/04/2026, 5/4/26)
 */
const isDateMatching = (date1, date2) => {
  if (!date1 || !date2 || date1 === '-' || date2 === '-') return false;
  const d1 = String(date1).trim().toLowerCase();
  const d2 = String(date2).trim().toLowerCase();
  if (d1 === d2) return true;

  const day1 = d1.match(/^(\d{1,2})/)?.[1];
  const day2 = d2.match(/^(\d{1,2})/)?.[1];
  if (day1 && day2 && Number(day1) === Number(day2)) {
    return true;
  }
  return false;
};

/**
 * 🎯 ค้นหาแถวใน Master DB ที่ตรงกับเลขตู้ ท่าเรือ เบอร์รถ ประเภทงาน และวันที่ได้แม่นยำที่สุด
 * (แก้ปัญหาตู้ซ้ำ Dis/Load หรือตู้ที่วิ่งหลายรอบ/หลายวันในไฟล์ใบวางบิลเดียวกัน)
 */
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
  // ⭐️ ระดับ 1: [เบอร์รถ] + [ประเภทงาน Dis/Load] + [ท่าเรือ] + [วันที่ Date Job]
  if (cleanJob && cleanJob !== '-' && cleanPort && cleanPort !== '-' && cleanDate && cleanDate !== '-') {
    const match1 = truckMatches.find(m => {
      const mJob = String(m.dis_load || '').trim().toUpperCase();
      const mPort = String(m.port || '').trim().toUpperCase();
      const jobMatches = (cleanJob.includes('DIS') && mJob.includes('DIS')) || (cleanJob.includes('LOAD') && mJob.includes('LOAD'));
      const portMatches = mPort === cleanPort || mPort.includes(cleanPort) || cleanPort.includes(mPort);
      const dateMatches = isDateMatching(cleanDate, m.date_job);
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

  // ⭐️ ระดับ 3: [เบอร์รถ] + [ประเภทงาน Dis/Load] + [วันที่ Date Job]
  if (cleanJob && cleanJob !== '-' && cleanDate && cleanDate !== '-') {
    const match3 = truckMatches.find(m => {
      const mJob = String(m.dis_load || '').trim().toUpperCase();
      const jobMatches = (cleanJob.includes('DIS') && mJob.includes('DIS')) || (cleanJob.includes('LOAD') && mJob.includes('LOAD'));
      const dateMatches = isDateMatching(cleanDate, m.date_job);
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

  // ⭐️ ระดับ 6: [เบอร์รถ] + [วันที่ Date Job]
  if (cleanDate && cleanDate !== '-') {
    const match6 = truckMatches.find(m => isDateMatching(cleanDate, m.date_job));
    if (match6) return match6;
  }

  // ⚠️ ถ้ายังไม่แมตช์ตามลำดับนี้ -> คืนค่า null เพื่อแจ้งให้ผู้ใช้ตรวจสอบ
  return null;
};

/**
 * 📄 JobSheet Service
 * บริการจัดการข้อมูลใบงานทั้งระบบ (Pending Queue, OCR Cache, Completed Job Sheets, Detail Items)
 */
export const jobSheetService = {
  /**
   * ดึงรายการใบงานที่รอดำเนินการ (Pending) จาก Supabase
   */
  async fetchPendingJobSheets() {
    try {
      const { data, error } = await supabase
        .from('ocr_cache')
        .select('*')
        .neq('model_used', 'deleted')
        .neq('model_used', 'completed')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error('jobSheetService.fetchPendingJobSheets error:', error);
      return { data: [], error };
    }
  },

  /**
   * ดึงผลสแกน OCR จาก Cache ตามรายการ File Hash
   */
  async fetchOcrCacheByHashes(hashes) {
    if (!hashes || hashes.length === 0) return { data: [], error: null };
    try {
      const { data, error } = await supabase
        .from('ocr_cache')
        .select('*')
        .in('id', hashes);

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error('jobSheetService.fetchOcrCacheByHashes error:', error);
      return { data: [], error };
    }
  },

  /**
   * บันทึกหรืออัปเดตผลสแกน OCR Cache
   */
  async upsertOcrCache(cacheData) {
    try {
      const { data, error } = await supabase
        .from('ocr_cache')
        .upsert(cacheData);

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('jobSheetService.upsertOcrCache error:', error);
      return { data: null, error };
    }
  },

  /**
   * ลบใบงานออกจากคิว Pending (Golden Rule #1: RLS Soft-Deletion)
   */
  async softDeletePendingJobSheet(fileHash) {
    if (!fileHash) return { success: false, error: 'No fileHash provided' };
    try {
      const { error } = await supabase
        .from('ocr_cache')
        .update({ ocr_data: null, model_used: 'deleted' })
        .eq('id', fileHash);

      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      console.error('jobSheetService.softDeletePendingJobSheet error:', error);
      return { success: false, error };
    }
  },

  /**
   * ล้างคิวใบงาน Pending ทั้งหมด (Golden Rule #1: RLS Soft-Deletion)
   */
  async clearAllPendingJobSheets(fileHashes = []) {
    try {
      if (fileHashes.length > 0) {
        const { error } = await supabase
          .from('ocr_cache')
          .update({ ocr_data: null, model_used: 'deleted' })
          .in('id', fileHashes);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ocr_cache')
          .update({ ocr_data: null, model_used: 'deleted' })
          .eq('model_used', 'pending');
        if (error) throw error;
      }
      return { success: true, error: null };
    } catch (error) {
      console.error('jobSheetService.clearAllPendingJobSheets error:', error);
      return { success: false, error };
    }
  },

  /**
   * บันทึกจบงาน (Complete Job Sheet):
   * 1. บันทึกหัวใบงานลงตาราง `job_sheets` (Header)
   * 2. บันทึกรายการตู้ลงตาราง `job_sheet_items` (Detail)
   * 3. บันทึกลง `ocr_records` (Backward Compatibility)
   * 4. อัปเดตสถานะ `ocr_cache` เป็น 'completed' และล้าง Base64 ชั่วคราว
   */
  async completeJobSheet({
    sheetId,
    fileHash,
    batchName,
    truckNo,
    imageUrl,
    imageName,
    driveFileId,
    matchingResults = [],
    ocrResult = null,
    isCompletedEdit = false
  }) {
    try {
      const targetSheetId = sheetId || fileHash || `JS_${Date.now()}_${truckNo}`;

      // ถ้าเป็นการแก้ไขใบงานเดิม -> ลบข้อมูลเดิมของใบงานนี้ออกก่อน
      if (isCompletedEdit) {
        try {
          await supabase.from('job_sheets').delete().eq('id', targetSheetId);
          await supabase.from('job_sheet_items').delete().eq('job_sheet_id', targetSheetId);
          if (imageUrl) {
            await supabase.from('ocr_records').delete().eq('image_url', imageUrl);
          } else {
            await supabase.from('ocr_records').delete().match({ batch_name: batchName, truck_no: truckNo });
          }
        } catch (delErr) {
          console.warn('Old records deletion warning:', delErr);
        }
      }

      // กรองเฉพาะแถวตู้ที่มีข้อมูลจริง
      const validItems = matchingResults.filter(
        res => !res.isEmpty && !res.isCancelled && (res.container_no || res.port || res.size)
      );

      let greenCount = 0;
      let redCount = 0;

      const itemsToInsert = validItems.map((res, index) => {
        const isMatched = res.matchColor === 'green' || res.matchColor === 'blue';
        const isRed = !isMatched;
        if (isRed) redCount++;
        else greenCount++;

        let finalContainerNo = res.container_no;
        let refId = null;

        if (isMatched && res.selectedDbId) {
          refId = res.selectedDbId;
          const targetCand = res.candidates?.find(c => c.siblings?.some(s => s.id === res.selectedDbId));
          if (targetCand) {
            finalContainerNo = targetCand.container_no;
          }
        }

        const matchStatus = isMatched ? 'matched_green' : 'manual_red';

        return {
          job_sheet_id: targetSheetId,
          line_no: res.displayIndex || (index + 1),
          container_no: finalContainerNo,
          raw_ocr_text: res.originalText || null,
          port: res.port || null,
          size: res.size || null,
          job_type: res.jobType || res.job_type || null,
          date_job: res.date_job || null,
          match_status: matchStatus,
          ref_master_id: refId,
          created_at: new Date().toISOString()
        };
      });

      // 1. บันทึกหัวใบงานลง `job_sheets`
      const sheetHeader = {
        id: targetSheetId,
        batch_name: batchName,
        truck_no: String(truckNo || '').trim(),
        image_url: imageUrl || null,
        image_name: imageName || null,
        drive_file_id: driveFileId || null,
        total_containers: validItems.length,
        matched_count: greenCount,
        unmatched_count: redCount,
        status: 'completed',
        created_at: new Date().toISOString()
      };

      const { error: sheetErr } = await supabase
        .from('job_sheets')
        .upsert(sheetHeader, { onConflict: 'id' });

      if (sheetErr) {
        console.warn('job_sheets upsert warning (falling back to detail/records):', sheetErr);
      }

      // 2. บันทึกรายการตู้ลง `job_sheet_items`
      if (itemsToInsert.length > 0) {
        const { error: itemsErr } = await supabase
          .from('job_sheet_items')
          .insert(itemsToInsert);

        if (itemsErr) {
          console.warn('job_sheet_items insert warning:', itemsErr);
        }
      }

      // 3. บันทึกแบบเดิมลง `ocr_records` (Backward Compatibility 100%)
      const legacyRecords = itemsToInsert.map(item => ({
        batch_name: batchName,
        truck_no: truckNo,
        image_url: imageUrl,
        container_no: item.container_no,
        port: item.port,
        size: item.size,
        date_job: item.date_job,
        match_status: item.match_status,
        ref_db_id: item.ref_master_id,
        created_at: item.created_at
      }));

      if (legacyRecords.length > 0) {
        await supabase.from('ocr_records').insert(legacyRecords);
      }

      // 4. ปรับสถานะ `ocr_cache` เป็น 'completed' และล้าง Base64 ชั่วคราว
      const cacheId = fileHash || targetSheetId;
      if (cacheId) {
        await supabase
          .from('ocr_cache')
          .update({
            model_used: 'completed',
            image_url: imageUrl,
            ocr_data: {
              ...(ocrResult || {}),
              is_pending: false,
              saved_at: new Date().toISOString()
            }
          })
          .eq('id', cacheId);
      }

      return { success: true, sheetId: targetSheetId, error: null };
    } catch (error) {
      console.error('jobSheetService.completeJobSheet error:', error);
      return { success: false, error };
    }
  },

  /**
   * ดึงรายการใบงานที่บันทึกแล้วทั้งหมด (High-Speed Parallelized Fetching)
   */
  async fetchCompletedJobSheets(existingMasterDb = null) {
    try {
      // 0. ดึง Master DB, job_sheets และ job_sheet_items แบบ Parallel ทันที
      const masterPromise = existingMasterDb
        ? Promise.resolve({ data: existingMasterDb })
        : supabase
            .from('container_records')
            .select('id, container_no, truck_no, port, size, dis_load, date_job, batch_name, source_file');

      const sheetsPromise = supabase
        .from('job_sheets')
        .select('*')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      const itemsPromise = supabase
        .from('job_sheet_items')
        .select('id, job_sheet_id, line_no, container_no, raw_ocr_text, port, size, job_type, date_job, match_status')
        .order('created_at', { ascending: false });

      const [masterRes, sheetsRes, itemsRes] = await Promise.all([
        masterPromise,
        sheetsPromise,
        itemsPromise
      ]);

      const masterDbList = masterRes?.data || [];
      const sheetsData = sheetsRes?.data || [];
      const itemsData = itemsRes?.data || [];

      if (sheetsData && sheetsData.length > 0) {
        const itemsMap = {};
        itemsData.forEach(item => {
          if (!itemsMap[item.job_sheet_id]) itemsMap[item.job_sheet_id] = [];
          const sheet = sheetsData.find(s => s.id === item.job_sheet_id) || {};
          const matchedDb = findBestMasterDbMatch(item.container_no, item.port, sheet.truck_no, masterDbList);
          const finalDateJob = (item.date_job && item.date_job !== '-' && item.date_job !== 'null') 
            ? item.date_job 
            : (matchedDb?.date_job || '-');

          itemsMap[item.job_sheet_id].push({
            id: item.id,
            line_no: item.line_no,
            container_no: item.container_no,
            raw_ocr_text: item.raw_ocr_text,
            port: (item.port && item.port !== '-') ? item.port : (matchedDb?.port || '-'),
            size: (item.size && item.size !== '-') ? item.size : (matchedDb?.size || '-'),
            job_type: item.job_type,
            date_job: finalDateJob,
            match_status: item.match_status,
            is_red: item.match_status === 'manual_red'
          });
        });

        const formattedSheets = sheetsData.map(sheet => ({
          id: sheet.id,
          batch_name: sheet.batch_name || 'General_Batch',
          truck_no: sheet.truck_no || '-',
          image_name: sheet.image_name || '-',
          image_url: sheet.image_url || null,
          drive_file_id: sheet.drive_file_id || null,
          saved_at: sheet.created_at,
          green: sheet.matched_count || 0,
          red: sheet.unmatched_count || 0,
          total_containers: sheet.total_containers || 0,
          containers: itemsMap[sheet.id] || []
        }));

        return { data: formattedSheets, error: null };
      }

      // 2. Fallback: ถ้าตารางใหม่ยังไม่มีข้อมูล ให้ดึงจาก `ocr_records` + `ocr_cache` เดิม
      const [recordsRes, cacheRes] = await Promise.all([
        supabase
          .from('ocr_records')
          .select('*')
          .neq('match_status', 'deleted')
          .order('created_at', { ascending: false }),
        supabase
          .from('ocr_cache')
          .select('id, image_name, ocr_data')
      ]);

      if (recordsRes.error) throw recordsRes.error;

      const nameMap = {};
      (cacheRes.data || []).forEach(c => {
        if (c.image_name) nameMap[c.id] = c.image_name;
        if (c.ocr_data) {
          if (c.ocr_data.image_url) nameMap[c.ocr_data.image_url] = c.image_name;
          if (c.ocr_data.drive_file_id) nameMap[c.ocr_data.drive_file_id] = c.image_name;
          if (c.ocr_data.webViewLink) nameMap[c.ocr_data.webViewLink] = c.image_name;
        }
      });

      const grouped = {};
      (recordsRes.data || []).forEach(rec => {
        const timeWindow = String(rec.created_at || '').slice(0, 16);
        const sheetKey = rec.image_url || `${rec.batch_name || 'General'}_${rec.truck_no || 'None'}_${timeWindow}`;

        if (!grouped[sheetKey]) {
          let imgName = rec.image_name || nameMap[rec.image_url] || null;
          if (!imgName && rec.image_url) {
            const match = rec.image_url.match(/\/d\/([a-zA-Z0-9_-]+)/) || rec.image_url.match(/id=([a-zA-Z0-9_-]+)/);
            if (match && match[1] && nameMap[match[1]]) imgName = nameMap[match[1]];
          }
          if (!imgName && rec.image_url) {
            const rawName = rec.image_url.split('/').pop().split('?')[0];
            if (rawName && !rawName.includes('thumbnail') && !rawName.includes('google')) imgName = rawName;
          }

          grouped[sheetKey] = {
            id: sheetKey,
            batch_name: rec.batch_name || 'General_Batch',
            truck_no: rec.truck_no || '-',
            image_name: imgName || '-',
            image_url: rec.image_url || null,
            saved_at: rec.created_at,
            containers: [],
            green: 0,
            red: 0
          };
        }

        const isRed = rec.match_status === 'manual_red';
        if (isRed) grouped[sheetKey].red++;
        else grouped[sheetKey].green++;

        const matchedDb = findBestMasterDbMatch(rec.container_no, rec.port, rec.truck_no, masterDbList);
        const finalDateJob = (rec.date_job && rec.date_job !== '-' && rec.date_job !== 'null') 
          ? rec.date_job 
          : (matchedDb?.date_job || '-');

        grouped[sheetKey].containers.push({
          id: rec.id,
          container_no: rec.container_no,
          port: (rec.port && rec.port !== '-') ? rec.port : (matchedDb?.port || '-'),
          size: (rec.size && rec.size !== '-') ? rec.size : (matchedDb?.size || '-'),
          date_job: finalDateJob,
          match_status: rec.match_status,
          is_red: isRed
        });
      });

      const list = Object.values(grouped);
      list.sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));
      return { data: list, error: null };
    } catch (error) {
      console.error('jobSheetService.fetchCompletedJobSheets error:', error);
      return { data: [], error };
    }
  },

  /**
   * แก้ไขเฉพาะตู้ค้าง (ตู้แดง) ในหน้า Completed
   */
  async updateCompletedContainers(updates = [], sheetId = null) {
    try {
      for (const item of updates) {
        const { id, isRed, ...updateFields } = item;
        
        // อัปเดตใน job_sheet_items
        await supabase
          .from('job_sheet_items')
          .update(updateFields)
          .eq('id', id);

        // อัปเดตใน ocr_records (legacy)
        await supabase
          .from('ocr_records')
          .update(updateFields)
          .eq('id', id);
      }

      // ถ้ามี sheetId ให้อัปเดตยอดตู้เขียว/ตู้แดงในตาราง job_sheets ด้วย
      if (sheetId) {
        const { data: currentItems } = await supabase
          .from('job_sheet_items')
          .select('match_status')
          .eq('job_sheet_id', sheetId);

        if (currentItems) {
          const redCount = currentItems.filter(i => i.match_status === 'manual_red').length;
          const greenCount = currentItems.length - redCount;
          await supabase
            .from('job_sheets')
            .update({
              matched_count: greenCount,
              unmatched_count: redCount
            })
            .eq('id', sheetId);
        }
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('jobSheetService.updateCompletedContainers error:', error);
      return { success: false, error };
    }
  },

  /**
   * ลบใบงานที่บันทึกแล้วออกจากหน้า Completed
   */
  async deleteCompletedJobSheet(sheet) {
    try {
      if (sheet.id) {
        await supabase.from('job_sheets').update({ status: 'deleted' }).eq('id', sheet.id);
        await supabase.from('job_sheet_items').delete().eq('job_sheet_id', sheet.id);
      }
      if (sheet.image_url) {
        await supabase.from('ocr_records').delete().eq('image_url', sheet.image_url);
      } else if (sheet.batch_name && sheet.truck_no) {
        await supabase.from('ocr_records').delete().match({ batch_name: sheet.batch_name, truck_no: sheet.truck_no });
      }
      return { success: true, error: null };
    } catch (error) {
      console.error('jobSheetService.deleteCompletedJobSheet error:', error);
      return { success: false, error };
    }
  },

  /**
   * 📊 ดึงประวัติเลขตู้ทั้งหมดที่ได้จากการทำ OCR จากใบงาน (ทั้ง Completed และ Pending)
   * สำหรับหน้า '📊 OCR Container History'
   */
  /**
   * 📊 ดึงประวัติเลขตู้ทั้งหมดที่ได้จากการทำ OCR จากใบงาน (ทั้ง Completed และ Pending)
   * รองรับ High-Speed Parallel Fetching และไม่ดึง Base64 รูปภาพหนัก
   */
  async fetchAllOcrContainersHistory(existingMasterDb = null) {
    try {
      const allContainers = [];

      // ⚡ 1. ดึงข้อมูลทั้งหมดแบบ Parallel 100% (High-Speed Optimization)
      const masterPromise = existingMasterDb
        ? Promise.resolve({ data: existingMasterDb })
        : supabase
            .from('container_records')
            .select('id, container_no, truck_no, port, size, dis_load, date_job, batch_name, source_file');

      const sheetsPromise = supabase
        .from('job_sheets')
        .select('id, batch_name, truck_no, image_name, image_url, drive_file_id, created_at, status')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      const itemsPromise = supabase
        .from('job_sheet_items')
        .select('id, job_sheet_id, line_no, container_no, raw_ocr_text, port, size, job_type, date_job, match_status, ref_master_id, created_at')
        .order('created_at', { ascending: false });

      // ดึงเฉพาะ metadata จาก ocr_cache ไม่ดึง Base64 image_data เพื่อความเร็วสูงสุด
      const cachePromise = supabase
        .from('ocr_cache')
        .select('id, image_name, ocr_data, model_used, created_at')
        .neq('model_used', 'deleted')
        .neq('model_used', 'completed')
        .order('created_at', { ascending: false });

      const [masterRes, sheetsRes, itemsRes, cacheRes] = await Promise.all([
        masterPromise,
        sheetsPromise,
        itemsPromise,
        cachePromise
      ]);

      const masterDbList = masterRes?.data || [];
      const sheetsData = sheetsRes?.data || [];
      const itemsData = itemsRes?.data || [];
      const pendingCaches = cacheRes?.data || [];

      // สร้าง Map สำหรับค้นหา Master Container แบบ O(1)
      const masterDbMap = new Map();
      masterDbList.forEach(m => {
        if (m.container_no) {
          const cleanKey = String(m.container_no).toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (cleanKey && !masterDbMap.has(cleanKey)) {
            masterDbMap.set(cleanKey, m);
          }
        }
      });

      // 2. ประมวลผลรายการตู้ที่เสร็จสมบูรณ์แล้ว (Completed)
      if (sheetsData && sheetsData.length > 0) {
        const sheetMap = {};
        sheetsData.forEach(s => { sheetMap[s.id] = s; });

        if (itemsData && itemsData.length > 0) {
          itemsData.forEach(item => {
            const sheet = sheetMap[item.job_sheet_id] || {};
            const matchedDb = findBestMasterDbMatch(item.container_no, item.port, sheet.truck_no, masterDbList);

            const finalJobType = (item.job_type && item.job_type !== '-') ? item.job_type : (matchedDb?.dis_load || '-');
            const finalSize = (item.size && item.size !== '-') ? item.size : (matchedDb?.size || '-');
            const finalPort = (item.port && item.port !== '-') ? item.port : (matchedDb?.port || '-');
            const finalDateJob = (item.date_job && item.date_job !== '-') ? item.date_job : (matchedDb?.date_job || '-');
            const dbBatch = matchedDb?.source_file || matchedDb?.batch_name;
            const finalBatch = cleanBatchName(sheet.batch_name || dbBatch || 'General_Batch');

            const finalMatchStatus = item.match_status || (matchedDb ? 'matched_green' : 'manual_red');

            allContainers.push({
              id: `completed_item_${item.id}`,
              db_id: item.id,
              sheet_id: item.job_sheet_id,
              container_no: item.container_no,
              raw_ocr_text: item.raw_ocr_text || item.container_no,
              line_no: item.line_no || '-',
              port: finalPort,
              size: finalSize,
              job_type: finalJobType,
              date_job: finalDateJob,
              match_status: finalMatchStatus,
              workflow_status: 'completed',
              batch_name: finalBatch,
              truck_no: sheet.truck_no || '-',
              image_url: sheet.image_url || null,
              image_name: sheet.image_name || '-',
              drive_file_id: sheet.drive_file_id || null,
              created_at: item.created_at || sheet.created_at
            });
          });
        }
      }

      // ถ้ายังไม่มีใน job_sheet_items ให้ดึงจาก ocr_records (Fallback)
      if (allContainers.length === 0) {
        const { data: legacyRecords } = await supabase
          .from('ocr_records')
          .select('*')
          .neq('match_status', 'deleted')
          .order('created_at', { ascending: false });

        if (legacyRecords && legacyRecords.length > 0) {
          legacyRecords.forEach(rec => {
            const matchedDb = findBestMasterDbMatch(rec.container_no, rec.port, rec.truck_no, masterDbList);

            const finalJobType = (rec.job_type && rec.job_type !== '-') ? rec.job_type : (matchedDb?.dis_load || '-');
            const finalSize = (rec.size && rec.size !== '-') ? rec.size : (matchedDb?.size || '-');
            const finalPort = (rec.port && rec.port !== '-') ? rec.port : (matchedDb?.port || '-');
            const finalDateJob = (rec.date_job && rec.date_job !== '-') ? rec.date_job : (matchedDb?.date_job || '-');
            const dbBatch = matchedDb?.source_file || matchedDb?.batch_name;
            const finalBatch = cleanBatchName(rec.batch_name || dbBatch || 'General_Batch');

            const isMatched = rec.match_status !== 'manual_red' && matchedDb !== null;
            const finalMatchStatus = isMatched ? 'matched_green' : 'manual_red';

            allContainers.push({
              id: `legacy_${rec.id}`,
              db_id: rec.id,
              sheet_id: rec.image_url,
              container_no: rec.container_no,
              raw_ocr_text: rec.container_no,
              line_no: '-',
              port: finalPort,
              size: finalSize,
              job_type: finalJobType,
              date_job: finalDateJob,
              match_status: finalMatchStatus,
              workflow_status: 'completed',
              batch_name: finalBatch,
              truck_no: rec.truck_no || '-',
              image_url: rec.image_url || null,
              image_name: '-',
              drive_file_id: null,
              created_at: rec.created_at
            });
          });
        }
      }

      // 3. ดึงรายการตู้ที่อยู่ในคิวรอตรวจ (Pending) จาก ocr_cache (ที่โหลดมาใน Parallel แล้ว)
      if (pendingCaches && pendingCaches.length > 0) {
        pendingCaches.forEach(cache => {
          const ocrData = cache.ocr_data || {};
          const truckGuess = ocrData.truck_no || ocrData.truck_guess || '-';
          const imgUrl = ocrData.image_url || null;
          const imgName = cache.image_name || ocrData.relative_path || 'Pending_Image.jpg';
          const driveId = ocrData.drive_file_id || null;

          // ดึงรายการตู้จาก ocrData.rows หรือ localStorage draft หรือ draft_items หรือ results
          let rows = ocrData.rows || ocrData.draft_items || ocrData.containers || ocrData.matching_results || ocrData.results || [];
          
          if (typeof window !== 'undefined') {
            try {
              const draftKeys = [
                `draft_${cache.id}`,
                `draft_${ocrData.file_hash}`,
                `draft_${ocrData.drive_file_id}`,
                `draft_${ocrData.id}`
              ];
              for (const k of draftKeys) {
                const localDraft = localStorage.getItem(k);
                if (localDraft) {
                  const parsed = JSON.parse(localDraft);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    rows = parsed;
                    break;
                  }
                }
              }
            } catch (e) {
              console.warn("Could not read local draft for", cache.id);
            }
          }

          if (Array.isArray(rows) && rows.length > 0) {
            // 🗳️ โหวตหารอบงานที่แท้จริงจากตู้ในใบงานที่ตรงกับ Master DB
            const batchCounts = {};
            rows.forEach(r => {
              const cKey = String(r.container_no || r.clean_container_no || r.originalText || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
              const mDb = masterDbMap.get(cKey);
              if (mDb?.source_file || mDb?.batch_name) {
                const cb = cleanBatchName(mDb.source_file || mDb.batch_name);
                batchCounts[cb] = (batchCounts[cb] || 0) + 1;
              }
            });

            let detectedBatch = null;
            let maxCount = 0;
            for (const b in batchCounts) {
              if (batchCounts[b] > maxCount) {
                maxCount = batchCounts[b];
                detectedBatch = b;
              }
            }

            const finalSheetBatch = detectedBatch || cleanBatchName(ocrData.batch_guess || ocrData.folder_name || 'Pending_Batch');

            rows.forEach((row, idx) => {
              const containerNo = String(
                row.container_no || 
                row.clean_container_no || 
                row.originalText || 
                row.raw_text || 
                row.text || 
                ''
              ).trim();

              if (row && !row.isEmpty && !row.isCancelled && containerNo !== '') {
                let matchStatus = 'matched_green';
                const rawOcr = row.raw_ocr_no || row.originalText || row.raw_text || containerNo;
                let finalContainerNo = containerNo;

                // ตรวจสอบว่าตรงกับ Master DB หรือไม่
                const cleanKey = String(containerNo).toUpperCase().replace(/[^A-Z0-9]/g, '');
                const directMatchedDb = masterDbMap.get(cleanKey);
                const isExactMatched = Boolean(directMatchedDb);

                if (row.isManuallyEdited || row.isConfirmedCustom) {
                  // ถ้าผู้ใช้เคยแก้ไขหรือยืนยันด้วยตนเองแล้ว ให้ยึดค่าที่ผู้ใช้แก้ไขเสมอ ไม่ย้อนกลับ!
                  finalContainerNo = containerNo;
                  matchStatus = isExactMatched ? 'matched_green' : 'manual_red';
                } else if (row.isConfirmedMatch) {
                  matchStatus = 'matched_green';
                  finalContainerNo = containerNo;
                } else if (masterDbList.length > 0) {
                  const targetTruck = String(truckGuess || '').trim();
                  let truckDb = masterDbList;
                  if (targetTruck && targetTruck !== '-') {
                    const f = masterDbList.filter(d => String(d.truck_no || '').trim() === targetTruck);
                    if (f.length > 0) truckDb = f;
                  }
                  const candidates = findTopContainerMatches(rawOcr, truckDb, 3);
                  const evaluated = evaluateMatchStatus({ ...row, container_no: rawOcr }, candidates);
                  
                  if (evaluated.color === 'green') {
                    matchStatus = evaluated.autoResolvedDuplicate ? 'duplicate_auto' : 'matched_green';
                    finalContainerNo = evaluated.candidates[0].container_no;
                  } else if (evaluated.color === 'blue') {
                    matchStatus = evaluated.autoResolvedDuplicate ? 'duplicate_auto' : 'matched_green';
                    finalContainerNo = evaluated.candidates[0].container_no;
                  } else {
                    // ⚠️ แถวสีเหลือง (Yellow / Low similarity candidate) ที่ยังไม่ได้กดยืนยัน -> ต้องเป็นเลข OCR ดิบ และสถานะยังไม่ผ่าน (manual_red)
                    matchStatus = 'manual_red';
                    finalContainerNo = rawOcr;
                  }
                } else if (row.matchColor === 'red' || row.isYellowMatch) {
                  matchStatus = 'manual_red';
                  finalContainerNo = rawOcr;
                } else if (row.isDuplicateAuto || row.match_status === 'duplicate_auto') {
                  matchStatus = 'duplicate_auto';
                  finalContainerNo = containerNo;
                }

                const finalMatchedDb = findBestMasterDbMatch(finalContainerNo, row.port, truckGuess, masterDbList);

                const finalJobType = row.jobType || row.job_type || row.dis_load || row.disLoad || row.type || (finalMatchedDb?.dis_load) || '-';
                const finalSize = (row.size && row.size !== '-') ? row.size : (finalMatchedDb?.size || '-');
                const finalPort = (row.port && row.port !== '-') ? row.port : (finalMatchedDb?.port || '-');
                const finalDateJob = row.date_job || finalMatchedDb?.date_job || '-';
                const dbBatch = finalMatchedDb?.source_file || finalMatchedDb?.batch_name;
                const finalRowBatch = dbBatch ? cleanBatchName(dbBatch) : finalSheetBatch;

                allContainers.push({
                  id: `pending_${cache.id}_${idx}`,
                  db_id: null,
                  sheet_id: cache.id,
                  container_no: finalContainerNo,
                  raw_ocr_text: row.originalText || row.raw_text || rawOcr,
                  line_no: row.displayIndex || row.line_no || (idx + 1),
                  port: finalPort,
                  size: finalSize,
                  job_type: finalJobType,
                  date_job: finalDateJob,
                  match_status: matchStatus,
                  workflow_status: 'pending',
                  batch_name: finalRowBatch,
                  truck_no: truckGuess,
                  image_url: imgUrl,
                  image_name: imgName,
                  drive_file_id: driveId,
                  created_at: ocrData.created_at || cache.created_at || new Date().toISOString()
                });
              }
            });
          }
        });
      }

      // 3. ดึงจาก IndexedDB เพิ่มเติม (กรณีมีไฟล์ในเครื่องที่ยังไม่ได้ซิงค์ขึ้น Cloud)
      if (typeof window !== 'undefined') {
        try {
          const localPending = await getAllPendingFromDB();
          if (localPending && localPending.length > 0) {
            localPending.forEach(item => {
              const alreadyProcessed = allContainers.some(c => c.sheet_id === item.file_hash || c.sheet_id === item.id);
              if (!alreadyProcessed) {
                const draftKeys = [`draft_${item.file_hash}`, `draft_${item.id}`];
                for (const k of draftKeys) {
                  const localDraft = localStorage.getItem(k);
                  if (localDraft) {
                    try {
                      const parsed = JSON.parse(localDraft);
                      if (Array.isArray(parsed)) {
                        const batchCounts = {};
                        parsed.forEach(r => {
                          const cKey = String(r.container_no || r.clean_container_no || r.originalText || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                          const mDb = masterDbMap.get(cKey);
                          if (mDb?.source_file || mDb?.batch_name) {
                            const cb = cleanBatchName(mDb.source_file || mDb.batch_name);
                            batchCounts[cb] = (batchCounts[cb] || 0) + 1;
                          }
                        });
                        let detectedBatch = null;
                        let maxCount = 0;
                        for (const b in batchCounts) {
                          if (batchCounts[b] > maxCount) {
                            maxCount = batchCounts[b];
                            detectedBatch = b;
                          }
                        }
                        const finalSheetBatch = detectedBatch || cleanBatchName(item.batchGuess || 'Pending_Batch');

                        parsed.forEach((row, idx) => {
                          const containerNo = String(row.container_no || row.clean_container_no || row.originalText || '').trim();
                          if (row && !row.isEmpty && !row.isCancelled && containerNo !== '') {
                            const isRed = row.matchColor === 'red' || row.match_status === 'manual_red';
                            const cleanKey = String(containerNo).toUpperCase().replace(/[^A-Z0-9]/g, '');
                            const matchedDb = masterDbMap.get(cleanKey);
                            const dbBatch = matchedDb?.source_file || matchedDb?.batch_name;
                            const finalRowBatch = dbBatch ? cleanBatchName(dbBatch) : finalSheetBatch;

                            allContainers.push({
                              id: `local_pending_${item.file_hash}_${idx}`,
                              db_id: null,
                              sheet_id: item.file_hash,
                              container_no: containerNo,
                              raw_ocr_text: row.originalText || containerNo,
                              line_no: row.displayIndex || (idx + 1),
                              port: (row.port && row.port !== '-') ? row.port : (matchedDb?.port || '-'),
                              size: (row.size && row.size !== '-') ? row.size : (matchedDb?.size || '-'),
                              job_type: row.jobType || row.job_type || row.dis_load || (matchedDb?.dis_load) || '-',
                              match_status: isRed ? 'manual_red' : 'matched_green',
                              workflow_status: 'pending',
                              batch_name: finalRowBatch,
                              truck_no: item.truckGuess || '-',
                              image_url: item.url,
                              image_name: item.name || 'Pending_Image.jpg',
                              drive_file_id: null,
                              created_at: item.created_at || new Date().toISOString()
                            });
                          }
                        });
                      }
                    } catch (e) {}
                  }
                }
              }
            });
          }
        } catch (e) {
          console.warn("IndexedDB check in history warning:", e);
        }
      }

      // เรียงลำดับตามวันที่สร้างล่าสุด
      allContainers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      return { data: allContainers, error: null };
    } catch (error) {
      console.error('jobSheetService.fetchAllOcrContainersHistory error:', error);
      return { data: [], error };
    }
  },

  /**
   * ✏️ อัปเดตข้อมูลตู้เดี่ยวในหน้า 'OCR Container History'
   * บันทึกการแก้ไข (เลขตู้, ประเภทงาน, ท่าเรือ, ขนาด, เบอร์รถ) อัปเดต DB ที่เกี่ยวข้องทันที
   */
  async updateSingleOcrContainerRecord(containerItem, updatedFields) {
    try {
      const { container_no, job_type, port, size, truck_no } = updatedFields;
      const cleanCno = String(container_no || '').trim().toUpperCase();
      const cleanPort = String(port || '').trim();
      const cleanSize = String(size || '').trim();
      const cleanJobType = String(job_type || '').trim().toUpperCase();
      const cleanTruck = String(truck_no || '').trim();

      // 1. ตรวจสอบสถานะการจับคู่กับ Master DB (container_records)
      const { data: masterRecords } = await supabase.from('container_records').select('*');
      const bestMaster = findBestMasterDbMatch(cleanCno, cleanPort, cleanTruck, masterRecords || []);
      const isGreen = Boolean(bestMaster);
      const matchStatus = isGreen ? 'matched_green' : 'manual_red';

      // 2. ถ้าเป็น Completed
      if (containerItem.workflow_status === 'completed') {
        const dbId = containerItem.db_id;

        // อัปเดตใน ocr_records (legacy)
        if (dbId) {
          const updatePayload = {
            container_no: cleanCno,
            port: cleanPort,
            size: cleanSize,
            match_status: matchStatus
          };
          if (cleanTruck) updatePayload.truck_no = cleanTruck;

          const { error: ocrErr } = await supabase
            .from('ocr_records')
            .update(updatePayload)
            .eq('id', dbId);

          if (ocrErr) {
            console.error('ocr_records update error:', ocrErr);
            throw ocrErr;
          }
        }

        // อัปเดตใน job_sheet_items
        if (dbId) {
          try {
            await supabase
              .from('job_sheet_items')
              .update({
                container_no: cleanCno,
                job_type: cleanJobType,
                port: cleanPort,
                size: cleanSize,
                match_status: matchStatus
              })
              .eq('id', dbId);
          } catch (e) {
            console.warn('job_sheet_items update err:', e);
          }
        }

        // อัปเดตใน ocr_cache และ localStorage ถ้ามีรูปภาพนี้
        const sheetId = containerItem.sheet_id;
        if (sheetId) {
          try {
            const { data: cacheRow } = await supabase
              .from('ocr_cache')
              .select('*')
              .eq('id', sheetId)
              .maybeSingle();

            if (cacheRow && cacheRow.ocr_data && Array.isArray(cacheRow.ocr_data.rows)) {
              const ocrData = { ...cacheRow.ocr_data };
              ocrData.rows = ocrData.rows.map(r => {
                if (r.container_no === containerItem.container_no || r.raw_ocr_no === containerItem.raw_ocr_text) {
                  return {
                    ...r,
                    container_no: cleanCno,
                    raw_ocr_no: cleanCno,
                    port: cleanPort,
                    size: cleanSize,
                    job_type: cleanJobType,
                    isManuallyEdited: true,
                    isConfirmedMatch: isGreen,
                    matchColor: isGreen ? 'green' : 'red'
                  };
                }
                return r;
              });
              await supabase.from('ocr_cache').update({ ocr_data: ocrData }).eq('id', cacheRow.id);

              const draftKeys = [`draft_${cacheRow.id}`, `draft_${sheetId}`, `draft_${ocrData.file_hash}`, `draft_${ocrData.drive_file_id}`].filter(Boolean);
              draftKeys.forEach(k => {
                try { localStorage.setItem(k, JSON.stringify(ocrData.rows)); } catch(e) {}
              });
            }
          } catch (e) {
            console.warn('completed cache sync err:', e);
          }
        }
      }

      // 3. ถ้าเป็น Pending (ใน ocr_cache)
      if (containerItem.workflow_status === 'pending' && containerItem.sheet_id) {
        const cacheId = containerItem.sheet_id;
        const { data: cacheRow } = await supabase.from('ocr_cache').select('*').eq('id', cacheId).maybeSingle();
        if (cacheRow && cacheRow.ocr_data) {
          const ocrData = { ...cacheRow.ocr_data };
          if (Array.isArray(ocrData.rows)) {
            // หาตำแหน่ง Index ที่ตรงกับแถวนี้
            let targetIdx = -1;
            if (typeof containerItem.line_no === 'number' && containerItem.line_no > 0) {
              targetIdx = containerItem.line_no - 1;
            } else if (containerItem.id && containerItem.id.startsWith('pending_')) {
              const parts = containerItem.id.split('_');
              const p = parseInt(parts[parts.length - 1], 10);
              if (!isNaN(p)) targetIdx = p;
            }

            if (targetIdx < 0 || targetIdx >= ocrData.rows.length) {
              targetIdx = ocrData.rows.findIndex(r => r.container_no === containerItem.container_no || r.raw_ocr_no === containerItem.raw_ocr_text);
            }

            if (targetIdx >= 0 && targetIdx < ocrData.rows.length) {
              ocrData.rows[targetIdx] = {
                ...ocrData.rows[targetIdx],
                container_no: cleanCno,
                raw_ocr_no: cleanCno,
                job_type: cleanJobType,
                port: cleanPort,
                size: cleanSize,
                isManuallyEdited: true,
                isConfirmedCustom: true,
                isConfirmedMatch: isGreen,
                matchColor: isGreen ? 'green' : 'red',
                selectedDbId: bestMaster ? bestMaster.id : null
              };

              const { error: cacheErr } = await supabase.from('ocr_cache').update({ ocr_data: ocrData }).eq('id', cacheId);
              if (cacheErr) {
                console.error('ocr_cache update error:', cacheErr);
                throw cacheErr;
              }

              const draftKeys = [
                `draft_${cacheId}`,
                `draft_${ocrData.file_hash}`,
                `draft_${ocrData.drive_file_id}`,
                `draft_${ocrData.id}`,
                `draft_${containerItem.drive_file_id}`
              ].filter(Boolean);

              draftKeys.forEach(k => {
                try {
                  localStorage.setItem(k, JSON.stringify(ocrData.rows));
                } catch (e) {}
              });
            }
          }
        }
      }

      return { 
        success: true, 
        match_status: matchStatus, 
        matchedMaster: bestMaster, 
        error: null 
      };
    } catch (err) {
      console.error('updateSingleOcrContainerRecord error:', err);
      return { success: false, error: err };
    }
  }
};

export default jobSheetService;
