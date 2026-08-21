import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { jobSheetService } from '../services/jobSheetService';
import { containerService } from '../services/containerService';
import { findTopContainerMatches, normalizeExcelDate } from '../utils/matchingLogic';
import TableContextMenu from '../components/ui/TableContextMenu';
import RenameColumnModal from '../components/ui/RenameColumnModal';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown';
import { useColumnPreferences } from '../hooks/useColumnPreferences';

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

const BATCH_RAW_COLUMNS = [
  'index',
  'thumbnail',
  'image_name',
  'batch_name',
  'truck_no',
  'total',
  'match_summary',
  'status',
  'saved_at',
  'actions'
];

const BATCH_DEFAULT_NAMES = {
  index: '#',
  thumbnail: 'ภาพใบงาน',
  image_name: 'ชื่อรูปภาพ',
  batch_name: 'รอบงาน (Batch)',
  truck_no: 'เบอร์รถ',
  total: 'จำนวนตู้',
  match_summary: 'ผลจับคู่',
  status: 'สถานะ',
  saved_at: 'วันที่บันทึก',
  actions: 'การจัดการ'
};

const BATCH_DEFAULT_WIDTHS = {
  index: 50,
  thumbnail: 80,
  image_name: 180,
  batch_name: 160,
  truck_no: 110,
  total: 90,
  match_summary: 180,
  status: 140,
  saved_at: 150,
  actions: 170
};

