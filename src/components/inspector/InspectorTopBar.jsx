import React from 'react';

/**
 * 🧭 Header แถบควบคุมด้านบนของหน้าตรวจเทียบใบงาน (Inspector View)
 * ปราศจากส่วนผสมกับตารางหรือรูปภาพ แก้ไขได้อิสระ ไม่กระทบส่วนอื่น 100%
 */
export default function InspectorTopBar({
  selectedImage,
  ocrResult,
  currentDriverName,
  availableDrivers = [],
  onDriverNameChange,
  isScanning,
  scanStatusDetail,
  isSaving,
  saveProgress,
  onBack,
  onRescan,
  onStartScan,
  onSave
}) {
  const isCompletedEdit = selectedImage?.isCompletedEdit;
  const truckNo = selectedImage?.truckNo || selectedImage?.truckGuess || ocrResult?.truck_no || '-';
  const batchName = selectedImage?.batchGuess || selectedImage?.batch_name || '-';
  const driverName = (selectedImage?.driver_name && selectedImage.driver_name !== '-')
    ? selectedImage.driver_name
    : (currentDriverName && currentDriverName !== '-' ? currentDriverName : (ocrResult?.driver_name || '-'));

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 16px',
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      marginBottom: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      flexWrap: 'wrap',
      gap: '10px'
    }}>
      {/* ฝั่งซ้าย: ปุ่มย้อนกลับ & ข้อมูลใบงาน */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={onBack}
          style={{
            height: '34px',
            padding: '0 12px',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            color: '#334155',
            fontSize: '12.5px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f1f5f9';
            e.currentTarget.style.borderColor = '#94a3b8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#f8fafc';
            e.currentTarget.style.borderColor = '#cbd5e1';
          }}
        >
          <span>←</span>
          <span>{isCompletedEdit ? 'กลับหน้า Completed' : 'กลับคิวงาน Pending'}</span>
        </button>

        {/* ข้อมูลใบงาน (ข้อความเรียงกันสะอาดตา ไร้กรอบซ้อน) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: '#475569' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#94a3b8', fontWeight: 600 }}>ไฟล์:</span>
            <span style={{ fontWeight: 700, color: '#0f172a', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedImage?.name || ''}>
              {selectedImage?.name || 'Job_Sheet'}
            </span>
          </div>

          <span style={{ color: '#cbd5e1' }}>|</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#94a3b8', fontWeight: 600 }}>🚚 ทะเบียนรถ:</span>
            <span style={{
              fontWeight: 800,
              color: truckNo !== '-' && truckNo !== 'รอสแกน' ? '#1d4ed8' : '#64748b',
              background: truckNo !== '-' && truckNo !== 'รอสแกน' ? '#eff6ff' : '#f1f5f9',
              padding: '1px 6px',
              borderRadius: '4px'
            }}>
              {truckNo}
            </span>
          </div>

          <span style={{ color: '#cbd5e1' }}>|</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#94a3b8', fontWeight: 600 }}>คนขับ:</span>
            {availableDrivers && availableDrivers.length > 0 ? (
              <select
                value={driverName || '-'}
                onChange={(e) => onDriverNameChange && onDriverNameChange(e.target.value)}
                style={{
                  fontSize: '12.5px',
                  fontWeight: 700,
                  color: driverName && driverName !== '-' ? '#0f172a' : '#64748b',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '2px 8px',
                  cursor: 'pointer',
                  outline: 'none',
                  maxWidth: '180px'
                }}
              >
                <option value="-">- ไม่ระบุคนขับ -</option>
                {driverName && driverName !== '-' && !availableDrivers.includes(driverName) && (
                  <option value={driverName}>{driverName}</option>
                )}
                {availableDrivers.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            ) : (
              <span style={{ fontWeight: 700, color: '#334155' }}>
                {driverName}
              </span>
            )}
          </div>

          <span style={{ color: '#cbd5e1' }}>|</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#94a3b8', fontWeight: 600 }}>📅 รอบงาน:</span>
            <span style={{ fontWeight: 700, color: '#334155' }}>
              {batchName}
            </span>
          </div>
        </div>
      </div>

      {/* ฝั่งขวา: ปุ่มแอ็กชัน สแกนใหม่ / สแกน OCR / บันทึกผล */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {ocrResult && (
          <button
            onClick={onRescan}
            disabled={isScanning}
            style={{
              height: '34px',
              padding: '0 12px',
              borderRadius: '6px',
              border: isScanning ? '1px solid #93c5fd' : '1px solid #cbd5e1',
              background: isScanning ? '#eff6ff' : '#ffffff',
              color: isScanning ? '#1d4ed8' : '#475569',
              fontSize: '12px',
              fontWeight: 700,
              cursor: isScanning ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}
            title="ล้างข้อมูลเดิมและสั่ง AI อ่านใบงานภาพนี้ใหม่อีกครั้ง"
          >
            <span>🔄</span>
            <span>{isScanning ? (scanStatusDetail || 'กำลังสแกนใหม่...') : 'สแกนใหม่'}</span>
          </button>
        )}

        {!ocrResult ? (
          <button
            onClick={onStartScan}
            disabled={isScanning}
            style={{
              height: '34px',
              padding: '0 16px',
              borderRadius: '6px',
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)'
            }}
          >
            {isScanning ? (scanStatusDetail || '⏳ กำลังสแกน...') : '🚀 สแกน OCR ใบนี้'}
          </button>
        ) : (
          <button
            onClick={onSave}
            disabled={isSaving}
            style={{
              height: '34px',
              padding: '0 16px',
              borderRadius: '6px',
              border: 'none',
              background: '#10b981',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)'
            }}
          >
            {isSaving ? `⏳ ${saveProgress || 'กำลังบันทึก...'}` : '💾 บันทึกใบงานนี้'}
          </button>
        )}
      </div>
    </div>
  );
}
