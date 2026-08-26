import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient.js';
import { driverPayrollService } from '../services/driverPayrollService.js';
import { useColumnPreferences } from '../hooks/useColumnPreferences.js';
import UniversalTableContainer from '../components/ui/UniversalTableContainer.jsx';
import UniversalTableHeader from '../components/ui/UniversalTableHeader.jsx';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown.jsx';
import KpiCard from '../components/ui/KpiCard.jsx';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import DriverMonthlyPayslipModal from '../components/payroll/DriverMonthlyPayslipModal.jsx';

// =========================================================================
// 🎛️ Column Schema Specifications for Driver Income Summary Table
// =========================================================================
const DEFAULT_INCOME_COLUMNS = [
  'index',
  'driver_name',
  'assigned_truck_no',
  'verified_containers',
  'base_salary',
  'trip_earnings',
  'special_bonus',
  'gross_income',
  'sso_amount',
  'wht_amount',
  'advance_amount',
  'total_deductions',
  'total_net_payout',
  'actions'
];

const DEFAULT_INCOME_NAMES = {
  index: '#',
  driver_name: 'ชื่อพนักงานขับรถ',
  assigned_truck_no: 'เบอร์รถ',
  verified_containers: 'ตู้ที่ตรวจแล้ว',
  base_salary: 'เงินเดือนฐาน',
  trip_earnings: 'ค่ารอบคนขับ',
  special_bonus: 'เงินพิเศษ',
  gross_income: 'รวมตั้งจ่ายก่อนหัก (Gross)',
  sso_amount: 'ประกันสังคม',
  wht_amount: 'ภาษี 3%',
  advance_amount: 'เบิก/ผ่อนยืม',
  total_deductions: 'รวมรายการหัก',
  total_net_payout: '💰 ยอดโอนจ่ายจริง (Net)',
  actions: 'สลิปเงินเดือน'
};

const DEFAULT_INCOME_WIDTHS = {
  index: 45,
  driver_name: 160,
  assigned_truck_no: 100,
  verified_containers: 105,
  base_salary: 115,
  trip_earnings: 115,
  special_bonus: 105,
  gross_income: 135,
  sso_amount: 105,
  wht_amount: 100,
  advance_amount: 115,
  total_deductions: 130,
  total_net_payout: 145,
  actions: 100
};

const INCOME_ALIGN_MAP = {
  index: 'center',
  driver_name: 'left',
  assigned_truck_no: 'center',
  verified_containers: 'right',
  base_salary: 'right',
  trip_earnings: 'right',
  special_bonus: 'right',
  gross_income: 'right',
  sso_amount: 'right',
  wht_amount: 'right',
  advance_amount: 'right',
  total_deductions: 'right',
  total_net_payout: 'right',
  actions: 'center'
};

