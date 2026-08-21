import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from '../context/ToastContext';
import { 
  fetchTrucks, 
  createTruck, 
  updateTruck, 
  deleteTruck, 
  bulkUpsertTrucks,
  fetchDrivers 
} from '../services/truckDriverService';
import TruckModal from '../components/trucks/TruckModal';
import AssignmentHistoryModal from '../components/ui/AssignmentHistoryModal';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown';
import TableContextMenu from '../components/ui/TableContextMenu';
import RenameColumnModal from '../components/ui/RenameColumnModal';
import StatusChangeConfirmModal from '../components/ui/StatusChangeConfirmModal';
import Badge from '../components/ui/Badge';
import KpiCard from '../components/ui/KpiCard';
import { useColumnPreferences } from '../hooks/useColumnPreferences';

const DEFAULT_TRUCK_COLUMNS = [
  'id',
  'truck_no',
  'status',
  'truck_license',
  'assigned_driver_name',
  'owner',
  'master_containers',
  'matched_containers',
  'missing_containers',
  'match_rate',
  'truck_type',
  'truck_kind',
  'brand',
  'tax_expiry_date',
  'act_expiry_date',
  'insurance_expiry_date',
  'remark',
  'actions'
];

const DEFAULT_COLUMN_NAMES = {
  id: '#',
  truck_no: 'เบอร์รถ',
  status: 'สถานะ',
  truck_license: 'ป้ายทะเบียน',
  assigned_driver_name: 'คนขับประจำ',
  owner: 'เจ้าของรถ',
  master_containers: 'งานในใบวางบิล',
  matched_containers: 'ตรวจสอบแล้ว',
  missing_containers: 'รอตรวจสอบ',
  match_rate: 'ความคืบหน้า',
  truck_type: 'ประเภทรถ',
  truck_kind: 'ชนิดตัวถัง',
  brand: 'ยี่ห้อ',
  tax_expiry_date: 'หมดอายุภาษี',
  act_expiry_date: 'หมดอายุ พ.ร.บ.',
  insurance_expiry_date: 'หมดอายุประกันภัย',
  remark: 'หมายเหตุ',
  actions: 'จัดการ'
};

const DEFAULT_TRUCK_WIDTHS = {
  id: 60,
  truck_no: 100,
  status: 120,
  truck_license: 125,
  assigned_driver_name: 155,
  owner: 130,
  master_containers: 130,
  matched_containers: 130,
  missing_containers: 130,
  match_rate: 115,
  truck_type: 120,
  truck_kind: 110,
  brand: 100,
  tax_expiry_date: 120,
  act_expiry_date: 120,
  insurance_expiry_date: 125,
  remark: 160,
  actions: 100
};

