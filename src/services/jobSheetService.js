import { supabase } from '../supabaseClient';
import { getAllPendingFromDB } from '../utils/pendingDb';
import { findTopContainerMatches, evaluateMatchStatus, cleanBatchName, findBestMasterDbMatch, isDateMatching, normalizeExcelDate } from '../utils/matchingLogic';

export { findBestMasterDbMatch, isDateMatching };



/**
 * 📄 JobSheet Service
 * บริการจัดการข้อมูลใบงานทั้งระบบ (Pending Queue, OCR Cache, Completed Job Sheets, Detail Items)
 */
export const jobSheetService = {
  /**
   * ดึงรายการใบงานที่รอดำเนินการ (Pending) จาก Supabase (เฉพาะ Metadata เพื่อความเร็วสูงสุด)
   */
  async fetchPendingJobSheets() {
    try {
      const { data, error } = await supabase
        .from('ocr_cache')
        .select('id, model_used, image_name, ocr_data, created_at, updated_at')
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
   * ดึงข้อมูลใบงาน Pending เฉพาะใบเดี่ยว (รวมผลสแกน OCR เต็มชุดเมื่อเปิดตรวจ)
   */
  async fetchPendingJobSheetById(id) {
    if (!id) return { data: null, error: 'No id provided' };
    try {
      const { data, error } = await supabase
        .from('ocr_cache')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('jobSheetService.fetchPendingJobSheetById error:', error);
      return { data: null, error };
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
        .select('id, model_used, image_name, ocr_data, created_at')
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
    driverName = null,
    imageUrl,
    imageName,
    driveFileId,
    matchingResults = [],
    ocrResult = null,
    isCompletedEdit = false
  }) {
    try {
      const targetSheetId = sheetId || fileHash || `JS_${Date.now()}_${truckNo}`;

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
        const rawDate = res.date_job || null;
        const parsedDate = rawDate ? normalizeExcelDate(rawDate) || (rawDate.length >= 10 ? rawDate.slice(0, 10) : null) : null;

        return {
          job_sheet_id: targetSheetId,
          line_no: res.displayIndex || (index + 1),
          container_no: finalContainerNo,
          raw_ocr_text: res.originalText || null,
          port: res.port || null,
          size: res.size || null,
          job_type: res.jobType || res.job_type || null,
          date_job: rawDate,
          date_job_parsed: parsedDate,
          match_status: matchStatus,
          ref_master_id: refId,
          created_at: new Date().toISOString()
        };
      });

      // ดึงวันที่ใบงานจากรายการตู้แรกที่มีวันที่
      const firstItemWithDate = itemsToInsert.find(i => i.date_job && i.date_job !== '-' && i.date_job !== 'null');
      const sheetDateJob = firstItemWithDate?.date_job || '-';
      const sheetDateParsed = firstItemWithDate?.date_job_parsed || null;

      // 1. สร้าง Payload หัวใบงาน
      const sheetHeader = {
        id: targetSheetId,
        batch_name: batchName,
        truck_no: String(truckNo || '').trim(),
        driver_name: driverName || null,
        image_url: imageUrl || null,
        image_name: imageName || null,
        drive_file_id: driveFileId || null,
        total_containers: validItems.length,
        matched_count: greenCount,
        unmatched_count: redCount,
        status: 'completed',
        date_job: sheetDateJob,
        date_job_parsed: sheetDateParsed,
        created_at: new Date().toISOString()
      };

      // 2. สร้าง Payload ข้อมูลสำรอง (ocr_records พร้อม job_sheet_id)
      const legacyRecords = itemsToInsert.map(item => ({
        job_sheet_id: targetSheetId,
        batch_name: batchName,
        truck_no: truckNo,
        driver_name: driverName || null,
        image_url: imageUrl,
        container_no: item.container_no,
        port: item.port,
        size: item.size,
        date_job: item.date_job,
        date_job_parsed: item.date_job_parsed,
        match_status: item.match_status,
        ref_db_id: item.ref_master_id,
        created_at: item.created_at
      }));

      const cacheId = fileHash || targetSheetId;
      const cacheUpdatePayload = {
        ...(ocrResult || {}),
        is_pending: false,
        saved_at: new Date().toISOString()
      };

      // 🚀 Data Integrity: ลองบันทึกผ่าน Atomic Database Transaction (RPC) ก่อนเสมอ
      // หมายเหตุ: การลบข้อมูลเดิมตอน Edit ถูกจัดการแบบ Atomic ภายใน complete_job_sheet_rpc แล้ว
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('complete_job_sheet_rpc', {
          p_sheet: sheetHeader,
          p_items: itemsToInsert,
          p_legacy_records: legacyRecords,
          p_cache_id: cacheId || '',
          p_cache_update: cacheUpdatePayload,
          p_is_edit: Boolean(isCompletedEdit)
        });

        if (!rpcError && rpcData?.success) {
          return { success: true, sheetId: targetSheetId, error: null };
        }
        if (rpcError) {
          console.warn('complete_job_sheet_rpc warning, using client-side fallback:', rpcError);
        }
      } catch (rpcErr) {
        console.warn('complete_job_sheet_rpc exception, using client-side fallback:', rpcErr);
      }

      // 🛡️ Fallback: บันทึกแบบทีละขั้นตอนจาก Client-side (กรณี RPC ยังไม่ถูกรันใน DB)
      if (isCompletedEdit) {
        try {
          await supabase.from('job_sheet_items').delete().eq('job_sheet_id', targetSheetId);
          await supabase.from('ocr_records').delete().eq('job_sheet_id', targetSheetId);
          if (imageUrl) {
            await supabase.from('ocr_records').delete().eq('image_url', imageUrl).is('job_sheet_id', null);
          }
        } catch (delErr) {
          console.warn('Old records deletion warning in fallback:', delErr);
        }
      }

      const { error: sheetErr } = await supabase
        .from('job_sheets')
        .upsert(sheetHeader, { onConflict: 'id' });

      if (sheetErr) {
        console.error('job_sheets upsert failed in fallback:', sheetErr);
        return { success: false, error: sheetErr };
      }

      if (itemsToInsert.length > 0) {
        const { error: itemsErr } = await supabase
          .from('job_sheet_items')
          .insert(itemsToInsert);

        if (itemsErr) {
          console.error('job_sheet_items insert failed in fallback:', itemsErr);
          // Rollback: ลบหัวใบงานออกทันทีเพื่อป้องกันการเกิด Orphaned Header
          try {
            await supabase.from('job_sheets').delete().eq('id', targetSheetId);
          } catch (rbErr) {
            console.warn('Rollback warning:', rbErr);
          }
          return { success: false, error: itemsErr };
        }
      }

      if (legacyRecords.length > 0) {
        await supabase.from('ocr_records').insert(legacyRecords);
      }

      if (cacheId) {
        await supabase
          .from('ocr_cache')
          .update({
            model_used: 'completed',
            image_url: imageUrl,
            ocr_data: cacheUpdatePayload
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
   * 👤 อัปเดต/เปลี่ยนตัวคนขับของใบงาน (Update Driver Name)
   */
  async updateJobSheetDriver(sheetId, newDriverName) {
    try {
      const cleanDriver = newDriverName && newDriverName !== '-' ? String(newDriverName).trim() : null;
      
      const { error: sheetErr } = await supabase
        .from('job_sheets')
        .update({ driver_name: cleanDriver })
        .eq('id', sheetId);

      if (sheetErr) throw sheetErr;

      try {
        await supabase
          .from('ocr_records')
          .update({ driver_name: cleanDriver })
          .eq('job_sheet_id', sheetId);
      } catch (e) {}

      return { success: true, error: null };
    } catch (error) {
      console.error('jobSheetService.updateJobSheetDriver error:', error);
      return { success: false, error };
    }
  },

  /**
   * ดึงรายการใบงานที่บันทึกแล้วทั้งหมด (High-Speed Parallelized Fetching)
   */
  async fetchCompletedJobSheets(existingMasterDb = null, options = {}) {
    try {
      const { startDate = null, endDate = null } = options;
      // 0. ดึง Master DB, job_sheets และ job_sheet_items แบบ Parallel ทันที
      let masterQuery = supabase
        .from('container_records')
        .select('id, container_no, truck_no, port, size, dis_load, date_job, date_job_parsed, batch_name, source_file');

      let sheetsQuery = supabase
        .from('job_sheets')
        .select('*')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      let itemsQuery = supabase
        .from('job_sheet_items')
        .select('id, job_sheet_id, line_no, container_no, raw_ocr_text, port, size, job_type, date_job, date_job_parsed, match_status')
        .order('created_at', { ascending: false });

      // Apply Date Filters
      if (startDate && endDate) {
        masterQuery = masterQuery.gte('date_job_parsed', startDate).lte('date_job_parsed', endDate);
        sheetsQuery = sheetsQuery.gte('date_job_parsed', startDate).lte('date_job_parsed', endDate);
        itemsQuery = itemsQuery.gte('date_job_parsed', startDate).lte('date_job_parsed', endDate);
      }

      const masterPromise = existingMasterDb
        ? Promise.resolve({ data: existingMasterDb })
        : masterQuery;

      const [masterRes, sheetsRes, itemsRes] = await Promise.all([
        masterPromise,
        sheetsQuery,
        itemsQuery
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
        const { id, isRed, job_sheet_item_id, ocr_record_id, ...updateFields } = item;
        const targetItemId = job_sheet_item_id || id;
        
        // 1. อัปเดตใน job_sheet_items โดยตรง
        if (targetItemId) {
          await supabase
            .from('job_sheet_items')
            .update(updateFields)
            .eq('id', targetItemId);
        }

        // 2. ถ้ามี ocr_record_id เจาะจง ให้อัปเดต ocr_records ด้วย id นั้น
        if (ocr_record_id) {
          await supabase
            .from('ocr_records')
            .update(updateFields)
            .eq('id', ocr_record_id);
        } else if (sheetId && item.container_no) {
          // ซิงค์ไปยัง ocr_records ที่ผูกกับ sheetId เดียวกัน
          await supabase
            .from('ocr_records')
            .update(updateFields)
            .eq('job_sheet_id', sheetId)
            .eq('container_no', item.container_no);
        }
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
        await supabase.from('ocr_records').delete().eq('job_sheet_id', sheet.id);
      }
      if (sheet.image_url) {
        await supabase.from('ocr_records').delete().eq('image_url', sheet.image_url).is('job_sheet_id', null);
      }
      return { success: true, error: null };
    } catch (error) {
      console.error('jobSheetService.deleteCompletedJobSheet error:', error);
      return { success: false, error };
    }
  },

  /**
   * 📄 ดึงรายการใบงานที่บันทึกแล้วแบบ Server-Side Pagination พร้อมรายการตู้
   */
  async fetchPaginatedCompletedJobSheets({
    page = 1,
    pageSize = 50,
    searchTerm = '',
    batchFilter = 'ALL',
    truckFilter = 'ALL',
    monthFilter = '',
    sortConfig = { key: 'created_at', direction: 'desc' }
  } = {}) {
    try {
      let query = supabase
        .from('job_sheets')
        .select('*', { count: 'exact' })
        .neq('status', 'deleted');

      // 🔍 1. Server-Side Search
      if (searchTerm && searchTerm.trim()) {
        const cleanTerm = searchTerm.trim();
        query = query.or(`batch_name.ilike.%${cleanTerm}%,truck_no.ilike.%${cleanTerm}%,image_name.ilike.%${cleanTerm}%`);
      }

      // 📁 2. Batch Filter
      if (batchFilter && batchFilter !== 'ALL') {
        query = query.eq('batch_name', batchFilter);
      }

      // 🚚 3. Truck Filter
      if (truckFilter && truckFilter !== 'ALL') {
        query = query.eq('truck_no', truckFilter);
      }

      // 📅 4. Month Filter (e.g. '2026-04' or '2026-08')
      if (monthFilter && monthFilter.trim()) {
        const [year, month] = monthFilter.trim().split('-');
        if (year && month) {
          const monthIdx = parseInt(month, 10) - 1;
          const monthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const monthNamesTh = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
          const monthEn = monthNamesEn[monthIdx] || '';
          const monthTh = monthNamesTh[monthIdx] || '';

          const startDate = `${year}-${month}-01`;
          const lastDay = new Date(Number(year), Number(month), 0).getDate();
          const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

          // ดึง sheet_ids ที่มีรายการตู้ (date_job) ตรงกับเดือนนี้
          let itemSheetIds = [];
          try {
            const { data: matchedItems } = await supabase
              .from('job_sheet_items')
              .select('job_sheet_id')
              .or(`date_job.ilike.%${monthEn}%,date_job.ilike.%${monthTh}%,date_job.ilike.%${year}-${month}%,date_job_parsed.gte.${startDate},date_job_parsed.lte.${endDate}`);
            if (Array.isArray(matchedItems)) {
              itemSheetIds = [...new Set(matchedItems.map(i => i.job_sheet_id).filter(Boolean))];
            }
          } catch (e) {}

          const orConditions = [
            `and(created_at.gte.${startDate}T00:00:00.000Z,created_at.lte.${endDate}T23:59:59.999Z)`,
            monthEn ? `batch_name.ilike.%${monthEn}%` : null,
            monthTh ? `batch_name.ilike.%${monthTh}%` : null,
            `batch_name.ilike.%${year}-${month}%`,
            monthEn ? `image_name.ilike.%${monthEn}%` : null
          ].filter(Boolean);

          if (itemSheetIds.length > 0) {
            query = query.or(`${orConditions.join(',')},id.in.(${itemSheetIds.join(',')})`);
          } else {
            query = query.or(orConditions.join(','));
          }
        }
      }

      // ↕️ 5. Sorting
      const sortColumn = sortConfig.key || 'created_at';
      const isAscending = sortConfig.direction === 'asc';
      query = query.order(sortColumn, { ascending: isAscending, nullsFirst: false });

      // 📄 6. Server-Side Pagination
      if (pageSize !== 'ALL') {
        const size = Number(pageSize) || 50;
        const from = (page - 1) * size;
        const to = from + size - 1;
        query = query.range(from, to);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      // 📦 7. ดึงรายการตู้ (job_sheet_items หรือ ocr_records) ของใบงานในหน้านี้
      const sheetIds = (data || []).map(s => s.id).filter(Boolean);
      const itemsMap = {};
      const masterIds = [];

      if (sheetIds.length > 0) {
        const [itemsRes, legacyRes] = await Promise.all([
          supabase.from('job_sheet_items').select('*').in('job_sheet_id', sheetIds).order('line_no', { ascending: true }),
          supabase.from('ocr_records').select('*').in('job_sheet_id', sheetIds).neq('match_status', 'deleted')
        ]);

        if (itemsRes.data && itemsRes.data.length > 0) {
          itemsRes.data.forEach(item => {
            if (!itemsMap[item.job_sheet_id]) itemsMap[item.job_sheet_id] = [];
            itemsMap[item.job_sheet_id].push(item);
            if (item.ref_master_id) masterIds.push(item.ref_master_id);
          });
        }
        if (legacyRes.data && legacyRes.data.length > 0) {
          legacyRes.data.forEach(item => {
            if (!itemsMap[item.job_sheet_id]) itemsMap[item.job_sheet_id] = [];
            if (!itemsMap[item.job_sheet_id].some(existing => existing.container_no === item.container_no)) {
              itemsMap[item.job_sheet_id].push(item);
              if (item.ref_db_id || item.ref_master_id) masterIds.push(item.ref_db_id || item.ref_master_id);
            }
          });
        }
      }

      // ดึงวันที่จาก Master DB (สำหรับตู้ที่แมตช์ได้ เพื่อนำวันที่สะอาดจากใบวางบิลมาหาคนขับ)
      const masterDateMap = {};
      if (masterIds.length > 0) {
        const { data: masterRows } = await supabase
          .from('container_records')
          .select('id, date_job, date_job_parsed, truck_no')
          .in('id', masterIds);
        if (masterRows) {
          masterRows.forEach(m => {
            masterDateMap[m.id] = m.date_job_parsed || m.date_job;
          });
        }
      }

      // 🚚 8. ดึงข้อมูล Operations และ Trucks เพื่อคำนวณชื่อคนขับประจำใบงาน (Driver Enrichment)
      const [opsRes, trucksRes] = await Promise.all([
        supabase.from('truck_operations').select('truck_no, driver_name, start_date, end_date, status').limit(2000),
        supabase.from('truck_records').select('truck_no, assigned_driver_name').limit(500)
      ]);
      const opsData = opsRes?.data || [];
      const trucksData = trucksRes?.data || [];

      const isTruckMatch = (t1, t2) => {
        if (!t1 || !t2) return false;
        const s1 = String(t1).trim().replace(/^รถ\s*/, '').toLowerCase();
        const s2 = String(t2).trim().replace(/^รถ\s*/, '').toLowerCase();
        return s1 === s2 || s1.includes(s2) || s2.includes(s1);
      };

      const resolveDriver = (truckNo, jobDate) => {
        if (!truckNo || truckNo === '-') return '-';
        let isoDate = null;
        if (jobDate && jobDate !== '-') {
          const norm = normalizeExcelDate(jobDate);
          if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) isoDate = norm;
        }
        if (isoDate && opsData.length > 0) {
          const op = opsData.find(o => {
            if (!isTruckMatch(o.truck_no, truckNo)) return false;
            const sDate = o.start_date ? String(o.start_date).slice(0, 10) : null;
            const eDate = o.end_date ? String(o.end_date).slice(0, 10) : null;
            if (sDate && isoDate < sDate) return false;
            if (eDate && isoDate > eDate) return false;
            return true;
          });
          if (op?.driver_name && op.driver_name !== '-') return op.driver_name;
        }
        const activeOp = opsData.find(o => isTruckMatch(o.truck_no, truckNo) && (o.status === 'active' || !o.end_date));
        if (activeOp?.driver_name && activeOp.driver_name !== '-') return activeOp.driver_name;
        const truck = trucksData.find(t => isTruckMatch(t.truck_no, truckNo));
        if (truck?.assigned_driver_name && truck.assigned_driver_name !== '-') return truck.assigned_driver_name;
        return '-';
      };

      const formattedData = (data || []).map(sheet => {
        const sheetItems = itemsMap[sheet.id] || sheet.job_sheet_items || [];
        const items = sheetItems.map(i => ({
          ...i,
          originalText: i.raw_ocr_text || i.container_no,
          match_status: i.match_status,
          is_red: i.match_status === 'manual_red',
          is_matched: i.match_status !== 'manual_red'
        }));

        // 1. ลองหาวันที่จาก Master DB ที่แมตช์ตรงกับตู้นี้ (วันที่สะอาดจากใบวางบิล 100%)
        let effectiveDate = null;
        for (const item of sheetItems) {
          const mId = item.ref_master_id || item.ref_db_id;
          if (mId && masterDateMap[mId] && masterDateMap[mId] !== '-') {
            effectiveDate = masterDateMap[mId];
            break;
          }
        }

        // 2. ถ้าไม่มีใน Master ให้ดูจากวันที่ในแถวตู้ใบงาน
        if (!effectiveDate) {
          const firstItemWithDate = sheetItems.find(i => i.date_job && i.date_job !== '-' && i.date_job !== 'null');
          effectiveDate = firstItemWithDate?.date_job_parsed || firstItemWithDate?.date_job;
        }

        // 3. ถ้าไม่มี ให้ดูจากวันที่บนหัวใบงาน
        if (!effectiveDate && sheet.date_job && sheet.date_job !== '-') {
          effectiveDate = sheet.date_job_parsed || sheet.date_job;
        }

        const resolvedDriver = (sheet.driver_name && sheet.driver_name !== '-')
          ? sheet.driver_name
          : resolveDriver(sheet.truck_no, effectiveDate);

        return {
          ...sheet,
          driver_name: resolvedDriver,
          containers: items,
          total: sheet.total_containers || items.length,
          green: sheet.matched_count ?? items.filter(i => i.match_status !== 'manual_red').length,
          red: sheet.unmatched_count ?? items.filter(i => i.match_status === 'manual_red').length
        };
      });

      return {
        data: formattedData,
        totalCount: count || 0,
        totalPages: (pageSize === 'ALL' || !count) ? 1 : Math.ceil(count / Number(pageSize)),
        currentPage: page,
        error: null
      };
    } catch (error) {
      console.error('jobSheetService.fetchPaginatedCompletedJobSheets error:', error);
      return { data: [], totalCount: 0, totalPages: 1, currentPage: page, error };
    }
  },

  /**
   * 📊 ดึงประวัติเลขตู้แบบ Server-Side Pagination จาก Database View `vw_ocr_container_history`
   * รองรับ Filters, Search, Sorting และจำกัดปริมาณข้อมูลต่อหน้าอย่างแท้จริง
   */
  async fetchPaginatedOcrContainersHistory({
    page = 1,
    pageSize = 50,
    searchTerm = '',
    statusFilter = 'ALL',
    batchFilter = 'ALL',
    truckFilter = 'ALL',
    sortConfig = { key: 'created_at', direction: 'desc' }
  } = {}) {
    try {
      let query = supabase
        .from('vw_ocr_container_history')
        .select('*', { count: 'exact' });

      // 🔍 1. Server-Side Search (ค้นหาเลขตู้, เบอร์รถ, รอบงาน)
      if (searchTerm && searchTerm.trim()) {
        const cleanTerm = searchTerm.trim();
        query = query.or(`container_no.ilike.%${cleanTerm}%,truck_no.ilike.%${cleanTerm}%,batch_name.ilike.%${cleanTerm}%`);
      }

      // 🏷️ 2. Workflow / Match Status Filter
      if (statusFilter === 'COMPLETED') {
        query = query.eq('workflow_status', 'completed');
      } else if (statusFilter === 'PENDING') {
        query = query.eq('workflow_status', 'pending');
      } else if (statusFilter === 'MATCHED') {
        query = query.eq('match_status', 'matched_green');
      } else if (statusFilter === 'UNMATCHED') {
        query = query.in('match_status', ['unmatched_red', 'manual_red']);
      }

      // 📁 3. Batch Filter
      if (batchFilter && batchFilter !== 'ALL') {
        query = query.eq('batch_name', batchFilter);
      }

      // 🚚 4. Truck Filter
      if (truckFilter && truckFilter !== 'ALL') {
        query = query.eq('truck_no', truckFilter);
      }

      // ↕️ 5. Sorting
      const sortColumn = sortConfig.key || 'created_at';
      const isAscending = sortConfig.direction === 'asc';
      query = query.order(sortColumn, { ascending: isAscending, nullsFirst: false });

      // 📄 6. Server-Side Pagination (.range)
      if (pageSize !== 'ALL') {
        const size = Number(pageSize) || 50;
        const from = (page - 1) * size;
        const to = from + size - 1;
        query = query.range(from, to);
      }

      const { data, count, error } = await query;
      if (error) {
        // ถ้ายังไม่ได้รัน migration view ใน Supabase ให้ fallback ไปยัง fetchAllOcrContainersHistory ทันที
        console.warn('vw_ocr_container_history query failed, falling back to fetchAllOcrContainersHistory:', error);
        throw error;
      }

      // ถ้า View ส่งกลับ 0 แถว แต่ในระบบมีข้อมูล ให้ Fallback
      if ((!data || data.length === 0) && statusFilter === 'ALL') {
        const checkCountRes = await supabase.from('job_sheet_items').select('id', { count: 'exact', head: true });
        const checkLegacyRes = await supabase.from('ocr_records').select('id', { count: 'exact', head: true }).neq('match_status', 'deleted');
        if ((checkCountRes.count || 0) > 0 || (checkLegacyRes.count || 0) > 0) {
          console.warn('vw_ocr_container_history returned 0 rows but items exist. Falling back to fetchAllOcrContainersHistory.');
          throw new Error('View returned 0 rows but completed items exist');
        }
      }

      // 🚚 7. เติม driver_name ให้กับแถวตู้ในหน้านี้
      const [opsRes, trucksRes] = await Promise.all([
        supabase.from('truck_operations').select('truck_no, driver_name, start_date, end_date, status').limit(2000),
        supabase.from('truck_records').select('truck_no, assigned_driver_name').limit(500)
      ]);
      const opsData = opsRes?.data || [];
      const trucksData = trucksRes?.data || [];

      const isTruckMatch = (t1, t2) => {
        if (!t1 || !t2) return false;
        const s1 = String(t1).trim().replace(/^รถ\s*/, '').toLowerCase();
        const s2 = String(t2).trim().replace(/^รถ\s*/, '').toLowerCase();
        return s1 === s2 || s1.includes(s2) || s2.includes(s1);
      };

      const resolveDriver = (truckNo, jobDate) => {
        if (!truckNo || truckNo === '-') return '-';
        let isoDate = null;
        if (jobDate && jobDate !== '-') {
          const norm = normalizeExcelDate(jobDate);
          if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) isoDate = norm;
        }
        if (isoDate && opsData.length > 0) {
          const op = opsData.find(o => {
            if (!isTruckMatch(o.truck_no, truckNo)) return false;
            const sDate = o.start_date ? String(o.start_date).slice(0, 10) : null;
            const eDate = o.end_date ? String(o.end_date).slice(0, 10) : null;
            if (sDate && isoDate < sDate) return false;
            if (eDate && isoDate > eDate) return false;
            return true;
          });
          if (op?.driver_name && op.driver_name !== '-') return op.driver_name;
        }
        const activeOp = opsData.find(o => isTruckMatch(o.truck_no, truckNo) && (o.status === 'active' || !o.end_date));
        if (activeOp?.driver_name && activeOp.driver_name !== '-') return activeOp.driver_name;
        const truck = trucksData.find(t => isTruckMatch(t.truck_no, truckNo));
        if (truck?.assigned_driver_name && truck.assigned_driver_name !== '-') return truck.assigned_driver_name;
        return '-';
      };

      const enrichedRows = (data || []).map(row => ({
        ...row,
        driver_name: (row.driver_name && row.driver_name !== '-')
          ? row.driver_name
          : resolveDriver(row.truck_no, row.date_job_parsed || row.date_job)
      }));

      return {
        data: enrichedRows,
        totalCount: count || 0,
        totalPages: (pageSize === 'ALL' || !count) ? 1 : Math.ceil(count / Number(pageSize)),
        currentPage: page,
        error: null
      };
    } catch (error) {
      console.warn('jobSheetService.fetchPaginatedOcrContainersHistory executing complete client-side fallback...');
      try {
        const fullRes = await this.fetchAllOcrContainersHistory();
        let list = fullRes.data || [];

        if (searchTerm && searchTerm.trim()) {
          const cleanTerm = searchTerm.trim().toLowerCase();
          list = list.filter(i => 
            i.container_no?.toLowerCase().includes(cleanTerm) ||
            i.truck_no?.toLowerCase().includes(cleanTerm) ||
            i.batch_name?.toLowerCase().includes(cleanTerm) ||
            i.driver_name?.toLowerCase().includes(cleanTerm)
          );
        }
        if (statusFilter === 'COMPLETED') list = list.filter(i => i.workflow_status === 'completed');
        else if (statusFilter === 'PENDING') list = list.filter(i => i.workflow_status === 'pending');
        else if (statusFilter === 'MATCHED') list = list.filter(i => i.match_status === 'matched_green');
        else if (statusFilter === 'UNMATCHED') list = list.filter(i => i.match_status === 'manual_red' || i.match_status === 'unmatched_red');

        if (batchFilter && batchFilter !== 'ALL') list = list.filter(i => i.batch_name === batchFilter);
        if (truckFilter && truckFilter !== 'ALL') list = list.filter(i => i.truck_no === truckFilter);

        // Sorting
        const sortColumn = sortConfig.key || 'created_at';
        const isAscending = sortConfig.direction === 'asc';
        list.sort((a, b) => {
          const valA = a[sortColumn] || '';
          const valB = b[sortColumn] || '';
          return isAscending ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
        });

        const totalCount = list.length;
        const size = pageSize === 'ALL' ? totalCount : (Number(pageSize) || 50);
        const from = (page - 1) * size;
        const paginated = list.slice(from, from + size);

        return {
          data: paginated,
          totalCount,
          totalPages: pageSize === 'ALL' ? 1 : Math.ceil(totalCount / size),
          currentPage: page,
          error: null
        };
      } catch (fallbackErr) {
        console.error('jobSheetService.fetchPaginatedOcrContainersHistory fallback failed:', fallbackErr);
        return { data: [], totalCount: 0, totalPages: 1, currentPage: page, error: fallbackErr };
      }
    }
  },

  /**
   * 📊 ดึงสถิติ KPI รวมของระบบ OCR (Total, Completed, Pending, Matched, Unmatched)
   */
  async fetchOcrKpis() {
    try {
      // 1. ดึงยอด Completed ตรวจเสร็จแล้วจาก job_sheet_items และ ocr_records (Fallback)
      const [itemsRes, cacheRes, unmatchedItemsRes, legacyRes, unmatchedLegacyRes] = await Promise.all([
        supabase.from('job_sheet_items').select('id, match_status', { count: 'exact', head: true }),
        supabase.from('ocr_cache').select('id, ocr_data').not('model_used', 'in', '("completed","deleted")'),
        supabase.from('job_sheet_items').select('id', { count: 'exact', head: true }).in('match_status', ['unmatched_red', 'manual_red']),
        supabase.from('ocr_records').select('id, match_status', { count: 'exact', head: true }).neq('match_status', 'deleted'),
        supabase.from('ocr_records').select('id', { count: 'exact', head: true }).neq('match_status', 'deleted').in('match_status', ['unmatched_red', 'manual_red'])
      ]);

      let completedCount = itemsRes.count || 0;
      let unmatchedCount = unmatchedItemsRes.count || 0;

      // ถ้าใน job_sheet_items ยังไม่มีข้อมูล ให้ใช้ยอดจาก ocr_records (Legacy)
      if (completedCount === 0 && (legacyRes.count || 0) > 0) {
        completedCount = legacyRes.count || 0;
        unmatchedCount = unmatchedLegacyRes.count || 0;
      }

      const matchedCount = Math.max(0, completedCount - unmatchedCount);

      // 2. ดึงยอด Pending โดยนับจำนวนตู้จริงที่อยู่ในแต่ละไฟล์ของคิวรอตรวจ (Pending Containers)
      let pendingCount = 0;
      if (cacheRes.data && cacheRes.data.length > 0) {
        cacheRes.data.forEach(c => {
          const rows = c.ocr_data?.rows || c.ocr_data?.draft_items || c.ocr_data?.containers || c.ocr_data?.matching_results || c.ocr_data?.results || [];
          pendingCount += (Array.isArray(rows) && rows.length > 0) ? rows.length : 1;
        });
      }

      const totalCount = completedCount + pendingCount;

      return {
        total: totalCount,
        completed: completedCount,
        pending: pendingCount,
        matched: matchedCount,
        unmatched: unmatchedCount
      };
    } catch (e) {
      console.error('Failed to fetch KPI counts:', e);
      return { total: 0, completed: 0, pending: 0, matched: 0, unmatched: 0 };
    }
  },

  /**
   * 📊 ดึงประวัติเลขตู้ทั้งหมดที่ได้จากการทำ OCR จากใบงาน (ทั้ง Completed และ Pending)
   * สำหรับหน้า '📊 OCR Container History'
   * รองรับ High-Speed Parallel Fetching, Date Filtering และไม่ดึง Base64 รูปภาพหนัก
   */
  async fetchAllOcrContainersHistory(existingMasterDb = null, options = {}) {
    try {
      const { startDate = null, endDate = null } = options;
      let allContainers = [];

      // ⚡ 1. ดึงข้อมูลทั้งหมดแบบ Parallel 100% (High-Speed Optimization)
      let masterQuery = supabase
        .from('container_records')
        .select('id, container_no, truck_no, port, size, dis_load, date_job, date_job_parsed, batch_name, source_file');

      let sheetsQuery = supabase
        .from('job_sheets')
        .select('*')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      let itemsQuery = supabase
        .from('job_sheet_items')
        .select('id, job_sheet_id, line_no, container_no, raw_ocr_text, port, size, job_type, date_job, date_job_parsed, match_status, ref_master_id, created_at')
        .order('created_at', { ascending: false });

      // Apply Date Filters
      if (startDate && endDate) {
        masterQuery = masterQuery.gte('date_job_parsed', startDate).lte('date_job_parsed', endDate);
        itemsQuery = itemsQuery.gte('date_job_parsed', startDate).lte('date_job_parsed', endDate);
      }

      const masterPromise = existingMasterDb
        ? Promise.resolve({ data: existingMasterDb })
        : masterQuery;

      // ดึงเฉพาะ metadata จาก ocr_cache ไม่ดึง Base64 image_data เพื่อความเร็วสูงสุด
      // Pending cache ดึงทั้งหมด เพราะอาจยังไม่มี date_job_parsed
      const cachePromise = supabase
        .from('ocr_cache')
        .select('id, image_name, ocr_data, model_used, created_at')
        .neq('model_used', 'deleted')
        .neq('model_used', 'completed')
        .order('created_at', { ascending: false });

      const [masterRes, sheetsRes, itemsRes, cacheRes, opsRes, trucksRes, driversRes] = await Promise.all([
        masterPromise,
        sheetsQuery,
        itemsQuery,
        cachePromise,
        supabase.from('truck_operations').select('truck_no, driver_name, start_date, end_date, status').limit(2000),
        supabase.from('truck_records').select('truck_no, assigned_driver_name').limit(500),
        supabase.from('driver_records').select('driver_name, assigned_truck_no, phone, status').order('driver_name')
      ]);

      const masterDbList = masterRes?.data || [];
      const sheetsData = sheetsRes?.data || [];
      const itemsData = itemsRes?.data || [];
      const pendingCaches = cacheRes?.data || [];
      const opsData = opsRes?.data || [];
      const trucksData = trucksRes?.data || [];
      const driversList = driversRes?.data || [];

      const isTruckMatch = (t1, t2) => {
        if (!t1 || !t2) return false;
        const s1 = String(t1).trim().replace(/^รถ\s*/, '').toLowerCase();
        const s2 = String(t2).trim().replace(/^รถ\s*/, '').toLowerCase();
        return s1 === s2 || s1.includes(s2) || s2.includes(s1);
      };

      const resolveDriver = (truckNo, jobDate) => {
        if (!truckNo || truckNo === '-') return '-';
        let isoDate = null;
        if (jobDate && jobDate !== '-') {
          const norm = normalizeExcelDate(jobDate);
          if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) isoDate = norm;
        }
        if (isoDate && opsData.length > 0) {
          const op = opsData.find(o => {
            if (!isTruckMatch(o.truck_no, truckNo)) return false;
            const sDate = o.start_date ? String(o.start_date).slice(0, 10) : null;
            const eDate = o.end_date ? String(o.end_date).slice(0, 10) : null;
            if (sDate && isoDate < sDate) return false;
            if (eDate && isoDate > eDate) return false;
            return true;
          });
          if (op?.driver_name && op.driver_name !== '-') return op.driver_name;
        }
        const activeOp = opsData.find(o => isTruckMatch(o.truck_no, truckNo) && (o.status === 'active' || !o.end_date));
        if (activeOp?.driver_name && activeOp.driver_name !== '-') return activeOp.driver_name;
        const truck = trucksData.find(t => isTruckMatch(t.truck_no, truckNo));
        if (truck?.assigned_driver_name && truck.assigned_driver_name !== '-') return truck.assigned_driver_name;
        const driverRec = driversList.find(d => isTruckMatch(d.assigned_truck_no, truckNo));
        if (driverRec?.driver_name && driverRec.driver_name !== '-') return driverRec.driver_name;
        return '-';
      };

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
      const sheetEffectiveDateMap = {};
      const sheetDriverMap = {};

      if (sheetsData && sheetsData.length > 0) {
        const sheetMap = {};
        sheetsData.forEach(s => { sheetMap[s.id] = s; });

        // คำนวณ effectiveDate และ driver ประจำแต่ละใบงานล่วงหน้า (1 Job Sheet = 1 Driver)
        sheetsData.forEach(s => {
          let effDate = s.date_job_parsed || s.date_job;
          const sItems = itemsData.filter(i => i.job_sheet_id === s.id);
          if (!effDate || effDate === '-') {
            for (const it of sItems) {
              const mDb = findBestMasterDbMatch(it.container_no, it.port, s.truck_no, masterDbList);
              if (mDb?.date_job_parsed || mDb?.date_job) {
                effDate = mDb.date_job_parsed || mDb.date_job;
                break;
              }
            }
          }
          sheetEffectiveDateMap[s.id] = effDate || '-';
          sheetDriverMap[s.id] = (s.driver_name && s.driver_name !== '-')
            ? s.driver_name
            : resolveDriver(s.truck_no, effDate);
        });

        if (itemsData && itemsData.length > 0) {
          itemsData.forEach(item => {
            const sheet = sheetMap[item.job_sheet_id] || {};
            const matchedDb = findBestMasterDbMatch(item.container_no, item.port, sheet.truck_no, masterDbList);
            const sheetEffDate = sheetEffectiveDateMap[item.job_sheet_id] || '-';

            const finalJobType = (item.job_type && item.job_type !== '-') ? item.job_type : (matchedDb?.dis_load || '-');
            const finalSize = (item.size && item.size !== '-') ? item.size : (matchedDb?.size || '-');
            const finalPort = (item.port && item.port !== '-') ? item.port : (matchedDb?.port || '-');
            const finalDateJob = (item.date_job && item.date_job !== '-') ? item.date_job : (matchedDb?.date_job || sheetEffDate);
            const dbBatch = matchedDb?.batch_name || (matchedDb?.source_file ? cleanBatchName(matchedDb.source_file) : null);
            const finalBatch = dbBatch || cleanBatchName(sheet.batch_name || 'General_Batch');

            const finalMatchStatus = item.match_status || (matchedDb ? 'matched_green' : 'manual_red');

            allContainers.push({
              id: `completed_item_${item.id}`,
              db_id: item.id,
              job_sheet_item_id: item.id,
              ocr_record_id: null,
              ref_master_id: item.ref_master_id || matchedDb?.id || null,
              ref_db_id: item.ref_master_id || matchedDb?.id || null,
              source_table: 'job_sheet_items',
              sheet_id: item.job_sheet_id,
              container_no: item.container_no,
              raw_ocr_text: item.raw_ocr_text || item.container_no,
              line_no: item.line_no || '-',
              port: finalPort,
              size: finalSize,
              job_type: finalJobType,
              date_job: finalDateJob,
              date_job_parsed: item.date_job_parsed || (matchedDb?.date_job_parsed || null),
              match_status: finalMatchStatus,
              workflow_status: 'completed',
              batch_name: finalBatch,
              truck_no: sheet.truck_no || '-',
              image_url: sheet.image_url || null,
              image_name: sheet.image_name || '-',
              drive_file_id: sheet.drive_file_id || null,
              driver_name: sheetDriverMap[item.job_sheet_id] || resolveDriver(sheet.truck_no, finalDateJob),
              created_at: item.created_at || sheet.created_at
            });
          });
        }
      }

      // ถ้ายังไม่มีใน job_sheet_items ให้ดึงจาก ocr_records (Fallback)
      if (allContainers.length === 0) {
        let legacyQuery = supabase
          .from('ocr_records')
          .select('*')
          .neq('match_status', 'deleted')
          .order('created_at', { ascending: false });

        if (startDate && endDate) {
          legacyQuery = legacyQuery.gte('date_job_parsed', startDate).lte('date_job_parsed', endDate);
        }

        const { data: legacyRecords } = await legacyQuery;

        if (legacyRecords && legacyRecords.length > 0) {
          legacyRecords.forEach(rec => {
            const matchedDb = findBestMasterDbMatch(rec.container_no, rec.port, rec.truck_no, masterDbList);

            const finalJobType = (rec.job_type && rec.job_type !== '-') ? rec.job_type : (matchedDb?.dis_load || '-');
            const finalSize = (rec.size && rec.size !== '-') ? rec.size : (matchedDb?.size || '-');
            const finalPort = (rec.port && rec.port !== '-') ? rec.port : (matchedDb?.port || '-');
            const finalDateJob = (rec.date_job && rec.date_job !== '-') ? rec.date_job : (matchedDb?.date_job || '-');
            const dbBatch = matchedDb?.batch_name || (matchedDb?.source_file ? cleanBatchName(matchedDb.source_file) : null);
            const finalBatch = dbBatch || cleanBatchName(rec.batch_name || 'General_Batch');

            const isMatched = rec.match_status !== 'manual_red' && matchedDb !== null;
            const finalMatchStatus = isMatched ? 'matched_green' : 'manual_red';

            allContainers.push({
              id: `legacy_${rec.id}`,
              db_id: rec.id,
              job_sheet_item_id: null,
              ocr_record_id: rec.id,
              ref_master_id: rec.ref_master_id || matchedDb?.id || null,
              ref_db_id: rec.ref_master_id || matchedDb?.id || null,
              source_table: 'ocr_records',
              sheet_id: rec.job_sheet_id || rec.image_url,
              container_no: rec.container_no,
              raw_ocr_text: rec.container_no,
              line_no: '-',
              port: finalPort,
              size: finalSize,
              job_type: finalJobType,
              date_job: finalDateJob,
              date_job_parsed: rec.date_job_parsed || null,
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
                  
                  if (evaluated && evaluated.color === 'green' && Array.isArray(evaluated.candidates) && evaluated.candidates.length > 0) {
                    matchStatus = evaluated.autoResolvedDuplicate ? 'duplicate_auto' : 'matched_green';
                    finalContainerNo = evaluated.candidates[0]?.container_no || rawOcr;
                  } else if (evaluated && evaluated.color === 'blue' && Array.isArray(evaluated.candidates) && evaluated.candidates.length > 0) {
                    matchStatus = evaluated.autoResolvedDuplicate ? 'duplicate_auto' : 'matched_green';
                    finalContainerNo = evaluated.candidates[0]?.container_no || rawOcr;
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

      // 🚚 เติม driver_name ให้กับแถวที่ยังไม่ได้ระบุคนขับ
      allContainers = allContainers.map(row => ({
        ...row,
        driver_name: (row.driver_name && row.driver_name !== '-' && row.driver_name !== 'ไม่ระบุคนขับ')
          ? row.driver_name
          : resolveDriver(row.truck_no, row.date_job_parsed || row.date_job || (row.sheet_id ? sheetEffectiveDateMap[row.sheet_id] : null))
      }));

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
        const jsItemId = containerItem.job_sheet_item_id || (containerItem.source_table === 'job_sheet_items' ? containerItem.db_id : null);
        const ocrRecId = containerItem.ocr_record_id || (containerItem.source_table === 'ocr_records' ? containerItem.db_id : null);

        // 2.1 อัปเดตใน job_sheet_items
        if (jsItemId) {
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
              .eq('id', jsItemId);
          } catch (e) {
            console.warn('job_sheet_items update err:', e);
          }
        }

        // 2.2 อัปเดตใน ocr_records ด้วย id ของ ocr_records โดยตรง
        if (ocrRecId) {
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
            .eq('id', ocrRecId);

          if (ocrErr) {
            console.error('ocr_records update error:', ocrErr);
            throw ocrErr;
          }
        } else if (containerItem.sheet_id) {
          // ซิงค์ ocr_records ที่ผูกกับ job_sheet_id เดียวกัน
          const updatePayload = {
            container_no: cleanCno,
            port: cleanPort,
            size: cleanSize,
            match_status: matchStatus
          };
          if (cleanTruck) updatePayload.truck_no = cleanTruck;

          await supabase
            .from('ocr_records')
            .update(updatePayload)
            .eq('job_sheet_id', containerItem.sheet_id)
            .eq('container_no', containerItem.container_no || cleanCno);
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
