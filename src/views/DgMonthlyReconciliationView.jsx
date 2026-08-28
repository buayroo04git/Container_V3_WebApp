import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { jobSheetService } from '../services/jobSheetService';
import { containerService } from '../services/containerService';
import { cleanBatchName, normalizeExcelDate, parseBatchPeriod } from '../utils/matchingLogic';
import MonthPicker from '../components/ui/MonthPicker';
import useActiveMonth from '../hooks/useActiveMonth';
import ContainerImageModal from '../components/containers/ContainerImageModal';

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
  
  // 🔍 Interactive Popover & Modal State
  const [hoverPopover, setHoverPopover] = useState(null); // { x, y, title, items, badgeColor, type }
  const [drillDownModal, setDrillDownModal] = useState(null); // Full list modal
  const [previewImage, setPreviewImage] = useState(null);
  const popoverTimeoutRef = useRef(null);

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

  // 1. โหลดข้อมูลทั้งหมดสำหรับการกระทบยอด
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

    const sheetMap = new Map();
    jobSheets.forEach(s => sheetMap.set(s.id, s));

    return sortedTrucks.map((truck, idx) => {
      const tNo = truck.truck_no;

      // A. ตู้ในใบวางบิลของรถคันนี้ในเดือนนี้
      const truckMasterThisMonth = masterContainers.filter(m => {
        if (String(m.truck_no || '').trim() !== tNo) return false;
        const norm = m.date_job_parsed || normalizeExcelDate(m.date_job);
        const batch = cleanBatchName(m.batch_name || m.source_file);
        const bPeriod = parseBatchPeriod(batch);
        if (bPeriod && bPeriod.year === tYearNum && bPeriod.month === tMonthNum) return true;
        return (norm && norm.startsWith(targetMonth));
      });

      const h1_billed_items = [];
      const h2_billed_items = [];
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
          h1_billed_items.push(m);
          if (is20) h1_size20_billed++;
          else if (is40) h1_size40_billed++;
          else h1_size20_billed++;
        } else {
          h2_billed_items.push(m);
          if (is20) h2_size20_billed++;
          else if (is40) h2_size40_billed++;
          else h2_size20_billed++;
        }
      });

      const h1_billed_total = h1_size20_billed + h1_size40_billed;
      const h2_billed_total = h2_size20_billed + h2_size40_billed;
      const total_billed = h1_billed_total + h2_billed_total;

      // B. ตู้ในใบงานของรถคันนี้ในเดือนนี้ (1)
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

      const h1_sheet_items = [];
      const h2_sheet_items = [];

      truckItemsThisMonth.forEach(i => {
        const s = sheetMap.get(i.job_sheet_id);
        const sCleanBatch = cleanBatchName(s?.batch_name);
        const sPeriod = parseBatchPeriod(sCleanBatch);
        const norm = i.date_job_parsed || normalizeExcelDate(i.date_job);
        const day = norm ? parseInt(norm.slice(8, 10), 10) : (sPeriod ? sPeriod.startDay : 1);

        const enrichedItem = {
          ...i,
          sheet_truck_no: s?.truck_no || tNo,
          sheet_batch: sCleanBatch,
          sheet_image_url: s?.image_url,
          sheet_drive_file_id: s?.drive_file_id
        };

        if (day <= 15) h1_sheet_items.push(enrichedItem);
        else h2_sheet_items.push(enrichedItem);
      });

      const col1_total_sheets = truckItemsThisMonth.length;

      // C. Reconciliation Columns: (2), (3), (4)
      // (2) ตู้ในใบงานที่วางบิลแล้วในเดือนก่อนหน้า (- หักออก)
      const col2_items = [];
      const col2_set = new Set();
      truckItemsThisMonth.forEach(item => {
        if (item.ref_master_id) {
          const matched = masterContainers.find(m => m.id === item.ref_master_id);
          if (matched) {
            const bPeriod = parseBatchPeriod(cleanBatchName(matched.batch_name || matched.source_file, matched.date_job_parsed || matched.date_job));
            if (bPeriod && bPeriod.periodIndex < pIndexH1) {
              col2_set.add(item.id);
              col2_items.push({
                ...item,
                target_batch: bPeriod.formatted,
                matched_db: matched
              });
            }
          }
        }
      });
      const col2_count = col2_set.size;

      // (3) ตู้วางบิลแล้วจากใบงานเดือนหน้า (+ บวกเข้า)
      const itemContSet = new Set(truckItemsThisMonth.map(i => String(i.container_no).trim().toUpperCase()));
      const col3_items = truckMasterThisMonth
        .filter(m => !itemContSet.has(String(m.container_no).trim().toUpperCase()))
        .map(m => ({
          ...m,
          reason: 'วางบิลเดือนนี้ แต่ใบงานยังไม่มา/อยู่เดือนถัดไป'
        }));
      const col3_count = col3_items.length;

      // (4) ตู้ค้างวางบิลจากใบงานยกไปเดือนหน้า (- หักออก)
      const masterContSet = new Set(truckMasterThisMonth.map(m => String(m.container_no).trim().toUpperCase()));
      const col4_items = truckItemsThisMonth
        .filter(i => !col2_set.has(i.id) && !masterContSet.has(String(i.container_no).trim().toUpperCase()))
        .map(i => ({
          ...i,
          reason: 'ส่งใบงานรอบนี้แล้ว แต่ยังไม่ได้วางบิล/ยกยอดไปวางบิลรอบหน้า'
        }));
      const col4_count = col4_items.length;

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
        h1_sheet_total: h1_sheet_items.length,
        h1_billed_items,
        h1_sheet_items,
        h2_size20_billed,
        h2_size40_billed,
        h2_billed_total,
        h2_sheet_total: h2_sheet_items.length,
        h2_billed_items,
        h2_sheet_items,
        total_billed,
        total_billed_items: truckMasterThisMonth,
        reconciled_total,
        col1_total_sheets,
        col1_items: truckItemsThisMonth,
        col2_count,
        col2_items,
        col3_count,
        col3_items,
        col4_count,
        col4_items,
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

  // 🖱️ Hover Popover Handlers
  const handleMouseEnterCell = (e, title, count, items, theme = 'blue', truckNo = '') => {
    if (!count || !items || items.length === 0) return;
    if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(rect.left, window.innerWidth - 360);
    const y = rect.bottom + 6;

    setHoverPopover({
      x,
      y,
      title,
      truckNo,
      count,
      items,
      theme
    });
  };

  const handleMouseLeaveCell = () => {
    popoverTimeoutRef.current = setTimeout(() => {
      setHoverPopover(null);
    }, 200);
  };

  const handleKeepPopover = () => {
    if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);
  };

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

  return (
    <div style={{ padding: '16px 20px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '14px', background: '#f8fafc', overflow: 'hidden' }}>
      
      {/* 1. Header Toolbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        background: '#ffffff',
        padding: '12px 18px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '20px', boxShadow: '0 2px 6px rgba(2,132,199,0.3)' }}>
            📑
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                ตู้ DG ประจำเดือน {monthDisplay}
              </h2>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                Reconciliation Hub
              </span>
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              รายงานกระทบยอดจำนวนตู้ใบงาน vs ตู้วางบิล จำแนกขนาด 20"/40" และการยกยอดข้ามรอบ (1)+(2)+(3)+(4)
            </p>
          </div>
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
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid #16a34a',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 5px rgba(22, 163, 74, 0.25)',
              transition: 'transform 0.15s ease'
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <span>📥</span> ส่งออก Excel
          </button>
        </div>
      </div>

      {/* 2. Modern KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
        
        {/* Card 1: Total Billed */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', borderLeft: '4px solid #0284c7' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>🧾</span> รวมตู้วางบิลทั้งหมด
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#0369a1', marginTop: '2px', fontFamily: "'Inter', sans-serif" }}>
            {totals.total_billed.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>ตู้</span>
          </div>
        </div>

        {/* Card 2: Total Sheets (1) */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', borderLeft: '4px solid #64748b' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>📄</span> รวมตู้ในใบงาน (1)
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '2px', fontFamily: "'Inter', sans-serif" }}>
            {totals.col1_total_sheets.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>ตู้</span>
          </div>
        </div>

        {/* Card 3: Prev Month (2) */}
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '10px 14px', borderLeft: '4px solid #ea580c' }}>
          <div style={{ fontSize: '11px', color: '#c2410c', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>↩️</span> วางบิลแล้วเดือนก่อน (2)
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#ea580c', marginTop: '2px', fontFamily: "'Inter', sans-serif" }}>
            ({totals.col2_count.toLocaleString()}) <span style={{ fontSize: '12px', fontWeight: 600, color: '#c2410c' }}>ตู้</span>
          </div>
        </div>

        {/* Card 4: Next Sheet (3) */}
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 14px', borderLeft: '4px solid #16a34a' }}>
          <div style={{ fontSize: '11px', color: '#15803d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>↪️</span> ใบงานมาเดือนหน้า (3)
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#16a34a', marginTop: '2px', fontFamily: "'Inter', sans-serif" }}>
            +{totals.col3_count.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600, color: '#15803d' }}>ตู้</span>
          </div>
        </div>

        {/* Card 5: Rolled Forward (4) */}
        <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '10px 14px', borderLeft: '4px solid #9333ea' }}>
          <div style={{ fontSize: '11px', color: '#7e22ce', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>⏳</span> ค้างวางบิลยกไป (4)
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#9333ea', marginTop: '2px', fontFamily: "'Inter', sans-serif" }}>
            ({totals.col4_count.toLocaleString()}) <span style={{ fontSize: '12px', fontWeight: 600, color: '#7e22ce' }}>ตู้</span>
          </div>
        </div>

        {/* Card 6: Balance Status */}
        <div style={{
          background: totals.reconciled_total === totals.total_billed ? '#f0fdf4' : '#fef2f2',
          border: totals.reconciled_total === totals.total_billed ? '1px solid #86efac' : '1px solid #fca5a5',
          borderRadius: '10px',
          padding: '10px 14px',
          borderLeft: totals.reconciled_total === totals.total_billed ? '4px solid #22c55e' : '4px solid #ef4444'
        }}>
          <div style={{ fontSize: '11px', color: totals.reconciled_total === totals.total_billed ? '#15803d' : '#991b1b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>🎯</span> สถานะการกระทบยอด
          </div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: totals.reconciled_total === totals.total_billed ? '#16a34a' : '#dc2626', marginTop: '4px' }}>
            {totals.reconciled_total === totals.total_billed ? '✓ ยอดสมดุล 100%' : `⚠️ ผลต่าง ${totals.reconciled_total - totals.total_billed} ตู้`}
          </div>
        </div>

      </div>

      {/* 3. Modern Multi-Section Data Table */}
      <div style={{
        flex: 1,
        minHeight: 0,
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
      }}>
        <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: '1440px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              
              {/* Row 1 Headers */}
              <tr>
                <th rowSpan={3} style={{ background: '#1e293b', color: '#ffffff', fontSize: '12px', fontWeight: 700, padding: '8px 6px', textAlign: 'center', borderRight: '1px solid #334155', borderBottom: '1px solid #334155', width: '45px' }}>#</th>
                <th rowSpan={3} style={{ background: '#1e293b', color: '#ffffff', fontSize: '12px', fontWeight: 700, padding: '8px', textAlign: 'center', borderRight: '1px solid #334155', borderBottom: '1px solid #334155', width: '90px' }}>ทะเบียน</th>
                <th rowSpan={3} style={{ background: '#1e293b', color: '#ffffff', fontSize: '12px', fontWeight: 700, padding: '8px 12px', textAlign: 'left', borderRight: '1px solid #334155', borderBottom: '1px solid #334155', width: '130px' }}>เจ้าของรถ</th>
                <th rowSpan={3} style={{ background: '#0f172a', color: '#38bdf8', fontSize: '13px', fontWeight: 800, padding: '8px', textAlign: 'center', borderRight: '2px solid #0284c7', borderBottom: '1px solid #334155', width: '65px' }}>เบอร์</th>
                
                {/* 1-15 and 16-31 Top Super Header */}
                <th colSpan={8} style={{ background: '#0f766e', color: '#ffffff', fontSize: '12.5px', fontWeight: 700, padding: '6px 8px', textAlign: 'center', borderRight: '2px solid #0d9488', borderBottom: '1px solid #115e59' }}>
                  📅 รายละเอียดรอบวันทำงาน (1-15 & 16-31)
                </th>

                {/* Reconciliation Super Header */}
                <th rowSpan={3} style={{ background: '#ea580c', color: '#ffffff', fontSize: '12px', fontWeight: 800, padding: '8px 6px', textAlign: 'center', borderRight: '1px solid #c2410c', borderBottom: '1px solid #c2410c', width: '85px' }}>
                  รวมจำนวน<br/>ตู้วางบิล
                </th>
                <th rowSpan={3} style={{ background: '#059669', color: '#ffffff', fontSize: '12px', fontWeight: 800, padding: '8px 6px', textAlign: 'center', borderRight: '1px solid #047857', borderBottom: '1px solid #047857', width: '110px' }}>
                  รวมตู้ใบงาน<br/>วางบิลเดือนนี้<br/>(1)+(2)+(3)+(4)
                </th>
                <th rowSpan={3} style={{ background: '#334155', color: '#f8fafc', fontSize: '12px', fontWeight: 700, padding: '8px 6px', textAlign: 'center', borderRight: '1px solid #475569', borderBottom: '1px solid #475569', width: '80px' }}>
                  (1)<br/>ตู้ใบงาน
                </th>
                <th rowSpan={3} style={{ background: '#9a3412', color: '#ffedd5', fontSize: '11.5px', fontWeight: 700, padding: '8px 6px', textAlign: 'center', borderRight: '1px solid #c2410c', borderBottom: '1px solid #c2410c', width: '95px' }}>
                  (2)<br/>วางบิลแล้ว<br/>เดือนก่อนหน้า
                </th>
                <th rowSpan={3} style={{ background: '#166534', color: '#dcfce7', fontSize: '11.5px', fontWeight: 700, padding: '8px 6px', textAlign: 'center', borderRight: '1px solid #15803d', borderBottom: '1px solid #15803d', width: '95px' }}>
                  (3)<br/>วางบิลแล้ว<br/>ใบงานเดือนหน้า
                </th>
                <th rowSpan={3} style={{ background: '#6b21a8', color: '#f3e8ff', fontSize: '11.5px', fontWeight: 700, padding: '8px 6px', textAlign: 'center', borderRight: '1px solid #7e22ce', borderBottom: '1px solid #7e22ce', width: '95px' }}>
                  (4)<br/>ค้างวางบิล<br/>ยกไปเดือนหน้า
                </th>
                <th rowSpan={3} style={{ background: '#1e293b', color: '#94a3b8', fontSize: '11.5px', fontWeight: 700, padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid #334155', width: '90px' }}>
                  สถานะ
                </th>
              </tr>

              {/* Row 2 Headers (Half Month Splits) */}
              <tr>
                <th colSpan={4} style={{ background: '#0284c7', color: '#ffffff', fontSize: '12px', fontWeight: 700, padding: '5px', textAlign: 'center', borderRight: '1px solid #0369a1', borderBottom: '1px solid #0369a1' }}>
                  1 - 15 (ครึ่งแรก)
                </th>
                <th colSpan={4} style={{ background: '#4f46e5', color: '#ffffff', fontSize: '12px', fontWeight: 700, padding: '5px', textAlign: 'center', borderRight: '2px solid #4338ca', borderBottom: '1px solid #4338ca' }}>
                  16 - 31 (ครึ่งหลัง)
                </th>
              </tr>

              {/* Row 3 Headers (Sub Columns) */}
              <tr>
                <th style={{ background: '#0369a1', color: '#e0f2fe', fontSize: '11px', fontWeight: 600, padding: '4px', textAlign: 'center', borderRight: '1px solid #0284c7', borderBottom: '2px solid #0284c7', width: '50px' }}>20"</th>
                <th style={{ background: '#0369a1', color: '#e0f2fe', fontSize: '11px', fontWeight: 600, padding: '4px', textAlign: 'center', borderRight: '1px solid #0284c7', borderBottom: '2px solid #0284c7', width: '50px' }}>40"</th>
                <th style={{ background: '#0c4a6e', color: '#fed7aa', fontSize: '11.5px', fontWeight: 700, padding: '4px', textAlign: 'center', borderRight: '1px solid #0369a1', borderBottom: '2px solid #0284c7', width: '65px' }}>วางบิล</th>
                <th style={{ background: '#0c4a6e', color: '#bae6fd', fontSize: '11.5px', fontWeight: 700, padding: '4px', textAlign: 'center', borderRight: '1px solid #075985', borderBottom: '2px solid #0284c7', width: '65px' }}>ใบงาน</th>

                <th style={{ background: '#4338ca', color: '#e0e7ff', fontSize: '11px', fontWeight: 600, padding: '4px', textAlign: 'center', borderRight: '1px solid #4f46e5', borderBottom: '2px solid #4f46e5', width: '50px' }}>20"</th>
                <th style={{ background: '#4338ca', color: '#e0e7ff', fontSize: '11px', fontWeight: 600, padding: '4px', textAlign: 'center', borderRight: '1px solid #4f46e5', borderBottom: '2px solid #4f46e5', width: '50px' }}>40"</th>
                <th style={{ background: '#312e81', color: '#fed7aa', fontSize: '11.5px', fontWeight: 700, padding: '4px', textAlign: 'center', borderRight: '1px solid #4f46e5', borderBottom: '2px solid #4f46e5', width: '65px' }}>วางบิล</th>
                <th style={{ background: '#312e81', color: '#c7d2fe', fontSize: '11.5px', fontWeight: 700, padding: '4px', textAlign: 'center', borderRight: '2px solid #3730a3', borderBottom: '2px solid #4f46e5', width: '65px' }}>ใบงาน</th>
              </tr>

            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={18} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '24px' }}>⏳</span>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>กำลังประมวลผลและคำนวณการกระทบยอดตู้ DG...</span>
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={18} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    ไม่พบข้อมูลรถในรอบเดือน {monthDisplay}
                  </td>
                </tr>
              ) : (
                rows.map((r, rIdx) => {
                  const isAlt = rIdx % 2 === 1;
                  const rowBg = isAlt ? '#f8fafc' : '#ffffff';

                  return (
                    <tr
                      key={r.truck_no}
                      style={{
                        background: rowBg,
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                      onMouseLeave={(e) => e.currentTarget.style.background = rowBg}
                    >
                      {/* # */}
                      <td style={{ padding: '8px 4px', textAlign: 'center', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #f1f5f9' }}>
                        {r.index}
                      </td>

                      {/* ทะเบียน */}
                      <td style={{ padding: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#334155', fontFamily: "'SF Mono', monospace", borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #f1f5f9' }}>
                        {r.truck_license}
                      </td>

                      {/* เจ้าของรถ */}
                      <td style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12.5px', fontWeight: 600, color: '#1e293b', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #f1f5f9' }}>
                        {r.owner}
                      </td>

                      {/* เบอร์รถ */}
                      <td style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', borderRight: '2px solid #e2e8f0', background: '#f0f9ff' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '6px', background: '#0284c7', color: '#ffffff', fontWeight: 800, fontSize: '12.5px' }}>
                          {r.truck_no}
                        </span>
                      </td>

                      {/* 1-15 Breakdown */}
                      <td style={{ padding: '8px 4px', textAlign: 'center', fontSize: '12px', color: r.h1_size20_billed > 0 ? '#0f172a' : '#94a3b8', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #f1f5f9' }}>
                        {r.h1_size20_billed || 0}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'center', fontSize: '12px', color: r.h1_size40_billed > 0 ? '#0f172a' : '#94a3b8', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #f1f5f9' }}>
                        {r.h1_size40_billed || 0}
                      </td>
                      
                      {/* 1-15 Billed Total (Interactive Hover) */}
                      <td
                        style={{
                          padding: '8px 6px',
                          textAlign: 'center',
                          fontWeight: 700,
                          fontSize: '12.5px',
                          background: '#fffbeb',
                          color: '#b45309',
                          borderBottom: '1px solid #e2e8f0',
                          borderRight: '1px solid #fef3c7',
                          cursor: r.h1_billed_total > 0 ? 'pointer' : 'default'
                        }}
                        onMouseEnter={(e) => handleMouseEnterCell(e, `ตู้ในใบวางบิล 1-15 ${monthDisplay}`, r.h1_billed_total, r.h1_billed_items, 'amber', r.truck_no)}
                        onMouseLeave={handleMouseLeaveCell}
                        onClick={() => r.h1_billed_total > 0 && setDrillDownModal({ title: `รายการตู้วางบิล 1-15 (รถ ${r.truck_no})`, items: r.h1_billed_items, theme: 'amber' })}
                      >
                        {r.h1_billed_total}
                      </td>

                      {/* 1-15 Sheet Total (Interactive Hover) */}
                      <td
                        style={{
                          padding: '8px 6px',
                          textAlign: 'center',
                          fontWeight: 700,
                          fontSize: '12.5px',
                          background: '#f0f9ff',
                          color: '#0284c7',
                          borderBottom: '1px solid #e2e8f0',
                          borderRight: '1px solid #e0f2fe',
                          cursor: r.h1_sheet_total > 0 ? 'pointer' : 'default'
                        }}
                        onMouseEnter={(e) => handleMouseEnterCell(e, `ตู้ในใบงาน 1-15 ${monthDisplay}`, r.h1_sheet_total, r.h1_sheet_items, 'blue', r.truck_no)}
                        onMouseLeave={handleMouseLeaveCell}
                        onClick={() => r.h1_sheet_total > 0 && setDrillDownModal({ title: `รายการตู้ในใบงาน 1-15 (รถ ${r.truck_no})`, items: r.h1_sheet_items, theme: 'blue' })}
                      >
                        {r.h1_sheet_total}
                      </td>

                      {/* 16-31 Breakdown */}
                      <td style={{ padding: '8px 4px', textAlign: 'center', fontSize: '12px', color: r.h2_size20_billed > 0 ? '#0f172a' : '#94a3b8', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #f1f5f9' }}>
                        {r.h2_size20_billed || 0}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'center', fontSize: '12px', color: r.h2_size40_billed > 0 ? '#0f172a' : '#94a3b8', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #f1f5f9' }}>
                        {r.h2_size40_billed || 0}
                      </td>

                      {/* 16-31 Billed Total (Interactive Hover) */}
                      <td
                        style={{
                          padding: '8px 6px',
                          textAlign: 'center',
                          fontWeight: 700,
                          fontSize: '12.5px',
                          background: '#fffbeb',
                          color: '#b45309',
                          borderBottom: '1px solid #e2e8f0',
                          borderRight: '1px solid #fef3c7',
                          cursor: r.h2_billed_total > 0 ? 'pointer' : 'default'
                        }}
                        onMouseEnter={(e) => handleMouseEnterCell(e, `ตู้ในใบวางบิล 16-31 ${monthDisplay}`, r.h2_billed_total, r.h2_billed_items, 'amber', r.truck_no)}
                        onMouseLeave={handleMouseLeaveCell}
                        onClick={() => r.h2_billed_total > 0 && setDrillDownModal({ title: `รายการตู้วางบิล 16-31 (รถ ${r.truck_no})`, items: r.h2_billed_items, theme: 'amber' })}
                      >
                        {r.h2_billed_total}
                      </td>

                      {/* 16-31 Sheet Total (Interactive Hover) */}
                      <td
                        style={{
                          padding: '8px 6px',
                          textAlign: 'center',
                          fontWeight: 700,
                          fontSize: '12.5px',
                          background: '#eef2ff',
                          color: '#4f46e5',
                          borderBottom: '1px solid #e2e8f0',
                          borderRight: '2px solid #e2e8f0',
                          cursor: r.h2_sheet_total > 0 ? 'pointer' : 'default'
                        }}
                        onMouseEnter={(e) => handleMouseEnterCell(e, `ตู้ในใบงาน 16-31 ${monthDisplay}`, r.h2_sheet_total, r.h2_sheet_items, 'indigo', r.truck_no)}
                        onMouseLeave={handleMouseLeaveCell}
                        onClick={() => r.h2_sheet_total > 0 && setDrillDownModal({ title: `รายการตู้ในใบงาน 16-31 (รถ ${r.truck_no})`, items: r.h2_sheet_items, theme: 'indigo' })}
                      >
                        {r.h2_sheet_total}
                      </td>

                      {/* รวมจำนวนตู้วางบิล */}
                      <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 800, fontSize: '13px', background: '#ffedd5', color: '#c2410c', borderBottom: '1px solid #fed7aa', borderRight: '1px solid #fed7aa' }}>
                        {r.total_billed}
                      </td>

                      {/* รวมตู้ใบงานวางบิลเดือนนี้ (1)+(2)+(3)+(4) */}
                      <td style={{
                        padding: '8px 6px',
                        textAlign: 'center',
                        fontWeight: 800,
                        fontSize: '13px',
                        background: r.isReconciled ? '#f0fdf4' : '#fef2f2',
                        color: r.isReconciled ? '#15803d' : '#dc2626',
                        borderBottom: r.isReconciled ? '1px solid #bbf7d0' : '1px solid #fecaca',
                        borderRight: '1px solid #e2e8f0'
                      }}>
                        {r.reconciled_total}
                      </td>

                      {/* (1) ตู้ใบงาน */}
                      <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, fontSize: '12.5px', background: '#f8fafc', color: '#334155', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #f1f5f9' }}>
                        {r.col1_total_sheets}
                      </td>

                      {/* (2) วางบิลแล้วเดือนก่อน (Interactive Hover) */}
                      <td
                        style={{
                          padding: '8px 6px',
                          textAlign: 'center',
                          fontWeight: 700,
                          fontSize: '12.5px',
                          background: r.col2_count > 0 ? '#fff7ed' : 'transparent',
                          color: r.col2_count > 0 ? '#ea580c' : '#cbd5e1',
                          borderBottom: '1px solid #e2e8f0',
                          borderRight: '1px solid #f1f5f9',
                          cursor: r.col2_count > 0 ? 'pointer' : 'default'
                        }}
                        onMouseEnter={(e) => handleMouseEnterCell(e, `(2) ตู้ที่วางบิลแล้วในเดือนก่อนหน้า`, r.col2_count, r.col2_items, 'orange', r.truck_no)}
                        onMouseLeave={handleMouseLeaveCell}
                        onClick={() => r.col2_count > 0 && setDrillDownModal({ title: `(2) ตู้ใบงานที่วางบิลแล้วในเดือนก่อนหน้า (รถ ${r.truck_no})`, items: r.col2_items, theme: 'orange' })}
                      >
                        {r.col2_count > 0 ? (
                          <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#ffedd5', border: '1px solid #fdba74' }}>
                            ({r.col2_count})
                          </span>
                        ) : '0'}
                      </td>

                      {/* (3) วางบิลแล้วใบงานเดือนหน้า (Interactive Hover) */}
                      <td
                        style={{
                          padding: '8px 6px',
                          textAlign: 'center',
                          fontWeight: 700,
                          fontSize: '12.5px',
                          background: r.col3_count > 0 ? '#f0fdf4' : 'transparent',
                          color: r.col3_count > 0 ? '#16a34a' : '#cbd5e1',
                          borderBottom: '1px solid #e2e8f0',
                          borderRight: '1px solid #f1f5f9',
                          cursor: r.col3_count > 0 ? 'pointer' : 'default'
                        }}
                        onMouseEnter={(e) => handleMouseEnterCell(e, `(3) ตู้วางบิลแล้วจากใบงานเดือนหน้า`, r.col3_count, r.col3_items, 'emerald', r.truck_no)}
                        onMouseLeave={handleMouseLeaveCell}
                        onClick={() => r.col3_count > 0 && setDrillDownModal({ title: `(3) ตู้วางบิลแล้วจากใบงานเดือนหน้า (รถ ${r.truck_no})`, items: r.col3_items, theme: 'emerald' })}
                      >
                        {r.col3_count > 0 ? (
                          <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#dcfce7', border: '1px solid #86efac' }}>
                            +{r.col3_count}
                          </span>
                        ) : '0'}
                      </td>

                      {/* (4) ค้างวางบิลยกไปเดือนหน้า (Interactive Hover) */}
                      <td
                        style={{
                          padding: '8px 6px',
                          textAlign: 'center',
                          fontWeight: 700,
                          fontSize: '12.5px',
                          background: r.col4_count > 0 ? '#faf5ff' : 'transparent',
                          color: r.col4_count > 0 ? '#9333ea' : '#cbd5e1',
                          borderBottom: '1px solid #e2e8f0',
                          borderRight: '1px solid #f1f5f9',
                          cursor: r.col4_count > 0 ? 'pointer' : 'default'
                        }}
                        onMouseEnter={(e) => handleMouseEnterCell(e, `(4) ตู้ค้างวางบิลจากใบงานยกไปเดือนหน้า`, r.col4_count, r.col4_items, 'purple', r.truck_no)}
                        onMouseLeave={handleMouseLeaveCell}
                        onClick={() => r.col4_count > 0 && setDrillDownModal({ title: `(4) ตู้ค้างวางบิลยกไปเดือนหน้า (รถ ${r.truck_no})`, items: r.col4_items, theme: 'purple' })}
                      >
                        {r.col4_count > 0 ? (
                          <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#f3e8ff', border: '1px solid #d8b4fe' }}>
                            ({r.col4_count})
                          </span>
                        ) : '0'}
                      </td>

                      {/* สถานะ */}
                      <td style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>
                        {r.isReconciled ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 6px', borderRadius: '6px', background: '#f0fdf4', color: '#16a34a', fontSize: '11px', fontWeight: 700, border: '1px solid #bbf7d0' }}>
                            <span>✓</span> ตรงกัน
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 6px', borderRadius: '6px', background: '#fef2f2', color: '#dc2626', fontSize: '11px', fontWeight: 700, border: '1px solid #fecaca' }}>
                            <span>⚠️</span> ต่าง {r.diff}
                          </span>
                        )}
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Total Row */}
            <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 10 }}>
              <tr style={{ background: '#0f172a', color: '#ffffff', fontWeight: 800, borderTop: '2px solid #0284c7' }}>
                <td colSpan={4} style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, fontSize: '13px', color: '#38bdf8' }}>
                  รวมทั้งหมด (GRAND TOTAL)
                </td>
                <td style={{ padding: '10px 4px', textAlign: 'center', fontSize: '12.5px', color: '#bae6fd' }}>{totals.h1_size20_billed}</td>
                <td style={{ padding: '10px 4px', textAlign: 'center', fontSize: '12.5px', color: '#bae6fd' }}>{totals.h1_size40_billed}</td>
                <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '13px', color: '#fef08a' }}>{totals.h1_billed_total}</td>
                <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '13px', color: '#7dd3fc' }}>{totals.h1_sheet_total}</td>
                
                <td style={{ padding: '10px 4px', textAlign: 'center', fontSize: '12.5px', color: '#c7d2fe' }}>{totals.h2_size20_billed}</td>
                <td style={{ padding: '10px 4px', textAlign: 'center', fontSize: '12.5px', color: '#c7d2fe' }}>{totals.h2_size40_billed}</td>
                <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '13px', color: '#fef08a' }}>{totals.h2_billed_total}</td>
                <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '13px', color: '#a5b4fc' }}>{totals.h2_sheet_total}</td>

                <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px', color: '#fdba74' }}>{totals.total_billed}</td>
                <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '14px', color: '#86efac' }}>{totals.reconciled_total}</td>
                <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '13px', color: '#f1f5f9' }}>{totals.col1_total_sheets}</td>
                <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '13px', color: '#fdba74' }}>{totals.col2_count > 0 ? `(${totals.col2_count})` : '0'}</td>
                <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '13px', color: '#86efac' }}>{totals.col3_count > 0 ? `+${totals.col3_count}` : '0'}</td>
                <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '13px', color: '#d8b4fe' }}>{totals.col4_count > 0 ? `(${totals.col4_count})` : '0'}</td>
                <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '12px', color: totals.reconciled_total === totals.total_billed ? '#86efac' : '#fca5a5' }}>
                  {totals.reconciled_total === totals.total_billed ? '✓ สมดุล' : '⚠️ มีผลต่าง'}
                </td>
              </tr>
            </tfoot>

          </table>
        </div>
      </div>

      {/* 4. 🪟 Interactive Floating Popover on Hover */}
      {hoverPopover && (
        <div
          onMouseEnter={handleKeepPopover}
          onMouseLeave={handleMouseLeaveCell}
          style={{
            position: 'fixed',
            left: `${hoverPopover.x}px`,
            top: `${hoverPopover.y}px`,
            zIndex: 9999,
            width: '340px',
            background: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          {/* Popover Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px' }}>📋</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                {hoverPopover.title}
              </span>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 7px', borderRadius: '10px', background: '#f1f5f9', color: '#0f172a' }}>
              {hoverPopover.count} ตู้ (รถ {hoverPopover.truckNo})
            </span>
          </div>

          {/* Container Items Preview (Max 5 rows) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
            {hoverPopover.items.slice(0, 6).map((it, idx) => (
              <div
                key={it.id || idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 6px',
                  borderRadius: '6px',
                  background: '#f8fafc',
                  border: '1px solid #f1f5f9',
                  fontSize: '11.5px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 700, color: '#0369a1', fontFamily: "'SF Mono', monospace" }}>
                    {it.container_no}
                  </span>
                  <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                    {it.size || '-'}' {it.port || '-'}
                  </span>
                </div>
                
                {it.target_batch && (
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#ea580c', background: '#fff7ed', padding: '1px 5px', borderRadius: '4px' }}>
                    {it.target_batch}
                  </span>
                )}
                {it.date_job && !it.target_batch && (
                  <span style={{ fontSize: '10px', color: '#64748b' }}>
                    {it.date_job}
                  </span>
                )}
              </div>
            ))}

            {hoverPopover.items.length > 6 && (
              <div style={{ textAlign: 'center', fontSize: '11px', color: '#0284c7', fontWeight: 700, padding: '4px 0', cursor: 'pointer' }}>
                คลิกที่ช่องเพื่อดูครบทั้ง {hoverPopover.items.length} ตู้ →
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. 📑 Full Drill-Down Modal on Click */}
      {drillDownModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10000,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '14px',
            width: '750px',
            maxWidth: '95vw',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📋</span> {drillDownModal.title}
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  จำนวนตู้ทั้งหมด {drillDownModal.items.length} รายการ
                </p>
              </div>
              <button
                onClick={() => setDrillDownModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Table Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left', fontWeight: 700 }}>
                    <th style={{ padding: '8px 10px', width: '40px' }}>#</th>
                    <th style={{ padding: '8px 10px' }}>เลขตู้คอนเทนเนอร์</th>
                    <th style={{ padding: '8px 10px', width: '60px' }}>ขนาด</th>
                    <th style={{ padding: '8px 10px', width: '70px' }}>ท่าเรือ</th>
                    <th style={{ padding: '8px 10px', width: '110px' }}>วันทำงาน</th>
                    <th style={{ padding: '8px 10px' }}>หมายเหตุ / รายละเอียด</th>
                  </tr>
                </thead>
                <tbody>
                  {drillDownModal.items.map((it, idx) => (
                    <tr key={it.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0369a1', fontFamily: "'SF Mono', monospace" }}>
                        {it.container_no}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#334155' }}>{it.size || '-'}'</td>
                      <td style={{ padding: '8px 10px', color: '#334155' }}>{it.port || '-'}</td>
                      <td style={{ padding: '8px 10px', color: '#64748b' }}>{it.date_job || it.date_job_parsed || '-'}</td>
                      <td style={{ padding: '8px 10px', color: '#475569' }}>
                        {it.target_batch ? (
                          <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#fff7ed', color: '#ea580c', fontWeight: 700, fontSize: '11px' }}>
                            วางบิลรอบ: {it.target_batch}
                          </span>
                        ) : (
                          it.reason || (it.match_status === 'matched_green' ? '🟢 ตรวจพบในใบวางบิล' : '🔴 ยังไม่พบในใบวางบิลรอบนี้')
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '10px 18px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDrillDownModal(null)}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  background: '#0f172a',
                  color: '#ffffff',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Image Preview Modal */}
      {previewImage && (
        <ContainerImageModal
          isOpen={Boolean(previewImage)}
          onClose={() => setPreviewImage(null)}
          imageUrl={previewImage.imageUrl}
          imageName={previewImage.imageName}
          driveFileId={previewImage.driveFileId}
        />
      )}

    </div>
  );
}
