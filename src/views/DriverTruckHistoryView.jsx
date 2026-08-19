import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from '../context/ToastContext';
import { fetchAssignmentHistory, clearAssignmentHistory } from '../services/historyService';
import { fetchTrucks, fetchDrivers } from '../services/truckDriverService';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown';
import TableContextMenu from '../components/ui/TableContextMenu';
import RenameColumnModal from '../components/ui/RenameColumnModal';
import KpiCard from '../components/ui/KpiCard';
import { useColumnPreferences } from '../hooks/useColumnPreferences';

const DEFAULT_HISTORY_COLUMNS = [
  'id',
  'effective_date',
  'action',
  'truck_no',
  'truck_license',
  'driver_name',
  'previous_assignment',
  'reason',
  'created_by',
  'timestamp'
];

const DEFAULT_COLUMN_NAMES = {
  id: '#',
  effective_date: 'วันที่มีผล',
  action: 'การกระทำ (Action)',
  truck_no: 'เบอร์รถ',
  truck_license: 'ป้ายทะเบียน',
  driver_name: 'พนักงานขับรถ',
  previous_assignment: 'รถเดิม / คนเดิม',
  reason: 'เหตุผล / รายละเอียด',
  created_by: 'ผู้บันทึก',
  timestamp: 'วันเวลาที่บันทึก'
};

const DEFAULT_HISTORY_WIDTHS = {
  id: 55,
  effective_date: 115,
  action: 160,
  truck_no: 100,
  truck_license: 120,
  driver_name: 160,
  previous_assignment: 150,
  reason: 220,
  created_by: 100,
  timestamp: 160
};

