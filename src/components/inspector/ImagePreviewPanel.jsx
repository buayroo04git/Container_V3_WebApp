import React from 'react';

/**
 * 🖼️ โซนแสดงรูปภาพและปรับแต่งฟิลเตอร์ภาพถ่ายใบงาน (Left Image Zone)
 * ทำงานแยกขาดจากตารางและเมนูด้านบน ไม่ส่งผลข้างเคียงใดๆ
 */
export default function ImagePreviewPanel({
  selectedImage,
  processedImageUrl,
  currentFilter,
  onFilterChange,
  onDownload
}) {
  const imageSrc = processedImageUrl 
    || selectedImage?.url 
    || selectedImage?.thumbnailLink 
    || (selectedImage?.drive_file_id ? `https://drive.google.com/thumbnail?id=${selectedImage.drive_file_id}&sz=w1600` : '');

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      maxWidth: '340px',
      boxSizing: 'border-box',
      boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
    }}>
      
      {/* แถบควบคุมรูปภาพด้านบน (กล่องเลือกฟิลเตอร์ + ปุ่มเซฟรูป อยู่ในแถวเดียวกัน ระนาบเดียวกับสรุปยอดฝั่งขวาเป๊ะ 42px) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '10px',
        borderBottom: '1px solid #f1f5f9',
        marginBottom: '10px',
        height: '42px',
        boxSizing: 'border-box',
        gap: '8px'
      }}>
        {/* กล่องเลือกฟิลเตอร์ภาพ */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: '#f8fafc',
          border: '1px solid #cbd5e1',
          borderRadius: '6px',
          padding: '0 8px',
          height: '32px',
          flex: 1,
          minWidth: 0,
          boxSizing: 'border-box'
        }}>
          <span style={{ fontSize: '13px' }}>🎨</span>
          <select
            value={currentFilter}
            onChange={onFilterChange}
            style={{
              width: '100%',
              height: '28px',
              border: 'none',
              background: 'transparent',
              fontSize: '12px',
              fontWeight: 700,
              color: '#0f172a',
              outline: 'none',
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif"
            }}
          >
            <option value="magic">✨ เมจิกสแกน (Magic)</option>
            <option value="bw">📄 ขาวดำคมชัด (B&W)</option>
            <option value="sharp">🔍 เพิ่มความคมชัด (Sharp)</option>
            <option value="normal">🖼️ ภาพต้นฉบับ (Original)</option>
            <option value="invert">🌓 กลับสี (Invert)</option>
          </select>
        </div>

        {/* ปุ่มบันทึกรูปภาพลงเครื่อง */}
        <button
          onClick={onDownload}
          style={{
            height: '32px',
            padding: '0 10px',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            color: '#1e293b',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            whiteSpace: 'nowrap',
            boxSizing: 'border-box',
            transition: 'all 0.15s ease',
            flexShrink: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f8fafc';
            e.currentTarget.style.borderColor = '#94a3b8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.borderColor = '#cbd5e1';
          }}
          title="ดาวน์โหลดรูปภาพที่แต่งฟิลเตอร์แล้วลงเครื่อง"
        >
          <span>📥</span>
          <span>เซฟรูป</span>
        </button>
      </div>

      {/* กรอบแสดงภาพใบงาน (ธีม Slate Dark Canvas เริ่มต้นตรงแนวเดียวกับตารางฝั่งขวา 1:1) */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        background: '#0f172a',
        borderRadius: '8px',
        border: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px',
        position: 'relative',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
      }}>
        <img
          src={imageSrc}
          alt="preview"
          onError={(e) => {
            const fId = selectedImage?.drive_file_id || selectedImage?.id;
            if (fId && !e.target._failed) {
              e.target._failed = true;
              e.target.src = `https://drive.google.com/thumbnail?id=${fId}&sz=w1600`;
            }
          }}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: '4px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)'
          }}
        />
      </div>
    </div>
  );
}