export default function BatchManagerView() {
  const [jobSheetsList, setJobSheetsList] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [masterDb, setMasterDb] = useState([]);
  const [availableBatches, setAvailableBatches] = useState([]);
  const [availableTrucks, setAvailableTrucks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('ALL');
  const [selectedTruckFilter, setSelectedTruckFilter] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [activeDetailSheet, setActiveDetailSheet] = useState(null);
  
  // State สำหรับหน้าต่างแก้ไขเฉพาะตู้ที่ยังไม่พบ (Red Containers Editor)
  const [editingRedSheet, setEditingRedSheet] = useState(null);
  const [redEditRows, setRedEditRows] = useState([]);
  const [isSavingRed, setIsSavingRed] = useState(false);

  // 📄 ระบบ Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50); // 25, 50, 100, 200, 'ALL'
  const [sortConfig, setSortConfig] = useState({ key: 'saved_at', direction: 'desc' });

  const menuRef = useRef(null);

  // 1. โหลด Metadata ตอนเปิดหน้าจอ
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [batchesRes, trucksRes, masterRes] = await Promise.all([
          supabase.from('job_sheets').select('batch_name').neq('status', 'deleted').limit(150),
          supabase.from('truck_records').select('truck_no').order('truck_no'),
          containerService.fetchMasterContainers()
        ]);
        if (batchesRes?.data) {
          const bSet = new Set(batchesRes.data.map(b => b.batch_name).filter(Boolean));
          setAvailableBatches(Array.from(bSet).sort());
        }
        if (trucksRes?.data) {
          const tSet = new Set(trucksRes.data.map(t => t.truck_no).filter(Boolean));
          setAvailableTrucks(Array.from(tSet).sort());
        }
        if (masterRes?.data) {
          setMasterDb(masterRes.data);
        }
      } catch (e) {
        console.error('Error fetching metadata:', e);
      }
    };
    fetchMetadata();
  }, []);

  // 2. Debounce Search (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // 3. รีเซ็ตกลับไปหน้า 1 เมื่อตัวกรองเปลี่ยน
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBatchFilter, selectedTruckFilter, selectedMonth, rowsPerPage]);

  // 4. โหลดข้อมูลแบบ Server-Side Pagination จริง
  useEffect(() => {
    loadPaginatedData();
  }, [currentPage, rowsPerPage, debouncedSearch, selectedBatchFilter, selectedTruckFilter, selectedMonth, sortConfig]);

  const loadPaginatedData = async () => {
    setIsLoading(true);
    try {
      const res = await jobSheetService.fetchPaginatedCompletedJobSheets({
        page: currentPage,
        pageSize: rowsPerPage,
        searchTerm: debouncedSearch,
        batchFilter: selectedBatchFilter,
        truckFilter: selectedTruckFilter,
        monthFilter: selectedMonth,
        sortConfig: {
          key: sortConfig.key === 'saved_at' ? 'created_at' : sortConfig.key,
          direction: sortConfig.direction
        }
      });

      if (res.error) throw res.error;
      setJobSheetsList(res.data || []);
      setTotalCount(res.totalCount || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Fetch Completed Error:', err);
      alert('ไม่สามารถดึงข้อมูลประวัติใบงานได้: ' + (err.message || err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadImage = (imageUrl, truckNo, batchName) => {
    if (!imageUrl) return;

    if (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = `JobSheet_${truckNo || 'truck'}_${batchName || 'batch'}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const match = imageUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || imageUrl.match(/id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      const fileId = match[1];
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.target = '_blank';
      a.download = `JobSheet_${truckNo || 'truck'}_${fileId}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    window.open(imageUrl, '_blank');
  };

  const getDriveThumbnailUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http://localhost') || url.includes('/assets/')) {
      return url;
    }
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200`;
    }
    return url;
  };

  const fetchCompletedRecords = async () => {
    await loadPaginatedData();
  };

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sortedSheets = jobSheetsList;
  const totalRows = totalCount;
  const startIndex = rowsPerPage === 'ALL' ? 0 : (currentPage - 1) * (Number(rowsPerPage) || 50);
  const endIndex = rowsPerPage === 'ALL' ? totalRows : Math.min(startIndex + jobSheetsList.length, totalRows);

  const kpiStats = useMemo(() => {
    const totalSheets = jobSheetsList.length;
    let totalContainers = 0;
    let totalGreen = 0;
    let totalRed = 0;

    jobSheetsList.forEach(s => {
      totalContainers += s.containers ? s.containers.length : 0;
      totalGreen += s.green || 0;
      totalRed += s.red || 0;
    });

    return { totalSheets, totalContainers, totalGreen, totalRed };
  }, [jobSheetsList]);

  // Hook สำหรับจัดการคอลัมน์
  const {
    renamingColumn,
    setRenamingColumn,
    visibleColumns,
    showColumnMenu,
    setShowColumnMenu,
    draggedCol,
    setDraggedCol,
    dragOverCol,
    setDragOverCol,
    contextMenu,
    setContextMenu,
    allColumns,
    activeColumns,
    getColDisplayName,
    getDefaultColWidth,
    handleColumnReorder,
    handleResetColumnOrder,
    handleResizeMouseDown,
    handleAutoFitColumn,
    handleToggleColumnHide,
    handleShowAllColumns,
    handleResetColumnWidth,
    handleHeaderContextMenu,
    handleStartRename,
    handleSaveAlias,
    handleResetAlias,
    handleResetAllAliases
  } = useColumnPreferences({
    storageKeyPrefix: 'completed_jobs',
    rawColumns: BATCH_RAW_COLUMNS,
    defaultNames: BATCH_DEFAULT_NAMES,
    defaultWidths: BATCH_DEFAULT_WIDTHS,
    sampleRecords: sortedSheets,
    formatCellValue: (col, val) => {
      if (col === 'saved_at') return val ? new Date(val).toLocaleString('th-TH') : '-';
      return String(val || '');
    }
  });

  // ปิดเมนูเมื่อคลิกนอก
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowColumnMenu(false);
      }
      setContextMenu(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [setShowColumnMenu, setContextMenu]);

  // เปิดหน้าต่างแก้ไขเฉพาะตู้ที่ยังไม่พบใน DB (Red Containers Editor)
  const openRedEditor = (sheet) => {
    const onlyRed = (sheet.containers || []).filter(c => c.is_red || c.match_status === 'manual_red');
    setEditingRedSheet(sheet);
    setRedEditRows(onlyRed.map(c => ({
      id: c.id,
      container_no: c.container_no,
      raw_ocr_no: c.container_no,
      port: c.port !== '-' ? c.port : '',
      size: c.size !== '-' ? c.size : '',
      selectedDbId: null,
      isConfirmedMatch: false
    })));
  };

  // บันทึกการแก้ไขเฉพาะตู้สีแดงลง Supabase
  const handleSaveRedEdits = async () => {
    if (!editingRedSheet || redEditRows.length === 0) return;
    setIsSavingRed(true);

    try {
      const updates = redEditRows.map(row => {
        const cleanNo = String(row.container_no || '').trim();
        const exactMatch = masterDb.find(m => String(m.container_no || '').trim().toUpperCase() === cleanNo.toUpperCase());
        const isMatched = row.isConfirmedMatch || !!exactMatch;
        return {
          id: row.id,
          container_no: cleanNo,
          port: exactMatch?.port || row.port || null,
          size: exactMatch?.size || row.size || null,
          match_status: isMatched ? 'matched_green' : 'manual_red'
        };
      });

      const res = await jobSheetService.updateCompletedContainers(updates, editingRedSheet.id);
      if (!res.success && res.error) throw res.error;

      alert(`✅ บันทึกการแก้ไขตู้สำเร็จเรียบร้อย!`);
      setEditingRedSheet(null);
      setRedEditRows([]);
      await fetchCompletedRecords();
    } catch (err) {
      console.error('Save Red Edits Error:', err);
      alert('❌ เกิดข้อผิดพลาดในการบันทึก: ' + (err.message || err));
    } finally {
      setIsSavingRed(false);
    }
  };

  return (
    <div style={{ padding: '16px 24px', maxWidth: '1600px', margin: '0 auto', width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeIn 0.3s ease' }}>
      
      {/* 1. Header Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexShrink: 0, gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 2px 0', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ✅ Completed Job Sheets
          </h1>
          <p style={{ color: '#64748b', fontSize: '12.5px', margin: 0 }}>
            ประวัติใบงานที่ได้รับการตรวจสอบ ยืนยัน และบันทึกจบงานแล้วในระบบ
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={fetchCompletedRecords}
            disabled={isLoading}
            style={{
              height: '36px',
              padding: '0 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: isLoading ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}
          >
            <span>🔄</span>
            <span>รีเฟรชข้อมูล</span>
          </button>
        </div>
      </div>

      {/* 2. KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>📄 ใบงานทั้งหมด</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', fontFamily: "'Inter', sans-serif" }}>
            {kpiStats.totalSheets.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>ใบ</span>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>📦 รวมงานทั้งหมด</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563eb', fontFamily: "'Inter', sans-serif" }}>
            {kpiStats.totalContainers.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>งาน</span>
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#166534', marginBottom: '4px' }}>🟢 จับคู่สมบูรณ์</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#15803d', fontFamily: "'Inter', sans-serif" }}>
            {kpiStats.totalGreen.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>งาน</span>
          </div>
        </div>

        <div style={{ background: kpiStats.totalRed > 0 ? '#fef2f2' : '#f8fafc', border: kpiStats.totalRed > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: kpiStats.totalRed > 0 ? '#991b1b' : '#64748b', marginBottom: '4px' }}>🔴 ไม่พบในใบวางบิล</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: kpiStats.totalRed > 0 ? '#dc2626' : '#64748b', fontFamily: "'Inter', sans-serif" }}>
            {kpiStats.totalRed.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 600, color: kpiStats.totalRed > 0 ? '#991b1b' : '#64748b' }}>งาน</span>
          </div>
        </div>
      </div>

      {/* 3. Filter & Search Controls */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '12px 16px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Table Toolbar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
              📄 รายการใบงานที่บันทึกแล้ว
            </span>
            <span style={{ fontSize: '12px', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
              {sortedSheets.length.toLocaleString()} ใบงาน
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
            
            {/* Month Filter */}
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                height: '35px',
                padding: '0 8px',
                borderRadius: '7px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontSize: '13px',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
              title="เลือกเดือนที่ต้องการแสดงข้อมูล"
            />

            {/* Search Box */}
            <div style={{ position: 'relative', width: '220px' }}>
              <input
                type="text"
                placeholder="🔍 ค้นหาเบอร์รถ, เลขตู้..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  height: '35px',
                  padding: '0 12px 0 30px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12.5px',
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '13px' }}>🔍</span>
            </div>

            {/* Truck Filter */}
            <select
              value={selectedTruckFilter}
              onChange={(e) => setSelectedTruckFilter(e.target.value)}
              style={{
                height: '35px',
                padding: '0 8px',
                borderRadius: '7px',
                border: '1px solid #cbd5e1',
                fontSize: '12px',
                fontWeight: selectedTruckFilter !== 'ALL' ? 700 : 500,
                background: selectedTruckFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
                color: selectedTruckFilter !== 'ALL' ? '#2563eb' : '#0f172a',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">🚚 ทุกเบอร์รถ ({availableTrucks.length})</option>
              {availableTrucks.map(t => (
                <option key={t} value={t}>เบอร์รถ: {t}</option>
              ))}
            </select>

            {/* Batch Filter */}
            <select
              value={selectedBatchFilter}
              onChange={(e) => setSelectedBatchFilter(e.target.value)}
              style={{
                height: '35px',
                padding: '0 8px',
                borderRadius: '7px',
                border: '1px solid #cbd5e1',
                fontSize: '12px',
                fontWeight: selectedBatchFilter !== 'ALL' ? 700 : 500,
                background: selectedBatchFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
                color: selectedBatchFilter !== 'ALL' ? '#2563eb' : '#0f172a',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">📁 ทุกรอบงาน (All Batches)</option>
              {availableBatches.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>

            {/* Clear Filters */}
            {(selectedTruckFilter !== 'ALL' || selectedBatchFilter !== 'ALL' || searchTerm.trim() !== '') && (
              <button
                onClick={() => {
                  setSelectedTruckFilter('ALL');
                  setSelectedBatchFilter('ALL');
                  setSearchTerm('');
                }}
                style={{
                  height: '35px',
                  padding: '0 9px',
                  borderRadius: '7px',
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                  color: '#b91c1c',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>✕</span>
                <span>ล้างตัวกรอง</span>
              </button>
            )}

            {/* Column Visibility Menu */}
            <ColumnVisibilityDropdown
              showColumnMenu={showColumnMenu}
              setShowColumnMenu={setShowColumnMenu}
              menuRef={menuRef}
              allColumns={allColumns}
              activeColumns={activeColumns}
              visibleColumns={visibleColumns}
              onToggleColumnVisibility={handleToggleColumnHide}
              getColDisplayName={getColDisplayName}
              onStartEditAlias={(col) => handleStartRename(col)}
              onShowAllColumns={handleShowAllColumns}
              onResetAllAliases={handleResetAllAliases}
            />

          </div>
        </div>

        {/* 4. Table */}
        {isLoading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>⏳</div>
            กำลังโหลดข้อมูลประวัติใบงาน...
          </div>
        ) : sortedSheets.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px', opacity: 0.6 }}>📭</div>
            {searchTerm || selectedBatchFilter !== 'ALL' ? 'ไม่พบใบงานที่ตรงตามเงื่อนไขการค้นหา' : 'ยังไม่มีประวัติใบงานที่บันทึก'}
          </div>
        ) : (
          <div style={{ overflow: 'auto', flex: 1, minHeight: 0, borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
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
                            handleColumnReorder(draggedCol, col);
                          }
                          setDraggedCol(null);
                          setDragOverCol(null);
                        }}
                        onDragEnd={() => {
                          setDraggedCol(null);
                          setDragOverCol(null);
                        }}
                        onClick={() => handleSort(col)}
                        onContextMenu={(e) => handleHeaderContextMenu(e, col)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleAutoFitColumn(col, sortedSheets);
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
                          onMouseDown={(e) => handleResizeMouseDown(e, col)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleAutoFitColumn(col, sortedSheets);
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
                {sortedSheets.map((sheet, index) => {
                  const isPerfect = sheet.red === 0;
                  const total = sheet.containers ? sheet.containers.length : 0;
                  const dateStr = sheet.saved_at ? new Date(sheet.saved_at).toLocaleString('th-TH', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : '-';

                  return (
                    <tr 
                      key={sheet.id || index}
                      style={{ 
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.15s ease',
                        background: index % 2 === 0 ? '#ffffff' : '#fcfdfd'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = index % 2 === 0 ? '#ffffff' : '#fcfdfd'; }}
                    >
                      {activeColumns.map(col => {
                        if (col === 'index') {
                          return (
                            <td key={col} style={{ padding: '10px 14px', textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: '13px' }}>
                              {index + 1}
                            </td>
                          );
                        }

                        if (col === 'thumbnail') {
                          return (
                            <td key={col} style={{ padding: '8px 14px', textAlign: 'center' }}>
                              {sheet.image_url ? (
                                <div 
                                  onClick={() => handleDownloadImage(sheet.image_url, sheet.truck_no, sheet.batch_name)}
                                  style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '6px',
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    background: '#f1f5f9',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto',
                                    border: '1px solid #e2e8f0'
                                  }}
                                  title="คลิกเพื่อเปิดดูภาพต้นฉบับ"
                                >
                                  <img 
                                    src={getDriveThumbnailUrl(sheet.image_url)} 
                                    alt="Job Sheet" 
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                      if (e.target.parentElement) e.target.parentElement.innerHTML = '🖼️';
                                    }}
                                  />
                                </div>
                              ) : (
                                <span style={{ fontSize: '16px', color: '#94a3b8' }}>📄</span>
                              )}
                            </td>
                          );
                        }

                        if (col === 'image_name') {
                          return (
                            <td key={col} style={{ padding: '10px 14px' }}>
                              <div style={{
                                fontWeight: 600,
                                color: '#0369a1',
                                fontFamily: "'SF Mono', Consolas, monospace",
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={sheet.image_name}
                              >
                                <span style={{ fontSize: '13px' }}>🖼️</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{sheet.image_name}</span>
                              </div>
                            </td>
                          );
                        }

                        if (col === 'batch_name') {
                          return (
                            <td key={col} style={{ padding: '10px 14px' }}>
                              <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '13px' }}>
                                {sheet.batch_name}
                              </span>
                            </td>
                          );
                        }

                        if (col === 'truck_no') {
                          return (
                            <td key={col} style={{ padding: '10px 14px' }}>
                              <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                                {sheet.truck_no}
                              </span>
                            </td>
                          );
                        }

                        if (col === 'total') {
                          return (
                            <td key={col} style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <span style={{ fontWeight: 700, fontSize: '13px', color: '#334155' }}>
                                {total} ตู้
                              </span>
                            </td>
                          );
                        }

                        if (col === 'match_summary') {
                          return (
                            <td key={col} style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <span style={{ color: '#15803d', fontWeight: 700, fontSize: '13px' }}>
                                  🟢 {sheet.green}
                                </span>
                                {sheet.red > 0 && (
                                  <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '13px' }}>
                                    🔴 {sheet.red}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (col === 'status') {
                          return (
                            <td key={col} style={{ padding: '10px 14px' }}>
                              {isPerfect ? (
                                <span style={{ color: '#15803d', fontWeight: 700, fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  ✓ ปิดจบงานแล้ว
                                </span>
                              ) : (
                                <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  ⚠️ ไม่พบ {sheet.red} ตู้
                                </span>
                              )}
                            </td>
                          );
                        }

                        if (col === 'saved_at') {
                          return (
                            <td key={col} style={{ padding: '10px 14px', color: '#475569', fontSize: '12.5px', fontWeight: 600 }}>
                              {dateStr}
                            </td>
                          );
                        }

                        if (col === 'actions') {
                          return (
                            <td key={col} style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => setActiveDetailSheet(sheet)}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: '5px',
                                    border: '1px solid #cbd5e1',
                                    background: '#ffffff',
                                    color: '#0284c7',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                  title="คลิกเพื่อดูรายละเอียดใบงาน"
                                >
                                  รายละเอียด
                                </button>

                                {sheet.red > 0 && (
                                  <button
                                    onClick={() => openRedEditor(sheet)}
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: '5px',
                                      border: '1px solid #fde68a',
                                      background: '#fef3c7',
                                      color: '#b45309',
                                      fontSize: '12px',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '2px'
                                    }}
                                    title="เปิดหน้าต่างแก้ไขเฉพาะตู้ที่ยังไม่พบใน DB"
                                  >
                                    ✏️ แก้ไข ({sheet.red})
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        }

                        return (
                          <td key={col} style={{ padding: '10px 14px' }}>
                            {String(sheet[col] || '-')}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Header Context Menu */}
      <TableContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        onStartEditAlias={(col) => handleStartRename(col)}
        onAutoFitColumn={(col) => handleAutoFitColumn(col, sortedSheets)}
        onToggleColumnHide={handleToggleColumnHide}
        onShowAllColumns={handleShowAllColumns}
        onResetColumnWidth={handleResetColumnWidth}
        onResetColumnOrder={handleResetColumnOrder}
        getColDisplayName={getColDisplayName}
      />

      {/* Rename Column Modal */}
      <RenameColumnModal
        renamingColumn={renamingColumn}
        onClose={() => setRenamingColumn(null)}
        onSaveAlias={handleSaveAlias}
        onResetAlias={handleResetAlias}
      />

      {/* Modal: ดูรายละเอียดตู้ทั้งหมด */}
      {activeDetailSheet && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '750px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div>
                <h3 style={{ margin: '0 0 2px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  📦 รายการตู้ในใบงาน: เบอร์รถ {activeDetailSheet.truck_no}
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  รอบงาน: <b>{activeDetailSheet.batch_name}</b> | ทั้งหมด {activeDetailSheet.containers.length} ตู้ (🟢 สมบูรณ์: {activeDetailSheet.green}, 🔴 ไม่พบ DB: {activeDetailSheet.red})
                </div>
              </div>

              <button
                onClick={() => setActiveDetailSheet(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  fontWeight: 'bold'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Table Content */}
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: '#475569', fontWeight: 700 }}>
                    <th style={{ padding: '10px 12px', width: '50px', textAlign: 'center' }}>#</th>
                    <th style={{ padding: '10px 12px' }}>เลขตู้ (Container No)</th>
                    <th style={{ padding: '10px 12px', width: '100px' }}>ท่าเรือ</th>
                    <th style={{ padding: '10px 12px', width: '80px', textAlign: 'center' }}>ขนาด</th>
                    <th style={{ padding: '10px 12px', width: '110px' }}>วันทำงาน</th>
                    <th style={{ padding: '10px 12px', width: '130px', textAlign: 'center' }}>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDetailSheet.containers.map((c, i) => (
                    <tr key={c.id || i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                      <td style={{ padding: '10px 12px', fontFamily: "'SF Mono', Consolas, monospace", fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                        {c.container_no}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#334155' }}>
                        {c.port !== '-' ? `ท่า ${c.port}` : '-'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#334155' }}>
                        {c.size !== '-' ? `S${c.size}` : '-'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#475569', fontSize: '12px' }}>
                        {(() => {
                          const cleanNo = String(c.container_no || '').trim().toUpperCase();
                          const mRecord = masterDb.find(m => String(m.container_no || '').trim().toUpperCase() === cleanNo);
                          const rawDate = (c.date_job && c.date_job !== '-' && c.date_job !== 'null') ? c.date_job : (mRecord?.date_job || '-');
                          if (rawDate && rawDate !== '-') {
                            const iso = normalizeExcelDate(rawDate);
                            if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
                              const [y, m, d] = iso.split('-');
                              return `${d}/${m}/${y}`;
                            }
                            return `${rawDate}`;
                          }
                          return '-';
                        })()}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {(c.is_red || c.match_status === 'manual_red') ? (
                          <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '12px' }}>
                            🔴 ไม่พบใน DB
                          </span>
                        ) : (
                          <span style={{ color: '#15803d', fontWeight: 700, fontSize: '12px' }}>
                            🟢 สมบูรณ์
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              {activeDetailSheet.image_url ? (
                <button
                  onClick={() => handleDownloadImage(activeDetailSheet.image_url, activeDetailSheet.truck_no, activeDetailSheet.batch_name)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563eb',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>📥 ดาวน์โหลดภาพถ่ายใบงานต้นฉบับ</span>
                </button>
              ) : <div />}

              <div style={{ display: 'flex', gap: '8px' }}>
                {activeDetailSheet.red > 0 && (
                  <button
                    onClick={() => {
                      const sheet = activeDetailSheet;
                      setActiveDetailSheet(null);
                      openRedEditor(sheet);
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: '1px solid #f59e0b',
                      background: '#fef3c7',
                      color: '#b45309',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    ✏️ แก้ไขเฉพาะตู้ที่ยังไม่พบ ({activeDetailSheet.red})
                  </button>
                )}
                <button
                  onClick={() => setActiveDetailSheet(null)}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: แก้ไขเฉพาะตู้ที่ยังไม่พบ */}
      {editingRedSheet && (
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
          padding: '24px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '850px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 24px',
              borderBottom: '1px solid #fed7aa',
              background: '#fff7ed',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '17px', fontWeight: 800, color: '#9a3412', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>✏️ แก้ไขเฉพาะตู้ที่ยังไม่พบในใบวางบิล</span>
                  <span style={{ fontSize: '13px', color: '#c2410c', background: '#ffedd5', padding: '2px 8px', borderRadius: '6px' }}>
                    เบอร์รถ: {editingRedSheet.truck_no}
                  </span>
                </h3>
                <div style={{ fontSize: '12.5px', color: '#7c2d12' }}>
                  แก้ไขเฉพาะตู้สีแดง ({redEditRows.length} ตู้) ระบบจะไม่แตะต้องตู้ที่จับคู่สมบูรณ์แล้ว 🟢
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {editingRedSheet.image_url && (
                  <button
                    onClick={() => handleDownloadImage(editingRedSheet.image_url, editingRedSheet.truck_no, editingRedSheet.batch_name)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid #fdba74',
                      background: '#ffffff',
                      color: '#ea580c',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    📥 ดาวน์โหลดรูปใบงาน
                  </button>
                )}
                <button
                  onClick={() => setEditingRedSheet(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '20px',
                    color: '#9a3412',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    fontWeight: 'bold'
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {redEditRows.map((row, idx) => {
                const targetTruck = (editingRedSheet.truck_no || '').trim();
                let truckDbList = masterDb;
                if (targetTruck && targetTruck !== '-') {
                  truckDbList = masterDb.filter(r => String(r.truck_no || '').trim() === targetTruck);
                  if (truckDbList.length === 0) truckDbList = masterDb;
                }

                const candidates = findTopContainerMatches(row.container_no, truckDbList, 3);
                const exactMatch = masterDb.find(m => String(m.container_no || '').trim().toUpperCase() === String(row.container_no || '').trim().toUpperCase());
                const isGreen = row.isConfirmedMatch || !!exactMatch;

                return (
                  <div 
                    key={row.id || idx}
                    style={{
                      background: isGreen ? '#f0fdf4' : '#fff1f2',
                      border: isGreen ? '1px solid #bbf7d0' : '1px solid #fecdd3',
                      borderRadius: '10px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>
                          ตู้ที่ {idx + 1}:
                        </span>
                        <input
                          type="text"
                          value={row.container_no}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRedEditRows(prev => prev.map((r, i) => i === idx ? { ...r, container_no: val, isConfirmedMatch: false } : r));
                          }}
                          placeholder="พิมพ์เลขตู้..."
                          style={{
                            height: '36px',
                            padding: '0 12px',
                            borderRadius: '6px',
                            border: isGreen ? '1px solid #86efac' : '1px solid #cbd5e1',
                            fontSize: '14px',
                            fontWeight: 700,
                            fontFamily: "'SF Mono', Consolas, monospace",
                            color: '#0f172a',
                            width: '200px',
                            background: '#ffffff',
                            outline: 'none'
                          }}
                        />

                        {/* Status Indicator */}
                        {isGreen ? (
                          <span style={{ color: '#15803d', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            🟢 ตรงกับใบวางบิล (พร้อมบันทึก)
                          </span>
                        ) : (
                          <span style={{ color: '#dc2626', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            🔴 ยังไม่พบในใบวางบิล
                          </span>
                        )}
                      </div>

                      {/* Port & Size Preview */}
                      <div style={{ fontSize: '12.5px', color: '#475569', display: 'flex', gap: '12px' }}>
                        <span>ท่าเรือ: <b>{exactMatch?.port || row.port || '-'}</b></span>
                        <span>ขนาด: <b>{exactMatch?.size || row.size || '-'}</b></span>
                      </div>
                    </div>

                    {/* Candidate Quick Chooser Buttons */}
                    {candidates.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>ตัวเลือกแนะนำ:</span>
                        {candidates.map((cand, cIdx) => (
                          <button
                            key={cIdx}
                            onClick={() => {
                              setRedEditRows(prev => prev.map((r, i) => i === idx ? {
                                ...r,
                                container_no: cand.container_no,
                                port: cand.port || r.port,
                                size: cand.size || r.size,
                                isConfirmedMatch: true
                              } : r));
                            }}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: (cand.matchRate >= 90 || cand.score >= 0.9) ? '1px solid #86efac' : '1px solid #fed7aa',
                              background: (cand.matchRate >= 90 || cand.score >= 0.9) ? '#f0fdf4' : '#fff7ed',
                              color: (cand.matchRate >= 90 || cand.score >= 0.9) ? '#15803d' : '#c2410c',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <span>{cand.container_no}</span>
                            <span style={{ fontSize: '10.5px', opacity: 0.8 }}>({Math.round(cand.matchRate ?? (cand.score ? (cand.score > 1 ? cand.score : cand.score * 100) : 0))}%)</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 24px',
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                💡 กดเลือกตัวเลือกแนะนำ หรือพิมพ์เลขตู้ใหม่ แล้วกดปุ่มบันทึก
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setEditingRedSheet(null)}
                  disabled={isSavingRed}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '7px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  ยกเลิก
                </button>

                <button
                  onClick={handleSaveRedEdits}
                  disabled={isSavingRed}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '7px',
                    border: 'none',
                    background: '#10b981',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)'
                  }}
                >
                  {isSavingRed ? '⏳ กำลังบันทึก...' : '💾 บันทึกเฉพาะตู้ที่แก้ไข (Save Changes)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
