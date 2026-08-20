import React, { useState, useRef, useEffect, useMemo } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import { supabase } from '../supabaseClient';
import { jobSheetService } from '../services/jobSheetService';
import { 
  findTopContainerMatches, 
  evaluateMatchStatus, 
  determineMajorityBatch, 
  cleanBatchName,
  padTo25Rows 
} from '../utils/matchingLogic';
import { 
  executeGeminiOCR, 
  compressImageToBase64, 
  getFilterCSS 
} from '../services/geminiService';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { 
  getOrCreateFolder, 
  moveFileInDrive, 
  listPendingFilesInDrive, 
  fetchImageBlobFromDrive, 
  uploadImageToPendingDrive, 
  deleteFileFromDrive,
  setFilePublicReadable
} from '../utils/googleDriveApi';
import { calculateFileHash } from '../utils/hashUtil';
import { getFolderHandle, clearFolderHandle } from '../utils/folderCache';
import { getAllPendingFromDB, savePendingToDB, deletePendingFromDB, clearAllPendingFromDB } from '../utils/pendingDb';
import InspectorTopBar from '../components/inspector/InspectorTopBar';
import ImagePreviewPanel from '../components/inspector/ImagePreviewPanel';
import InspectorTable from '../components/inspector/InspectorTable';
import PendingQueuePanel from '../components/scanner/PendingQueuePanel';

const getDirectHighResUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http://localhost') || url.includes('/assets/')) {
    return url;
  }
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1600`;
  }
  return url;
};

const cleanModelName = (name) => {
  if (!name) return '';
  return name.replace(/\s*\((?:Auto Saved|☁️ Cache)\)/gi, '').trim();
};

// ดึงเบอร์รถเบื้องต้นจากชื่อไฟล์หรือโฟลเดอร์
const extractTruckNoFromPath = (pathOrName) => {
  if (!pathOrName) return null;
  const match = pathOrName.match(/(?:truck|เบอร์รถ|รถ|คันที่|ALBUM_|\s)?([0-9]{3,4})/i);
  return match ? match[1] : null;
};

function ScannerViewContent({ setActiveTab, editingSheet, setEditingSheet }) {
  const initialReinspect = editingSheet;

  const [images, setImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(() => {
    if (initialReinspect) {
      const match = (initialReinspect.image_url || '').match(/\/d\/([a-zA-Z0-9_-]+)/) || (initialReinspect.image_url || '').match(/id=([a-zA-Z0-9_-]+)/);
      const driveFileId = match ? match[1] : null;
      const sheetId = initialReinspect.id || `reinspect_${Date.now()}`;
      const directUrl = getDirectHighResUrl(initialReinspect.image_url);

      return {
        id: sheetId,
        file_hash: sheetId,
        drive_file_id: driveFileId,
        name: initialReinspect.truck_no && initialReinspect.truck_no !== '-' 
          ? `ใบงานรถ ${initialReinspect.truck_no} (${initialReinspect.batch_name || ''})`
          : (initialReinspect.batch_name || 'Completed_Job_Sheet'),
        url: directUrl,
        image_url: initialReinspect.image_url,
        truckNo: initialReinspect.truck_no,
        truckGuess: initialReinspect.truck_no,
        batchGuess: initialReinspect.batch_name,
        isCompletedEdit: true,
        hasOcr: true
      };
    }
    return null;
  });

  const [processedImageUrl, setProcessedImageUrl] = useState(() => {
    if (initialReinspect) {
      return getDirectHighResUrl(initialReinspect.image_url);
    }
    return null;
  });
  const [processedBase64, setProcessedBase64] = useState(null);
  
  const [imageFilters, setImageFilters] = useState({});
  const [pendingTruckFilter, setPendingTruckFilter] = useState('ALL');
  const [pendingSearchTerm, setPendingSearchTerm] = useState('');
  const [ocrCache, setOcrCache] = useState(() => {
    if (initialReinspect) {
      const sheetId = initialReinspect.id || `reinspect_${Date.now()}`;
      const rows = (initialReinspect.containers || []).map((c, i) => ({
        original_seq: i,
        raw_ocr_no: c.container_no,
        container_no: c.container_no,
        port: c.port !== '-' ? c.port : '',
        size: c.size !== '-' ? c.size : '',
        isManuallyEdited: true,
        isConfirmedCustom: false,
        isYellowMatch: false,
        isBlueMatch: false,
        isConfirmedMatch: !c.is_red
      }));

      return {
        [sheetId]: {
          data: {
            truck_no: initialReinspect.truck_no,
            rows: rows,
            saved_at: initialReinspect.saved_at
          },
          model: 'Completed (Edit Mode)'
        }
      };
    }
    return {};
  });

  const [isScanning, setIsScanning] = useState(false);
  const [currentDbRecords, setCurrentDbRecords] = useState([]);
  const [completedOcrRecords, setCompletedOcrRecords] = useState([]);
  const [editableRows, setEditableRows] = useState(() => {
    if (initialReinspect) {
      return padTo25Rows((initialReinspect.containers || []).map((c, i) => ({
        original_seq: i,
        raw_ocr_no: c.container_no,
        container_no: c.container_no,
        port: c.port !== '-' ? c.port : '',
        size: c.size !== '-' ? c.size : '',
        isManuallyEdited: true,
        isConfirmedCustom: false,
        isYellowMatch: false,
        isBlueMatch: false,
        isConfirmedMatch: !c.is_red,
        isCancelled: false
      })));
    }
    return padTo25Rows([]);
  });

  const [scanError, setScanError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState("");
  const [batchScanProgress, setBatchScanProgress] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [pendingGoogleAction, setPendingGoogleAction] = useState(null);
  
  const [lastFolderHandle, setLastFolderHandle] = useState(null);
  const [googleAccessToken, setGoogleAccessToken] = useState(() => localStorage.getItem('gdrive_access_token') || null);

  useEffect(() => {
    try { sessionStorage.removeItem('reinspect_sheet'); } catch(e) {}
  }, []);

  const [customTruckNumbers, setCustomTruckNumbers] = useState(() => {
    if (initialReinspect && initialReinspect.truck_no && initialReinspect.truck_no !== '-') {
      const sheetId = initialReinspect.id || `reinspect_${Date.now()}`;
      return {
        [sheetId]: initialReinspect.truck_no
      };
    }
    return {};
  });

  // อัปเดตเมื่อ props editingSheet เปลี่ยนแปลง
  useEffect(() => {
    if (editingSheet) {
      const match = (editingSheet.image_url || '').match(/\/d\/([a-zA-Z0-9_-]+)/) || (editingSheet.image_url || '').match(/id=([a-zA-Z0-9_-]+)/);
      const driveFileId = match ? match[1] : null;
      const sheetId = editingSheet.id || `reinspect_${Date.now()}`;
      const directUrl = getDirectHighResUrl(editingSheet.image_url);

      const imgObj = {
        id: sheetId,
        file_hash: sheetId,
        drive_file_id: driveFileId,
        name: editingSheet.truck_no && editingSheet.truck_no !== '-' 
          ? `ใบงานรถ ${editingSheet.truck_no} (${editingSheet.batch_name || ''})`
          : (editingSheet.batch_name || 'Completed_Job_Sheet'),
        url: directUrl,
        image_url: editingSheet.image_url,
        truckNo: editingSheet.truck_no,
        truckGuess: editingSheet.truck_no,
        batchGuess: editingSheet.batch_name,
        isCompletedEdit: true,
        hasOcr: true
      };

      const rows = (editingSheet.containers || []).map((c, i) => ({
        original_seq: i,
        raw_ocr_no: c.container_no,
        container_no: c.container_no,
        port: c.port !== '-' ? c.port : '',
        size: c.size !== '-' ? c.size : '',
        isManuallyEdited: true,
        isConfirmedCustom: false,
        isYellowMatch: false,
        isBlueMatch: false,
        isConfirmedMatch: !c.is_red
      }));

      setOcrCache(prev => ({
        ...prev,
        [sheetId]: {
          data: {
            truck_no: editingSheet.truck_no,
            rows: rows,
            saved_at: editingSheet.saved_at
          },
          model: 'Completed (Edit Mode)'
        }
      }));

      if (editingSheet.truck_no && editingSheet.truck_no !== '-') {
        setCustomTruckNumbers(prev => ({
          ...prev,
          [sheetId]: editingSheet.truck_no
        }));
      }

      setSelectedImage(imgObj);
      setEditableRows(rows);
      setProcessedImageUrl(directUrl);
    }
  }, [editingSheet]);

  const [scanningRowId, setScanningRowId] = useState(null);
  const [scanStatusDetail, setScanStatusDetail] = useState("");
  const [scanLogs, setScanLogs] = useState([]);
  const [showLogDrawer, setShowLogDrawer] = useState(false);

  const appendLog = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString('th-TH');
    setScanLogs(prev => [...prev.slice(-99), { time, msg, type }]);
    setScanStatusDetail(msg);
  };

  const folderInputRef = useRef(null);
  const cloudFolderInputRef = useRef(null);
  const cloudFileInputRef = useRef(null);
  const GEMINI_API_KEY = localStorage.getItem('JWD_GEMINI_API_KEY') || import.meta.env.VITE_GEMINI_API_KEY || '';

  // โหลดคิวใบงานอัตโนมัติเมื่อเปิดเว็บ (ดึงจาก Supabase Cloud ก่อน เพื่อให้ทุกคนตรวจงานได้โดยไม่ต้องล็อกอิน Google)
  useEffect(() => {
    const savedToken = localStorage.getItem('gdrive_access_token');
    const expiresAt = localStorage.getItem('gdrive_token_expires_at');
    let token = null;
    if (savedToken && expiresAt && Number(expiresAt) > Date.now()) {
      setGoogleAccessToken(savedToken);
      token = savedToken;
    }
    fetchPendingFromCloud(token, true);
    getFolderHandle().then(handle => {
      if (handle) setLastFolderHandle(handle);
    }).catch(e => console.error("Could not load folder handle:", e));
  }, []);

  // ดึงคิวใบงาน Pending ทั้งหมดจาก Supabase / Google Drive Cloud
  const fetchPendingFromCloud = async (token = googleAccessToken, isSilent = true) => {
    setIsDriveSyncing(true);
    appendLog("☁️ กำลังเชื่อมต่อ Cloud และดึงคิวใบงานล่าสุด...", "info");
    try {
      // 1. ดึงจาก Supabase ก่อน (พนักงานทุกคนเปิดดูได้ทันที 100% โดยไม่ต้องล็อกอิน Google)
      const { data: cloudPending, error: supaErr } = await supabase
        .from('ocr_cache')
        .select('id, model_used, image_name, image_url, ocr_data, created_at')
        .neq('model_used', 'deleted')
        .neq('model_used', 'completed')
        .order('created_at', { ascending: false });

      if (supaErr) throw supaErr;

      if (cloudPending && cloudPending.length > 0) {
        const cloudItems = cloudPending.map(row => {
          const ocrData = row.ocr_data || {};
          const fileId = ocrData.drive_file_id || row.id;
          const imageUrl = ocrData.image_url || (ocrData.image_base64 ? `data:image/jpeg;base64,${ocrData.image_base64}` : `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`);
          const thumbUrl = ocrData.thumbnail_url || (ocrData.thumbnail_base64 ? `data:image/jpeg;base64,${ocrData.thumbnail_base64}` : (ocrData.image_url || `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`));
          
          const folderName = ocrData.folder_name || (ocrData.relative_path && ocrData.relative_path.includes('/') ? ocrData.relative_path.split('/').slice(0, -1).join('/') : '');
          
          return {
            id: row.id,
            drive_file_id: ocrData.drive_file_id || null,
            file_hash: row.id,
            name: row.image_name,
            relativePath: ocrData.relative_path || row.image_name,
            folderName: folderName,
            truckGuess: null,
            batchGuess: ocrData.batch_guess || null,
            isCloud: true,
            url: imageUrl,
            thumbnailLink: thumbUrl,
            webViewLink: ocrData.webViewLink || null,
            created_at: row.created_at
          };
        });

        setImages(cloudItems);

        // ใส่ข้อมูล OCR Cache ลง State
        const cacheMap = {};
        cloudPending.forEach(row => {
          if (row.ocr_data?.rows) {
            cacheMap[row.id] = {
              data: row.ocr_data,
              model: row.model_used
            };
          }
        });
        setOcrCache(prev => ({ ...prev, ...cacheMap }));
        appendLog(`☁️ ดึงคิวใบงานจาก Cloud สำเร็จ ${cloudItems.length} ใบ (พร้อมตรวจทันที)`, "success");
        setIsDriveSyncing(false);
        if (!isSilent) {
          alert(`☁️ ซิงค์ใบงานจาก Cloud สำเร็จ ${cloudItems.length} ใบเรียบร้อยครับ!`);
        }
        return;
      }

      // 2. ถ้าใน Supabase ยังไม่มี และมี Token Google Drive ให้ดึงจาก Google Drive มาบันทึกลง Supabase
      if (token) {
        const { files } = await listPendingFilesInDrive(token);
        if (files && files.length > 0) {
          const cloudItems = [];
          for (const f of files) {
            const truckGuess = extractTruckNoFromPath(f.name);
            await setFilePublicReadable(token, f.id);
            const thumbUrl = f.thumbnailLink || `https://drive.google.com/thumbnail?id=${f.id}&sz=w400`;
            const highResUrl = f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+/, '=s1600') : `https://drive.google.com/thumbnail?id=${f.id}&sz=w1600`;
            
            const rawHash = (f.name + f.id).padEnd(32, '0').replace(/[^a-f0-9]/gi, 'a').toLowerCase();
            const validUUID = `${rawHash.slice(0, 8)}-${rawHash.slice(8, 12)}-${rawHash.slice(12, 16)}-${rawHash.slice(16, 20)}-${rawHash.slice(20, 32)}`;

            const itemObj = {
              id: validUUID,
              drive_file_id: f.id,
              file_hash: validUUID,
              name: f.name,
              relativePath: f.name,
              folderName: 'Pending_Job_Sheets',
              truckGuess: truckGuess,
              batchGuess: null,
              isCloud: true,
              url: highResUrl,
              thumbnailLink: thumbUrl,
              webViewLink: f.webViewLink,
              created_at: f.createdTime || new Date().toISOString()
            };
            cloudItems.push(itemObj);

            await supabase.from('ocr_cache').upsert({
              id: validUUID,
              image_name: f.name,
              ocr_data: {
                is_pending: true,
                drive_file_id: f.id,
                image_url: highResUrl,
                thumbnail_url: thumbUrl,
                webViewLink: f.webViewLink,
                truck_guess: truckGuess,
                batch_guess: null,
                created_at: f.createdTime || new Date().toISOString()
              },
              model_used: 'pending'
            }, { onConflict: 'id' });
          }

          setImages(cloudItems);
          await fetchOcrCacheForImages(cloudItems);
          appendLog(`☁️ ซิงค์ใบงานจาก Google Drive สำเร็จ ${cloudItems.length} ใบ`, "success");
          setIsDriveSyncing(false);
          if (!isSilent) {
            alert(`☁️ ซิงค์ใบงานจาก Cloud สำเร็จ ${cloudItems.length} ใบเรียบร้อยครับ!`);
          }
          return;
        }
      }

      // 3. ถ้าไม่มีใบงานค้างใน Cloud -> ตั้งค่าคิวงานให้ว่าง
      appendLog("☁️ ไม่พบใบงานค้างใน Cloud (คิวงานว่าง)", "info");
      setImages([]);
      if (!isSilent) {
        alert("☁️ ไม่พบใบงานใหม่ใน Cloud (คิวงานว่างอยู่ครับ)");
      }
    } catch (err) {
      console.error("fetchPendingFromCloud error:", err);
      appendLog(`❌ ซิงค์ข้อมูลล้มเหลว: ${err.message}`, "error");
      setImages([]);
      if (!isSilent) {
        alert("❌ ไม่สามารถดึงข้อมูลจาก Cloud ได้: " + err.message);
      }
    } finally {
      setIsDriveSyncing(false);
    }
  };

  // ดึงแคช OCR จาก Supabase สำหรับรายการภาพที่กำหนด (ผูกกับ file_hash เสมอ)
  const fetchOcrCacheForImages = async (imgList) => {
    if (!imgList || imgList.length === 0) return;
    try {
      const hashes = imgList.map(img => img.file_hash).filter(Boolean);
      if (hashes.length === 0) return;
      
      const { data, error } = await supabase
        .from('ocr_cache')
        .select('id, model_used, ocr_data, image_name')
        .in('id', hashes);
      if (error) throw error;
      
      if (data && data.length > 0) {
        setOcrCache(prev => {
          const newCache = { ...prev };
          data.forEach(row => {
            if (row.ocr_data && row.model_used !== 'deleted') {
              const imgObj = imgList.find(i => i.file_hash === row.id);
              if (imgObj) {
                newCache[imgObj.file_hash] = { data: row.ocr_data, model: `${row.model_used} (☁️ Cache)` };
                newCache[imgObj.id] = { data: row.ocr_data, model: `${row.model_used} (☁️ Cache)` };
              }
            }
          });
          return newCache;
        });
      }
    } catch (err) {
      console.error("fetchOcrCache error:", err);
    }
  };

  // อัปโหลดไฟล์เพิ่มเข้ามาในคิวอย่างถาวร พร้อมระบบป้องกันไฟล์ซ้ำ
  const processLoadedFiles = async (imageFiles) => {
    const existingItems = await getAllPendingFromDB();
    const existingHashMap = new Set(existingItems.map(item => item.file_hash));
    
    const newItemsToSave = [];
    let duplicateCount = 0;

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const hash = await calculateFileHash(file);
      
      if (existingHashMap.has(hash)) {
        duplicateCount++;
        continue;
      }

      const relativePath = file._customPath || file.webkitRelativePath || file.name;
      const truckGuess = extractTruckNoFromPath(relativePath);
      const parts = relativePath.split('/');
      const folderName = parts.length > 1 ? parts[parts.length - 2] : '';
      const batchGuess = cleanBatchName(folderName);

      const item = {
        file_hash: hash,
        name: file.name,
        relativePath: relativePath,
        folderName: folderName,
        truckGuess: truckGuess,
        batchGuess: batchGuess !== 'General_Batch' ? batchGuess : null,
        file: file,
        created_at: new Date().toISOString()
      };

      newItemsToSave.push(item);
      existingHashMap.add(hash);
    }

    if (newItemsToSave.length > 0) {
      await savePendingToDB(newItemsToSave);
    }

    const allPending = await getAllPendingFromDB();
    setImages(allPending);
    setSelectedImage(null);
    setProcessedImageUrl(null);
    setImageFilters({});
    setScanError(null);

    await fetchOcrCacheForImages(allPending);

    if (duplicateCount > 0 && newItemsToSave.length > 0) {
      alert(`📥 เพิ่มใบงานใหม่ ${newItemsToSave.length} ใบ\n⚠️ ข้ามไฟล์ซ้ำ ${duplicateCount} ใบ`);
    } else if (duplicateCount > 0 && newItemsToSave.length === 0) {
      alert(`⚠️ ใบงานทั้ง ${duplicateCount} ไฟล์นี้มีอยู่ในคิว Pending แล้ว (ข้ามไฟล์ซ้ำทั้งหมด)`);
    } else if (newItemsToSave.length > 0) {
      alert(`📥 เพิ่มใบงานใหม่ ${newItemsToSave.length} ใบเรียบร้อยแล้ว`);
    }
  };

  const handleFolderInputChange = async (e) => {
    const allFiles = Array.from(e.target.files);
    const imageFiles = allFiles.filter(f => 
      f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(f.name)
    );
    if (imageFiles.length === 0) {
      alert("ไม่พบไฟล์รูปภาพในโฟลเดอร์ที่เลือกครับ");
      return;
    }
    await processLoadedFiles(imageFiles);
  };

  // ดึงข้อมูล Master DB จาก Supabase
  const fetchMasterDatabase = async () => {
    try {
      const { data, error } = await supabase
        .from('container_records')
        .select('*');
        
      if (error) throw error;
      setCurrentDbRecords(data || []);

      const { data: ocrData, error: ocrError } = await supabase
        .from('ocr_records')
        .select('container_no')
        .neq('match_status', 'deleted');
        
      if (!ocrError && ocrData) {
        setCompletedOcrRecords(ocrData.map(r => String(r.container_no || '').trim().toUpperCase()).filter(Boolean));
      }
    } catch (err) {
      console.error("Failed to load master db:", err);
    }
  };

  useEffect(() => {
    fetchMasterDatabase();
  }, []);

  const handleFilterChange = (e) => {
    const newFilter = e.target.value;
    if (selectedImage) {
      setImageFilters(prev => ({
        ...prev,
        [selectedImage.file_hash]: newFilter,
        [selectedImage.id]: newFilter
      }));
    }
  };

  const currentFilter = selectedImage ? (imageFilters[selectedImage.file_hash] || imageFilters[selectedImage.id] || 'magic') : 'magic';
  const currentOcr = selectedImage ? (ocrCache[selectedImage.file_hash] || ocrCache[selectedImage.id]) : null;
  const ocrResult = currentOcr ? currentOcr.data : null;
  const activeModel = currentOcr ? cleanModelName(currentOcr.model) : null;

  const currentTruckNo = selectedImage ? (
    customTruckNumbers[selectedImage.file_hash] || 
    localStorage.getItem(`truck_${selectedImage.file_hash}`) ||
    ocrResult?.truck_no || 
    selectedImage.truckGuess || 
    ''
  ) : '';

  const handleTruckNoChange = (newVal) => {
    if (!selectedImage) return;
    setCustomTruckNumbers(prev => ({
      ...prev,
      [selectedImage.file_hash]: newVal
    }));
    localStorage.setItem(`truck_${selectedImage.file_hash}`, newVal);
  };

  const isAutoSaving = useRef(false);
  const prevSavedDraftRef = useRef('');

  // ฟังก์ชันดึงข้อมูลตู้จาก Master DB
  const enrichRowsFromMasterDb = (rows, truckNo) => {
    if (!rows || !currentDbRecords || currentDbRecords.length === 0) return rows;
    
    const targetTruckNo = (truckNo || '').trim();
    let truckDbList = currentDbRecords;
    if (targetTruckNo) {
      const filtered = currentDbRecords.filter(r => String(r.truck_no || '').trim() === targetTruckNo);
      if (filtered.length > 0) truckDbList = filtered;
    }

    return rows.map((row) => {
      if (!row || (!row.container_no && !row.port && !row.size)) return row;

      const rawOcr = row.raw_ocr_no || row.autoCorrectedFrom || row.container_no;
      const candidates = findTopContainerMatches(rawOcr, truckDbList, 3);
      const status = evaluateMatchStatus({ ...row, container_no: rawOcr }, candidates);

      if (status.color === 'blue' && candidates.length > 0) {
        const topCand = candidates[0];
        const bestSibling = status?.matchedSibling || topCand?.siblings?.[0] || topCand?.record || {};
        return {
          ...row,
          raw_ocr_no: rawOcr,
          container_no: topCand.container_no,
          selectedDbId: row.selectedDbId || bestSibling.id,
          port: bestSibling.port || '',
          size: bestSibling.size ? String(bestSibling.size) : '',
          job_type: bestSibling.dis_load ? (String(bestSibling.dis_load).toLowerCase().includes('dis') ? 'Dis' : String(bestSibling.dis_load).toLowerCase().includes('load') ? 'Load' : null) : null,
          isBlueMatch: true,
          isYellowMatch: false,
          isDuplicate: status.isDuplicate,
          autoResolvedDuplicate: status.autoResolvedDuplicate,
          autoCorrectedFrom: rawOcr !== topCand.container_no ? rawOcr : null
        };
      }

      if (status.color === 'yellow') {
        return {
          ...row,
          raw_ocr_no: rawOcr,
          container_no: row.isConfirmedMatch ? row.container_no : rawOcr,
          selectedDbId: row.isConfirmedMatch ? row.selectedDbId : null,
          isYellowMatch: !row.isConfirmedMatch,
          isBlueMatch: false,
          isDuplicate: status.isDuplicate,
          autoCorrectedFrom: null
        };
      }
      
      if (status.color === 'green' && candidates.length > 0) {
        const topCand = candidates[0];
        const bestSibling = status?.matchedSibling || topCand?.siblings?.[0] || topCand?.record || {};
        return {
          ...row,
          raw_ocr_no: rawOcr,
          container_no: topCand.container_no,
          selectedDbId: row.selectedDbId || bestSibling.id,
          port: bestSibling.port || '',
          size: bestSibling.size ? String(bestSibling.size) : '',
          job_type: bestSibling.dis_load ? (String(bestSibling.dis_load).toLowerCase().includes('dis') ? 'Dis' : String(bestSibling.dis_load).toLowerCase().includes('load') ? 'Load' : null) : null,
          isBlueMatch: false,
          isYellowMatch: false,
          isDuplicate: status.isDuplicate,
          autoResolvedDuplicate: status.autoResolvedDuplicate,
          autoCorrectedFrom: null
        };
      }

      if (row.selectedDbId) {
        const selectedDbItem = truckDbList.find(d => d.id === row.selectedDbId);
        if (selectedDbItem) {
          return {
            ...row,
            raw_ocr_no: rawOcr,
            port: selectedDbItem.port || '',
            size: selectedDbItem.size ? String(selectedDbItem.size) : '',
            job_type: selectedDbItem.dis_load ? (String(selectedDbItem.dis_load).toLowerCase().includes('dis') ? 'Dis' : String(selectedDbItem.dis_load).toLowerCase().includes('load') ? 'Load' : null) : null
          };
        }
      }

      return {
        ...row,
        raw_ocr_no: rawOcr
      };
    });
  };

  // ตั้งค่า editableRows เมื่อ ocrResult เปลี่ยน
  useEffect(() => {
    if (selectedImage?.isCompletedEdit) return;
    if (ocrResult && ocrResult.rows) {
      if (isAutoSaving.current) {
        isAutoSaving.current = false;
        return;
      }
      
      const draft = localStorage.getItem(`draft_${selectedImage?.file_hash}`) || localStorage.getItem(`draft_${selectedImage?.id}`);
      if (draft) {
        try {
          const parsedDraft = JSON.parse(draft);
          const enriched = enrichRowsFromMasterDb(parsedDraft, currentTruckNo);
          setEditableRows(enriched);
          prevSavedDraftRef.current = JSON.stringify(enriched);
          return;
        } catch(e) {}
      }
      const rawRows = JSON.parse(JSON.stringify(ocrResult.rows));
      const enriched = enrichRowsFromMasterDb(rawRows, currentTruckNo);
      setEditableRows(enriched);
      prevSavedDraftRef.current = JSON.stringify(enriched);
    } else {
      setEditableRows(null);
      prevSavedDraftRef.current = '';
    }
  }, [ocrResult, selectedImage, currentDbRecords, currentTruckNo]);

  // Auto-save draft on edit
  useEffect(() => {
    if (selectedImage && editableRows && ocrResult) {
      const currentRowsStr = JSON.stringify(editableRows);
      
      localStorage.setItem(`draft_${selectedImage.file_hash}`, currentRowsStr);
      
      if (prevSavedDraftRef.current === currentRowsStr) return;

      const timeoutId = setTimeout(async () => {
        try {
          const existingCached = ocrCache[selectedImage.file_hash]?.data || ocrResult || {};
          const correctedOcrData = {
            ...existingCached,
            ...ocrResult,
            is_pending: true,
            file_hash: selectedImage.file_hash,
            drive_file_id: selectedImage.drive_file_id || existingCached.drive_file_id || null,
            folder_name: selectedImage.folderName || existingCached.folder_name || null,
            relative_path: selectedImage.relativePath || existingCached.relative_path || selectedImage.name,
            image_url: selectedImage.url || existingCached.image_url || null,
            thumbnail_url: selectedImage.thumbnailLink || existingCached.thumbnail_url || null,
            webViewLink: selectedImage.webViewLink || existingCached.webViewLink || null,
            truck_no: currentTruckNo || ocrResult.truck_no,
            rows: editableRows
          };
          
          isAutoSaving.current = true;
          prevSavedDraftRef.current = currentRowsStr;
          const baseModel = activeModel || 'gemini-3.5-flash';
          
          await supabase.from('ocr_cache').upsert({
            id: selectedImage.file_hash,
            image_name: selectedImage.name,
            ocr_data: correctedOcrData,
            model_used: baseModel
          }, { onConflict: 'id' });
          
          setOcrCache(prev => ({
            ...prev,
            [selectedImage.file_hash]: { data: correctedOcrData, model: baseModel },
            [selectedImage.id]: { data: correctedOcrData, model: baseModel }
          }));
        } catch (e) {
          console.error("Auto-save to server failed:", e);
        }
      }, 1500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [editableRows, selectedImage, currentTruckNo]);

  // Preprocess image on canvas with selected filter
  useEffect(() => {
    if (!selectedImage || !selectedImage.url) return;
    
    if (currentFilter === 'normal') {
      setProcessedImageUrl(selectedImage.url);
      return;
    }

    let isCancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (isCancelled) return;
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const filterCSS = getFilterCSS(currentFilter);
        if (filterCSS && filterCSS !== 'none') {
          ctx.filter = filterCSS;
        }
        ctx.drawImage(img, 0, 0);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
        setProcessedImageUrl(dataUrl);
        setProcessedBase64(dataUrl.split(',')[1]);
      } catch (e) {
        console.warn("Canvas filter fallback to direct image url:", e);
        setProcessedImageUrl(selectedImage.url);
      }
    };
    img.onerror = () => {
      if (isCancelled) return;
      setProcessedImageUrl(selectedImage.url);
    };
    img.src = selectedImage.url;

    return () => {
      isCancelled = true;
    };
  }, [selectedImage, currentFilter]);

  // ดาวน์โหลดรูปที่แต่งฟิลเตอร์แล้วลงเครื่อง
  const handleDownloadFilteredImage = () => {
    if (!selectedImage) return;
    const link = document.createElement('a');
    link.href = processedImageUrl || selectedImage.url;
    const ext = selectedImage.name.includes('.') ? selectedImage.name.substring(selectedImage.name.lastIndexOf('.')) : '.jpg';
    const baseName = selectedImage.name.replace(/\.[^/.]+$/, '');
    link.download = `${baseName}_${currentFilter}${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // จับคู่ข้อมูลตู้สำหรับรูปที่เลือก (Inspector View) - แสดงผลคงที่ 25 แถวเสมอ
  const matchingResults = useMemo(() => {
    const targetTruckNo = (currentTruckNo || '').trim();
    let truckDbList = currentDbRecords;
    if (targetTruckNo) {
      truckDbList = currentDbRecords.filter(r => String(r.truck_no || '').trim() === targetTruckNo);
      if (truckDbList.length === 0) truckDbList = currentDbRecords;
    }

    const rows25 = padTo25Rows(editableRows || []);

    return rows25.map((row, idx) => {
       const isEmpty = !row.container_no && !row.port && !row.size && !row.raw_ocr_no;
       
       if (isEmpty) {
         return {
           ...row,
           original_seq: idx,
           seq_no: idx + 1,
           matchColor: 'empty',
           candidates: [],
           isEmpty: true,
           isCancelled: false
         };
       }

       if (row.isCancelled) {
         return {
           ...row,
           original_seq: idx,
           seq_no: idx + 1,
           matchColor: 'cancelled',
           candidates: [],
           isEmpty: false,
           isCancelled: true
         };
       }

       const currentInput = (row.container_no || '').trim();
       const rawOcr = (row.raw_ocr_no || row.autoCorrectedFrom || currentInput).trim();
       const searchTarget = (row.isConfirmedMatch || row.isManuallyEdited || row.selectedDbId || !rawOcr)
         ? (currentInput || rawOcr)
         : (rawOcr || currentInput);
       const candidates = findTopContainerMatches(searchTarget, truckDbList, 3);
       
       let finalDbId = row.selectedDbId || null;
       let isJobAlreadyDone = false;
       let rowColor = 'red';

       if (row.isConfirmedCustom) {
         rowColor = 'red';
       } else if (row.isConfirmedMatch) {
         if (row.container_no && completedOcrRecords.includes(String(row.container_no).trim().toUpperCase())) {
           rowColor = 'yellow';
           isJobAlreadyDone = true;
         } else {
           rowColor = 'green';
         }
       } else if (row.isManuallyEdited) {
         const status = evaluateMatchStatus({ ...row, container_no: currentInput }, candidates);
         rowColor = status.color;
       } else {
         const status = evaluateMatchStatus({ ...row, container_no: rawOcr }, candidates);
         if (row.isBlueMatch || status.color === 'blue') {
           rowColor = 'blue';
         } else if (row.isYellowMatch || status.color === 'yellow') {
           rowColor = 'yellow';
         } else if (status.color === 'green') {
           rowColor = 'green';
         } else {
           rowColor = 'red';
         }
       }

       if (!row.isManuallyEdited && !row.isConfirmedCustom && (rowColor === 'green' || rowColor === 'blue') && candidates && candidates.length > 0) {
         const topCandidate = candidates[0];
         const dbId = topCandidate?.siblings?.[0]?.id || topCandidate?.record?.id;
         if (dbId) {
           if (completedOcrRecords.includes(dbId)) {
              isJobAlreadyDone = true;
              rowColor = 'yellow'; 
           } else {
              if (!finalDbId) finalDbId = dbId;
           }
         }
       }
       
       candidates.forEach(cand => {
          if (cand.siblings && Array.isArray(cand.siblings)) {
            cand.siblings = cand.siblings.map(sib => ({
              ...sib,
              isCompleted: completedOcrRecords.includes(String(sib?.container_no || '').trim().toUpperCase())
            }));
          } else {
            cand.siblings = cand.record ? [cand.record] : [];
          }
       });

       return {
         ...row,
         original_seq: idx,
         seq_no: idx + 1,
         matchColor: rowColor,
         candidates: candidates,
         selectedDbId: finalDbId,
         isJobAlreadyDone: isJobAlreadyDone,
         isEmpty: false,
         isCancelled: false
       };
    });
  }, [editableRows, currentDbRecords, completedOcrRecords, currentTruckNo, selectedImage]);

  // คำนวณ Majority Batch สำหรับรูปที่เลือก
  const detectedMajorityBatch = useMemo(() => {
    return determineMajorityBatch(matchingResults, selectedImage?.batchGuess);
  }, [matchingResults, selectedImage]);

  // คำนวณสถิติภาพรวมของทุกรูปใน Pending Queue Table
  const imageQueueStats = useMemo(() => {
    return images.map(img => {
      const isCurrentSelected = selectedImage && (selectedImage.file_hash === img.file_hash || selectedImage.id === img.id);
      const cached = ocrCache[img.file_hash] || ocrCache[img.id];
      const hasOcr = Boolean(cached && cached.data);
      
      let rows = [];
      if (isCurrentSelected && editableRows) {
        rows = editableRows;
      } else {
        const draftStr = localStorage.getItem(`draft_${img.file_hash}`);
        if (draftStr) {
          try { rows = JSON.parse(draftStr); } catch (e) { rows = cached?.data?.rows || []; }
        } else {
          rows = cached?.data?.rows || [];
        }
      }

      const truckNo = (isCurrentSelected && currentTruckNo) 
        ? currentTruckNo 
        : (customTruckNumbers[img.file_hash] || localStorage.getItem(`truck_${img.file_hash}`) || cached?.data?.truck_no || '-');
      
      let green = 0, blue = 0, yellow = 0, red = 0;
      let targetTruckRecords = currentDbRecords;
      if (truckNo && truckNo !== '-') {
        targetTruckRecords = currentDbRecords.filter(r => String(r.truck_no || '').trim() === String(truckNo).trim());
        if (targetTruckRecords.length === 0) targetTruckRecords = currentDbRecords;
      }

      let calculatedBatch = img.batchGuess || null;

      if (hasOcr && rows && rows.length > 0) {
        const batchCounts = {};
        rows.forEach(r => {
          if (r.isCancelled || (!r.container_no && !r.port && !r.size && !r.raw_ocr_no)) return;
          
          const currentInput = (r.container_no || '').trim();
          const rawOcr = (r.raw_ocr_no || r.autoCorrectedFrom || currentInput).trim();
          const searchTarget = (r.isConfirmedMatch || r.isManuallyEdited || r.selectedDbId || !rawOcr)
            ? (currentInput || rawOcr)
            : (rawOcr || currentInput);
          const candidates = findTopContainerMatches(searchTarget, targetTruckRecords, 3);
          
          let rowColor = 'red';
          if (r.isConfirmedCustom) {
            rowColor = 'red';
          } else if (r.isConfirmedMatch) {
            if (r.container_no && completedOcrRecords.includes(String(r.container_no).trim().toUpperCase())) {
              rowColor = 'yellow';
            } else {
              rowColor = 'green';
            }
          } else if (r.isManuallyEdited) {
            const status = evaluateMatchStatus({ ...r, container_no: currentInput }, candidates);
            rowColor = status.color;
          } else {
            const status = evaluateMatchStatus({ ...r, container_no: rawOcr }, candidates);
            if (r.isBlueMatch || status.color === 'blue') rowColor = 'blue';
            else if (r.isYellowMatch || status.color === 'yellow') rowColor = 'yellow';
            else if (status.color === 'green') rowColor = 'green';
            else rowColor = 'red';
          }

          if (rowColor === 'green') green++;
          else if (rowColor === 'blue') blue++;
          else if (rowColor === 'yellow') yellow++;
          else red++;

          if (candidates.length > 0) {
            const topCand = candidates[0];
            const rawSource = topCand.record?.source_file || topCand.record?.batch_name;
            if (rawSource) {
              const cleaned = cleanBatchName(rawSource);
              batchCounts[cleaned] = (batchCounts[cleaned] || 0) + 1;
            }
          }
        });

        let maxCount = 0;
        for (const b in batchCounts) {
          if (batchCounts[b] > maxCount) {
            maxCount = batchCounts[b];
            calculatedBatch = b;
          }
        }
      }

      const totalContainers = green + blue + yellow + red;
      const isReady = hasOcr && totalContainers > 0 && red === 0 && yellow === 0;

      return {
        ...img,
        hasOcr,
        truckNo,
        totalContainers,
        green,
        blue,
        yellow,
        red,
        isReady,
        majorityBatch: calculatedBatch,
        modelUsed: cleanModelName(cached?.model)
      };
    });
  }, [images, ocrCache, currentDbRecords, customTruckNumbers, selectedImage, editableRows, currentTruckNo, completedOcrRecords]);

  // ฟิลเตอร์เบอร์รถและคำค้นหาสำหรับหน้า Pending
  const availablePendingTrucks = useMemo(() => {
    const set = new Set();
    (imageQueueStats || []).forEach(item => {
      const truck = String(item?.truckNo || item?.truckGuess || item?.truck_no || '').trim();
      if (truck && truck !== '-') set.add(truck);
    });
    return Array.from(set).sort();
  }, [imageQueueStats]);

  const filteredPendingImages = useMemo(() => {
    return (imageQueueStats || []).filter(item => {
      const truck = String(item?.truckNo || item?.truckGuess || item?.truck_no || '').trim();
      if (pendingTruckFilter !== 'ALL' && truck !== pendingTruckFilter) {
        return false;
      }
      if (pendingSearchTerm.trim()) {
        const q = pendingSearchTerm.trim().toLowerCase();
        const matchesName = item?.name && String(item.name).toLowerCase().includes(q);
        const matchesTruck = truck && truck.toLowerCase().includes(q);
        const matchesBatch = item?.majorityBatch && String(item.majorityBatch).toLowerCase().includes(q);
        if (!matchesName && !matchesTruck && !matchesBatch) return false;
      }
      return true;
    });
  }, [imageQueueStats, pendingTruckFilter, pendingSearchTerm]);

  const handleToggleCancelRow = (idx) => {
    setEditableRows(prev => {
      const base = padTo25Rows(prev || []);
      base[idx] = {
        ...base[idx],
        isCancelled: !base[idx].isCancelled
      };
      return base;
    });
  };

  const handleContainerKeyDown = (idx, e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentText = (editableRows?.[idx]?.container_no || '').trim().toUpperCase();
      if (!currentText) return;

      setEditableRows(prev => {
        const base = padTo25Rows(prev || []);
        base[idx] = {
          ...base[idx],
          container_no: currentText,
          selectedDbId: null,
          isManuallyEdited: true,
          isConfirmedCustom: true,
          isConfirmedMatch: false,
          isYellowMatch: false,
          isBlueMatch: false
        };
        return base;
      });

      if (idx < 24) {
        setTimeout(() => {
          const nextInput = document.getElementById(`container_input_${idx + 1}`);
          if (nextInput) {
            nextInput.focus();
            nextInput.select();
          }
        }, 30);
      }
    }
  };

  const handleContainerEdit = (idx, newText) => {
    setEditableRows(prev => {
      const base = padTo25Rows(prev || []);
      base[idx] = {
        ...base[idx],
        container_no: newText.toUpperCase(),
        selectedDbId: null,
        isManuallyEdited: true,
        isConfirmedCustom: false,
        isCancelled: false
      };
      return base;
    });
  };

  const handleApplyCandidate = (originalSeq, candidate, sibling = null) => {
    if (!candidate) return;
    const bestSibling = sibling || candidate.siblings?.[0] || candidate.record || {};
    setEditableRows(prev => {
      const base = padTo25Rows(prev || []);
      base[originalSeq] = {
        ...base[originalSeq],
        container_no: candidate.container_no,
        selectedDbId: bestSibling.id || null,
        isManuallyEdited: false,
        isConfirmedMatch: true,
        isConfirmedCustom: false,
        isYellowMatch: false,
        isBlueMatch: false,
        isCancelled: false,
        port: bestSibling.port || base[originalSeq].port || '',
        size: bestSibling.size ? String(bestSibling.size) : (base[originalSeq].size || ''),
        job_type: bestSibling.dis_load 
          ? (String(bestSibling.dis_load).toLowerCase().includes('dis') ? 'Dis' : String(bestSibling.dis_load).toLowerCase().includes('load') ? 'Load' : base[originalSeq].job_type)
          : base[originalSeq].job_type,
        date_job: bestSibling.date_job || base[originalSeq].date_job || ''
      };
      return base;
    });
  };

  const handleApplyAllRecommendations = () => {
    setEditableRows(prev => {
      const next = [...prev];
      matchingResults.forEach(res => {
        if ((res.matchColor === 'yellow' || res.matchColor === 'blue') && res.candidates && res.candidates.length > 0) {
          const topCand = res.candidates[0];
          const bestSibling = topCand?.siblings?.[0] || topCand?.record || {};
          next[res.original_seq].container_no = topCand.container_no;
          next[res.original_seq].selectedDbId = bestSibling.id;
          next[res.original_seq].isYellowMatch = false;
          next[res.original_seq].isBlueMatch = false;
          next[res.original_seq].isConfirmedMatch = true;
          if (bestSibling.port) next[res.original_seq].port = bestSibling.port;
          if (bestSibling.size) next[res.original_seq].size = String(bestSibling.size);
          if (bestSibling.dis_load) {
            const dl = String(bestSibling.dis_load).trim().toLowerCase();
            next[res.original_seq].job_type = dl.includes('dis') ? 'Dis' : dl.includes('load') ? 'Load' : next[res.original_seq].job_type;
          }
          if (bestSibling.date_job) next[res.original_seq].date_job = bestSibling.date_job;
        }
      });
      return next;
    });
  };

  // OCR สแกนเดี่ยว (รูปปัจจุบันหรือแถวที่เลือก) พร้อมระบบสแกนซ้ำล้างดราฟต์เดิม 100%
  const scanOCR = async (targetImgObj = selectedImage, base64Input = null, isForceRescan = false) => {
    if (!targetImgObj) return;
    if (!GEMINI_API_KEY) {
      alert("ยังไม่ได้ตั้งค่า Gemini API Key! กรุณาไปตั้งค่าที่เมนู Owner Settings ก่อนครับ");
      return;
    }
    
    setIsScanning(true);
    setScanError(null);
    appendLog(`🚀 เริ่มต้นเตรียมข้อมูลสำหรับ "${targetImgObj.name}"...`, 'info');

    const targetId = targetImgObj.file_hash || targetImgObj.id;
    if (isForceRescan) {
      localStorage.removeItem(`draft_${targetId}`);
      localStorage.removeItem(`draft_${targetImgObj.id}`);
      localStorage.removeItem(`draft_${targetImgObj.file_hash}`);
      prevSavedDraftRef.current = '';
    }

    try {
      let base64Data = base64Input;
      
      // 1. ถ้ามี Blob หรือ File ในเครื่อง
      const fileOrBlob = targetImgObj.file || targetImgObj.blob;
      if (!base64Data && fileOrBlob) {
        try {
          base64Data = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result;
              if (typeof res === 'string') resolve(res.split(',')[1]);
              else resolve(null);
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(fileOrBlob);
          });
        } catch (e) {}
      }

      // 2. ถ้ามี URL รูปภาพ ลองประมวลผลผ่าน Canvas + Filter
      if (!base64Data && targetImgObj.url) {
        appendLog(`🖼️ กำลังปรับแต่งและย่อขนาดภาพ...`, 'info');
        try {
          base64Data = await new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              try {
                const maxDim = 2048;
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
                const selectedFilter = imageFilters[targetImgObj.file_hash] || imageFilters[targetImgObj.id] || 'magic';
                const filterCSS = getFilterCSS(selectedFilter);
                if (filterCSS && filterCSS !== 'none') {
                  ctx.filter = filterCSS;
                }
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
              } catch (err) {
                resolve(null);
              }
            };
            img.onerror = () => resolve(null);
            img.src = targetImgObj.url;
          });
        } catch (e) {}
      }

      // 3. Fallback: ถ้า Canvas ติด CORS ให้ fetch blob ตรง
      if (!base64Data && targetImgObj.url && !targetImgObj.url.startsWith('data:')) {
        try {
          const fetchRes = await fetch(targetImgObj.url);
          if (fetchRes.ok) {
            const blob = await fetchRes.blob();
            base64Data = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const resStr = reader.result;
                if (typeof resStr === 'string') resolve(resStr.split(',')[1]);
                else resolve(null);
              };
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            });
          }
        } catch (e) {}
      }

      // 4. Fallback: ดาวน์โหลดตรงจาก Google Drive API
      if (!base64Data) {
        const token = googleAccessToken || localStorage.getItem('gdrive_access_token');
        const fId = targetImgObj.drive_file_id || targetImgObj.id;
        if (token && fId) {
          try {
            appendLog(`☁️ กำลังดึงไฟล์ภาพจาก Google Drive เพื่อส่งตรวจ AI...`, 'info');
            const blob = await fetchImageBlobFromDrive(token, fId);
            if (blob) {
              base64Data = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const resStr = reader.result;
                  if (typeof resStr === 'string') resolve(resStr.split(',')[1]);
                  else resolve(null);
                };
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });
            }
          } catch (e) {
            console.warn("Fetch cloud blob for OCR error:", e);
          }
        }
      }

      if (!base64Data) {
        throw new Error("ไม่สามารถอ่านข้อมูลไฟล์รูปภาพได้ กรุณาตรวจสอบไฟล์รูปภาพอีกครั้ง");
      }

      appendLog(`📡 พร้อมส่งคำขอ AI OCR...`, 'info');

      // เรียกใช้ Gemini Service ที่แยกออกมาอย่างเป็นระเบียบ
      const { parsed, usedModel } = await executeGeminiOCR({
        base64Data,
        apiKey: GEMINI_API_KEY,
        onLog: appendLog
      });

      // แทนค่าสีน้ำเงิน (High Similarity >= 85%) และดึงข้อมูล Port/Size จาก Master DB อัตโนมัติทันที
      if (parsed.rows && currentDbRecords.length > 0) {
        parsed.rows = enrichRowsFromMasterDb(parsed.rows, parsed.truck_no || currentTruckNo);
      }

      appendLog(`🎉 ถอดรหัสตารางสำเร็จ (${parsed.rows?.length || 0} แถว, เบอร์รถ: ${parsed.truck_no || '-'}) ด้วย ${usedModel}`, 'success');

      const fullOcrData = {
        ...parsed,
        is_pending: true,
        model_name: usedModel,
        folder_name: targetImgObj.folderName || null,
        relative_path: targetImgObj.relativePath || targetImgObj.name,
        drive_file_id: targetImgObj.drive_file_id || targetId,
        image_url: targetImgObj.url || (targetImgObj.drive_file_id ? `https://lh3.googleusercontent.com/d/${targetImgObj.drive_file_id}` : `https://lh3.googleusercontent.com/d/${targetId}`),
        thumbnail_url: targetImgObj.thumbnailLink || targetImgObj.url || `https://drive.google.com/thumbnail?id=${targetId}&sz=w400`,
        webViewLink: targetImgObj.webViewLink || `https://drive.google.com/file/d/${targetId}/view`,
        truck_guess: targetImgObj.truckGuess || parsed.truck_no,
        batch_guess: targetImgObj.batchGuess
      };

      if (parsed.rows) {
        const enriched = enrichRowsFromMasterDb(parsed.rows, parsed.truck_no || currentTruckNo);
        setEditableRows(enriched);
        prevSavedDraftRef.current = JSON.stringify(enriched);
        localStorage.setItem(`draft_${targetId}`, JSON.stringify(enriched));
      }
      if (parsed.truck_no) {
        handleTruckNoChange(parsed.truck_no);
      }

      setOcrCache(prev => ({
        ...prev,
        [targetId]: { data: fullOcrData, model: usedModel },
        [targetImgObj.id]: { data: fullOcrData, model: usedModel }
      }));
      
      await supabase.from('ocr_cache').upsert({
        id: targetId,
        image_name: targetImgObj.name,
        ocr_data: fullOcrData,
        model_used: usedModel
      }, { onConflict: 'id' });

      alert(`🎉 สแกนใหม่สำเร็จ! ถอดรหัสได้ ${parsed.rows?.length || 0} แถว (เบอร์รถ: ${parsed.truck_no || '-'})`);

    } catch (err) {
      console.error("Scan OCR error:", err);
      setScanError(err.message);
      appendLog(`❌ การสแกนล้มเหลว: ${err.message}`, 'error');
      alert("❌ เกิดข้อผิดพลาดในการสแกน: " + err.message);
    } finally {
      setIsScanning(false);
    }
  };

  // Batch Scan All Unscanned Pending Images
  const handleBatchScanAll = async () => {
    if (!GEMINI_API_KEY) {
      alert("ยังไม่ได้ตั้งค่า Gemini API Key! ไปตั้งค่าที่เมนู Owner Settings ก่อนครับ");
      return;
    }

    const unscanned = imageQueueStats.filter(i => !i.hasOcr);
    if (unscanned.length === 0) {
      alert("ใบงานทั้งหมดในคิวได้รับการสแกน OCR แล้วครับ");
      return;
    }

    setBatchScanProgress({ current: 0, total: unscanned.length, filename: unscanned[0].name });

    for (let i = 0; i < unscanned.length; i++) {
      const imgObj = unscanned[i];
      setBatchScanProgress({ current: i + 1, total: unscanned.length, filename: imgObj.name });
      
      try {
        await scanOCR(imgObj);
      } catch (err) {
        console.error(`Error scanning ${imgObj.name}:`, err);
      }
    }

    setBatchScanProgress(null);
    alert(`🎉 สแกน OCR อัตโนมัติเสร็จสิ้น ${unscanned.length} ใบงาน`);
  };

  // สแกนเฉพาะแถวในตาราง โดยไม่สลับหน้า (In-place Row Scan)
  const handleRowScan = async (imgObj) => {
    setScanningRowId(imgObj.file_hash || imgObj.id);
    try {
      await scanOCR(imgObj);
    } catch (err) {
      console.error("Row scan error:", err);
    } finally {
      setScanningRowId(null);
    }
  };

  // Google OAuth Login Trigger
  const handleGoogleAuthTrigger = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      const token = tokenResponse.access_token;
      setGoogleAccessToken(token);
      localStorage.setItem('gdrive_access_token', token);
      localStorage.setItem('gdrive_token_expires_at', String(Date.now() + (tokenResponse.expires_in || 3500) * 1000));
      appendLog("🔑 เชื่อมต่อ Google Drive สำเร็จ", "success");

      const action = pendingGoogleAction;
      setPendingGoogleAction(null);

      if (action?.type === 'sync') {
        await fetchPendingFromCloud(token, false);
      } else if (action?.type === 'save') {
        await executeSave(token);
      } else if (action?.type === 'upload_folder') {
        setTimeout(() => {
          if (cloudFolderInputRef.current) cloudFolderInputRef.current.click();
        }, 150);
      } else if (action?.type === 'upload_files') {
        setTimeout(() => {
          if (cloudFileInputRef.current) cloudFileInputRef.current.click();
        }, 150);
      } else if (action?.type === 'upload_pending_files' && action.files) {
        await uploadFilesToCloudPending(action.files, token);
      }
    },
    onError: (err) => {
      console.error("Google Login Error:", err);
      alert("ไม่สามารถเข้าสู่ระบบ Google Drive ได้: " + (err.error_description || err.error));
      setIsSaving(false);
      setIsDriveSyncing(false);
      setPendingGoogleAction(null);
    },
    scope: 'https://www.googleapis.com/auth/drive.file'
  });

  // บันทึกใบงานปัจจุบัน (Save to Completed)
  const executeSave = async (accessToken) => {
    setIsSaving(true);
    try {
      setSaveProgress("กำลังเตรียมข้อมูลบันทึก...");
      const finalBatchName = detectedMajorityBatch || 'General_Batch';
      const truckNo = currentTruckNo || ocrResult?.truck_no || selectedImage?.truckGuess || 'Unknown_Truck';
      let imageUrl = selectedImage?.url || selectedImage?.webViewLink || (selectedImage?.drive_file_id ? `https://lh3.googleusercontent.com/d/${selectedImage.drive_file_id}` : null);

      if (accessToken) {
        try {
          setSaveProgress("เตรียมโฟลเดอร์ Google Drive...");
          const mainCompletedFolderId = await getOrCreateFolder(accessToken, 'Completed_Job_Sheets');
          const batchFolderId = await getOrCreateFolder(accessToken, finalBatchName, mainCompletedFolderId);
          const truckFolderId = await getOrCreateFolder(accessToken, `Truck_${truckNo}`, batchFolderId);

          if (selectedImage.isCloud && selectedImage.drive_file_id) {
            setSaveProgress("กำลังย้ายไฟล์ภาพบน Google Drive...");
            const pendingFolderId = await getOrCreateFolder(accessToken, 'Pending_Job_Sheets');
            await moveFileInDrive(accessToken, selectedImage.drive_file_id, truckFolderId, pendingFolderId);
            imageUrl = selectedImage.webViewLink || `https://drive.google.com/file/d/${selectedImage.drive_file_id}/view`;
          }
        } catch (driveErr) {
          console.warn("Drive move warning (proceeding with db save):", driveErr);
        }
      }
      
      setSaveProgress("กำลังบันทึกข้อมูลใบงานและเลขตู้ลงฐานข้อมูล...");
      
      const targetId = selectedImage.file_hash || selectedImage.id || selectedImage.drive_file_id;
      const saveResult = await jobSheetService.completeJobSheet({
        sheetId: targetId,
        fileHash: selectedImage.file_hash,
        batchName: finalBatchName,
        truckNo: truckNo,
        imageUrl: imageUrl,
        imageName: selectedImage.name || selectedImage.image_name || null,
        driveFileId: selectedImage.drive_file_id || null,
        matchingResults: matchingResults,
        ocrResult: ocrResult,
        isCompletedEdit: Boolean(selectedImage.isCompletedEdit)
      });

      if (!saveResult.success && saveResult.error) {
        throw new Error(saveResult.error.message || saveResult.error);
      }

      setSaveProgress("เสร็จสิ้น!");
      alert(`✅ บันทึกใบงานเบอร์รถ ${truckNo} (รอบ ${finalBatchName}) สำเร็จเรียบร้อย!`);
      
      if (selectedImage?.file_hash) {
        await deletePendingFromDB(selectedImage.file_hash);
        localStorage.removeItem(`draft_${selectedImage.file_hash}`);
        localStorage.removeItem(`draft_${selectedImage.id}`);
        localStorage.removeItem(`truck_${selectedImage.file_hash}`);
      }
      setImages(prev => prev.filter(i => i.id !== selectedImage.id && i.file_hash !== selectedImage.file_hash && i.drive_file_id !== selectedImage.drive_file_id));
      setSelectedImage(null);
      fetchMasterDatabase();
      if (selectedImage.isCompletedEdit && setActiveTab) {
        setActiveTab('jobsheet-completed');
      }

    } catch (err) {
      console.error("Save Error:", err);
      alert("❌ เกิดข้อผิดพลาดในการบันทึก: " + err.message);
    } finally {
      setIsSaving(false);
      setSaveProgress("");
    }
  };

  const handleStartSave = async () => {
    // ⚠️ ตรวจสอบว่ายังมีแถวที่เป็นสีส้ม/เหลืองที่ยังไม่ได้เลือก Candidate หรือไม่
    const unresolvedYellowRows = (matchingResults || []).filter(
      r => !r.isEmpty && !r.isCancelled && (r.matchColor === 'yellow' || r.matchColor === 'orange')
    );

    if (unresolvedYellowRows.length > 0) {
      const rowNumbers = unresolvedYellowRows.map(r => r.displayIndex || r.index || '').filter(Boolean).join(', ');
      const confirmMsg = `⚠️ มีรายการตู้แถวที่ [ ${rowNumbers} ] เป็นสีส้ม (ยังมี Candidate ที่ยังไม่ได้กดยืนยันเลือก)\n\nกรุณาตรวจทานและกดเลือก Candidate ให้ครบถ้วนก่อนบันทึก\n\nต้องการบันทึกต่อไปทันทีหรือไม่? (หากบันทึกต่อ แถวที่ไม่ได้เลือก Candidate จะถูกบันทึกเป็นตู้แดง/ไม่พบในใบวางบิล)`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    executeSave(googleAccessToken);
  };

  const handleSelectImage = async (img) => {
    const fileId = img.drive_file_id || img.id;
    const directUrl = img.url || (img.thumbnailLink ? img.thumbnailLink.replace(/=s\d+/, '=s1600') : `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`);
    const updatedImg = { ...img, url: directUrl };
    setSelectedImage(updatedImg);
    setProcessedImageUrl(directUrl);
    setScanError(null);
  };

  // อัปโหลดไฟล์รูปภาพตรงขึ้น Google Drive โฟลเดอร์ Pending_Job_Sheets พร้อมบันทึกลง Supabase
  const uploadFilesToCloudPending = async (imageFiles, passedToken = null) => {
    let token = passedToken || googleAccessToken || localStorage.getItem('gdrive_access_token');
    const expiresAt = localStorage.getItem('gdrive_token_expires_at');
    const isExpired = !expiresAt || Number(expiresAt) <= Date.now();

    if (!token || isExpired) {
      alert("⚠️ จำเป็นต้องเชื่อมต่อ Google Drive ก่อนอัปโหลดไฟล์\nกรุณากดปุ่ม '🔑 เชื่อมต่อ Google Drive' หรือกดปุ่ม '☁️ อัปโหลดขึ้น Cloud' เพื่อเข้าสู่ระบบ Google ครับ");
      return;
    }

    setUploadProgress({ current: 0, total: imageFiles.length, filename: imageFiles[0]?.name });
    appendLog(`☁️ เริ่มต้นประมวลผลและอัปโหลดใบงานขึ้น Cloud ${imageFiles.length} รูป...`, 'info');
    
    let successCount = 0;
    const alreadyPendingFiles = [];
    const alreadyCompletedFiles = [];

    const existingCacheMap = {};
    try {
      const { data: existingRows } = await supabase
        .from('ocr_cache')
        .select('id, image_name, model_used');
      if (existingRows) {
        existingRows.forEach(r => {
          existingCacheMap[r.id] = r;
        });
      }
    } catch (e) {
      console.warn("Pre-fetch existing ocr_cache error:", e);
    }

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      setUploadProgress({ current: i + 1, total: imageFiles.length, filename: file.name });
      try {
        const fileHash = await calculateFileHash(file);
        
        const existing = existingCacheMap[fileHash];
        if (existing) {
          if (existing.model_used === 'completed') {
            alreadyCompletedFiles.push(file.name);
            appendLog(`ℹ️ ข้าม ${file.name} (ใบงานนี้เคยบันทึก Completed แล้ว)`, 'warn');
            continue;
          } else if (existing.model_used !== 'deleted') {
            alreadyPendingFiles.push(file.name);
            appendLog(`ℹ️ ข้าม ${file.name} (มีอยู่ในคิว Pending แล้ว)`, 'warn');
            continue;
          }
        }

        const relativePath = file._customPath || file.webkitRelativePath || file.name;
        const parts = relativePath.split('/');
        const folderName = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
        const batchGuess = cleanBatchName(parts.length > 1 ? parts[parts.length - 2] : '');

        const highResDataUrl = await compressImageToBase64(file, 1600, 0.85);
        const miniThumbDataUrl = await compressImageToBase64(file, 160, 0.70);

        let uploadRes = null;
        if (token) {
          try {
            uploadRes = await uploadImageToPendingDrive(token, highResDataUrl.split(',')[1], file.name);
            appendLog(`☁️ ส่งภาพ ${file.name} เข้า Google Drive (Pending_Job_Sheets) สำเร็จ`, 'success');
          } catch (dErr) {
            console.warn("Drive upload warning:", dErr);
            appendLog(`⚠️ ส่งภาพ ${file.name} เข้า Google Drive ไม่สำเร็จ: ${dErr.message}`, 'warn');
          }
        }

        const { error: supaErr } = await supabase.from('ocr_cache').upsert({
          id: fileHash,
          image_name: file.name,
          ocr_data: {
            is_pending: true,
            file_hash: fileHash,
            drive_file_id: uploadRes?.id || null,
            folder_name: folderName,
            relative_path: relativePath,
            image_url: highResDataUrl,
            thumbnail_url: miniThumbDataUrl,
            webViewLink: uploadRes?.webViewLink || null,
            batch_guess: batchGuess !== 'General_Batch' ? batchGuess : null,
            created_at: new Date().toISOString()
          },
          model_used: 'pending'
        }, { onConflict: 'id' });

        if (supaErr) {
          console.error("Supabase upsert error:", supaErr);
          throw supaErr;
        }

        existingCacheMap[fileHash] = { id: fileHash, image_name: file.name, model_used: 'pending' };
        successCount++;
      } catch (err) {
        console.error(`Upload error for ${file.name}:`, err);
        appendLog(`❌ อัปโหลด ${file.name} ล้มเหลว: ${err.message}`, 'error');
      }
    }

    setUploadProgress(null);
    appendLog(`🎉 ประมวลผลเสร็จสิ้น (สำเร็จ ${successCount} ใบ, ซ้ำ ${alreadyPendingFiles.length + alreadyCompletedFiles.length} ใบ)`, 'success');
    
    const msgParts = [];
    if (successCount > 0) {
      msgParts.push(`☁️ อัปโหลดใบงานใหม่ขึ้น Cloud สำเร็จ ${successCount} ใบ`);
    } else if (alreadyPendingFiles.length > 0 || alreadyCompletedFiles.length > 0) {
      msgParts.push(`ℹ️ ไม่พบใบงานใหม่สำหรับอัปโหลด`);
    }

    if (alreadyPendingFiles.length > 0) {
      const displayNames = alreadyPendingFiles.slice(0, 4).join('\n  • ');
      const moreCount = alreadyPendingFiles.length > 4 ? `\n  ...และอีก ${alreadyPendingFiles.length - 4} ใบ` : '';
      msgParts.push(`\n⏳ ข้าม ${alreadyPendingFiles.length} ใบ (มีอยู่ในคิว Pending แล้ว):\n  • ${displayNames}${moreCount}`);
    }

    if (alreadyCompletedFiles.length > 0) {
      const displayNames = alreadyCompletedFiles.slice(0, 4).join('\n  • ');
      const moreCount = alreadyCompletedFiles.length > 4 ? `\n  ...และอีก ${alreadyCompletedFiles.length - 4} ใบ` : '';
      msgParts.push(`\n✅ ข้าม ${alreadyCompletedFiles.length} ใบ (เคยบันทึก Completed แล้ว):\n  • ${displayNames}${moreCount}`);
    }

    alert(msgParts.join('\n'));
    await fetchPendingFromCloud(token, true);
  };

  const handleCloudFolderUpload = async (e) => {
    const allFiles = Array.from(e.target.files);
    const imageFiles = allFiles.filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(f.name));
    if (imageFiles.length === 0) {
      alert("ไม่พบไฟล์รูปภาพในโฟลเดอร์ที่เลือกครับ");
      return;
    }
    await uploadFilesToCloudPending(imageFiles);
  };

  // ล้างคิวใบงาน Pending ทั้งหมด
  const handleClearQueue = async () => {
    if (!window.confirm(`⚠️ ต้องการล้างรายการใบงานในคิว Pending ทั้งหมด (${images.length} ใบ) ออกจากระบบ Cloud และ Google Drive ใช่หรือไม่?`)) return;

    appendLog("🗑️ กำลังล้างรายการใบงานในคิวทั้งหมด...", "info");
    const token = googleAccessToken || localStorage.getItem('gdrive_access_token');
    
    try {
      await supabase
        .from('ocr_cache')
        .update({ model_used: 'deleted', ocr_data: null })
        .eq('model_used', 'pending');

      const currentIds = images.map(i => i.file_hash || i.id).filter(Boolean);
      if (currentIds.length > 0) {
        await supabase
          .from('ocr_cache')
          .update({ model_used: 'deleted', ocr_data: null })
          .in('id', currentIds);
      }
    } catch (supaErr) {
      console.error("Supabase clear queue error:", supaErr);
    }

    if (token) {
      try {
        const { files } = await listPendingFilesInDrive(token);
        if (files && files.length > 0) {
          for (const f of files) {
            try {
              await deleteFileFromDrive(token, f.id);
            } catch (e) {
              console.error("Delete drive file error:", e);
            }
          }
        }
      } catch (dErr) {
        console.error("List and delete drive pending error:", dErr);
      }
    }

    await clearAllPendingFromDB();
    await clearFolderHandle().catch(() => {});
    setLastFolderHandle(null);
    setImages([]);
    setOcrCache({});
    setSelectedImage(null);
    appendLog("🗑️ ล้างคิวใบงานทั้งหมดสำเร็จเรียบร้อย", "success");
    alert("🗑️ ล้างคิวใบงาน Pending ทั้งหมดบน Cloud และในเครื่องเรียบร้อยแล้วครับ");
  };

  // ลบใบงานเดี่ยวออกจากคิว Pending
  const handleDeleteSinglePending = async (e, img) => {
    e.stopPropagation();
    if (!window.confirm(`ต้องการลบใบงาน "${img.name}" ออกจากคิว Pending และ Cloud ใช่หรือไม่?`)) return;

    const token = googleAccessToken || localStorage.getItem('gdrive_access_token');
    const targetId = img.file_hash || img.id;

    if (targetId) {
      try {
        await supabase
          .from('ocr_cache')
          .update({ model_used: 'deleted', ocr_data: null })
          .eq('id', targetId);
      } catch (sErr) {
        console.error("Supabase delete single error:", sErr);
      }
    }

    if (token) {
      try {
        if (img.drive_file_id) {
          await deleteFileFromDrive(token, img.drive_file_id);
        } else {
          const { files } = await listPendingFilesInDrive(token);
          const match = files?.find(f => f.name === img.name);
          if (match) {
            await deleteFileFromDrive(token, match.id);
          }
        }
      } catch (err) {
        console.error("Delete single drive file error:", err);
      }
    }

    if (img.file_hash) {
      await deletePendingFromDB(img.file_hash);
      localStorage.removeItem(`draft_${img.file_hash}`);
      localStorage.removeItem(`draft_${img.id}`);
      localStorage.removeItem(`truck_${img.file_hash}`);
    }

    setImages(prev => prev.filter(i => i.id !== img.id && i.file_hash !== img.file_hash));
    if (selectedImage && (selectedImage.id === img.id || selectedImage.file_hash === img.file_hash)) {
      setSelectedImage(null);
    }
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1440px', margin: '0 auto', animation: 'fadeIn 0.3s ease' }}>
      
      {/* ─────────────────────────────────────────────────────────────
          VIEW A: หน้ารวมคิวใบงานค้าง (Pending Queue Panel)
         ───────────────────────────────────────────────────────────── */}
      {!selectedImage ? (
        <PendingQueuePanel
          images={images}
          filteredPendingImages={filteredPendingImages}
          imageQueueStats={imageQueueStats}
          availablePendingTrucks={availablePendingTrucks}
          pendingTruckFilter={pendingTruckFilter}
          setPendingTruckFilter={setPendingTruckFilter}
          pendingSearchTerm={pendingSearchTerm}
          setPendingSearchTerm={setPendingSearchTerm}
          isScanning={isScanning}
          scanLogs={scanLogs}
          showLogDrawer={showLogDrawer}
          setShowLogDrawer={setShowLogDrawer}
          setScanLogs={setScanLogs}
          scanStatusDetail={scanStatusDetail}
          uploadProgress={uploadProgress}
          batchScanProgress={batchScanProgress}
          googleAccessToken={googleAccessToken}
          folderInputRef={folderInputRef}
          cloudFolderInputRef={cloudFolderInputRef}
          handleFolderInputChange={handleFolderInputChange}
          handleCloudFolderUpload={handleCloudFolderUpload}
          handleGoogleAuthTrigger={handleGoogleAuthTrigger}
          setPendingGoogleAction={setPendingGoogleAction}
          setGoogleAccessToken={setGoogleAccessToken}
          handleBatchScanAll={handleBatchScanAll}
          handleClearQueue={handleClearQueue}
          handleSelectImage={handleSelectImage}
          handleRowScan={handleRowScan}
          handleDeleteSinglePending={handleDeleteSinglePending}
          imageFilters={imageFilters}
          scanningRowId={scanningRowId}
        />
      ) : (
        /* ─────────────────────────────────────────────────────────────
           VIEW B: หน้ารายละเอียดตรวจเทียบ (Modularized Inspector Components)
           ───────────────────────────────────────────────────────────── */
        <ErrorBoundary onReset={() => setSelectedImage(null)}>
          <div>
            <InspectorTopBar
              selectedImage={selectedImage}
              ocrResult={ocrResult}
              isScanning={isScanning}
              scanStatusDetail={scanStatusDetail}
              isSaving={isSaving}
              saveProgress={saveProgress}
              onBack={() => {
                if (selectedImage?.isCompletedEdit) {
                  if (setEditingSheet) setEditingSheet(null);
                  setSelectedImage(null);
                  if (setActiveTab) setActiveTab('jobsheet-completed');
                } else {
                  if (setEditingSheet) setEditingSheet(null);
                  setSelectedImage(null);
                }
              }}
              onRescan={() => scanOCR(selectedImage, processedBase64, true)}
              onStartScan={() => scanOCR(selectedImage, processedBase64)}
              onSave={() => handleStartSave()}
            />

            {/* Split Screen Layout: Left compact image preview, Right expanded table */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 340px) minmax(0, 1fr)', gap: '14px', height: 'calc(100vh - 160px)' }}>
              <ImagePreviewPanel
                selectedImage={selectedImage}
                processedImageUrl={processedImageUrl}
                currentFilter={currentFilter}
                onFilterChange={handleFilterChange}
                onDownload={handleDownloadFilteredImage}
              />

              <InspectorTable
                ocrResult={ocrResult}
                matchingResults={matchingResults}
                activeModel={activeModel}
                onApplyAllRecommendations={handleApplyAllRecommendations}
                onContainerEdit={handleContainerEdit}
                onContainerKeyDown={handleContainerKeyDown}
                onApplyCandidate={handleApplyCandidate}
                onToggleCancelRow={handleToggleCancelRow}
                onStartScan={() => scanOCR(selectedImage, processedBase64)}
              />
            </div>
          </div>
        </ErrorBoundary>
      )}

    </div>
  );
}

export default function ScannerView({ setActiveTab, editingSheet, setEditingSheet }) {
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || localStorage.getItem('JWD_GOOGLE_CLIENT_ID') || '';

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ScannerViewContent 
        setActiveTab={setActiveTab} 
        editingSheet={editingSheet}
        setEditingSheet={setEditingSheet}
      />
    </GoogleOAuthProvider>
  );
}
