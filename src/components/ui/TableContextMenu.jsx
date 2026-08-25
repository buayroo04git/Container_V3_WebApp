import React from 'react';

/**
 * 📋 Universal Header Right-Click Context Menu
 */
export default function TableContextMenu({
  contextMenu,
  onClose,
  onStartEditAlias,
  onAutoFitColumn,
  onAutoFitAllColumns,
  onToggleColumnHide,
  onShowAllColumns,
  onResetColumnWidth,
  onResetAllWidths,
  onResetColumnOrder,
  getColDisplayName
}) {
  if (!contextMenu) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: Math.min(contextMenu.y, window.innerHeight - 240),
        left: Math.min(contextMenu.x, window.innerWidth - 220),
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
        zIndex: 9999,
        padding: '6px 0',
        minWidth: '200px',
        fontSize: '13px',
        color: '#1e293b'
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{
        padding: '6px 14px',
        fontSize: '11px',
        fontWeight: 700,
        color: '#64748b',
        borderBottom: '1px solid #f1f5f9',
        marginBottom: '4px'
      }}>
        คอลัมน์: {getColDisplayName ? getColDisplayName(contextMenu.col) : contextMenu.col}
      </div>

      {onStartEditAlias && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStartEditAlias(contextMenu.col);
            onClose();
          }}
          style={{
            width: '100%',
            padding: '8px 14px',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12.5px',
            color: '#0f172a'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
        >
          ✏️ เปลี่ยนชื่อคอลัมน์ (Rename)
        </button>
      )}

      {onAutoFitColumn && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAutoFitColumn(contextMenu.col);
            onClose();
          }}
          style={{
            width: '100%',
            padding: '8px 14px',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12.5px',
            color: '#0f172a'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
        >
          ↔️ ปรับขนาดพอดีข้อความ (Auto-fit)
        </button>
      )}

      {onAutoFitAllColumns && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAutoFitAllColumns();
            onClose();
          }}
          style={{
            width: '100%',
            padding: '8px 14px',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12.5px',
            color: '#0284c7',
            fontWeight: 600
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#f0f9ff'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
        >
          ⚡ ปรับขนาดพอดีทุกคอลัมน์ (Auto-fit All)
        </button>
      )}

      {onToggleColumnHide && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleColumnHide(contextMenu.col);
            onClose();
          }}
          style={{
            width: '100%',
            padding: '8px 14px',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12.5px',
            color: '#dc2626'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
        >
          👁️ ซ่อนคอลัมน์นี้ (Hide)
        </button>
      )}

      {onShowAllColumns && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onShowAllColumns();
            onClose();
          }}
          style={{
            width: '100%',
            padding: '8px 14px',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12.5px',
            color: '#2563eb'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#eff6ff'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
        >
          👁️ ยกเลิกการซ่อนทั้งหมด (Unhide All)
        </button>
      )}

      <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 0' }} />

      {onResetColumnWidth && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onResetColumnWidth(contextMenu.col);
            onClose();
          }}
          style={{
            width: '100%',
            padding: '8px 14px',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#64748b'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
        >
          🔄 คืนค่าความกว้างเดิม (คอลัมน์นี้)
        </button>
      )}

      {onResetAllWidths && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onResetAllWidths();
            onClose();
          }}
          style={{
            width: '100%',
            padding: '8px 14px',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#64748b'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
        >
          🔄 รีเซ็ตความกว้างทุกคอลัมน์
        </button>
      )}

      {onResetColumnOrder && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onResetColumnOrder();
            onClose();
          }}
          style={{
            width: '100%',
            padding: '8px 14px',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#64748b'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
        >
          🔀 รีเซ็ตลำดับคอลัมน์ทั้งหมด
        </button>
      )}
    </div>
  );
}
