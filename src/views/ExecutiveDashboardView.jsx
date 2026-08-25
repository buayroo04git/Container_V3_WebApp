import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient.js';
import { portBillingService, DEFAULT_PORT_RATES } from '../services/portBillingService.js';
import { truckExpenseService } from '../services/truckExpenseService.js';
import { fetchTrucks } from '../services/truckDriverService.js';
import KpiCard from '../components/ui/KpiCard.jsx';
import MonthPicker from '../components/ui/MonthPicker.jsx';

export default function ExecutiveDashboardView({ setActiveTab }) {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [containers, setContainers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [portRates, setPortRates] = useState(DEFAULT_PORT_RATES);

  // โหลดข้อมูลภาพรวมทั้งหมด
  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      try {
        const [
          ratesRes,
          expensesRes,
          trucksRes,
          itemsRes,
          sheetsRes
        ] = await Promise.all([
          portBillingService.fetchPortRates(),
          truckExpenseService.fetchExpenses(),
          fetchTrucks(),
          supabase.from('job_sheet_items').select('id, size, port, match_status, date_job_parsed, date_job, job_sheet_id').limit(10000),
          supabase.from('job_sheets').select('id, truck_no, driver_name, date_job_parsed, date_job, status').neq('status', 'deleted').limit(10000)
        ]);

        const ratesList = Array.isArray(ratesRes) ? ratesRes : (ratesRes?.data || []);
        const expensesList = Array.isArray(expensesRes) ? expensesRes : (expensesRes?.data || []);
        const trucksList = Array.isArray(trucksRes) ? trucksRes : (trucksRes?.data || []);
        const rawItems = Array.isArray(itemsRes) ? itemsRes : (itemsRes?.data || []);
        const rawSheets = Array.isArray(sheetsRes) ? sheetsRes : (sheetsRes?.data || []);

        const sheetMap = {};
        rawSheets.forEach(s => {
          if (s && s.id) sheetMap[s.id] = s;
        });

        const joinedItems = rawItems.map(item => {
          const sheet = sheetMap[item.job_sheet_id] || {};
          return {
            ...item,
            job_sheets: sheet
          };
        });

        setPortRates(ratesList);
        setExpenses(expensesList);
        setTrucks(trucksList);
        setContainers(joinedItems);
      } catch (err) {
        console.error('loadDashboardData error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  const handlePrevMonth = () => {
    const parts = (selectedMonth || '').split('-');
    if (parts.length === 2) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 2, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      setSelectedMonth(`${y}-${m}`);
    }
  };

  const handleNextMonth = () => {
    const parts = (selectedMonth || '').split('-');
    if (parts.length === 2) {
      const d = new Date(Number(parts[0]), Number(parts[1]), 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      setSelectedMonth(`${y}-${m}`);
    }
  };

  // กรองและรวมยอดตามงวดเดือนที่เลือก
  const metrics = useMemo(() => {
    const startOfMonth = `${selectedMonth}-01`;
    const endOfMonth = `${selectedMonth}-31`;

    // 1. กรองตู้ในงวดเดือน
    const monthlyContainers = containers.filter(item => {
      const date = item.date_job_parsed || item.job_sheets?.date_job_parsed || '';
      return date >= startOfMonth && date <= endOfMonth;
    });

    const verifiedContainers = monthlyContainers.filter(item => 
      item.match_status === 'matched_green' || item.match_status === 'verified'
    );
    const pendingContainers = monthlyContainers.filter(item => 
      item.match_status !== 'matched_green' && item.match_status !== 'verified' && item.match_status !== 'cancelled'
    );

    // 2. คำนวณรายรับจากท่าเรือ (Port Revenue)
    let totalPortRevenue = 0;
    const truckStatsMap = {};

    // รวมตู้รายคันรถ
    verifiedContainers.forEach(item => {
      const truckNo = item.job_sheets?.truck_no || 'ไม่ระบุ';
      const driverName = item.job_sheets?.driver_name || '-';
      const size = item.size || '20';
      const jobDate = item.date_job_parsed || item.job_sheets?.date_job_parsed || '';
      const unitPrice = portBillingService.calculatePortUnitPrice(size, jobDate, portRates);

      totalPortRevenue += unitPrice;

      if (!truckStatsMap[truckNo]) {
        truckStatsMap[truckNo] = {
          truck_no: truckNo,
          driver_name: driverName,
          total_containers: 0,
          count_20: 0,
          count_40: 0,
          count_45: 0,
          port_revenue: 0,
          fuel_cost: 0,
          maintenance_cost: 0,
          toll_cost: 0,
          installment_cost: 0,
          misc_cost: 0,
          driver_cost: 0
        };
      }

      truckStatsMap[truckNo].total_containers += 1;
      if (String(size).includes('45')) truckStatsMap[truckNo].count_45 += 1;
      else if (String(size).includes('40')) truckStatsMap[truckNo].count_40 += 1;
      else truckStatsMap[truckNo].count_20 += 1;

      truckStatsMap[truckNo].port_revenue += unitPrice;
      truckStatsMap[truckNo].driver_cost += 100; // ค่ารอบมาตรฐาน
    });

    // 3. รวมค่าใช้จ่ายฟลีทในงวดเดือน
    const monthlyExpenses = expenses.filter(exp => {
      const date = exp.expense_date || '';
      return date >= startOfMonth && date <= endOfMonth;
    });

    let totalFuel = 0;
    let totalMaintenance = 0;
    let totalTolls = 0;
    let totalInstallments = 0;
    let totalMisc = 0;

    monthlyExpenses.forEach(exp => {
      const truckNo = exp.truck_no || 'กองกลาง';
      const amount = Number(exp.amount_total) || 0;
      const cat = exp.category || 'misc';

      if (cat === 'fuel') totalFuel += amount;
      else if (cat === 'maintenance') totalMaintenance += amount;
      else if (cat === 'toll_port') totalTolls += amount;
      else if (cat === 'installment') totalInstallments += amount;
      else totalMisc += amount;

      if (truckStatsMap[truckNo]) {
        if (cat === 'fuel') truckStatsMap[truckNo].fuel_cost += amount;
        else if (cat === 'maintenance') truckStatsMap[truckNo].maintenance_cost += amount;
        else if (cat === 'toll_port') truckStatsMap[truckNo].toll_cost += amount;
        else if (cat === 'installment') truckStatsMap[truckNo].installment_cost += amount;
        else truckStatsMap[truckNo].misc_cost += amount;
      }
    });

    const totalOperatingCost = totalFuel + totalMaintenance + totalTolls + totalInstallments + totalMisc + (verifiedContainers.length * 100);
    const netProfit = totalPortRevenue - totalOperatingCost;
    const profitMargin = totalPortRevenue > 0 ? (netProfit / totalPortRevenue * 100).toFixed(1) : '0.0';

    // แปลง Map เป็น Array สำหรับตาราง Leaderboard
    const truckLeaderboard = Object.values(truckStatsMap).map(t => {
      const totalTruckCost = t.fuel_cost + t.maintenance_cost + t.toll_cost + t.installment_cost + t.misc_cost + t.driver_cost;
      const truckProfit = t.port_revenue - totalTruckCost;
      const truckMargin = t.port_revenue > 0 ? (truckProfit / t.port_revenue * 100).toFixed(1) : '0.0';
      return {
        ...t,
        total_cost: totalTruckCost,
        net_profit: truckProfit,
        margin_pct: truckMargin
      };
    }).sort((a, b) => b.net_profit - a.net_profit);

    return {
      totalContainers: monthlyContainers.length,
      verifiedContainers: verifiedContainers.length,
      pendingContainers: pendingContainers.length,
      totalPortRevenue,
      totalFuel,
      totalMaintenance,
      totalOperatingCost,
      netProfit,
      profitMargin,
      truckLeaderboard
    };
  }, [containers, expenses, portRates, selectedMonth]);

  return (
    <div style={{ padding: '20px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
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
              แดชบอร์ดภาพรวมผู้บริหาร (Executive Overview)
            </h1>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            ศูนย์รวมผลประกอบการ รายรับจากท่าเรือ ต้นทุนฟลีท และสรุปกำไรสุทธิแบบ Real-time
          </p>
        </div>

        <MonthPicker
          value={selectedMonth}
          onChange={setSelectedMonth}
          label="งวดเดือน:"
        />
      </div>

      {/* 🌟 4 Executive Core KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        
        <KpiCard
          icon="📦"
          title="ยอดตู้ที่ตรวจผ่าน (Verified Runs)"
          value={`${metrics.verifiedContainers.toLocaleString()} ตู้`}
          subtext={`⏳ รอตรวจ/รอแมตช์: ${metrics.pendingContainers} ตู้`}
          color="blue"
        />

        <KpiCard
          icon="💵"
          title="รายรับจากท่าเรือ (Gross Revenue)"
          value={`฿${metrics.totalPortRevenue.toLocaleString()}`}
          subtext="คำนวณจากเรทตู้ 20'/40'/45' ท่าเรือ"
          color="green"
        />

        <KpiCard
          icon="⛽"
          title="ต้นทุนฟลีทรวม (Total Operating Cost)"
          value={`฿${metrics.totalOperatingCost.toLocaleString()}`}
          subtext={`น้ำมัน: ฿${metrics.totalFuel.toLocaleString()} | ซ่อม: ฿${metrics.totalMaintenance.toLocaleString()}`}
          color="red"
        />

        <KpiCard
          icon="💰"
          title="กำไรสุทธิของฟลีท (Net Profit)"
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
              🏆 สรุปผลกำไร-ขาดทุนรายคันรถ (Truck Profit & Loss Leaderboard)
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
              เรียงลำดับตามความสามารถในการทำกำไรสุทธิเข้าบริษัท (รายรับท่าเรือ - รวมต้นทุนรถ)
            </p>
          </div>

          {setActiveTab && (
            <button
              type="button"
              onClick={() => setActiveTab('truck-pnl')}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                color: '#1e40af',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ดูรายงาน P&L ฉบับเต็ม ➔
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <span style={{ fontSize: '24px' }}>⏳</span>
            <p style={{ margin: '8px 0 0 0', fontSize: '13px' }}>กำลังประมวลผลข้อมูลแดชบอร์ด...</p>
          </div>
        ) : metrics.truckLeaderboard.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
            <span style={{ fontSize: '28px' }}>🚛</span>
            <p style={{ margin: '8px 0 0 0', fontSize: '13px', fontWeight: 600 }}>ยังไม่พบข้อมูลเที่ยววิ่งหรือค่าใช้จ่ายในงวดเดือน {selectedMonth}</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>เบอร์รถ</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>คนขับ</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>ตู้ที่ตรวจผ่าน</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#15803d' }}>รายรับจากท่าเรือ</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#b91c1c' }}>รวมต้นทุนรถ</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#1d4ed8' }}>กำไรสุทธิ</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>% กำไร</th>
                </tr>
              </thead>
              <tbody>
                {metrics.truckLeaderboard.map((t, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 12px', fontWeight: 800, color: '#1e40af' }}>🚛 {t.truck_no}</td>
                    <td style={{ padding: '12px 12px', color: '#334155' }}>{t.driver_name}</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700 }}>{t.total_containers} ตู้</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700, color: '#15803d' }}>฿{t.port_revenue.toLocaleString()}</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>฿{t.total_cost.toLocaleString()}</td>
                    <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 800, color: t.net_profit >= 0 ? '#1d4ed8' : '#b91c1c', fontSize: '14px' }}>
                      ฿{t.net_profit.toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: t.net_profit >= 0 ? '#dcfce7' : '#fee2e2',
                        color: t.net_profit >= 0 ? '#15803d' : '#b91c1c',
                        fontWeight: 700,
                        fontSize: '12px'
                      }}>
                        {t.net_profit >= 0 ? `+${t.margin_pct}%` : `${t.margin_pct}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
