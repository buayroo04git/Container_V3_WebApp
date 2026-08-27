import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { parseLegacyJsonFiles, executeLegacyJsonBatchImport } from '../../services/legacyJsonImportService';

export default function LegacyJsonImportModal({
  isOpen,
  onClose,
  masterDbList = [],
  driversList = [],
  trucksList = [],
  opsList = [],
  onImportSuccess = () => {}
}) {
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parsedSheets, setParsedSheets] = useState([]);
  const [expandedSheetId, setExpandedSheetId] = useState(null);
  const [importProgress, setImportProgress] = useState(null);
  const [selectedDriverOverrides, setSelectedDriverOverrides] = useState({});
  const [uploadToDrive, setUploadToDrive] = useState(true);
  const [skipExisting, setSkipExisting] = useState(false);

  // 🖼️ State สำหรับ Image Preview Lightbox
  const [previewImageSheet, setPreviewImageSheet] = useState(null);
  const [previewImageUrl, setPreviewImageUrl] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const folderInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const googleToken = typeof window !== 'undefined' 
    ? (localStorage.getItem('google_access_token') || localStorage.getItem('gdrive_token') || null) 
    : null;

  // Cleanup Object URL when closing preview
  useEffect(() => {
    if (!previewImageSheet) {
      if (previewImageUrl && previewImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewImageUrl);
      }
      setPreviewImageUrl(null);
      setZoomLevel(1);
    }
  }, [previewImageSheet]);

  if (!isOpen) return null;

  const handleOpenImagePreview = (sheet) => {
    if (sheet.imageFile) {
      const url = URL.createObjectURL(sheet.imageFile);
      setPreviewImageUrl(url);
    } else if (sheet.image_url) {
      setPreviewImageUrl(sheet.image_url);
    } else {
      alert('ไม่พบไฟล์รูปภาพของใบงานนี้ในโฟลเดอร์');
      return;
    }
    setPreviewImageSheet(sheet);
    setZoomLevel(1);
  };

  const handleFilesSelected = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsParsing(true);
    try {
      // 1. ดึงรายการใบงานที่มีอยู่ในระบบแล้ว เพื่อเช็คความซ้ำซ้อน (Duplicate Prevention)
      const { data: existingSheetsData } = await supabase
        .from('job_sheets')
        .select('id, batch_name, truck_no, created_at');

      const existingSet = new Set((existingSheetsData || []).map(s => s.id));

      // 2. Parse ไฟล์ JSON
      const results = await parseLegacyJsonFiles(files, masterDbList, driversList, trucksList, opsList);

      // มาร์กสถานะว่ามีในระบบแล้วหรือไม่
      results.forEach(s => {
        s.isExisting = existingSet.has(s.id);
      });

      setParsedSheets(results);

      // Pre-fill drivers
      const initDrivers = {};
      results.forEach(s => {
        initDrivers[s.id] = s.driver_name;
      });
      setSelectedDriverOverrides(initDrivers);
    } catch (err) {
      console.error('Failed to parse legacy JSON files:', err);
      alert('เกิดข้อผิดพลาดในการอ่านไฟล์ JSON: ' + (err.message || err));
    } finally {
      setIsParsing(false);
    }
  };

  const handleDriverChange = (sheetId, newDriver) => {
    setSelectedDriverOverrides(prev => ({
      ...prev,
      [sheetId]: newDriver
    }));
  };

  const handleConfirmImport = async () => {
    if (parsedSheets.length === 0) return;

    let targetSheets = parsedSheets;
    if (skipExisting) {
      // ข้ามเฉพาะใบงานเดิมที่ผู้ใช้ไม่ได้ทำการเลือก/แก้ไขชื่อคนขับ
      targetSheets = parsedSheets.filter(s => !s.isExisting || (selectedDriverOverrides[s.id] !== undefined && selectedDriverOverrides[s.id] !== s.driver_name));
      if (targetSheets.length === 0) {
        alert('ใบงานทั้งหมดมีอยู่ในระบบแล้ว (หากต้องการบันทึกทับ ให้ยกเลิกติ๊ก "ข้ามใบงานที่มีในระบบแล้ว")');
        return;
      }
    }

    const sheetsToSave = targetSheets.map(s => {
      const chosen = selectedDriverOverrides[s.id] !== undefined ? selectedDriverOverrides[s.id] : s.driver_name;
      return {
        ...s,
        driver_name: (chosen && chosen !== '-') ? chosen : null
      };
    });

    setIsImporting(true);
    try {
      const res = await executeLegacyJsonBatchImport(sheetsToSave, {
        uploadToDrive: uploadToDrive && Boolean(googleToken),
        accessToken: googleToken,
        onProgress: (prog) => setImportProgress(prog)
      });

      if (res.success) {
        alert(`🎉 นำเข้าสำเร็จเรียบร้อยแล้ว!\n- นำเข้าใบงาน: ${res.importedSheets} ใบ\n- นำเข้ารายการตู้: ${res.importedItems} ตู้`);
        onImportSuccess();
        onClose();
      } else {
        const errDetails = (res.errors || []).slice(0, 3).map(e => `${e.sheetId}: ${e.error}`).join('\n');
        alert(`⚠️ นำเข้าเสร็จสิ้นบางส่วน (สำเร็จ ${res.importedSheets} ใบ, พบปัญหา ${res.errors.length} รายการ)\n\nรายละเอียดข้อผิดพลาด:\n${errDetails}`);
        onImportSuccess();
      }
    } catch (err) {
      console.error('Import failed:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + (err.message || err));
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  // Calculations
  const totalSheets = parsedSheets.length;
  const existingSheetsCount = parsedSheets.filter(s => s.isExisting).length;
  const newSheetsCount = parsedSheets.filter(s => !s.isExisting).length;
  const totalContainers = parsedSheets.reduce((sum, s) => sum + (s.total_containers || 0), 0);
  const totalMatched = parsedSheets.reduce((sum, s) => sum + (s.matched_count || 0), 0);
  const totalMultipleDb = parsedSheets.reduce((sum, s) => sum + (s.multiple_db_records_count || 0), 0);
  const totalImageFiles = parsedSheets.filter(s => Boolean(s.imageFile)).length;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '1100px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>📥</span>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
                นำเข้าใบงานจาก JSON เก่า (Legacy JSON Importer)
              </h2>
              <p style={{ fontSize: '12px', margin: '2px 0 0 0', color: '#94a3b8' }}>
                อ่านไฟล์ manual_*.json และ result_*.json พร้อม Auto-Match ใบวางบิล, ตรวจสอบภาพลายมือคนขับ และป้องกันไฟล์ซ้ำ
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '8px',
              color: '#ffffff',
              width: '32px',
              height: '32px',
              cursor: isImporting ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          
          {/* File Picker Actions */}
          <div style={{
            display: 'flex',
            gap: '12px',
            background: '#f8fafc',
            border: '2px dashed #cbd5e1',
            borderRadius: '12px',
            padding: '16px 20px',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap'
          }}>
            <div>
              <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '14px' }}>
                📂 เลือกไฟล์หรือโฟลเดอร์ใบงานที่ต้องการนำเข้า
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                เลือกโฟลเดอร์ที่มีไฟล์ JSON และรูปภาพ (เช่น โฟลเดอร์ `ใบงาน69Aug1-15`) ระบบจะผูกรูปและข้อมูลให้อัตโนมัติ
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="file"
                ref={folderInputRef}
                webkitdirectory=""
                directory=""
                multiple
                style={{ display: 'none' }}
                onChange={handleFilesSelected}
              />
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                disabled={isParsing || isImporting}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isParsing || isImporting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                📁 เลือกทั้งโฟลเดอร์
              </button>

              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                multiple
                style={{ display: 'none' }}
                onChange={handleFilesSelected}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing || isImporting}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: '#ffffff',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isParsing || isImporting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                📄 เลือกไฟล์ JSON
              </button>
            </div>
          </div>

          {/* Google Drive Status & Upload Toggle */}
          {parsedSheets.length > 0 && (
            <div style={{
              marginTop: '12px',
              padding: '10px 16px',
              borderRadius: '10px',
              background: googleToken ? '#eff6ff' : '#f8fafc',
              border: googleToken ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12.5px',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>☁️</span>
                <div>
                  <span style={{ fontWeight: 800, color: '#1e293b' }}>
                    Google Drive Image Sync:
                  </span>
                  <span style={{ color: '#64748b', marginLeft: '6px' }}>
                    {totalImageFiles > 0 
                      ? `พบไฟล์รูปภาพต้นฉบับในโฟลเดอร์ ${totalImageFiles} รูป`
                      : 'ไม่พบไฟล์รูปภาพในโฟลเดอร์ (จะผูกชื่อรูปภาพตามโครงสร้างเดิม)'}
                  </span>
                </div>
              </div>

              {googleToken ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 700, color: '#2563eb' }}>
                  <input
                    type="checkbox"
                    checked={uploadToDrive}
                    onChange={(e) => setUploadToDrive(e.target.checked)}
                    disabled={isImporting || totalImageFiles === 0}
                  />
                  <span>อัปโหลดรูปภาพขึ้น Google Drive อัตโนมัติ</span>
                </label>
              ) : (
                <span style={{ fontSize: '11.5px', color: '#64748b', background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px' }}>
                  ℹ️ ยังไม่ได้เชื่อมต่อ Google Drive (จะบันทึกชื่อรูปภาพไว้ และสามารถซิงค์ขึ้น Drive ภายหลังได้)
                </span>
              )}
            </div>
          )}

          {/* Loading States */}
          {isParsing && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>⏳</div>
              <div style={{ fontWeight: 700 }}>กำลังอ่านไฟล์ JSON, ตรวจสอบไฟล์ซ้ำ และ Auto-Match กับใบวางบิล...</div>
            </div>
          )}

          {/* KPI Summary Cards */}
          {!isParsing && parsedSheets.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                marginBottom: '16px'
              }}>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '11.5px', color: '#1e40af', fontWeight: 700 }}>📄 ใบงานที่ตรวจพบ</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#1d4ed8' }}>
                    {totalSheets.toLocaleString()} ใบ
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block' }}>
                      (ใหม่ {newSheetsCount} / มีแล้ว {existingSheetsCount})
                    </span>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>📦 รายการตู้ทั้งหมด</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>{totalContainers.toLocaleString()} ตู้</div>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '11.5px', color: '#166534', fontWeight: 700 }}>🟢 แมตช์ใบวางบิลตรง</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#15803d' }}>
                    {totalMatched.toLocaleString()} ตู้ ({totalContainers ? Math.round((totalMatched / totalContainers) * 100) : 0}%)
                  </div>
                </div>

                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '11.5px', color: '#92400e', fontWeight: 700 }}>🔁 พบตู้ซ้ำใน DB</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#b45309' }}>{totalMultipleDb.toLocaleString()} รายการ</div>
                </div>
              </div>

              {/* Duplicate Job Sheets & Duplicate Containers Notice Banners */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                {existingSheetsCount > 0 && (
                  <div style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '12.5px',
                    color: '#991b1b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>🛡️</span>
                      <span>
                        <strong>ระบบป้องกันไฟล์ซ้ำ:</strong> ตรวจพบใบงานที่มีอยู่ในระบบแล้ว <strong>{existingSheetsCount} ใบ</strong> (จากทั้งหมด {totalSheets} ใบ)
                      </span>
                    </div>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 700 }}>
                      <input
                        type="checkbox"
                        checked={skipExisting}
                        onChange={(e) => setSkipExisting(e.target.checked)}
                      />
                      <span>ข้ามใบงานที่มีอยู่แล้ว (นำเข้าเฉพาะ {newSheetsCount} ใบใหม่)</span>
                    </label>
                  </div>
                )}

                {totalMultipleDb > 0 && (
                  <div style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '12.5px',
                    color: '#92400e',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{ fontSize: '18px' }}>🔔</span>
                    <span>
                      <strong>การแจ้งเตือนตู้ซ้ำใน DB:</strong> ตรวจพบเลขตู้ที่มีมากกว่า 1 รายการใน Master DB จำนวน <strong>{totalMultipleDb} ตู้</strong> (ระบบได้ทำการเลือกจับคู่งานที่ตรงกับเบอร์รถ/ท่าเรือให้โดยอัตโนมัติ)
                    </span>
                  </div>
                )}
              </div>

              {/* Sheets Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px' }}>ลำดับ</th>
                      <th style={{ padding: '10px 12px' }}>สถานะในระบบ</th>
                      <th style={{ padding: '10px 12px' }}>เบอร์รถ</th>
                      <th style={{ padding: '10px 12px' }}>รอบงาน (Batch)</th>
                      <th style={{ padding: '10px 12px' }}>คนขับ (ระบุ/เปลี่ยนได้)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>ภาพใบงาน</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>จำนวนตู้</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>สถานะแมตช์</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>ตู้ซ้ำใน DB</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>ดูรายละเอียด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedSheets.map((sheet, index) => {
                      const isExpanded = expandedSheetId === sheet.id;
                      const currentDriver = selectedDriverOverrides[sheet.id] !== undefined ? selectedDriverOverrides[sheet.id] : sheet.driver_name;
                      const hasImage = Boolean(sheet.imageFile || sheet.image_url);

                      return (
                        <React.Fragment key={sheet.id}>
                          <tr style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: index % 2 === 0 ? '#ffffff' : '#fafafa',
                            opacity: (skipExisting && sheet.isExisting) ? 0.5 : 1
                          }}>
                            <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{index + 1}</td>
                            <td style={{ padding: '10px 12px' }}>
                              {sheet.isExisting ? (
                                <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                                  ⚠️ มีในระบบแล้ว
                                </span>
                              ) : (
                                <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                                  ✨ ใหม่
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 800, color: '#1e293b' }}>
                              รถ {sheet.truck_no}
                            </td>
                            <td style={{ padding: '10px 12px', color: '#334155' }}>
                              <span style={{ background: '#eff6ff', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '11.5px' }}>
                                {sheet.batch_name}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <select
                                  value={currentDriver || '-'}
                                  onChange={(e) => handleDriverChange(sheet.id, e.target.value)}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    background: '#ffffff',
                                    color: currentDriver && currentDriver !== '-' ? '#0f172a' : '#64748b',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <option value="-">-- เลือกคนขับ --</option>
                                  {driversList.map(d => (
                                    <option key={d.driver_name} value={d.driver_name}>
                                      {d.driver_name} {d.assigned_truck_no ? `(รถ ${d.assigned_truck_no})` : ''}
                                    </option>
                                  ))}
                                </select>

                                {hasImage && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenImagePreview(sheet)}
                                    title="ดูภาพใบงานเพื่อตรวจชื่อคนขับ"
                                    style={{
                                      padding: '3px 6px',
                                      borderRadius: '5px',
                                      border: '1px solid #bfdbfe',
                                      background: '#eff6ff',
                                      color: '#2563eb',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '2px'
                                    }}
                                  >
                                    🖼️ ดูรูป
                                  </button>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              {hasImage ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenImagePreview(sheet)}
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#2563eb',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                    fontSize: '12px',
                                    textDecoration: 'underline'
                                  }}
                                >
                                  🖼️ ดูภาพ
                                </button>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: '11px' }}>ไม่มีรูป</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800 }}>
                              {sheet.total_containers} ตู้
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <span style={{
                                background: sheet.unmatched_count === 0 ? '#dcfce7' : '#fee2e2',
                                color: sheet.unmatched_count === 0 ? '#166534' : '#991b1b',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: 800
                              }}>
                                🟢 {sheet.matched_count} / 🔴 {sheet.unmatched_count}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              {sheet.has_multiple_db_records ? (
                                <span style={{
                                  background: '#fef3c7',
                                  color: '#92400e',
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  fontSize: '11px',
                                  fontWeight: 800
                                }}>
                                  🔁 {sheet.multiple_db_records_count} ตู้
                                </span>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: '11px' }}>-</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => setExpandedSheetId(isExpanded ? null : sheet.id)}
                                style={{
                                  background: isExpanded ? '#e2e8f0' : '#f1f5f9',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: '#334155',
                                  cursor: 'pointer'
                                }}
                              >
                                {isExpanded ? '▲ ซ่อน' : '▼ ดูตู้'}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Rows Container Detail */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={10} style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                                <div style={{ fontWeight: 800, marginBottom: '6px', color: '#1e293b', fontSize: '12px' }}>
                                  📋 รายการตู้ในใบงาน: {sheet.id} ({sheet.items.length} ตู้)
                                </div>
                                <table style={{ width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11.5px' }}>
                                  <thead>
                                    <tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left' }}>
                                      <th style={{ padding: '6px 8px' }}>ลำดับ</th>
                                      <th style={{ padding: '6px 8px' }}>เลขตู้</th>
                                      <th style={{ padding: '6px 8px' }}>ท่าเรือ</th>
                                      <th style={{ padding: '6px 8px' }}>ขนาด</th>
                                      <th style={{ padding: '6px 8px' }}>Dis/Load (จาก Master DB)</th>
                                      <th style={{ padding: '6px 8px' }}>วันที่ (Date Job)</th>
                                      <th style={{ padding: '6px 8px' }}>เวลาเข้า-ออก</th>
                                      <th style={{ padding: '6px 8px' }}>สถานะใน DB</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sheet.items.map((it, itIdx) => (
                                      <tr key={itIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '6px 8px', color: '#94a3b8' }}>{it.line_no}</td>
                                        <td style={{ padding: '6px 8px', fontWeight: 800, color: '#0f172a' }}>{it.container_no}</td>
                                        <td style={{ padding: '6px 8px' }}>{it.port}</td>
                                        <td style={{ padding: '6px 8px' }}>{it.size}</td>
                                        <td style={{ padding: '6px 8px', fontWeight: 700, color: it.job_type === 'DIS' ? '#166534' : (it.job_type === 'LOAD' ? '#1e40af' : '#64748b') }}>
                                          {it.job_type}
                                        </td>
                                        <td style={{ padding: '6px 8px' }}>{it.date_job}</td>
                                        <td style={{ padding: '6px 8px', color: '#64748b' }}>{it.time_in} - {it.time_out}</td>
                                        <td style={{ padding: '6px 8px' }}>
                                          {it.hasMultipleDbRecords ? (
                                            <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                              🔁 มี {it.allDbMatches.length} งานใน DB
                                            </span>
                                          ) : it.match_status === 'matched_green' ? (
                                            <span style={{ color: '#16a34a', fontWeight: 700 }}>🟢 แมตช์แล้ว</span>
                                          ) : (
                                            <span style={{ color: '#dc2626', fontWeight: 700 }}>🔴 ยังไม่เจอใน DB</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progress Bar during Import */}
          {isImporting && importProgress && (
            <div style={{ marginTop: '20px', padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800, color: '#166534', marginBottom: '8px' }}>
                <span>🚀 กำลังบันทึกข้อมูลใบงาน ({importProgress.current} / {importProgress.total} ใบ)...</span>
                <span>{importProgress.percent}%</span>
              </div>
              <div style={{ width: '100%', height: '10px', background: '#dcfce7', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: `${importProgress.percent}%`, height: '100%', background: '#16a34a', transition: 'width 0.2s' }} />
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '14px 24px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#ffffff',
              color: '#64748b',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isImporting ? 'not-allowed' : 'pointer'
            }}
          >
            ยกเลิก
          </button>

          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={isImporting || isParsing || parsedSheets.length === 0}
            style={{
              padding: '9px 24px',
              borderRadius: '8px',
              background: parsedSheets.length > 0 ? '#16a34a' : '#94a3b8',
              color: '#ffffff',
              border: 'none',
              fontSize: '14px',
              fontWeight: 800,
              cursor: (isImporting || isParsing || parsedSheets.length === 0) ? 'not-allowed' : 'pointer',
              boxShadow: parsedSheets.length > 0 ? '0 2px 4px rgba(22, 163, 74, 0.2)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>🚀</span>
            <span>
              {skipExisting 
                ? `ยืนยันการนำเข้าเฉพาะใบงานใหม่ (${newSheetsCount} ใบ)` 
                : `ยืนยันการนำเข้าทั้งหมด (${parsedSheets.length} ใบงาน)`}
            </span>
          </button>
        </div>
      </div>

      {/* 🖼️ High-Resolution Image Preview Lightbox Modal */}
      {previewImageSheet && previewImageUrl && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(6px)',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          {/* Preview Header & Controls */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.9)',
            borderRadius: '12px',
            padding: '10px 20px',
            marginBottom: '12px',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            maxWidth: '1000px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>🖼️</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '14px' }}>
                  ใบงานรถ {previewImageSheet.truck_no} ({previewImageSheet.id})
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                  ตรวจดูลายมือชื่อคนขับบนหัวกระดาษ แล้วเลือกคนขับจาก Dropdown ด้านขวาได้ทันที
                </div>
              </div>
            </div>

            {/* Driver Quick Selector inside Preview */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#93c5fd' }}>คนขับ:</span>
                <select
                  value={(selectedDriverOverrides[previewImageSheet.id] !== undefined ? selectedDriverOverrides[previewImageSheet.id] : previewImageSheet.driver_name) || '-'}
                  onChange={(e) => handleDriverChange(previewImageSheet.id, e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #3b82f6',
                    background: '#1e293b',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <option value="-">-- เลือกคนขับ --</option>
                  {driversList.map(d => (
                    <option key={d.driver_name} value={d.driver_name}>
                      {d.driver_name} {d.assigned_truck_no ? `(รถ ${d.assigned_truck_no})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Zoom Controls */}
              <div style={{ display: 'flex', gap: '4px', background: '#334155', borderRadius: '6px', padding: '2px' }}>
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.25))}
                  style={{ background: 'none', border: 'none', color: '#ffffff', padding: '4px 8px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  🔍-
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel(1)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', padding: '4px 6px', cursor: 'pointer', fontSize: '11px' }}
                >
                  {Math.round(zoomLevel * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.25))}
                  style={{ background: 'none', border: 'none', color: '#ffffff', padding: '4px 8px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  🔍+
                </button>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setPreviewImageSheet(null)}
                style={{
                  background: '#ef4444',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  padding: '6px 14px',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                ✕ ปิด
              </button>
            </div>
          </div>

          {/* Image Container with Zoom & Scroll */}
          <div style={{
            flex: 1,
            width: '100%',
            maxWidth: '1000px',
            maxHeight: 'calc(90vh - 100px)',
            overflow: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0f172a',
            borderRadius: '12px',
            border: '1px solid #334155',
            padding: '16px'
          }}>
            <img
              src={previewImageUrl}
              alt="ใบงานต้นฉบับ"
              style={{
                maxWidth: zoomLevel === 1 ? '100%' : 'none',
                maxHeight: zoomLevel === 1 ? '100%' : 'none',
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'top center',
                transition: 'transform 0.15s ease-out',
                borderRadius: '6px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.8)'
              }}
            />
          </div>
        </div>
      )}

    </div>
  );
}
