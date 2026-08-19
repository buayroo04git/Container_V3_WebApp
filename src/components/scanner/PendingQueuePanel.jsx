import React from 'react';
import { getFilterCSS } from '../../services/geminiService';

export default function PendingQueuePanel({
  images = [],
  filteredPendingImages = [],
  imageQueueStats = [],
  availablePendingTrucks = [],
  pendingTruckFilter,
  setPendingTruckFilter,
  pendingSearchTerm,
  setPendingSearchTerm,
  isScanning,
  scanLogs = [],
  showLogDrawer,
  setShowLogDrawer,
  setScanLogs,
  scanStatusDetail,
  uploadProgress,
  batchScanProgress,
  googleAccessToken,
  folderInputRef,
  cloudFolderInputRef,
  handleFolderInputChange,
  handleCloudFolderUpload,
  handleGoogleAuthTrigger,
  setPendingGoogleAction,
  setGoogleAccessToken,
  handleBatchScanAll,
  handleClearQueue,
  handleSelectImage,
  handleRowScan,
  handleDeleteSinglePending,
  imageFilters = {},
  scanningRowId
}) {
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 4px 0', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⏳ Pending Job Sheets
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
            คิวใบงานรอสแกน OCR และตรวจสอบความถูกต้องก่อนบันทึก
          </p>
        </div>

        {/* Top Action Bar */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="file"
            ref={folderInputRef}
            webkitdirectory="true"
            directory="true"
            multiple
            style={{ display: 'none' }}
            onClick={(e) => { e.target.value = null; }}
            onChange={handleFolderInputChange}
          />
          <input
            type="file"
            ref={cloudFolderInputRef}
            webkitdirectory="true"
            directory="true"
            multiple
            style={{ display: 'none' }}
            onClick={(e) => { e.target.value = null; }}
            onChange={handleCloudFolderUpload}
          />

          {/* Cloud Drive Status / Connect Button */}
          {googleAccessToken ? (
            <div style={{
              height: '38px',
              boxSizing: 'border-box',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0 14px',
              borderRadius: '8px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              fontSize: '13px',
              color: '#15803d',
              fontWeight: 600
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
              <span>Google Drive เชื่อมต่อแล้ว</span>
              <button
                onClick={() => {
                  localStorage.removeItem('gdrive_access_token');
                  localStorage.removeItem('gdrive_token_expires_at');
                  setGoogleAccessToken(null);
                  handleGoogleAuthTrigger();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#059669',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: '11.5px',
                  padding: 0,
                  fontWeight: 600
                }}
                title="คลิกเพื่อต่ออายุหรือสลับบัญชี Google"
              >
                (ต่ออายุ/สลับ)
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setPendingGoogleAction({ type: 'sync' });
                handleGoogleAuthTrigger();
              }}
              style={{
                height: '38px',
                boxSizing: 'border-box',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease'
              }}
            >
              <span>🔑</span>
              <span>เชื่อมต่อ Google Drive</span>
            </button>
          )}

          {/* ☁️ Upload to Cloud Button */}
          <button
            onClick={() => {
              const expiresAt = localStorage.getItem('gdrive_token_expires_at');
              const isExpired = !expiresAt || Number(expiresAt) <= Date.now();
              const token = googleAccessToken || localStorage.getItem('gdrive_access_token');
              
              if (!token || isExpired) {
                localStorage.removeItem('gdrive_access_token');
                localStorage.removeItem('gdrive_token_expires_at');
                setGoogleAccessToken(null);
                setPendingGoogleAction({ type: 'upload_folder' });
                // เรียก Login ทันทีตอนผู้ใช้กดคลิก เพื่อไม่ให้ถูก Browser Popup Blocker บล็อก
                handleGoogleAuthTrigger();
              } else if (cloudFolderInputRef.current) {
                cloudFolderInputRef.current.click();
              }
            }}
            style={{
              height: '38px',
              boxSizing: 'border-box',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 16px',
              borderRadius: '8px',
              border: '1px solid #1d4ed8',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(37, 99, 235, 0.25)',
              transition: 'all 0.15s ease'
            }}
            title="อัปโหลดโฟลเดอร์ภาพขึ้น Cloud เพื่อให้ทุกคนเห็นคิวงานพร้อมกัน"
          >
            <span>☁️</span>
            <span>อัปโหลดขึ้น Cloud</span>
          </button>

          {images.length > 0 && (
            <button
              onClick={handleBatchScanAll}
              disabled={Boolean(batchScanProgress)}
              style={{
                height: '38px',
                boxSizing: 'border-box',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 16px',
                borderRadius: '8px',
                border: '1px solid #059669',
                background: '#10b981',
                color: '#ffffff',
                fontSize: '13px',
                cursor: batchScanProgress ? 'not-allowed' : 'pointer',
                opacity: batchScanProgress ? 0.7 : 1,
                boxShadow: '0 1px 3px rgba(16, 185, 129, 0.25)',
                transition: 'all 0.15s ease'
              }}
            >
              <span>⚡</span>
              <span>สแกน OCR ทั้งหมด ({imageQueueStats.filter(i => !i.hasOcr).length})</span>
            </button>
          )}

          {images.length > 0 && (
            <button
              onClick={handleClearQueue}
              style={{
                height: '38px',
                boxSizing: 'border-box',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 14px',
                borderRadius: '8px',
                border: '1px solid #fca5a5',
                background: '#fef2f2',
                color: '#dc2626',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="ล้างคิวใบงาน Pending ทั้งหมด"
            >
              <span style={{ fontSize: '14px', fontWeight: 900 }}>✕</span>
              <span>ล้างคิวทั้งหมด</span>
            </button>
          )}
        </div>

      </div>

      {/* AI Live Activity & Log Terminal */}
      {(isScanning || scanLogs.length > 0) && (
        <div style={{
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '10px',
          padding: '12px 16px',
          marginBottom: '16px',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px', animation: isScanning ? 'spin 1.5s infinite linear' : 'none' }}>
                {isScanning ? '⚙️' : '🤖'}
              </span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                    สถานะ AI:
                  </span>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: isScanning ? '#1d4ed8' : '#15803d',
                    background: isScanning ? '#eff6ff' : '#f0fdf4',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    border: isScanning ? '1px solid #bfdbfe' : '1px solid #bbf7d0'
                  }}>
                    {scanStatusDetail || (isScanning ? 'กำลังประมวลผล...' : 'พร้อมใช้งาน')}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => setShowLogDrawer(!showLogDrawer)}
                style={{
                  padding: '4px 10px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: showLogDrawer ? '#f1f5f9' : '#ffffff',
                  color: '#334155',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                📜 {showLogDrawer ? 'ซ่อน Log' : `ดู Log ละเอียด (${scanLogs.length})`}
              </button>

              {scanLogs.length > 0 && (
                <button
                  onClick={() => setScanLogs([])}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11.5px',
                    borderRadius: '6px',
                    border: '1px solid #f1f5f9',
                    background: '#f8fafc',
                    color: '#94a3b8',
                    cursor: 'pointer'
                  }}
                  title="ล้างประวัติ Log"
                >
                  ล้าง
                </button>
              )}
            </div>
          </div>

          {/* Collapsible Log Terminal Drawer */}
          {showLogDrawer && (
            <div style={{
              marginTop: '10px',
              maxHeight: '180px',
              overflowY: 'auto',
              background: '#0f172a',
              color: '#e2e8f0',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '11.5px',
              fontFamily: 'monospace',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              {scanLogs.length === 0 ? (
                <div style={{ color: '#64748b' }}>ยังไม่มีประวัติการทำงาน</div>
              ) : (
                scanLogs.map((log, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    gap: '8px',
                    color: log.type === 'error' ? '#f87171' : log.type === 'warn' ? '#fbbf24' : log.type === 'success' ? '#4ade80' : '#e2e8f0'
                  }}>
                    <span style={{ color: '#64748b' }}>[{log.time}]</span>
                    <span>{log.msg}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Upload Progress Banner */}
      {uploadProgress && (
        <div style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '8px',
          padding: '12px 18px',
          marginBottom: '16px',
          boxShadow: '0 2px 8px rgba(37, 99, 235, 0.08)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#1d4ed8' }}>
              ☁️ กำลังอัปโหลดภาพขึ้น Cloud ({uploadProgress.current} / {uploadProgress.total})
            </span>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              📄 <b>{uploadProgress.filename}</b>
            </span>
          </div>
          <div style={{ width: '100%', background: '#dbeafe', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%`,
              background: '#2563eb',
              height: '100%',
              borderRadius: '3px',
              transition: 'width 0.2s ease'
            }} />
          </div>
        </div>
      )}

      {/* Batch Scan Progress Banner */}
      {batchScanProgress && (
        <div style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '8px',
          padding: '14px 18px',
          marginBottom: '16px',
          boxShadow: '0 2px 8px rgba(37, 99, 235, 0.08)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>⚡</span>
              <div>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1d4ed8' }}>
                  กำลังสแกน OCR อัตโนมัติ ({batchScanProgress.current} / {batchScanProgress.total})
                </span>
                <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '10px' }}>
                  📄 <b>{batchScanProgress.filename}</b>
                </span>
              </div>
            </div>

            <div style={{
              fontSize: '11.5px',
              fontWeight: 700,
              color: '#1e40af',
              background: '#dbeafe',
              padding: '3px 10px',
              borderRadius: '6px',
              border: '1px solid #bfdbfe',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              {scanStatusDetail || '🤖 กำลังประมวลผล...'}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ width: '100%', background: '#dbeafe', height: '7px', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.round((batchScanProgress.current / batchScanProgress.total) * 100)}%`,
              background: '#2563eb',
              height: '100%',
              borderRadius: '4px',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}

      {/* Pending Queue Table Card */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '16px 20px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
              📋 รายการใบงานในคิว ({filteredPendingImages.length} จาก {images.length} ใบ)
            </div>

            {/* ฟิลเตอร์เบอร์รถในหน้า Pending */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <select
                value={pendingTruckFilter}
                onChange={(e) => setPendingTruckFilter(e.target.value)}
                style={{
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#1e293b',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">🚚 ทุกเบอร์รถ ({availablePendingTrucks.length})</option>
                {availablePendingTrucks.map(truck => (
                  <option key={truck} value={truck}>เบอร์รถ: {truck}</option>
                ))}
              </select>
            </div>

            {/* ช่องค้นหาในหน้า Pending */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={pendingSearchTerm}
                onChange={(e) => setPendingSearchTerm(e.target.value)}
                placeholder="🔍 ค้นหาเบอร์รถ / ชื่อไฟล์..."
                style={{
                  height: '32px',
                  padding: '0 10px 0 26px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12px',
                  width: '180px',
                  outline: 'none'
                }}
              />
              <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#94a3b8' }}>🔍</span>
            </div>

            {/* ปุ่มล้างตัวกรองในหน้า Pending */}
            {(pendingTruckFilter !== 'ALL' || pendingSearchTerm.trim() !== '') && (
              <button
                onClick={() => {
                  setPendingTruckFilter('ALL');
                  setPendingSearchTerm('');
                }}
                style={{
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                  color: '#b91c1c',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="ล้างตัวกรองและคำค้นหาทั้งหมด"
              >
                <span>✕</span>
                <span>ล้างตัวกรอง</span>
              </button>
            )}
          </div>

          <div style={{ fontSize: '12.5px', color: '#64748b' }}>
            สแกนแล้ว: <strong>{imageQueueStats.filter(i => i.hasOcr).length}</strong> / {images.length}
          </div>
        </div>

        {images.length === 0 ? (
          <div style={{
            padding: '60px 20px',
            textAlign: 'center',
            color: '#94a3b8',
            border: '2px dashed #e2e8f0',
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '42px', marginBottom: '10px' }}>📄</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
              ยังไม่มีใบงานในคิว Pending
            </div>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
              กดปุ่ม "☁️ อัปโหลดขึ้น Cloud" เพื่อส่งใบงานเข้าสู่ระบบ
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  const expiresAt = localStorage.getItem('gdrive_token_expires_at');
                  const isExpired = !expiresAt || Number(expiresAt) <= Date.now();
                  const token = googleAccessToken || localStorage.getItem('gdrive_access_token');
                  
                  if (!token || isExpired) {
                    localStorage.removeItem('gdrive_access_token');
                    localStorage.removeItem('gdrive_token_expires_at');
                    setGoogleAccessToken(null);
                    setPendingGoogleAction({ type: 'upload_folder' });
                    handleGoogleAuthTrigger();
                  } else if (cloudFolderInputRef.current) {
                    cloudFolderInputRef.current.click();
                  }
                }}
                style={{
                  padding: '8px 20px',
                  borderRadius: '7px',
                  border: 'none',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
                }}
              >
                ☁️ อัปโหลดขึ้น Cloud
              </button>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 355px)', minHeight: '320px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <tr>
                  <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 600, width: '56px' }}>รูปภาพ</th>
                  <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 600 }}>📁 ชื่อไฟล์ / โฟลเดอร์</th>
                  <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 600 }}>🚚 เบอร์รถ</th>
                  <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 600 }}>📅 รอบงาน (Batch)</th>
                  <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 600 }}>⚡ สถานะ OCR</th>
                  <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 600 }}>📊 ผลจับคู่</th>
                  <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 600, textAlign: 'right' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredPendingImages.map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Thumbnail */}
                    <td style={{ padding: '8px 14px' }}>
                      <img
                        src={item.thumbnailLink || (item.drive_file_id ? `https://drive.google.com/thumbnail?id=${item.drive_file_id}&sz=w200` : item.url)}
                        alt={item.name}
                        onError={(e) => {
                          const fId = item.drive_file_id || item.id;
                          if (fId && !e.target._failed) {
                            e.target._failed = true;
                            e.target.src = `https://drive.google.com/thumbnail?id=${fId}&sz=w200`;
                          }
                        }}
                        onClick={() => handleSelectImage(item)}
                        style={{
                          width: '44px',
                          height: '44px',
                          objectFit: 'cover',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          border: '1px solid #cbd5e1',
                          filter: getFilterCSS(imageFilters[item.file_hash] || imageFilters[item.id] || 'magic'),
                          transition: 'transform 0.15s ease'
                        }}
                        title="คลิกเพื่อเปิดดูรายละเอียดและตรวจเทียบใบงาน"
                      />
                    </td>

                    {/* Name & Path */}
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.name}</div>
                      {item.folderName ? (
                        <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>{item.folderName}</div>
                      ) : null}
                    </td>

                    {/* Truck No */}
                    <td style={{ padding: '10px 14px' }}>
                      {item.truckNo && item.truckNo !== '-' ? (
                        <span style={{ fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', padding: '3px 8px', borderRadius: '4px' }}>
                          {item.truckNo}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>รอสแกน</span>
                      )}
                    </td>

                    {/* Batch */}
                    <td style={{ padding: '10px 14px' }}>
                      {item.majorityBatch ? (
                        <span style={{ fontWeight: 600, color: '#15803d', background: '#f0fdf4', padding: '3px 8px', borderRadius: '4px', fontSize: '12px' }}>
                          {item.majorityBatch}
                        </span>
                      ) : !item.hasOcr ? (
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>รอสแกน</span>
                      ) : (
                        <span style={{ color: '#dc2626', fontSize: '12px', fontWeight: 600 }}>ไม่พบใน Master</span>
                      )}
                    </td>

                    {/* OCR Status */}
                    <td style={{ padding: '10px 14px' }}>
                      {item.hasOcr ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div>
                            {item.isReady ? (
                              <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '12px' }}>
                                พร้อมบันทึก
                              </span>
                            ) : (
                              <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '2px 8px', borderRadius: '12px' }}>
                                รอตรวจ ({item.yellow + item.red} จุด)
                              </span>
                            )}
                          </div>
                          {item.modelUsed && (
                            <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                              <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px', border: '1px solid #e2e8f0', fontWeight: 600 }}>
                                {item.modelUsed.replace('gemini-', '')}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '3px 8px', borderRadius: '12px' }}>
                          รอสแกน
                        </span>
                      )}
                    </td>

                    {/* Match Counts */}
                    <td style={{ padding: '10px 14px' }}>
                      {item.hasOcr ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {item.green > 0 && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              background: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              color: '#065f46',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                            }} title="ตรงกับฐานข้อมูล 100%">
                              <span style={{
                                width: '14px',
                                height: '14px',
                                borderRadius: '50%',
                                background: 'radial-gradient(circle at 35% 30%, #a7f3d0 0%, #22c55e 40%, #15803d 100%)',
                                boxShadow: '0 1px 3px rgba(34, 197, 94, 0.4), inset 0 1px 1px rgba(255,255,255,0.9)',
                                display: 'inline-block',
                                flexShrink: 0
                              }}></span>
                              <span>{item.green}</span>
                            </span>
                          )}
                          {item.blue > 0 && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              background: '#f0f9ff',
                              border: '1px solid #bae6fd',
                              color: '#075985',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                            }} title="ความคล้ายสูง (แทนค่าอัตโนมัติ)">
                              <span style={{
                                width: '14px',
                                height: '14px',
                                borderRadius: '50%',
                                background: 'radial-gradient(circle at 35% 30%, #bae6fd 0%, #0ea5e9 40%, #0369a1 100%)',
                                boxShadow: '0 1px 3px rgba(14, 165, 233, 0.4), inset 0 1px 1px rgba(255,255,255,0.9)',
                                display: 'inline-block',
                                flexShrink: 0
                              }}></span>
                              <span>{item.blue}</span>
                            </span>
                          )}
                          {item.yellow > 0 && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              background: '#fefce8',
                              border: '1px solid #fef08a',
                              color: '#854d0e',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                            }} title="รอตรวจสอบ / มีหลายตัวเลือก">
                              <span style={{
                                width: '14px',
                                height: '14px',
                                borderRadius: '50%',
                                background: 'radial-gradient(circle at 35% 30%, #fef08a 0%, #f59e0b 40%, #b45309 100%)',
                                boxShadow: '0 1px 3px rgba(245, 158, 11, 0.4), inset 0 1px 1px rgba(255,255,255,0.9)',
                                display: 'inline-block',
                                flexShrink: 0
                              }}></span>
                              <span>{item.yellow}</span>
                            </span>
                          )}
                          {item.red > 0 && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              background: '#fff1f2',
                              border: '1px solid #fecdd3',
                              color: '#9f1239',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                            }} title="ไม่พบใน Master DB">
                              <span style={{
                                width: '14px',
                                height: '14px',
                                borderRadius: '50%',
                                background: 'radial-gradient(circle at 35% 30%, #fecdd3 0%, #ef4444 40%, #b91c1c 100%)',
                                boxShadow: '0 1px 3px rgba(239, 68, 68, 0.4), inset 0 1px 1px rgba(255,255,255,0.9)',
                                display: 'inline-block',
                                flexShrink: 0
                              }}></span>
                              <span>{item.red}</span>
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>-</span>
                      )}
                    </td>

                    {/* Action Buttons */}
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {!item.hasOcr ? (
                          <button
                            onClick={() => handleRowScan(item)}
                            disabled={scanningRowId === (item.file_hash || item.id) || isScanning}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '5px',
                              border: 'none',
                              background: scanningRowId === (item.file_hash || item.id) ? '#3b82f6' : '#2563eb',
                              color: '#ffffff',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: scanningRowId === (item.file_hash || item.id) ? 'wait' : 'pointer',
                              transition: 'all 0.15s ease',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            {scanningRowId === (item.file_hash || item.id) ? (
                              <span>⏳ {scanStatusDetail || 'กำลังสแกน...'}</span>
                            ) : (
                              <span>🚀 สแกน</span>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSelectImage(item)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '5px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              color: '#1e293b',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            🔍 จัดการ / ตรวจ
                          </button>
                        )}

                        {/* Delete single pending file from cloud/local */}
                        <button
                          onClick={(e) => handleDeleteSinglePending(e, item)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '5px',
                            border: '1.5px solid #fca5a5',
                            background: '#fef2f2',
                            color: '#dc2626',
                            fontSize: '13px',
                            fontWeight: 900,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            lineHeight: 1
                          }}
                          title="ลบใบงานนี้ออกจากคิว Pending และ Google Drive"
                        >
                          ✕
                        </button>
                      </div>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
