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
import KpiCard from '../components/ui/KpiCard';
import UniversalTableContainer from '../components/ui/UniversalTableContainer';
import UniversalTableHeader from '../components/ui/UniversalTableHeader';
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
  id: 45,
  truck_no: 95,
  driver_name: 150,
  operation_type: 130,
  start_date: 110,
  end_date: 125,
  duration_days: 100,
  status: 120,
  remark: 160,
  actions: 130
};

const OPERATION_ALIGN_MAP = {
  id: 'center',
  truck_no: 'center',
  driver_name: 'left',
  operation_type: 'center',
  start_date: 'center',
  end_date: 'center',
  duration_days: 'right',
  status: 'center',
  remark: 'left',
  actions: 'center'
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
  const opPrefs = useColumnPreferences({
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

  const { activeColumns, sortRecords, sortConfig } = opPrefs;

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

  // KPI Calculations
  const kpis = useMemo(() => {
    const total = operations.length;
    const activeOps = operations.filter(o => !o.end_date || o.status === 'active');
    const active = activeOps.length;
    const completed = operations.filter(o => o.end_date && o.status === 'completed').length;
    
    // Type Breakdown for active
    const primaryActive = activeOps.filter(o => !o.operation_type || o.operation_type === 'primary').length;
    const substituteActive = activeOps.filter(o => o.operation_type === 'substitute').length;
    const contractActive = activeOps.filter(o => o.operation_type === 'contract').length;

    // Total substitute operations across history
    const totalSubstitute = operations.filter(o => o.operation_type === 'substitute').length;

    // Fleet utilization rate
    const totalFleetTrucks = trucks.length;
    const utilizationRate = totalFleetTrucks > 0 ? Math.round((active / totalFleetTrucks) * 100) : 0;

    // Duration days calculation
    const totalDays = operations.reduce((sum, o) => sum + (Number(o.duration_days) || 1), 0);
    const avgDuration = total > 0 ? Math.round(totalDays / total) : 0;

    return {
      total,
      active,
      completed,
      primaryActive,
      substituteActive,
      contractActive,
      totalSubstitute,
      totalFleetTrucks,
      utilizationRate,
      totalDays,
      avgDuration
    };
  }, [operations, trucks]);

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
      padding: '4px 28px 20px 28px',
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
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
            <input
              type="text"
              placeholder="ค้นหาเบอร์รถ, คนขับ, หมายเหตุ..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                height: '36px',
                paddingLeft: '32px',
                paddingRight: searchTerm ? '28px' : '10px',
                borderRadius: '7px',
                border: '1px solid #cbd5e1',
                fontSize: '12.5px',
                boxSizing: 'border-box'
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="ล้างคำค้นหา"
              >
                ✕
              </button>
            )}
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
            <ColumnVisibilityDropdown preferences={opPrefs} />
          </div>
        </div>

        {/* Universal Table Area */}
        <UniversalTableContainer
          preferences={opPrefs}
          style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}
        >
          <UniversalTableHeader
            preferences={opPrefs}
            data={filteredOperations}
            alignMap={OPERATION_ALIGN_MAP}
          />

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
                        const align = OPERATION_ALIGN_MAP[col] || 'left';
                        const cellStyle = {
                          padding: '8px 10px',
                          textAlign: align,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        };

                        if (col === 'id') {
                          return (
                            <td key={col} style={{ ...cellStyle, color: '#94a3b8', fontSize: '12px' }}>
                              {index + 1}
                            </td>
                          );
                        }

                        if (col === 'truck_no') {
                          return (
                            <td key={col} style={{ ...cellStyle, fontFamily: 'monospace', fontWeight: 800, fontSize: '13.5px', color: '#1d4ed8' }}>
                              {op.truck_no}
                            </td>
                          );
                        }

                        if (col === 'driver_name') {
                          return (
                            <td key={col} style={{ ...cellStyle, fontWeight: 600, color: '#0f172a' }}>
                              {op.driver_name}
                            </td>
                          );
                        }

                        if (col === 'operation_type') {
                          const typeLabel = op.operation_type === 'primary' ? '🟢 คนขับประจำ' : 
                                           (op.operation_type === 'substitute' ? '🟡 ขับแทน' : '🟣 จ๊อบพิเศษ');
                          return (
                            <td key={col} style={{ ...cellStyle, fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                              {typeLabel}
                            </td>
                          );
                        }

                        if (col === 'start_date') {
                          return (
                            <td key={col} style={{ ...cellStyle, color: '#334155' }}>
                              {formatDateDisplay(op.start_date)}
                            </td>
                          );
                        }

                        if (col === 'end_date') {
                          return (
                            <td key={col} style={cellStyle}>
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
                            <td key={col} style={{ ...cellStyle, fontWeight: 600, color: isOngoing ? '#1d4ed8' : '#64748b' }}>
                              {duration.toLocaleString()} วัน
                            </td>
                          );
                        }

                        if (col === 'status') {
                          return (
                            <td key={col} style={cellStyle}>
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
                            <td key={col} style={{ ...cellStyle, color: '#64748b' }}>
                              {op.remark || '-'}
                            </td>
                          );
                        }

                        if (col === 'actions') {
                          return (
                            <td key={col} style={cellStyle}>
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
                          <td key={col} style={{ ...cellStyle, color: '#334155' }}>
                            {op[col] || '-'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
        </UniversalTableContainer>

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
