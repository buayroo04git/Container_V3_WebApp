import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from '../context/ToastContext';
import { 
  fetchOperations, 
  createOperation, 
  updateOperation, 
  deleteOperation, 
  closeOperation,
  clearAllOperations,
  syncOperationsFromAssignedTrucks
} from '../services/operationsService';
import { fetchTrucks, fetchDrivers } from '../services/truckDriverService';
import OperationModal from '../components/operations/OperationModal';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown';
import TableContextMenu from '../components/ui/TableContextMenu';
import RenameColumnModal from '../components/ui/RenameColumnModal';
import KpiCard from '../components/ui/KpiCard';
import { useColumnPreferences } from '../hooks/useColumnPreferences';

const DEFAULT_OPERATION_COLUMNS = [
  'id',
  'truck_no',
  'driver_name',
  'operation_type',
  'start_date',
  'end_date',
  'duration_days',
  'status',
  'remark',
  'actions'
];

const DEFAULT_COLUMN_NAMES = {
  id: '#',
  truck_no: 'เบอร์รถ',
  driver_name: 'พนักงานขับรถ',
  operation_type: 'ประเภทการดำเนินงาน',
  start_date: 'วันที่เริ่มขับ',
  end_date: 'วันที่สิ้นสุด',
  duration_days: 'ระยะเวลา (วัน)',
  status: 'สถานะ',
  remark: 'หมายเหตุ',
  actions: 'จัดการ'
};

const DEFAULT_OPERATION_WIDTHS = {
  id: 60,
  truck_no: 100,
  driver_name: 160,
  operation_type: 140,
  start_date: 120,
  end_date: 135,
  duration_days: 110,
  status: 130,
  remark: 200,
  actions: 140
};