const ACTION_MAP = {
  ASSIGN: { label: '🟢 เริ่มปฏิบัติงาน', color: '#16a34a', bg: '#dcfce7', border: '#bbf7d0' },
  TRANSFER: { label: '🔄 สลับ/ย้ายรถ', color: '#0284c7', bg: '#e0f2fe', border: '#bae6fd' },
  UNASSIGN: { label: '🔴 สิ้นสุดการปฏิบัติงาน', color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
  RESIGN: { label: '⚪ ลาออก/พ้นสภาพ', color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' },
  LEAVE: { label: '🟡 คนขับลางาน', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  RESUME_WORK: { label: '👤 กลับมาปฏิบัติงาน', color: '#059669', bg: '#d1fae5', border: '#a7f3d0' },
  MAINTENANCE: { label: '🔧 รถเข้าซ่อมบำรุง', color: '#d97706', bg: '#fef3c7', border: '#fde68a' },
  MAINTENANCE_END: { label: '✅ ซ่อมเสร็จพร้อมใช้', color: '#15803d', bg: '#dcfce7', border: '#86efac' }
};

export default function DriverTruckHistoryView() {
  const { success, error: toastError, warning } = useToast();
  const [historyList, setHistoryList] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'timeline'

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [truckFilter, setTruckFilter] = useState('ALL');
  const [driverFilter, setDriverFilter] = useState('ALL');

  const menuRef = useRef(null);

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [histData, truckRes, driverRes] = await Promise.all([
        fetchAssignmentHistory(),
        fetchTrucks(),
        fetchDrivers()
      ]);
      setHistoryList(histData || []);
      setTrucks(Array.isArray(truckRes) ? truckRes : (truckRes?.data || []));
      setDrivers(Array.isArray(driverRes) ? driverRes : (driverRes?.data || []));
    } catch (err) {
      toastError('โหลดประวัติไม่สำเร็จ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Format Date & Time
  const formatDateTimeDisplay = (isoStr) => {
    if (!isoStr || isoStr === '-') return '-';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  const formatDateOnly = (dateStr) => {
    if (!dateStr || dateStr === '-') return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  // Column Preferences Hook
  const {
    allColumns,
    activeColumns,
    visibleColumns,
    columnWidths,
    draggedCol,
    setDraggedCol,
    dragOverCol,
    setDragOverCol,
    getColDisplayName,
    handleToggleColumnHide,
    handleShowAllColumns,
    handleResizeMouseDown,
    handleAutoFitColumn,
    handleColumnReorder,
    handleResetColumnOrder,
    handleResetColumnWidth,
    handleHeaderContextMenu,
    handleStartRename,
    handleSaveAlias,
    handleResetAlias,
    handleResetAllAliases,
    contextMenu,
    setContextMenu,
    renamingColumn,
    setRenamingColumn,
    showColumnMenu,
    setShowColumnMenu,
    sortConfig,
    handleSort,
    sortRecords
  } = useColumnPreferences({
    storageKeyPrefix: 'driver_truck_history',
    rawColumns: DEFAULT_HISTORY_COLUMNS,
    defaultNames: DEFAULT_COLUMN_NAMES,
    defaultWidths: DEFAULT_HISTORY_WIDTHS,
    sampleRecords: historyList,
    formatCellValue: (col, val, row) => {
      if (col === 'effective_date') return formatDateOnly(val);
      if (col === 'timestamp') return formatDateTimeDisplay(val);
      if (col === 'action') return ACTION_MAP[val]?.label || val;
      if (col === 'previous_assignment') {
        return row?.previous_truck && row?.previous_truck !== '-' 
          ? `รถเดิม: ${row.previous_truck}` 
          : (row?.previous_driver && row?.previous_driver !== '-' ? `คนเดิม: ${row.previous_driver}` : '-');
      }
      return String(val || '');
    }
  });

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowColumnMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Filtered List
  const filteredList = useMemo(() => {
    return historyList.filter(item => {
      if (actionFilter !== 'ALL' && item.action !== actionFilter) return false;
      if (truckFilter !== 'ALL' && String(item.truck_no || '').trim() !== truckFilter && String(item.previous_truck || '').trim() !== truckFilter) return false;
      if (driverFilter !== 'ALL' && String(item.driver_name || '').trim() !== driverFilter && String(item.previous_driver || '').trim() !== driverFilter) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchTruck = String(item.truck_no || '').toLowerCase().includes(q);
        const matchDriver = String(item.driver_name || '').toLowerCase().includes(q);
        const matchReason = String(item.reason || '').toLowerCase().includes(q);
        const matchLicense = String(item.truck_license || '').toLowerCase().includes(q);
        const matchAction = String(item.action || '').toLowerCase().includes(q);
        if (!matchTruck && !matchDriver && !matchReason && !matchLicense && !matchAction) return false;
      }
      return true;
    });
  }, [historyList, actionFilter, truckFilter, driverFilter, searchTerm]);

  // Displayed Records (Sorted & Filtered)
  const displayedHistory = useMemo(() => {
    return sortRecords(filteredList);
  }, [filteredList, sortConfig, sortRecords]);

  // KPI Calculations
  const kpis = useMemo(() => {
    const total = historyList.length;
    const assigns = historyList.filter(h => h.action === 'ASSIGN' || h.action === 'TRANSFER').length;
    const unassigns = historyList.filter(h => h.action === 'UNASSIGN').length;
    const maintAndLeaves = historyList.filter(h => h.action === 'MAINTENANCE' || h.action === 'MAINTENANCE_END' || h.action === 'LEAVE' || h.action === 'RESUME_WORK').length;
    return { total, assigns, unassigns, maintAndLeaves };
  }, [historyList]);

  // Clear All History Handler
  const handleClearAllHistory = async () => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างบันทึกประวัติการปฏิบัติงาน (Timeline Log) ทั้งหมด?\n\n(หมายเหตุ: การล้างประวัตินี้จะไม่กระทบกับงวดการวิ่งงานปัจจุบันในระบบ)')) return;
    try {
      const res = await clearAssignmentHistory();
      if (res?.error) throw new Error(res.error);
      setHistoryList([]);
      success('ล้างประวัติการปฏิบัติงานทั้งหมดเรียบร้อยแล้ว');
      loadData();
    } catch (err) {
      toastError('ล้างประวัติไม่สำเร็จ: ' + err.message);
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    if (filteredList.length === 0) {
      warning('ไม่มีข้อมูลสำหรับส่งออก');
      return;
    }
    const exportData = filteredList.map((item, idx) => ({
      '#': idx + 1,
      'วันที่มีผล (Effective Date)': item.effective_date || '-',
      'การกระทำ (Action)': ACTION_MAP[item.action]?.label || item.action,
      'เบอร์รถ': item.truck_no || '-',
      'ป้ายทะเบียน': item.truck_license || '-',
      'พนักงานขับรถ': item.driver_name || '-',
      'รถเดิม / คนเดิม': item.previous_truck && item.previous_truck !== '-' ? `รถเดิม: ${item.previous_truck}` : (item.previous_driver && item.previous_driver !== '-' ? `คนเดิม: ${item.previous_driver}` : '-'),
      'เหตุผล / รายละเอียด': item.reason || '-',
      'ผู้บันทึก': item.created_by || 'Admin',
      'วันเวลาที่บันทึก': item.timestamp || item.created_at || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assignment_History');
    XLSX.writeFile(wb, `Assignment_History_${new Date().toISOString().slice(0, 10)}.xlsx`);
    success('ส่งออกประวัติเป็น Excel เรียบร้อยแล้ว');
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 28px',
      boxSizing: 'border-box',
      background: '#f8fafc',
      overflow: 'hidden'
    }}>
      
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        flexShrink: 0,
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📜</span> ประวัติการปฏิบัติงาน (Operation Timeline & Audit Trail)
          </h1>
          <p style={{ margin: 0, fontSize: '13.5px', color: '#64748b' }}>
            บันทึกประวัติการเริ่มปฏิบัติงาน, สลับรถ, สิ้นสุดการปฏิบัติงาน, รถเข้าซ่อมบำรุง และลางานของทั้งระบบ
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* สลับมุมมอง Table / Timeline */}
          <div style={{
            display: 'flex',
            background: '#e2e8f0',
            padding: '3px',
            borderRadius: '8px'
          }}>
            <button
              onClick={() => setViewMode('table')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === 'table' ? '#ffffff' : 'transparent',
                color: viewMode === 'table' ? '#0f172a' : '#64748b',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              📊 ตารางเต็ม
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === 'timeline' ? '#ffffff' : 'transparent',
                color: viewMode === 'timeline' ? '#0f172a' : '#64748b',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: viewMode === 'timeline' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              📜 ไทม์ไลน์
            </button>
          </div>

          <button
            onClick={loadData}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🔄 รีเฟรช
          </button>

          <button
            onClick={handleExportExcel}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#15803d',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            📊 ส่งออก Excel
          </button>

          <button
            onClick={handleClearAllHistory}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #fecaca',
              background: '#fff1f2',
              color: '#dc2626',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="ล้างประวัติ Timeline ทั้งหมด"
          >
            🧹 ล้างประวัติทั้งหมด
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        marginBottom: '16px',
        flexShrink: 0
      }}>
        <KpiCard
          title="📜 บันทึกประวัติทั้งหมด"
          value={kpis.total}
          unit="รายการ"
          theme="blue"
        />
        <KpiCard
          title="🟢 การเริ่มปฏิบัติงาน / สลับรถ"
          value={kpis.assigns}
          unit="ครั้ง"
          theme="emerald"
        />
        <KpiCard
          title="🔴 สิ้นสุดการปฏิบัติงาน"
          value={kpis.unassigns}
          unit="ครั้ง"
          theme="amber"
        />
        <KpiCard
          title="🔧 ประวัติเข้าซ่อม & ลางาน"
          value={kpis.maintAndLeaves}
          unit="รายการ"
          theme="purple"
        />
      </div>

      {/* Filters Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#ffffff',
        padding: '12px 16px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        marginBottom: '14px',
        flexShrink: 0,
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
          <span style={{ color: '#94a3b8' }}>🔍</span>
          <input
            type="text"
            placeholder="ค้นหาเบอร์รถ, คนขับ, เหตุผล, ทะเบียน..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              width: '100%',
              fontSize: '13px',
              background: 'transparent'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* ฟิลเตอร์ประเภท Action */}
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              background: '#fff'
            }}
          >
            <option value="ALL">ทุกการกระทำ (All Actions)</option>
            {Object.entries(ACTION_MAP).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>

          {/* ฟิลเตอร์เบอร์รถ */}
          <select
            value={truckFilter}
            onChange={e => setTruckFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              background: '#fff'
            }}
          >
            <option value="ALL">ทุกเบอร์รถ</option>
            {trucks.map(t => (
              <option key={t.truck_no} value={t.truck_no}>รถ {t.truck_no}</option>
            ))}
          </select>

          {/* ฟิลเตอร์คนขับ */}
          <select
            value={driverFilter}
            onChange={e => setDriverFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              background: '#fff'
            }}
          >
            <option value="ALL">คนขับทุกคน</option>
            {drivers.map(d => (
              <option key={d.driver_name} value={d.driver_name}>{d.driver_name}</option>
            ))}
          </select>

          {/* Column Visibility Dropdown (เมื่ออยู่ในโหมด Table) */}
          {viewMode === 'table' && (
            <div style={{ marginLeft: '6px' }}>
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
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            ⏳ กำลังโหลดประวัติจากระบบ...
          </div>
        ) : displayedHistory.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
            ⚪ ไม่พบรายการประวัติที่ตรงกับเงื่อนไข
          </div>
        ) : viewMode === 'table' ? (
          /* ========================================== */
          /* 📊 FULL DATA TABLE VIEW                    */
          /* ========================================== */
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <colgroup>
              {activeColumns.map(col => (
                <col key={col} style={{ width: `${columnWidths[col] || DEFAULT_HISTORY_WIDTHS[col] || 120}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700, position: 'sticky', top: 0, zIndex: 10 }}>
                {activeColumns.map((col) => {
                  const isDraggable = true;
                  const displayName = getColDisplayName(col);
                  const colWidth = columnWidths[col] || DEFAULT_HISTORY_WIDTHS[col] || 100;
                  const isDragging = draggedCol === col;
                  const isDragOver = dragOverCol === col;
                  const isSorted = sortConfig.key === col;
                  const isAsc = isSorted && sortConfig.direction === 'asc';
                  const isDesc = isSorted && sortConfig.direction === 'desc';

                  return (
                    <th
                      key={col}
                      draggable={isDraggable}
                      onDragStart={(e) => {
                        setDraggedCol(col);
                        e.dataTransfer.setData('text/plain', col);
                        e.dataTransfer.effectAllowed = 'move';
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
                      onContextMenu={(e) => handleHeaderContextMenu(e, col)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleAutoFitColumn(col, filteredList);
                      }}
                      style={{
                        padding: '10px 14px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: isSorted ? '#2563eb' : (isDragOver ? '#1d4ed8' : '#475569'),
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        userSelect: 'none',
                        position: 'relative',
                        textAlign: col === 'id' || col === 'effective_date' ? 'center' : 'left',
                        cursor: isDragging ? 'grabbing' : 'grab',
                        background: isDragOver ? '#eff6ff' : (isSorted ? '#eff6ff' : (isDragging ? '#f1f5f9' : '#f8fafc')),
                        borderLeft: isDragOver ? '3px solid #2563eb' : 'none',
                        borderBottom: isSorted ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        opacity: isDragging ? 0.4 : 1,
                        transform: isDragging ? 'scale(0.97)' : (isDragOver ? 'translateX(2px)' : 'none'),
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div
                        onClick={() => handleSort(col)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: col === 'id' || col === 'effective_date' ? 'center' : 'flex-start',
                          gap: '5px',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
                        <span style={{ fontSize: '11px', color: isSorted ? '#2563eb' : '#94a3b8', flexShrink: 0, opacity: isSorted ? 1 : 0.4 }}>
                          {isAsc ? '▲' : isDesc ? '▼' : '↕'}
                        </span>
                      </div>

                      {/* Resize Handle */}
                      <div
                        draggable={false}
                        onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleResizeMouseDown(e, col);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleAutoFitColumn(col, filteredList);
                        }}
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 0,
                          bottom: 0,
                          width: '8px',
                          cursor: 'col-resize',
                          zIndex: 5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'transparent'
                        }}
                        title="ลากปรับขนาด / ดับเบิ้ลคลิกปรับพอดีข้อความ"
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
              {displayedHistory.map((item, idx) => {
                const actionBadge = ACTION_MAP[item.action] || { label: item.action, color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' };

                return (
                  <tr
                    key={item.id || idx}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.12s ease',
                      background: '#ffffff'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                  >
                    {activeColumns.map(col => {
                      if (col === 'id') {
                        return <td key={col} style={{ padding: '10px 14px', textAlign: 'center', color: '#94a3b8' }}>{idx + 1}</td>;
                      }
                      if (col === 'effective_date') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#334155' }}>
                            {formatDateOnly(item.effective_date)}
                          </td>
                        );
                      }
                      if (col === 'action') {
                        return (
                          <td key={col} style={{ padding: '10px 14px' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: actionBadge.color,
                              background: actionBadge.bg,
                              border: `1px solid ${actionBadge.border}`
                            }}>
                              {actionBadge.label}
                            </span>
                          </td>
                        );
                      }
                      if (col === 'truck_no') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', fontWeight: 800, color: '#0f172a' }}>
                            {item.truck_no && item.truck_no !== '-' ? `🚛 ${item.truck_no}` : '-'}
                          </td>
                        );
                      }
                      if (col === 'truck_license') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', color: '#475569' }}>
                            {item.truck_license || '-'}
                          </td>
                        );
                      }
                      if (col === 'driver_name') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', fontWeight: 700, color: '#1e293b' }}>
                            {item.driver_name && item.driver_name !== '-' ? `👤 ${item.driver_name}` : '-'}
                          </td>
                        );
                      }
                      if (col === 'previous_assignment') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', color: '#64748b', fontSize: '12px' }}>
                            {item.previous_truck && item.previous_truck !== '-' ? (
                              <span>รถเดิม: <strong>{item.previous_truck}</strong></span>
                            ) : item.previous_driver && item.previous_driver !== '-' ? (
                              <span>คนเดิม: <strong>{item.previous_driver}</strong></span>
                            ) : '-'}
                          </td>
                        );
                      }
                      if (col === 'reason') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', color: '#334155' }}>
                            {item.reason || '-'}
                          </td>
                        );
                      }
                      if (col === 'created_by') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', color: '#64748b', fontSize: '12px' }}>
                            {item.created_by || 'Admin'}
                          </td>
                        );
                      }
                      if (col === 'timestamp') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', color: '#64748b', fontSize: '12px' }}>
                            {formatDateTimeDisplay(item.timestamp || item.created_at)}
                          </td>
                        );
                      }
                      return <td key={col} style={{ padding: '10px 14px' }}>{item[col] || '-'}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          /* ========================================== */
          /* 📜 TIMELINE VIEW                           */
          /* ========================================== */
          <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
            <div style={{
              position: 'absolute',
              left: '42px',
              top: '30px',
              bottom: '30px',
              width: '2px',
              background: '#e2e8f0',
              zIndex: 0
            }} />

            {displayedHistory.map((item, idx) => {
              const badge = ACTION_MAP[item.action] || { label: item.action, color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' };

              return (
                <div
                  key={item.id || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    position: 'relative',
                    zIndex: 1
                  }}
                >
                  <div style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: badge.bg,
                    border: `2px solid ${badge.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    flexShrink: 0,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                  }}>
                    {item.action === 'ASSIGN' ? '🟢' :
                     item.action === 'TRANSFER' ? '🔄' :
                     item.action === 'UNASSIGN' ? '🔴' :
                     item.action === 'MAINTENANCE' ? '🔧' :
                     item.action === 'MAINTENANCE_END' ? '✅' :
                     item.action === 'LEAVE' ? '🟡' : '📜'}
                  </div>

                  <div style={{
                    flex: 1,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          color: badge.color,
                          background: badge.bg,
                          border: `1px solid ${badge.border}`
                        }}>
                          {badge.label}
                        </span>
                        {item.effective_date && (
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155', background: '#ffffff', padding: '2px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                            📅 มีผล: {formatDateOnly(item.effective_date)}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                        {formatDateTimeDisplay(item.timestamp || item.created_at)}
                      </span>
                    </div>

                    <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: 600 }}>
                      {item.truck_no && item.truck_no !== '-' && (
                        <span style={{ marginRight: '10px' }}>🚛 รถเบอร์: <strong>{item.truck_no}</strong></span>
                      )}
                      {item.driver_name && item.driver_name !== '-' && (
                        <span>👤 คนขับ: <strong>{item.driver_name}</strong></span>
                      )}
                    </div>

                    {item.reason && item.reason !== '-' && (
                      <div style={{ fontSize: '12.5px', color: '#475569', background: '#ffffff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                        💬 {item.reason}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Table Context Menu */}
      <TableContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        onStartEditAlias={handleStartRename}
        onAutoFitColumn={(col) => handleAutoFitColumn(col, filteredList)}
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

    </div>
  );
}
