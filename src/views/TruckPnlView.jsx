import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';
import { portBillingService, DEFAULT_PORT_RATES } from '../services/portBillingService.js';
import { fetchTrucks } from '../services/truckDriverService.js';
import PortRatesView from './PortRatesView.jsx';
import KpiCard from '../components/ui/KpiCard.jsx';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import useActiveMonth from '../hooks/useActiveMonth.js';
import { normalizeExcelDate } from '../utils/matchingLogic.js';
import * as XLSX from 'xlsx';

export default function TruckPnlView({ defaultSubTab = 'revenue' }) {
  const [activeSubTab, setActiveSubTab] = useState(defaultSubTab);
  const [selectedMonth, setSelectedMonth] = useActiveMonth();
  const [cycleFilter, setCycleFilter] = useState('ALL'); // 'ALL', 'H1' (1-15), 'H2' (16-สิ้นเดือน)
  const [loading, setLoading] = useState(true);
  const [containers, setContainers] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [portRates, setPortRates] = useState(DEFAULT_PORT_RATES);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTruckDetail, setSelectedTruckDetail] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [year, month] = (selectedMonth || new Date().toISOString().slice(0, 7)).split('-');
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const startOfMonth = `${selectedMonth}-01`;
      const endOfMonth = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

      const [
        ratesRes,
        trucksRes,
        masterRes
      ] = await Promise.all([
        portBillingService.fetchPortRates(),
        fetchTrucks(),
        supabase
          .from('container_records')
          .select('id, container_no, truck_no, port, size, date_job, date_job_parsed, batch_name')
          .or(`and(date_job_parsed.gte.${startOfMonth},date_job_parsed.lte.${endOfMonth}),batch_name.ilike.%${selectedMonth}%,date_job.ilike.%${selectedMonth}%`)
          .limit(10000)
      ]);

      const ratesList = Array.isArray(ratesRes) ? ratesRes : (ratesRes?.data || []);
      const trucksList = Array.isArray(trucksRes) ? trucksRes : (trucksRes?.data || []);
      let masterList = Array.isArray(masterRes?.data) ? masterRes.data : (Array.isArray(masterRes) ? masterRes : []);

      if (masterList.length === 0) {
        const fallbackRes = await supabase
          .from('container_records')
          .select('id, container_no, truck_no, port, size, date_job, date_job_parsed, batch_name')
          .limit(5000);
        if (Array.isArray(fallbackRes?.data) && fallbackRes.data.length > 0) {
          masterList = fallbackRes.data;
        }
      }

      setPortRates(ratesList);
      setTrucks(trucksList);
      setContainers(masterList);
    } catch (err) {
      console.error('load revenue data error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // คำนวณรายได้รถเพียวๆ จากใบวางบิล Master DB (container_records)
  const revenueData = useMemo(() => {
    const [yStr, mStr] = (selectedMonth || new Date().toISOString().slice(0, 7)).split('-');
    const year = Number(yStr) || new Date().getFullYear();
    const month = Number(mStr) || (new Date().getMonth() + 1);
    const lastDayNum = new Date(year, month, 0).getDate();

    let startDate = `${selectedMonth}-01`;
    let endDate = `${selectedMonth}-${String(lastDayNum).padStart(2, '0')}`;

    if (cycleFilter === 'H1') {
      startDate = `${selectedMonth}-01`;
      endDate = `${selectedMonth}-15`;
    } else if (cycleFilter === 'H2') {
      startDate = `${selectedMonth}-16`;
      endDate = `${selectedMonth}-${String(lastDayNum).padStart(2, '0')}`;
    }

    const safeContainers = Array.isArray(containers) ? containers : [];
    const safeTrucks = Array.isArray(trucks) ? trucks : [];

    // 1. กรองตู้จากใบวางบิล Master DB ในงวดที่เลือก
    const monthlyContainers = safeContainers.filter(item => {
      const rawDate = item.date_job_parsed || item.date_job || '';
      const isoDate = normalizeExcelDate(rawDate);
      return isoDate >= startDate && isoDate <= endDate;
    });

    // 2. Map รถและคำนวณรายได้แยกตามตู้ 20", 40", 45"
    const truckMap = {};

    // เริ่มต้นจากทะเบียนรถทั้งหมดในระบบ
    safeTrucks.forEach(tr => {
      const tNo = String(tr.truck_no || '').trim();
      if (!tNo) return;
      truckMap[tNo] = {
        truck_no: tNo,
        count_20: 0,
        revenue_20: 0,
        count_40: 0,
        revenue_40: 0,
        count_45: 0,
        revenue_45: 0,
        total_containers: 0,
        total_port_revenue: 0,
        items: []
      };
    });

    // รวมตู้รายคันรถจากใบวางบิล Master DB
    monthlyContainers.forEach(item => {
      const tNo = String(item.truck_no || '').trim() || 'ไม่ระบุ';
      const size = String(item.size || '20').trim();
      const rawDate = item.date_job_parsed || item.date_job || '';
      const jobDate = normalizeExcelDate(rawDate);
      const unitPrice = portBillingService.calculatePortUnitPrice(size, jobDate, portRates);
      const effectiveRatePeriod = portBillingService.findEffectivePortRate(jobDate, portRates);

      if (!truckMap[tNo]) {
        truckMap[tNo] = {
          truck_no: tNo,
          count_20: 0,
          revenue_20: 0,
          count_40: 0,
          revenue_40: 0,
          count_45: 0,
          revenue_45: 0,
          total_containers: 0,
          total_port_revenue: 0,
          items: []
        };
      }

      truckMap[tNo].total_containers += 1;
      truckMap[tNo].total_port_revenue += unitPrice;

      if (size.includes('45')) {
        truckMap[tNo].count_45 += 1;
        truckMap[tNo].revenue_45 += unitPrice;
      } else if (size.includes('40')) {
        truckMap[tNo].count_40 += 1;
        truckMap[tNo].revenue_40 += unitPrice;
      } else {
        truckMap[tNo].count_20 += 1;
        truckMap[tNo].revenue_20 += unitPrice;
      }

      truckMap[tNo].items.push({
        id: item.id,
        container_no: item.container_no,
        size,
        date_job: jobDate || rawDate,
        raw_date: rawDate,
        unit_price: unitPrice,
        period_name: effectiveRatePeriod?.period_name || '-'
      });
    });

    const rows = Object.values(truckMap);

    // กรองค้นหา
    const filtered = rows.filter(r => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return r.truck_no.toLowerCase().includes(q);
    });

    // เรียงลำดับจากรายได้สูงสุด
    filtered.sort((a, b) => b.total_port_revenue - a.total_port_revenue);

    // ยอดรวมทั้งระบบ
    const totalPortRevenue = rows.reduce((sum, r) => sum + r.total_port_revenue, 0);
    const totalContainers = rows.reduce((sum, r) => sum + r.total_containers, 0);
    const totalCount20 = rows.reduce((sum, r) => sum + r.count_20, 0);
    const totalRevenue20 = rows.reduce((sum, r) => sum + r.revenue_20, 0);
    const totalCount40 = rows.reduce((sum, r) => sum + r.count_40, 0);
    const totalRevenue40 = rows.reduce((sum, r) => sum + r.revenue_40, 0);
    const totalCount45 = rows.reduce((sum, r) => sum + r.count_45, 0);
    const totalRevenue45 = rows.reduce((sum, r) => sum + r.revenue_45, 0);
    const activeTruckCount = rows.filter(r => r.total_containers > 0).length;

    return {
      rows: filtered,
      totalPortRevenue,
      totalContainers,
      totalCount20,
      totalRevenue20,
      totalCount40,
      totalRevenue40,
      totalCount45,
      totalRevenue45,
      activeTruckCount,
      totalTruckCount: rows.length
    };
  }, [containers, trucks, portRates, selectedMonth, cycleFilter, searchQuery]);

  const exportToExcel = () => {
    const cycleLabel = cycleFilter === 'H1' ? 'ครึ่งแรก' : cycleFilter === 'H2' ? 'ครึ่งหลัง' : 'ทั้งเดือน';
    const rows = revenueData.rows.map((t, idx) => ({
      'ลำดับ': idx + 1,
      'ทะเบียนรถ': t.truck_no,
      'ตู้ 20" (เที่ยว)': t.count_20,
      'รายได้ 20" (บาท)': t.revenue_20,
      'ตู้ 40" (เที่ยว)': t.count_40,
      'รายได้ 40" (บาท)': t.revenue_40,
      'ตู้ 45" (เที่ยว)': t.count_45,
      'รายได้ 45" (บาท)': t.revenue_45,
      'รวมจำนวนตู้ (เที่ยว)': t.total_containers,
      'รวมรายได้ท่าเรือ (บาท)': t.total_port_revenue
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Truck_Revenue_${selectedMonth}`);
    XLSX.writeFile(wb, `Truck_Revenue_Report_${selectedMonth}_${cycleLabel}.xlsx`);
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
        gap: '16px'
      }}>
      
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
              {activeSubTab === 'revenue' ? 'รายได้รถ (Truck Revenue)' : 'ค่าเที่ยวท่าเรือ (Port Billing Rates)'}
            </h1>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            {activeSubTab === 'revenue'
              ? 'สรุปรายได้ที่รถแต่ละคันสร้างจากตู้ท่าเรือในใบวางบิล คำนวณตามขนาดตู้ 20"/40"/45" และเรทช่วงเวลาจริง'
              : 'กำหนดราคาตู้ 20" และ 40" ที่ท่าเรือจ่ายให้เรา แยกตามรอบครึ่งเดือนแรก (1-15) และครึ่งเดือนหลัง (16-สิ้นเดือน)'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <MonthPicker
            value={selectedMonth}
            onChange={setSelectedMonth}
            label="เดือน:"
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
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
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
          { id: 'revenue', label: '📈 รายได้รถ', desc: 'สรุปรายได้ตู้ท่าเรือรายคัน' },
          { id: 'rates', label: '💵 ค่าเที่ยวท่าเรือ', desc: 'ตั้งค่าราคาตู้ 20"/40" ตามช่วงเวลา' }
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
              icon="💰"
              title="รายรับจากท่าเรือรวม"
              value={`฿${revenueData.totalPortRevenue.toLocaleString()}`}
              subtext={`รวมตู้ที่ตรวจผ่าน: ${revenueData.totalContainers.toLocaleString()} ตู้`}
              color="emerald"
            />
            <KpiCard
              icon="📦"
              title="รายได้ตู้ 20 ฟุต"
              value={`฿${revenueData.totalRevenue20.toLocaleString()}`}
              subtext={`จำนวน: ${revenueData.totalCount20.toLocaleString()} เที่ยว`}
              color="blue"
            />
            <KpiCard
              icon="📦"
              title="รายได้ตู้ 40 ฟุต"
              value={`฿${revenueData.totalRevenue40.toLocaleString()}`}
              subtext={`จำนวน: ${revenueData.totalCount40.toLocaleString()} เที่ยว`}
              color="purple"
            />
            <KpiCard
              icon="🚚"
              title="รถที่วิ่งงานในงวดนี้"
              value={`${revenueData.activeTruckCount} / ${revenueData.totalTruckCount} คัน`}
              subtext="จำนวนรถที่มีรายรับจากตู้"
              color="orange"
            />
          </div>

          {/* 📋 Pure Truck Revenue Table */}
          <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            
            {/* Table Header Filter Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              
              {/* Half-Month Cycle Tabs Filter */}
              <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                {[
                  { id: 'ALL', label: '📅 ทั้งเดือน' },
                  { id: 'H1', label: '🌓 ครึ่งแรก (1-15)' },
                  { id: 'H2', label: '🌕 ครึ่งหลัง (16-สิ้นเดือน)' }
                ].map(cycle => (
                  <button
                    key={cycle.id}
                    type="button"
                    onClick={() => setCycleFilter(cycle.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: cycleFilter === cycle.id ? '#ffffff' : 'transparent',
                      color: cycleFilter === cycle.id ? '#0f172a' : '#64748b',
                      fontWeight: cycleFilter === cycle.id ? 700 : 500,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      boxShadow: cycleFilter === cycle.id ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                    }}
                  >
                    {cycle.label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div style={{ width: '260px' }}>
                <input
                  type="text"
                  placeholder="🔍 ค้นหาทะเบียนรถ..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>กำลังคำนวณรายได้รถ...</div>
            ) : revenueData.rows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
                ไม่พบข้อมูลรายได้รถในงวด {selectedMonth}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 800 }}>
                      <th style={{ padding: '10px 12px', textAlign: 'center', width: '45px' }}>#</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>ทะเบียนรถ</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#2563eb' }}>ตู้ 20" (เที่ยว)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', color: '#2563eb' }}>รายได้ 20" (บาท)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#7c3aed' }}>ตู้ 40" (เที่ยว)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', color: '#7c3aed' }}>รายได้ 40" (บาท)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', color: '#0f172a' }}>รวมจำนวนตู้</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', color: '#059669', fontSize: '13.5px' }}>รวมรายได้ท่าเรือ</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>รายละเอียด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueData.rows.map((row, idx) => (
                      <tr key={row.truck_no || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '12px', fontWeight: 800, color: '#0f172a' }}>
                          🚛 {row.truck_no}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#2563eb' }}>
                          {row.count_20 > 0 ? row.count_20 : '-'}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>
                          {row.revenue_20 > 0 ? `฿${row.revenue_20.toLocaleString()}` : '-'}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#7c3aed' }}>
                          {row.count_40 > 0 ? row.count_40 : '-'}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#7c3aed' }}>
                          {row.revenue_40 > 0 ? `฿${row.revenue_40.toLocaleString()}` : '-'}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 800, color: '#0f172a' }}>
                          {row.total_containers > 0 ? row.total_containers : '-'}
                        </td>
                        <td style={{
                          padding: '12px',
                          textAlign: 'right',
                          fontWeight: 900,
                          fontSize: '14.5px',
                          color: row.total_port_revenue > 0 ? '#059669' : '#94a3b8'
                        }}>
                          ฿{row.total_port_revenue.toLocaleString()}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {row.total_containers > 0 ? (
                            <button
                              type="button"
                              onClick={() => setSelectedTruckDetail(row)}
                              style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                border: '1px solid #93c5fd',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              🔍 ดูตู้ ({row.total_containers})
                            </button>
                          ) : (
                            <span style={{ color: '#cbd5e1' }}>-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* 🔍 Drill-down Modal: รายละเอียดตู้ของรถคันนั้น */}
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
            zIndex: 99999
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              width: '700px',
              maxWidth: '92vw',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                  🚛 รายละเอียดตู้: รถ {selectedTruckDetail.truck_no}
                </h3>
                <p style={{ margin: '3px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                  รวม {selectedTruckDetail.total_containers} ตู้ | รายรับรวม: ฿{selectedTruckDetail.total_port_revenue.toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTruckDetail(null)}
                style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>วันที่วิ่งงาน</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>เลขตู้</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>ขนาด</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>ช่วงค่าเที่ยวท่าเรือ</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', color: '#059669' }}>ราคา (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTruckDetail.items.map((item, idx) => (
                    <tr key={item.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', color: '#334155', fontWeight: 600 }}>{item.date_job || '-'}</td>
                      <td style={{ padding: '10px', fontWeight: 800, color: '#1e40af', fontFamily: 'monospace' }}>{item.container_no}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: item.size?.includes('40') ? '#f5f3ff' : '#eff6ff',
                          color: item.size?.includes('40') ? '#7c3aed' : '#2563eb',
                          fontWeight: 700,
                          fontSize: '11.5px'
                        }}>
                          {item.size}
                        </span>
                      </td>
                      <td style={{ padding: '10px', color: '#64748b' }}>🏷️ {item.period_name}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: '13.5px' }}>
                        ฿{Number(item.unit_price).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setSelectedTruckDetail(null)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
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
