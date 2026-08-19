import React from 'react';
import Badge from '../ui/Badge';

function getPageNumbers(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
}

export default function ContainerMasterTable({
  loading,
  paginatedRecords,
  activeColumns,
  sortConfig,
  onSort,
  onHeaderContextMenu,
  onAutoFitColumn,
  getColDisplayName,
  getDefaultColWidth,
  onResizeMouseDown,
  draggedCol,
  dragOverCol,
  setDraggedCol,
  setDragOverCol,
  onColumnReorder,
  onPreviewImage,
  formatCellValue,
  // Pagination
  currentPage,
  setCurrentPage,
  rowsPerPage,
  setRowsPerPage,
  totalPages,
  totalRecordsCount,
  startIndex,
  endIndex
}) {
  const handleDownloadImage = (rawUrl, containerNo) => {
    if (!rawUrl) return;
    const filename = `JobSheet_${containerNo || 'Image'}.jpg`;

    // 1. If base64 data URL
    if (rawUrl.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = rawUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    // 2. If Google Drive link, use official export download endpoint (prevents 429 thumbnail limits)
    const match = rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      const fileId = match[1];
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      window.open(downloadUrl, '_blank');
      return;
    }

    // 3. For any standard image URL
    window.open(rawUrl, '_blank');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Table Container */}
      <div style={{ overflow: 'auto', flex: 1, minHeight: 0, borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse', 
          fontSize: '13px', 
          textAlign: 'left',
          tableLayout: 'fixed'
        }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              {activeColumns.map(col => {
                const colWidth = getDefaultColWidth(col);
                const isSorted = sortConfig.key === col;
                const isAsc = isSorted && sortConfig.direction === 'asc';
                const isDesc = isSorted && sortConfig.direction === 'desc';
                const isDragging = draggedCol === col;
                const isDragOver = dragOverCol === col;

                return (
                  <th
                    key={col}
                    draggable
                    onDragStart={(e) => {
                      setDraggedCol(col);
                      e.dataTransfer.setData('text/plain', col);
                    }}
                    onDragOver={(e) => {
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
                        onColumnReorder(draggedCol, col);
                      }
                      setDraggedCol(null);
                      setDragOverCol(null);
                    }}
                    onDragEnd={() => {
                      setDraggedCol(null);
                      setDragOverCol(null);
                    }}
                    onClick={() => onSort(col)}
                    onContextMenu={(e) => onHeaderContextMenu(e, col)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onAutoFitColumn(col);
                    }}
                    style={{ 
                      width: `${colWidth}px`,
                      minWidth: `${colWidth}px`,
                      maxWidth: `${colWidth}px`,
                      position: 'relative',
                      padding: '10px 12px', 
                      textAlign: 'center',
                      color: isSorted ? '#2563eb' : (isDragOver ? '#1d4ed8' : '#475569'), 
                      fontWeight: 700, 
                      whiteSpace: 'nowrap', 
                      cursor: isDragging ? 'grabbing' : 'grab',
                      userSelect: 'none',
                      borderBottom: isSorted ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      background: isDragOver ? '#eff6ff' : (isSorted ? '#eff6ff' : (isDragging ? '#f1f5f9' : '#f8fafc')),
                      borderLeft: isDragOver ? '3px solid #2563eb' : undefined,
                      opacity: isDragging ? 0.4 : 1,
                      transform: isDragging ? 'scale(0.97)' : (isDragOver ? 'translateX(2px)' : 'none'),
                      transition: 'background 0.18s cubic-bezier(0.4, 0, 0.2, 1), transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s ease, border-left 0.15s ease',
                      boxSizing: 'border-box'
                    }}
                    title="คลิกเพื่อจัดเรียง / ลากเพื่อสลับคอลัมน์ / ดับเบิ้ลคลิกปรับขนาดพอดี / คลิกขวาจัดการ"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '4px' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getColDisplayName(col)}</span>
                      <span style={{ fontSize: '11px', color: isSorted ? '#2563eb' : '#94a3b8', flexShrink: 0 }}>
                        {isAsc ? '▲' : isDesc ? '▼' : '↕'}
                      </span>
                    </div>

                    {/* Resize Handle with Subtle Divider Line */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => onResizeMouseDown(e, col)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onAutoFitColumn(col);
                      }}
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '8px',
                        cursor: 'col-resize',
                        userSelect: 'none',
                        zIndex: 5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent'
                      }}
                      title="คลิกแล้วลากเพื่อปรับขนาด / ดับเบิ้ลคลิกเพื่อปรับพอดีข้อความ"
                    >
                      <div 
                        style={{
                          width: '1px',
                          height: '16px',
                          background: '#cbd5e1',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#2563eb'; e.currentTarget.style.width = '2px'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#cbd5e1'; e.currentTarget.style.width = '1px'; }}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={Math.max(activeColumns.length, 1)} style={{ padding: '56px 20px', textAlign: 'center', color: '#64748b' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>
                  <div style={{ fontWeight: 600 }}>กำลังโหลดข้อมูล Master Database...</div>
                </td>
              </tr>
            ) : paginatedRecords.length === 0 ? (
              <tr>
                <td colSpan={Math.max(activeColumns.length, 1)} style={{ padding: '56px 20px', textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
                  <div style={{ fontWeight: 600 }}>ไม่พบรายการข้อมูลตามเงื่อนไขที่เลือก</div>
                </td>
              </tr>
            ) : (
              paginatedRecords.map((row, idx) => (
                <tr 
                  key={row.id || idx} 
                  style={{ 
                    borderBottom: '1px solid #f1f5f9', 
                    transition: 'background 0.15s ease',
                    background: idx % 2 === 0 ? '#ffffff' : '#fcfdfd'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fcfdfd'}
                >
                  {activeColumns.map(col => {
                    const val = row[col];
                    const isIdCol = col === 'id' || col === 'index';
                    const isContainerCol = col === 'container_no';
                    const isMatchStatusCol = col === 'match_status' || col === 'ocr_status';
                    const isWorkflowCol = col === 'workflow_status';
                    const isImageCol = col === 'image_url';
                    const isDisLoadCol = col === 'dis_load';

                    return (
                      <td 
                        key={col} 
                        style={{ 
                          padding: '10px 14px', 
                          whiteSpace: 'nowrap', 
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          textAlign: isIdCol ? 'center' : 'left',
                          color: isContainerCol ? '#1d4ed8' : '#334155', 
                          fontWeight: isContainerCol ? 700 : 500,
                          fontFamily: isContainerCol ? "'SF Mono', Consolas, Monaco, monospace" : 'inherit'
                        }}
                      >
                        {isIdCol ? (
                          <span style={{ color: '#64748b', fontWeight: 600 }}>
                            {(typeof val === 'number' || (typeof val === 'string' && /^\d+$/.test(val))) ? val : (startIndex + idx + 1)}
                          </span>
                        ) : isMatchStatusCol ? (
                          val === 'matched_green' ? <Badge variant="success" icon="🟢">พบในใบงาน</Badge> :
                          val === 'matched_blue' ? <Badge variant="info" icon="🔵">พบในใบงาน (รถต่าง)</Badge> :
                          val === 'matched_yellow' ? <Badge variant="warning" icon="🟡">แก้ไขเลขตู้</Badge> :
                          val === 'manual_red' ? <Badge variant="danger" icon="🔴">นอกใบวางบิล</Badge> :
                          (val === 'duplicate' || val === 'duplicate_auto') ? <Badge variant="indigo" icon="🟣">ตู้ซ้ำ</Badge> :
                          val === 'missing' ? <Badge variant="warning" icon="⚠️">ยังไม่มีใบงาน</Badge> :
                          val === 'cancelled' ? <Badge variant="neutral" icon="🚫">ขีดฆ่า</Badge> :
                          (val || '-')
                        ) : isWorkflowCol ? (
                          val === 'completed' ? <Badge variant="success" icon="✅">จบงานแล้ว</Badge> :
                          val === 'pending' ? <Badge variant="warning" icon="⏳">รอยืนยันใบงาน</Badge> :
                          <Badge variant="neutral" icon="📭">ยังไม่สแกน</Badge>
                        ) : isDisLoadCol && val ? (
                          String(val).toLowerCase().includes('dis') ? (
                            <Badge variant="info" size="sm" style={{ minWidth: '52px', justifyContent: 'center', fontWeight: 800, letterSpacing: '0.5px' }}>DIS</Badge>
                          ) : String(val).toLowerCase().includes('load') ? (
                            <Badge variant="warning" size="sm" style={{ minWidth: '52px', justifyContent: 'center', fontWeight: 800, letterSpacing: '0.5px' }}>LOAD</Badge>
                          ) : val
                        ) : isImageCol ? (
                          val ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadImage(val, row.container_no);
                              }}
                              style={{
                                padding: '3px 9px',
                                borderRadius: '5px',
                                border: '1px solid #bfdbfe',
                                background: '#eff6ff',
                                color: '#2563eb',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseOver={(e) => e.currentTarget.style.background = '#dbeafe'}
                              onMouseOut={(e) => e.currentTarget.style.background = '#eff6ff'}
                              title={`คลิกเพื่อดาวน์โหลดรูปใบงานของตู้ ${row.container_no}`}
                            >
                              📥 โหลดรูป
                            </button>
                          ) : (
                            <span style={{ color: '#cbd5e1' }}>-</span>
                          )
                        ) : (
                          formatCellValue(col, val)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Toolbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '10px',
        paddingTop: '8px',
        borderTop: '1px solid #f1f5f9',
        flexShrink: 0,
        flexWrap: 'wrap',
        gap: '12px',
        fontSize: '12.5px',
        color: '#64748b'
      }}>
        {/* Row Count Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>
            แสดง {totalRecordsCount > 0 ? startIndex + 1 : 0} - {endIndex} จากทั้งหมด {totalRecordsCount.toLocaleString()} รายการ
          </span>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>แสดงหน้าละ:</span>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                const val = e.target.value === 'ALL' ? 'ALL' : Number(e.target.value);
                setRowsPerPage(val);
              }}
              style={{
                height: '30px',
                padding: '0 8px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                color: '#334155',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value="ALL">ทั้งหมด</option>
            </select>
          </div>
        </div>

        {/* Page Nav Buttons */}
        {rowsPerPage !== 'ALL' && totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              style={{
                height: '30px',
                minWidth: '30px',
                padding: '0 6px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                background: currentPage === 1 ? '#f8fafc' : '#ffffff',
                color: currentPage === 1 ? '#cbd5e1' : '#334155',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: '12px'
              }}
              title="หน้าแรก"
            >
              «
            </button>

            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              style={{
                height: '30px',
                minWidth: '30px',
                padding: '0 6px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                background: currentPage === 1 ? '#f8fafc' : '#ffffff',
                color: currentPage === 1 ? '#cbd5e1' : '#334155',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: '12px'
              }}
              title="หน้าก่อนหน้า"
            >
              ‹
            </button>

            {getPageNumbers(currentPage, totalPages).map((p, i) => (
              p === '...' ? (
                <span key={`dots-${i}`} style={{ padding: '0 4px', color: '#94a3b8' }}>...</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  style={{
                    height: '30px',
                    minWidth: '30px',
                    padding: '0 6px',
                    borderRadius: '6px',
                    border: currentPage === p ? '1px solid #2563eb' : '1px solid #e2e8f0',
                    background: currentPage === p ? '#2563eb' : '#ffffff',
                    color: currentPage === p ? '#ffffff' : '#334155',
                    cursor: 'pointer',
                    fontWeight: currentPage === p ? 800 : 500,
                    fontSize: '12px'
                  }}
                >
                  {p}
                </button>
              )
            ))}

            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              style={{
                height: '30px',
                minWidth: '30px',
                padding: '0 6px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                background: currentPage === totalPages ? '#f8fafc' : '#ffffff',
                color: currentPage === totalPages ? '#cbd5e1' : '#334155',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: '12px'
              }}
              title="หน้าถัดไป"
            >
              ›
            </button>

            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              style={{
                height: '30px',
                minWidth: '30px',
                padding: '0 6px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                background: currentPage === totalPages ? '#f8fafc' : '#ffffff',
                color: currentPage === totalPages ? '#cbd5e1' : '#334155',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: '12px'
              }}
              title="หน้าสุดท้าย"
            >
              »
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
