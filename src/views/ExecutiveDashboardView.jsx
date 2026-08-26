import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient.js';
import { portBillingService, DEFAULT_PORT_RATES } from '../services/portBillingService.js';
import { truckExpenseService } from '../services/truckExpenseService.js';
import { fetchTrucks } from '../services/truckDriverService.js';
import { driverPayrollService } from '../services/driverPayrollService.js';
import { useColumnPreferences } from '../hooks/useColumnPreferences.js';
import UniversalTableContainer from '../components/ui/UniversalTableContainer.jsx';
import UniversalTableHeader from '../components/ui/UniversalTableHeader.jsx';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown.jsx';
import KpiCard from '../components/ui/KpiCard.jsx';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import { normalizeExcelDate } from '../utils/matchingLogic.js';
import * as XLSX from 'xlsx';

// =========================================================================
// 🎛️ Column Schema Specifications for Executive Leaderboard Table
// =========================================================================
const DEFAULT_EXEC_COLUMNS = [
  'index',
  'truck_no',
  'driver_name',
  'total_containers',
  'port_revenue',
  'driver_trip_fee',
  'driver_salary',
  'driver_bonus',
  'total_driver_cost',
  'fuel_cost',
  'cost_per_trip',
  'maintenance_cost',
  'toll_cost',
  'installment_cost',
  'misc_cost',
  'total_cost',
  'net_profit',
  'margin_pct',
  'actions'
];

const DEFAULT_EXEC_NAMES = {
  index: '#',
  truck_no: 'เบอร์รถ',
  driver_name: 'คนขับ',
  total_containers: 'จำนวนตู้',
  port_revenue: 'ค่าเที่ยวท่าเรือ',
  driver_trip_fee: 'ค่ารอบคนขับ',
  driver_salary: 'เงินเดือนคนขับ',
  driver_bonus: 'เงินพิเศษ',
  total_driver_cost: 'รวมต้นทุนคนขับ',
  fuel_cost: 'ค่าน้ำมัน',
  cost_per_trip: 'น้ำมัน/เที่ยว',
  maintenance_cost: 'ค่าซ่อมบำรุง',
  toll_cost: 'ผ่านทาง/ท่า',
  installment_cost: 'ค่างวดรถ',
  misc_cost: 'อื่นๆ',
  total_cost: 'รวมต้นทุนทั้งหมด',
  net_profit: 'กำไรสุทธิ',
  margin_pct: 'Margin (%)',
  actions: 'จัดการ'
};

const DEFAULT_EXEC_WIDTHS = {
  index: 45,
  truck_no: 110,
  driver_name: 160,
  total_containers: 95,
  port_revenue: 125,
  driver_trip_fee: 120,
  driver_salary: 110,
  driver_bonus: 105,
  total_driver_cost: 125,
  fuel_cost: 110,
  cost_per_trip: 110,
  maintenance_cost: 110,
  toll_cost: 105,
  installment_cost: 110,
  misc_cost: 95,
  total_cost: 135,
  net_profit: 125,
  margin_pct: 100,
  actions: 85
};

const EXEC_ALIGN_MAP = {
  index: 'center',
  truck_no: 'left',
  driver_name: 'left',
  total_containers: 'right',
  port_revenue: 'right',
  driver_trip_fee: 'right',
  driver_salary: 'right',
  driver_bonus: 'right',
  total_driver_cost: 'right',
  fuel_cost: 'right',
  cost_per_trip: 'right',
  maintenance_cost: 'right',
  toll_cost: 'right',
  installment_cost: 'right',
  misc_cost: 'right',
  total_cost: 'right',
  net_profit: 'right',
  margin_pct: 'right',
  actions: 'center'
};

