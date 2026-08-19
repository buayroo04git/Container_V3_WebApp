import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from '../context/ToastContext';
import {
  fetchMaintenanceRecords,
  createMaintenanceRecord,
  updateMaintenanceRecord,
  deleteMaintenanceRecord
} from '../services/maintenanceService';
import { fetchTrucks } from '../services/truckDriverService';
import MaintenanceModal from '../components/maintenance/MaintenanceModal';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown';
import TableContextMenu from '../components/ui/TableContextMenu';
import RenameColumnModal from '../components/ui/RenameColumnModal';
import KpiCard from '../components/ui/KpiCard';
import { useColumnPreferences } from '../hooks/useColumnPreferences';

const DEFAULT_MAINTENANCE_COLUMNS = [
  'id',
  'truck_no',
  'maintenance_type',
  'start_date',
  'garage_name',
  'mileage',
  'cost_parts',
  'cost_labor',
  'cost_total',
  'invoice_no',
  'parts_list',
  'remark',
  'actions'
];

const DEFAULT_COLUMN_NAMES = {
  id: '#',
  truck_no: 'เบอร์รถ',
  maintenance_type: 'ประเภทการซ่อม',
  start_date: 'วันที่ซ่อม',
  garage_name: 'อู่ / ศูนย์บริการ',
  mileage: 'เลขไมล์ (กม.)',
  cost_parts: 'ค่าอะไหล่ (บาท)',
  cost_labor: 'ค่าแรง (บาท)',
  cost_total: 'ยอดรวม (บาท)',
  invoice_no: 'เลขที่บิล',
  parts_list: 'รายการอะไหล่',
  remark: 'หมายเหตุ',
  actions: 'จัดการ'
};

const DEFAULT_MAINTENANCE_WIDTHS = {
  id: 55,
  truck_no: 100,
  maintenance_type: 160,
  start_date: 115,
  garage_name: 170,
  mileage: 110,
  cost_parts: 110,
  cost_labor: 110,
  cost_total: 130,
  invoice_no: 120,
  parts_list: 200,
  remark: 170,
  actions: 100
};

const MAINTENANCE_TYPE_MAP = {
  general: { label: '🔧 ซ่อมทั่วไป', color: '#475569', bg: '#f1f5f9' },
  periodic: { label: '🛢️ เช็กระยะ/ของเหลว', color: '#0284c7', bg: '#e0f2fe' },
  tire: { label: '🛞 ยาง/ปะยาง', color: '#7c3aed', bg: '#ede9fe' },
  brake: { label: '🛑 ระบบเบรก/ลม', color: '#dc2626', bg: '#fee2e2' },
  engine: { label: '⚙️ เครื่องยนต์/เกียร์', color: '#b45309', bg: '#fef3c7' },
  suspension: { label: '🔩 ช่วงล่าง/เพลา', color: '#c2410c', bg: '#ffedd5' },
  electrical: { label: '⚡ ไฟ/แอร์', color: '#ca8a04', bg: '#fef9c3' },
  body: { label: '🚛 ตัวถัง/สี', color: '#4f46e5', bg: '#e0e7ff' },
  inspection: { label: '📋 ตรวจสภาพ/ภาษี', color: '#059669', bg: '#d1fae5' }
};

