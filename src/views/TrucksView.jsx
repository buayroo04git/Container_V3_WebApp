import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import { 
  fetchTrucks, 
  createTruck, 
  updateTruck, 
  deleteTruck, 
  bulkUpsertTrucks, 
  fetchDrivers 
} from '../services/truckDriverService';
import { createOperation, updateOperation } from '../services/operationsService';
import TruckModal from '../components/trucks/TruckModal';
import OperationModal from '../components/operations/OperationModal';
import AssignmentHistoryModal from '../components/ui/AssignmentHistoryModal';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown';
import StatusChangeConfirmModal from '../components/ui/StatusChangeConfirmModal';
import Badge from '../components/ui/Badge';
import KpiCard from '../components/ui/KpiCard';
import UniversalTableContainer from '../components/ui/UniversalTableContainer';
import UniversalTableHeader from '../components/ui/UniversalTableHeader';
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
  id: 45,
  truck_no: 95,
  status: 120,
  truck_license: 115,
  assigned_driver_name: 150,
  owner: 120,
  master_containers: 115,
  matched_containers: 115,
  missing_containers: 115,
  match_rate: 110,
  truck_type: 115,
  truck_kind: 110,
  brand: 95,
  tax_expiry_date: 115,
  act_expiry_date: 115,
  insurance_expiry_date: 125,
  remark: 140,
  actions: 110
};

