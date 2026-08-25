import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';
import { portBillingService, DEFAULT_PORT_RATES } from '../services/portBillingService.js';
import { truckExpenseService } from '../services/truckExpenseService.js';
import { fetchTrucks } from '../services/truckDriverService.js';
import PortRatesView from './PortRatesView.jsx';
import KpiCard from '../components/ui/KpiCard.jsx';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import * as XLSX from 'xlsx';

export default function TruckPnlView({ defaultSubTab = 'revenue' }) {
  const [activeSubTab, setActiveSubTab] = useState(defaultSubTab);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [containers, setContainers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [portRates, setPortRates] = useState(DEFAULT_PORT_RATES);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        ratesRes,
        expensesRes,
        trucksRes,
        itemsRes
      ] = await Promise.all([
        portBillingService.fetchPortRates(),
        truckExpenseService.fetchExpenses(),
        fetchTrucks(),
        supabase.from('job_sheet_items').select('id, size, port, match_status, date_job_parsed, job_sheet_id, job_sheets(truck_no, driver_name, date_job_parsed)')
      ]);

      const ratesList = Array.isArray(ratesRes) ? ratesRes : (ratesRes?.data || []);
      const expensesList = Array.isArray(expensesRes) ? expensesRes : (expensesRes?.data || []);
      const trucksList = Array.isArray(trucksRes) ? trucksRes : (trucksRes?.data || []);
      const itemsList = Array.isArray(itemsRes) ? itemsRes : (itemsRes?.data || []);

      setPortRates(ratesList);
      setExpenses(expensesList);
      setTrucks(trucksList);
      setContainers(itemsList);
    } catch (err) {
      console.error('load P&L data error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const pnlData = useMemo(() => {
    const startOfMonth = `${selectedMonth}-01`;
    const endOfMonth = `${selectedMonth}-31`;

    const safeContainers = Array.isArray(containers) ? containers : [];
    const safeExpenses = Array.isArray(expenses) ? expenses : [];
    const safeTrucks = Array.isArray(trucks) ? trucks : [];

    // 1. ตู้ที่วิ่งในเดือนนี้
    const monthlyContainers = safeContainers.filter(item => {
      const date = item.date_job_parsed || item.job_sheets?.date_job_parsed || '';
      return date >= startOfMonth && date <= endOfMonth;
    });

    const verifiedContainers = monthlyContainers.filter(item => 
      item.match_status === 'matched_green' || item.match_status === 'verified'
    );

    // 2. ค่าใช้จ่ายในเดือนนี้
    const monthlyExpenses = safeExpenses.filter(exp => {
      const date = exp.expense_date || '';
      return date >= startOfMonth && date <= endOfMonth;
    });

    // 3. รวมยอดรายคันรถ
    const truckMap = {};

    // Init with all trucks
    safeTrucks.forEach(tr => {
      const tNo = tr.truck_no;
      truckMap[tNo] = {
        truck_no: tNo,
        driver_name: tr.assigned_driver_name || '-',
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
    });

    // Populate revenue
    verifiedContainers.forEach(item => {
      const tNo = item.job_sheets?.truck_no || 'ไม่ระบุ';
      const dName = item.job_sheets?.driver_name || '-';
      const size = item.size || '20';
      const jobDate = item.date_job_parsed || item.job_sheets?.date_job_parsed || '';
      const price = portBillingService.calculatePortUnitPrice(size, jobDate, portRates);

      if (!truckMap[tNo]) {
        truckMap[tNo] = {
          truck_no: tNo,
          driver_name: dName,
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

      truckMap[tNo].total_containers += 1;
      truckMap[tNo].port_revenue += price;
      if (dName !== '-' && truckMap[tNo].driver_name === '-') {
        truckMap[tNo].driver_name = dName;
      }

      if (String(size).includes('45')) truckMap[tNo].count_45 += 1;
      else if (String(size).includes('40')) truckMap[tNo].count_40 += 1;
      else truckMap[tNo].count_20 += 1;
    });

    // Populate expenses
    monthlyExpenses.forEach(exp => {
      const tNo = exp.truck_no || 'ไม่ระบุ';
      const cat = exp.category || 'other';
      const amt = Number(exp.amount) || 0;

      if (!truckMap[tNo]) {
        truckMap[tNo] = {
          truck_no: tNo,
          driver_name: '-',
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

      if (cat === 'fuel') truckMap[tNo].fuel_cost += amt;
      else if (cat === 'maintenance') truckMap[tNo].maintenance_cost += amt;
      else if (cat === 'toll') truckMap[tNo].toll_cost += amt;
      else if (cat === 'installment') truckMap[tNo].installment_cost += amt;
      else if (cat === 'driver_pay') truckMap[tNo].driver_cost += amt;
      else truckMap[tNo].misc_cost += amt;
    });

    // Calculate profit per truck
    const rows = Object.values(truckMap).map(t => {
      const totalCost = t.fuel_cost + t.maintenance_cost + t.toll_cost + t.installment_cost + t.misc_cost + t.driver_cost;
      const netProfit = t.port_revenue - totalCost;
      const margin = t.port_revenue > 0 ? ((netProfit / t.port_revenue) * 100).toFixed(1) : '0.0';

      return {
        ...t,
        total_cost: totalCost,
        net_profit: netProfit,
        margin_pct: Number(margin)
      };
    });

    // Filter by search
    const filtered = rows.filter(r => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return r.truck_no.toLowerCase().includes(q) || r.driver_name.toLowerCase().includes(q);
    });

    // Sort by profit descending
    filtered.sort((a, b) => b.net_profit - a.net_profit);

    // Summary Totals
    const totalRevenue = rows.reduce((sum, r) => sum + r.port_revenue, 0);
    const totalFuel = rows.reduce((sum, r) => sum + r.fuel_cost, 0);
    const totalMaint = rows.reduce((sum, r) => sum + r.maintenance_cost, 0);
    const totalCost = rows.reduce((sum, r) => sum + r.total_cost, 0);
    const totalNetProfit = totalRevenue - totalCost;
    const overallMargin = totalRevenue > 0 ? ((totalNetProfit / totalRevenue) * 100).toFixed(1) : '0.0';

    return {
      rows: filtered,
      totalRevenue,
      totalFuel,
      totalMaint,
      totalCost,
      totalNetProfit,
      overallMargin,
      totalContainers: verifiedContainers.length
    };
  }, [containers, expenses, trucks, portRates, selectedMonth, searchQuery]);

  const exportToExcel = () => {
    const rows = pnlData.rows.map((t, idx) => ({
      'ลำดับ': idx + 1,
      'ทะเบียนรถ': t.truck_no,
      'คนขับประจำ': t.driver_name,
      'ตู้ 20"': t.count_20,
      'ตู้ 40"': t.count_40,
      'ตู้ 45"': t.count_45,
      'รวมจำนวนตู้': t.total_containers,
      'รายรับจากท่าเรือ (บาท)': t.port_revenue,
      'ค่าน้ำมัน (บาท)': t.fuel_cost,
      'ค่าซ่อมบำรุง (บาท)': t.maintenance_cost,
      'ค่างวดรถ (บาท)': t.installment_cost,
      'ค่าทางด่วน/จิปาถะ (บาท)': t.toll_cost + t.misc_cost,
      'รวมต้นทุน (บาท)': t.total_cost,
      'กำไรสุทธิ (บาท)': t.net_profit,
      'อัตรากำไร (%)': `${t.margin_pct}%`
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `P&L_${selectedMonth}`);
    XLSX.writeFile(wb, `Truck_PnL_Report_${selectedMonth}.xlsx`);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* 🏷️ Header Bar with Month Picker & Subtabs */}
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
            <span style={{ fontSize: '22px' }}>📈</span>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
              {activeSubTab === 'revenue' ? 'รายได้และผลประกอบการรถ (Truck Revenue & Performance)' : 'เรทท่าเรือ (Port Billing Rates)'}
            </h1>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            {activeSubTab === 'revenue'
              ? 'สรุปรายได้ที่รถแต่ละคันสร้างจากตู้ท่าเรือ เปรียบเทียบกับต้นทุนฟลีท (น้ำมัน/ซ่อม/งวด)'
              : 'กำหนดราคาตู้ 20" และ 40" ที่ท่าเรือจ่ายให้เรา แยกตามรอบครึ่งเดือนแรก (1-15) และครึ่งเดือนหลัง (16-สิ้นเดือน)'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <MonthPicker
            value={selectedMonth}
            onChange={setSelectedMonth}
            label="งวดเดือน:"
          />

          {activeSubTab === 'revenue' && (
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
                cursor: 'pointer'
              }}
            >
              📥 ส่งออก Excel
            </button>
          )}
        </div>
      </div>

      {/* 🧭 Subtabs Navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
        {[
          { id: 'revenue', label: '📈 ผลประกอบการ & รายได้รถ', desc: 'สรุปรายได้และกำไรสุทธิรายคัน' },
          { id: 'rates', label: '💵 เรทท่าเรือ', desc: 'ตั้งค่าราคาตู้ 20"/40" ตามช่วงเวลา' }
        ].map(tab => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              style={{
                padding: '8px 18px',
                borderRadius: '10px 10px 0 0',
                border: 'none',
                borderBottom: isActive ? '3px solid #2563eb' : '3px solid transparent',
                background: isActive ? '#ffffff' : 'transparent',
                color: isActive ? '#2563eb' : '#64748b',
                fontWeight: isActive ? 800 : 600,
                fontSize: '13.5px',
                cursor: 'pointer',
                transition: 'all 0.1s'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Render based on activeSubTab */}
      {activeSubTab === 'rates' ? (
        <PortRatesView
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          onRatesChanged={loadData}
          isSubTab={true}
        />
      ) : (
        <>
          {/* 🌟 KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <KpiCard
              icon="💵"
              title="รายรับท่าเรือรวม"
              value={`฿${pnlData.totalRevenue.toLocaleString()}`}
              subtext={`จากตู้ที่ตรวจผ่าน: ${pnlData.totalContainers.toLocaleString()} ตู้`}
              color="blue"
            />
            <KpiCard
              icon="⛽"
              title="ค่าน้ำมันรวม"
              value={`฿${pnlData.totalFuel.toLocaleString()}`}
              subtext="ต้นทุนเชื้อเพลิงรวมของฟลีท"
              color="orange"
            />
            <KpiCard
              icon="🔧"
              title="ค่าซ่อมบำรุงรวม"
              value={`฿${pnlData.totalMaint.toLocaleString()}`}
              subtext="ต้นทุนบำรุงรักษารถ"
              color="purple"
            />
            <KpiCard
              icon="💰"
              title="กำไรสุทธิฟลีท (Net Profit)"
              value={`฿${pnlData.totalNetProfit.toLocaleString()}`}
              subtext={`อัตรากำไรเฉลี่ย: ${pnlData.overallMargin}%`}
              color={pnlData.totalNetProfit >= 0 ? 'emerald' : 'red'}
            />
          </div>

          {/* 📋 Ledger Table */}
          <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                🚚 บัญชีรายได้และต้นทุนรายคันรถ ({pnlData.rows.length} คัน)
              </h3>

              <div style={{ width: '260px' }}>
                <input
                  type="text"
                  placeholder="🔍 ค้นหาทะเบียนรถ, คนขับ..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>กำลังคำนวณรายได้รถ...</div>
            ) : pnlData.rows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
                ไม่พบข้อมูลผลประกอบการรถในงวด {selectedMonth}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>ทะเบียนรถ</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>คนขับประจำ</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>20'</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>40'</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>รวมตู้</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', color: '#059669' }}>รายรับท่าเรือ</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>ค่าน้ำมัน</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>ค่าซ่อม</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>ค่างวด</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626' }}>รวมต้นทุน</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>กำไรสุทธิ</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pnlData.rows.map((row, idx) => {
                      const isProfit = row.net_profit >= 0;
                      return (
                        <tr key={row.truck_no || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px', fontWeight: 800, color: '#0f172a' }}>
                            🚛 {row.truck_no}
                          </td>
                          <td style={{ padding: '12px', color: '#475569' }}>
                            {row.driver_name}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#3b82f6' }}>
                            {row.count_20 || '-'}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#8b5cf6' }}>
                            {row.count_40 || '-'}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', fontWeight: 800, color: '#0f172a' }}>
                            {row.total_containers}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: '13.5px' }}>
                            ฿{row.port_revenue.toLocaleString()}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', color: '#d97706', fontWeight: 600 }}>
                            {row.fuel_cost > 0 ? `฿${row.fuel_cost.toLocaleString()}` : '-'}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', color: '#7c3aed', fontWeight: 600 }}>
                            {row.maintenance_cost > 0 ? `฿${row.maintenance_cost.toLocaleString()}` : '-'}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', color: '#475569', fontWeight: 600 }}>
                            {row.installment_cost > 0 ? `฿${row.installment_cost.toLocaleString()}` : '-'}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                            ฿{row.total_cost.toLocaleString()}
                          </td>
                          <td style={{
                            padding: '12px',
                            textAlign: 'right',
                            fontWeight: 900,
                            fontSize: '14px',
                            color: isProfit ? '#059669' : '#dc2626'
                          }}>
                            ฿{row.net_profit.toLocaleString()}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: isProfit ? '#dcfce7' : '#fee2e2',
                              color: isProfit ? '#15803d' : '#b91c1c',
                              fontWeight: 800,
                              fontSize: '11.5px'
                            }}>
                              {row.margin_pct}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

    </div>
  );
}
