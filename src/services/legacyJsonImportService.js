import { supabase } from '../supabaseClient';
import { jobSheetService } from './jobSheetService';
import { cleanBatchName, findBestMasterDbMatch, normalizeExcelDate } from '../utils/matchingLogic';
import { getOrCreateFolder, uploadImageToDrive, setFilePublicReadable } from '../utils/googleDriveApi';

/**
 * 📦 Legacy JSON Import Service
 * Handles parsing legacy manual_*.json and result_*.json files,
 * auto-matching with Master DB, detecting duplicate container occurrences in DB,
 * resolving drivers, and executing atomic batch insertion into Supabase (with optional Google Drive image sync).
 */

export async function parseLegacyJsonFiles(files, masterDbList = [], driversList = [], trucksList = [], opsList = []) {
  const fileArray = Array.from(files);
  
  const sheetsMap = new Map();
  const imageFilesMap = new Map();

  for (const file of fileArray) {
    const filename = file.name;
    const lowerName = filename.toLowerCase();

    if (lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
      const baseNameWithoutExt = filename.replace(/\.(png|jpe?g)$/i, '');
      imageFilesMap.set(baseNameWithoutExt, file);
      continue;
    }

    if (lowerName.endsWith('.json')) {
      if (lowerName.startsWith('lock_')) continue;

      const isManual = lowerName.startsWith('manual_');
      const isResult = lowerName.startsWith('result_');

      if (!isManual && !isResult) continue;

      const sheetKey = filename.replace(/^(manual_|result_)/i, '').replace(/\.json$/i, '');
      if (!sheetsMap.has(sheetKey)) {
        sheetsMap.set(sheetKey, { manualFile: null, resultFile: null, sheetKey, rawPath: file.webkitRelativePath || filename });
      }
      const item = sheetsMap.get(sheetKey);
      if (isManual) item.manualFile = file;
      if (isResult) item.resultFile = file;
    }
  }

  const masterContainerIndex = new Map();
  masterDbList.forEach(m => {
    if (!m?.container_no) return;
    const cleanKey = String(m.container_no).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanKey) return;
    let list = masterContainerIndex.get(cleanKey);
    if (!list) {
      list = [];
      masterContainerIndex.set(cleanKey, list);
    }
    list.push(m);
  });

  const parsedSheets = [];

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
    if (isoDate && opsList.length > 0) {
      const op = opsList.find(o => {
        if (!isTruckMatch(o.truck_no, truckNo)) return false;
        const sDate = o.start_date ? String(o.start_date).slice(0, 10) : null;
        const eDate = o.end_date ? String(o.end_date).slice(0, 10) : null;
        if (sDate && isoDate < sDate) return false;
        if (eDate && isoDate > eDate) return false;
        return true;
      });
      if (op?.driver_name && op.driver_name !== '-') return op.driver_name;
    }
    const activeOp = opsList.find(o => isTruckMatch(o.truck_no, truckNo) && (o.status === 'active' || !o.end_date));
    if (activeOp?.driver_name && activeOp.driver_name !== '-') return activeOp.driver_name;
    const truck = trucksList.find(t => isTruckMatch(t.truck_no, truckNo));
    if (truck?.assigned_driver_name && truck.assigned_driver_name !== '-') return truck.assigned_driver_name;
    const driverRec = driversList.find(d => isTruckMatch(d.assigned_truck_no, truckNo));
    if (driverRec?.driver_name && driverRec.driver_name !== '-') return driverRec.driver_name;
    return '-';
  };

  for (const [sheetKey, val] of sheetsMap.entries()) {
    const chosenFile = val.manualFile || val.resultFile;
    const isManual = Boolean(val.manualFile);

    try {
      const text = await chosenFile.text();
      const jsonData = JSON.parse(text);

      let truckNo = '';
      let rows = [];

      if (isManual) {
        const inputs = jsonData.inputs || {};
        for (const k in inputs) {
          if (k.endsWith('_sheet_truck_no')) {
            truckNo = String(inputs[k] || '').trim();
          }
        }
        for (let i = 1; i <= 30; i++) {
          let cno = '', port = '', size = '', timeout = '', timein = '';
          for (const k in inputs) {
            if (k.endsWith('_container_' + i)) cno = inputs[k];
            if (k.endsWith('_port_' + i)) port = inputs[k];
            if (k.endsWith('_size_' + i)) size = inputs[k];
            if (k.endsWith('_timeout_' + i)) timeout = inputs[k];
            if (k.endsWith('_timein_' + i)) timein = inputs[k];
          }
          if (cno && cno !== '-' && String(cno).trim() !== '') {
            rows.push({
              seq_no: i,
              container_no: String(cno).trim().toUpperCase(),
              port: String(port || '').trim().toUpperCase(),
              size: String(size || '').trim(),
              time_out: String(timeout || '').trim(),
              time_in: String(timein || '').trim()
            });
          }
        }
      } else {
        truckNo = String(jsonData.truck_no || '').trim();
        const rawRows = jsonData.rows || [];
        rawRows.forEach((r, idx) => {
          if (r && r.container_no && r.container_no !== '-' && r.container_no !== 'null') {
            let cno = String(r.container_no).trim().toUpperCase();
            let size = String(r.size || '').trim();
            if (!size && (cno.endsWith('20') || cno.endsWith('40') || cno.endsWith('45'))) {
              size = cno.slice(-2);
              cno = cno.slice(0, -2);
            }
            rows.push({
              seq_no: r.seq_no || (idx + 1),
              container_no: cno,
              port: String(r.port || '').trim().toUpperCase(),
              size: size || '40',
              time_out: String(r.time_out || '').trim(),
              time_in: String(r.time_in || '').trim()
            });
          }
        });
      }

      if (!truckNo) {
        const truckMatch = sheetKey.match(/_(\d{3})_/);
        if (truckMatch) truckNo = truckMatch[1];
      }

      let greenCount = 0;
      let redCount = 0;
      let multipleDbRecordsCount = 0;
      const batchCounts = {};
      let firstValidDate = null;

      const processedItems = rows.map((r, index) => {
        const cleanCno = String(r.container_no).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const allDbMatches = masterContainerIndex.get(cleanCno) || [];
        const hasMultipleDbRecords = allDbMatches.length > 1;

        if (hasMultipleDbRecords) {
          multipleDbRecordsCount++;
        }

        const bestMatch = findBestMasterDbMatch(r.container_no, r.port, truckNo, masterDbList);
        const isMatched = Boolean(bestMatch);

        if (isMatched) {
          greenCount++;
          const bName = bestMatch.batch_name || (bestMatch.source_file ? cleanBatchName(bestMatch.source_file) : null);
          if (bName) {
            batchCounts[bName] = (batchCounts[bName] || 0) + 1;
          }
          if (!firstValidDate && (bestMatch.date_job || bestMatch.date_job_parsed)) {
            firstValidDate = bestMatch.date_job_parsed || bestMatch.date_job;
          }
        } else {
          redCount++;
        }

        return {
          line_no: r.seq_no || (index + 1),
          container_no: r.container_no,
          raw_ocr_text: r.container_no,
          port: r.port || (bestMatch?.port || '-'),
          size: r.size || (bestMatch?.size || '-'),
          time_in: r.time_in || '-',
          time_out: r.time_out || '-',
          job_type: bestMatch?.dis_load || '-',
          date_job: bestMatch?.date_job || '-',
          date_job_parsed: bestMatch?.date_job_parsed || null,
          match_status: isMatched ? 'matched_green' : 'manual_red',
          ref_master_id: bestMatch?.id || null,
          hasMultipleDbRecords,
          allDbMatches,
          selectedDbMatch: bestMatch || (allDbMatches.length > 0 ? allDbMatches[0] : null)
        };
      });

      let detectedBatch = null;
      let maxCount = 0;
      for (const b in batchCounts) {
        if (batchCounts[b] > maxCount) {
          maxCount = batchCounts[b];
          detectedBatch = b;
        }
      }

      const fallbackBatch = cleanBatchName(val.rawPath || sheetKey);
      const finalBatchName = detectedBatch || fallbackBatch || 'General_Batch';

      const matchingImageFile = imageFilesMap.get(sheetKey) || null;
      const imageName = matchingImageFile ? matchingImageFile.name : `${sheetKey}.png`;

      const autoDriver = resolveDriver(truckNo, firstValidDate);

      parsedSheets.push({
        id: sheetKey,
        sheetKey,
        truck_no: truckNo || '-',
        driver_name: autoDriver,
        batch_name: finalBatchName,
        image_name: imageName,
        imageFile: matchingImageFile,
        source_type: isManual ? 'manual_verified' : 'raw_ocr_result',
        total_containers: processedItems.length,
        matched_count: greenCount,
        unmatched_count: redCount,
        multiple_db_records_count: multipleDbRecordsCount,
        has_multiple_db_records: multipleDbRecordsCount > 0,
        items: processedItems,
        first_date: firstValidDate || '-'
      });
    } catch (parseErr) {
      console.warn(`Could not parse JSON for ${sheetKey}:`, parseErr);
    }
  }

  parsedSheets.sort((a, b) => {
    const tCompare = String(a.truck_no).localeCompare(String(b.truck_no), undefined, { numeric: true });
    if (tCompare !== 0) return tCompare;
    return a.sheetKey.localeCompare(b.sheetKey);
  });

  return parsedSheets;
}

