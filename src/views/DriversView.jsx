import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from '../context/ToastContext';
import { 
  fetchDrivers, 
  createDriver, 
  updateDriver, 
  deleteDriver, 
  bulkUpsertDrivers,
  fetchTrucks 
} from '../services/truckDriverService';
import DriverModal from '../components/drivers/DriverModal';
import AssignmentHistoryModal from '../components/ui/AssignmentHistoryModal';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown';
import TableContextMenu from '../components/ui/TableContextMenu';
import RenameColumnModal from '../components/ui/RenameColumnModal';
import StatusChangeConfirmModal from '../components/ui/StatusChangeConfirmModal';
import Badge from '../components/ui/Badge';
import KpiCard from '../components/ui/KpiCard';
import { useColumnPreferences } from '../hooks/useColumnPreferences';

const DEFAULT_DRIVER_COLUMNS = [
  'id',
  'driver_name',
  'status',
  'work_status',
  'assigned_truck_no',
  'phone',
  'master_containers',
  'matched_containers',
  'missing_containers',
  'match_rate',
  'license_type',
  'license_no',
  'license_expiry_date',
  'start_date',
  'emergency_contact',
  'id_card',
  'remark',
  'actions'
];

const DEFAULT_COLUMN_NAMES = {
  id: '#',
  driver_name: 'ชื่อ-นามสกุล คนขับ',
  status: 'สถานะพนักงาน',
  work_status: 'สถานะปฏิบัติงาน',
  assigned_truck_no: 'เบอร์รถ',
  phone: 'เบอร์โทรศัพท์',
  master_containers: 'งานในใบวางบิล',
  matched_containers: 'ตรวจสอบแล้ว',
  missing_containers: 'รอตรวจสอบ',
  match_rate: 'ความคืบหน้า',
  license_type: 'ประเภทใบขับขี่',
  license_no: 'เลขที่ใบขับขี่',
  license_expiry_date: 'หมดอายุใบขับขี่',
  start_date: 'วันเริ่มงาน',
  emergency_contact: 'ติดต่อฉุกเฉิน',
  id_card: 'เลขบัตรประชาชน',
  remark: 'หมายเหตุ',
  actions: 'จัดการ'
};

const DEFAULT_DRIVER_WIDTHS = {
  id: 60,
  driver_name: 150,
  status: 120,
  work_status: 110,
  assigned_truck_no: 95,
  phone: 125,
  master_containers: 130,
  matched_containers: 130,
  missing_containers: 130,
  match_rate: 115,
  license_type: 110,
  license_no: 120,
  license_expiry_date: 120,
  start_date: 110,
  emergency_contact: 150,
  id_card: 135,
  remark: 150,
  actions: 100
};

