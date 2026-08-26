import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { driverPayrollService } from '../services/driverPayrollService';
import { supabase } from '../supabaseClient';
import { useColumnPreferences } from '../hooks/useColumnPreferences';
import KpiCard from '../components/ui/KpiCard';
import HubTabBar from '../components/ui/HubTabBar';
import Badge from '../components/ui/Badge';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown';
import UniversalTableContainer from '../components/ui/UniversalTableContainer';
import UniversalTableHeader from '../components/ui/UniversalTableHeader';
import MonthPicker from '../components/ui/MonthPicker';
import RateConfigModal from '../components/payroll/RateConfigModal';
import DriverPayrollDetailModal from '../components/payroll/DriverPayrollDetailModal';
import PaymentSettlementModal from '../components/payroll/PaymentSettlementModal';
import IncentiveConfigModal from '../components/payroll/IncentiveConfigModal';
import DriverAdvanceModal from '../components/payroll/DriverAdvanceModal';
import DriverSalaryConfigModal from '../components/payroll/DriverSalaryConfigModal';
import DriverModal from '../components/drivers/DriverModal';
import { driverAdvanceService, ADVANCE_TYPES } from '../services/driverAdvanceService';
import { fetchDrivers, updateDriver, createDriver, getDriverPayrollProfile } from '../services/truckDriverService';

const TABS = [
  { id: 'trips', label: 'สรุปผลงานวิ่งตู้ & ค่ารอบ', icon: '📦' },
  { id: 'rates', label: 'เรทราคา & เงินพิเศษ', icon: '⚙️' }
];

// =========================================================================
// 🎛️ Column Schema Specifications for Tab 1 (Trip Earnings Summary)
// =========================================================================
const DEFAULT_SUMMARY_COLUMNS = [
  'index',
  'driver_name',
  'assigned_truck_no',
  'total_containers',
  'pending_containers',
  'count_20',
  'earnings_20',
  'count_40',
  'earnings_40',
  'count_other',
  'total_earnings',
  'special_bonus',
  'total_net_payout',
  'actions'
];

const DEFAULT_SUMMARY_NAMES = {
  index: '#',
  driver_name: 'ชื่อพนักงานขับรถ',
  assigned_truck_no: 'เบอร์รถที่วิ่งงาน',
  total_containers: '🟢 ตรวจผ่านแล้ว',
  pending_containers: '⏳ รอตรวจ/รอแมตช์',
  count_20: 'ตู้ 20’',
  earnings_20: 'ค่ารอบ 20’',
  count_40: 'ตู้ 40’',
  earnings_40: 'ค่ารอบ 40’',
  count_other: 'ขนาดอื่น',
  total_earnings: 'รวมค่ารอบ',
  special_bonus: '🎁 เงินพิเศษ',
  total_net_payout: '💰 รวมค่าตอบแทนสุทธิ',
  actions: 'จัดการ'
};

const DEFAULT_SUMMARY_WIDTHS = {
  index: 45,
  driver_name: 145,
  assigned_truck_no: 110,
  total_containers: 100,
  pending_containers: 110,
  count_20: 80,
  earnings_20: 95,
  count_40: 80,
  earnings_40: 95,
  count_other: 80,
  total_earnings: 115,
  special_bonus: 110,
  total_net_payout: 135,
  actions: 120
};

const SUMMARY_ALIGN_MAP = {
  index: 'center',
  driver_name: 'left',
  assigned_truck_no: 'center',
  verified_containers: 'right',
  pending_containers: 'right',
  count_20: 'right',
  earnings_20: 'right',
  count_40: 'right',
  earnings_40: 'right',
  count_other: 'right',
  total_earnings: 'right',
  special_bonus: 'right',
  total_net_payout: 'right',
  unpaid_amount: 'right',
  actions: 'center'
};

// =========================================================================
// 🎛️ Column Schema Specifications for Tab 2 (Driver Salary & Deductions Config)
// =========================================================================
const DEFAULT_SALARY_CONFIG_COLUMNS = [
  'index',
  'driver_name',
  'assigned_truck_no',
  'status',
  'base_salary',
  'tax_profile',
  'social_security_amount',
  'remark',
  'actions'
];

const DEFAULT_SALARY_CONFIG_NAMES = {
  index: '#',
  driver_name: 'ชื่อพนักงานขับรถ',
  assigned_truck_no: 'เบอร์รถประจำ',
  status: 'สถานะคนขับ',
  base_salary: '💵 ฐานเงินเดือนประจำ',
  tax_profile: '🏥 รูปแบบการหัก (Tax & SSO)',
  social_security_amount: '🏥 ยอดหัก สปส./เดือน',
  remark: 'หมายเหตุ',
  actions: 'จัดการ'
};

const DEFAULT_SALARY_CONFIG_WIDTHS = {
  index: 45,
  driver_name: 160,
  assigned_truck_no: 110,
  status: 100,
  base_salary: 130,
  tax_profile: 160,
  social_security_amount: 130,
  remark: 160,
  actions: 100
};

const SALARY_CONFIG_ALIGN_MAP = {
  index: 'center',
  driver_name: 'left',
  assigned_truck_no: 'center',
  status: 'center',
  base_salary: 'right',
  tax_profile: 'left',
  social_security_amount: 'right',
  remark: 'left',
  actions: 'center'
};

// =========================================================================
// 🎛️ Column Schema Specifications for Tab 3 (Advances & Loans)
// =========================================================================
const DEFAULT_ADVANCE_COLUMNS = [
  'index',
  'advance_date',
  'driver_name',
  'advance_type',
  'amount',
  'installment_info',
  'remaining_amount',
  'status',
  'slip_url',
  'remark',
  'actions'
];

const DEFAULT_ADVANCE_NAMES = {
  index: '#',
  advance_date: '📅 วันที่',
  driver_name: 'ชื่อพนักงานขับรถ',
  advance_type: '🏷️ รูปแบบ & ประเภท',
  amount: '💰 ยอดเงินรวม (บาท)',
  installment_info: '📊 งวดชำระ / ยอดหักงวดละ',
  remaining_amount: '💵 ยอดคงเหลือ',
  status: '📌 สถานะ',
  slip_url: 'สลิป',
  remark: 'หมายเหตุ',
  actions: 'จัดการ'
};

const DEFAULT_ADVANCE_WIDTHS = {
  index: 45,
  advance_date: 110,
  driver_name: 140,
  advance_type: 150,
  amount: 125,
  installment_info: 165,
  remaining_amount: 120,
  status: 125,
  slip_url: 85,
  remark: 160,
  actions: 90
};

const ADVANCE_ALIGN_MAP = {
  index: 'center',
  advance_date: 'center',
  driver_name: 'left',
  advance_type: 'left',
  amount: 'right',
  installment_info: 'left',
  remaining_amount: 'right',
  status: 'center',
  slip_url: 'center',
  remark: 'left',
  actions: 'center'
};

// =========================================================================
// 🎛️ Column Schema Specifications for Tab 4 (Settlements)
// =========================================================================
const DEFAULT_SETTLEMENT_COLUMNS = [
  'index',
  'batch_no',
  'driver_name',
  'period',
  'total_containers',
  'total_amount',
  'paid_at',
  'paid_by',
  'note',
  'status',
  'actions'
];

const DEFAULT_SETTLEMENT_NAMES = {
  index: '#',
  batch_no: 'เลขที่ใบสำคัญ (PV No)',
  driver_name: 'ชื่อพนักงานขับรถ',
  period: 'งวดวันที่',
  total_containers: 'จำนวนตู้',
  total_amount: 'ยอดเงินที่ตัดรอบ',
  paid_at: 'วันที่ตัดรอบ',
  paid_by: 'ผู้บันทึก',
  note: 'หมายเหตุ / อ้างอิง',
  status: 'สถานะ',
  actions: 'จัดการ'
};

const DEFAULT_SETTLEMENT_WIDTHS = {
  index: 50,
  batch_no: 160,
  driver_name: 160,
  period: 170,
  total_containers: 90,
  total_amount: 140,
  paid_at: 140,
  paid_by: 110,
  note: 200,
  status: 100,
  actions: 100
};

const SETTLEMENT_ALIGN_MAP = {
  index: 'center',
  batch_no: 'left',
  driver_name: 'left',
  period: 'center',
  total_containers: 'center',
  total_amount: 'right',
  paid_at: 'center',
  paid_by: 'center',
  note: 'left',
  status: 'center',
  actions: 'center'
};

// =========================================================================
// 🎛️ Column Schema Specifications for Tab 5 (Rate Configurations)
// =========================================================================
const DEFAULT_RATES_COLUMNS = [
  'index',
  'name',
  'driver_name',
  'start_date',
  'end_date',
  'rate_20',
  'rate_40',
  'rate_45',
  'is_active',
  'remark',
  'actions'
];

const DEFAULT_RATES_NAMES = {
  index: '#',
  name: 'ชื่อช่วงเรทราคา',
  driver_name: 'มีผลกับ',
  start_date: 'วันที่เริ่มต้น',
  end_date: 'วันที่สิ้นสุด',
  rate_20: 'Size 20',
  rate_40: 'Size 40',
  rate_45: 'Size 45',
  is_active: 'สถานะ',
  remark: 'หมายเหตุ',
  actions: 'จัดการ'
};

const DEFAULT_RATES_WIDTHS = {
  index: 50,
  name: 200,
  driver_name: 130,
  start_date: 120,
  end_date: 130,
  rate_20: 100,
  rate_40: 100,
  rate_45: 100,
  is_active: 90,
  remark: 180,
  actions: 100
};

const RATES_ALIGN_MAP = {
  index: 'center',
  driver_name: 'center',
  start_date: 'center',
  end_date: 'center',
  rate_20: 'right',
  rate_40: 'right',
  rate_45: 'right',
  is_active: 'center',
  actions: 'center'
};