export default function TruckOperationsView() {
  const { success, error: toastError, warning } = useToast();

  const [operations, setOperations] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isTableMissing, setIsTableMissing] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [truckFilter, setTruckFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOperation, setEditingOperation] = useState(null);
  const [stopModal, setStopModal] = useState({
    isOpen: false,
    operation: null,
    endDate: new Date().toISOString().slice(0, 10)
  });

  const fileInputRef = useRef(null);
  const menuRef = useRef(null);

  // Format Date for display
  const formatDateDisplay = (dateStr) => {
    if (!dateStr || dateStr === '-') return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return String(dateStr);
    }
  };

  // Calculate Duration in Days
  const calculateDuration = (startDateStr, endDateStr) => {
    if (!startDateStr) return 0;
    try {
      const start = new Date(startDateStr);
      const end = endDateStr ? new Date(endDateStr) : new Date();
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch {
      return 0;
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
    storageKeyPrefix: 'truck_operations',
    rawColumns: DEFAULT_OPERATION_COLUMNS,
    defaultNames: DEFAULT_COLUMN_NAMES,
    defaultWidths: DEFAULT_OPERATION_WIDTHS,
    sampleRecords: operations,
    formatCellValue: (col, val, row) => {
      if (col === 'end_date') {
        return (!val || row?.status === 'active') ? '🟢 ปัจจุบัน (Ongoing)' : formatDateDisplay(val);
      }
      if (col === 'start_date') {
        return formatDateDisplay(val);
      }
      if (col === 'duration_days') {
        return `${calculateDuration(row?.start_date, row?.end_date)} วัน`;
      }
      if (col === 'status') {
        return (!row?.end_date || row?.status === 'active') ? '🟢 กำลังปฏิบัติงาน' : '⚪ สิ้นสุดแล้ว';
      }
      if (col === 'operation_type') {
        return val === 'primary' ? '🟢 คนขับประจำ' : (val === 'substitute' ? '🟡 ขับแทน' : '🟣 จ๊อบพิเศษ');
      }
      return String(val || '');
    }
  });

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [opRes, truckRes, driverRes] = await Promise.all([
        fetchOperations(),
        fetchTrucks(),
        fetchDrivers()
      ]);
      if (opRes.error) throw new Error(opRes.error);
      setOperations(opRes.data || []);
      setIsTableMissing(!!opRes.isTableMissing);
      setTrucks(truckRes.data || []);
      setDrivers(driverRes.data || []);
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

  // KPI Calculations
  const kpis = useMemo(() => {
    const total = operations.length;
    const active = operations.filter(o => !o.end_date || o.status === 'active').length;
    const activeTrucks = new Set(operations.filter(o => !o.end_date || o.status === 'active').map(o => o.truck_no)).size;
    const activeDrivers = new Set(operations.filter(o => !o.end_date || o.status === 'active').map(o => o.driver_name)).size;

    return { total, active, activeTrucks, activeDrivers };
  }, [operations]);

  // Filtered Records
  const filteredOperations = useMemo(() => {
    return operations.filter(op => {
      const isOngoing = !op.end_date || op.status === 'active';
      if (statusFilter === 'active' && !isOngoing) return false;
      if (statusFilter === 'completed' && isOngoing) return false;
      if (truckFilter !== 'ALL' && String(op.truck_no) !== String(truckFilter)) return false;
      if (typeFilter !== 'ALL' && op.operation_type !== typeFilter) return false;

      if (searchTerm.trim()) {
        const lower = searchTerm.toLowerCase();
        const tNo = String(op.truck_no || '').toLowerCase();
        const drv = String(op.driver_name || '').toLowerCase();
        const rem = String(op.remark || '').toLowerCase();
        return tNo.includes(lower) || drv.includes(lower) || rem.includes(lower);
      }
      return true;
    });
  }, [operations, statusFilter, truckFilter, typeFilter, searchTerm]);

  // Displayed Operations (Sorted & Filtered)
  const displayedOperations = useMemo(() => {
    return sortRecords(filteredOperations);
  }, [filteredOperations, sortConfig, sortRecords]);

  // Save Operation
  const handleSaveOperation = async (payload, id) => {
    if (id) {
      const { error } = await updateOperation(id, payload);
      if (error) throw new Error(error);
      success(`อัปเดตข้อมูลการดำเนินงานรถ ${payload.truck_no} เรียบร้อยแล้ว`);
    } else {
      const { error } = await createOperation(payload);
      if (error) throw new Error(error);
      success(`บันทึกการดำเนินงานรถ ${payload.truck_no} เรียบร้อยแล้ว`);
    }
    loadData();
  };

  // Open Stop Operation Dialog (Calendar Picker)
  const handleOpenStopModal = (op) => {
    const today = new Date().toISOString().slice(0, 10);
    setStopModal({
      isOpen: true,
      operation: op,
      endDate: today
    });
  };

  // Confirm Stop Operation
  const handleConfirmStop = async () => {
    if (!stopModal.operation || !stopModal.endDate) return;
    const { id, truck_no } = stopModal.operation;
    const { error } = await closeOperation(id, stopModal.endDate);
    if (error) {
      toastError('หยุดการดำเนินงานไม่สำเร็จ: ' + error);
    } else {
      success(`หยุดการดำเนินงานรถ ${truck_no} ณ วันที่ ${stopModal.endDate} เรียบร้อยแล้ว`);
      setStopModal({ isOpen: false, operation: null, endDate: '' });
      loadData();
    }
  };

  // Delete Operation
  const handleDeleteOperation = async (id, truckNo) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบบันทึกการดำเนินงานรถ ${truckNo}?`)) return;
    const { error } = await deleteOperation(id);
    if (error) {
      toastError('ลบไม่สำเร็จ: ' + error);
    } else {
      success('ลบบันทึกเรียบร้อยแล้ว');
      loadData();
    }
  };

  // Clear All Operations
  const handleClearAll = async () => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างบันทึกการดำเนินงานทั้งหมด?')) return;
    await clearAllOperations();
    setOperations([]);
    success('ล้างข้อมูลการดำเนินงานทั้งหมดเรียบร้อยแล้ว');
    loadData();
  };

  // Sync Operations from current assigned trucks
  const handleSyncFromTrucks = async () => {
    setLoading(true);
    try {
      const res = await syncOperationsFromAssignedTrucks();
      if (res.error) throw new Error(res.error);
      setOperations(res.data || []);
      success('ซิงค์ข้อมูลการดำเนินงานจากรถและคนขับประจำเรียบร้อยแล้ว');
      loadData();
    } catch (err) {
      toastError('ซิงค์ไม่สำเร็จ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    if (filteredOperations.length === 0) {
      warning('ไม่มีข้อมูลสำหรับส่งออก');
      return;
    }
    const exportData = filteredOperations.map((o, idx) => ({
      '#': idx + 1,
      'เบอร์รถ': o.truck_no,
      'พนักงานขับรถ': o.driver_name,
      'ประเภท': o.operation_type === 'primary' ? 'คนขับประจำ' : (o.operation_type === 'substitute' ? 'ขับแทน' : 'จ๊อบพิเศษ'),
      'วันที่เริ่ม': o.start_date || '-',
      'วันที่สิ้นสุด': o.end_date || 'ปัจจุบัน (กำลังปฏิบัติงาน)',
      'ระยะเวลา (วัน)': calculateDuration(o.start_date, o.end_date),
      'สถานะ': (!o.end_date || o.status === 'active') ? 'กำลังปฏิบัติงาน' : 'สิ้นสุดแล้ว',
      'หมายเหตุ': o.remark || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Truck_Operations');
    XLSX.writeFile(wb, `Truck_Operations_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
      
      {/* 1. Header & Main Actions */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        flexShrink: 0,
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ minWidth: '240px' }}>
          <h1 style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📜</span> ประวัติการดำเนินงานรถ (Vehicle Operations)
          </h1>
          <p style={{ margin: 0, fontSize: '13.5px', color: '#64748b' }}>
            บันทึกช่วงเวลาการขับขี่ มอบหมายคนขับประจำรถ เชื่อมโยงประวัติงาน และตรวจสอบย้อนหลัง
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={handleSyncFromTrucks}
            style={{
              padding: '9px 14px',
              borderRadius: '8px',
              border: '1px solid #bae6fd',
              background: '#f0f9ff',
              color: '#0284c7',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="ดึงข้อมูลคนขับประจำรถปัจจุบันมาสร้างเป็นบันทึกการดำเนินงานอัตโนมัติ"
          >
            ⚡ ดึงจากคนขับประจำรถ
          </button>

          {operations.length > 0 && (
            <button
              onClick={handleClearAll}
              style={{
                padding: '9px 14px',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                background: '#ffffff',
                color: '#dc2626',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="ล้างข้อมูลทั้งหมด"
            >
              🗑️ ล้างทั้งหมด
            </button>
          )}

          <button
            onClick={handleExportExcel}
            style={{
              padding: '9px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            📤 ส่งออก Excel
          </button>

          <button
            onClick={() => {
              setEditingOperation(null);
              setIsModalOpen(true);
            }}
            style={{
              padding: '9px 16px',
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
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)'
            }}
          >
            ➕ เพิ่มการดำเนินงานใหม่
          </button>
        </div>
      </div>

      {/* Database Setup Notice Banner (shown if table not yet created in Supabase) */}
      {isTableMissing && (
        <div style={{
          padding: '12px 16px',
          marginBottom: '16px',
          background: '#fffbeb',
          border: '1px solid #fef3c7',
          borderLeft: '4px solid #f59e0b',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <div style={{ fontSize: '13px', color: '#92400e', lineHeight: '1.4' }}>
              <strong>ยังไม่พบตาราง <code>truck_operations</code> ใน Supabase:</strong> ข้อมูลจะถูกบันทึกชั่วคราวใน LocalStorage
              <div style={{ fontSize: '12px', color: '#b45309', marginTop: '2px' }}>
                💡 โปรดนำคำสั่ง SQL จากไฟล์ <code>supabase_truck_driver_v2_migration.sql</code> ไปรันใน <strong>Supabase Dashboard &gt; SQL Editor</strong> เพื่อเปิดใช้งานการบันทึกลง Database ถาวร
              </div>
            </div>
          </div>
          <button
            onClick={() => loadData()}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid #d97706',
              background: '#f59e0b',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            🔄 ตรวจสอบตารางใหม่
          </button>
        </div>
      )}

      {/* 2. KPI Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
        marginBottom: '16px',
        flexShrink: 0
      }}>
        <KpiCard
          title="🟢 กำลังปฏิบัติงานอยู่ (Active Ongoing)"
          value={kpis.active}
          unit="รายการ"
          theme="emerald"
        />

        <KpiCard
          title="📋 บันทึกการดำเนินงานทั้งหมด"
          value={kpis.total}
          unit="รายการ"
          theme="blue"
        />

        <KpiCard
          title="🚛 รถที่มีการปฏิบัติงาน (Active Trucks)"
          value={kpis.activeTrucks}
          unit="คัน"
          theme="indigo"
        />

        <KpiCard
          title="👤 คนขับที่ปฏิบัติงาน (Active Drivers)"
          value={kpis.activeDrivers}
          unit="ท่าน"
          theme="amber"
        />
      </div>

      {/* 3. Main Table Card */}
      <div style={{
        flex: 1,
        minHeight: 0,
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        overflow: 'hidden'
      }}>
        
        {/* Filter & Toolbar */}
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
          background: '#ffffff',
          flexWrap: 'wrap'
        }}>
          {/* ช่องค้นหา */}
          <div style={{ position: 'relative', width: '240px' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#94a3b8' }}>🔍</span>
            <input
              type="text"
              placeholder="ค้นหาเบอร์รถ, คนขับ, หมายเหตุ..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                height: '36px',
                paddingLeft: '32px',
                paddingRight: '10px',
                borderRadius: '7px',
                border: '1px solid #cbd5e1',
                fontSize: '12.5px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* ฟิลเตอร์สถานะ */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{
              height: '36px',
              padding: '0 10px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              fontWeight: 600,
              color: statusFilter !== 'ALL' ? '#2563eb' : '#334155',
              background: statusFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">ทุกสถานะ</option>
            <option value="active">🟢 กำลังปฏิบัติงาน (Ongoing)</option>
            <option value="completed">⚪ สิ้นสุดแล้ว (Completed)</option>
          </select>

          {/* ฟิลเตอร์รถ */}
          <select
            value={truckFilter}
            onChange={e => setTruckFilter(e.target.value)}
            style={{
              height: '36px',
              padding: '0 10px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              color: truckFilter !== 'ALL' ? '#2563eb' : '#334155',
              background: truckFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">ทุกเบอร์รถ</option>
            {trucks.map(t => (
              <option key={t.id} value={t.truck_no}>รถ {t.truck_no}</option>
            ))}
          </select>

          {/* ฟิลเตอร์ประเภท */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{
              height: '36px',
              padding: '0 10px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              color: typeFilter !== 'ALL' ? '#2563eb' : '#334155',
              background: typeFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">ทุกประเภท</option>
            <option value="primary">คนขับประจำ</option>
            <option value="substitute">ขับแทน</option>
            <option value="contract">จ๊อบพิเศษ</option>
          </select>

          {(searchTerm || statusFilter !== 'ALL' || truckFilter !== 'ALL' || typeFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('ALL');
                setTruckFilter('ALL');
                setTypeFilter('ALL');
              }}
              style={{
                height: '36px',
                padding: '0 10px',
                borderRadius: '7px',
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#dc2626',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              ✕ ล้างตัวกรอง
            </button>
          )}

          {/* Right: Column Visibility Dropdown */}
          <div style={{ marginLeft: 'auto' }}>
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

        {/* Scrollable Table Area */}
        <div style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          position: 'relative'
        }}>
          <table style={{
            width: '100%',
            tableLayout: 'fixed',
            borderCollapse: 'collapse',
            fontSize: '13px',
            textAlign: 'left'
          }}>
            <colgroup>
              {activeColumns.map(col => (
                <col key={col} style={{ width: `${columnWidths[col] || DEFAULT_OPERATION_WIDTHS[col] || 120}px` }} />
              ))}
            </colgroup>

            {/* Sticky Header */}
            <thead style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0'
            }}>
              <tr>
                {activeColumns.map(col => {
                  const displayName = getColDisplayName(col);
                  const isDragging = draggedCol === col;
                  const isDragOver = dragOverCol === col;
                  const isDraggable = col !== 'actions' && col !== 'id';
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
                        handleAutoFitColumn(col, filteredOperations);
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
                        textAlign: 'center',
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
                          justifyContent: 'center',
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

                      {/* Resize Handle with Subtle Divider Line */}
                      {col !== 'actions' && (
                        <div
                          draggable={false}
                          onDragStart={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleResizeMouseDown(e, col);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleAutoFitColumn(col, filteredOperations);
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

            {/* Table Body */}
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={activeColumns.length} style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>
                    <div>กำลังโหลดข้อมูลการดำเนินงานรถ...</div>
                  </td>
                </tr>
              ) : displayedOperations.length === 0 ? (
                <tr>
                  <td colSpan={activeColumns.length} style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
                    <div>ไม่พบข้อมูลการดำเนินงานรถตามเงื่อนไขที่ค้นหา</div>
                  </td>
                </tr>
              ) : (
                displayedOperations.map((op, index) => {
                  const isOngoing = !op.end_date || op.status === 'active';
                  const duration = calculateDuration(op.start_date, op.end_date);

                  return (
                    <tr
                      key={op.id || index}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: isOngoing ? '#ffffff' : '#fafafa',
                        transition: 'background 0.12s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                      onMouseLeave={(e) => e.currentTarget.style.background = isOngoing ? '#ffffff' : '#fafafa'}
                    >
                      {activeColumns.map(col => {
                        if (col === 'id') {
                          return (
                            <td key={col} style={{ padding: '10px 14px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                              {index + 1}
                            </td>
                          );
                        }

                        if (col === 'truck_no') {
                          return (
                            <td key={col} style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 800, fontSize: '13.5px', color: '#1d4ed8' }}>
                              {op.truck_no}
                            </td>
                          );
                        }

                        if (col === 'driver_name') {
                          return (
                            <td key={col} style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>
                              {op.driver_name}
                            </td>
                          );
                        }

                        if (col === 'operation_type') {
                          const typeLabel = op.operation_type === 'primary' ? '🟢 คนขับประจำ' : 
                                           (op.operation_type === 'substitute' ? '🟡 ขับแทน' : '🟣 จ๊อบพิเศษ');
                          return (
                            <td key={col} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                              {typeLabel}
                            </td>
                          );
                        }

                        if (col === 'start_date') {
                          return (
                            <td key={col} style={{ padding: '10px 14px', color: '#334155' }}>
                              {formatDateDisplay(op.start_date)}
                            </td>
                          );
                        }

                        if (col === 'end_date') {
                          return (
                            <td key={col} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              {isOngoing ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: '#ecfdf5',
                                  color: '#15803d',
                                  border: '1px solid #a7f3d0',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  fontWeight: 700,
                                  fontSize: '11.5px'
                                }}>
                                  🟢 ปัจจุบัน (Ongoing)
                                </span>
                              ) : (
                                <span style={{ color: '#64748b' }}>
                                  {formatDateDisplay(op.end_date)}
                                </span>
                              )}
                            </td>
                          );
                        }

                        if (col === 'duration_days') {
                          return (
                            <td key={col} style={{ padding: '10px 14px', fontWeight: 600, color: isOngoing ? '#1d4ed8' : '#64748b' }}>
                              {duration.toLocaleString()} วัน
                            </td>
                          );
                        }

                        if (col === 'status') {
                          return (
                            <td key={col} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                              {isOngoing ? (
                                <span style={{ color: '#15803d', fontWeight: 700, fontSize: '12px' }}>
                                  🟢 กำลังปฏิบัติงาน
                                </span>
                              ) : (
                                <span style={{ color: '#94a3b8', fontWeight: 500, fontSize: '12px' }}>
                                  ⚪ สิ้นสุดแล้ว
                                </span>
                              )}
                            </td>
                          );
                        }

                        if (col === 'remark') {
                          return (
                            <td key={col} style={{ padding: '10px 14px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {op.remark || '-'}
                            </td>
                          );
                        }

                        if (col === 'actions') {
                          return (
                            <td key={col} style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {isOngoing && (
                                <button
                                  onClick={() => handleOpenStopModal(op)}
                                  style={{
                                    background: '#fef2f2',
                                    border: '1px solid #fecaca',
                                    color: '#dc2626',
                                    padding: '4px 8px',
                                    borderRadius: '5px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    marginRight: '6px'
                                  }}
                                  title="กำหนดวันสิ้นสุด / หยุดการดำเนินงาน"
                                >
                                  🛑 หยุด
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setEditingOperation(op);
                                  setIsModalOpen(true);
                                }}
                                style={{
                                  background: '#eff6ff',
                                  border: '1px solid #bfdbfe',
                                  color: '#1d4ed8',
                                  padding: '4px 8px',
                                  borderRadius: '5px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  marginRight: '6px'
                                }}
                                title="แก้ไขข้อมูล"
                              >
                                แก้ไข
                              </button>
                              <button
                                onClick={() => handleDeleteOperation(op.id, op.truck_no)}
                                style={{
                                  background: '#fef2f2',
                                  border: '1px solid #fecaca',
                                  color: '#dc2626',
                                  padding: '4px 8px',
                                  borderRadius: '5px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                                title="ลบรายการ"
                              >
                                ลบ
                              </button>
                            </td>
                          );
                        }

                        return (
                          <td key={col} style={{ padding: '10px 14px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {op[col] || '-'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / Status Bar */}
        <div style={{
          padding: '10px 18px',
          borderTop: '1px solid #f1f5f9',
          background: '#f8fafc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12.5px',
          color: '#64748b',
          flexShrink: 0
        }}>
          <div>
            แสดง <strong>{filteredOperations.length}</strong> จากทั้งหมด <strong>{operations.length}</strong> รายการ
          </div>
          <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
            💡 ดับเบิ้ลคลิกหัวตารางเพื่อ Auto-fit / คลิกขวาเพื่อจัดการคอลัมน์
          </div>
        </div>
      </div>

      {/* Operation Modal */}
      <OperationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveOperation}
        operation={editingOperation}
        truckList={trucks}
        driverList={drivers}
      />

      {/* Context Menu */}
      <TableContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        onStartEditAlias={handleStartRename}
        onAutoFitColumn={(col) => handleAutoFitColumn(col, filteredOperations)}
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

      {/* Modal หยุดการดำเนินงาน (Stop Operation Modal with Calendar Picker) */}
      {stopModal.isOpen && stopModal.operation && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              padding: '18px 20px',
              background: '#fef2f2',
              borderBottom: '1px solid #fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '22px' }}>🛑</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#991b1b' }}>
                    หยุดการดำเนินงานรถ {stopModal.operation.truck_no}
                  </h3>
                  <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px' }}>
                    คนขับ: {stopModal.operation.driver_name} (เริ่ม {formatDateDisplay(stopModal.operation.start_date)})
                  </div>
                </div>
              </div>
              <button
                onClick={() => setStopModal({ isOpen: false, operation: null, endDate: '' })}
                style={{ background: 'none', border: 'none', fontSize: '16px', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                📅 ระบุวันที่หยุดการดำเนินงาน
              </label>
              <input
                type="date"
                value={stopModal.endDate}
                onChange={e => setStopModal(prev => ({ ...prev, endDate: e.target.value }))}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  fontWeight: 600,
                  boxSizing: 'border-box',
                  background: '#ffffff',
                  cursor: 'pointer'
                }}
              />
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px', lineHeight: '1.4' }}>
                💡 วันที่สิ้นสุดจะถูกบันทึกลงใน Timeline ประวัติ และปลดสถานะปฏิบัติงานของรถคันนี้
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '14px 20px',
              background: '#f8fafc',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                type="button"
                onClick={() => setStopModal({ isOpen: false, operation: null, endDate: '' })}
                style={{
                  padding: '8px 16px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmStop}
                style={{
                  padding: '8px 18px',
                  borderRadius: '7px',
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)'
                }}
              >
                🛑 ยืนยันหยุดการดำเนินงาน
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