export default function ExecutiveDashboardView() {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [masterContainers, setMasterContainers] = useState([]);
  const [payrollDrivers, setPayrollDrivers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [portRates, setPortRates] = useState(DEFAULT_PORT_RATES);
  const [selectedTruckDetail, setSelectedTruckDetail] = useState(null);

  // Table Filter Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [profitFilter, setProfitFilter] = useState('ALL'); // 'ALL' | 'PROFIT' | 'LOSS'

  // โหลดข้อมูลภาพรวมทั้งหมดจากฐานข้อมูลต่างๆ
  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      try {
        const [year, month] = selectedMonth.split('-');
        const lastDay = new Date(Number(year), Number(month), 0).getDate();
        const startOfMonth = `${selectedMonth}-01`;
        const endOfMonth = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

        const [
          ratesRes,
          expensesRes,
          trucksRes,
          masterRes,
          payrollRes
        ] = await Promise.all([
          portBillingService.fetchPortRates(),
          truckExpenseService.fetchExpenses(),
          fetchTrucks(),
          supabase.from('container_records').select('id, container_no, truck_no, port, size, date_job, date_job_parsed, batch_name').limit(20000),
          driverPayrollService.calculatePayrollSummary({
            dateFrom: startOfMonth,
            dateTo: endOfMonth,
            paymentStatusFilter: 'ALL'
          })
        ]);

        const ratesList = Array.isArray(ratesRes) ? ratesRes : (ratesRes?.data || []);
        const expensesList = Array.isArray(expensesRes) ? expensesRes : (expensesRes?.data || []);
        const trucksList = Array.isArray(trucksRes) ? trucksRes : (trucksRes?.data || []);
        const masterList = Array.isArray(masterRes?.data) ? masterRes.data : (Array.isArray(masterRes) ? masterRes : []);
        const driversList = Array.isArray(payrollRes?.data?.drivers) ? payrollRes.data.drivers : [];

        setPortRates(ratesList);
        setExpenses(expensesList);
        setTrucks(trucksList);
        setMasterContainers(masterList);
        setPayrollDrivers(driversList);
      } catch (err) {
        console.error('loadDashboardData error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [selectedMonth]);

  // กรองและรวมยอดตามงวดเดือนที่เลือก
  const metrics = useMemo(() => {
    const startOfMonth = `${selectedMonth}-01`;
    const endOfMonth = `${selectedMonth}-31`;

    const safeMaster = Array.isArray(masterContainers) ? masterContainers : [];
    const safePayroll = Array.isArray(payrollDrivers) ? payrollDrivers : [];
    const safeTrucks = Array.isArray(trucks) ? trucks : [];
    const safeExpenses = Array.isArray(expenses) ? expenses : [];

    // Helper ในการตรวจสอบว่าวันที่อยู่ในงวดเดือนหรือไม่
    const [selYear, selMonthNum] = selectedMonth.split('-');
    const monthIdx = parseInt(selMonthNum, 10) - 1;
    const monthNamesEn = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthNamesTh = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const monthEn = monthNamesEn[monthIdx] || '';
    const monthTh = monthNamesTh[monthIdx] || '';

    const checkDateInMonth = (rawVal) => {
      if (!rawVal && rawVal !== 0) return false;
      
      const num = Number(rawVal);
      if (!isNaN(num) && num > 30000 && num < 60000) {
        const d = new Date(Math.round((num - 25569) * 86400 * 1000));
        if (!isNaN(d.getTime())) {
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, '0');
          return `${y}-${m}` === selectedMonth;
        }
      }

      const str = String(rawVal).trim();
      if (!str || str === '-' || str === 'null' || str === 'undefined') return false;
      
      if (str.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(str)) {
        const iso = str.slice(0, 10);
        return iso >= startOfMonth && iso <= endOfMonth;
      }
      
      const norm = normalizeExcelDate(str);
      if (norm && norm >= startOfMonth && norm <= endOfMonth) return true;
      
      const lower = str.toLowerCase();
      if (lower.includes(selectedMonth)) return true;
      if (monthEn && lower.includes(monthEn)) return true;
      if (monthTh && lower.includes(monthTh)) return true;
      
      return false;
    };

    // 1. สร้าง Map เชื่อมโยงความเป็นเจ้าของงานระดับเลขตู้ (ID ➔ Driver / Trip Fee)
    const idToDriverMap = {};
    const idToFeeMap = {};
    const containerToDriverMap = {};
    const containerToFeeMap = {};
    const truckToDriversMap = {};
    const truckTripFeesMap = {};
    const truckVerifiedContainersMap = {};

    // กรองเฉพาะคนขับที่มีงานวิ่งจริงในงวดนี้
    const activeWorkingDrivers = safePayroll.filter(d => (d.total_containers > 0 || (Array.isArray(d.containers) && d.containers.length > 0)));

    activeWorkingDrivers.forEach(d => {
      const dName = String(d.driver_name || '').trim();
      if (!dName || dName === '-' || dName === 'ไม่ระบุคนขับ') return;

      if (Array.isArray(d.containers) && d.containers.length > 0) {
        d.containers.forEach(c => {
          const fee = Number(c.unit_price || c.earnings || c.trip_fee || 0);
          const tNo = String(c.truck_no || '').trim().replace(/^รถ\s*/, '');
          const cNo = String(c.container_no || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

          if (c.ref_master_id) {
            idToDriverMap[c.ref_master_id] = dName;
            idToFeeMap[c.ref_master_id] = fee;
          }
          if (cNo) {
            containerToDriverMap[cNo] = dName;
            containerToFeeMap[cNo] = fee;
          }

          if (tNo && tNo !== '-') {
            if (!truckToDriversMap[tNo]) truckToDriversMap[tNo] = new Set();
            truckToDriversMap[tNo].add(dName);

            if (!truckTripFeesMap[tNo]) truckTripFeesMap[tNo] = 0;
            truckTripFeesMap[tNo] += fee;

            if (!truckVerifiedContainersMap[tNo]) truckVerifiedContainersMap[tNo] = 0;
            truckVerifiedContainersMap[tNo] += 1;
          }
        });
      }
    });

    // 2. กรองตู้ในงวดเดือนจาก Master DB (container_records) ทั้งหมดตาม ID แต่ละแถว
    const monthlyMaster = safeMaster.filter(item => {
      const rawDate = item.date_job_parsed || item.date_job || '';
      return checkDateInMonth(rawDate);
    });

    const primaryContainers = monthlyMaster;

    // นับยอดตู้แยกขนาด
    let totalCount20 = 0;
    let totalCount40 = 0;
    let totalCount45 = 0;

    primaryContainers.forEach(item => {
      const size = String(item.size || '20').trim();
      if (size.includes('45')) totalCount45++;
      else if (size.includes('40')) totalCount40++;
      else totalCount20++;
    });

    // 3. คำนวณรายรับจากท่าเรือ (Port Revenue) แยกตามรายคันรถ
    let totalPortRevenue = 0;
    const truckStatsMap = {};

    // เริ่มต้นจากทะเบียนรถทั้งหมดในระบบ
    safeTrucks.forEach(tr => {
      const tNo = String(tr.truck_no || '').trim().replace(/^รถ\s*/, '');
      if (!tNo) return;
      const initialDrivers = truckToDriversMap[tNo] ? new Set(truckToDriversMap[tNo]) : new Set();
      const initialTripFees = truckTripFeesMap[tNo] || 0;
      const initialVerified = truckVerifiedContainersMap[tNo] || 0;

      truckStatsMap[tNo] = {
        truck_no: tNo,
        driver_names: initialDrivers,
        total_containers: 0,
        verified_containers: initialVerified,
        count_20: 0,
        count_40: 0,
        count_45: 0,
        port_revenue: 0,
        driver_trip_fee: initialTripFees,
        driver_salary: 0,
        driver_bonus: 0,
        fuel_cost: 0,
        maintenance_cost: 0,
        toll_cost: 0,
        installment_cost: 0,
        misc_cost: 0,
        containers_list: [],
        expenses_list: []
      };
    });

    // รวมตู้รายคันรถ และผูกคนขับที่วิ่งงานจริงตามเลขตู้ / ID
    primaryContainers.forEach(item => {
      const rawTruck = item.truck_no || '';
      const truckNo = String(rawTruck).trim().replace(/^รถ\s*/, '') || 'ไม่ระบุ';
      const size = String(item.size || '20').trim();
      const rawDate = item.date_job_parsed || item.date_job || '';
      const jobDate = normalizeExcelDate(rawDate);
      const unitPrice = portBillingService.calculatePortUnitPrice(size, jobDate, portRates);
      const effectiveRatePeriod = portBillingService.findEffectivePortRate(jobDate, portRates);

      totalPortRevenue += unitPrice;

      if (!truckStatsMap[truckNo]) {
        const initialDrivers = truckToDriversMap[truckNo] ? new Set(truckToDriversMap[truckNo]) : new Set();
        const initialTripFees = truckTripFeesMap[truckNo] || 0;
        const initialVerified = truckVerifiedContainersMap[truckNo] || 0;
        truckStatsMap[truckNo] = {
          truck_no: truckNo,
          driver_names: initialDrivers,
          total_containers: 0,
          verified_containers: initialVerified,
          count_20: 0,
          count_40: 0,
          count_45: 0,
          port_revenue: 0,
          driver_trip_fee: initialTripFees,
          driver_salary: 0,
          driver_bonus: 0,
          fuel_cost: 0,
          maintenance_cost: 0,
          toll_cost: 0,
          installment_cost: 0,
          misc_cost: 0,
          containers_list: [],
          expenses_list: []
        };
      }

      // 🔍 ย้อนหาคนขับและค่ารอบของตู้นี้ (เทียบตาม ID หรือ เลขตู้)
      const cNoClean = String(item.container_no || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const matchedDriver = idToDriverMap[item.id] || containerToDriverMap[cNoClean] || null;
      const tripFee = idToFeeMap[item.id] !== undefined ? idToFeeMap[item.id] : (containerToFeeMap[cNoClean] || 0);

      if (matchedDriver) {
        truckStatsMap[truckNo].driver_names.add(matchedDriver);
      }

      truckStatsMap[truckNo].total_containers += 1;
      if (size.includes('45')) truckStatsMap[truckNo].count_45 += 1;
      else if (size.includes('40')) truckStatsMap[truckNo].count_40 += 1;
      else truckStatsMap[truckNo].count_20 += 1;

      truckStatsMap[truckNo].port_revenue += unitPrice;

      truckStatsMap[truckNo].containers_list.push({
        id: item.id,
        container_no: item.container_no,
        size,
        date_job: jobDate || rawDate,
        raw_date: rawDate,
        unit_price: unitPrice,
        trip_fee: tripFee,
        period_name: effectiveRatePeriod?.period_name || '-',
        driver_name: matchedDriver || (Array.from(truckStatsMap[truckNo].driver_names)[0] || '-')
      });
    });

    // มอบหมายเงินเดือนและเงินพิเศษของคนขับเข้าประจำคันรถ เฉพาะคนขับที่มีงานวิ่งจริงในงวดนี้
    activeWorkingDrivers.forEach(d => {
      const salary = Number(d.base_salary || 0);
      const bonus = Number(d.special_bonus || 0);
      
      let targetTruck = '';
      if (Array.isArray(d.truck_list) && d.truck_list.length > 0) {
        targetTruck = String(d.truck_list[0]).trim().replace(/^รถ\s*/, '');
      } else if (Array.isArray(d.containers) && d.containers.length > 0) {
        targetTruck = String(d.containers[0].truck_no || '').trim().replace(/^รถ\s*/, '');
      } else if (d.assigned_truck_no && d.assigned_truck_no !== '-') {
        targetTruck = String(d.assigned_truck_no).trim().replace(/^รถ\s*/, '');
      }

      if (targetTruck && targetTruck !== '-' && truckStatsMap[targetTruck]) {
        truckStatsMap[targetTruck].driver_salary += salary;
        truckStatsMap[targetTruck].driver_bonus += bonus;
      }
    });

    // 4. รวมค่าใช้จ่ายฟลีทในงวดเดือน
    const monthlyExpenses = safeExpenses.filter(exp => {
      const date = exp.expense_date || '';
      return checkDateInMonth(date);
    });

    let totalFuel = 0;
    let totalMaintenance = 0;
    let totalTolls = 0;
    let totalInstallments = 0;
    let totalMisc = 0;

    monthlyExpenses.forEach(exp => {
      const truckNo = String(exp.truck_no || '').trim() || 'กองกลาง';
      const amount = Number(exp.amount_total) || 0;
      const cat = exp.category || 'misc';

      if (cat === 'fuel') totalFuel += amount;
      else if (cat === 'maintenance') totalMaintenance += amount;
      else if (cat === 'toll_port') totalTolls += amount;
      else if (cat === 'installment') totalInstallments += amount;
      else totalMisc += amount;

      if (!truckStatsMap[truckNo]) {
        truckStatsMap[truckNo] = {
          truck_no: truckNo,
          driver_names: new Set(),
          total_containers: 0,
          count_20: 0,
          count_40: 0,
          count_45: 0,
          port_revenue: 0,
          driver_trip_fee: 0,
          driver_salary: 0,
          driver_bonus: 0,
          fuel_cost: 0,
          maintenance_cost: 0,
          toll_cost: 0,
          installment_cost: 0,
          misc_cost: 0,
          containers_list: [],
          expenses_list: []
        };
      }

      if (cat === 'fuel') truckStatsMap[truckNo].fuel_cost += amount;
      else if (cat === 'maintenance') truckStatsMap[truckNo].maintenance_cost += amount;
      else if (cat === 'toll_port') truckStatsMap[truckNo].toll_cost += amount;
      else if (cat === 'installment') truckStatsMap[truckNo].installment_cost += amount;
      else truckStatsMap[truckNo].misc_cost += amount;

      truckStatsMap[truckNo].expenses_list.push({
        id: exp.id,
        expense_date: exp.expense_date,
        category: cat,
        description: exp.description,
        amount_total: amount,
        invoice_no: exp.invoice_no
      });
    });

    // คำนวณยอดรวมค่าใช้จ่ายคนขับทั้งระบบ (เฉพาะคนขับที่มีงานวิ่งจริงในงวดนี้)
    let totalDriverTripFees = 0;
    let totalDriverSalary = 0;
    let totalDriverBonus = 0;

    activeWorkingDrivers.forEach(d => {
      totalDriverTripFees += Number(d.total_earnings || 0);
      totalDriverSalary += Number(d.base_salary || 0);
      totalDriverBonus += Number(d.special_bonus || 0);
    });

    const totalDriverCost = totalDriverTripFees + totalDriverSalary + totalDriverBonus;
    const totalFleetCost = totalFuel + totalMaintenance + totalTolls + totalInstallments + totalMisc;
    const totalOperatingCost = totalFleetCost + totalDriverCost;
    const netProfit = totalPortRevenue - totalOperatingCost;
    const profitMargin = totalPortRevenue > 0 ? (netProfit / totalPortRevenue * 100).toFixed(1) : '0.0';

    // แปลง Map เป็น Array สำหรับตาราง Leaderboard พร้อมคำนวณ Fuel & Driver Analytics
    const allRows = Object.values(truckStatsMap)
      .filter(t => t.total_containers > 0 || (t.fuel_cost + t.maintenance_cost + t.toll_cost + t.installment_cost + t.misc_cost + t.driver_trip_fee + t.driver_salary + t.driver_bonus) > 0)
      .map(t => {
        const truckFleetCost = t.fuel_cost + t.maintenance_cost + t.toll_cost + t.installment_cost + t.misc_cost;
        const truckDriverCost = t.driver_trip_fee + t.driver_salary + t.driver_bonus;
        const totalTruckCost = truckFleetCost + truckDriverCost;
        const truckProfit = t.port_revenue - totalTruckCost;
        const truckMargin = t.port_revenue > 0 ? (truckProfit / t.port_revenue * 100).toFixed(1) : '0.0';

        // ⛽ Fuel Analytics per Truck
        const fuelBills = t.expenses_list.filter(e => e.category === 'fuel');
        const fuelFillsCount = fuelBills.length;
        const costPerTrip = t.total_containers > 0 && t.fuel_cost > 0 ? Math.round(t.fuel_cost / t.total_containers) : 0;
        const tripsPerFill = fuelFillsCount > 0 && t.total_containers > 0 ? (t.total_containers / fuelFillsCount).toFixed(1) : '0.0';
        const avgFillAmount = fuelFillsCount > 0 ? Math.round(t.fuel_cost / fuelFillsCount) : 0;
        const fuelPctOfRev = t.port_revenue > 0 && t.fuel_cost > 0 ? ((t.fuel_cost / t.port_revenue) * 100).toFixed(1) : '0.0';

        // 👨‍✈️ Driver Names
        const driverList = Array.from(t.driver_names || []).filter(Boolean);
        const driverDisplay = driverList.length > 0 ? driverList.join(', ') : '-';

        return {
          ...t,
          driver_name: driverDisplay,
          driver_list: driverList,
          total_fleet_cost: truckFleetCost,
          total_driver_cost: truckDriverCost,
          total_cost: totalTruckCost,
          net_profit: truckProfit,
          margin_pct: truckMargin,
          margin_num: parseFloat(truckMargin) || 0,
          fuel_fills_count: fuelFillsCount,
          cost_per_trip: costPerTrip,
          trips_per_fill: tripsPerFill,
          avg_fill_amount: avgFillAmount,
          fuel_pct_of_rev: fuelPctOfRev
        };
      });

    return {
      totalContainers: primaryContainers.length,
      totalCount20,
      totalCount40,
      totalCount45,
      totalPortRevenue,
      totalFuel,
      totalMaintenance,
      totalTolls,
      totalInstallments,
      totalMisc,
      totalFleetCost,
      totalDriverTripFees,
      totalDriverSalary,
      totalDriverBonus,
      totalDriverCost,
      totalOperatingCost,
      netProfit,
      profitMargin,
      truckLeaderboard: allRows
    };
  }, [masterContainers, payrollDrivers, expenses, trucks, portRates, selectedMonth]);

  // 🎛️ Standard Universal Column Preferences Hook
  const tablePrefs = useColumnPreferences({
    storageKeyPrefix: 'executive_pnl_leaderboard_v2',
    rawColumns: DEFAULT_EXEC_COLUMNS,
    defaultWidths: DEFAULT_EXEC_WIDTHS,
    defaultNames: DEFAULT_EXEC_NAMES,
    sampleRecords: metrics.truckLeaderboard,
    autoFitOnMount: false
  });

  // การกรองและเรียงลำดับตาราง (Sorting & Searching Leaderboard)
  const sortedAndFilteredRows = useMemo(() => {
    let list = [...metrics.truckLeaderboard];

    // 1. Profit / Loss filter
    if (profitFilter === 'PROFIT') {
      list = list.filter(t => t.net_profit >= 0);
    } else if (profitFilter === 'LOSS') {
      list = list.filter(t => t.net_profit < 0);
    }

    // 2. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(t =>
        String(t.truck_no || '').toLowerCase().includes(q) ||
        String(t.driver_name || '').toLowerCase().includes(q)
      );
    }

    // 3. Sorting
    const sortCol = tablePrefs.sortConfig?.key || 'net_profit';
    const sortDir = tablePrefs.sortConfig?.direction || 'desc';

    list.sort((a, b) => {
      let valA = a[sortCol];
      let valB = b[sortCol];

      if (sortCol === 'truck_no' || sortCol === 'driver_name') {
        valA = String(valA || '');
        valB = String(valB || '');
        return sortDir === 'asc' ? valA.localeCompare(valB, 'th') : valB.localeCompare(valA, 'th');
      }

      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });

    return list;
  }, [metrics.truckLeaderboard, profitFilter, searchQuery, tablePrefs.sortConfig]);

  // ส่งออกรายงาน Excel ภาพรวมผู้บริหาร
  const exportExecutiveExcel = () => {
    const rows = sortedAndFilteredRows.map((t, idx) => ({
      'ลำดับ': idx + 1,
      'เบอร์รถ': t.truck_no,
      'คนขับ': t.driver_name,
      'จำนวนตู้': t.total_containers,
      'ค่าเที่ยวท่าเรือ (บาท)': t.port_revenue,
      'ค่ารอบคนขับ (บาท)': t.driver_trip_fee,
      'เงินเดือนคนขับ (บาท)': t.driver_salary,
      'เงินพิเศษคนขับ (บาท)': t.driver_bonus,
      'รวมต้นทุนคนขับ (บาท)': t.total_driver_cost,
      'ค่าน้ำมัน (บาท)': t.fuel_cost,
      'ค่าน้ำมันเฉลี่ย/เที่ยว (บาท)': t.cost_per_trip,
      'จำนวนครั้งที่เติม': t.fuel_fills_count,
      'เฉลี่ยเที่ยว/การเติม 1 ครั้ง': `${t.trips_per_fill} เที่ยว`,
      'ค่าซ่อมบำรุง (บาท)': t.maintenance_cost,
      'ค่าผ่านทาง/ผ่านท่า (บาท)': t.toll_cost,
      'ค่างวดรถ (บาท)': t.installment_cost,
      'ค่าใช้จ่ายอื่นๆ (บาท)': t.misc_cost,
      'รวมต้นทุนทั้งหมด (บาท)': t.total_cost,
      'กำไรสุทธิ (บาท)': t.net_profit,
      'อัตรากำไร (%)': `${t.margin_pct}%`
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Executive_PnL');
    XLSX.writeFile(wb, `Executive_PnL_Report_${selectedMonth}.xlsx`);
  };

  // เรนเดอร์ข้อมูลแต่ละเซลล์ตามคอลัมน์ (แสดงข้อความสะอาด ไม่มีไอคอนหรือ badge ในเซลล์)
  const renderCell = (col, t, idx) => {
    switch (col) {
      case 'index':
        return <span style={{ color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</span>;
      case 'truck_no':
        return (
          <span style={{ fontWeight: 700, color: t.truck_no === 'กองกลาง' || t.truck_no === 'FLEET_SHARED' ? '#475569' : '#0f172a' }}>
            {t.truck_no === 'กองกลาง' || t.truck_no === 'FLEET_SHARED' ? 'กองกลาง' : t.truck_no}
          </span>
        );
      case 'driver_name':
        return (
          <span style={{ color: t.driver_name && t.driver_name !== '-' ? '#1e293b' : '#94a3b8', fontWeight: 500 }}>
            {t.driver_name || '-'}
          </span>
        );
      case 'total_containers':
        return <span style={{ fontWeight: 600, color: '#334155' }}>{t.total_containers > 0 ? t.total_containers.toLocaleString() : '-'}</span>;
      case 'port_revenue':
        return (
          <span style={{ fontWeight: 700, color: t.port_revenue > 0 ? '#15803d' : '#94a3b8' }}>
            {t.port_revenue > 0 ? t.port_revenue.toLocaleString() : '-'}
          </span>
        );
      case 'driver_trip_fee':
        return <span style={{ color: '#0891b2', fontWeight: 600 }}>{t.driver_trip_fee > 0 ? t.driver_trip_fee.toLocaleString() : '-'}</span>;
      case 'driver_salary':
        return <span style={{ color: '#4f46e5', fontWeight: 600 }}>{t.driver_salary > 0 ? t.driver_salary.toLocaleString() : '-'}</span>;
      case 'driver_bonus':
        return <span style={{ color: '#d97706', fontWeight: 600 }}>{t.driver_bonus > 0 ? t.driver_bonus.toLocaleString() : '-'}</span>;
      case 'total_driver_cost':
        return <span style={{ color: '#9333ea', fontWeight: 700 }}>{t.total_driver_cost > 0 ? t.total_driver_cost.toLocaleString() : '-'}</span>;
      case 'fuel_cost':
        return <span style={{ color: '#2563eb', fontWeight: 600 }}>{t.fuel_cost > 0 ? t.fuel_cost.toLocaleString() : '-'}</span>;
      case 'cost_per_trip':
        return t.cost_per_trip > 0 ? (
          <div>
            <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '12.5px' }}>
              {t.cost_per_trip.toLocaleString()}
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748b' }}>
              {t.fuel_fills_count > 0 ? `เติม ${t.fuel_fills_count} ครั้ง` : ''}
            </div>
          </div>
        ) : <span style={{ color: '#cbd5e1' }}>-</span>;
      case 'maintenance_cost':
        return <span style={{ color: '#d97706', fontWeight: 600 }}>{t.maintenance_cost > 0 ? t.maintenance_cost.toLocaleString() : '-'}</span>;
      case 'toll_cost':
        return <span style={{ color: '#059669', fontWeight: 600 }}>{t.toll_cost > 0 ? t.toll_cost.toLocaleString() : '-'}</span>;
      case 'installment_cost':
        return <span style={{ color: '#7c3aed', fontWeight: 600 }}>{t.installment_cost > 0 ? t.installment_cost.toLocaleString() : '-'}</span>;
      case 'misc_cost':
        return <span style={{ color: '#64748b' }}>{t.misc_cost > 0 ? t.misc_cost.toLocaleString() : '-'}</span>;
      case 'total_cost':
        return <span style={{ fontWeight: 800, color: '#dc2626' }}>{t.total_cost > 0 ? t.total_cost.toLocaleString() : '-'}</span>;
      case 'net_profit':
        return (
          <span style={{ fontWeight: 800, fontSize: '13px', color: t.net_profit >= 0 ? '#15803d' : '#b91c1c' }}>
            {t.net_profit.toLocaleString()}
          </span>
        );
      case 'margin_pct':
        return (
          <span style={{
            color: t.net_profit >= 0 ? '#15803d' : '#b91c1c',
            fontWeight: 700,
            fontSize: '12px'
          }}>
            {t.net_profit >= 0 ? `+${t.margin_pct}%` : `${t.margin_pct}%`}
          </span>
        );
      case 'actions':
        return (t.total_containers > 0 || t.expenses_list.length > 0 || t.total_driver_cost > 0) ? (
          <button
            type="button"
            onClick={() => setSelectedTruckDetail(t)}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#2563eb',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ดูข้อมูล
          </button>
        ) : <span style={{ color: '#cbd5e1' }}>-</span>;
      default:
        return t[col] || '-';
    }
  };

  return (
    <div style={{
      height: '100%',
      width: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      boxSizing: 'border-box',
      padding: '20px 24px',
      background: '#f8fafc'
    }}>
      <div style={{
        maxWidth: '1440px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        
        {/* 🏷️ Header Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          background: '#ffffff',
          padding: '16px 20px',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '22px' }}>📊</span>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                ผลประกอบการรถ (Truck P&L Overview)
              </h1>
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              ศูนย์รวมผลประกอบการ รายรับค่าเที่ยวท่าเรือ ต้นทุนฟลีท และสรุปกำไรสุทธิแบบ Real-time
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <MonthPicker
              value={selectedMonth}
              onChange={setSelectedMonth}
              label="งวดเดือน:"
            />

            <button
              type="button"
              onClick={exportExecutiveExcel}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: '#059669',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              📥 ส่งออก Excel (P&L)
            </button>
          </div>
        </div>

        {/* 🌟 4 Executive Core KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          
          <KpiCard
            icon="📦"
            title="จำนวนตู้รวมทั้งหมด"
            value={`${metrics.totalContainers.toLocaleString()} ตู้`}
            subtext={`20': ${metrics.totalCount20} ตู้ | 40': ${metrics.totalCount40} ตู้ | 45': ${metrics.totalCount45} ตู้`}
            color="blue"
          />

          <KpiCard
            icon="💵"
            title="ค่าเที่ยวท่าเรือรวม (Gross Revenue)"
            value={`฿${metrics.totalPortRevenue.toLocaleString()}`}
            subtext="คำนวณจากค่าเที่ยวตู้ 20'/40'/45' ท่าเรือ"
            color="green"
          />

          <KpiCard
            icon="💰"
            title="ต้นทุนรวมทั้งหมด (Total Operating Cost)"
            value={`฿${metrics.totalOperatingCost.toLocaleString()}`}
            subtext={`ฟลีท: ฿${metrics.totalFleetCost.toLocaleString()} | คนขับ: ฿${metrics.totalDriverCost.toLocaleString()}`}
            color="red"
          />

          <KpiCard
            icon="📈"
            title="กำไรสุทธิ (Net Profit)"
            value={`฿${metrics.netProfit.toLocaleString()}`}
            subtext={`อัตรากำไรเฉลี่ย (Margin): ${metrics.profitMargin}%`}
            color={metrics.netProfit >= 0 ? 'green' : 'red'}
          />

        </div>

        {/* 🏆 Truck P&L Profitability Leaderboard */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          {/* Header & Filter Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                🏆 สรุปผลกำไร-ขาดทุนรายคันรถ (Truck Profit & Loss Leaderboard)
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                ปรับขนาดคอลัมน์ ลากสลับตำแหน่ง หรือคลิกขวาที่หัวตารางเพื่อจัดการมุมมองได้อิสระ
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Profit Filter */}
              <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                {[
                  { id: 'ALL', label: 'ทั้งหมด' },
                  { id: 'PROFIT', label: '🟢 กำไร' },
                  { id: 'LOSS', label: '🔴 ขาดทุน' }
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setProfitFilter(f.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      background: profitFilter === f.id ? '#ffffff' : 'transparent',
                      color: profitFilter === f.id ? '#0f172a' : '#64748b',
                      fontWeight: profitFilter === f.id ? 700 : 500,
                      fontSize: '12px',
                      cursor: 'pointer',
                      boxShadow: profitFilter === f.id ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Search Box */}
              <div style={{ width: '220px' }}>
                <input
                  type="text"
                  placeholder="🔍 ค้นหาเบอร์รถ / คนขับ..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12.5px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* 🎛️ Standard Column Visibility Dropdown */}
              <ColumnVisibilityDropdown preferences={tablePrefs} />
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <span style={{ fontSize: '24px' }}>⏳</span>
              <p style={{ margin: '8px 0 0 0', fontSize: '13px' }}>กำลังประมวลผลข้อมูลแดชบอร์ด...</p>
            </div>
          ) : sortedAndFilteredRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
              <span style={{ fontSize: '28px' }}>🚛</span>
              <p style={{ margin: '8px 0 0 0', fontSize: '13px', fontWeight: 600 }}>ไม่พบข้อมูลที่ตรงกับเงื่อนไขในงวดเดือน {selectedMonth}</p>
            </div>
          ) : (
            /* 🎛️ Standard Universal Table Container & Header with Resize, Drag Reorder & Right Click Context Menu */
            <UniversalTableContainer preferences={tablePrefs}>
              <UniversalTableHeader
                preferences={tablePrefs}
                data={sortedAndFilteredRows}
                alignMap={EXEC_ALIGN_MAP}
                defaultWidths={DEFAULT_EXEC_WIDTHS}
              />
              <tbody>
                {sortedAndFilteredRows.map((t, idx) => (
                  <tr
                    key={t.truck_no || idx}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: idx % 2 === 0 ? '#ffffff' : '#fafafa'
                    }}
                  >
                    {tablePrefs.activeColumns.map(col => (
                      <td
                        key={col}
                        style={{
                          padding: '8px 10px',
                          textAlign: EXEC_ALIGN_MAP[col] || 'left',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontSize: '12.5px',
                          background: col === 'port_revenue' ? '#f0fdf4' : (col === 'total_cost' ? '#fef2f2' : (col === 'cost_per_trip' ? '#f0f9ff' : 'transparent'))
                        }}
                      >
                        {renderCell(col, t, idx)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </UniversalTableContainer>
          )}
        </div>

        {/* 🔍 Drill-down Modal ในแดชบอร์ด: รวมรายรับและรายจ่ายในหน้าเดียว */}
        {selectedTruckDetail && (
          <div
            onClick={() => setSelectedTruckDetail(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 99999,
              padding: '16px'
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '24px',
                width: '1020px',
                maxWidth: '96vw',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
                gap: '14px'
              }}
            >
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                    รายละเอียดผลประกอบการ: รถ {selectedTruckDetail.truck_no}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                      งวดเดือน: <strong>{selectedMonth}</strong> | คนขับในงวด:
                    </span>
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#1e293b' }}>
                      {selectedTruckDetail.driver_name || '-'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTruckDetail(null)}
                  style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b', padding: '0 4px' }}
                >
                  ✕
                </button>
              </div>

              {/* 4 Summary Mini Cards in Modal */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#15803d' }}>ค่าเที่ยวท่าเรือรวม</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#166534', marginTop: '2px' }}>
                    ฿{selectedTruckDetail.port_revenue.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '11px', color: '#15803d', marginTop: '1px' }}>
                    {selectedTruckDetail.total_containers} ตู้ (20": {selectedTruckDetail.count_20} | 40": {selectedTruckDetail.count_40} | 45": {selectedTruckDetail.count_45})
                  </div>
                </div>

                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#7e22ce' }}>รวมต้นทุนคนขับ</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#6b21a8', marginTop: '2px' }}>
                    ฿{selectedTruckDetail.total_driver_cost.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '11px', color: '#7e22ce', marginTop: '1px' }}>
                    ค่ารอบคนขับ ฿{selectedTruckDetail.driver_trip_fee.toLocaleString()} | เงินเดือน ฿{selectedTruckDetail.driver_salary.toLocaleString()} | เงินพิเศษ ฿{selectedTruckDetail.driver_bonus.toLocaleString()}
                  </div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>ต้นทุนฟลีท & น้ำมัน</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e40af', marginTop: '2px' }}>
                    ฿{selectedTruckDetail.total_fleet_cost.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '11px', color: '#1d4ed8', marginTop: '1px' }}>
                    น้ำมัน ฿{selectedTruckDetail.fuel_cost.toLocaleString()} (฿{selectedTruckDetail.cost_per_trip.toLocaleString()}/เที่ยว) | ซ่อม ฿{selectedTruckDetail.maintenance_cost.toLocaleString()}
                  </div>
                </div>

                <div style={{
                  background: selectedTruckDetail.net_profit >= 0 ? '#f0fdfa' : '#fff1f2',
                  border: `1px solid ${selectedTruckDetail.net_profit >= 0 ? '#99f6e4' : '#fecdd3'}`,
                  borderRadius: '10px',
                  padding: '10px 14px'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: selectedTruckDetail.net_profit >= 0 ? '#0f766e' : '#be123c' }}>
                    กำไรสุทธิ (Net Profit)
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: selectedTruckDetail.net_profit >= 0 ? '#115e59' : '#9f1239', marginTop: '2px' }}>
                    ฿{selectedTruckDetail.net_profit.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: selectedTruckDetail.net_profit >= 0 ? '#0f766e' : '#be123c', marginTop: '1px' }}>
                    รวมต้นทุน: ฿{selectedTruckDetail.total_cost.toLocaleString()} ({selectedTruckDetail.net_profit >= 0 ? `+${selectedTruckDetail.margin_pct}%` : `${selectedTruckDetail.margin_pct}%`})
                  </div>
                </div>
              </div>

              {/* Modal Body: ทั้งรายรับและรายจ่ายในหน้าเดียว */}
              <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px' }}>
                
                {/* Section 1: รายละเอียดรายรับ (ตู้ที่วิ่งงาน) */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ background: '#f8fafc', padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>
                      รายละเอียดรายรับค่าเที่ยวท่าเรือและค่ารอบคนขับ (ตู้สินค้าในใบวางบิล: {selectedTruckDetail.containers_list.length} ตู้ | คิดค่ารอบแล้ว: {selectedTruckDetail.verified_containers || selectedTruckDetail.containers_list.filter(c => Number(c.trip_fee) > 0).length} ตู้)
                    </div>
                    <span style={{ fontWeight: 700, color: '#15803d', fontSize: '13px' }}>
                      รวมค่าเที่ยวท่าเรือ: ฿{selectedTruckDetail.port_revenue.toLocaleString()}
                    </span>
                  </div>

                  {selectedTruckDetail.containers_list.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '13px' }}>
                      ไม่มีรายการตู้สินค้าในงวดนี้
                    </div>
                  ) : (
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>
                          <tr style={{ color: '#475569', fontWeight: 600 }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>วันที่วิ่งงาน</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>เลขตู้</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>ขนาด</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>คนขับ</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', color: '#0891b2' }}>ค่ารอบคนขับ (บาท)</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', color: '#059669' }}>ค่าเที่ยวท่าเรือ (บาท)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTruckDetail.containers_list.map((item, idx) => (
                            <tr key={item.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '8px 10px', color: '#334155' }}>{item.date_job || '-'}</td>
                              <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1e40af' }}>{item.container_no}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center', color: '#475569' }}>
                                {item.size}
                              </td>
                              <td style={{ padding: '8px 10px', color: '#1e293b' }}>
                                {item.driver_name || '-'}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', color: '#0891b2', fontWeight: 600 }}>
                                {item.trip_fee > 0 ? `฿${item.trip_fee.toLocaleString()}` : '-'}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>
                                ฿{Number(item.unit_price).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #e2e8f0' }}>
                          <tr>
                            <td colSpan="4" style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>รวม:</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#0891b2', fontSize: '13px' }}>
                              ฿{selectedTruckDetail.driver_trip_fee.toLocaleString()}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#15803d', fontSize: '13.5px' }}>
                              ฿{selectedTruckDetail.port_revenue.toLocaleString()}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>

                {/* Section 2: รายละเอียดต้นทุนค่าใช้จ่ายทั้งหมด (รวมคนขับและฟลีท) */}
                {(() => {
                  const combinedExpenses = [];

                  // 1. ค่ารอบคนขับ
                  if (selectedTruckDetail.driver_trip_fee > 0) {
                    const verifiedCount = selectedTruckDetail.verified_containers || selectedTruckDetail.containers_list.filter(c => Number(c.trip_fee) > 0).length || 0;
                    combinedExpenses.push({
                      id: 'driver-fee',
                      expense_date: selectedMonth,
                      category_label: 'ค่ารอบคนขับ',
                      description: `ค่ารอบคนขับรวม (${verifiedCount} ตู้ที่ตรวจสอบแล้ว)`,
                      invoice_no: 'ระบบผลงาน',
                      amount_total: selectedTruckDetail.driver_trip_fee
                    });
                  }

                  // 2. เงินเดือนคนขับ
                  if (selectedTruckDetail.driver_salary > 0) {
                    combinedExpenses.push({
                      id: 'driver-salary',
                      expense_date: selectedMonth,
                      category_label: 'เงินเดือนคนขับ',
                      description: `เงินเดือนฐาน (${selectedTruckDetail.driver_name || '-'})`,
                      invoice_no: `งวด ${selectedMonth}`,
                      amount_total: selectedTruckDetail.driver_salary
                    });
                  }

                  // 3. เงินพิเศษคนขับ
                  if (selectedTruckDetail.driver_bonus > 0) {
                    combinedExpenses.push({
                      id: 'driver-bonus',
                      expense_date: selectedMonth,
                      category_label: 'เงินพิเศษ',
                      description: 'เงินพิเศษตามขั้นบันไดผลงาน',
                      invoice_no: `โบนัสงวด ${selectedMonth}`,
                      amount_total: selectedTruckDetail.driver_bonus
                    });
                  }

                  // 4. บิลค่าใช้จ่ายฟลีท
                  (selectedTruckDetail.expenses_list || []).forEach((exp, idx) => {
                    const catLabel = exp.category === 'fuel' ? 'น้ำมัน'
                      : exp.category === 'maintenance' ? 'ซ่อมบำรุง'
                      : exp.category === 'toll_port' ? 'ทางด่วน/ผ่านท่า'
                      : exp.category === 'installment' ? 'ค่างวด'
                      : 'เบ็ดเตล็ด';

                    combinedExpenses.push({
                      id: exp.id || `fleet-${idx}`,
                      expense_date: exp.expense_date || '-',
                      category_label: catLabel,
                      description: exp.description || '-',
                      invoice_no: exp.invoice_no || '-',
                      amount_total: Number(exp.amount_total) || 0
                    });
                  });

                  return (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                      <div style={{ background: '#f8fafc', padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>
                          รายละเอียดต้นทุนค่าใช้จ่ายทั้งหมด (รวมคนขับและฟลีท: {combinedExpenses.length} รายการ)
                        </div>
                        <span style={{ fontWeight: 700, color: '#dc2626', fontSize: '13px' }}>
                          รวมต้นทุนทั้งหมด: ฿{selectedTruckDetail.total_cost.toLocaleString()}
                        </span>
                      </div>

                      {combinedExpenses.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '13px' }}>
                          ไม่มีรายการค่าใช้จ่ายของรถในงวดนี้
                        </div>
                      ) : (
                        <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                            <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>
                              <tr style={{ color: '#475569', fontWeight: 600 }}>
                                <th style={{ padding: '8px 10px', textAlign: 'left' }}>วันที่</th>
                                <th style={{ padding: '8px 10px', textAlign: 'center' }}>หมวดหมู่</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left' }}>รายการ</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left' }}>เลขที่บิล / อ้างอิง</th>
                                <th style={{ padding: '8px 10px', textAlign: 'right', color: '#dc2626' }}>ยอดเงิน (บาท)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {combinedExpenses.map((exp, idx) => (
                                <tr key={exp.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '8px 10px', color: '#334155' }}>{exp.expense_date || '-'}</td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center', color: '#475569' }}>
                                    {exp.category_label}
                                  </td>
                                  <td style={{ padding: '8px 10px', color: '#0f172a' }}>{exp.description || '-'}</td>
                                  <td style={{ padding: '8px 10px', color: '#64748b', fontSize: '11.5px' }}>{exp.invoice_no || '-'}</td>
                                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>
                                    ฿{Number(exp.amount_total).toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #e2e8f0' }}>
                              <tr>
                                <td colSpan="4" style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>
                                  รวมต้นทุนทั้งหมด (คนขับ ฿{selectedTruckDetail.total_driver_cost.toLocaleString()} + ฟลีท ฿{selectedTruckDetail.total_fleet_cost.toLocaleString()}):
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#dc2626', fontSize: '13.5px' }}>
                                  ฿{selectedTruckDetail.total_cost.toLocaleString()}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>

              {/* Modal Footer */}
              <div style={{ paddingTop: '12px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setSelectedTruckDetail(null)}
                  style={{ padding: '7px 20px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
