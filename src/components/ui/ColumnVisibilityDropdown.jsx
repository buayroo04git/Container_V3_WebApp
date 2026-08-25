import React from 'react';

/**
 * 👁️ ColumnVisibilityDropdown
 * Reusable dropdown for toggling column visibility, renaming columns, auto-fitting all columns, and resetting widths/aliases.
 */
export default function ColumnVisibilityDropdown({
  preferences,
  showColumnMenu: propShowColumnMenu,
  setShowColumnMenu: propSetShowColumnMenu,
  menuRef: propMenuRef,
  allColumns: propAllColumns,
  activeColumns: propActiveColumns,
  visibleColumns: propVisibleColumns,
  onToggleColumnVisibility: propOnToggleColumnVisibility,
  getColDisplayName: propGetColDisplayName,
  onStartEditAlias: propOnStartEditAlias,
  onShowAllColumns: propOnShowAllColumns,
  onResetAllAliases: propOnResetAllAliases,
  onAutoFitAllColumns: propOnAutoFitAllColumns,
  onResetAllWidths: propOnResetAllWidths,
  onResetColumnOrder: propOnResetColumnOrder
}) {
  const showColumnMenu = preferences ? preferences.showColumnMenu : propShowColumnMenu;
  const setShowColumnMenu = preferences ? preferences.setShowColumnMenu : propSetShowColumnMenu;
  const menuRef = preferences ? preferences.menuRef : propMenuRef;
  const allColumns = preferences?.allColumns || propAllColumns || [];
  const activeColumns = preferences?.activeColumns || propActiveColumns || [];
  const visibleColumns = preferences?.visibleColumns || propVisibleColumns || {};
  const onToggleColumnVisibility = preferences ? preferences.handleToggleColumnHide : (propOnToggleColumnVisibility || (() => {}));
  const getColDisplayName = preferences?.getColDisplayName || propGetColDisplayName || ((c) => c);
  const onStartEditAlias = preferences ? preferences.handleStartRename : (propOnStartEditAlias || (() => {}));
  const onShowAllColumns = preferences ? preferences.handleShowAllColumns : (propOnShowAllColumns || (() => {}));
  const onResetAllAliases = preferences ? preferences.handleResetAllAliases : (propOnResetAllAliases || (() => {}));
  const onAutoFitAllColumns = preferences ? preferences.handleAutoFitAllColumns : propOnAutoFitAllColumns;
  const onResetAllWidths = preferences ? preferences.handleResetAllColumnWidths : propOnResetAllWidths;
  const onResetColumnOrder = preferences ? preferences.handleResetColumnOrder : propOnResetColumnOrder;

  return (
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button 
        type="button"
        onClick={() => setShowColumnMenu(!showColumnMenu)}
        style={{ 
          height: '36px',
          padding: '0 12px', 
          borderRadius: '8px', 
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
          borderRadius: '10px', 
          padding: '12px', 
          zIndex: 1000,
          width: '260px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
          maxHeight: '380px',
          overflowY: 'auto'
        }}>
          {/* Header & Quick Actions */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: '8px', 
            borderBottom: '1px solid #f1f5f9', 
            paddingBottom: '8px' 
          }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
              ⚙️ จัดการคอลัมน์ ({activeColumns.length}/{allColumns.length})
            </span>
            {onShowAllColumns && activeColumns.length < allColumns.length && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowAllColumns();
                }}
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '5px',
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

          {/* Quick Auto-Fit & Reset Toolbar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            marginBottom: '10px',
            paddingBottom: '8px',
            borderBottom: '1px solid #f1f5f9'
          }}>
            {onAutoFitAllColumns && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAutoFitAllColumns();
                }}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid #bfdbfe',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
                title="ปรับขนาดความกว้างทุกคอลัมน์ให้พอดีกับข้อมูลอัตโนมัติ"
              >
                <span>⚡</span>
                <span>Auto-fit ทั้งหมด</span>
              </button>
            )}

            {onResetAllWidths && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onResetAllWidths();
                }}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#475569',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
                title="รีเซ็ตความกว้างทุกคอลัมน์กลับเป็นค่าเริ่มต้น"
              >
                <span>🔄</span>
                <span>รีเซ็ตความกว้าง</span>
              </button>
            )}
          </div>

          {/* List of Columns */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {allColumns.map(col => (
              <div key={col} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', padding: '2px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, userSelect: 'none' }}>
                  <input 
                    type="checkbox" 
                    checked={visibleColumns[col] !== false} 
                    onChange={() => onToggleColumnVisibility && onToggleColumnVisibility(col)}
                    style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getColDisplayName(col)}
                  </span>
                </label>
                {onStartEditAlias && (
                  <button
                    type="button"
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
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                    title={`เปลี่ยนชื่อคอลัมน์ "${getColDisplayName(col)}"`}
                  >
                    ✏️
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Footer: Reset All Order & Aliases */}
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {onResetColumnOrder && (
              <button
                type="button"
                onClick={() => {
                  setShowColumnMenu(false);
                  onResetColumnOrder();
                }}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#64748b',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
                title="รีเซ็ตการเรียงลำดับคอลัมน์กลับเป็นค่าเริ่มต้น"
              >
                <span>🔀</span>
                <span>รีเซ็ตลำดับคอลัมน์</span>
              </button>
            )}

            {onResetAllAliases && (
              <button
                type="button"
                onClick={() => {
                  setShowColumnMenu(false);
                  onResetAllAliases();
                }}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#64748b',
                  fontSize: '11px',
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
