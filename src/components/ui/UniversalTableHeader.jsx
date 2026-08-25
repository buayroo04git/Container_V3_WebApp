import React, { useState } from 'react';

/**
 * 📊 UniversalTableHeader: Reusable Excel-grade Table Header Component
 * 
 * มอบมาตรฐานตารางกลางของระบบ:
 * - ↔️ ปรับขนาดคอลัมน์ได้อิสระ (Border Drag Resize พร้อมเส้นไกด์ชัดเจน)
 * - 🔄 ลากสลับตำแหน่งคอลัมน์ได้ (Drag & Drop Reorder)
 * - ↕️ เรียงลำดับข้อมูลอัตโนมัติ (Multi-state Sorting ▲/▼/↕)
 * - 🖱️ เมนูคลิกขวาจัดการคอลัมน์ (Right-Click Context Menu)
 * - ⚡ ดับเบิลคลิกขยายพอดีข้อความ (Double-Click Auto-fit)
 */
export default function UniversalTableHeader({
  preferences,
  data = [],
  alignMap = {},
  defaultWidths = {},
  thStyle = {}
}) {
  const [hoveringResizeCol, setHoveringResizeCol] = useState(null);

  if (!preferences) return null;

  const {
    activeColumns = [],
    columnWidths = {},
    getColDisplayName = (c) => c,
    draggedCol,
    setDraggedCol,
    dragOverCol,
    setDragOverCol,
    handleColumnReorder,
    handleResizeMouseDown,
    handleAutoFitColumn,
    handleHeaderContextMenu,
    sortConfig = { key: null, direction: null },
    handleSort = () => {}
  } = preferences;

  return (
    <>
      {/* Dynamic Colgroup for Fixed Table Layout */}
      <colgroup>
        {activeColumns.map(col => {
          const width = columnWidths[col] || defaultWidths[col] || 120;
          return (
            <col
              key={col}
              style={{
                width: `${width}px`,
                minWidth: `${width}px`
              }}
            />
          );
        })}
      </colgroup>

      {/* Sticky Table Header */}
      <thead style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        userSelect: 'none'
      }}>
        <tr>
          {activeColumns.map(col => {
            const width = columnWidths[col] || defaultWidths[col] || 120;
            const displayName = getColDisplayName(col);
            const isDragging = draggedCol === col;
            const isDragOver = dragOverCol === col;
            const isDraggable = col !== 'actions' && col !== 'id' && !hoveringResizeCol;
            const isSorted = sortConfig?.key === col;
            const isAsc = isSorted && sortConfig?.direction === 'asc';
            const isDesc = isSorted && sortConfig?.direction === 'desc';
            const align = alignMap[col] || 'left';
            const isHoveringResize = hoveringResizeCol === col;

            return (
              <th
                key={col}
                data-col={col}
                draggable={isDraggable}
                onClick={(e) => {
                  if (col === 'actions' || hoveringResizeCol) return;
                  handleSort(col);
                }}
                onDragStart={(e) => {
                  if (!isDraggable || hoveringResizeCol) {
                    e.preventDefault();
                    return;
                  }
                  setDraggedCol(col);
                  e.dataTransfer.setData('text/plain', col);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (!isDraggable) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (draggedCol && draggedCol !== col && dragOverCol !== col) {
                    setDragOverCol(col);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverCol === col) setDragOverCol(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedCol && draggedCol !== col) {
                    handleColumnReorder(draggedCol, col);
                  }
                  setDraggedCol(null);
                  setDragOverCol(null);
                }}
                onDragEnd={() => {
                  setDraggedCol(null);
                  setDragOverCol(null);
                }}
                onContextMenu={(e) => handleHeaderContextMenu(e, col)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleAutoFitColumn(col, data, e);
                }}
                style={{
                  width: `${width}px`,
                  minWidth: `${width}px`,
                  maxWidth: `${width}px`,
                  padding: '8px 10px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  color: isSorted ? '#2563eb' : (isDragOver ? '#1d4ed8' : '#475569'),
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  userSelect: 'none',
                  position: 'relative',
                  textAlign: align,
                  cursor: isHoveringResize ? 'col-resize' : (col !== 'actions' ? 'pointer' : 'default'),
                  background: isDragOver ? '#eff6ff' : (isSorted ? '#eff6ff' : (isDragging ? '#f1f5f9' : '#f8fafc')),
                  borderRight: isHoveringResize ? '2px solid #2563eb' : '1px solid #e2e8f0',
                  borderLeft: isDragOver ? '3px solid #2563eb' : 'none',
                  borderBottom: isSorted ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  opacity: isDragging ? 0.4 : 1,
                  transform: isDragging ? 'scale(0.98)' : (isDragOver ? 'translateX(2px)' : 'none'),
                  transition: 'background 0.15s ease, opacity 0.15s ease, border-left 0.15s ease',
                  boxSizing: 'border-box',
                  ...thStyle
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: align === 'center' ? 'center' : (align === 'right' ? 'flex-end' : 'flex-start'),
                    gap: '5px',
                    userSelect: 'none',
                    paddingRight: '6px'
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </span>
                  {col !== 'actions' && (
                    <span style={{
                      fontSize: '11px',
                      color: isSorted ? '#2563eb' : '#94a3b8',
                      flexShrink: 0,
                      opacity: isSorted ? 1 : 0.4,
                      transition: 'all 0.15s'
                    }}>
                      {isAsc ? '▲' : isDesc ? '▼' : '↕'}
                    </span>
                  )}
                </div>

                {/* Resize Handle with Crisp Border Line */}
                {col !== 'actions' && (
                  <div
                    draggable={false}
                    onMouseEnter={() => setHoveringResizeCol(col)}
                    onMouseLeave={() => setHoveringResizeCol(null)}
                    onDragStart={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleAutoFitColumn(col, data, e);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleResizeMouseDown(e, col);
                    }}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: '8px',
                      cursor: 'col-resize',
                      userSelect: 'none',
                      zIndex: 3,
                      background: isHoveringResize ? '#2563eb' : 'transparent',
                      transition: 'background 0.15s ease'
                    }}
                    title="ลากเพื่อปรับขนาดความกว้าง / ดับเบิลคลิกเพื่อ Auto-fit"
                  />
                )}
              </th>
            );
          })}
        </tr>
      </thead>
    </>
  );
}
