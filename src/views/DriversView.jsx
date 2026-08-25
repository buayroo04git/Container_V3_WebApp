import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { useToast } from '../context/ToastContext';
import { 
  fetchDrivers, 
  createDriver, 
  updateDriver, 
  deleteDriver, 
  bulkUpsertDrivers,
  fetchTrucks 
} from '../services/truckDriverService';
import { createOperation, updateOperation } from '../services/operationsService';
import DriverModal from '../components/drivers/DriverModal';
import OperationModal from '../components/operations/OperationModal';
import AssignmentHistoryModal from '../components/ui/AssignmentHistoryModal';
import StatusChangeConfirmModal from '../components/ui/StatusChangeConfirmModal';
import Badge from '../components/ui/Badge';
import KpiCard from '../components/ui/KpiCard';
import UniversalTableContainer from '../components/ui/UniversalTableContainer';
import UniversalTableHeader from '../components/ui/UniversalTableHeader';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown';
import { useColumnPreferences } from '../hooks/useColumnPreferences';
import { jobSheetService } from '../services/jobSheetService';

const DEFAULT_DRIVER_COLUMNS = [
  'id',
  'driver_name',
  'status',
  'work_status',
  'assigned_truck_no',
  'base_salary',
  'tax_profile',
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
  base_salary: '💵 ฐานเงินเดือน',
  tax_profile: '🏥 หัก สปส./3%',
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
  id: 45,
  driver_name: 150,
  status: 120,
  work_status: 110,
  assigned_truck_no: 110,
  base_salary: 115,
  tax_profile: 125,
  phone: 115,
  master_containers: 115,
  matched_containers: 115,
  missing_containers: 115,
  match_rate: 110,
  license_type: 110,
  license_no: 115,
  license_expiry_date: 115,
  start_date: 110,
  emergency_contact: 140,
  id_card: 130,
  remark: 140,
  actions: 100
};

const DRIVER_ALIGN_MAP = {
  id: 'center',
  driver_name: 'left',
  status: 'center',
  work_status: 'center',
  assigned_truck_no: 'center',
  base_salary: 'right',
  tax_profile: 'center',
  phone: 'center',
  master_containers: 'right',
  matched_containers: 'right',
  missing_containers: 'right',
  match_rate: 'right',
  license_type: 'center',
  license_no: 'center',
  license_expiry_date: 'center',
  start_date: 'center',
  emergency_contact: 'left',
  id_card: 'center',
  remark: 'left',
  actions: 'center'
};