export default function DriversView() {
  const { success, error: toastError, warning } = useToast();

  const [drivers, setDrivers] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [licenseFilter, setLicenseFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [historyModal, setHistoryModal] = useState({
    isOpen: false,
    targetType: 'ALL',
    targetId: null,
    targetTitle: ''
  });
  const [statusConfirmModal, setStatusConfirmModal] = useState({
    isOpen: false,
    driver: null,
    newStatus: ''
  });

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
    storageKeyPrefix: 'drivers',
    rawColumns: DEFAULT_DRIVER_COLUMNS,
    defaultNames: DEFAULT_COLUMN_NAMES,
    defaultWidths: DEFAULT_DRIVER_WIDTHS,
    sampleRecords: drivers,
    formatCellValue: (col, val, row) => {
      if (col === 'status') {
        return val === 'active' ? '🟢 ปกติ (Active)' : (val === 'leave' ? '🟡 ลางาน' : '⚪ พักงาน/ออก');
      }
      if (col === 'work_status') {
        if (row?.driver_type === 'substitute' || row?.operation_type === 'substitute') return '🟡 ขับแทน';
        if (row?.status === 'leave') return '🟡 ลางาน';
        if (row?.status === 'inactive') return '⚪ พ้นสภาพ';
        if (row?.assigned_truck_no && row?.assigned_truck_no !== '-') return '🟢 ขับประจำ';
        return '⚪ ว่าง';
      }
      if (col === 'assigned_truck_no') {
        return (val && val !== '-') ? String(val).trim() : '-';
      }
      if (col === 'match_rate') {
        const rate = (row?.master_containers > 0) ? Math.round(((row.matched_containers || 0) / row.master_containers) * 100) : 0;
        return `${rate}%`;
      }
      return String(val || '');
    }
  });

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [driverRes, truckRes] = await Promise.all([
        fetchDrivers(),
        fetchTrucks()
      ]);
      if (driverRes.error) throw new Error(driverRes.error);
      setDrivers(driverRes.data || []);
      setTrucks(truckRes.data || []);
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
    const total = drivers.length;
    const active = drivers.filter(d => d.status === 'active').length;
    const leave = drivers.filter(d => d.status === 'leave').length;
    const inactive = drivers.filter(d => d.status === 'inactive').length;
    // มีรถประจำ (กำลังขับรถ)
    const assigned = drivers.filter(d => d.status === 'active' && d.assigned_truck_no && d.assigned_truck_no !== '-').length;
    // ว่าง (ยังไม่มีรถขับ / รอจัดรถ)
    const unassigned = drivers.filter(d => d.status === 'active' && (!d.assigned_truck_no || d.assigned_truck_no === '-')).length;
    const totalMaster = drivers.reduce((sum, d) => sum + (d.master_containers || 0), 0);
    const totalMatched = drivers.reduce((sum, d) => sum + (d.matched_containers || 0), 0);
    const totalMissing = drivers.reduce((sum, d) => sum + (d.missing_containers || 0), 0);
    return { total, active, leave, inactive, assigned, unassigned, totalMaster, totalMatched, totalMissing };
  }, [drivers]);

  // Filtered Records
  const filteredDrivers = useMemo(() => {
    return drivers.filter(d => {
      if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
      if (licenseFilter !== 'ALL' && d.license_type !== licenseFilter) return false;
      if (searchTerm.trim()) {
        const lower = searchTerm.toLowerCase();
        const name = String(d.driver_name || '').toLowerCase();
        const ph = String(d.phone || '').toLowerCase();
        const trk = String(d.assigned_truck_no || '').toLowerCase();
        const lic = String(d.license_no || '').toLowerCase();
        return name.includes(lower) || ph.includes(lower) || trk.includes(lower) || lic.includes(lower);
      }
      return true;
    });
  }, [drivers, statusFilter, licenseFilter, searchTerm]);

  // Displayed Drivers (Sorted & Filtered)
  const displayedDrivers = useMemo(() => {
    return sortRecords(filteredDrivers);
  }, [filteredDrivers, sortConfig, sortRecords]);

  // Save Driver (Create / Update)
  const handleSaveDriver = async (formData, id) => {
    if (id) {
      const { data, error } = await updateDriver(id, formData);
      if (error) throw new Error(error);
      success(`อัปเดตข้อมูล ${formData.driver_name} สำเร็จ`);
    } else {
      const { data, error } = await createDriver(formData);
      if (error) throw new Error(error);
      success(`เพิ่มคนขับ ${formData.driver_name} เรียบร้อยแล้ว`);
    }
    loadData();
  };

  // Delete Driver
  const handleDeleteDriver = async (id, driverName) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลคุณ ${driverName}?`)) return;
    const { error } = await deleteDriver(id, driverName);
    if (error) {
      toastError('ลบไม่สำเร็จ: ' + error);
    } else {
      success(`ลบข้อมูลคุณ ${driverName} เรียบร้อยแล้ว`);
      loadData();
    }
  };

  // Quick Inline Update for Driver Status
  const handleInlineStatusChange = async (driver, newStatus) => {
    if (driver.status === newStatus) return;

    const isEnteringNonActive = newStatus === 'leave' || newStatus === 'inactive';
    const isReturningFromLeave = (driver.status === 'leave' || driver.status === 'inactive') && newStatus === 'active';

    // ถ้าเข้าสู่ลางาน/ลาออก หรือกลับจากลางานมาปฏิบัติงาน ให้เปิด Modal จัดการช่วงเวลาและยืนยัน
    if (isEnteringNonActive || isReturningFromLeave) {
      setStatusConfirmModal({
        isOpen: true,
        driver,
        newStatus
      });
      return;
    }

    // กรณีทั่วไปให้อัปเดตทันที
    try {
      setDrivers(prev => prev.map(d => d.id === driver.id ? { 
        ...d, 
        status: newStatus 
      } : d));
      
      const { error } = await updateDriver(driver.id, {
        ...driver,
        status: newStatus,
        autoStopOperation: false
      });
      if (error) throw new Error(error);
      success(`อัปเดตสถานะเป็น "${newStatus === 'active' ? 'ปฏิบัติงาน' : (newStatus === 'leave' ? 'ลางาน' : 'พักงาน/ลาออก')}" เรียบร้อยแล้ว`);
      loadData();
    } catch (err) {
      toastError('อัปเดตสถานะไม่สำเร็จ: ' + err.message);
      loadData();
    }
  };

  // Callback เมื่อกดยืนยันจาก StatusChangeConfirmModal
  const handleStatusModalConfirm = async ({ autoStopOperation, effectiveDate, startDate, expectedEndDate, isIndefinite, statusReason }) => {
    const { driver, newStatus } = statusConfirmModal;
    if (!driver) return;

    try {
      setDrivers(prev => prev.map(d => d.id === driver.id ? { 
        ...d, 
        status: newStatus,
        assigned_truck_no: autoStopOperation ? '-' : d.assigned_truck_no 
      } : d));

      const { error } = await updateDriver(driver.id, {
        ...driver,
        status: newStatus,
        autoStopOperation,
        effectiveDate,
        startDate,
        expectedEndDate,
        isIndefinite,
        statusReason
      });
      if (error) throw new Error(error);
      success(`อัปเดตสถานะคุณ ${driver.driver_name} เป็น "${newStatus === 'active' ? 'ปฏิบัติงาน' : (newStatus === 'leave' ? 'ลางาน' : 'พักงาน/ลาออก')}" (มีผล ${effectiveDate}) เรียบร้อยแล้ว`);
      loadData();
    } catch (err) {
      toastError('อัปเดตสถานะไม่สำเร็จ: ' + err.message);
      loadData();
    }
  };

  // Download Template Excel
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'ชื่อ-นามสกุล คนขับ': 'บุญโลม ผุยเพ็ง',
        'สถานะ': 'ปฏิบัติงาน',
        'เบอร์โทรศัพท์': '0931069789',
        'รถประจำ': '506',
        'เลขบัตรประชาชน': '3301700588011',
        'ประเภทใบขับขี่': 'ท.4',
        'เลขที่ใบขับขี่': '-',
        'หมดอายุใบขับขี่': '',
        'วันเริ่มงาน': '',
        'ติดต่อฉุกเฉิน': '-',
        'หมายเหตุ': 'Bonbon'
      },
      {
        'ชื่อ-นามสกุล คนขับ': 'สายัน หงษ์สันเทียะ',
        'สถานะ': 'ปฏิบัติงาน',
        'เบอร์โทรศัพท์': '0625198007',
        'รถประจำ': '501',
        'เลขบัตรประชาชน': '5300800103597',
        'ประเภทใบขับขี่': 'ท.4',
        'เลขที่ใบขับขี่': '-',
        'หมดอายุใบขับขี่': '',
        'วันเริ่มงาน': '',
        'ติดต่อฉุกเฉิน': '-',
        'หมายเหตุ': 'เต่า'
      },
      {
        'ชื่อ-นามสกุล คนขับ': 'ประจบ กาชัย',
        'สถานะ': 'ปฏิบัติงาน',
        'เบอร์โทรศัพท์': '0844868353',
        'รถประจำ': '504',
        'เลขบัตรประชาชน': '3640500264014',
        'ประเภทใบขับขี่': 'ท.4',
        'เลขที่ใบขับขี่': '-',
        'หมดอายุใบขับขี่': '',
        'วันเริ่มงาน': '',
        'ติดต่อฉุกเฉิน': '-',
        'หมายเหตุ': 'ประจบ'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Drivers');
    XLSX.writeFile(wb, 'Driver_Import_Template.xlsx');
    success('ดาวน์โหลดไฟล์แม่แบบเรียบร้อยแล้ว');
  };

  // Import Excel (Supports both Multi-Sheet Monthly Books & Standard Table Templates)
  const handleImportExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        
        let mappedList = [];

        // ตรวจสอบว่าเป็นไฟล์แบบสมุดรับ-จ่ายแยกตามคนขับ (Multi-sheet) หรือไม่
        const candidateDriverSheets = wb.SheetNames.filter(s => {
          const lower = s.toLowerCase();
          return !['template', 'รายจ่ายอื่นๆ', 'รายรับ-จ่าย จริง', 'ทะเบียน ประกัน'].includes(s) &&
                 !lower.includes('โชห่วย') && !lower.includes('sheet');
        });

        if (candidateDriverSheets.length > 0 && wb.SheetNames.length > 2) {
          // 🚀 โหมด A: แยกดึงข้อมูลจาก Header ของแต่ละ Sheet ในสมุดบัญชีรับ-จ่ายรถหัวลาก
          candidateDriverSheets.forEach(sheetName => {
            const ws = wb.Sheets[sheetName];
            const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            if (sheetData.length < 3) return;

            const r1 = sheetData[0] || [];
            const r2 = sheetData[1] || [];
            const r3 = sheetData[2] || [];

            let name = String(r2[2] || '').trim();
            if (!name) {
              const foundName = r2.find(c => typeof c === 'string' && c.trim() && !c.includes('ชื่อ') && !c.includes('ค่าดูแล') && !c.includes('ร้าน'));
              if (foundName) name = foundName.trim();
            }
            if (!name) return;

            let truckNo = '';
            const matchTruck = sheetName.match(/(\d{3})/);
            if (matchTruck) truckNo = matchTruck[1];
            else {
              const match2 = sheetName.match(/^(\d+)/);
              if (match2) truckNo = match2[1];
            }

            let phone = '';
            r1.forEach(c => {
              const s = String(c).replace(/[^0-9]/g, '');
              if (s.length === 10 && s.startsWith('0')) phone = s;
            });
            if (!phone) {
              r2.forEach(c => {
                const s = String(c).replace(/[^0-9]/g, '');
                if (s.length === 10 && s.startsWith('0')) phone = s;
              });
            }

            let idCard = '';
            r3.forEach(c => {
              const s = String(c).replace(/[^0-9]/g, '');
              if (s.length === 13) idCard = s;
            });

            mappedList.push({
              driver_name: name,
              assigned_truck_no: truckNo || '-',
              phone: phone || '-',
              id_card: idCard || '-',
              license_no: '-',
              license_type: 'ท.4',
              license_expiry_date: null,
              status: 'active',
              start_date: null,
              emergency_contact: '-',
              remark: `นำเข้าจากชีท ${sheetName}`
            });
          });
        }

        // 🚀 โหมด B: ถ้าไม่ใช่ Multi-sheet ให้อ่านแบบตารางปกติจาก Sheet แรก
        if (mappedList.length === 0) {
          const wsName = wb.SheetNames[0];
          const ws = wb.Sheets[wsName];
          const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' });

          mappedList = rawData.map(row => ({
            driver_name: String(row['ชื่อ-นามสกุล คนขับ'] || row['ชื่อ-นามสกุล'] || row['driver_name'] || row['ชื่อคนขับ'] || row['ชื่อ'] || '').trim(),
            phone: row['เบอร์โทรศัพท์'] || row['เบอร์โทร'] || row['phone'] || '-',
            id_card: row['เลขบัตรประชาชน'] || row['id_card'] || '-',
            license_no: row['เลขที่ใบขับขี่'] || row['license_no'] || '-',
            license_type: row['ประเภทใบขับขี่'] || row['license_type'] || 'ท.4',
            license_expiry_date: row['หมดอายุใบขับขี่'] || row['license_expiry_date'] || null,
            assigned_truck_no: row['รถประจำ'] || row['เบอร์รถ'] || row['assigned_truck_no'] || '-',
            status: row['สถานะ'] === 'ลางาน' ? 'leave' : (row['สถานะ'] === 'พักงาน' ? 'inactive' : 'active'),
            start_date: row['วันเริ่มงาน'] || row['start_date'] || null,
            emergency_contact: row['ติดต่อฉุกเฉิน'] || row['emergency_contact'] || '-',
            remark: row['หมายเหตุ'] || row['remark'] || '-'
          })).filter(d => d.driver_name);
        }

        if (mappedList.length === 0) {
          warning('ไม่พบข้อมูลรายชื่อคนขับในไฟล์ Excel ที่เลือก');
          return;
        }

        const { count, error } = await bulkUpsertDrivers(mappedList);
        if (error) throw new Error(error);
        success(`นำเข้าข้อมูลคนขับเรียบร้อยแล้ว ${count} ท่าน`);
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
    if (filteredDrivers.length === 0) {
      warning('ไม่มีข้อมูลสำหรับส่งออก');
      return;
    }
    const exportData = filteredDrivers.map((d, idx) => ({
      '#': idx + 1,
      'ชื่อ-นามสกุล คนขับ': d.driver_name,
      'สถานะ': d.status === 'active' ? 'ปฏิบัติงาน' : (d.status === 'leave' ? 'ลางาน' : 'พักงาน/ลาออก'),
      'เบอร์โทรศัพท์': d.phone || '-',
      'รถประจำ': d.assigned_truck_no || '-',
      'งานใน DB (งาน)': d.master_containers || 0,
      'ตรวจสอบแล้ว (งาน)': d.matched_containers || 0,
      'รอตรวจสอบ (งาน)': d.missing_containers || 0,
      'ความคืบหน้า (%)': `${d.match_rate || 0}%`,
      'ประเภทใบขับขี่': d.license_type || '-',
      'เลขที่ใบขับขี่': d.license_no || '-',
      'หมดอายุใบขับขี่': d.license_expiry_date || '-',
      'วันเริ่มงาน': d.start_date || '-',
      'ติดต่อฉุกเฉิน': d.emergency_contact || '-',
      'เลขบัตรประชาชน': d.id_card || '-',
      'หมายเหตุ': d.remark || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Drivers');
    XLSX.writeFile(wb, `Driver_List_${new Date().toISOString().slice(0, 10)}.xlsx`);
    success('ส่งออกไฟล์ Excel เรียบร้อยแล้ว');
  };

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
            <span>👤</span> ทะเบียนพนักงานขับรถ (Drivers Management)
          </h1>
          <p style={{ margin: 0, fontSize: '13.5px', color: '#64748b' }}>
            จัดการประวัติคนขับ รถประจำการ ใบอนุญาตขับขี่ อัตราค่าเที่ยว และสรุปผลงานวิ่ง
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
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
            title="ดูประวัติการครองรถ การย้ายรถ และการลาออกของคนขับทั้งหมด"
          >
            📜 ประวัติ Timeline
          </button>

          <button
            onClick={handleDownloadTemplate}
            style={{
              padding: '9px 14px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#475569',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="ดาวน์โหลดไฟล์แม่แบบ Excel สำหรับเตรียมข้อมูลคนขับ"
          >
            📋 แม่แบบ Excel
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
              setEditingDriver(null);
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
            ➕ เพิ่มคนขับใหม่
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
          title="👤 คนขับทั้งหมดในระบบ"
          value={kpis.total}
          unit="คน"
          theme="slate"
        />

        <KpiCard
          title="🚛 ขับประจำ"
          value={kpis.assigned}
          unit="คน"
          theme="emerald"
        />

        <KpiCard
          title="⚪ ว่าง"
          value={kpis.unassigned}
          unit="คน"
          theme="blue"
        />

        <KpiCard
          title="📋 งานทั้งหมดในใบวางบิล"
          value={kpis.totalMaster}
          unit="งาน"
          theme="indigo"
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
              placeholder="ค้นหาชื่อคนขับ, เบอร์โทร, เบอร์รถ..."
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
            <option value="ALL">ทุกสถานะ ({drivers.length})</option>
            <option value="active">🟢 ปฏิบัติงาน ({drivers.filter(d => d.status === 'active').length})</option>
            <option value="leave">🟡 ลางาน ({drivers.filter(d => d.status === 'leave').length})</option>
            <option value="inactive">⚪ พักงาน/ออก ({drivers.filter(d => d.status === 'inactive').length})</option>
          </select>

          {/* ฟิลเตอร์ประเภทใบขับขี่ */}
          <select
            value={licenseFilter}
            onChange={e => setLicenseFilter(e.target.value)}
            style={{
              height: '36px',
              padding: '0 10px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              color: licenseFilter !== 'ALL' ? '#2563eb' : '#334155',
              background: licenseFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">ทุกประเภทใบขับขี่</option>
            <option value="ท.4">ท.4</option>
            <option value="ท.3">ท.3</option>
            <option value="ท.2">ท.2</option>
            <option value="บ.2">บ.2</option>
          </select>

          {(searchTerm || statusFilter !== 'ALL' || licenseFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('ALL');
                setLicenseFilter('ALL');
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
                <col key={col} style={{ width: `${columnWidths[col] || DEFAULT_DRIVER_WIDTHS[col] || 120}px` }} />
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
                        handleAutoFitColumn(col, filteredDrivers);
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
                            handleAutoFitColumn(col, filteredDrivers);
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
                    <div>กำลังโหลดข้อมูลคนขับ...</div>
                  </td>
                </tr>
              ) : displayedDrivers.length === 0 ? (
                <tr>
                  <td colSpan={activeColumns.length} style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>👤</div>
                    <div style={{ fontWeight: 600 }}>ไม่พบข้อมูลคนขับตามเงื่อนไขที่เลือก</div>
                  </td>
                </tr>
              ) : (
                displayedDrivers.map((driver, idx) => (
                  <tr
                    key={driver.id || idx}
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

                      if (col === 'driver_name') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>
                            {driver.driver_name || '-'}
                          </td>
                        );
                      }

                      if (col === 'status') {
                        const statusConfig = {
                          active: { bg: '#ecfdf5', color: '#15803d' },
                          leave: { bg: '#fffbeb', color: '#b45309' },
                          inactive: { bg: '#f1f5f9', color: '#64748b' }
                        };
                        const cfg = statusConfig[driver.status] || statusConfig.active;

                        return (
                          <td key={col} style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                            <select
                              value={driver.status || 'active'}
                              onChange={(e) => handleInlineStatusChange(driver, e.target.value)}
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
                              title="คลิกเพื่อเปลี่ยนสถานะพนักงาน"
                            >
                              <option value="active" style={{ background: '#fff', color: '#15803d' }}>🟢 ปกติ (Active)</option>
                              <option value="leave" style={{ background: '#fff', color: '#b45309' }}>🟡 ลางาน</option>
                              <option value="inactive" style={{ background: '#fff', color: '#64748b' }}>⚪ พักงาน/ออก</option>
                            </select>
                          </td>
                        );
                      }

                      if (col === 'work_status') {
                        const isSubstitute = driver.driver_type === 'substitute' || driver.operation_type === 'substitute';
                        const hasTruck = driver.assigned_truck_no && driver.assigned_truck_no !== '-';
                        const isLeave = driver.status === 'leave';
                        const isInactive = driver.status === 'inactive';

                        if (isInactive) {
                          return (
                            <td key={col} style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>
                                ⚪ พ้นสภาพ
                              </span>
                            </td>
                          );
                        }

                        if (isLeave) {
                          return (
                            <td key={col} style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#b45309', fontSize: '12px', fontWeight: 600 }}>
                                🟡 ลางาน
                              </span>
                            </td>
                          );
                        }

                        if (isSubstitute) {
                          return (
                            <td key={col} style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: '#fffbeb',
                                color: '#b45309',
                                border: '1px solid #fde68a',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 700
                              }}>
                                🟡 ขับแทน
                              </span>
                            </td>
                          );
                        }

                        if (hasTruck) {
                          return (
                            <td key={col} style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: '#ecfdf5',
                                color: '#15803d',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 700
                              }}>
                                🟢 ขับประจำ
                              </span>
                            </td>
                          );
                        }

                        // ไม่มีรถขับ ➡️ แสดงเป็นว่าง
                        return (
                          <td key={col} style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#f8fafc',
                              color: '#64748b',
                              border: '1px solid #e2e8f0',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 600
                            }}>
                              ⚪ ว่าง
                            </span>
                          </td>
                        );
                      }

                      if (col === 'assigned_truck_no') {
                        const isAssigned = driver.assigned_truck_no && driver.assigned_truck_no !== '-';
                        return (
                          <td key={col} style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 800, fontSize: '13.5px', color: isAssigned ? '#1d4ed8' : '#94a3b8', whiteSpace: 'nowrap' }}>
                            {isAssigned ? driver.assigned_truck_no : '-'}
                          </td>
                        );
                      }

                      if (col === 'master_containers' || col === 'total_containers') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', fontWeight: 700, color: '#1e293b' }}>
                            {Number(driver.master_containers || driver.total_containers || 0).toLocaleString()}
                          </td>
                        );
                      }

                      if (col === 'matched_containers') {
                        const val = Number(driver.matched_containers || 0);
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
                        const val = Number(driver.missing_containers || 0);
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
                        const rate = Number(driver.match_rate || 0);
                        const isComplete = rate === 100 && (driver.master_containers || 0) > 0;
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

                      if (col === 'license_expiry_date' || col === 'start_date') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', color: '#475569' }}>
                            {formatDateDisplay(driver[col])}
                          </td>
                        );
                      }

                      if (col === 'actions') {
                        return (
                          <td key={col} style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              onClick={() => setHistoryModal({
                                isOpen: true,
                                targetType: 'DRIVER',
                                targetId: driver.driver_name,
                                targetTitle: `📜 ประวัติการขับรถของคุณ ${driver.driver_name}`
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
                              title="ดูประวัติรถที่เคยขับ และประวัติการสลับรถ"
                            >
                              📜 ประวัติ
                            </button>
                            <button
                              onClick={() => {
                                setEditingDriver(driver);
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
                              title="แก้ไขข้อมูลคนขับ"
                            >
                              แก้ไข
                            </button>
                            <button
                              onClick={() => handleDeleteDriver(driver.id, driver.driver_name)}
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
                              title="ลบข้อมูลคนขับ"
                            >
                              ลบ
                            </button>
                          </td>
                        );
                      }

                      return (
                        <td key={col} style={{ padding: '10px 14px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {driver[col] || '-'}
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
            แสดง <strong>{filteredDrivers.length}</strong> จากทั้งหมด <strong>{drivers.length}</strong> ท่าน
          </div>
          <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
            💡 ดับเบิ้ลคลิกหัวตารางเพื่อ Auto-fit / คลิกขวาเพื่อจัดการคอลัมน์
          </div>
        </div>
      </div>

      {/* Modals & Menus */}
      <DriverModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveDriver}
        driver={editingDriver}
        truckList={trucks}
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
        onAutoFitColumn={(col) => handleAutoFitColumn(col, filteredDrivers)}
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
        onClose={() => setStatusConfirmModal({ isOpen: false, driver: null, newStatus: '' })}
        type="DRIVER"
        data={statusConfirmModal.driver}
        newStatus={statusConfirmModal.newStatus}
        onConfirm={handleStatusModalConfirm}
      />

    </div>
  );
}