export default function TruckMaintenanceView() {
  const { success, error: toastError, warning } = useToast();
  const [records, setRecords] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [truckFilter, setTruckFilter] = useState('ALL');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  const menuRef = useRef(null);

  // Format Date
  const formatDateDisplay = (dateStr) => {
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
    storageKeyPrefix: 'truck_maintenance',
    rawColumns: DEFAULT_MAINTENANCE_COLUMNS,
    defaultNames: DEFAULT_COLUMN_NAMES,
    defaultWidths: DEFAULT_MAINTENANCE_WIDTHS,
    sampleRecords: records,
    formatCellValue: (col, val, row) => {
      if (col === 'start_date') return formatDateDisplay(val);
      if (col === 'maintenance_type') return MAINTENANCE_TYPE_MAP[val]?.label || val;
      if (col === 'mileage') return val ? `${Number(val).toLocaleString()} กม.` : '-';
      if (col === 'cost_parts' || col === 'cost_labor' || col === 'cost_total') return val > 0 ? `฿${Number(val).toLocaleString()}` : '-';
      return String(val || '');
    }
  });

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [maintRes, truckRes] = await Promise.all([
        fetchMaintenanceRecords(),
        fetchTrucks()
      ]);
      setRecords(maintRes?.data || []);
      const truckList = Array.isArray(truckRes) ? truckRes : (truckRes?.data || []);
      setTrucks(truckList);
    } catch (err) {
      toastError('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (typeFilter !== 'ALL' && r.maintenance_type !== typeFilter) return false;
      if (truckFilter !== 'ALL' && r.truck_no !== truckFilter) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchTruck = String(r.truck_no || '').toLowerCase().includes(q);
        const matchGarage = String(r.garage_name || '').toLowerCase().includes(q);
        const matchInvoice = String(r.invoice_no || '').toLowerCase().includes(q);
        const matchParts = String(r.parts_list || '').toLowerCase().includes(q);
        const matchRemark = String(r.remark || '').toLowerCase().includes(q);
        if (!matchTruck && !matchGarage && !matchInvoice && !matchParts && !matchRemark) return false;
      }
      return true;
    });
  }, [records, typeFilter, truckFilter, searchTerm]);

  // Displayed Records (Sorted & Filtered)
  const displayedRecords = useMemo(() => {
    return sortRecords(filteredRecords);
  }, [filteredRecords, sortConfig, sortRecords]);

  // KPI Calculations
  const kpis = useMemo(() => {
    const totalRecords = records.length;
    const totalCost = records.reduce((sum, r) => sum + (Number(r.cost_total) || 0), 0);
    const uniqueTrucks = new Set(records.map(r => r.truck_no)).size;
    return { totalRecords, totalCost, uniqueTrucks };
  }, [records]);

  // Save Record
  const handleSaveRecord = async (formData, id) => {
    try {
      if (id) {
        const { error } = await updateMaintenanceRecord(id, formData);
        if (error) throw new Error(error);
        success('อัปเดตบันทึกการซ่อมบำรุงเรียบร้อยแล้ว');
      } else {
        const { error } = await createMaintenanceRecord(formData);
        if (error) throw new Error(error);
        success('เพิ่มบันทึกการซ่อมบำรุงเรียบร้อยแล้ว');
      }
      loadData();
    } catch (err) {
      toastError('บันทึกไม่สำเร็จ: ' + err.message);
    }
  };

  // Delete Record
  const handleDeleteRecord = async (id, truckNo) => {
    if (!window.confirm(`ยืนยันการลบบันทึกการซ่อมบำรุงของรถ ${truckNo} หรือไม่?`)) return;
    try {
      const { error } = await deleteMaintenanceRecord(id);
      if (error) throw new Error(error);
      success('ลบบันทึกเรียบร้อยแล้ว');
      loadData();
    } catch (err) {
      toastError('ลบไม่สำเร็จ: ' + err.message);
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    if (filteredRecords.length === 0) {
      warning('ไม่มีข้อมูลสำหรับส่งออก');
      return;
    }
    const exportData = filteredRecords.map((r, idx) => ({
      '#': idx + 1,
      'เบอร์รถ': r.truck_no,
      'ประเภทการซ่อม': MAINTENANCE_TYPE_MAP[r.maintenance_type]?.label || r.maintenance_type,
      'วันที่ซ่อม / ทำรายการ': r.start_date || '-',
      'อู่ / ศูนย์บริการ': r.garage_name || '-',
      'เลขไมล์ (กม.)': r.mileage || 0,
      'ค่าอะไหล่ (บาท)': r.cost_parts || 0,
      'ค่าแรง (บาท)': r.cost_labor || 0,
      'ยอดรวมค่าใช้จ่าย (บาท)': r.cost_total || 0,
      'เลขที่บิล / Invoice': r.invoice_no || '-',
      'รายการอะไหล่ / งานที่ทำ': r.parts_list || '-',
      'หมายเหตุ': r.remark || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Truck_Maintenance');
    XLSX.writeFile(wb, `Truck_Maintenance_${new Date().toISOString().slice(0, 10)}.xlsx`);
    success('ส่งออกไฟล์ Excel เรียบร้อยแล้ว');
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
            <span>🔧</span> ประวัติการซ่อมบำรุงรถ (Truck Maintenance Log)
          </h1>
          <p style={{ margin: 0, fontSize: '13.5px', color: '#64748b' }}>
            สมุดบันทึกประวัติการเข้าอู่ ค่าใช้จ่ายอะไหล่-ค่าแรง บิลใบเสร็จ และสถิติการซ่อมบำรุง
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={handleExportExcel}
            style={{
              padding: '8px 14px',
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
            📊 ส่งออก Excel
          </button>

          <button
            onClick={() => {
              setEditingRecord(null);
              setIsModalOpen(true);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
            }}
          >
            ➕ เพิ่มบันทึกการซ่อม
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
          title="💰 ยอดค่าซ่อมบำรุงรวมทั้งหมด"
          value={kpis.totalCost.toLocaleString()}
          unit="บาท"
          theme="blue"
        />
        <KpiCard
          title="📋 บันทึกประวัติการซ่อมทั้งหมด"
          value={kpis.totalRecords}
          unit="รายการ"
          theme="emerald"
        />
        <KpiCard
          title="🚛 รถที่มีประวัติเข้าซ่อม"
          value={kpis.uniqueTrucks}
          unit="คัน"
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
            placeholder="ค้นหาเบอร์รถ, อู่, บิล, อะไหล่, หมายเหตุ..."
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
          {/* ฟิลเตอร์ประเภทการซ่อม */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              background: '#fff'
            }}
          >
            <option value="ALL">ทุกประเภทการซ่อม</option>
            {Object.entries(MAINTENANCE_TYPE_MAP).map(([key, val]) => (
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

          {/* Column Visibility Dropdown */}
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
        </div>
      </div>

      {/* Table Container */}
      <div style={{
        flex: 1,
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <colgroup>
            {activeColumns.map(col => (
              <col key={col} style={{ width: `${columnWidths[col] || DEFAULT_MAINTENANCE_WIDTHS[col] || 120}px` }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700, position: 'sticky', top: 0, zIndex: 10 }}>
              {activeColumns.map((col) => {
                const isDraggable = col !== 'actions';
                const displayName = getColDisplayName(col);
                const colWidth = columnWidths[col] || DEFAULT_MAINTENANCE_WIDTHS[col] || 100;
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
                      if (!isDraggable) return;
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
                      handleAutoFitColumn(col, filteredRecords);
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
                      textAlign: col === 'cost_parts' || col === 'cost_labor' || col === 'cost_total' ? 'right' : (col === 'id' || col === 'actions' ? 'center' : 'left'),
                      cursor: !isDraggable ? 'default' : (isDragging ? 'grabbing' : 'grab'),
                      background: isDragOver ? '#eff6ff' : (isSorted ? '#eff6ff' : (isDragging ? '#f1f5f9' : '#f8fafc')),
                      borderLeft: isDragOver ? '3px solid #2563eb' : 'none',
                      borderBottom: isSorted ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      opacity: isDragging ? 0.4 : 1,
                      transform: isDragging ? 'scale(0.97)' : (isDragOver ? 'translateX(2px)' : 'none'),
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div
                      onClick={() => isDraggable && handleSort(col)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: col === 'cost_parts' || col === 'cost_labor' || col === 'cost_total' ? 'flex-end' : (col === 'id' || col === 'actions' ? 'center' : 'flex-start'),
                        gap: '5px',
                        cursor: isDraggable ? 'pointer' : 'default',
                        userSelect: 'none',
                        paddingRight: col !== 'actions' ? '4px' : '0'
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
                      {isDraggable && (
                        <span style={{ fontSize: '11px', color: isSorted ? '#2563eb' : '#94a3b8', flexShrink: 0, opacity: isSorted ? 1 : 0.4 }}>
                          {isAsc ? '▲' : isDesc ? '▼' : '↕'}
                        </span>
                      )}
                    </div>

                    {/* Resize Handle */}
                    {col !== 'actions' && (
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
                          handleAutoFitColumn(col, filteredRecords);
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
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={activeColumns.length} style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>
                  <div>กำลังโหลดข้อมูลประวัติการซ่อมบำรุง...</div>
                </td>
              </tr>
            ) : displayedRecords.length === 0 ? (
              <tr>
                <td colSpan={activeColumns.length} style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
                  <div>ไม่พบข้อมูลประวัติการซ่อมบำรุงตามเงื่อนไข</div>
                </td>
              </tr>
            ) : (
              displayedRecords.map((r, idx) => {
                const typeStyle = MAINTENANCE_TYPE_MAP[r.maintenance_type] || MAINTENANCE_TYPE_MAP.general;

                return (
                  <tr
                    key={r.id || idx}
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
                      if (col === 'truck_no') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', fontWeight: 800, color: '#0f172a' }}>
                            🚛 {r.truck_no}
                          </td>
                        );
                      }
                      if (col === 'maintenance_type') {
                        return (
                          <td key={col} style={{ padding: '10px 14px' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: typeStyle.color,
                              background: typeStyle.bg
                            }}>
                              {typeStyle.label}
                            </span>
                          </td>
                        );
                      }
                      if (col === 'start_date') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', color: '#334155' }}>
                            {formatDateDisplay(r.start_date)}
                          </td>
                        );
                      }
                      if (col === 'garage_name') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', color: '#334155' }}>
                            {r.garage_name || '-'}
                          </td>
                        );
                      }
                      if (col === 'mileage') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', color: '#64748b' }}>
                            {r.mileage && r.mileage > 0 ? `${Number(r.mileage).toLocaleString()} กม.` : '-'}
                          </td>
                        );
                      }
                      if (col === 'cost_parts') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', textAlign: 'right', color: '#64748b' }}>
                            {r.cost_parts > 0 ? `฿${Number(r.cost_parts).toLocaleString()}` : '-'}
                          </td>
                        );
                      }
                      if (col === 'cost_labor') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', textAlign: 'right', color: '#64748b' }}>
                            {r.cost_labor > 0 ? `฿${Number(r.cost_labor).toLocaleString()}` : '-'}
                          </td>
                        );
                      }
                      if (col === 'cost_total') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: r.cost_total > 0 ? '#15803d' : '#94a3b8' }}>
                            {r.cost_total > 0 ? `฿${Number(r.cost_total).toLocaleString()}` : '-'}
                          </td>
                        );
                      }
                      if (col === 'invoice_no') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', color: '#64748b' }}>
                            {r.invoice_no && r.invoice_no !== '-' ? (
                              <span style={{ padding: '2px 6px', background: '#f1f5f9', borderRadius: '4px', fontSize: '11.5px', fontWeight: 600 }}>
                                {r.invoice_no}
                              </span>
                            ) : '-'}
                          </td>
                        );
                      }
                      if (col === 'parts_list') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.parts_list}>
                            {r.parts_list && r.parts_list !== '-' ? r.parts_list : '-'}
                          </td>
                        );
                      }
                      if (col === 'remark') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.remark}>
                            {r.remark && r.remark !== '-' ? r.remark : '-'}
                          </td>
                        );
                      }
                      if (col === 'actions') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button
                                onClick={() => {
                                  setEditingRecord(r);
                                  setIsModalOpen(true);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  color: '#2563eb',
                                  fontSize: '12px',
                                  cursor: 'pointer'
                                }}
                                title="แก้ไข"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteRecord(r.id, r.truck_no)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid #fee2e2',
                                  background: '#fff1f2',
                                  color: '#e11d48',
                                  fontSize: '12px',
                                  cursor: 'pointer'
                                }}
                                title="ลบ"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        );
                      }
                      return <td key={col} style={{ padding: '10px 14px' }}>{r[col] || '-'}</td>;
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Maintenance Modal */}
      <MaintenanceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveRecord}
        record={editingRecord}
        truckList={trucks}
      />

      {/* Table Context Menu */}
      <TableContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        onStartEditAlias={handleStartRename}
        onAutoFitColumn={(col) => handleAutoFitColumn(col, filteredRecords)}
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