export default function DriversView() {
  const { success, error: toastError, warning } = useToast();

  const [drivers, setDrivers] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [licenseFilter, setLicenseFilter] = useState('ALL');
  const [totalJobsheetContainers, setTotalJobsheetContainers] = useState(140);

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
  const [operationModal, setOperationModal] = useState({
    isOpen: false,
    operation: null
  });

  // File Upload Ref
  const fileInputRef = useRef(null);

  // Column Preferences Hook (Unified Centralized Architecture)
  const driversPrefs = useColumnPreferences({
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
        return (val && val !== '-') ? `🚚 รถ ${String(val).trim()} ✏️` : '➕ เลือกรถ';
      }
      if (col === 'match_rate') {
        const rate = (row?.master_containers > 0) ? Math.round(((row.matched_containers || 0) / row.master_containers) * 100) : 0;
        return `${rate}%`;
      }
      return String(val || '');
    }
  });

  const { activeColumns, sortRecords, sortConfig } = driversPrefs;

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [driverRes, truckRes, ocrKpiRes] = await Promise.all([
        fetchDrivers(),
        fetchTrucks(),
        jobSheetService.fetchOcrKpis()
      ]);
      if (driverRes.error) throw new Error(driverRes.error);
      setDrivers(driverRes.data || []);
      setTrucks(truckRes.data || []);
      if (ocrKpiRes && typeof ocrKpiRes.total === 'number') {
        setTotalJobsheetContainers(ocrKpiRes.total);
      }
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
    const totalRed = drivers.reduce((sum, d) => sum + (d.red_containers || 0), 0);
    const runningDrivers = drivers.filter(d => (d.master_containers || 0) > 0).length;
    const matchRate = totalMaster > 0 ? Math.round((totalMatched / totalMaster) * 100) : 0;
    return { total, active, leave, inactive, assigned, unassigned, totalMaster, totalMatched, totalMissing, totalRed, runningDrivers, matchRate };
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

  // 🚚 เปิด Modal เพิ่มการดำเนินงานรถเมื่อมีการเลือกเบอร์รถ
  const handleOpenAssignModalForDriver = (driver, truckNo) => {
    setOperationModal({
      isOpen: true,
      operation: {
        driver_name: driver.driver_name,
        truck_no: truckNo || '',
        operation_type: 'primary',
        start_date: new Date().toISOString().slice(0, 10),
        isOngoing: true,
        remark: ''
      }
    });
  };

  // 🚫 ปลดรถประจำออกจากคนขับ (สิ้นสุดงวดการดำเนินงาน)
  const handleUnassignTruckFromDriver = async (driver) => {
    if (!driver.assigned_truck_no || driver.assigned_truck_no === '-') return;
    if (!window.confirm(`คุณต้องการปลดรถ "${driver.assigned_truck_no}" ออกจากคนขับ "${driver.driver_name}" ใช่หรือไม่?\n(ระบบจะสิ้นสุดงวดการดำเนินงานปัจจุบันและบันทึกประวัติให้อัตโนมัติ)`)) {
      return;
    }
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('unassign_driver_truck_rpc', {
        p_truck_no: driver.assigned_truck_no,
        p_driver_name: driver.driver_name,
        p_end_date: today,
        p_reason: `ปลดรถประจำออกจากคนขับ ${driver.driver_name}`,
        p_created_by: 'Admin'
      });

      if (rpcErr || !rpcRes?.success) {
        await supabase
          .from('truck_operations')
          .update({ end_date: today, status: 'completed', updated_at: new Date().toISOString() })
          .eq('driver_name', driver.driver_name)
          .eq('status', 'active');

        await supabase
          .from('truck_records')
          .update({ assigned_driver_name: '-', updated_at: new Date().toISOString() })
          .eq('truck_no', driver.assigned_truck_no);

        await supabase
          .from('driver_records')
          .update({ assigned_truck_no: '-', updated_at: new Date().toISOString() })
          .eq('driver_name', driver.driver_name);
      }
      success(`ปลดรถประจำออกจากคนขับ ${driver.driver_name} เรียบร้อยแล้ว`);
      loadData();
    } catch (err) {
      toastError('เกิดข้อผิดพลาดในการปลดรถ: ' + err.message);
    }
  };

  // 💾 บันทึกการดำเนินงานจาก Modal
  const handleSaveOperationFromDrivers = async (payload, id) => {
    if (id) {
      const { error } = await updateOperation(id, payload);
      if (error) throw new Error(error);
      success(`อัปเดตข้อมูลการดำเนินงานรถ ${payload.truck_no} เรียบร้อยแล้ว`);
    } else {
      const { error } = await createOperation(payload);
      if (error) throw new Error(error);
      success(`มอบหมายรถ ${payload.truck_no} ให้คนขับ ${payload.driver_name} เรียบร้อยแล้ว`);
    }
    setOperationModal({ isOpen: false, operation: null });
    loadData();
  };

  // Delete Driver
  const handleDeleteDriver = async (id, driverName) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลคุณ ${driverName}?`)) return;
    const res = await deleteDriver(id, driverName);
    if (res?.error) {
      toastError('ลบไม่สำเร็จ: ' + res.error);
    } else {
      success(res?.message || `ลบข้อมูลคุณ ${driverName} เรียบร้อยแล้ว`);
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

  // 🪪 Render Expiry Badge for License & Compliance
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

      {/* 2. KPI Metric Cards (Standardized 4-Card Blueprint) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        marginBottom: '16px',
        flexShrink: 0
      }}>
        <KpiCard
          title="👤 คนขับทั้งหมดในระบบ"
          value={kpis.total}
          unit="คน"
          theme="slate"
          subtext={`ปกติ ${kpis.active} • ลางาน ${kpis.leave} • พักงาน ${kpis.inactive}`}
        />

        <KpiCard
          title="🚛 ขับประจำ (มีรถประจำการ)"
          value={kpis.assigned}
          unit="คน"
          theme="green"
          badge={kpis.total > 0 ? `${Math.round((kpis.assigned / kpis.total) * 100)}%` : undefined}
          subtext={`⚪ ว่าง/สแตนด์บาย ${kpis.unassigned} คน`}
        />

        <KpiCard
          title="📋 งานทั้งหมดในใบงาน"
          value={totalJobsheetContainers}
          unit="งาน"
          theme="blue"
          subtext={`วิ่งงานในใบวางบิล ${kpis.totalMaster} งาน`}
        />

        <KpiCard
          title="🟢 ตรวจสอบแล้ว (Matched)"
          value={kpis.totalMatched}
          unit="งาน"
          theme="emerald"
          badge={kpis.totalMaster > 0 ? `${kpis.matchRate}%` : undefined}
          subtext={`⚠️ รอตรวจ ${kpis.totalMissing.toLocaleString()} งาน${kpis.totalRed > 0 ? ` (รวมตู้แดง ${kpis.totalRed} งาน)` : ''}`}
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
              placeholder="ค้นหาชื่อคนขับ, เบอร์โทร, เบอร์รถ..."
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
            <ColumnVisibilityDropdown preferences={driversPrefs} />
          </div>
        </div>

        {/* Universal Table Area */}
        <UniversalTableContainer
          preferences={driversPrefs}
          style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}
        >
          <UniversalTableHeader
            preferences={driversPrefs}
            data={filteredDrivers}
            alignMap={DRIVER_ALIGN_MAP}
          />

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
                      const align = DRIVER_ALIGN_MAP[col] || 'left';
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

                      if (col === 'driver_name') {
                        return (
                          <td key={col} style={{ ...cellStyle, fontWeight: 600, color: '#0f172a' }}>
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
                          <td key={col} style={cellStyle}>
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
                            <td key={col} style={cellStyle}>
                              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>
                                ⚪ พ้นสภาพ
                              </span>
                            </td>
                          );
                        }

                        if (isLeave) {
                          return (
                            <td key={col} style={cellStyle}>
                              <span style={{ color: '#b45309', fontSize: '12px', fontWeight: 600 }}>
                                🟡 ลางาน
                              </span>
                            </td>
                          );
                        }

                        if (isSubstitute) {
                          return (
                            <td key={col} style={cellStyle}>
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
                            <td key={col} style={cellStyle}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: '#ecfdf5',
                                color: '#15803d',
                                border: '1px solid #a7f3d0',
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

                        return (
                          <td key={col} style={cellStyle}>
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
                          <td key={col} style={{ ...cellStyle, padding: '4px 8px' }}>
                            {isAssigned ? (
                              <button
                                type="button"
                                onClick={() => handleOpenAssignModalForDriver(driver, driver.assigned_truck_no)}
                                title="คลิกเพื่อแก้ไขหรือเปลี่ยนเบอร์รถ (จะเปิดฟอร์มการดำเนินงานรถ)"
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
                                  fontFamily: 'monospace',
                                  fontSize: '12.5px',
                                  fontWeight: 800,
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
                                <span style={{ fontSize: '11.5px', flexShrink: 0 }}>🚚</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{driver.assigned_truck_no}</span>
                                <span style={{ fontSize: '10px', color: '#3b82f6', opacity: 0.85, flexShrink: 0, marginLeft: 'auto' }}>✏️</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenAssignModalForDriver(driver, '')}
                                title="คลิกเพื่อมอบหมายเบอร์รถ (จะเปิดฟอร์มการดำเนินงานรถ)"
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
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>เลือกรถ</span>
                              </button>
                            )}
                          </td>
                        );
                      }

                      if (col === 'base_salary') {
                        const sal = Number(driver.base_salary || 0);
                        return (
                          <td key={col} style={cellStyle}>
                            {sal > 0 ? (
                              <span style={{ fontWeight: 700, color: '#1e40af', fontSize: '13px' }}>
                                ฿{sal.toLocaleString()}
                              </span>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>-</span>
                            )}
                          </td>
                        );
                      }

                      if (col === 'tax_profile') {
                        const prof = driver.tax_profile || 'social_security';
                        return (
                          <td key={col} style={cellStyle}>
                            {prof === 'social_security' && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700 }}>
                                🏥 สปส. ({Number(driver.social_security_amount || 875).toLocaleString()}฿)
                              </span>
                            )}
                            {prof === 'withholding_3pct' && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700 }}>
                                📑 หัก 3%
                              </span>
                            )}
                            {prof === 'none' && (
                              <span style={{ color: '#94a3b8', fontSize: '11.5px' }}>⚪ ไม่หัก</span>
                            )}
                          </td>
                        );
                      }

                      if (col === 'master_containers' || col === 'total_containers') {
                        return (
                          <td key={col} style={{ ...cellStyle, fontWeight: 700, color: '#1e293b' }}>
                            {Number(driver.master_containers || driver.total_containers || 0).toLocaleString()}
                          </td>
                        );
                      }

                      if (col === 'matched_containers') {
                        const val = Number(driver.matched_containers || 0);
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
                        const val = Number(driver.missing_containers || 0);
                        const redVal = Number(driver.red_containers || 0);
                        return (
                          <td key={col} style={cellStyle}>
                            {val > 0 ? (
                              <span
                                title={redVal > 0 ? `รอตรวจสอบ ${val} งาน (รวมตู้แดง ${redVal} งาน)` : `รอตรวจสอบ ${val} งาน`}
                                style={{ 
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  gap: '4px', 
                                  background: redVal > 0 ? '#fef2f2' : '#fffbeb', 
                                  color: redVal > 0 ? '#b91c1c' : '#b45309', 
                                  border: redVal > 0 ? '1px solid #fecaca' : '1px solid #fde68a', 
                                  padding: '2px 8px', 
                                  borderRadius: '6px', 
                                  fontWeight: 700, 
                                  fontSize: '12px' 
                                }}
                              >
                                {redVal > 0 ? '🔴' : '⚠️'} {val.toLocaleString()}
                                {redVal > 0 && <span style={{ fontSize: '10px', opacity: 0.85 }}>(แดง {redVal})</span>}
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
                          <td key={col} style={cellStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
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

                      if (col === 'license_expiry_date') {
                        return (
                          <td key={col} style={cellStyle}>
                            {renderExpiryBadge(driver[col])}
                          </td>
                        );
                      }

                      if (col === 'start_date') {
                        return (
                          <td key={col} style={{ ...cellStyle, color: '#475569' }}>
                            {formatDateDisplay(driver[col])}
                          </td>
                        );
                      }

                      if (col === 'actions') {
                        return (
                          <td key={col} style={cellStyle}>
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
                        <td key={col} style={{ ...cellStyle, color: '#334155' }}>
                          {driver[col] || '-'}
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

      {/* App Native Status Change Confirmation Modal with Date Picker */}
      <StatusChangeConfirmModal
        isOpen={statusConfirmModal.isOpen}
        onClose={() => setStatusConfirmModal({ isOpen: false, driver: null, newStatus: '' })}
        type="DRIVER"
        data={statusConfirmModal.driver}
        newStatus={statusConfirmModal.newStatus}
        onConfirm={handleStatusModalConfirm}
      />

      {/* Operation Modal for Quick Truck Assignment */}
      <OperationModal
        isOpen={operationModal.isOpen}
        onClose={() => setOperationModal({ isOpen: false, operation: null })}
        onSave={handleSaveOperationFromDrivers}
        operation={operationModal.operation}
        truckList={trucks}
        driverList={drivers}
      />

    </div>
  );
}