export default function TrucksView() {
  const { success, error: toastError, warning } = useToast();

  const [trucks, setTrucks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState(null);
  const [historyModal, setHistoryModal] = useState({
    isOpen: false,
    targetType: 'ALL',
    targetId: null,
    targetTitle: ''
  });
  const [statusConfirmModal, setStatusConfirmModal] = useState({
    isOpen: false,
    truck: null,
    newStatus: ''
  });

  // Format Date for display
  const formatDateDisplay = (dateStr) => {
    if (!dateStr || dateStr === '-') return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  // File Upload Ref
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);

  // Column Preferences Hook (Unified Centralized Architecture)
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
    storageKeyPrefix: 'trucks',
    rawColumns: DEFAULT_TRUCK_COLUMNS,
    defaultNames: DEFAULT_COLUMN_NAMES,
    defaultWidths: DEFAULT_TRUCK_WIDTHS,
    sampleRecords: trucks,
    formatCellValue: (col, val, row) => {
      if (col === 'status') {
        return val === 'active' ? '🟢 พร้อมใช้งาน' : (val === 'maintenance' ? '🔧 ซ่อมบำรุง' : '⚪ ระงับใช้งาน');
      }
      if (col === 'assigned_driver_name') {
        return (val && val !== '-') ? String(val).trim() : '-';
      }
      if (col === 'truck_no') {
        return `รถ ${val}`;
      }
      if (col === 'matched_containers') {
        return Number(val || 0) > 0 ? `🟢 ${Number(val).toLocaleString()}` : '0';
      }
      if (col === 'missing_containers') {
        return Number(val || 0) > 0 ? `⚠️ ${Number(val).toLocaleString()}` : '0';
      }
      if (col === 'master_containers' || col === 'total_containers') {
        return Number(val || 0).toLocaleString();
      }
      if (col === 'match_rate') {
        return `${Number(val || 0)}%`;
      }
      if (col === 'tax_expiry_date' || col === 'act_expiry_date' || col === 'insurance_expiry_date') {
        return formatDateDisplay(val);
      }
      return String(val || '');
    }
  });

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [truckRes, driverRes] = await Promise.all([
        fetchTrucks(),
        fetchDrivers()
      ]);
      if (truckRes.error) throw new Error(truckRes.error);
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
    const total = trucks.length;
    const active = trucks.filter(t => t.status === 'active').length;
    const maintenance = trucks.filter(t => t.status === 'maintenance').length;
    const totalMaster = trucks.reduce((sum, t) => sum + (t.master_containers || 0), 0);
    const totalMatched = trucks.reduce((sum, t) => sum + (t.matched_containers || 0), 0);
    const totalMissing = trucks.reduce((sum, t) => sum + (t.missing_containers || 0), 0);
    return { total, active, maintenance, totalMaster, totalMatched, totalMissing };
  }, [trucks]);

  // Filtered Records
  const filteredTrucks = useMemo(() => {
    return trucks.filter(t => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && t.truck_type !== typeFilter) return false;
      if (searchTerm.trim()) {
        const lower = searchTerm.toLowerCase();
        const tNo = String(t.truck_no || '').toLowerCase();
        const lic = String(t.truck_license || '').toLowerCase();
        const own = String(t.owner || '').toLowerCase();
        const drv = String(t.assigned_driver_name || '').toLowerCase();
        const brd = String(t.brand || '').toLowerCase();
        return tNo.includes(lower) || lic.includes(lower) || own.includes(lower) || drv.includes(lower) || brd.includes(lower);
      }
      return true;
    });
  }, [trucks, statusFilter, typeFilter, searchTerm]);

  // Displayed Trucks (Sorted & Filtered)
  const displayedTrucks = useMemo(() => {
    return sortRecords(filteredTrucks);
  }, [filteredTrucks, sortConfig, sortRecords]);

  // Unique Truck Types for Filter
  const uniqueTypes = useMemo(() => {
    const set = new Set(trucks.map(t => t.truck_type).filter(Boolean));
    return Array.from(set);
  }, [trucks]);

  // Save Truck (Create / Update)
  const handleSaveTruck = async (formData, id) => {
    if (id) {
      const { data, error } = await updateTruck(id, formData);
      if (error) throw new Error(error);
      success(`อัปเดตข้อมูลรถเบอร์ ${formData.truck_no} สำเร็จ`);
    } else {
      const { data, error } = await createTruck(formData);
      if (error) throw new Error(error);
      success(`เพิ่มรถเบอร์ ${formData.truck_no} เรียบร้อยแล้ว`);
    }
    loadData();
  };

  // Delete Truck
  const handleDeleteTruck = async (id, truckNo) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรถเบอร์ ${truckNo}?`)) return;
    const res = await deleteTruck(id, truckNo);
    if (res?.error) {
      toastError('ลบไม่สำเร็จ: ' + res.error);
    } else {
      success(res?.message || `ลบรถเบอร์ ${truckNo} เรียบร้อยแล้ว`);
      loadData();
    }
  };

  // Quick Inline Update for Truck Status
  const handleInlineStatusChange = async (truck, newStatus) => {
    if (truck.status === newStatus) return;

    const isEnteringNonActive = newStatus === 'maintenance' || newStatus === 'inactive';
    const isReturningFromMaintenance = truck.status === 'maintenance' && newStatus === 'active';

    // ถ้าเข้าซ่อม/ระงับใช้ หรือซ่อมเสร็จกลับมาพร้อมใช้งาน ให้เปิด Modal เก็บช่วงเวลาและยืนยัน
    if (isEnteringNonActive || isReturningFromMaintenance) {
      setStatusConfirmModal({
        isOpen: true,
        truck,
        newStatus
      });
      return;
    }

    // กรณีทั่วไป (เช่น จาก inactive -> active) ให้อัปเดตทันที
    try {
      setTrucks(prev => prev.map(t => t.id === truck.id ? { ...t, status: newStatus } : t));
      const { error } = await updateTruck(truck.id, {
        ...truck,
        status: newStatus,
        autoStopOperation: false
      });
      if (error) throw new Error(error);
      success(`อัปเดตสถานะรถ ${truck.truck_no} เป็น "${newStatus === 'active' ? 'พร้อมใช้งาน' : (newStatus === 'maintenance' ? 'ซ่อมบำรุง' : 'ระงับใช้งาน')}" เรียบร้อยแล้ว`);
      loadData();
    } catch (err) {
      toastError('อัปเดตสถานะไม่สำเร็จ: ' + err.message);
      loadData();
    }
  };

  // Callback เมื่อกดยืนยันจาก StatusChangeConfirmModal
  const handleStatusModalConfirm = async ({ autoStopOperation, effectiveDate, startDate, expectedEndDate, isIndefinite, statusReason }) => {
    const { truck, newStatus } = statusConfirmModal;
    if (!truck) return;

    try {
      setTrucks(prev => prev.map(t => t.id === truck.id ? { 
        ...t, 
        status: newStatus,
        assigned_driver_name: autoStopOperation ? '-' : t.assigned_driver_name 
      } : t));

      const { error } = await updateTruck(truck.id, {
        ...truck,
        status: newStatus,
        autoStopOperation,
        effectiveDate,
        startDate,
        expectedEndDate,
        isIndefinite,
        statusReason
      });
      if (error) throw new Error(error);
      success(`อัปเดตสถานะรถ ${truck.truck_no} เป็น "${newStatus === 'active' ? 'พร้อมใช้งาน' : (newStatus === 'maintenance' ? 'ซ่อมบำรุง' : 'ระงับใช้งาน')}" (มีผล ${effectiveDate}) เรียบร้อยแล้ว`);
      loadData();
    } catch (err) {
      toastError('อัปเดตสถานะไม่สำเร็จ: ' + err.message);
      loadData();
    }
  };

  // Import Excel
  const handleImportExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' });

        const mappedList = rawData.map(row => ({
          truck_no: String(row['เบอร์รถ'] || row['truck_no'] || row['Truck No'] || row['เลขรถ'] || '').trim(),
          truck_license: row['ป้ายทะเบียน'] || row['truck_license'] || row['ทะเบียน'] || '-',
          owner: row['เจ้าของรถ'] || row['owner'] || row['เจ้าของ'] || row['สังกัด'] || '-',
          truck_type: row['ประเภทรถ'] || row['truck_type'] || 'หัวลาก 10 ล้อ',
          truck_kind: row['ชนิดตัวถัง'] || row['truck_kind'] || 'กึ่งพ่วง',
          brand: row['ยี่ห้อ'] || row['brand'] || '-',
          status: row['สถานะ'] === 'ซ่อมบำรุง' ? 'maintenance' : (row['สถานะ'] === 'ระงับใช้งาน' ? 'inactive' : 'active'),
          assigned_driver_name: row['คนขับประจำ'] || row['คนขับ'] || row['assigned_driver_name'] || '-',
          tax_expiry_date: row['หมดอายุภาษี'] || row['tax_expiry_date'] || null,
          act_expiry_date: row['หมดอายุ พ.ร.บ.'] || row['act_expiry_date'] || null,
          insurance_expiry_date: row['หมดอายุประกัน'] || row['insurance_expiry_date'] || null,
          remark: row['หมายเหตุ'] || row['remark'] || '-'
        })).filter(t => t.truck_no);

        if (mappedList.length === 0) {
          warning('ไม่พบข้อมูลเบอร์รถในไฟล์ Excel ที่เลือก');
          return;
        }

        const { count, error } = await bulkUpsertTrucks(mappedList);
        if (error) throw new Error(error);
        success(`นำเข้าข้อมูลรถเรียบร้อยแล้ว ${count} คัน`);
        loadData();
      };
      reader.readAsBinaryString(file);
    } catch (err) {
      toastError('นำเข้าไม่สำเร็จ: ' + err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    if (filteredTrucks.length === 0) {
      warning('ไม่มีข้อมูลสำหรับส่งออก');
      return;
    }
    const exportData = filteredTrucks.map((t, idx) => ({
      '#': idx + 1,
      'เบอร์รถ': t.truck_no,
      'สถานะ': t.status === 'active' ? 'พร้อมใช้งาน' : (t.status === 'maintenance' ? 'ซ่อมบำรุง' : 'ระงับใช้งาน'),
      'ป้ายทะเบียน': t.truck_license || '-',
      'เจ้าของรถ': t.owner || '-',
      'คนขับประจำ': t.assigned_driver_name || '-',
      'ประเภทรถ': t.truck_type || '-',
      'ชนิดตัวถัง': t.truck_kind || '-',
      'ยี่ห้อ': t.brand || '-',
      'งานใน DB (งาน)': t.master_containers || 0,
      'ตรวจสอบแล้ว (งาน)': t.matched_containers || 0,
      'รอตรวจสอบ (งาน)': t.missing_containers || 0,
      'ความคืบหน้า (%)': `${t.match_rate || 0}%`,
      'หมดอายุภาษี': t.tax_expiry_date || '-',
      'หมดอายุ พ.ร.บ.': t.act_expiry_date || '-',
      'หมดอายุประกันภัย': t.insurance_expiry_date || '-',
      'หมายเหตุ': t.remark || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trucks');
    XLSX.writeFile(wb, `Truck_List_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
            <span>🚛</span> ข้อมูลรถประจำการ (Fleet Management)
          </h1>
          <p style={{ margin: 0, fontSize: '13.5px', color: '#64748b' }}>
            จัดการทะเบียนรถ สถานะพร้อมใช้งาน คนขับประจำรถ และสถิติเที่ยววิ่งจริง
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* ซ่อน File Input สำหรับ Import */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportExcel}
            accept=".xlsx, .xls, .csv"
            style={{ display: 'none' }}
          />

          <button
            onClick={() => setHistoryModal({
              isOpen: true,
              targetType: 'ALL',
              targetId: null,
              targetTitle: '📜 บันทึกประวัติการครองรถ & สลับคนขับ (Timeline ทั้งหมด)'
            })}
            style={{
              padding: '9px 14px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="ดูประวัติการครองรถ การย้ายรถ และการลาออกทั้งหมด"
          >
            📜 ประวัติ Timeline
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
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
            📥 นำเข้า Excel
          </button>

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
              setEditingTruck(null);
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
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
            }}
          >
            ➕ เพิ่มรถใหม่
          </button>
        </div>
      </div>

      {/* 2. KPI Metric Cards (Standardized Central Component) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
        marginBottom: '16px',
        flexShrink: 0
      }}>
        <KpiCard
          title="🚛 รถทั้งหมดในระบบ"
          value={kpis.total}
          unit="คัน"
          theme="slate"
        />

        <KpiCard
          title="🟢 พร้อมใช้งาน (Active)"
          value={kpis.active}
          unit="คัน"
          theme="green"
        />

        <KpiCard
          title="📋 งานทั้งหมดในใบวางบิล"
          value={kpis.totalMaster}
          unit="งาน"
          theme="blue"
        />

        <KpiCard
          title="🟢 ตรวจสอบแล้ว (Matched)"
          value={kpis.totalMatched}
          unit="งาน"
          theme="emerald"
        />

        <KpiCard
          title="⚠️ รอตรวจสอบ (Pending Scan)"
          value={kpis.totalMissing}
          unit="งาน"
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
              placeholder="ค้นหาเบอร์รถ, ทะเบียน, คนขับ..."
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
            <option value="ALL">ทุกสถานะ ({trucks.length})</option>
            <option value="active">🟢 พร้อมใช้งาน ({trucks.filter(t => t.status === 'active').length})</option>
            <option value="maintenance">🔧 ซ่อมบำรุง ({trucks.filter(t => t.status === 'maintenance').length})</option>
            <option value="inactive">⚪ ระงับใช้งาน ({trucks.filter(t => t.status === 'inactive').length})</option>
          </select>

          {/* ฟิลเตอร์ประเภทรถ */}
          {uniqueTypes.length > 0 && (
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
              <option value="ALL">ทุกประเภทรถ</option>
              {uniqueTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}

          {(searchTerm || statusFilter !== 'ALL' || typeFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('ALL');
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

          {/* Right: Column Visibility Menu */}
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
              onStartEditAlias={handleStartRename}
              onShowAllColumns={handleShowAllColumns}
              onResetAllAliases={handleResetAllAliases}
            />
          </div>
        </div>

        {/* Scrollable Table Area (Floating Scrollbar in line of sight) */}
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
            {/* Colgroup สำหรับความกว้าง */}
            <colgroup>
              {activeColumns.map(col => (
                <col key={col} style={{ width: `${columnWidths[col] || DEFAULT_TRUCK_WIDTHS[col] || 120}px` }} />
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
                        handleAutoFitColumn(col, filteredTrucks);
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
                        transition: 'background 0.18s cubic-bezier(0.4, 0, 0.2, 1), transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s ease, border-left 0.15s ease'
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
                            handleAutoFitColumn(col, filteredTrucks);
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
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
                    <div>กำลังโหลดข้อมูลรถ...</div>
                  </td>
                </tr>
              ) : displayedTrucks.length === 0 ? (
                <tr>
                  <td colSpan={activeColumns.length} style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🚛</div>
                    <div style={{ fontWeight: 600 }}>ไม่พบข้อมูลรถตามเงื่อนไขที่เลือก</div>
                  </td>
                </tr>
              ) : (
                displayedTrucks.map((truck, idx) => (
                  <tr
                    key={truck.id || idx}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: idx % 2 === 0 ? '#ffffff' : '#fcfdfd',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fcfdfd'}
                  >
                    {activeColumns.map(col => {
                      if (col === 'id') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
                            {idx + 1}
                          </td>
                        );
                      }

                      if (col === 'truck_no') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 800, fontSize: '13.5px', color: '#1d4ed8' }}>
                            {truck.truck_no}
                          </td>
                        );
                      }

                      if (col === 'status') {
                        const statusConfig = {
                          active: { bg: '#ecfdf5', color: '#15803d' },
                          maintenance: { bg: '#fffbeb', color: '#b45309' },
                          inactive: { bg: '#f1f5f9', color: '#64748b' }
                        };
                        const cfg = statusConfig[truck.status] || statusConfig.active;

                        return (
                          <td key={col} style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                            <select
                              value={truck.status || 'active'}
                              onChange={(e) => handleInlineStatusChange(truck, e.target.value)}
                              style={{
                                padding: '2px 6px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 700,
                                background: cfg.bg,
                                color: cfg.color,
                                border: 'none',
                                cursor: 'pointer',
                                outline: 'none'
                              }}
                              title="คลิกเพื่อเปลี่ยนสถานะรถ"
                            >
                              <option value="active" style={{ background: '#fff', color: '#15803d' }}>🟢 พร้อมใช้งาน</option>
                              <option value="maintenance" style={{ background: '#fff', color: '#b45309' }}>🔧 ซ่อมบำรุง</option>
                              <option value="inactive" style={{ background: '#fff', color: '#64748b' }}>⚪ ระงับใช้งาน</option>
                            </select>
                          </td>
                        );
                      }

                      if (col === 'owner') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', fontWeight: 500, color: '#1e293b' }}>
                            {truck.owner || '-'}
                          </td>
                        );
                      }

                      if (col === 'assigned_driver_name') {
                        const isAssigned = truck.assigned_driver_name && truck.assigned_driver_name !== '-';
                        return (
                          <td key={col} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            {isAssigned ? (
                              <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '5px', 
                                color: '#1e40af', 
                                fontWeight: 700, 
                                fontSize: '13px' 
                              }}>
                                👤 {truck.assigned_driver_name}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '12.5px' }}>- (ว่าง)</span>
                            )}
                          </td>
                        );
                      }

                      if (col === 'master_containers' || col === 'total_containers') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', fontWeight: 700, color: '#1e293b' }}>
                            {Number(truck.master_containers || truck.total_containers || 0).toLocaleString()}
                          </td>
                        );
                      }

                      if (col === 'matched_containers') {
                        const val = Number(truck.matched_containers || 0);
                        return (
                          <td key={col} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            {val > 0 ? (
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
                                fontSize: '12px' 
                              }}>
                                🟢 {val.toLocaleString()}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '12.5px' }}>0</span>
                            )}
                          </td>
                        );
                      }

                      if (col === 'missing_containers') {
                        const val = Number(truck.missing_containers || 0);
                        return (
                          <td key={col} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            {val > 0 ? (
                              <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '4px', 
                                background: '#fffbeb', 
                                color: '#b45309', 
                                border: '1px solid #fde68a', 
                                padding: '2px 8px', 
                                borderRadius: '6px', 
                                fontWeight: 700, 
                                fontSize: '12px' 
                              }}>
                                ⚠️ {val.toLocaleString()}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '12.5px' }}>0</span>
                            )}
                          </td>
                        );
                      }

                      if (col === 'match_rate') {
                        const rate = Number(truck.match_rate || 0);
                        const isComplete = rate === 100 && (truck.master_containers || 0) > 0;
                        return (
                          <td key={col} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ flex: 1, minWidth: '45px', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${rate}%`, height: '100%', background: isComplete ? '#16a34a' : (rate > 0 ? '#2563eb' : '#cbd5e1'), borderRadius: '3px' }} />
                              </div>
                              <span style={{ fontSize: '11.5px', fontWeight: 700, color: isComplete ? '#16a34a' : (rate > 0 ? '#2563eb' : '#94a3b8'), minWidth: '32px' }}>
                                {rate}%
                              </span>
                            </div>
                          </td>
                        );
                      }

                      if (col === 'tax_expiry_date' || col === 'act_expiry_date' || col === 'insurance_expiry_date') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', color: '#475569' }}>
                            {formatDateDisplay(truck[col])}
                          </td>
                        );
                      }

                      if (col === 'actions') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              onClick={() => setHistoryModal({
                                isOpen: true,
                                targetType: 'TRUCK',
                                targetId: truck.truck_no,
                                targetTitle: `📜 ประวัติคนขับของรถเบอร์ ${truck.truck_no}`
                              })}
                              style={{
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                color: '#475569',
                                padding: '4px 8px',
                                borderRadius: '5px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                marginRight: '6px'
                              }}
                              title="ดูประวัติคนขับที่เคยขับรถคันนี้"
                            >
                              📜 ประวัติ
                            </button>
                            <button
                              onClick={() => {
                                setEditingTruck(truck);
                                setIsModalOpen(true);
                              }}
                              style={{
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                color: '#1d4ed8',
                                padding: '4px 10px',
                                borderRadius: '5px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                marginRight: '6px'
                              }}
                              title="แก้ไขข้อมูลรถ"
                            >
                              แก้ไข
                            </button>
                            <button
                              onClick={() => handleDeleteTruck(truck.id, truck.truck_no)}
                              style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                color: '#dc2626',
                                padding: '4px 10px',
                                borderRadius: '5px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                              title="ลบรถ"
                            >
                              ลบ
                            </button>
                          </td>
                        );
                      }

                      return (
                        <td key={col} style={{ padding: '10px 14px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {truck[col] || '-'}
                        </td>
                      );
                    })}
                  </tr>
                ))
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
            แสดง <strong>{filteredTrucks.length}</strong> จากทั้งหมด <strong>{trucks.length}</strong> คัน
          </div>
          <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
            💡 ดับเบิ้ลคลิกหัวตารางเพื่อ Auto-fit / คลิกขวาเพื่อจัดการคอลัมน์
          </div>
        </div>
      </div>

      {/* Modals & Menus */}
      <TruckModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveTruck}
        truck={editingTruck}
        driverList={drivers}
      />

      {/* Assignment History Timeline Modal */}
      <AssignmentHistoryModal
        isOpen={historyModal.isOpen}
        onClose={() => setHistoryModal(prev => ({ ...prev, isOpen: false }))}
        targetType={historyModal.targetType}
        targetId={historyModal.targetId}
        targetTitle={historyModal.targetTitle}
      />

      {/* Context Menu */}
      <TableContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        onStartEditAlias={handleStartRename}
        onAutoFitColumn={(col) => handleAutoFitColumn(col, filteredTrucks)}
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

      {/* App Native Status Change Confirmation Modal with Date Picker */}
      <StatusChangeConfirmModal
        isOpen={statusConfirmModal.isOpen}
        onClose={() => setStatusConfirmModal({ isOpen: false, truck: null, newStatus: '' })}
        type="TRUCK"
        data={statusConfirmModal.truck}
        newStatus={statusConfirmModal.newStatus}
        onConfirm={handleStatusModalConfirm}
      />

    </div>
  );
}
