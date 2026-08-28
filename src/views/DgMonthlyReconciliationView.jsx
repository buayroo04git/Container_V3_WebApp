import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { jobSheetService } from '../services/jobSheetService';
import { containerService } from '../services/containerService';
import { fetchTrucks } from '../services/truckDriverService';
import { cleanBatchName, normalizeExcelDate, parseBatchPeriod } from '../utils/matchingLogic';
import MonthPicker from '../components/ui/MonthPicker';
import useActiveMonth from '../hooks/useActiveMonth';
import UniversalTableContainer from '../components/ui/UniversalTableContainer';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export default function DgMonthlyReconciliationView({ activeTab, setActiveTab }) {
  const [selectedMonth, setSelectedMonth] = useActiveMonth();
  const [isLoading, setIsLoading] = useState(true);
  const [trucksList, setTrucksList] = useState([]);
  const [masterContainers, setMasterContainers] = useState([]);
  const [jobSheets, setJobSheets] = useState([]);
  const [jobSheetItems, setJobSheetItems] = useState([]);

  // คำนวณชื่อเดือนภาษาไทยและปี พ.ศ.
  const monthDisplay = useMemo(() => {
    if (!selectedMonth || selectedMonth === 'ALL') return 'ทุกเดือน';
    const [yStr, mStr] = selectedMonth.split('-');
    const yNum = parseInt(yStr, 10);
    const mNum = parseInt(mStr, 10);
    const thaiYear = yNum > 2400 ? yNum : yNum + 543;
    const thaiMonth = THAI_MONTHS[mNum - 1] || mStr;
    return `${thaiMonth} ${thaiYear}`;
  }, [selectedMonth]);

  // 1. โหลดข้อมูลทั้งหมดที่จำเป็นสำหรับการกระทบยอด
  useEffect(() => {
    loadReconciliationData();
  }, [selectedMonth]);

  const loadReconciliationData = async () => {
    setIsLoading(true);
    try {
      const [trucksRes, masterRes, sheetsRes, itemsRes] = await Promise.all([
        supabase.from('truck_records').select('*').order('truck_no'),
        supabase.from('container_records').select('*'),
        supabase.from('job_sheets').select('*').neq('status', 'deleted'),
        supabase.from('job_sheet_items').select('*')
      ]);

      setTrucksList(trucksRes?.data || []);
      setMasterContainers(masterRes?.data || []);
      setJobSheets(sheetsRes?.data || []);
      setJobSheetItems(itemsRes?.data || []);
    } catch (err) {
      console.error('Error loading reconciliation data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. ลอจิกการประมวลผลคำนวณแถวข้อมูลตู้ DG ประจำเดือนแยกรายรถ
  const rows = useMemo(() => {
    const targetMonth = selectedMonth && selectedMonth !== 'ALL' ? selectedMonth : '2026-08';
    const [tYear, tMonth] = targetMonth.split('-');
    const tYearNum = parseInt(tYear, 10);
    const tMonthNum = parseInt(tMonth, 10);

    // Period Index ของเดือนปัจจุบัน:
    // ครึ่งแรก (1-15): targetMonth + 0
    // ครึ่งหลัง (16-31): targetMonth + 1
    const pIndexH1 = tYearNum * 24 + (tMonthNum - 1) * 2 + 0;
    const pIndexH2 = tYearNum * 24 + (tMonthNum - 1) * 2 + 1;

    // รวบรวมเบอร์รถทั้งหมด
    const truckMap = new Map();
    trucksList.forEach(t => {
      if (t.truck_no && t.truck_no !== '-') {
        truckMap.set(String(t.truck_no).trim(), {
          truck_no: String(t.truck_no).trim(),
          truck_license: t.truck_license || '-',
          owner: t.owner || t.owner_name || '-'
        });
      }
    });

    // เพิ่มเบอร์รถที่พบในใบงานหรือใบวางบิล
    [...masterContainers, ...jobSheets].forEach(r => {
      const tNo = String(r.truck_no || '').trim().replace(/^รถ\s*/, '');
      if (tNo && tNo !== '-' && !truckMap.has(tNo)) {
        truckMap.set(tNo, {
          truck_no: tNo,
          truck_license: r.truck_license || '-',
          owner: '-'
        });
      }
    });

    const sortedTrucks = Array.from(truckMap.values()).sort((a, b) => 
      a.truck_no.localeCompare(b.truck_no, undefined, { numeric: true })
    );

    // Map sheet id to sheet
    const sheetMap = new Map();
    jobSheets.forEach(s => sheetMap.set(s.id, s));

    return sortedTrucks.map((truck, idx) => {
      const tNo = truck.truck_no;

      // -------------------------------------------------------------
      // A. ตู้ในใบวางบิล (Billing / Master DB) ของรถคันนี้ในเดือนนี้
      // -------------------------------------------------------------
      const truckMasterThisMonth = masterContainers.filter(m => {
        if (String(m.truck_no || '').trim() !== tNo) return false;
        const norm = m.date_job_parsed || normalizeExcelDate(m.date_job);
        const batch = cleanBatchName(m.batch_name || m.source_file);
        const bPeriod = parseBatchPeriod(batch);
        if (bPeriod && bPeriod.year === tYearNum && bPeriod.month === tMonthNum) return true;
        return (norm && norm.startsWith(targetMonth));
      });

      // แยกตามช่วง 1-15 และ 16-31
      let h1_size20_billed = 0;
      let h1_size40_billed = 0;
      let h2_size20_billed = 0;
      let h2_size40_billed = 0;

      truckMasterThisMonth.forEach(m => {
        const norm = m.date_job_parsed || normalizeExcelDate(m.date_job);
        const day = norm ? parseInt(norm.slice(8, 10), 10) : 1;
        const sz = String(m.size || '');
        const is20 = sz.includes('20');
        const is40 = sz.includes('40') || sz.includes('45');

        if (day <= 15) {
          if (is20) h1_size20_billed++;
          else if (is40) h1_size40_billed++;
          else h1_size20_billed++;
        } else {
          if (is20) h2_size20_billed++;
          else if (is40) h2_size40_billed++;
          else h2_size20_billed++;
        }
      });

      const h1_billed_total = h1_size20_billed + h1_size40_billed;
      const h2_billed_total = h2_size20_billed + h2_size40_billed;
      const total_billed = h1_billed_total + h2_billed_total;

      // -------------------------------------------------------------
      // B. ตู้ในใบงาน (Job Sheets) ของรถคันนี้ในเดือนนี้ (1)
      // -------------------------------------------------------------
      const truckSheetsThisMonth = jobSheets.filter(s => {
        if (String(s.truck_no || '').trim() !== tNo) return false;
        const sCleanBatch = cleanBatchName(s.batch_name);
        const sPeriod = parseBatchPeriod(sCleanBatch);
        if (sPeriod && sPeriod.year === tYearNum && sPeriod.month === tMonthNum) return true;
        if (s.created_at && s.created_at.startsWith(targetMonth)) return true;
        return false;
      });

      const sheetIdsThisMonth = new Set(truckSheetsThisMonth.map(s => s.id));
      const truckItemsThisMonth = jobSheetItems.filter(i => {
        if (sheetIdsThisMonth.has(i.job_sheet_id)) return true;
        const s = sheetMap.get(i.job_sheet_id);
        if (s && String(s.truck_no || '').trim() === tNo) {
          const sCleanBatch = cleanBatchName(s.batch_name);
          const sPeriod = parseBatchPeriod(sCleanBatch);
          if (sPeriod && sPeriod.year === tYearNum && sPeriod.month === tMonthNum) return true;
        }
        return false;
      });

      // นับตู้ใบงานช่วง 1-15 และ 16-31
      let h1_sheet_total = 0;
      let h2_sheet_total = 0;

      truckItemsThisMonth.forEach(i => {
        const s = sheetMap.get(i.job_sheet_id);
        const sCleanBatch = cleanBatchName(s?.batch_name);
        const sPeriod = parseBatchPeriod(sCleanBatch);
        const norm = i.date_job_parsed || normalizeExcelDate(i.date_job);
        const day = norm ? parseInt(norm.slice(8, 10), 10) : (sPeriod ? sPeriod.startDay : 1);

        if (day <= 15) h1_sheet_total++;
        else h2_sheet_total++;
      });

      const col1_total_sheets = truckItemsThisMonth.length;

      // -------------------------------------------------------------
      // C. Reconciliation Columns: (2), (3), (4)
      // -------------------------------------------------------------
      // (2) จำนวนตู้ใบงานที่วางบิลแล้วในเดือนก่อนหน้า (- หักออก)
      const col2_set = new Set();
      truckItemsThisMonth.forEach(item => {
        if (item.ref_master_id) {
          const matched = masterContainers.find(m => m.id === item.ref_master_id);
          if (matched) {
            const bPeriod = parseBatchPeriod(cleanBatchName(matched.batch_name || matched.source_file, matched.date_job_parsed || matched.date_job));
            if (bPeriod && bPeriod.periodIndex < pIndexH1) {
              col2_set.add(item.id);
            }
          }
        }
      });
      const col2_count = col2_set.size;

      // (3) จำนวนตู้วางบิลแล้วจากใบงานเดือนหน้า (+ บวกเข้า)
      // (อยู่ในใบวางบิลเดือนนี้ แต่ยังไม่มีในใบงานเดือนนี้)
      const itemContSet = new Set(truckItemsThisMonth.map(i => String(i.container_no).trim().toUpperCase()));
      const col3_count = truckMasterThisMonth.filter(m => !itemContSet.has(String(m.container_no).trim().toUpperCase())).length;

      // (4) จำนวนตู้ค้างวางบิลจากใบงานยกไปเดือนหน้า (- หักออก)
      // (อยู่ในใบงานเดือนนี้ แต่วางบิลไม่ทัน/ยกไปเดือนหน้า/ยังไม่วางบิล และไม่ซ้ำกับ col2)
      const masterContSet = new Set(truckMasterThisMonth.map(m => String(m.container_no).trim().toUpperCase()));
      const col4_count = truckItemsThisMonth.filter(i => !col2_set.has(i.id) && !masterContSet.has(String(i.container_no).trim().toUpperCase())).length;

      // รวมตู้ใบงานวางบิลเดือนนี้ = (1) - (2) + (3) - (4)
      const reconciled_total = col1_total_sheets - col2_count + col3_count - col4_count;
      const isReconciled = (reconciled_total === total_billed);

      return {
        index: idx + 1,
        truck_no: tNo,
        truck_license: truck.truck_license,
        owner: truck.owner,
        h1_size20_billed,
        h1_size40_billed,
        h1_billed_total,
        h1_sheet_total,
        h2_size20_billed,
        h2_size40_billed,
        h2_billed_total,
        h2_sheet_total,
        total_billed,
        reconciled_total,
        col1_total_sheets,
        col2_count,
        col3_count,
        col4_count,
        isReconciled,
        diff: reconciled_total - total_billed
      };
    });
  }, [trucksList, masterContainers, jobSheets, jobSheetItems, selectedMonth]);

  // ผลรวมท้ายตาราง (Grand Totals)
  const totals = useMemo(() => {
    return rows.reduce((acc, r) => {
      acc.h1_size20_billed += r.h1_size20_billed;
      acc.h1_size40_billed += r.h1_size40_billed;
      acc.h1_billed_total += r.h1_billed_total;
      acc.h1_sheet_total += r.h1_sheet_total;
      acc.h2_size20_billed += r.h2_size20_billed;
      acc.h2_size40_billed += r.h2_size40_billed;
      acc.h2_billed_total += r.h2_billed_total;
      acc.h2_sheet_total += r.h2_sheet_total;
      acc.total_billed += r.total_billed;
      acc.reconciled_total += r.reconciled_total;
      acc.col1_total_sheets += r.col1_total_sheets;
      acc.col2_count += r.col2_count;
      acc.col3_count += r.col3_count;
      acc.col4_count += r.col4_count;
      return acc;
    }, {
      h1_size20_billed: 0, h1_size40_billed: 0, h1_billed_total: 0, h1_sheet_total: 0,
      h2_size20_billed: 0, h2_size40_billed: 0, h2_billed_total: 0, h2_sheet_total: 0,
      total_billed: 0, reconciled_total: 0, col1_total_sheets: 0, col2_count: 0, col3_count: 0, col4_count: 0
    });
  }, [rows]);

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = rows.map(r => ({
      'ลำดับ': r.index,
      'ทะเบียน': r.truck_license,
      'เจ้าของรถ': r.owner,
      'เบอร์': r.truck_no,
      '1-15 ตู้ 20"': r.h1_size20_billed,
      '1-15 ตู้ 40"': r.h1_size40_billed,
      '1-15 จำนวนตู้วางบิล': r.h1_billed_total,
      '1-15 จำนวนตู้ใบงาน': r.h1_sheet_total,
      '16-31 ตู้ 20"': r.h2_size20_billed,
      '16-31 ตู้ 40"': r.h2_size40_billed,
      '16-31 จำนวนตู้วางบิล': r.h2_billed_total,
      '16-31 จำนวนตู้ใบงาน': r.h2_sheet_total,
      'รวมจำนวนตู้วางบิล': r.total_billed,
      'รวมจำนวนตู้ใบงาน วางบิลเดือนนี้ (1)+(2)+(3)+(4)': r.reconciled_total,
      'รวมจำนวนตู้ใบงาน (1)': r.col1_total_sheets,
      'จำนวนตู้ใบงานที่วางบิลแล้วในเดือนก่อนหน้า (2)': r.col2_count > 0 ? `(${r.col2_count})` : 0,
      'จำนวนตู้วางบิลแล้วจากใบงานเดือนหน้า (3)': r.col3_count,
      'จำนวนตู้ค้างวางบิลจากใบงานยกไปเดือนหน้า (4)': r.col4_count > 0 ? `(${r.col4_count})` : 0,
      'สถานะกระทบยอด': r.isReconciled ? '✓ ตรงกัน' : `⚠️ ต่าง ${r.diff}`
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DG_Reconciliation');
    XLSX.writeFile(wb, `ตู้_DG_ประจำเดือน_${selectedMonth || 'Report'}.xlsx`);
  };

  const headerCellStyle = {
    background: '#84cc16', // Lime green header matching 21826.png
    color: '#000000',
    fontWeight: 700,
    fontSize: '12px',
    textAlign: 'center',
    padding: '6px 8px',
    border: '1px solid #4d7c0f',
    verticalAlign: 'middle'
  };

  const subHeaderCellStyle = {
    ...headerCellStyle,
    background: '#a3e635',
    fontSize: '11.5px',
    padding: '4px 6px'
  };

  const bodyCellStyle = {
    padding: '6px 8px',
    fontSize: '12px',
    border: '1px solid #cbd5e1',
    textAlign: 'center',
    color: '#0f172a'
  };

  return (
    <div style={{ padding: '16px 20px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '12px' }}>
      
      {/* 1. Header Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📑</span> ตู้ DG ประจำเดือน {monthDisplay}
          </h2>
          <p style={{ margin: '3px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
            รายงานกระทบยอดจำนวนตู้ใบงาน vs ตู้วางบิล จำแนกขนาด 20"/40" และการยกยอดข้ามรอบ (1)+(2)+(3)+(4)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <MonthPicker
            value={selectedMonth}
            onChange={(newMonth) => setSelectedMonth(newMonth)}
            label="เลือกเดือน:"
          />
          <button
            onClick={handleExportExcel}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              border: '1px solid #16a34a',
              background: '#22c55e',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(34, 197, 94, 0.2)'
            }}
          >
            <span>📥</span> Export Excel
          </button>
        </div>
      </div>

      {/* 2. KPI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>🧾 รวมจำนวนตู้วางบิล</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#0369a1', marginTop: '2px' }}>{totals.total_billed.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600 }}>ตู้</span></div>
        </div>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>📄 รวมตู้ในใบงาน (1)</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{totals.col1_total_sheets.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600 }}>ตู้</span></div>
        </div>
        <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '10px', padding: '10px 14px' }}>
          <div style={{ fontSize: '11px', color: '#c2410c', fontWeight: 700 }}>↩️ วางบิลแล้วเดือนก่อน (2)</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#ea580c', marginTop: '2px' }}>({totals.col2_count.toLocaleString()}) <span style={{ fontSize: '12px', fontWeight: 600 }}>ตู้</span></div>
        </div>
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '10px 14px' }}>
          <div style={{ fontSize: '11px', color: '#15803d', fontWeight: 700 }}>↪️ วางบิลจากใบงานเดือนหน้า (3)</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#16a34a', marginTop: '2px' }}>+{totals.col3_count.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600 }}>ตู้</span></div>
        </div>
        <div style={{ background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: '10px', padding: '10px 14px' }}>
          <div style={{ fontSize: '11px', color: '#7e22ce', fontWeight: 700 }}>⏳ ค้างวางบิลยกไปเดือนหน้า (4)</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#9333ea', marginTop: '2px' }}>({totals.col4_count.toLocaleString()}) <span style={{ fontSize: '12px', fontWeight: 600 }}>ตู้</span></div>
        </div>
        <div style={{ background: totals.reconciled_total === totals.total_billed ? '#f0fdf4' : '#fef2f2', border: totals.reconciled_total === totals.total_billed ? '1px solid #86efac' : '1px solid #fca5a5', borderRadius: '10px', padding: '10px 14px' }}>
          <div style={{ fontSize: '11px', color: totals.reconciled_total === totals.total_billed ? '#15803d' : '#991b1b', fontWeight: 700 }}>🎯 สถานะการกระทบยอด</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: totals.reconciled_total === totals.total_billed ? '#16a34a' : '#dc2626', marginTop: '4px' }}>
            {totals.reconciled_total === totals.total_billed ? '✓ ยอดตรงกัน 100%' : `⚠️ ต่าง ${totals.reconciled_total - totals.total_billed} ตู้`}
          </div>
        </div>
      </div>

      {/* 3. Main Data Table with Excel Multi-Row Green Headers */}
      <div style={{ flex: 1, minHeight: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1400px' }}>
            <thead>
              {/* Row 1 Headers */}
              <tr>
                <th rowSpan={3} style={{ ...headerCellStyle, width: '45px' }}>ลำดับ</th>
                <th rowSpan={3} style={{ ...headerCellStyle, width: '90px' }}>ทะเบียน</th>
                <th rowSpan={3} style={{ ...headerCellStyle, width: '140px' }}>เจ้าของรถ</th>
                <th rowSpan={3} style={{ ...headerCellStyle, width: '65px', background: '#d9f99d' }}>เบอร์</th>
                <th colSpan={8} style={headerCellStyle}>วันที่</th>
                <th rowSpan={3} style={{ ...headerCellStyle, width: '85px', background: '#fed7aa' }}>รวมจำนวน<br/>ตู้วางบิล</th>
                <th rowSpan={3} style={{ ...headerCellStyle, width: '110px', background: '#fed7aa' }}>รวมจำนวนตู้<br/>ใบงาน วางบิล<br/>เดือนนี้<br/>(1)+(2)+(3)+(4)</th>
                <th rowSpan={3} style={{ ...headerCellStyle, width: '85px', background: '#fef08a' }}>รวมจำนวน<br/>ตู้ใบงาน<br/>(1)</th>
                <th rowSpan={3} style={{ ...headerCellStyle, width: '95px', background: '#ffedd5' }}>จำนวนตู้<br/>ใบงานที่วาง<br/>บิลแล้วใน<br/>เดือนก่อนหน้า<br/>(2)</th>
                <th rowSpan={3} style={{ ...headerCellStyle, width: '95px', background: '#dcfce7' }}>จำนวนตู้<br/>วางบิลแล้ว<br/>จากใบงาน<br/>เดือนหน้า<br/>(3)</th>
                <th rowSpan={3} style={{ ...headerCellStyle, width: '95px', background: '#f3e8ff' }}>จำนวนตู้<br/>ค้างวางบิล<br/>จากใบงาน<br/>ยกไปเดือนหน้า<br/>(4)</th>
                <th rowSpan={3} style={{ ...headerCellStyle, width: '90px' }}>หมายเหตุ</th>
              </tr>

              {/* Row 2 Headers (Half Month Splits) */}
              <tr>
                <th colSpan={4} style={{ ...subHeaderCellStyle, background: '#bef264' }}>1 - 15</th>
                <th colSpan={4} style={{ ...subHeaderCellStyle, background: '#bef264' }}>16 - 31</th>
              </tr>

              {/* Row 3 Headers (Size and Count Splits) */}
              <tr>
                <th style={{ ...subHeaderCellStyle, width: '55px' }}>ตู้ 20"</th>
                <th style={{ ...subHeaderCellStyle, width: '55px' }}>ตู้ 40"</th>
                <th style={{ ...subHeaderCellStyle, width: '70px', background: '#fef08a' }}>จำนวน<br/>ตู้วางบิล</th>
                <th style={{ ...subHeaderCellStyle, width: '70px', background: '#fef08a' }}>จำนวน<br/>ตู้ใบงาน</th>

                <th style={{ ...subHeaderCellStyle, width: '55px' }}>ตู้ 20"</th>
                <th style={{ ...subHeaderCellStyle, width: '55px' }}>ตู้ 40"</th>
                <th style={{ ...subHeaderCellStyle, width: '70px', background: '#fef08a' }}>จำนวน<br/>ตู้วางบิล</th>
                <th style={{ ...subHeaderCellStyle, width: '70px', background: '#fef08a' }}>จำนวน<br/>ตู้ใบงาน</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={18} style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                    ⏳ กำลังประมวลผลและคำนวณการกระทบยอดตู้ DG...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={18} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                    ไม่พบข้อมูลรถในรอบเดือน {monthDisplay}
                  </td>
                </tr>
              ) : (
                rows.map((r, rIdx) => {
                  const isAlt = rIdx % 2 === 1;
                  const rowBg = isAlt ? '#f8fafc' : '#ffffff';

                  return (
                    <tr key={r.truck_no} style={{ background: rowBg }}>
                      <td style={bodyCellStyle}>{r.index}</td>
                      <td style={{ ...bodyCellStyle, fontWeight: 600, color: '#334155', fontFamily: "'SF Mono', monospace" }}>{r.truck_license}</td>
                      <td style={{ ...bodyCellStyle, textAlign: 'left', fontWeight: 600 }}>{r.owner}</td>
                      <td style={{ ...bodyCellStyle, fontWeight: 700, color: '#1e3a8a', background: '#eff6ff' }}>{r.truck_no}</td>

                      {/* 1-15 Breakdown */}
                      <td style={bodyCellStyle}>{r.h1_size20_billed || 0}</td>
                      <td style={bodyCellStyle}>{r.h1_size40_billed || 0}</td>
                      <td style={{ ...bodyCellStyle, fontWeight: 700, background: '#fef9c3' }}>{r.h1_billed_total}</td>
                      <td style={{ ...bodyCellStyle, fontWeight: 700, color: '#0369a1', background: '#f0f9ff' }}>{r.h1_sheet_total}</td>

                      {/* 16-31 Breakdown */}
                      <td style={bodyCellStyle}>{r.h2_size20_billed || 0}</td>
                      <td style={bodyCellStyle}>{r.h2_size40_billed || 0}</td>
                      <td style={{ ...bodyCellStyle, fontWeight: 700, background: '#fef9c3' }}>{r.h2_billed_total}</td>
                      <td style={{ ...bodyCellStyle, fontWeight: 700, color: '#0369a1', background: '#f0f9ff' }}>{r.h2_sheet_total}</td>

                      {/* Total Billed */}
                      <td style={{ ...bodyCellStyle, fontWeight: 800, fontSize: '13px', background: '#ffedd5', color: '#c2410c' }}>
                        {r.total_billed}
                      </td>

                      {/* Reconciled Result (1)+(2)+(3)+(4) */}
                      <td style={{
                        ...bodyCellStyle,
                        fontWeight: 800,
                        fontSize: '13px',
                        background: r.isReconciled ? '#ffedd5' : '#fee2e2',
                        color: r.isReconciled ? '#c2410c' : '#dc2626'
                      }}>
                        {r.reconciled_total}
                      </td>

                      {/* (1) Total Sheets */}
                      <td style={{ ...bodyCellStyle, fontWeight: 700, background: '#fef08a', color: '#854d0e' }}>
                        {r.col1_total_sheets}
                      </td>

                      {/* (2) Billed in Prev Month */}
                      <td style={{ ...bodyCellStyle, fontWeight: 700, color: r.col2_count > 0 ? '#ea580c' : '#94a3b8' }}>
                        {r.col2_count > 0 ? `(${r.col2_count})` : '0'}
                      </td>

                      {/* (3) Billed This Month from Next Sheet */}
                      <td style={{ ...bodyCellStyle, fontWeight: 700, color: r.col3_count > 0 ? '#16a34a' : '#94a3b8' }}>
                        {r.col3_count > 0 ? `+${r.col3_count}` : '0'}
                      </td>

                      {/* (4) Unbilled Rolled Forward */}
                      <td style={{ ...bodyCellStyle, fontWeight: 700, color: r.col4_count > 0 ? '#9333ea' : '#94a3b8' }}>
                        {r.col4_count > 0 ? `(${r.col4_count})` : '0'}
                      </td>

                      {/* Remarks */}
                      <td style={{ ...bodyCellStyle, fontSize: '11px', color: '#64748b' }}>
                        {r.isReconciled ? '-' : `⚠️ ผลต่าง ${r.diff}`}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Total Row */}
            <tfoot>
              <tr style={{ background: '#facc15', fontWeight: 800, borderTop: '2px solid #ca8a04' }}>
                <td colSpan={4} style={{ ...bodyCellStyle, textAlign: 'center', fontWeight: 800, fontSize: '13px', color: '#713f12' }}>
                  รวมทั้งหมด (GRAND TOTAL)
                </td>
                <td style={{ ...bodyCellStyle, fontWeight: 800 }}>{totals.h1_size20_billed}</td>
                <td style={{ ...bodyCellStyle, fontWeight: 800 }}>{totals.h1_size40_billed}</td>
                <td style={{ ...bodyCellStyle, fontWeight: 800 }}>{totals.h1_billed_total}</td>
                <td style={{ ...bodyCellStyle, fontWeight: 800 }}>{totals.h1_sheet_total}</td>
                <td style={{ ...bodyCellStyle, fontWeight: 800 }}>{totals.h2_size20_billed}</td>
                <td style={{ ...bodyCellStyle, fontWeight: 800 }}>{totals.h2_size40_billed}</td>
                <td style={{ ...bodyCellStyle, fontWeight: 800 }}>{totals.h2_billed_total}</td>
                <td style={{ ...bodyCellStyle, fontWeight: 800 }}>{totals.h2_sheet_total}</td>
                <td style={{ ...bodyCellStyle, fontWeight: 800, fontSize: '14px', color: '#9a3412' }}>{totals.total_billed}</td>
                <td style={{ ...bodyCellStyle, fontWeight: 800, fontSize: '14px', color: '#9a3412' }}>{totals.reconciled_total}</td>
                <td style={{ ...bodyCellStyle, fontWeight: 800, fontSize: '14px', color: '#713f12' }}>{totals.col1_total_sheets}</td>
                <td style={{ ...bodyCellStyle, fontWeight: 800, color: '#c2410c' }}>{totals.col2_count > 0 ? `(${totals.col2_count})` : '0'}</td>
                <td style={{ ...bodyCellStyle, fontWeight: 800, color: '#15803d' }}>{totals.col3_count > 0 ? `+${totals.col3_count}` : '0'}</td>
                <td style={{ ...bodyCellStyle, fontWeight: 800, color: '#7e22ce' }}>{totals.col4_count > 0 ? `(${totals.col4_count})` : '0'}</td>
                <td style={{ ...bodyCellStyle, fontWeight: 700, fontSize: '11.5px', color: totals.reconciled_total === totals.total_billed ? '#15803d' : '#b91c1c' }}>
                  {totals.reconciled_total === totals.total_billed ? '✓ ตรงกัน 100%' : '⚠️ มีผลต่าง'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    </div>
  );
}