export default function DriverPayrollView({ defaultTab, defaultSubTab } = {}) {
  const [activeTab, setActiveTab] = useState(defaultSubTab || defaultTab || 'trips');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (defaultSubTab || defaultTab) {
      setActiveTab(defaultSubTab || defaultTab);
    }
  }, [defaultTab, defaultSubTab]);

  // 📦 Data for Tab 1 (Trip Earnings Summary)
  const [payrollData, setPayrollData] = useState({
    drivers: [],
    kpis: {
      total_earnings: 0,
      total_bonus: 0,
      total_net_payout: 0,
      total_containers: 0,
      total_pending: 0,
      count_20: 0,
      earnings_20: 0,
      count_40: 0,
      earnings_40: 0,
      count_other: 0,
      earnings_other: 0,
      active_drivers_count: 0
    },
    ratesUsed: []
  });

  // 💵 Data for Tab 2 (Driver Salary & Deduction Settings)
  const [driverList, setDriverList] = useState([]);
  const [salarySearchTerm, setSalarySearchTerm] = useState('');
  const [salaryStatusFilter, setSalaryStatusFilter] = useState('ALL');
  const [salaryTaxFilter, setSalaryTaxFilter] = useState('ALL');
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [selectedSalaryDriver, setSelectedSalaryDriver] = useState(null);

  // 💸 Data for Tab 3 (Driver Advances & Loans)
  const [advancesList, setAdvancesList] = useState([]);
  const [advancesLoading, setAdvancesLoading] = useState(false);
  const [advanceSearchTerm, setAdvanceSearchTerm] = useState('');
  const [advanceDriverFilter, setAdvanceDriverFilter] = useState('ALL');
  const [advanceCategoryFilter, setAdvanceCategoryFilter] = useState('ALL');
  const [advanceStatusFilter, setAdvanceStatusFilter] = useState('ALL');
  const [advanceDateFrom, setAdvanceDateFrom] = useState('');
  const [advanceDateTo, setAdvanceDateTo] = useState('');

  // 📜 Data for Tab 4 (Settlements)
  const [settlementBatches, setSettlementBatches] = useState([]);
  const [settlementsLoading, setSettlementsLoading] = useState(false);

  // ⚙️ Data for Tab 5 (Rate Configurations & Incentives)
  const [rateConfigs, setRateConfigs] = useState([]);
  const [availableBatches, setAvailableBatches] = useState([]);
  const [availableTrucks, setAvailableTrucks] = useState([]);
  const [incentiveConfigs, setIncentiveConfigs] = useState([]);
  const [isIncModalOpen, setIsIncModalOpen] = useState(false);
  const [editingIncConfig, setEditingIncConfig] = useState(null);
  const [editingTaxConfig, setEditingTaxConfig] = useState(() => driverPayrollService.fetchGlobalTaxConfig());

  // 🔍 Filters for Tab 1 (Trips)
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [datePreset, setDatePreset] = useState('ALL'); 
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedDriverFilter, setSelectedDriverFilter] = useState('ALL');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('ALL');
  const [selectedTruckFilter, setSelectedTruckFilter] = useState('ALL');
  const [selectedPaymentFilter, setSelectedPaymentFilter] = useState('ALL');

  // 🪟 Modals State
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [editingRateConfig, setEditingRateConfig] = useState(null);
  const [selectedDriverDetail, setSelectedDriverDetail] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [settlementDriverSummary, setSettlementDriverSummary] = useState(null);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [selectedAdvanceRecord, setSelectedAdvanceRecord] = useState(null);
  const [advanceDefaultDriver, setAdvanceDefaultDriver] = useState('');
  const [previewSlipImage, setPreviewSlipImage] = useState(null);

  // 👤 Driver Edit Modal
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [editingDriverRecord, setEditingDriverRecord] = useState(null);

  const handleSaveDriverProfile = async (formData, driverId) => {
    if (driverId) {
      const res = await updateDriver(driverId, formData);
      if (res.error) throw new Error(res.error);
    } else {
      const res = await createDriver(formData);
      if (res.error) throw new Error(res.error);
    }
    showToast('👤 บันทึกข้อมูลคนขับเรียบร้อยแล้ว');
    loadDriversMetadata();
    reloadData();
  };

  const handleOpenDriverEdit = (driverName) => {
    const found = driverList.find(d => d.driver_name === driverName);
    if (found) {
      setEditingDriverRecord(found);
    } else {
      setEditingDriverRecord({ driver_name: driverName });
    }
    setIsDriverModalOpen(true);
  };

  const handleSaveSalaryProfile = async (profileData) => {
    const { driver_name, base_salary, tax_profile, social_security_amount, remark } = profileData;
    
    // 1. บันทึกลง LocalStorage Cache
    driverPayrollService.saveDriverPayrollProfile(driver_name, {
      base_salary,
      tax_profile,
      social_security_amount
    });

    // 2. บันทึกลง Supabase driver_records Table
    const found = driverList.find(d => d.driver_name === driver_name);
    if (found?.id) {
      await updateDriver(found.id, {
        base_salary,
        tax_profile,
        social_security_amount
      });
    }

    showToast(`💵 บันทึกการตั้งค่าเงินเดือน & หัก สปส./3% ของ ${driver_name} เรียบร้อยแล้ว`);
    loadDriversMetadata();
    reloadData();
  };

  const handleSaveAdvance = async (advanceData) => {
    const res = await driverAdvanceService.saveAdvance(advanceData);
    if (res.error) {
      alert('เกิดข้อผิดพลาดในการบันทึกเบิกล่วงหน้า: ' + res.error.message);
      return;
    }
    showToast('💸 บันทึกการเบิกเงินล่วงหน้าเรียบร้อยแล้ว');
    reloadData();
    if (activeTab === 'advances') loadAdvances();
  };

  const handleDeleteAdvance = async (id) => {
    if (!window.confirm('คุณต้องการลบรายการเบิกเงินนี้ใช่หรือไม่?')) return;
    const res = await driverAdvanceService.deleteAdvance(id);
    if (res.error) {
      alert('เกิดข้อผิดพลาดในการลบ: ' + res.error.message);
      return;
    }
    showToast('🗑️ ลบรายการเบิกเงินเรียบร้อยแล้ว');
    reloadData();
    if (activeTab === 'advances') loadAdvances();
  };

  const handleSaveTaxConfig = (e) => {
    e.preventDefault();
    driverPayrollService.saveGlobalTaxConfig(editingTaxConfig);
    showToast('🏥 บันทึกอัตราประกันสังคม & ภาษีส่วนกลางเรียบร้อยแล้ว');
    reloadData();
  };

  // =========================================================================
  // 🎛️ Column Preferences for each tab
  // =========================================================================
  const summaryPrefs = useColumnPreferences({
    storageKeyPrefix: 'payroll_summary',
    rawColumns: DEFAULT_SUMMARY_COLUMNS,
    defaultNames: DEFAULT_SUMMARY_NAMES,
    defaultWidths: DEFAULT_SUMMARY_WIDTHS,
    sampleRecords: payrollData.drivers
  });

  const salaryConfigPrefs = useColumnPreferences({
    storageKeyPrefix: 'payroll_salary_config',
    rawColumns: DEFAULT_SALARY_CONFIG_COLUMNS,
    defaultNames: DEFAULT_SALARY_CONFIG_NAMES,
    defaultWidths: DEFAULT_SALARY_CONFIG_WIDTHS,
    sampleRecords: driverList
  });

  const advancesPrefs = useColumnPreferences({
    storageKeyPrefix: 'payroll_advances',
    rawColumns: DEFAULT_ADVANCE_COLUMNS,
    defaultNames: DEFAULT_ADVANCE_NAMES,
    defaultWidths: DEFAULT_ADVANCE_WIDTHS,
    sampleRecords: advancesList
  });

  const settlementsPrefs = useColumnPreferences({
    storageKeyPrefix: 'payroll_settlements',
    rawColumns: DEFAULT_SETTLEMENT_COLUMNS,
    defaultNames: DEFAULT_SETTLEMENT_NAMES,
    defaultWidths: DEFAULT_SETTLEMENT_WIDTHS,
    sampleRecords: settlementBatches
  });

  const ratesPrefs = useColumnPreferences({
    storageKeyPrefix: 'payroll_rates',
    rawColumns: DEFAULT_RATES_COLUMNS,
    defaultNames: DEFAULT_RATES_NAMES,
    defaultWidths: DEFAULT_RATES_WIDTHS,
    sampleRecords: rateConfigs
  });

  // 1. Initial Load: Metadata, Drivers, Batches, Trucks
  const loadDriversMetadata = useCallback(async () => {
    try {
      const [driversRes, batchesRes, trucksRes] = await Promise.all([
        fetchDrivers(),
        supabase.from('job_sheets').select('batch_name').neq('status', 'deleted').limit(200),
        supabase.from('truck_records').select('truck_no').order('truck_no')
      ]);

      if (driversRes?.data) setDriverList(driversRes.data);
      if (batchesRes?.data) {
        const bSet = new Set(batchesRes.data.map(b => b.batch_name).filter(Boolean));
        setAvailableBatches(Array.from(bSet).sort());
      }
      if (trucksRes?.data) {
        const tSet = new Set(trucksRes.data.map(t => t.truck_no).filter(Boolean));
        setAvailableTrucks(Array.from(tSet).sort());
      }
    } catch (e) {
      console.error('Error fetching payroll metadata:', e);
    }
  }, []);

  useEffect(() => {
    loadDriversMetadata();
  }, [loadDriversMetadata]);

  // 2. Load Rates & Calculate Trip Earnings
  const reloadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [ratesRes, incRes] = await Promise.all([
        driverPayrollService.fetchRateConfigs(),
        driverPayrollService.fetchIncentiveConfigs()
      ]);
      if (ratesRes?.data) {
        setRateConfigs(ratesRes.data);
      }
      if (incRes?.data) {
        setIncentiveConfigs(incRes.data);
      }

      let calcDateFrom = null;
      let calcDateTo = null;

      if (selectedMonth && selectedMonth !== 'ALL') {
        const [year, month] = selectedMonth.split('-');
        const lastDay = new Date(Number(year), Number(month), 0).getDate();
        calcDateFrom = `${selectedMonth}-01`;
        calcDateTo = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
      } else if (dateFrom || dateTo) {
        calcDateFrom = dateFrom || null;
        calcDateTo = dateTo || null;
      }

      const payrollRes = await driverPayrollService.calculatePayrollSummary({
        dateFrom: calcDateFrom,
        dateTo: calcDateTo,
        driverFilter: selectedDriverFilter,
        batchFilter: selectedBatchFilter,
        truckFilter: selectedTruckFilter,
        paymentStatusFilter: selectedPaymentFilter
      });

      if (payrollRes?.data) {
        setPayrollData(payrollRes.data);
      }
    } catch (e) {
      console.error('Error calculating payroll:', e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth, dateFrom, dateTo, selectedDriverFilter, selectedBatchFilter, selectedTruckFilter, selectedPaymentFilter]);

  // 3. Load Advances
  const loadAdvances = useCallback(async () => {
    setAdvancesLoading(true);
    try {
      const res = await driverAdvanceService.fetchAdvances({
        driverName: advanceDriverFilter !== 'ALL' ? advanceDriverFilter : null,
        category: advanceCategoryFilter !== 'ALL' ? advanceCategoryFilter : null,
        status: advanceStatusFilter !== 'ALL' ? advanceStatusFilter : null,
        dateFrom: advanceDateFrom || null,
        dateTo: advanceDateTo || null
      });
      if (res?.data) {
        setAdvancesList(res.data);
      }
    } catch (e) {
      console.error('Error loading advances:', e);
    } finally {
      setAdvancesLoading(false);
    }
  }, [advanceDriverFilter, advanceCategoryFilter, advanceStatusFilter, advanceDateFrom, advanceDateTo]);

  // 4. Load Settlements History
  const loadSettlements = useCallback(async () => {
    setSettlementsLoading(true);
    try {
      const res = await driverPayrollService.fetchPaymentBatches();
      if (res?.data) {
        setSettlementBatches(res.data);
      }
    } catch (e) {
      console.error('Error fetching settlements:', e);
    } finally {
      setSettlementsLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  useEffect(() => {
    if (activeTab === 'advances') loadAdvances();
    if (activeTab === 'settlements') loadSettlements();
  }, [activeTab, loadAdvances, loadSettlements]);

  // Handle Preset Date Range Change for Tab 1
  const handleDatePresetChange = (preset) => {
    setDatePreset(preset);
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth();

    if (preset === 'THIS_MONTH') {
      const firstDay = new Date(curYear, curMonth, 1).toISOString().slice(0, 10);
      const lastDay = new Date(curYear, curMonth + 1, 0).toISOString().slice(0, 10);
      setDateFrom(firstDay);
      setDateTo(lastDay);
    } else if (preset === 'LAST_MONTH') {
      const firstDay = new Date(curYear, curMonth - 1, 1).toISOString().slice(0, 10);
      const lastDay = new Date(curYear, curMonth, 0).toISOString().slice(0, 10);
      setDateFrom(firstDay);
      setDateTo(lastDay);
    } else if (preset === 'THIS_YEAR') {
      setDateFrom(`${curYear}-01-01`);
      setDateTo(`${curYear}-12-31`);
    } else if (preset === 'ALL') {
      setDateFrom('');
      setDateTo('');
    }
  };

  const showToast = (msg) => {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.backgroundColor = '#0f172a';
    toast.style.color = '#ffffff';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '8px';
    toast.style.fontSize = '13px';
    toast.style.fontWeight = '600';
    toast.style.zIndex = '99999';
    toast.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.3)';
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.5s ease';
      toast.style.opacity = '0';
      setTimeout(() => {
        if (document.body.contains(toast)) document.body.removeChild(toast);
      }, 500);
    }, 2500);
  };

  // Filtered drivers for Tab 1
  const filteredDrivers = useMemo(() => {
    return (payrollData.drivers || []).filter(d => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        d.driver_name?.toLowerCase().includes(term) ||
        d.assigned_truck_no?.toLowerCase().includes(term)
      );
    });
  }, [payrollData.drivers, searchTerm]);

  // Master drivers with salary & tax profiles for Tab 2
  const enrichedSalaryDrivers = useMemo(() => {
    return (driverList || []).map(d => {
      const profile = getDriverPayrollProfile(d.driver_name) || {};
      const baseSalary = (d.base_salary !== undefined && d.base_salary !== null) ? Number(d.base_salary) : Number(profile.base_salary || 0);
      const taxProfile = d.tax_profile || profile.tax_profile || 'social_security';
      const defaultSso = 875;
      const ssoRaw = (d.social_security_amount !== undefined && d.social_security_amount !== null) ? Number(d.social_security_amount) : Number(profile.social_security_amount || defaultSso);
      const ssoAmount = (ssoRaw === 750 || !ssoRaw) ? defaultSso : ssoRaw;

      return {
        ...d,
        base_salary: baseSalary,
        tax_profile: taxProfile,
        social_security_amount: ssoAmount
      };
    });
  }, [driverList]);

  // Filtered drivers for Tab 2
  const filteredSalaryDrivers = useMemo(() => {
    return enrichedSalaryDrivers.filter(d => {
      if (salarySearchTerm) {
        const term = salarySearchTerm.toLowerCase();
        const matchName = d.driver_name?.toLowerCase().includes(term);
        const matchTruck = d.assigned_truck_no?.toLowerCase().includes(term);
        if (!matchName && !matchTruck) return false;
      }
      if (salaryStatusFilter !== 'ALL' && d.status !== salaryStatusFilter) return false;
      if (salaryTaxFilter !== 'ALL' && d.tax_profile !== salaryTaxFilter) return false;
      return true;
    });
  }, [enrichedSalaryDrivers, salarySearchTerm, salaryStatusFilter, salaryTaxFilter]);

  // Filtered advances for Tab 3
  const filteredAdvances = useMemo(() => {
    return (advancesList || []).filter(a => {
      if (!advanceSearchTerm) return true;
      const term = advanceSearchTerm.toLowerCase();
      return (
        a.driver_name?.toLowerCase().includes(term) ||
        a.assigned_truck_no?.toLowerCase().includes(term) ||
        a.remark?.toLowerCase().includes(term)
      );
    });
  }, [advancesList, advanceSearchTerm]);

  // Sorted rate configurations for Tab 5
  const sortedRates = useMemo(() => {
    return [...rateConfigs].sort((a, b) => {
      if (a.is_active === false && b.is_active !== false) return 1;
      if (a.is_active !== false && b.is_active === false) return -1;
      return (b.start_date || '').localeCompare(a.start_date || '');
    });
  }, [rateConfigs]);

  // Sorted settlements for Tab 4
  const sortedSettlements = useMemo(() => {
    return [...settlementBatches].sort((a, b) => (b.paid_at || '').localeCompare(a.paid_at || ''));
  }, [settlementBatches]);

  // Sorted displayed drivers for Tab 1
  const displayedDrivers = useMemo(() => {
    return summaryPrefs.sortRecords ? summaryPrefs.sortRecords(filteredDrivers) : filteredDrivers;
  }, [filteredDrivers, summaryPrefs.sortConfig, summaryPrefs.sortRecords]);

  // Sorted displayed salary drivers for Tab 2
  const displayedSalaryDrivers = useMemo(() => {
    return salaryConfigPrefs.sortRecords ? salaryConfigPrefs.sortRecords(filteredSalaryDrivers) : filteredSalaryDrivers;
  }, [filteredSalaryDrivers, salaryConfigPrefs.sortConfig, salaryConfigPrefs.sortRecords]);

  // Sorted displayed advances for Tab 3
  const displayedAdvances = useMemo(() => {
    return advancesPrefs.sortRecords ? advancesPrefs.sortRecords(filteredAdvances) : filteredAdvances;
  }, [filteredAdvances, advancesPrefs.sortConfig, advancesPrefs.sortRecords]);

  // Sorted displayed settlements for Tab 4
  const displayedSettlements = useMemo(() => {
    return settlementsPrefs.sortRecords ? settlementsPrefs.sortRecords(settlementBatches) : sortedSettlements;
  }, [settlementBatches, sortedSettlements, settlementsPrefs.sortConfig, settlementsPrefs.sortRecords]);

  // Sorted displayed rate configurations for Tab 5
  const displayedRates = useMemo(() => {
    return ratesPrefs.sortRecords ? ratesPrefs.sortRecords(rateConfigs) : sortedRates;
  }, [rateConfigs, sortedRates, ratesPrefs.sortConfig, ratesPrefs.sortRecords]);

  // Save / Update Rate Config
  const handleSaveRateConfig = async (formData, configId) => {
    const res = await driverPayrollService.saveRateConfig({
      ...formData,
      id: configId
    });
    if (res.error) {
      alert('เกิดข้อผิดพลาดในการบันทึกเรทราคา: ' + res.error.message);
      return;
    }
    showToast('⚙️ บันทึกการตั้งค่าเรทราคาเรียบร้อยแล้ว');
    reloadData();
    setIsRateModalOpen(false);
  };

  // Rollback Payment Settlement
  const handleRollbackSettlement = async (batch) => {
    if (!window.confirm(`คุณต้องการยกเลิกการตัดรอบของ ${batch.driver_name} (เลขที่ ${batch.batch_no}) ใช่หรือไม่?\n\nรายการตู้ในงวดนี้จะถูกเปลี่ยนสถานะกลับเป็น 'ยังไม่จ่าย' (Unpaid)`)) {
      return;
    }
    const res = await driverPayrollService.rollbackPaymentBatch(batch.id);
    if (!res.success) {
      alert('เกิดข้อผิดพลาดในการยกเลิก: ' + (res.error || 'ไม่สามารถทำรายการได้'));
      return;
    }
    showToast('↩️ ยกเลิกการตัดรอบเรียบร้อยแล้ว');
    reloadData();
    loadSettlements();
  };

  // Export Tab 1 (Trip Earnings) to Excel
  const handleExportPayrollExcel = () => {
    try {
      const rows = filteredDrivers.map((d, idx) => ({
        'ลำดับ': idx + 1,
        'ชื่อพนักงานขับรถ': d.driver_name,
        'เบอร์รถที่วิ่งงาน': d.assigned_truck_no || '-',
        'ตู้ตรวจแล้ว': d.verified_containers || 0,
        'ตู้รอตรวจ': d.pending_containers || 0,
        'จำนวนตู้ 20’': d.count_20 || 0,
        'ค่ารอบ 20’ (บาท)': d.earnings_20 || 0,
        'จำนวนตู้ 40’': d.count_40 || 0,
        'ค่ารอบ 40’ (บาท)': d.earnings_40 || 0,
        'ขนาดอื่น': d.count_other || 0,
        'ค่ารอบรวม (บาท)': d.total_earnings || 0,
        'เงินพิเศษ (บาท)': d.special_bonus || 0,
        'รวมรับสุทธิ (บาท)': (d.total_earnings || 0) + (d.special_bonus || 0),
        'ยอดรอตัดรอบ (บาท)': d.unpaid_amount || 0
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'สรุปค่ารอบคนขับ');
      XLSX.writeFile(wb, `สรุปค่ารอบคนขับ_${dateFrom || 'all'}_ถึง_${dateTo || 'now'}.xlsx`);
    } catch (e) {
      console.error('Export Excel error:', e);
      alert('ไม่สามารถส่งออก Excel ได้');
    }
  };

  // Export Tab 2 (Salary Config) to Excel
  const handleExportSalaryConfigExcel = () => {
    try {
      const rows = filteredSalaryDrivers.map((d, idx) => ({
        'ลำดับ': idx + 1,
        'ชื่อพนักงานขับรถ': d.driver_name,
        'เบอร์รถประจำ': d.assigned_truck_no || '-',
        'สถานะ': d.status === 'active' ? 'ปฏิบัติงาน' : (d.status === 'leave' ? 'ลางาน' : 'พักงาน/ลาออก'),
        'ฐานเงินเดือนประจำ (บาท)': d.base_salary || 0,
        'รูปแบบการหัก': d.tax_profile === 'social_security' ? 'มีประกันสังคม' : (d.tax_profile === 'withholding_3pct' ? 'หัก ณ ที่จ่าย 3%' : 'ไม่หัก'),
        'ยอดหัก สปส./เดือน (บาท)': d.tax_profile === 'social_security' ? (d.social_security_amount || 875) : 0,
        'หมายเหตุ': d.remark || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'ตั้งค่าเงินเดือนคนขับ');
      XLSX.writeFile(wb, `ตั้งค่าเงินเดือนและเงินหักคนขับ_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      console.error('Export Salary Config Excel error:', e);
      alert('ไม่สามารถส่งออก Excel ได้');
    }
  };

  // Export Tab 3 (Advances) to Excel
  const handleExportAdvancesExcel = () => {
    try {
      const rows = filteredAdvances.map((a, idx) => ({
        'ลำดับ': idx + 1,
        'วันที่เบิก': a.advance_date,
        'ชื่อพนักงานขับรถ': a.driver_name,
        'เบอร์รถ': a.assigned_truck_no || '-',
        'จำนวนเงิน (บาท)': a.amount || 0,
        'ประเภทการเบิก': ADVANCE_TYPES[a.advance_type]?.label || a.advance_type,
        'สถานะ': a.status === 'settled' ? 'หักในงวดแล้ว' : 'รอดึงหัก',
        'หมายเหตุ': a.remark || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'รายการเบิกล่วงหน้า');
      XLSX.writeFile(wb, `รายการเบิกล่วงหน้า_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      console.error('Export Advances Excel error:', e);
      alert('ไม่สามารถส่งออก Excel ได้');
    }
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr || dateStr === '-') return '-';
    try {
      const [y, m, d] = dateStr.slice(0, 10).split('-');
      if (y && m && d) return `${d}/${m}/${y}`;
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  // Render Summary Table Cell (Tab 1)
  const renderSummaryCell = (col, driver, idx) => {
    switch (col) {
      case 'index':
        return <span style={{ color: '#94a3b8', fontSize: '12px' }}>{idx + 1}</span>;
      case 'driver_name':
        return (
          <button
            type="button"
            onClick={() => handleOpenDriverEdit(driver.driver_name)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: '#1d4ed8',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
              textDecoration: 'underline',
              textUnderlineOffset: '2px'
            }}
            title="คลิกเพื่อแก้ไขข้อมูลคนขับ"
          >
            {driver.driver_name}
          </button>
        );
      case 'assigned_truck_no':
        return (
          <span style={{
            padding: '2px 8px',
            borderRadius: '6px',
            background: '#eff6ff',
            color: '#1d4ed8',
            fontWeight: 700,
            fontSize: '12px'
          }}>
            {driver.assigned_truck_no || '-'}
          </span>
        );
      case 'total_containers':
      case 'verified_containers':
        return (
          <span style={{ fontWeight: 800, color: '#059669', fontSize: '13px' }}>
            {driver.total_containers || driver.verified_containers || 0} <span style={{ fontSize: '11px', fontWeight: 400, color: '#64748b' }}>ตู้</span>
          </span>
        );
      case 'pending_containers':
        return driver.pending_containers > 0 ? (
          <span style={{
            padding: '2px 8px',
            borderRadius: '6px',
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            color: '#ea580c',
            fontWeight: 700,
            fontSize: '11.5px'
          }}>
            ⏳ {driver.pending_containers} ตู้
          </span>
        ) : (
          <span style={{ color: '#94a3b8' }}>-</span>
        );
      case 'count_20':
        return (
          <span style={{ fontWeight: 700, color: '#2563eb' }}>
            {driver.count_20 || 0} <span style={{ fontSize: '11px', fontWeight: 400, color: '#64748b' }}>ตู้</span>
          </span>
        );
      case 'earnings_20':
        return <span style={{ fontWeight: 600, color: '#334155' }}>฿{(driver.earnings_20 || 0).toLocaleString()}</span>;
      case 'count_40':
        return (
          <span style={{ fontWeight: 700, color: '#d97706' }}>
            {driver.count_40 || 0} <span style={{ fontSize: '11px', fontWeight: 400, color: '#64748b' }}>ตู้</span>
          </span>
        );
      case 'earnings_40':
        return <span style={{ fontWeight: 600, color: '#334155' }}>฿{(driver.earnings_40 || 0).toLocaleString()}</span>;
      case 'count_other':
        return (
          <span style={{ fontWeight: 700, color: '#64748b' }}>
            {driver.count_other || 0} <span style={{ fontSize: '11px', fontWeight: 400, color: '#64748b' }}>ตู้</span>
          </span>
        );
      case 'total_earnings':
        return (
          <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e40af' }}>
            ฿{(driver.total_earnings || 0).toLocaleString()}
          </span>
        );
      case 'special_bonus':
        return (
          <span style={{
            fontWeight: 700,
            fontSize: '12.5px',
            color: driver.special_bonus > 0 ? '#b45309' : '#94a3b8',
            background: driver.special_bonus > 0 ? '#fef3c7' : 'transparent',
            padding: driver.special_bonus > 0 ? '2px 8px' : '0',
            borderRadius: '6px'
          }}>
            {driver.special_bonus > 0 ? `+฿${driver.special_bonus.toLocaleString()}` : '-'}
          </span>
        );
      case 'total_net_payout':
        const netTripTotal = (driver.total_earnings || 0) + (driver.special_bonus || 0);
        return (
          <span style={{ fontWeight: 800, fontSize: '14px', color: '#16a34a' }}>
            ฿{netTripTotal.toLocaleString()}
          </span>
        );
      case 'unpaid_amount':
        return (
          <span style={{
            fontWeight: 700,
            fontSize: '13px',
            color: driver.unpaid_amount > 0 ? '#0284c7' : '#94a3b8'
          }}>
            ฿{(driver.unpaid_amount || 0).toLocaleString()}
          </span>
        );
      case 'actions':
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => {
                setSelectedDriverDetail(driver);
                setIsDetailModalOpen(true);
              }}
              style={{
                padding: '4px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#1e40af',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🔍 ดูตู้ ({driver.total_containers || 0})
            </button>
          </div>
        );
      default:
        return driver[col] || '-';
    }
  };

  // Render Salary Config Table Cell (Tab 2)
  const renderSalaryConfigCell = (col, driver, idx) => {
    switch (col) {
      case 'index':
        return <span style={{ color: '#94a3b8', fontSize: '12px' }}>{idx + 1}</span>;
      case 'driver_name':
        return (
          <button
            type="button"
            onClick={() => {
              setSelectedSalaryDriver(driver);
              setIsSalaryModalOpen(true);
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: '#0f172a',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
              textDecoration: 'underline',
              textUnderlineOffset: '2px'
            }}
            title="คลิกเพื่อตั้งค่าเงินเดือน"
          >
            {driver.driver_name}
          </button>
        );
      case 'assigned_truck_no':
        return (
          <span style={{
            padding: '2px 8px',
            borderRadius: '6px',
            background: '#eff6ff',
            color: '#1d4ed8',
            fontWeight: 700,
            fontSize: '12px'
          }}>
            {driver.assigned_truck_no || '-'}
          </span>
        );
      case 'status':
        return (
          <Badge variant={driver.status === 'active' ? 'success' : driver.status === 'leave' ? 'warning' : 'slate'} size="sm">
            {driver.status === 'active' ? '🟢 ประจำการ' : driver.status === 'leave' ? '🟡 ลางาน' : '⚪ พักงาน/ออก'}
          </Badge>
        );
      case 'base_salary':
        const sal = Number(driver.base_salary || 0);
        return (
          <button
            type="button"
            onClick={() => {
              setSelectedSalaryDriver(driver);
              setIsSalaryModalOpen(true);
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontWeight: 700,
              color: sal > 0 ? '#1e40af' : '#94a3b8',
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'right'
            }}
            title="คลิกเพื่อแก้ไขฐานเงินเดือน"
          >
            {sal > 0 ? `฿${sal.toLocaleString()} ✏️` : '0 ฿ ✏️'}
          </button>
        );
      case 'tax_profile':
        return (
          <button
            type="button"
            onClick={() => {
              setSelectedSalaryDriver(driver);
              setIsSalaryModalOpen(true);
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: '12px',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            title="คลิกเพื่อแก้ไขรูปแบบหัก"
          >
            {driver.tax_profile === 'social_security' && (
              <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#ecfdf5', color: '#059669', fontSize: '11.5px', fontWeight: 700 }}>
                🏥 ประกันสังคม (สปส.)
              </span>
            )}
            {driver.tax_profile === 'withholding_3pct' && (
              <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#fffbeb', color: '#d97706', fontSize: '11.5px', fontWeight: 700 }}>
                📑 หัก ณ ที่จ่าย 3%
              </span>
            )}
            {driver.tax_profile === 'none' && (
              <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#f1f5f9', color: '#64748b', fontSize: '11.5px', fontWeight: 600 }}>
                ⚪ ไม่หักภาษี (รับเต็ม)
              </span>
            )}
          </button>
        );
      case 'social_security_amount':
        return driver.tax_profile === 'social_security' ? (
          <span style={{ fontWeight: 700, color: '#dc2626', fontSize: '12.5px' }}>
            -฿{Number(driver.social_security_amount || 875).toLocaleString()}
          </span>
        ) : (
          <span style={{ color: '#cbd5e1' }}>-</span>
        );
      case 'remark':
        return <span style={{ color: '#64748b', fontSize: '12px' }}>{driver.remark && driver.remark !== '-' ? driver.remark : '-'}</span>;
      case 'actions':
        return (
          <button
            type="button"
            onClick={() => {
              setSelectedSalaryDriver(driver);
              setIsSalaryModalOpen(true);
            }}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #bfdbfe',
              background: '#eff6ff',
              color: '#1d4ed8',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            ✏️ ตั้งค่า
          </button>
        );
      default:
        return driver[col] || '-';
    }
  };

  // Render Advances & Loans Cell (Tab 3)
  const renderAdvanceCell = (col, adv, idx) => {
    const typeMeta = ADVANCE_TYPES[adv.advance_type] || ADVANCE_TYPES.other;
    const isLoan = adv.category === 'installment_loan' || adv.advance_type === 'loan_installment';
    switch (col) {
      case 'index':
        return <span style={{ color: '#94a3b8', fontSize: '12px' }}>{idx + 1}</span>;
      case 'advance_date':
        return <span style={{ fontWeight: 600, color: '#334155', fontSize: '12.5px' }}>{formatDateDisplay(adv.advance_date)}</span>;
      case 'driver_name':
        return <span style={{ fontWeight: 700, color: '#0f172a' }}>{adv.driver_name}</span>;
      case 'advance_type':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '6px',
            background: typeMeta.bg,
            color: typeMeta.color,
            fontSize: '11.5px',
            fontWeight: 700
          }}>
            <span>{typeMeta.icon}</span>
            <span>{typeMeta.label}</span>
          </span>
        );
      case 'amount':
        return (
          <span style={{ fontWeight: 800, color: isLoan ? '#7c3aed' : '#b45309', fontSize: '13px' }}>
            ฿{Number(adv.amount || 0).toLocaleString()}
          </span>
        );
      case 'installment_info':
        if (isLoan) {
          const totalInst = adv.installments_total || 1;
          const paidInst = adv.installments_paid || 0;
          const instAmt = Number(adv.installment_amount) || Math.round(Number(adv.amount || 0) / totalInst);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <span style={{ fontWeight: 700, color: '#4c1d95', fontSize: '12px' }}>
                งวดละ ฿{instAmt.toLocaleString()}
              </span>
              <span style={{ color: '#6d28d9', fontSize: '11px' }}>
                ผ่อน {paidInst}/{totalInst} งวด (เริ่ม {adv.start_period || '-'})
              </span>
            </div>
          );
        }
        return (
          <span style={{
            padding: '2px 6px',
            borderRadius: '4px',
            background: '#f1f5f9',
            color: '#64748b',
            fontSize: '11px',
            fontWeight: 600
          }}>
            หักงวดเดียว
          </span>
        );
      case 'remaining_amount':
        if (isLoan) {
          const rem = Number(adv.remaining_amount !== undefined ? adv.remaining_amount : (adv.amount - (adv.installments_paid || 0) * (adv.installment_amount || 0)));
          return (
            <span style={{
              fontWeight: 800,
              color: rem > 0 ? '#b91c1c' : '#059669',
              fontSize: '12.5px'
            }}>
              ฿{rem.toLocaleString()}
            </span>
          );
        }
        return <span style={{ color: '#cbd5e1' }}>-</span>;
      case 'status':
        if (adv.status === 'settled') {
          return <Badge variant="success" size="sm">✅ {isLoan ? 'ผ่อนครบแล้ว' : 'หักในงวดแล้ว'}</Badge>;
        }
        if (isLoan && (adv.installments_paid || 0) > 0) {
          return <Badge variant="info" size="sm">🔄 กำลังผ่อน ({adv.installments_paid}/{adv.installments_total})</Badge>;
        }
        return <Badge variant="warning" size="sm">⏳ รอดึงหัก</Badge>;
      case 'slip_url':
        if (!adv.slip_url || adv.slip_url === '-') {
          return <span style={{ color: '#cbd5e1' }}>-</span>;
        }
        return (
          <button
            type="button"
            onClick={() => setPreviewSlipImage({ url: adv.slip_url, title: `สลิป: ${adv.driver_name} (฿${Number(adv.amount || 0).toLocaleString()})` })}
            title="คลิกเพื่อดูรูปภาพสลิป"
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#2563eb',
              borderRadius: '6px',
              padding: '2px 8px',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>📎</span>
            <span>ดูสลิป</span>
          </button>
        );
      case 'remark':
        return <span style={{ color: '#64748b', fontSize: '12px' }}>{adv.remark || '-'}</span>;
      case 'actions':
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              onClick={() => {
                setSelectedAdvanceRecord(adv);
                setAdvanceDefaultDriver(adv.driver_name);
                setIsAdvanceModalOpen(true);
              }}
              title="แก้ไข"
              style={{
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                borderRadius: '6px',
                padding: '3px 8px',
                cursor: 'pointer',
                fontSize: '11.5px'
              }}
            >
              ✏️
            </button>
            <button
              type="button"
              onClick={() => handleDeleteAdvance(adv.id)}
              title="ลบ"
              style={{
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#dc2626',
                borderRadius: '6px',
                padding: '3px 8px',
                cursor: 'pointer',
                fontSize: '11.5px'
              }}
            >
              🗑️
            </button>
          </div>
        );
      default:
        return adv[col] || '-';
    }
  };

  // Render Settlements Cell (Tab 4)
  const renderSettlementCell = (col, batch, idx) => {
    switch (col) {
      case 'index':
        return <span style={{ color: '#94a3b8', fontSize: '12px' }}>{idx + 1}</span>;
      case 'batch_no':
        return (
          <span style={{
            fontFamily: 'monospace',
            fontWeight: 700,
            color: '#0f172a',
            fontSize: '12px'
          }}>
            {batch.batch_no || '-'}
          </span>
        );
      case 'driver_name':
        return <span style={{ fontWeight: 700, color: '#0f172a' }}>{batch.driver_name}</span>;
      case 'period':
        return (
          <span style={{ color: '#475569', fontSize: '12px' }}>
            {formatDateDisplay(batch.period_start)} ถึง {formatDateDisplay(batch.period_end)}
          </span>
        );
      case 'total_containers':
        return (
          <span style={{ fontWeight: 700, color: '#059669' }}>
            {batch.total_containers || 0} ตู้
          </span>
        );
      case 'total_amount':
        return (
          <span style={{ fontWeight: 800, fontSize: '13px', color: '#16a34a' }}>
            ฿{Number(batch.total_amount || 0).toLocaleString()}
          </span>
        );
      case 'paid_at':
        return <span style={{ color: '#64748b', fontSize: '11.5px' }}>{formatDateDisplay(batch.paid_at)}</span>;
      case 'paid_by':
        return <span style={{ fontSize: '11.5px', color: '#475569' }}>{batch.paid_by || '-'}</span>;
      case 'note':
        return (
          <span title={batch.note} style={{ maxWidth: '200px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11.5px', color: '#64748b' }}>
            {batch.note || '-'}
          </span>
        );
      case 'status':
        return (
          <Badge variant={batch.status === 'paid' ? 'success' : 'secondary'} size="sm">
            {batch.status === 'paid' ? '✅ จ่ายแล้ว' : '🚫 ยกเลิก'}
          </Badge>
        );
      case 'actions':
        return batch.status === 'paid' ? (
          <button
            type="button"
            onClick={() => handleRollbackSettlement(batch)}
            style={{
              padding: '3px 8px',
              borderRadius: '6px',
              border: '1px solid #fecaca',
              background: '#fef2f2',
              color: '#dc2626',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ↩️ ยกเลิกงวด
          </button>
        ) : (
          <span style={{ color: '#94a3b8', fontSize: '11px' }}>-</span>
        );
      default:
        return batch[col] || '-';
    }
  };

  // Render Rate Cell (Tab 5)
  const renderRateCell = (col, cfg, idx) => {
    switch (col) {
      case 'index':
        return <span style={{ color: '#94a3b8', fontSize: '12px' }}>{idx + 1}</span>;
      case 'name':
        return <span style={{ fontWeight: 700, color: '#0f172a' }}>{cfg.name}</span>;
      case 'driver_name':
        return (
          <span style={{
            padding: '2px 8px',
            borderRadius: '6px',
            background: cfg.driver_name === 'ALL' ? '#eff6ff' : '#fef3c7',
            color: cfg.driver_name === 'ALL' ? '#1d4ed8' : '#b45309',
            fontSize: '11.5px',
            fontWeight: 700
          }}>
            {cfg.driver_name === 'ALL' ? '🌐 ทุกคน' : cfg.driver_name}
          </span>
        );
      case 'start_date':
        return <span style={{ color: '#0f172a', fontWeight: 600 }}>{formatDateDisplay(cfg.start_date)}</span>;
      case 'end_date':
        return cfg.end_date ? (
          <span style={{ color: '#0f172a', fontWeight: 600 }}>{formatDateDisplay(cfg.end_date)}</span>
        ) : (
          <span style={{
            padding: '2px 8px',
            borderRadius: '6px',
            background: '#dcfce7',
            color: '#15803d',
            fontSize: '11px',
            fontWeight: 700
          }}>
            🟢 ถึงปัจจุบัน
          </span>
        );
      case 'rate_20':
        return <span style={{ fontWeight: 700, color: '#2563eb' }}>฿{(cfg.rate_20 ?? 100).toLocaleString()}</span>;
      case 'rate_40':
        return <span style={{ fontWeight: 700, color: '#d97706' }}>฿{(cfg.rate_40 ?? 100).toLocaleString()}</span>;
      case 'rate_45':
        return <span style={{ fontWeight: 700, color: '#16a34a' }}>฿{(cfg.rate_45 ?? 100).toLocaleString()}</span>;
      case 'is_active':
        return (
          <Badge variant={cfg.is_active !== false ? 'success' : 'secondary'} size="sm">
            {cfg.is_active !== false ? 'Active' : 'Inactive'}
          </Badge>
        );
      case 'remark':
        return <span style={{ color: '#64748b', fontSize: '12px' }}>{cfg.remark || '-'}</span>;
      case 'actions':
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              onClick={() => {
                setEditingRateConfig(cfg);
                setIsRateModalOpen(true);
              }}
              title="แก้ไข"
              style={{
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                borderRadius: '6px',
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              ✏️
            </button>
          </div>
        );
      default:
        return cfg[col] || '-';
    }
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#f8fafc',
      overflow: 'hidden'
    }}>
      {/* 🧭 Top Hub Tab Bar */}
      <div style={{
        padding: '14px 28px 0 28px',
        flexShrink: 0,
        background: '#f8fafc'
      }}>
        <HubTabBar
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 28px 20px 28px', overflowY: 'auto' }}>
        
        {/* ========================================================================= */}
        {/* TAB 1: 📦 สรุปค่ารอบตู้ & เงินพิเศษ (Trip Earnings Summary) */}
        {/* ========================================================================= */}
        {activeTab === 'trips' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
            
            {/* KPI Summary Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '12px'
            }}>
              <KpiCard
                title="💰 รวมรับสุทธิ (ค่ารอบ+เงินพิเศษ)"
                value={`฿${((payrollData.kpis.total_earnings || 0) + (payrollData.kpis.total_bonus || 0)).toLocaleString()}`}
                unit=""
                theme="emerald"
                subtext={`ค่ารอบ ฿${(payrollData.kpis.total_earnings || 0).toLocaleString()} + เงินพิเศษ ฿${(payrollData.kpis.total_bonus || 0).toLocaleString()}`}
              />
              <KpiCard
                title="💵 รวมค่ารอบวิ่งงาน"
                value={`฿${(payrollData.kpis.total_earnings || 0).toLocaleString()}`}
                unit=""
                theme="blue"
                subtext={`ตู้ 20' (฿${(payrollData.kpis.earnings_20 || 0).toLocaleString()}) • ตู้ 40' (฿${(payrollData.kpis.earnings_40 || 0).toLocaleString()})`}
              />
              <KpiCard
                title="🎁 รวมเงินพิเศษ (Incentive)"
                value={`฿${(payrollData.kpis.total_bonus || 0).toLocaleString()}`}
                unit=""
                theme="amber"
                subtext="เกณฑ์ขั้นบันได (150 ตู้ขึ้นไป)"
              />
              <KpiCard
                title="🟢 ตู้ที่ตรวจเสร็จแล้ว"
                value={(payrollData.kpis.total_containers || 0).toLocaleString()}
                unit="ตู้"
                theme="emerald"
                subtext={`ตู้ 20 ฟุต (${payrollData.kpis.count_20 || 0}) • ตู้ 40 ฟุต (${payrollData.kpis.count_40 || 0})`}
              />
              <KpiCard
                title="⏳ งานรอตรวจสอบ (Pending)"
                value={(payrollData.kpis.total_pending || 0).toLocaleString()}
                unit="ตู้"
                theme="amber"
                subtext="ตู้ในคิวสแกน & ตู้แดงค้างตรวจ"
              />
            </div>

            {/* Filter Toolbar */}
            <div style={{
              background: '#ffffff',
              padding: '14px 18px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {/* Row 1: Search, Date Presets, Payment Status, Column Selector, Export */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
                  {/* ช่องค้นหา */}
                  <div style={{ position: 'relative', width: '280px' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      placeholder="ค้นหาคนขับ, ทะเบียนรถ..."
                      style={{
                        width: '100%',
                        height: '36px',
                        paddingLeft: '32px',
                        paddingRight: searchTerm ? '28px' : '10px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12.5px',
                        color: '#0f172a',
                        outline: 'none',
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
                          fontSize: '12px'
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* 📅 Month Filter */}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <MonthPicker
                      value={selectedMonth === 'ALL' ? '' : selectedMonth}
                      onChange={(newMonth) => {
                        setSelectedMonth(newMonth);
                        setDatePreset('CUSTOM');
                      }}
                      label="เดือน:"
                    />
                    {selectedMonth !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMonth('ALL');
                          setDateFrom('');
                          setDateTo('');
                          setDatePreset('ALL');
                        }}
                        style={{
                          height: '35px',
                          padding: '0 8px',
                          borderRadius: '7px',
                          border: '1px solid #bfdbfe',
                          background: '#eff6ff',
                          color: '#2563eb',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                        title="ดูทุกเดือน"
                      >
                        ทุกเดือน
                      </button>
                    )}
                  </div>
                </div>

                {/* Right side controls: Column Visibility, Export */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ColumnVisibilityDropdown preferences={summaryPrefs} />

                  <button
                    type="button"
                    onClick={handleExportPayrollExcel}
                    style={{
                      height: '36px',
                      padding: '0 14px',
                      borderRadius: '8px',
                      border: '1px solid #bbf7d0',
                      background: '#f0fdf4',
                      color: '#16a34a',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    📥 ส่งออกสรุป Excel
                  </button>
                </div>
              </div>

              {/* Row 2: Secondary Filters (Batch, Truck, Driver, Payment status) */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                paddingTop: '10px',
                borderTop: '1px solid #f1f5f9',
                flexWrap: 'wrap',
                fontSize: '12.5px',
                color: '#475569'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 600, color: '#334155' }}>คนขับ:</span>
                  <select
                    value={selectedDriverFilter}
                    onChange={e => setSelectedDriverFilter(e.target.value)}
                    style={{
                      height: '30px',
                      padding: '0 8px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      background: '#ffffff'
                    }}
                  >
                    <option value="ALL">ทุกคน ({driverList.length})</option>
                    {driverList.map(d => (
                      <option key={d.driver_name} value={d.driver_name}>{d.driver_name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 600, color: '#334155' }}>ชุดงาน (Batch):</span>
                  <select
                    value={selectedBatchFilter}
                    onChange={e => setSelectedBatchFilter(e.target.value)}
                    style={{
                      height: '30px',
                      padding: '0 8px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      background: '#ffffff'
                    }}
                  >
                    <option value="ALL">ทุกชุดงาน ({availableBatches.length})</option>
                    {availableBatches.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 600, color: '#334155' }}>เบอร์รถ:</span>
                  <select
                    value={selectedTruckFilter}
                    onChange={e => setSelectedTruckFilter(e.target.value)}
                    style={{
                      height: '30px',
                      padding: '0 8px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      background: '#ffffff'
                    }}
                  >
                    <option value="ALL">ทุกคัน</option>
                    {availableTrucks.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 📦 Universal Table for Payroll Summary */}
            <UniversalTableContainer preferences={summaryPrefs}>
              <UniversalTableHeader
                preferences={summaryPrefs}
                data={displayedDrivers}
                alignMap={SUMMARY_ALIGN_MAP}
                defaultWidths={DEFAULT_SUMMARY_WIDTHS}
              />
              <tbody>
                {displayedDrivers.map((driver, idx) => (
                  <tr
                    key={driver.driver_name}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: idx % 2 === 0 ? '#ffffff' : '#fafafa'
                    }}
                  >
                    {summaryPrefs.activeColumns.map(col => (
                      <td
                        key={col}
                        style={{
                          padding: '8px 10px',
                          textAlign: SUMMARY_ALIGN_MAP[col] || 'left',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {renderSummaryCell(col, driver, idx)}
                      </td>
                    ))}
                  </tr>
                ))}

                {displayedDrivers.length === 0 && (
                  <tr>
                    <td
                      colSpan={summaryPrefs.activeColumns.length || 12}
                      style={{ padding: '48px 20px', textAlign: 'center', color: '#94a3b8' }}
                    >
                      {isLoading ? '⏳ กำลังคำนวณยอดค่าตอบแทน...' : 'ไม่พบข้อมูลการวิ่งงานหรือคนขับตามเงื่อนไขที่เลือก'}
                    </td>
                  </tr>
                )}
              </tbody>
            </UniversalTableContainer>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: 💵 ตั้งค่าเงินเดือน & เงินหัก (Driver Salary & Deductions Settings) */}
        {/* ========================================================================= */}
        {activeTab === 'salary_config' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
            
            {/* KPI Cards for Salary & Tax Configuration */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px'
            }}>
              <KpiCard
                title="👥 พนักงานขับรถในระบบ"
                value={enrichedSalaryDrivers.length.toLocaleString()}
                unit="คน"
                theme="blue"
                subtext={`ปฏิบัติงาน ${enrichedSalaryDrivers.filter(d => d.status === 'active').length} คน • ลา/พัก ${enrichedSalaryDrivers.filter(d => d.status !== 'active').length} คน`}
              />
              <KpiCard
                title="💵 รวมฐานเงินเดือนประจำ"
                value={`฿${enrichedSalaryDrivers.reduce((sum, d) => sum + Number(d.base_salary || 0), 0).toLocaleString()}`}
                unit=""
                theme="indigo"
                subtext={`มีฐานเงินเดือน ${enrichedSalaryDrivers.filter(d => Number(d.base_salary || 0) > 0).length} คน`}
              />
              <KpiCard
                title="🏥 มีประกันสังคม (สปส.)"
                value={enrichedSalaryDrivers.filter(d => d.tax_profile === 'social_security').length.toLocaleString()}
                unit="คน"
                theme="emerald"
                subtext="หักประกันสังคมเข้ากองทุน"
              />
              <KpiCard
                title="📑 หักภาษี ณ ที่จ่าย 3%"
                value={enrichedSalaryDrivers.filter(d => d.tax_profile === 'withholding_3pct').length.toLocaleString()}
                unit="คน"
                theme="amber"
                subtext="หักภาษี 3% รายคน"
              />
              <KpiCard
                title="⚪ ไม่หักภาษี/สปส."
                value={enrichedSalaryDrivers.filter(d => d.tax_profile === 'none').length.toLocaleString()}
                unit="คน"
                theme="purple"
                subtext="รับเงินค่าตอบแทนเต็มจำนวน"
              />
            </div>

            {/* Salary Config Filter Toolbar */}
            <div style={{
              background: '#ffffff',
              padding: '14px 18px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSalaryDriver(null);
                    setIsSalaryModalOpen(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: '36px',
                    padding: '0 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
                  }}
                >
                  ➕ ตั้งค่าเงินเดือนคนขับ
                </button>

                <div style={{ position: 'relative', width: '220px' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
                  <input
                    type="text"
                    value={salarySearchTerm}
                    onChange={e => setSalarySearchTerm(e.target.value)}
                    placeholder="ค้นหาคนขับ, เบอร์รถ..."
                    style={{
                      width: '100%',
                      height: '36px',
                      paddingLeft: '32px',
                      paddingRight: salarySearchTerm ? '28px' : '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12.5px',
                      color: '#0f172a',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  {salarySearchTerm && (
                    <button
                      type="button"
                      onClick={() => setSalarySearchTerm('')}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 600, color: '#334155', fontSize: '12px' }}>สถานะ:</span>
                  <select
                    value={salaryStatusFilter}
                    onChange={e => setSalaryStatusFilter(e.target.value)}
                    style={{
                      height: '34px',
                      padding: '0 8px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      background: '#ffffff'
                    }}
                  >
                    <option value="ALL">ทุกสถานะ</option>
                    <option value="active">🟢 ปฏิบัติงาน</option>
                    <option value="leave">🟡 ลางาน</option>
                    <option value="inactive">⚪ พักงาน/ลาออก</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 600, color: '#334155', fontSize: '12px' }}>รูปแบบการหัก:</span>
                  <select
                    value={salaryTaxFilter}
                    onChange={e => setSalaryTaxFilter(e.target.value)}
                    style={{
                      height: '34px',
                      padding: '0 8px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      background: '#ffffff'
                    }}
                  >
                    <option value="ALL">ทั้งหมด</option>
                    <option value="social_security">🏥 มีประกันสังคม (สปส.)</option>
                    <option value="withholding_3pct">📑 หัก ณ ที่จ่าย 3%</option>
                    <option value="none">⚪ ไม่หักภาษี</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ColumnVisibilityDropdown preferences={salaryConfigPrefs} />
                <button
                  type="button"
                  onClick={handleExportSalaryConfigExcel}
                  style={{
                    height: '36px',
                    padding: '0 14px',
                    borderRadius: '8px',
                    border: '1px solid #bbf7d0',
                    background: '#f0fdf4',
                    color: '#16a34a',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  📥 ส่งออก Excel
                </button>
              </div>
            </div>

            {/* 📦 Universal Table for Salary Configurations */}
            <UniversalTableContainer preferences={salaryConfigPrefs}>
              <UniversalTableHeader
                preferences={salaryConfigPrefs}
                data={displayedSalaryDrivers}
                alignMap={SALARY_CONFIG_ALIGN_MAP}
                defaultWidths={DEFAULT_SALARY_CONFIG_WIDTHS}
              />
              <tbody>
                {displayedSalaryDrivers.map((driver, idx) => (
                  <tr
                    key={driver.id || driver.driver_name}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: idx % 2 === 0 ? '#ffffff' : '#fafafa'
                    }}
                  >
                    {salaryConfigPrefs.activeColumns.map(col => (
                      <td
                        key={col}
                        style={{
                          padding: '8px 10px',
                          textAlign: SALARY_CONFIG_ALIGN_MAP[col] || 'left',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {renderSalaryConfigCell(col, driver, idx)}
                      </td>
                    ))}
                  </tr>
                ))}

                {displayedSalaryDrivers.length === 0 && (
                  <tr>
                    <td
                      colSpan={salaryConfigPrefs.activeColumns.length || 9}
                      style={{ padding: '48px 20px', textAlign: 'center', color: '#94a3b8' }}
                    >
                      ไม่พบข้อมูลคนขับตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                )}
              </tbody>
            </UniversalTableContainer>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: 💸 รายการเบิกล่วงหน้า (Driver Advances Hub) */}
        {/* ========================================================================= */}
        {activeTab === 'advances' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
            
            {/* Advances KPI Summary Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px'
            }}>
              <KpiCard
                title="💸 รวมยอดเบิก / เงินยืมทั้งหมด"
                value={`฿${advancesList.reduce((sum, a) => sum + Number(a.amount || 0), 0).toLocaleString()}`}
                unit=""
                theme="amber"
                subtext={`ทั้งหมด ${advancesList.length} รายการ`}
              />
              <KpiCard
                title="🏦 หนี้เงินยืมคงเหลือ (Active Loans)"
                value={`฿${advancesList.filter(a => (a.category === 'installment_loan' || a.advance_type === 'loan_installment') && a.status !== 'settled').reduce((sum, a) => sum + Number(a.remaining_amount !== undefined ? a.remaining_amount : Math.max(0, a.amount - (a.installments_paid || 0) * (a.installment_amount || Math.round(a.amount / (a.installments_total || 1))))), 0).toLocaleString()}`}
                unit=""
                theme="indigo"
                subtext={`${advancesList.filter(a => (a.category === 'installment_loan' || a.advance_type === 'loan_installment') && a.status !== 'settled').length} สัญญาที่กำลังผ่อน`}
              />
              <KpiCard
                title="⏳ รอดึงหัก / กำลังผ่อนชำระ"
                value={`฿${advancesList.filter(a => a.status !== 'settled').reduce((sum, a) => sum + Number(a.category === 'installment_loan' ? (a.installment_amount || a.amount) : a.amount || 0), 0).toLocaleString()}`}
                unit=""
                theme="rose"
                subtext={`${advancesList.filter(a => a.status !== 'settled').length} รายการค้างหัก`}
              />
              <KpiCard
                title="✅ หักในงวดครบแล้ว (Settled)"
                value={`฿${advancesList.filter(a => a.status === 'settled').reduce((sum, a) => sum + Number(a.amount || 0), 0).toLocaleString()}`}
                unit=""
                theme="emerald"
                subtext={`${advancesList.filter(a => a.status === 'settled').length} รายการตัดจ่ายแล้ว`}
              />
            </div>

            {/* Advances Filter & Actions Toolbar */}
            <div style={{
              background: '#ffffff',
              padding: '14px 18px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAdvanceRecord(null);
                    setAdvanceDefaultDriver('');
                    setIsAdvanceModalOpen(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: '36px',
                    padding: '0 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(217, 119, 6, 0.2)'
                  }}
                >
                  ➕ บันทึกเบิกเงิน / เงินยืม
                </button>

                <div style={{ position: 'relative', width: '220px' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
                  <input
                    type="text"
                    value={advanceSearchTerm}
                    onChange={e => setAdvanceSearchTerm(e.target.value)}
                    placeholder="ค้นหาคนขับ, หมายเหตุ..."
                    style={{
                      width: '100%',
                      height: '36px',
                      paddingLeft: '32px',
                      paddingRight: advanceSearchTerm ? '28px' : '10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12.5px',
                      color: '#0f172a',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  {advanceSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setAdvanceSearchTerm('')}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 600, color: '#334155', fontSize: '12px' }}>คนขับ:</span>
                  <select
                    value={advanceDriverFilter}
                    onChange={e => setAdvanceDriverFilter(e.target.value)}
                    style={{
                      height: '34px',
                      padding: '0 8px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      background: '#ffffff'
                    }}
                  >
                    <option value="ALL">ทุกคน</option>
                    {driverList.map(d => (
                      <option key={d.driver_name} value={d.driver_name}>{d.driver_name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 600, color: '#334155', fontSize: '12px' }}>รูปแบบ:</span>
                  <select
                    value={advanceCategoryFilter}
                    onChange={e => setAdvanceCategoryFilter(e.target.value)}
                    style={{
                      height: '34px',
                      padding: '0 8px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      background: '#ffffff'
                    }}
                  >
                    <option value="ALL">ทั้งหมด</option>
                    <option value="single_advance">💵 เบิกล่วงหน้า (หักงวดเดียว)</option>
                    <option value="installment_loan">🏦 ยืมเงินก้อน (ผ่อนชำระ)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 600, color: '#334155', fontSize: '12px' }}>สถานะ:</span>
                  <select
                    value={advanceStatusFilter}
                    onChange={e => setAdvanceStatusFilter(e.target.value)}
                    style={{
                      height: '34px',
                      padding: '0 8px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      background: '#ffffff'
                    }}
                  >
                    <option value="ALL">ทั้งหมด</option>
                    <option value="pending">⏳ รอดึงหัก</option>
                    <option value="in_progress">🔄 กำลังผ่อนชำระ</option>
                    <option value="settled">✅ หักครบแล้ว</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ColumnVisibilityDropdown preferences={advancesPrefs} />
                <button
                  type="button"
                  onClick={handleExportAdvancesExcel}
                  style={{
                    height: '36px',
                    padding: '0 14px',
                    borderRadius: '8px',
                    border: '1px solid #bbf7d0',
                    background: '#f0fdf4',
                    color: '#16a34a',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  📥 ส่งออก Excel
                </button>
              </div>
            </div>

            {/* 📦 Universal Table for Advances */}
            <UniversalTableContainer preferences={advancesPrefs}>
              <UniversalTableHeader
                preferences={advancesPrefs}
                data={displayedAdvances}
                alignMap={ADVANCE_ALIGN_MAP}
                defaultWidths={DEFAULT_ADVANCE_WIDTHS}
              />
              <tbody>
                {displayedAdvances.map((adv, idx) => (
                  <tr
                    key={adv.id || idx}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: idx % 2 === 0 ? '#ffffff' : '#fafafa'
                    }}
                  >
                    {advancesPrefs.activeColumns.map(col => (
                      <td
                        key={col}
                        style={{
                          padding: '8px 10px',
                          textAlign: ADVANCE_ALIGN_MAP[col] || 'left',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {renderAdvanceCell(col, adv, idx)}
                      </td>
                    ))}
                  </tr>
                ))}

                {displayedAdvances.length === 0 && (
                  <tr>
                    <td
                      colSpan={advancesPrefs.activeColumns.length || 9}
                      style={{ padding: '48px 20px', textAlign: 'center', color: '#94a3b8' }}
                    >
                      {advancesLoading ? '⏳ กำลังโหลดรายการเบิกล่วงหน้า...' : 'ไม่พบรายการเบิกล่วงหน้า'}
                    </td>
                  </tr>
                )}
              </tbody>
            </UniversalTableContainer>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: 📜 ประวัติการตัดจ่ายเงิน (Payment Settlement Batches) */}
        {/* ========================================================================= */}
        {activeTab === 'settlements' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
            
            {/* Settlements Header Toolbar */}
            <div style={{
              background: '#ffffff',
              padding: '14px 20px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  📜 ประวัติการตัดจ่ายเงินคนขับ (Payment Batches)
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  บันทึกประวัติการตัดจ่ายเงินค่ารอบทั้งหมด พร้อมระบบยกเลิกงวดหากต้องการแก้ไข
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ColumnVisibilityDropdown preferences={settlementsPrefs} />
              </div>
            </div>

            {/* 📦 Universal Table for Settlements */}
            <UniversalTableContainer preferences={settlementsPrefs}>
              <UniversalTableHeader
                preferences={settlementsPrefs}
                data={displayedSettlements}
                alignMap={SETTLEMENT_ALIGN_MAP}
                defaultWidths={DEFAULT_SETTLEMENT_WIDTHS}
              />
              <tbody>
                {displayedSettlements.map((batch, idx) => (
                  <tr
                    key={batch.id || idx}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: idx % 2 === 0 ? '#ffffff' : '#fafafa'
                    }}
                  >
                    {settlementsPrefs.activeColumns.map(col => (
                      <td
                        key={col}
                        style={{
                          padding: '8px 10px',
                          textAlign: SETTLEMENT_ALIGN_MAP[col] || 'left',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {renderSettlementCell(col, batch, idx)}
                      </td>
                    ))}
                  </tr>
                ))}

                {displayedSettlements.length === 0 && (
                  <tr>
                    <td
                      colSpan={settlementsPrefs.activeColumns.length || 10}
                      style={{ padding: '48px 20px', textAlign: 'center', color: '#94a3b8' }}
                    >
                      {settlementsLoading ? '⏳ กำลังโหลดประวัติการตัดรอบ...' : 'ยังไม่มีประวัติการตัดรอบ'}
                    </td>
                  </tr>
                )}
              </tbody>
            </UniversalTableContainer>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: ⚙️ ตั้งค่าเรท & เงินพิเศษ & เงินเดือนกลาง (Rates & Policies Configuration) */}
        {/* ========================================================================= */}
        {activeTab === 'rates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', flex: 1 }}>
            
            {/* 🎁 Section 1: เกณฑ์เงินพิเศษตามจำนวนงาน (Compact Banner & Step Ladder) */}
            <div style={{
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🎁</span> เกณฑ์เงินพิเศษตามจำนวนงาน (Incentive Tiers)
                    </h3>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: '#dcfce7',
                      color: '#15803d',
                      fontSize: '11px',
                      fontWeight: 700
                    }}>
                      🟢 ใช้งานอยู่
                    </span>
                  </div>
                  <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    คิดจากจำนวนงานที่คนขับทำได้จริงในแต่ละงวด • เกินขั้นสูงสุดคิดเพิ่มทุกๆ {incentiveConfigs[0]?.step_trips || 10} งาน = +{Number(incentiveConfigs[0]?.step_bonus || 1000).toLocaleString()} ฿
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const activeCfg = incentiveConfigs.find(c => c.is_active) || incentiveConfigs[0] || null;
                    setEditingIncConfig(activeCfg);
                    setIsIncModalOpen(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: '34px',
                    padding: '0 14px',
                    borderRadius: '8px',
                    border: '1px solid #a7f3d0',
                    background: '#f0fdf4',
                    color: '#059669',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(16, 185, 129, 0.1)'
                  }}
                >
                  ⚙️ ปรับแต่งตารางเงินพิเศษ
                </button>
              </div>

              {/* Compact Ladder Badges Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: '8px'
              }}>
                {(incentiveConfigs[0]?.tiers || [
                  { minTrips: 150, bonus: 1000 },
                  { minTrips: 160, bonus: 2000 },
                  { minTrips: 170, bonus: 3000 },
                  { minTrips: 180, bonus: 4000 },
                  { minTrips: 190, bonus: 5000 },
                  { minTrips: 200, bonus: 6000 },
                  { minTrips: 210, bonus: 7000 },
                  { minTrips: 220, bonus: 8000 },
                  { minTrips: 230, bonus: 9000 }
                ]).map((t, tIdx) => (
                  <div
                    key={tIdx}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '4px'
                    }}
                  >
                    <div style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>
                      ≥ <b>{t.minTrips}</b> งาน
                    </div>
                    <div style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: '#ecfdf5',
                      color: '#059669',
                      fontSize: '12.5px',
                      fontWeight: 800
                    }}>
                      +{Number(t.bonus).toLocaleString()} ฿
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 🏥 Section 2: ตั้งค่าอัตราประกันสังคม & ภาษีส่วนกลาง */}
            <div style={{
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '16px 20px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🏥</span> ตั้งค่าอัตราประกันสังคม & ภาษีส่วนกลาง (Global Tax & SSO Defaults)
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    กำหนดค่ายอดหักประกันสังคมมาตรฐานและอัตราภาษี 3% ที่จะใช้เป็นค่าเริ่มต้นสำหรับคนขับทุกคน (แก้ไขได้เองตลอดเวลาโดยไม่ต้องแก้โค้ด)
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveTaxConfig} style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    🏥 อัตราประกันสังคมมาตรฐาน (บาท/เดือน)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editingTaxConfig.default_sso_amount}
                    onChange={e => setEditingTaxConfig({ ...editingTaxConfig, default_sso_amount: Number(e.target.value) })}
                    style={{
                      width: '180px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#1e40af'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    📑 อัตราภาษีหัก ณ ที่จ่าย (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={editingTaxConfig.default_wht_pct}
                    onChange={e => setEditingTaxConfig({ ...editingTaxConfig, default_wht_pct: Number(e.target.value) })}
                    style={{
                      width: '140px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#d97706'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: '36px',
                    padding: '0 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(37, 99, 235, 0.2)'
                  }}
                >
                  💾 บันทึกอัตราส่วนกลาง
                </button>
              </form>
            </div>

            {/* ⚙️ Section 3: เรทราคาตามช่วงเวลาและขนาดตู้ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Header & Actions Toolbar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#ffffff',
                padding: '14px 20px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                    ⚙️ ตารางกำหนดอัตราค่ารอบคนขับตามช่วงเวลา
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                    ระบบจะนำเรทราคาในช่วงเวลาที่ตรงกับ <b>"วันที่ในใบวางบิล Master DB"</b> มาคำนวณยอดเงินตามขนาดตู้ (20', 40', อื่นๆ)
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ColumnVisibilityDropdown preferences={ratesPrefs} />

                  <button
                    type="button"
                    onClick={() => {
                      setEditingRateConfig(null);
                      setIsRateModalOpen(true);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      height: '36px',
                      padding: '0 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      color: '#ffffff',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
                    }}
                  >
                    ➕ เพิ่มช่วงเวลาและราคา
                  </button>
                </div>
              </div>

              {/* 📦 Universal Table for Rates */}
              <UniversalTableContainer preferences={ratesPrefs}>
                <UniversalTableHeader
                  preferences={ratesPrefs}
                  data={displayedRates}
                  alignMap={RATES_ALIGN_MAP}
                  defaultWidths={DEFAULT_RATES_WIDTHS}
                />
                <tbody>
                  {displayedRates.map((cfg, idx) => (
                    <tr
                      key={cfg.id || idx}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: idx % 2 === 0 ? '#ffffff' : '#fafafa'
                      }}
                    >
                      {ratesPrefs.activeColumns.map(col => (
                        <td
                          key={col}
                          style={{
                            padding: '8px 10px',
                            textAlign: RATES_ALIGN_MAP[col] || 'left',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {renderRateCell(col, cfg, idx)}
                        </td>
                      ))}
                    </tr>
                  ))}

                  {displayedRates.length === 0 && (
                    <tr>
                      <td
                        colSpan={ratesPrefs.activeColumns.length || 11}
                        style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}
                      >
                        ยังไม่มีการกำหนดเรทราคา (ระบบจะใช้เรทเริ่มต้น 100 บาท/ตู้)
                      </td>
                    </tr>
                  )}
                </tbody>
              </UniversalTableContainer>
            </div>
          </div>
        )}
      </div>

      {/* 🪟 Modals */}
      <RateConfigModal
        isOpen={isRateModalOpen}
        onClose={() => setIsRateModalOpen(false)}
        onSave={handleSaveRateConfig}
        config={editingRateConfig}
        driverList={driverList}
      />

      <IncentiveConfigModal
        isOpen={isIncModalOpen}
        onClose={() => setIsIncModalOpen(false)}
        onSave={async (cfgData) => {
          await driverPayrollService.saveIncentiveConfig(cfgData);
          reloadData();
          setIsIncModalOpen(false);
        }}
        config={editingIncConfig}
      />

      <DriverPayrollDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        driverSummary={selectedDriverDetail}
        dateRangeText={(dateFrom && dateTo) ? `${formatDateDisplay(dateFrom)} ถึง ${formatDateDisplay(dateTo)}` : 'ทั้งหมด'}
        onOpenSettlementModal={(driver) => {
          setIsDetailModalOpen(false);
          setSettlementDriverSummary(driver);
          setIsSettlementModalOpen(true);
        }}
        onOpenDriverEdit={(dName) => {
          setIsDetailModalOpen(false);
          handleOpenDriverEdit(dName);
        }}
      />

      <PaymentSettlementModal
        isOpen={isSettlementModalOpen}
        onClose={() => {
          setIsSettlementModalOpen(false);
          setSettlementDriverSummary(null);
        }}
        driverSummary={settlementDriverSummary}
        dateRange={{ start: dateFrom, end: dateTo }}
        onSuccess={() => {
          alert('บันทึกการตัดรอบเรียบร้อยแล้ว!');
          reloadData();
          if (activeTab === 'settlements') loadSettlements();
        }}
      />

      <DriverAdvanceModal
        isOpen={isAdvanceModalOpen}
        onClose={() => {
          setIsAdvanceModalOpen(false);
          setSelectedAdvanceRecord(null);
        }}
        onSave={handleSaveAdvance}
        driverList={driverList}
        defaultDriverName={advanceDefaultDriver}
        advanceRecord={selectedAdvanceRecord}
      />

      <DriverSalaryConfigModal
        isOpen={isSalaryModalOpen}
        onClose={() => {
          setIsSalaryModalOpen(false);
          setSelectedSalaryDriver(null);
        }}
        onSave={handleSaveSalaryProfile}
        driverRecord={selectedSalaryDriver}
        driverList={driverList}
      />

      <DriverModal
        isOpen={isDriverModalOpen}
        onClose={() => {
          setIsDriverModalOpen(false);
          setEditingDriverRecord(null);
        }}
        onSave={handleSaveDriverProfile}
        driver={editingDriverRecord}
        truckList={availableTrucks.map(t => ({ truck_no: t }))}
      />

      {/* 🖼️ Slip Image Lightbox Modal */}
      {previewSlipImage && (
        <div
          onClick={() => setPreviewSlipImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{
              padding: '12px 18px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                🖼️ {previewSlipImage.title || 'หลักฐานสลิปโอนเงิน'}
              </span>
              <button
                type="button"
                onClick={() => setPreviewSlipImage(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#64748b',
                  padding: 0
                }}
              >
                ✕
              </button>
            </div>
            <div style={{
              padding: '16px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              background: '#0f172a',
              overflow: 'auto',
              maxHeight: '75vh'
            }}>
              <img
                src={previewSlipImage.url}
                alt="สลิปโอนเงิน"
                style={{
                  maxWidth: '100%',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                  borderRadius: '8px'
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