export async function executeLegacyJsonBatchImport(sheetsToImport = [], options = {}) {
  const { onProgress = () => {}, uploadToDrive = false, accessToken = null } = options;
  if (!sheetsToImport || sheetsToImport.length === 0) {
    return { success: true, importedSheets: 0, importedItems: 0 };
  }

  let totalSheetsImported = 0;
  let totalItemsImported = 0;
  let totalImagesUploaded = 0;
  const errors = [];

  for (let i = 0; i < sheetsToImport.length; i++) {
    const sheet = sheetsToImport[i];
    onProgress({
      current: i + 1,
      total: sheetsToImport.length,
      currentSheetId: sheet.id,
      percent: Math.round(((i + 1) / sheetsToImport.length) * 100)
    });

    try {
      let driveUrl = null;
      let driveId = null;

      // ☁️ Upload image to Google Drive if selected
      if (uploadToDrive && accessToken && sheet.imageFile) {
        try {
          const mainCompletedFolderId = await getOrCreateFolder(accessToken, 'Completed_Job_Sheets');
          const batchFolderId = await getOrCreateFolder(accessToken, sheet.batch_name || 'General_Batch', mainCompletedFolderId);
          const truckFolderId = await getOrCreateFolder(accessToken, `Truck_${sheet.truck_no || 'Unknown'}`, batchFolderId);

          const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const res = reader.result;
              const base64 = typeof res === 'string' ? res.split(',')[1] : '';
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(sheet.imageFile);
          });

          if (base64Data) {
            const driveRes = await uploadImageToDrive(accessToken, truckFolderId, base64Data, sheet.image_name || `${sheet.id}.jpg`);
            if (driveRes?.id) {
              driveId = driveRes.id;
              // ตั้งสิทธิ์ไฟล์ให้เปิดดูรูปและดึง Thumbnail ได้
              await setFilePublicReadable(accessToken, driveRes.id);
              driveUrl = `https://drive.google.com/file/d/${driveRes.id}/view`;
              totalImagesUploaded++;
            }
          }
        } catch (driveErr) {
          console.warn(`Could not upload image for ${sheet.id} to Google Drive:`, driveErr);
        }
      }

      const matchingResults = (sheet.items || []).map((item, idx) => ({
        container_no: item.container_no,
        originalText: item.raw_ocr_text || item.container_no,
        port: (item.port && item.port !== '-') ? item.port : null,
        size: (item.size && item.size !== '-') ? item.size : null,
        jobType: (item.job_type && item.job_type !== '-') ? item.job_type : null,
        job_type: (item.job_type && item.job_type !== '-') ? item.job_type : null,
        date_job: (item.date_job && item.date_job !== '-') ? item.date_job : null,
        matchColor: item.match_status === 'matched_green' ? 'green' : 'red',
        selectedDbId: item.ref_master_id || null,
        displayIndex: item.line_no || (idx + 1)
      }));

      const res = await jobSheetService.completeJobSheet({
        sheetId: sheet.id,
        batchName: sheet.batch_name,
        truckNo: sheet.truck_no,
        driverName: (sheet.driver_name && sheet.driver_name !== '-') ? sheet.driver_name : null,
        imageUrl: driveUrl,
        imageName: sheet.image_name,
        driveFileId: driveId,
        matchingResults,
        isCompletedEdit: true
      });

      if (!res.success) {
        throw new Error(res.error?.message || res.error || 'Failed to save job sheet');
      }

      totalSheetsImported++;
      totalItemsImported += matchingResults.length;
    } catch (err) {
      console.error(`Error importing sheet ${sheet.id}:`, err);
      errors.push({ sheetId: sheet.id, error: err.message || String(err) });
    }
  }

  return {
    success: errors.length === 0,
    importedSheets: totalSheetsImported,
    importedItems: totalItemsImported,
    errors
  };
}
