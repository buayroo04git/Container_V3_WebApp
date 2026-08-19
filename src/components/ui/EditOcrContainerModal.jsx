import React, { useState, useEffect, useMemo } from 'react';
import { findTopContainerMatches } from '../../utils/matchingLogic';

/**
 * 🖼️ Helper สำหรับดึง Google Drive File ID
 */
const extractDriveId = (url, driveId) => {
  if (driveId && typeof driveId === 'string' && driveId.length > 5) return driveId;
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  return null;
};

/**
 * ✏️ EditOcrContainerModal
 * Modal สำหรับแก้ไขข้อมูลตู้ในหน้า OCR Container History โดยตรง
 * พร้อมปุ่มเปิดดูรูปภาพใบงานต้นฉบับ (Side-by-side & Interactive Drag & Pan Zoom)
 */
export default function EditOcrContainerModal({
  item,
  masterDb = [],
  onClose,
  onSave
}) {
  const [containerNo, setContainerNo] = useState('');
  const [jobType, setJobType] = useState('DIS');
  const [port, setPort] = useState('');
  const [size, setSize] = useState('20');
  const [truckNo, setTruckNo] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // 🖼️ Image Viewer States (Zoom & Pan Drag)
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [useIframeViewer, setUseIframeViewer] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgLoadError, setImgLoadError] = useState(false);

  const driveFileId = useMemo(() => {
    return extractDriveId(item?.image_url, item?.drive_file_id);
  }, [item]);

  // ลิงก์รูปภาพความละเอียดสูง
  const directImageUrl = useMemo(() => {
    if (driveFileId) {
      return `https://lh3.googleusercontent.com/d/${driveFileId}`;
    }
    if (item?.image_url && !item.image_url.includes('/file/d/')) {
      return item.image_url;
    }
    return null;
  }, [driveFileId, item]);

  // ลิงก์ Thumbnail สำรอง
  const thumbnailImageUrl = useMemo(() => {
    if (driveFileId) {
      return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1600`;
    }
    return directImageUrl;
  }, [driveFileId, directImageUrl]);

  // ลิงก์ Embed Preview สำหรับ iframe
  const iframePreviewUrl = useMemo(() => {
    if (driveFileId) {
      return `https://drive.google.com/file/d/${driveFileId}/preview`;
    }
    return null;
  }, [driveFileId]);

  // ลิงก์เปิด Google Drive เต็มในแท็บใหม่
  const driveWebLink = useMemo(() => {
    if (driveFileId) {
      return `https://drive.google.com/file/d/${driveFileId}/view?usp=sharing`;
    }
    return item?.image_url || '#';
  }, [driveFileId, item]);

  useEffect(() => {
    if (item) {
      setContainerNo(item.container_no || '');
      
      const jt = String(item.job_type || '').toUpperCase();
      if (jt.includes('LOAD') || jt === 'L') setJobType('LOAD');
      else if (jt.includes('DIS') || jt === 'D') setJobType('DIS');
      else setJobType(jt && jt !== '-' ? jt : 'DIS');

      setPort(item.port && item.port !== '-' ? item.port : '');
      
      const sz = String(item.size || '').replace(/[^0-9]/g, '');
      setSize(sz || '20');

      setTruckNo(item.truck_no && item.truck_no !== '-' ? item.truck_no : '');
      setImgLoadError(false);
      setZoomLevel(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [item]);

  // 🖱️ ฟังก์ชันคลิกลากเพื่อเลื่อนดูภาพ (Pan / Drag)
  const handleMouseDown = (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setZoomLevel(prev => Math.min(5, Math.max(0.5, prev + delta)));
  };

  const handleResetView = () => {
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
  };

  // ตัวเลือกแนะนำจาก Master DB ที่ใกล้เคียง
  const candidateMatches = useMemo(() => {
    if (!containerNo || masterDb.length === 0) return [];
    
    const targetTruck = String(truckNo || '').trim();
    let searchDb = masterDb;
    if (targetTruck && targetTruck !== '-') {
      const truckMatched = masterDb.filter(m => String(m.truck_no || '').trim() === targetTruck);
      if (truckMatched.length > 0) searchDb = truckMatched;
    }

    return findTopContainerMatches(containerNo, searchDb, 4);
  }, [containerNo, truckNo, masterDb]);

  // ตรวจสอบว่าตรงกับแถวใดใน Master DB หรือไม่
  const exactDbMatch = useMemo(() => {
    if (!containerNo || masterDb.length === 0) return null;
    const cleanCno = String(containerNo).trim().toUpperCase();
    const cleanPort = String(port).trim().toUpperCase();

    const matches = masterDb.filter(m => String(m.container_no || '').trim().toUpperCase() === cleanCno);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    if (cleanPort) {
      const pMatch = matches.find(m => String(m.port || '').trim().toUpperCase().includes(cleanPort));
      if (pMatch) return pMatch;
    }
    return matches[0];
  }, [containerNo, port, masterDb]);

  if (!item) return null;

  // 🎯 เมื่อคลิกเลือกตัวเลือก Candidate หรือกดปุ่ม Auto-fill
  const handleApplyCandidate = (cand) => {
    if (!cand) return;
    const target = cand.record || cand;
    const cNo = (cand.container_no || target.container_no || containerNo || '').trim().toUpperCase();
    setContainerNo(cNo);

    if (target.port && target.port !== '-') {
      setPort(String(target.port).trim());
    }
    if (target.size && target.size !== '-') {
      const digits = String(target.size).replace(/[^0-9]/g, '');
      if (digits) setSize(digits);
    }
    if (target.dis_load) {
      const upper = String(target.dis_load).toUpperCase();
      if (upper.includes('LOAD') || upper === 'L') {
        setJobType('LOAD');
      } else if (upper.includes('DIS') || upper === 'D') {
        setJobType('DIS');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!containerNo.trim()) {
      alert('กรุณากรอกเลขตู้');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        container_no: containerNo.trim().toUpperCase(),
        job_type: jobType,
        port: port.trim() || '-',
        size: size.trim() || '20',
        truck_no: truckNo.trim() || item.truck_no || '-'
      });
      onClose();
    } catch (err) {
      console.error('Save error:', err);
      alert('เกิดข้อผิดพลาดในการบันทึก: ' + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.7)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '14px',
        width: '100%',
        maxWidth: showImagePreview ? '1160px' : '560px',
        maxHeight: '92vh',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'max-width 0.25s ease',
        animation: 'fadeIn 0.2s ease'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                ✏️ แก้ไขข้อมูลตู้
              </span>
              
              <span style={{ 
                fontSize: '11.5px', 
                color: '#0369a1', 
                background: '#e0f2fe', 
                border: '1px solid #bae6fd', 
                padding: '2px 8px', 
                borderRadius: '6px', 
                fontWeight: 700 
              }}>
                📄 บรรทัดที่ {item.line_no && item.line_no !== '-' ? item.line_no : (item.rowIndex || '-')}
              </span>

              <span style={{ 
                fontSize: '11.5px', 
                color: item.workflow_status === 'completed' ? '#15803d' : '#b45309', 
                background: item.workflow_status === 'completed' ? '#dcfce7' : '#fef3c7', 
                border: item.workflow_status === 'completed' ? '1px solid #bbf7d0' : '1px solid #fde68a', 
                padding: '2px 8px', 
                borderRadius: '6px', 
                fontWeight: 700 
              }}>
                {item.workflow_status === 'completed' ? '🟢 บันทึกแล้ว' : '⏳ รอตรวจ'}
              </span>
            </div>

            <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span>🚚 เบอร์รถ: <b style={{ color: '#0f172a' }}>{item.truck_no || '-'}</b></span>
              <span style={{ color: '#cbd5e1' }}>•</span>
              <span>📦 รอบงาน: <b style={{ color: '#0f172a' }}>{item.batch_name || '-'}</b></span>
              {item.image_name && item.image_name !== '-' && (
                <>
                  <span style={{ color: '#cbd5e1' }}>•</span>
                  <span>📄 รูปภาพ: <b style={{ color: '#0f172a' }}>{item.image_name}</b></span>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {/* ปุ่มเปิด/ปิดรูปภาพใบงาน */}
            {(directImageUrl || iframePreviewUrl) && (
              <button
                type="button"
                onClick={() => setShowImagePreview(!showImagePreview)}
                style={{
                  height: '34px',
                  padding: '0 12px',
                  borderRadius: '7px',
                  border: showImagePreview ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                  background: showImagePreview ? '#eff6ff' : '#ffffff',
                  color: showImagePreview ? '#1d4ed8' : '#334155',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: showImagePreview ? '0 1px 3px rgba(37,99,235,0.15)' : '0 1px 2px rgba(0,0,0,0.03)',
                  transition: 'all 0.15s ease'
                }}
                title={showImagePreview ? 'ซ่อนรูปภาพใบงาน' : 'เปิดดูรูปภาพใบงานคู่กับฟอร์ม'}
              >
                <span>🖼️</span>
                <span>{showImagePreview ? 'ซ่อนรูปภาพ' : 'ดูรูปใบงาน'}</span>
              </button>
            )}

            {/* ปุ่มเปิด Drive ในแท็บใหม่ */}
            {driveWebLink && driveWebLink !== '#' && (
              <a
                href={driveWebLink}
                target="_blank"
                rel="noreferrer"
                style={{
                  height: '34px',
                  padding: '0 11px',
                  borderRadius: '7px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: '12px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  transition: 'all 0.15s ease'
                }}
                title="เปิดรูปภาพใน Google Drive แท็บใหม่"
              >
                <span>↗️ Drive</span>
              </a>
            )}

            <button
              onClick={onClose}
              style={{
                width: '34px',
                height: '34px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                fontSize: '16px',
                color: '#64748b',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                borderRadius: '7px',
                transition: 'all 0.15s ease'
              }}
              title="ปิดหน้าต่าง"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Main Body (Supports Side-by-Side View) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: showImagePreview ? '1.2fr 1fr' : '1fr',
          overflowY: 'auto',
          flex: 1
        }}>
          {/* Left Side: Image Preview Viewer with Pan & Drag */}
          {showImagePreview && (
            <div style={{
              background: '#0f172a',
              borderRight: '1px solid #334155',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              maxHeight: 'calc(92vh - 120px)',
              position: 'relative'
            }}>
              {/* Image Controls Bar */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
                padding: '5px 10px',
                background: 'rgba(30, 41, 59, 0.95)',
                borderRadius: '6px',
                color: '#e2e8f0',
                fontSize: '12px'
              }}>
                <span style={{ fontWeight: 600, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  📄 {item.image_name || 'Job Sheet Image'}
                </span>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {iframePreviewUrl && (
                    <button
                      type="button"
                      onClick={() => setUseIframeViewer(!useIframeViewer)}
                      style={{
                        background: useIframeViewer ? '#2563eb' : '#334155',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '2px 8px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 600
                      }}
                      title="สลับระหว่างโหมดรูปตรง กับ โหมด Google Drive Viewer"
                    >
                      {useIframeViewer ? '🖼️ โหมดรูปภาพ' : '🖥️ Drive Viewer'}
                    </button>
                  )}

                  {!useIframeViewer && (
                    <>
                      <button
                        type="button"
                        onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.25))}
                        style={{ background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontWeight: 'bold' }}
                        title="ย่อรูป"
                      >
                        -
                      </button>
                      <span style={{ fontSize: '11px', minWidth: '36px', textAlign: 'center' }}>{Math.round(zoomLevel * 100)}%</span>
                      <button
                        type="button"
                        onClick={() => setZoomLevel(prev => Math.min(5, prev + 0.25))}
                        style={{ background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontWeight: 'bold' }}
                        title="ขยายรูป"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={handleResetView}
                        style={{ background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontSize: '10.5px' }}
                        title="รีเซ็ตตำแหน่งและขนาด"
                      >
                        รีเซ็ต
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Scrollable & Draggable Image Area */}
              <div
                onMouseDown={!useIframeViewer ? handleMouseDown : undefined}
                onMouseMove={!useIframeViewer ? handleMouseMove : undefined}
                onMouseUp={!useIframeViewer ? handleMouseUp : undefined}
                onMouseLeave={!useIframeViewer ? handleMouseUp : undefined}
                onWheel={!useIframeViewer ? handleWheel : undefined}
                onDoubleClick={!useIframeViewer ? () => {
                  if (zoomLevel === 1) {
                    setZoomLevel(2);
                  } else {
                    handleResetView();
                  }
                } : undefined}
                style={{
                  overflow: 'hidden',
                  position: 'relative',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '8px',
                  background: '#020617',
                  minHeight: '400px',
                  cursor: useIframeViewer ? 'default' : (isDragging ? 'grabbing' : 'grab'),
                  userSelect: 'none'
                }}
                title={!useIframeViewer ? "🖱️ คลิกลาก (Drag) เพื่อเลื่อน | กลิ้งเมาส์ (Scroll) เพื่อซูม | ดับเบิ้ลคลิกเพื่อขยาย 2x" : ""}
              >
                {useIframeViewer && iframePreviewUrl ? (
                  <iframe
                    src={iframePreviewUrl}
                    title="Google Drive Image Viewer"
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    allow="autoplay"
                    style={{ borderRadius: '6px', minHeight: '400px', border: 'none' }}
                  />
                ) : directImageUrl ? (
                  <img
                    src={imgLoadError ? thumbnailImageUrl : directImageUrl}
                    alt={item.image_name || item.container_no}
                    referrerPolicy="no-referrer"
                    draggable={false}
                    style={{
                      transform: `translate(${position.x}px, ${position.y}px) scale(${zoomLevel})`,
                      transformOrigin: 'center center',
                      transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                      maxWidth: '92%',
                      maxHeight: '92%',
                      objectFit: 'contain',
                      pointerEvents: 'none',
                      userSelect: 'none'
                    }}
                    onError={() => {
                      if (!imgLoadError && thumbnailImageUrl) {
                        setImgLoadError(true);
                      } else if (iframePreviewUrl) {
                        setUseIframeViewer(true);
                      }
                    }}
                  />
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '40px' }}>
                    📭 ไม่พบ URL รูปภาพใบงาน
                  </div>
                )}

                {/* Drag Hint Overlay at bottom */}
                {!useIframeViewer && (
                  <div style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(15, 23, 42, 0.75)',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    fontSize: '10.5px',
                    color: '#94a3b8',
                    pointerEvents: 'none',
                    backdropFilter: 'blur(3px)'
                  }}>
                    🖱️ คลิกลากเพื่อเลื่อนดูบรรทัด • กลิ้งเมาส์เพื่อซูม
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right Side (or Full Width): Edit Form */}
          <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 1. เลขตู้ (Container No) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                  🔢 เลขตู้ (Container No) <span style={{ color: '#dc2626' }}>*</span>
                </label>
                {item.raw_ocr_text && item.raw_ocr_text !== containerNo && (
                  <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                    ข้อความดิบ OCR: <b>{item.raw_ocr_text}</b>
                  </span>
                )}
              </div>
              <input
                type="text"
                value={containerNo}
                onChange={(e) => setContainerNo(e.target.value.toUpperCase())}
                placeholder="เช่น IAAU2765502"
                autoFocus
                style={{
                  width: '100%',
                  height: '42px',
                  padding: '0 14px',
                  borderRadius: '8px',
                  border: exactDbMatch ? '1.5px solid #16a34a' : '1px solid #cbd5e1',
                  background: exactDbMatch ? '#f0fdf4' : '#ffffff',
                  fontFamily: "'SF Mono', Consolas, Monaco, monospace",
                  fontSize: '16px',
                  fontWeight: 800,
                  color: exactDbMatch ? '#15803d' : '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Status Indicator Bar */}
            <div style={{
              padding: '10px 12px',
              borderRadius: '8px',
              background: exactDbMatch ? '#f0fdf4' : '#fef2f2',
              border: exactDbMatch ? '1px solid #bbf7d0' : '1px solid #fecaca',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, color: exactDbMatch ? '#15803d' : '#dc2626' }}>
                  {exactDbMatch ? '🟢 ตรงกับฐานข้อมูลใบวางบิล' : '🔴 ไม่พบในฐานข้อมูลใบวางบิล'}
                </span>
                {exactDbMatch && (
                  <span style={{ color: '#166534', fontSize: '11.5px' }}>
                    ประเภท: <b>{exactDbMatch.dis_load || '-'}</b> | ท่า: <b>{exactDbMatch.port || '-'}</b> | S<b>{exactDbMatch.size || '-'}</b>
                  </span>
                )}
              </div>

              {/* ⚡ ปุ่มกดดึงข้อมูลอัตโนมัติจากใบวางบิล */}
              {exactDbMatch && (
                <button
                  type="button"
                  onClick={() => handleApplyCandidate(exactDbMatch)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    border: '1px solid #86efac',
                    background: '#ffffff',
                    color: '#15803d',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    marginTop: '2px'
                  }}
                  title="คลิกเพื่อเติมข้อมูล ท่าเรือ / ขนาด / ประเภทงาน ให้ตรงกับใบวางบิลนี้อัตโนมัติ"
                >
                  <span>⚡ ดึงข้อมูลใบวางบิลนี้อัตโนมัติ</span>
                  <span>(ท่า {exactDbMatch.port || '-'}, S{exactDbMatch.size || '-'}, {exactDbMatch.dis_load || '-'})</span>
                </button>
              )}
            </div>

            {/* 2. ประเภทงาน (Job Type: DIS vs LOAD) */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                🏷️ ประเภทงาน (Job Type)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setJobType('DIS')}
                  style={{
                    height: '40px',
                    borderRadius: '8px',
                    border: jobType === 'DIS' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                    background: jobType === 'DIS' ? '#f0f9ff' : '#ffffff',
                    color: jobType === 'DIS' ? '#0369a1' : '#64748b',
                    fontWeight: 800,
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>📥</span>
                  <span>DIS (Discharge)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setJobType('LOAD')}
                  style={{
                    height: '40px',
                    borderRadius: '8px',
                    border: jobType === 'LOAD' ? '2px solid #ea580c' : '1px solid #cbd5e1',
                    background: jobType === 'LOAD' ? '#fff7ed' : '#ffffff',
                    color: jobType === 'LOAD' ? '#c2410c' : '#64748b',
                    fontWeight: 800,
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>📤</span>
                  <span>LOAD</span>
                </button>
              </div>
            </div>

            {/* 3. ท่าเรือ & ขนาดตู้ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  ⚓ ท่าเรือ (Port)
                </label>
                <input
                  type="text"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="เช่น A2, 26086A2, B1"
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    borderRadius: '7px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13.5px',
                    fontWeight: 600,
                    color: '#0f172a',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  📐 ขนาดตู้ (Size)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                  {['20', '40', '45'].map(sz => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setSize(sz)}
                      style={{
                        height: '38px',
                        borderRadius: '7px',
                        border: size === sz ? '2px solid #2563eb' : '1px solid #cbd5e1',
                        background: size === sz ? '#eff6ff' : '#ffffff',
                        color: size === sz ? '#1d4ed8' : '#64748b',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      {sz}'
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Candidates Suggestion Bar */}
            {candidateMatches.length > 0 && !exactDbMatch && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>
                  💡 ตัวเลือกแนะนำจากใบวางบิล (คลิกเพื่อเลือกใช้อัตโนมัติ):
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {candidateMatches.map((cand, idx) => {
                    const cRecord = cand.record || {};
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleApplyCandidate(cand)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '6px',
                          border: '1px solid #bfdbfe',
                          background: '#ffffff',
                          color: '#1d4ed8',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}
                      >
                        <span>{cand.container_no}</span>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                          ({cRecord.dis_load || cand.dis_load || '-'} ท่า {cRecord.port || cand.port || '-'} S{cRecord.size || cand.size || '-'})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer Actions */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              marginTop: '8px',
              borderTop: '1px solid #f1f5f9',
              paddingTop: '16px'
            }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  style={{
                    height: '38px',
                    padding: '0 16px',
                    borderRadius: '7px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: isSaving ? 'not-allowed' : 'pointer'
                  }}
                >
                  ยกเลิก
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  style={{
                    height: '38px',
                    padding: '0 20px',
                    borderRadius: '7px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    cursor: isSaving ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 1px 3px rgba(37, 99, 235, 0.3)'
                  }}
                >
                  {isSaving ? '⏳ กำลังบันทึก...' : '💾 บันทึกการแก้ไข'}
                </button>
              </div>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
