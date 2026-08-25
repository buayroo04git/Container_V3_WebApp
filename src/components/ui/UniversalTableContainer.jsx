import React, { useEffect } from 'react';
import TableContextMenu from './TableContextMenu';
import RenameColumnModal from './RenameColumnModal';

/**
 * 📦 UniversalTableContainer: Core Table Shell Wrapper
 * 
 * ทำหน้าที่เป็นโครงสร้างหลักของตารางทุกตัวในระบบ:
 * 1. ห่อหุ้ม Scroll Area ของตารางด้วย Fixed Layout มาตรฐาน
 * 2. จัดการ Right-Click Context Menu และ Rename Modal ให้อัตโนมัติ 100%
 * 3. ปิด Context Menu อัตโนมัติเมื่อคลิกพื้นที่อื่น
 */
export default function UniversalTableContainer({
  preferences,
  children,
  style = {},
  tableStyle = {}
}) {
  const {
    contextMenu,
    setContextMenu,
    renamingColumn,
    setRenamingColumn,
    handleStartRename,
    handleAutoFitColumn,
    handleAutoFitAllColumns,
    handleToggleColumnHide,
    handleShowAllColumns,
    handleResetColumnWidth,
    handleResetAllColumnWidths,
    handleResetColumnOrder,
    getColDisplayName,
    handleSaveAlias,
    handleResetAlias
  } = preferences || {};

  // Close context menu on outside click or escape key
  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu && setContextMenu) {
        setContextMenu(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (contextMenu && setContextMenu) setContextMenu(null);
      }
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu, setContextMenu]);

  const totalTableWidth = preferences?.activeColumns?.reduce((sum, col) => {
    const w = preferences.columnWidths?.[col] || (preferences.getDefaultColWidth ? preferences.getDefaultColWidth(col) : 120);
    return sum + Number(w || 120);
  }, 0);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)',
        overflow: 'hidden',
        position: 'relative',
        ...style
      }}
    >
      {/* Scrollable Table Viewport */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        position: 'relative'
      }}>
        <table
          className="universal-data-table"
          style={{
            width: '100%',
            minWidth: totalTableWidth ? `${totalTableWidth}px` : '100%',
            tableLayout: 'fixed',
            borderCollapse: 'collapse',
            fontSize: '13px',
            textAlign: 'left',
            ...tableStyle
          }}
        >
          {children}
        </table>
        <style>{`
          .universal-data-table th,
          .universal-data-table td {
            white-space: nowrap !important;
          }
        `}</style>
      </div>

      {/* 🖱️ Global Header Context Menu */}
      {preferences && (
        <TableContextMenu
          contextMenu={contextMenu}
          onClose={() => setContextMenu && setContextMenu(null)}
          onStartEditAlias={handleStartRename}
          onAutoFitColumn={handleAutoFitColumn}
          onAutoFitAllColumns={handleAutoFitAllColumns}
          onToggleColumnHide={handleToggleColumnHide}
          onShowAllColumns={handleShowAllColumns}
          onResetColumnWidth={handleResetColumnWidth}
          onResetAllWidths={handleResetAllColumnWidths}
          onResetColumnOrder={handleResetColumnOrder}
          getColDisplayName={getColDisplayName}
        />
      )}

      {/* ✏️ Global Rename Column Modal */}
      {preferences && (
        <RenameColumnModal
          renamingColumn={renamingColumn}
          onClose={() => setRenamingColumn && setRenamingColumn(null)}
          onSaveAlias={handleSaveAlias}
          onResetAlias={handleResetAlias}
        />
      )}
    </div>
  );
}
