import React from 'react';

/**
 * 👁️ ColumnVisibilityDropdown
 * Reusable dropdown for toggling column visibility, renaming columns, and resetting all aliases.
 */
export default function ColumnVisibilityDropdown({
  showColumnMenu,
  setShowColumnMenu,
  menuRef,
  allColumns = [],
  activeColumns = [],
  visibleColumns = {},
  onToggleColumnVisibility,
  getColDisplayName = (c) => c,
  onStartEditAlias,
  onShowAllColumns,
  onResetAllAliases
}) {
  return (
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button 
        onClick={() => setShowColumnMenu(!showColumnMenu)}
        style={{ 
          height: '36px',
          padding: '0 12px', 
          borderRadius: '7px', 
          background: showColumnMenu ? '#f1f5f9' : '#ffffff', 
          border: '1px solid #cbd5e1', 
          color: '#334155',
          fontSize: '12.5px',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 0.15s ease'
        }}
      >
        <span>👁️</span>
        <span>คอลัมน์ ({activeColumns.length}/{allColumns.length})</span>
      </button>

      {showColumnMenu && (
        <div style={{ 
          position: 'absolute', 
          top: '100%', 
          right: 0, 
          marginTop: '6px', 
          background: '#ffffff', 
          border: '1px solid #e2e8f0', 
          borderRadius: '8px', 
          padding: '12px', 
          zIndex: 100,
          width: '240px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
          maxHeight: '350px',
          overflowY: 'auto'
        }}>
          {/* Header & Quick Unhide All */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: '8px', 
            borderBottom: '1px solid #f1f5f9', 
            paddingBottom: '6px' 
          }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
              คอลัมน์ ({activeColumns.length}/{allColumns.length})
            </span>
            {onShowAllColumns && activeColumns.length < allColumns.length && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShowAllColumns();
                }}
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '4px',
                  color: '#2563eb',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '2px 6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
                title="ยกเลิกการซ่อนและแสดงคอลัมน์ทั้งหมด"
              >
                <span>👁️</span>
                <span>แสดงทั้งหมด</span>
              </button>
            )}
          </div>

          {/* List of Columns */}
          {allColumns.map(col => (
            <div key={col} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                <input 
                  type="checkbox" 
                  checked={visibleColumns[col] !== false} 
                  onChange={() => onToggleColumnVisibility && onToggleColumnVisibility(col)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getColDisplayName(col)}
                </span>
              </label>
              {onStartEditAlias && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowColumnMenu(false);
                    onStartEditAlias(col);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '2px 5px',
                    fontSize: '11px',
                    borderRadius: '4px',
                    flexShrink: 0
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#2563eb'; e.currentTarget.style.background = '#eff6ff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'none'; }}
                  title={`เปลี่ยนชื่อคอลัมน์ "${getColDisplayName(col)}"`}
                >
                  ✏️
                </button>
              )}
            </div>
          ))}

          {/* Footer: Reset All Aliases */}
          {onResetAllAliases && (
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={() => {
                  setShowColumnMenu(false);
                  onResetAllAliases();
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#64748b',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
              >
                <span>🔄</span>
                <span>รีเซ็ตชื่อคอลัมน์ทั้งหมด</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
