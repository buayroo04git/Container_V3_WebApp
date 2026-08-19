import React, { useState, useMemo } from 'react';

const extractDriveId = (url, driveId) => {
  if (driveId && typeof driveId === 'string' && driveId.length > 5) return driveId;
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];
  return null;
};

/**
 * 🖼️ High-Res Image Preview Modal for Container Job Sheets
 * รองรับ Pan & Drag, Mouse Wheel Zoom, Google Drive Viewer Iframe
 */
export default function ContainerImageModal({ previewImage, onClose }) {
  const [useIframe, setUseIframe] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const driveId = useMemo(() => {
    return extractDriveId(previewImage?.url, previewImage?.drive_file_id);
  }, [previewImage]);

  const directImageUrl = useMemo(() => {
    if (driveId) return `https://lh3.googleusercontent.com/d/${driveId}`;
    return previewImage?.url || null;
  }, [driveId, previewImage]);

  const thumbnailImageUrl = useMemo(() => {
    if (driveId) return `https://drive.google.com/thumbnail?id=${driveId}&sz=w1600`;
    return directImageUrl;
  }, [driveId, directImageUrl]);

  const iframeUrl = useMemo(() => {
    if (driveId) return `https://drive.google.com/file/d/${driveId}/preview`;
    return null;
  }, [driveId]);

  const directDriveLink = useMemo(() => {
    if (driveId) return `https://drive.google.com/file/d/${driveId}/view?usp=sharing`;
    return previewImage?.url || '#';
  }, [driveId, previewImage]);

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

  const handleReset = () => {
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
  };

  if (!previewImage) return null;

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease'
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '14px',
          overflow: 'hidden',
          maxWidth: '1000px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          border: '1px solid #e2e8f0'
        }}
      >
        <div style={{
          padding: '12px 18px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🖼️</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
              รูปภาพใบงาน: {previewImage.name || 'Job Sheet'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {iframeUrl && (
              <button
                type="button"
                onClick={() => setUseIframe(!useIframe)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: useIframe ? '#2563eb' : '#ffffff',
                  color: useIframe ? '#ffffff' : '#334155',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {useIframe ? '🖼️ โหมดรูปภาพ' : '🖥️ Drive Viewer'}
              </button>
            )}

            {!useIframe && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '6px' }}>
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.25))}
                  style={{ background: '#e2e8f0', border: 'none', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  -
                </button>
                <span style={{ fontSize: '11px', minWidth: '34px', textAlign: 'center', fontWeight: 600 }}>{Math.round(zoomLevel * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.min(5, prev + 0.25))}
                  style={{ background: '#e2e8f0', border: 'none', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '11px', cursor: 'pointer', marginLeft: '4px' }}
                >
                  รีเซ็ต
                </button>
              </div>
            )}

            <a
              href={directDriveLink}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontSize: '12.5px',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ↗️ เปิดใน Drive
            </a>

            <button
              onClick={onClose}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                border: 'none',
                background: '#ef4444',
                color: '#ffffff',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ✕ ปิด
            </button>
          </div>
        </div>

        <div 
          onMouseDown={!useIframe ? handleMouseDown : undefined}
          onMouseMove={!useIframe ? handleMouseMove : undefined}
          onMouseUp={!useIframe ? handleMouseUp : undefined}
          onMouseLeave={!useIframe ? handleMouseUp : undefined}
          onWheel={!useIframe ? handleWheel : undefined}
          onDoubleClick={!useIframe ? () => { if (zoomLevel === 1) setZoomLevel(2); else handleReset(); } : undefined}
          style={{
            overflow: 'hidden',
            position: 'relative',
            background: '#020617',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '520px',
            flex: 1,
            cursor: useIframe ? 'default' : (isDragging ? 'grabbing' : 'grab'),
            userSelect: 'none'
          }}
          title={!useIframe ? "🖱️ คลิกลาก (Drag) เพื่อเลื่อน | กลิ้งเมาส์เพื่อซูม | ดับเบิ้ลคลิกเพื่อขยาย 2x" : ""}
        >
          {useIframe && iframeUrl ? (
            <iframe
              src={iframeUrl}
              title="Google Drive Viewer"
              width="100%"
              height="550px"
              frameBorder="0"
              allow="autoplay"
              style={{ borderRadius: '6px', border: 'none' }}
            />
          ) : directImageUrl ? (
            <img
              src={loadError ? thumbnailImageUrl : directImageUrl}
              alt={previewImage.name}
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
                if (!loadError && thumbnailImageUrl) {
                  setLoadError(true);
                } else if (iframeUrl) {
                  setUseIframe(true);
                }
              }}
            />
          ) : (
            <div style={{ color: '#94a3b8', fontSize: '13px' }}>
              📭 ไม่พบ URL รูปภาพ
            </div>
          )}

          {!useIframe && (
            <div style={{
              position: 'absolute',
              bottom: '10px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.75)',
              padding: '3px 12px',
              borderRadius: '20px',
              fontSize: '11px',
              color: '#94a3b8',
              pointerEvents: 'none',
              backdropFilter: 'blur(3px)'
            }}>
              🖱️ คลิกลากเพื่อเลื่อนดู • กลิ้งลูกกลิ้งเมาส์เพื่อซูม
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
