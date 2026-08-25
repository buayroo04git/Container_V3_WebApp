import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient.js';
import { portBillingService, DEFAULT_PORT_RATES } from '../services/portBillingService.js';
import { truckExpenseService } from '../services/truckExpenseService.js';
import { fetchTrucks } from '../services/truckDriverService.js';
import KpiCard from '../components/ui/KpiCard.jsx';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import * as XLSX from 'xlsx';

export default function TruckPnlView() {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [containers, setContainers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [portRates, setPortRates] = useState(DEFAULT_PORT_RATES);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [
          { data: ratesData },
          { data: expensesData },
          trucksData,
          { data: itemsData }
        ] = await Promise.all([
          portBillingService.fetchPortRates(),
          truckExpenseService.fetchExpenses(),
          fetchTrucks(),
          supabase.from('job_sheet_items').select('id, size, port, match_status, date_job_parsed, job_sheet_id, job_sheets(truck_no, driver_name, date_job_parsed)')
        ]);

        if (ratesData) setPortRates(ratesData);
        if (expensesData) setExpenses(expensesData);
        if (trucksData) setTrucks(trucksData);
        if (itemsData) setContainers(itemsData);
      } catch (err) {
        console.error('load P&L data error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
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

  const pnlData = useMemo(() => {
    const startOfMonth = `${selectedMonth}-01`;
    const endOfMonth = `${selectedMonth}-31`;

    const monthlyContainers = containers.filter(item => {
      const date = item.date_job_parsed || item.job_sheets?.date_job_parsed || '';
      return date >= startOfMonth && date <= endOfMonth;
    });

    const verifiedContainers = monthlyContainers.filter(item => 
      item.match_status === 'matched_green' || item.match_status === 'verified'
    );

    const truckMap = {};

    // Initial map from trucks list
    (trucks || []).forEach(tr => {
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
      const price = portBillingService.calculatePortUnitPrice(size, portRates);

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
      if (String(size).includes('45')) truckMap[tNo].count_45 += 1;
      else if (String(size).includes('40')) truckMap[tNo].count_40 += 1;
      else truckMap[tNo].count_20 += 1;

      truckMap[tNo].port_revenue += price;
      truckMap[tNo].driver_cost += 100;
    });

    // Populate expenses
    const monthlyExpenses = expenses.filter(exp => {
      const date = exp.expense_date || '';
      return date >= startOfMonth && date <= endOfMonth;
    });

    monthlyExpenses.forEach(exp => {
      const tNo = exp.truck_no || 'กองกลาง';
      const amt = Number(exp.amount_total) || 0;
      const cat = exp.category || 'misc';

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
      else if (cat === 'toll_port') truckMap[tNo].toll_cost += amt;
      else if (cat === 'installment') truckMap[tNo].installment_cost += amt;
      else truckMap[tNo].misc_cost += amt;
    });

    return Object.values(truckMap)
      .filter(t => t.total_containers > 0 || (t.fuel_cost + t.maintenance_cost + t.installment_cost) > 0)
      .map(t => {
        const totalCost = t.fuel_cost + t.maintenance_cost + t.toll_cost + t.installment_cost + t.misc_cost + t.driver_cost;
        const netProfit = t.port_revenue - totalCost;
        const margin = t.port_revenue > 0 ? (netProfit / t.port_revenue * 100).toFixed(1) : '0.0';
        return {
          ...t,
          total_cost: totalCost,
          net_profit: netProfit,
          margin_pct: margin
        };
      })
      .sort((a, b) => b.net_profit - a.net_profit);
  }, [containers, expenses, trucks, portRates, selectedMonth]);

  const filteredPnl = useMemo(() => {
    if (!searchQuery.trim()) return pnlData;
    const q = searchQuery.toLowerCase().trim();
    return pnlData.filter(t => 
      t.truck_no.toLowerCase().includes(q) || t.driver_name.toLowerCase().includes(q)
    );
  }, [pnlData, searchQuery]);

  const totals = useMemo(() => {
    const rev = filteredPnl.reduce((s, t) => s + t.port_revenue, 0);
    const cost = filteredPnl.reduce((s, t) => s + t.total_cost, 0);
    const profit = rev - cost;
    const margin = rev > 0 ? (profit / rev * 100).toFixed(1) : '0.0';
    return { rev, cost, profit, margin };
  }, [filteredPnl]);

  const exportToExcel = () => {
    const rows = filteredPnl.map((t, idx) => ({
      'ลำดับ': idx + 1,
      'เบอร์รถ': t.truck_no,
      'คนขับประจำ': t.driver_name,
      'ตู้รวม': t.total_containers,
      'ตู้ 20’': t.count_20,
      'ตู้ 40’': t.count_40,
      'ตู้ 45’': t.count_45,
      'รายรับจากท่าเรือ (บาท)': t.port_revenue,
      'ค่าน้ำมัน (บาท)': t.fuel_cost,
      'ค่าซ่อมบำรุง (บาท)': t.maintenance_cost,
      'ค่าผ่านทาง/ผ่านท่า (บาท)': t.toll_cost,
      'ค่างวดรถ (บาท)': t.installment_cost,
      'ค่ารอบคนขับ (บาท)': t.driver_cost,
      'รวมต้นทุนรถ (บาท)': t.total_cost,
      'กำไรสุทธิ (บาท)': t.net_profit,
      'อัตรากำไร (%)': `${t.margin_pct}%`
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `P&L_${selectedMonth}`);
    XLSX.writeFile(wb, `Truck_PnL_Report_${selectedMonth}.xlsx`);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header */}
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
              ผลประกอบการรายคันรถ (Truck Profit & Loss Ledger)
            </h1>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            สูตร: [รายรับจากท่าเรือตามขนาดตู้] - [ค่าน้ำมัน + ซ่อม + ค่างวด + ค่าแรง] = กำไรสุทธิของรถ
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <MonthPicker
            value={selectedMonth}
            onChange={setSelectedMonth}
            label="รอบเดือน:"
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
              cursor: 'pointer'
            }}
          >
            📥 ส่งออก Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <KpiCard icon="💵" title="รายรับจากท่าเรือรวม" value={`฿${totals.rev.toLocaleString()}`} subtext="จากตู้ที่ตรวจผ่านในรอบเดือน" color="green" />
        <KpiCard icon="⛽" title="รวมต้นทุนฟลีททั้งหมด" value={`฿${totals.cost.toLocaleString()}`} subtext="น้ำมัน + ซ่อม + งวด + ค่าแรง" color="red" />
        <KpiCard icon="💰" title="กำไรสุทธิรวม (Net Profit)" value={`฿${totals.profit.toLocaleString()}`} subtext={`อัตรากำไร: ${totals.margin}%`} color={totals.profit >= 0 ? 'green' : 'red'} />
      </div>

      {/* Main Table */}
      <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
        
        {/* Search */}
        <div style={{ marginBottom: '14px', maxWidth: '300px' }}>
          <input
            type="text"
            placeholder="🔍 ค้นหาเบอร์รถ หรือคนขับ..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '7px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>กำลังโหลดข้อมูล...</div>
        ) : filteredPnl.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
            ไม่พบข้อมูลในงวดเดือน {selectedMonth}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>เบอร์รถ</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>คนขับ</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>ตู้รวม</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#15803d' }}>รายรับท่าเรือ</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>ค่าน้ำมัน</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>ค่าซ่อม</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>ค่างวด</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>ค่ารอบคนขับ</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626' }}>รวมต้นทุน</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#1d4ed8' }}>กำไรสุทธิ</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>% กำไร</th>
                </tr>
              </thead>
              <tbody>
                {filteredPnl.map((t, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px', fontWeight: 800, color: '#1e40af' }}>🚛 {t.truck_no}</td>
                    <td style={{ padding: '12px' }}>{t.driver_name}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>{t.total_containers}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#15803d' }}>฿{t.port_revenue.toLocaleString()}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>฿{t.fuel_cost.toLocaleString()}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>฿{t.maintenance_cost.toLocaleString()}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>฿{t.installment_cost.toLocaleString()}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>฿{t.driver_cost.toLocaleString()}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>฿{t.total_cost.toLocaleString()}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: t.net_profit >= 0 ? '#1d4ed8' : '#dc2626', fontSize: '14px' }}>
                      ฿{t.net_profit.toLocaleString()}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: t.net_profit >= 0 ? '#dcfce7' : '#fee2e2',
                        color: t.net_profit >= 0 ? '#15803d' : '#dc2626',
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