const TRUCK_ALIGN_MAP = {
  id: 'center',
  truck_no: 'center',
  status: 'center',
  truck_license: 'center',
  assigned_driver_name: 'left',
  owner: 'left',
  master_containers: 'right',
  matched_containers: 'right',
  missing_containers: 'right',
  match_rate: 'right',
  truck_type: 'center',
  truck_kind: 'center',
  brand: 'center',
  tax_expiry_date: 'center',
  act_expiry_date: 'center',
  insurance_expiry_date: 'center',
  remark: 'left',
  actions: 'center'
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
  const [operationModal, setOperationModal] = useState({
    isOpen: false,
    operation: null
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

  // 🚛 Render Expiry Badge for Tax, ACT, and Insurance Compliance
  const renderExpiryBadge = (dateStr) => {
    if (!dateStr || dateStr === '-') return <span style={{ color: '#94a3b8' }}>-</span>;
    const formatted = formatDateDisplay(dateStr);
    try {
      const expDate = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      expDate.setHours(0, 0, 0, 0);
      if (isNaN(expDate.getTime())) return formatted;

      const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, border: '1px solid #fca5a5' }}>
            ⚠️ {formatted} (หมดอายุ)
          </span>
        );
      }
      if (diffDays <= 30) {
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, border: '1px solid #fde68a' }}>
            🟡 {formatted} (อีก {diffDays} วัน)
          </span>
        );
      }
      return <span style={{ color: '#334155' }}>{formatted}</span>;
    } catch {
      return formatted;
    }
  };

  // File Upload Ref
  const fileInputRef = useRef(null);

  // Column Preferences Hook (Unified Centralized Architecture)
  const trucksPrefs = useColumnPreferences({
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
        return (val && val !== '-') ? `👤 ${String(val).trim()} ✏️` : '➕ เลือกคนขับ';
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

  const { activeColumns, sortRecords, sortConfig } = trucksPrefs;

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

  // KPI Calculations
  const kpis = useMemo(() => {
    const total = trucks.length;
    const active = trucks.filter(t => t.status === 'active').length;
    const maintenance = trucks.filter(t => t.status === 'maintenance').length;
    const inactive = trucks.filter(t => t.status === 'inactive').length;
    const assigned = trucks.filter(t => t.assigned_driver_name && t.assigned_driver_name !== '-').length;
    const unassigned = Math.max(0, total - assigned);
    const totalMaster = trucks.reduce((sum, t) => sum + (t.master_containers || 0), 0);
    const totalMatched = trucks.reduce((sum, t) => sum + (t.matched_containers || 0), 0);
    const totalMissing = trucks.reduce((sum, t) => sum + (t.missing_containers || 0), 0);
    const runningTrucks = trucks.filter(t => (t.master_containers || 0) > 0).length;
    const matchRate = totalMaster > 0 ? Math.round((totalMatched / totalMaster) * 100) : 0;
    return { total, active, maintenance, inactive, assigned, unassigned, totalMaster, totalMatched, totalMissing, runningTrucks, matchRate };
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

  // 🚚 เปิด Modal เพิ่มการดำเนินงานรถเมื่อมีการเลือกคนขับ
  const handleOpenAssignModalForTruck = (truck, driverName) => {
    setOperationModal({
      isOpen: true,
      operation: {
        truck_no: truck.truck_no,
        driver_name: driverName || '',
        operation_type: 'primary',
        start_date: new Date().toISOString().slice(0, 10),
        isOngoing: true,
        remark: ''
      }
    });
  };

  // 🚫 ปลดคนขับออกจากรถ (สิ้นสุดงวดการดำเนินงาน)
  const handleUnassignDriverFromTruck = async (truck) => {
    if (!truck.assigned_driver_name || truck.assigned_driver_name === '-') return;
    if (!window.confirm(`คุณต้องการปลดคนขับ "${truck.assigned_driver_name}" ออกจากรถ ${truck.truck_no} ใช่หรือไม่?\n(ระบบจะสิ้นสุดงวดการดำเนินงานปัจจุบันและบันทึกประวัติให้อัตโนมัติ)`)) {
      return;
    }
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('unassign_driver_truck_rpc', {
        p_truck_no: truck.truck_no,
        p_driver_name: truck.assigned_driver_name,
        p_end_date: today,
        p_reason: `ปลดคนขับออกจากรถ ${truck.truck_no}`,
        p_created_by: 'Admin'
      });

      if (rpcErr || !rpcRes?.success) {
        await supabase
          .from('truck_operations')
          .update({ end_date: today, status: 'completed', updated_at: new Date().toISOString() })
          .eq('truck_no', truck.truck_no)
          .eq('status', 'active');

        await supabase
          .from('truck_records')
          .update({ assigned_driver_name: '-', updated_at: new Date().toISOString() })
          .eq('truck_no', truck.truck_no);

        await supabase
          .from('driver_records')
          .update({ assigned_truck_no: '-', updated_at: new Date().toISOString() })
          .eq('driver_name', truck.assigned_driver_name);
      }
      success(`ปลดคนขับประจำรถ ${truck.truck_no} เรียบร้อยแล้ว`);
      loadData();
    } catch (err) {
      toastError('เกิดข้อผิดพลาดในการปลดคนขับ: ' + err.message);
    }
  };

  // 💾 บันทึกการดำเนินงานจาก Modal
  const handleSaveOperationFromTrucks = async (payload, id) => {
    if (id) {
      const { error } = await updateOperation(id, payload);
      if (error) throw new Error(error);
      success(`อัปเดตข้อมูลการดำเนินงานรถ ${payload.truck_no} เรียบร้อยแล้ว`);
    } else {
      const { error } = await createOperation(payload);
      if (error) throw new Error(error);
      success(`มอบหมายคนขับ ${payload.driver_name} ประจำรถ ${payload.truck_no} เรียบร้อยแล้ว`);
    }
    setOperationModal({ isOpen: false, operation: null });
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

      {/* 2. KPI Metric Cards (Standardized 4-Card Blueprint) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        marginBottom: '16px',
        flexShrink: 0
      }}>
        <KpiCard
          title="🚛 รถทั้งหมดในระบบ"
          value={kpis.total}
          unit="คัน"
          theme="slate"
          subtext={`พร้อมวิ่ง ${kpis.active} • ซ่อม ${kpis.maintenance || 0} • ระงับ ${kpis.inactive || 0}`}
        />

        <KpiCard
          title="🟢 พร้อมใช้งาน (Active)"
          value={kpis.active}
          unit="คัน"
          theme="green"
          badge={kpis.total > 0 ? `${Math.round((kpis.active / kpis.total) * 100)}%` : undefined}
          subtext={`มีคนขับ ${kpis.assigned || 0} คัน • รถว่าง ${kpis.unassigned || 0} คัน`}
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
          badge={kpis.totalMaster > 0 ? `${kpis.matchRate}%` : undefined}
          subtext={`⚠️ รอตรวจ ${kpis.totalMissing.toLocaleString()} งาน`}
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
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
            <input
              type="text"
              placeholder="ค้นหาเบอร์รถ, ทะเบียน, คนขับ..."
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
            <ColumnVisibilityDropdown preferences={trucksPrefs} />
          </div>
        </div>

        {/* Universal Table Area */}
        <UniversalTableContainer
          preferences={trucksPrefs}
          style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}
        >
          <UniversalTableHeader
            preferences={trucksPrefs}
            data={filteredTrucks}
            alignMap={TRUCK_ALIGN_MAP}
          />

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
                      const align = TRUCK_ALIGN_MAP[col] || 'left';
                      const cellStyle = {
                        padding: '8px 10px',
                        textAlign: align,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      };

                      if (col === 'id') {
                        return (
                          <td key={col} style={{ ...cellStyle, color: '#64748b', fontWeight: 600 }}>
                            {idx + 1}
                          </td>
                        );
                      }

                      if (col === 'truck_no') {
                        return (
                          <td key={col} style={{ ...cellStyle, fontFamily: 'monospace', fontWeight: 800, fontSize: '13.5px', color: '#1d4ed8' }}>
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
                          <td key={col} style={cellStyle}>
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
                          <td key={col} style={{ ...cellStyle, fontWeight: 500, color: '#1e293b' }}>
                            {truck.owner || '-'}
                          </td>
                        );
                      }

                      if (col === 'assigned_driver_name') {
                        const isAssigned = truck.assigned_driver_name && truck.assigned_driver_name !== '-';
                        return (
                          <td key={col} style={{ ...cellStyle, padding: '4px 8px' }}>
                            {isAssigned ? (
                              <button
                                type="button"
                                onClick={() => handleOpenAssignModalForTruck(truck, truck.assigned_driver_name)}
                                title="คลิกเพื่อแก้ไขหรือเปลี่ยนคนขับ (จะเปิดฟอร์มการดำเนินงานรถ)"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'flex-start',
                                  gap: '6px',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  border: '1px solid #bfdbfe',
                                  padding: '0 10px',
                                  height: '28px',
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  borderRadius: '7px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#dbeafe';
                                  e.currentTarget.style.borderColor = '#93c5fd';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#eff6ff';
                                  e.currentTarget.style.borderColor = '#bfdbfe';
                                }}
                              >
                                <span style={{ fontSize: '11.5px', flexShrink: 0 }}>👤</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{truck.assigned_driver_name}</span>
                                <span style={{ fontSize: '10px', color: '#3b82f6', opacity: 0.85, flexShrink: 0, marginLeft: 'auto' }}>✏️</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenAssignModalForTruck(truck, '')}
                                title="คลิกเพื่อมอบหมายคนขับ (จะเปิดฟอร์มการดำเนินงานรถ)"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'flex-start',
                                  gap: '6px',
                                  background: '#f8fafc',
                                  color: '#64748b',
                                  border: '1px dashed #cbd5e1',
                                  padding: '0 10px',
                                  height: '28px',
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  borderRadius: '7px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#eff6ff';
                                  e.currentTarget.style.color = '#2563eb';
                                  e.currentTarget.style.borderColor = '#93c5fd';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#f8fafc';
                                  e.currentTarget.style.color = '#64748b';
                                  e.currentTarget.style.borderColor = '#cbd5e1';
                                }}
                              >
                                <span style={{ flexShrink: 0 }}>➕</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>เลือกคนขับ</span>
                              </button>
                            )}
                          </td>
                        );
                      }

                      if (col === 'master_containers' || col === 'total_containers') {
                        return (
                          <td key={col} style={{ ...cellStyle, fontWeight: 700, color: '#1e293b' }}>
                            {Number(truck.master_containers || truck.total_containers || 0).toLocaleString()}
                          </td>
                        );
                      }

                      if (col === 'matched_containers') {
                        const val = Number(truck.matched_containers || 0);
                        return (
                          <td key={col} style={cellStyle}>
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
                          <td key={col} style={cellStyle}>
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
                          <td key={col} style={cellStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                              <div style={{ width: '45px', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
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
                          <td key={col} style={cellStyle}>
                            {renderExpiryBadge(truck[col])}
                          </td>
                        );
                      }

                      if (col === 'actions') {
                        return (
                          <td key={col} style={cellStyle}>
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
                        <td key={col} style={{ ...cellStyle, color: '#334155' }}>
                          {truck[col] || '-'}
                        </td>
                      );
                    })}
                  </tr>
                ))
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

      {/* App Native Status Change Confirmation Modal with Date Picker */}
      <StatusChangeConfirmModal
        isOpen={statusConfirmModal.isOpen}
        onClose={() => setStatusConfirmModal({ isOpen: false, truck: null, newStatus: '' })}
        type="TRUCK"
        data={statusConfirmModal.truck}
        newStatus={statusConfirmModal.newStatus}
        onConfirm={handleStatusModalConfirm}
      />

      {/* Operation Modal for Quick Driver Assignment */}
      <OperationModal
        isOpen={operationModal.isOpen}
        onClose={() => setOperationModal({ isOpen: false, operation: null })}
        onSave={handleSaveOperationFromTrucks}
        operation={operationModal.operation}
        truckList={trucks}
        driverList={drivers}
      />

    </div>
  );
}