export default function DriverIncomeSummaryView() {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [payrollData, setPayrollData] = useState({
    drivers: [],
    kpis: {
      total_net_payout: 0,
      total_gross_income: 0,
      total_base_salary: 0,
      total_trip_earnings: 0,
      total_bonus: 0,
      total_sso_deductions: 0,
      total_wht_deductions: 0,
      total_advance_deductions: 0,
      total_deductions: 0,
      total_containers: 0
    }
  });

  // Table Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [deductionFilter, setDeductionFilter] = useState('ALL'); // 'ALL' | 'WITH_DEDUCTION' | 'NO_DEDUCTION'

  // Modal State
  const [selectedPayslipDriver, setSelectedPayslipDriver] = useState(null);
  const [isPayslipOpen, setIsPayslipOpen] = useState(false);

  // 1. Auto-detect latest active month from DB on initial mount
  useEffect(() => {
    async function detectActiveMonth() {
      try {
        const [masterRes, sheetsRes] = await Promise.all([
          supabase.from('container_records').select('date_job, date_job_parsed').not('date_job', 'is', null).order('date_job', { ascending: false }).limit(20),
          supabase.from('job_sheets').select('date_job, date_job_parsed').not('date_job', 'is', null).order('created_at', { ascending: false }).limit(20)
        ]);

        const combined = [...(masterRes?.data || []), ...(sheetsRes?.data || [])];
        for (const row of combined) {
          const raw = row.date_job_parsed || row.date_job || '';
          const ym = String(raw).slice(0, 7);
          if (/^\d{4}-\d{2}$/.test(ym)) {
            setSelectedMonth(ym);
            break;
          }
        }
      } catch (e) {
        console.warn('detectActiveMonth fallback:', e);
      }
    }
    detectActiveMonth();
  }, []);

  // 2. Load Monthly Driver Payroll and Deductions
  const loadMonthlyData = async () => {
    setLoading(true);
    try {
      const res = await driverPayrollService.calculateMonthlyPayroll({
        yearMonth: selectedMonth,
        driverFilter: 'ALL'
      });
      if (res && res.data) {
        setPayrollData(res.data);
      }
    } catch (err) {
      console.error('loadMonthlyData error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonthlyData();
  }, [selectedMonth]);

  // 3. 🎛️ Standard Universal Table Preferences
  const tablePrefs = useColumnPreferences({
    storageKeyPrefix: 'driver_income_summary_table_v2',
    rawColumns: DEFAULT_INCOME_COLUMNS,
    defaultNames: DEFAULT_INCOME_NAMES,
    defaultWidths: DEFAULT_INCOME_WIDTHS,
    sampleRecords: payrollData.drivers,
    autoFitOnMount: false
  });

  // Filter and Search
  const filteredDrivers = useMemo(() => {
    const drivers = payrollData.drivers || [];
    return drivers.filter(d => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const dName = (d.driver_name || '').toLowerCase();
        const truck = (d.assigned_truck_no || '').toLowerCase();
        if (!dName.includes(q) && !truck.includes(q)) return false;
      }

      // 2. Deduction Filter
      if (deductionFilter === 'WITH_DEDUCTION') {
        if ((d.total_deductions || 0) <= 0) return false;
      } else if (deductionFilter === 'NO_DEDUCTION') {
        if ((d.total_deductions || 0) > 0) return false;
      }

      return true;
    });
  }, [payrollData.drivers, searchQuery, deductionFilter]);

  // Excel Export
  const exportToExcel = () => {
    const rows = filteredDrivers.map((d, idx) => ({
      'ลำดับ': idx + 1,
      'ชื่อพนักงาน': d.driver_name,
      'เบอร์รถ': d.assigned_truck_no || '-',
      'ตู้ที่ตรวจแล้ว (ตู้)': d.total_containers || 0,
      'ตู้ 20’ (ตู้)': d.count_20 || 0,
      'ค่ารอบ 20’ (บาท)': d.earnings_20 || 0,
      'ตู้ 40’ (ตู้)': d.count_40 || 0,
      'ค่ารอบ 40’ (บาท)': d.earnings_40 || 0,
      'เงินเดือนฐาน (บาท)': d.base_salary || 0,
      'ค่ารอบรวม (บาท)': d.trip_earnings || 0,
      'เงินพิเศษ (บาท)': d.special_bonus || 0,
      'รวมตั้งจ่ายก่อนหัก (บาท)': d.gross_income || 0,
      'หักประกันสังคม (บาท)': d.sso_amount || 0,
      'หักภาษี ณ ที่จ่าย 3% (บาท)': d.wht_amount || 0,
      'หักเบิกล่วงหน้า/เงินยืม (บาท)': d.advance_amount || 0,
      'รวมรายการหักทั้งหมด (บาท)': d.total_deductions || 0,
      'ยอดโอนจ่ายจริงสุทธิ (บาท)': d.total_net_payout || 0
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `สรุปจ่ายคนขับ_${selectedMonth}`);
    XLSX.writeFile(wb, `สรุปยอดจ่ายค่าจ้างคนขับ_${selectedMonth}.xlsx`);
  };

  // Open Payslip
  const handleOpenPayslip = (driver) => {
    setSelectedPayslipDriver(driver);
    setIsPayslipOpen(true);
  };

  // Render Cell
  const renderCell = (col, d, idx) => {
    switch (col) {
      case 'index':
        return <span style={{ color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</span>;
      case 'driver_name':
        return <span style={{ fontWeight: 700, color: '#0f172a' }}>{d.driver_name}</span>;
      case 'assigned_truck_no':
        return (
          <span style={{
            padding: '2px 8px',
            borderRadius: '6px',
            background: d.assigned_truck_no && d.assigned_truck_no !== '-' ? '#eff6ff' : '#f1f5f9',
            color: d.assigned_truck_no && d.assigned_truck_no !== '-' ? '#1d4ed8' : '#94a3b8',
            fontWeight: 700,
            fontSize: '12px'
          }}>
            {d.assigned_truck_no || '-'}
          </span>
        );
      case 'verified_containers':
        return (
          <span style={{ fontWeight: 600, color: '#334155' }}>
            {d.total_containers > 0 ? `${d.total_containers.toLocaleString()} ตู้` : '-'}
          </span>
        );
      case 'base_salary':
        return (
          <span style={{ color: '#475569', fontWeight: 600 }}>
            {d.base_salary > 0 ? `฿${d.base_salary.toLocaleString()}` : '-'}
          </span>
        );
      case 'trip_earnings':
        return (
          <span style={{ color: '#0284c7', fontWeight: 600 }}>
            {d.trip_earnings > 0 ? `฿${d.trip_earnings.toLocaleString()}` : '-'}
          </span>
        );
      case 'special_bonus':
        return (
          <span style={{ color: '#d97706', fontWeight: 600 }}>
            {d.special_bonus > 0 ? `+฿${d.special_bonus.toLocaleString()}` : '-'}
          </span>
        );
      case 'gross_income':
        return (
          <span style={{ color: '#15803d', fontWeight: 800, fontSize: '13px' }}>
            {d.gross_income > 0 ? `฿${d.gross_income.toLocaleString()}` : '-'}
          </span>
        );
      case 'sso_amount':
        return (
          <span style={{ color: d.sso_amount > 0 ? '#dc2626' : '#94a3b8', fontWeight: 600 }}>
            {d.sso_amount > 0 ? `-฿${d.sso_amount.toLocaleString()}` : '-'}
          </span>
        );
      case 'wht_amount':
        return (
          <span style={{ color: d.wht_amount > 0 ? '#ea580c' : '#94a3b8', fontWeight: 600 }}>
            {d.wht_amount > 0 ? `-฿${d.wht_amount.toLocaleString()}` : '-'}
          </span>
        );
      case 'advance_amount':
        return (
          <span style={{ color: d.advance_amount > 0 ? '#dc2626' : '#94a3b8', fontWeight: 600 }}>
            {d.advance_amount > 0 ? `-฿${d.advance_amount.toLocaleString()}` : '-'}
          </span>
        );
      case 'total_deductions':
        return (
          <span style={{ color: d.total_deductions > 0 ? '#b91c1c' : '#94a3b8', fontWeight: 800 }}>
            {d.total_deductions > 0 ? `-฿${d.total_deductions.toLocaleString()}` : '-'}
          </span>
        );
      case 'total_net_payout':
        return (
          <span style={{ color: '#047857', fontWeight: 900, fontSize: '13.5px' }}>
            ฿{Number(d.total_net_payout || 0).toLocaleString()}
          </span>
        );
      case 'actions':
        return (
          <button
            type="button"
            onClick={() => handleOpenPayslip(d)}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#2563eb',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            📄 ดูสลิป
          </button>
        );
      default:
        return d[col] || '-';
    }
  };

  const kpis = payrollData.kpis || {};
  const ssoTotal = kpis.total_sso_deductions ?? kpis.total_sso ?? 0;
  const whtTotal = kpis.total_wht_deductions ?? kpis.total_wht ?? 0;
  const advTotal = kpis.total_advance_deductions ?? kpis.total_advances ?? 0;
  const totalDeductionsCalc = ssoTotal + whtTotal + advTotal;

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
              <span style={{ fontSize: '22px' }}>👨‍✈️</span>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                สรุปจ่ายค่าจ้างคนขับ (Driver Payroll & Settlement Hub)
              </h1>
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              สรุปยอดตั้งจ่ายพนักงานขับรถ (เงินเดือนฐาน + ค่ารอบคนขับ + เงินพิเศษ) หักรายการหัก (ประกันสังคม, ภาษี 3%, เบิกล่วงหน้า/เงินยืม) เพื่อโอนจ่ายจริง
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <MonthPicker
              value={selectedMonth}
              onChange={setSelectedMonth}
              label="เดือน:"
            />

            <button
              type="button"
              onClick={exportToExcel}
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
              📥 ส่งออก Excel
            </button>
          </div>
        </div>

        {/* 🌟 4 Core KPI Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          
          <KpiCard
            icon="💵"
            title="รวมยอดตั้งจ่ายก่อนหัก (Gross Payroll)"
            value={`฿${(kpis.total_gross_income || 0).toLocaleString()}`}
            subtext={`เงินเดือนฐาน ฿${(kpis.total_base_salary || 0).toLocaleString()} + ค่ารอบ ฿${(kpis.total_trip_earnings || 0).toLocaleString()} + โบนัส ฿${(kpis.total_bonus || 0).toLocaleString()}`}
            color="blue"
          />

          <KpiCard
            icon="📦"
            title="รวมค่ารอบคนขับ (Trip Fees)"
            value={`฿${(kpis.total_trip_earnings || 0).toLocaleString()}`}
            subtext={`คิดจาก ${(kpis.total_containers || 0).toLocaleString()} ตู้ที่ตรวจผ่านแล้วในงวดนี้`}
            color="green"
          />

          <KpiCard
            icon="🔻"
            title="รวมรายการหักทั้งหมด (Total Deductions)"
            value={`-฿${totalDeductionsCalc.toLocaleString()}`}
            subtext={`สปส. ฿${ssoTotal.toLocaleString()} | ภาษี ฿${whtTotal.toLocaleString()} | เบิก/ยืม ฿${advTotal.toLocaleString()}`}
            color="red"
          />

          <KpiCard
            icon="💰"
            title="รวมยอดโอนจ่ายจริงสุทธิ (Total Net Payable)"
            value={`฿${(kpis.total_net_payout || 0).toLocaleString()}`}
            subtext={`ยอดเงินรวมที่ต้องโอนให้พนักงานขับรถ (${filteredDrivers.length} คน)`}
            color="green"
          />

        </div>

        {/* 🏆 Leaderboard Table */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          {/* Controls Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                📋 ตารางสรุปยอดตั้งจ่ายและรายการหักคนขับรายบุคคล (Driver Payroll Statement)
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                แจกแจงรายการตั้งจ่าย รายการหัก และยอดเงินสุทธิที่ต้องโอนรายคน
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Deduction Filter */}
              <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                {[
                  { id: 'ALL', label: 'คนขับทั้งหมด' },
                  { id: 'WITH_DEDUCTION', label: '🔻 มีรายการหัก' },
                  { id: 'NO_DEDUCTION', label: '✅ ไม่มีรายการหัก' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDeductionFilter(tab.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: deductionFilter === tab.id ? '#ffffff' : 'transparent',
                      color: deductionFilter === tab.id ? '#0f172a' : '#64748b',
                      fontWeight: deductionFilter === tab.id ? 700 : 500,
                      fontSize: '12px',
                      cursor: 'pointer',
                      boxShadow: deductionFilter === tab.id ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search Box */}
              <div style={{ position: 'relative', width: '220px' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', pointerEvents: 'none' }}>
                  🔍
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="ค้นหาชื่อคนขับ / เบอร์รถ..."
                  style={{
                    width: '100%',
                    padding: '7px 28px 7px 32px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12.5px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <ColumnVisibilityDropdown preferences={tablePrefs} />
            </div>
          </div>

          {/* Table Content */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
              <span style={{ fontSize: '24px' }}>⏳</span>
              <p style={{ margin: '8px 0 0 0', fontSize: '13px' }}>กำลังประมวลผลข้อมูลสรุปรายได้คนขับ...</p>
            </div>
          ) : filteredDrivers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
              <span style={{ fontSize: '28px' }}>👨‍✈️</span>
              <p style={{ margin: '8px 0 0 0', fontSize: '13px', fontWeight: 600 }}>ไม่พบข้อมูลคนขับในงวดเดือน {selectedMonth}</p>
            </div>
          ) : (
            <UniversalTableContainer preferences={tablePrefs}>
              <UniversalTableHeader
                preferences={tablePrefs}
                data={filteredDrivers}
                alignMap={INCOME_ALIGN_MAP}
                defaultWidths={DEFAULT_INCOME_WIDTHS}
              />
              <tbody>
                {filteredDrivers.map((d, idx) => (
                  <tr
                    key={d.driver_id || d.driver_name || idx}
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
                          textAlign: INCOME_ALIGN_MAP[col] || 'left',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontSize: '12.5px',
                          background: col === 'gross_income' ? '#f0fdf4'
                            : col === 'total_deductions' ? '#fef2f2'
                            : col === 'total_net_payout' ? '#ecfdf5'
                            : 'transparent'
                        }}
                      >
                        {renderCell(col, d, idx)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </UniversalTableContainer>
          )}
        </div>

        {/* 📄 Payslip Modal */}
        <DriverMonthlyPayslipModal
          isOpen={isPayslipOpen}
          onClose={() => setIsPayslipOpen(false)}
          monthlyRecord={selectedPayslipDriver}
          yearMonth={selectedMonth}
        />

      </div>
    </div>
  );
}
