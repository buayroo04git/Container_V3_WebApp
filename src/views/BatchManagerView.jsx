import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { jobSheetService } from '../services/jobSheetService';
import { containerService } from '../services/containerService';
import { findTopContainerMatches, normalizeExcelDate } from '../utils/matchingLogic';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown';
import UniversalTableContainer from '../components/ui/UniversalTableContainer';
import UniversalTableHeader from '../components/ui/UniversalTableHeader';
import MonthPicker from '../components/ui/MonthPicker';
import useActiveMonth from '../hooks/useActiveMonth';
import { useColumnPreferences } from '../hooks/useColumnPreferences';
import LegacyJsonImportModal from '../components/modals/LegacyJsonImportModal';
import ContainerImageModal from '../components/containers/ContainerImageModal';

function getPageNumbers(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
}

const BATCH_RAW_COLUMNS = [
  'index',
  'thumbnail',
  'image_name',
  'batch_name',
  'truck_no',
  'driver_name',
  'total',
  'match_summary',
  'status',
  'saved_at',
  'actions'
];

const BATCH_DEFAULT_NAMES = {
  index: '#',
  thumbnail: 'ภาพใบงาน',
  image_name: 'ชื่อรูปภาพ',
  batch_name: 'รอบงาน (Batch)',
  truck_no: 'เบอร์รถ',
  driver_name: 'คนขับ',
  total: 'จำนวนตู้',
  match_summary: 'ผลจับคู่',
  status: 'สถานะ',
  saved_at: 'วันที่บันทึก',
  actions: 'การจัดการ'
};

const BATCH_DEFAULT_WIDTHS = {
  index: 45,
  thumbnail: 75,
  image_name: 150,
  batch_name: 140,
  truck_no: 95,
  driver_name: 130,
  total: 85,
  match_summary: 150,
  status: 120,
  saved_at: 130,
  actions: 150
};

const BATCH_ALIGN_MAP = {
  index: 'center',
  thumbnail: 'center',
  image_name: 'left',
  batch_name: 'left',
  truck_no: 'center',
  driver_name: 'left',
  total: 'right',
  match_summary: 'center',
  status: 'center',
  saved_at: 'center',
  actions: 'center'
};

export default function BatchManagerView() {
  const [jobSheetsList, setJobSheetsList] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [masterDb, setMasterDb] = useState([]);
  const [availableBatches, setAvailableBatches] = useState([]);
  const [availableTrucks, setAvailableTrucks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('ALL');
  const [selectedTruckFilter, setSelectedTruckFilter] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useActiveMonth();
  const [activeDetailSheet, setActiveDetailSheet] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  
  // State สำหรับหน้าต่างแก้ไขเฉพาะตู้ที่ยังไม่พบ (Red Containers Editor)
  const [editingRedSheet, setEditingRedSheet] = useState(null);
  const [redEditRows, setRedEditRows] = useState([]);
  const [isSavingRed, setIsSavingRed] = useState(false);

  // 📄 ระบบ Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50); // 25, 50, 100, 200, 'ALL'
  const [sortConfig, setSortConfig] = useState({ key: 'saved_at', direction: 'desc' });

  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [fullDriversList, setFullDriversList] = useState([]);
  const [fullTrucksList, setFullTrucksList] = useState([]);
  const [fullOpsList, setFullOpsList] = useState([]);
  const [isLegacyImportModalOpen, setIsLegacyImportModalOpen] = useState(false);

  // 1. โหลด Metadata ตอนเปิดหน้าจอ
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [batchesRes, trucksRes, driversRes, masterRes, opsRes] = await Promise.all([
          supabase.from('job_sheets').select('batch_name').neq('status', 'deleted').limit(150),
          supabase.from('truck_records').select('*').order('truck_no'),
          supabase.from('driver_records').select('*').order('driver_name', { ascending: true }),
          containerService.fetchMasterContainers(),
          supabase.from('truck_operations').select('*').limit(2000)
        ]);
        if (batchesRes?.data) {
          const bSet = new Set(batchesRes.data.map(b => b.batch_name).filter(Boolean));
          setAvailableBatches(Array.from(bSet).sort());
        }
        if (trucksRes?.data) {
          setFullTrucksList(trucksRes.data);
          const tSet = new Set(trucksRes.data.map(t => t.truck_no).filter(Boolean));
          setAvailableTrucks(Array.from(tSet).sort());
        }
        if (driversRes?.data) {
          setFullDriversList(driversRes.data);
          const dSet = new Set(driversRes.data.map(d => d.driver_name).filter(Boolean));
          setAvailableDrivers(Array.from(dSet).sort((a, b) => a.localeCompare(b, 'th')));
        }
        if (opsRes?.data) {
          setFullOpsList(opsRes.data);
        }
        if (masterRes?.data) {
          setMasterDb(masterRes.data);
        }
      } catch (e) {
        console.error('Error fetching metadata:', e);
      }
    };
    fetchMetadata();
  }, []);

  const handleUpdateDriver = async (sheetId, newDriver, truckNo = null) => {
    try {
      const res = await jobSheetService.updateJobSheetDriver(sheetId, newDriver, truckNo);
      if (!res.success) throw res.error;
      
      const cleanVal = newDriver === '-' ? null : newDriver;
      setJobSheetsList(prev => prev.map(s => s.id === sheetId ? { ...s, driver_name: cleanVal } : s));
      if (activeDetailSheet?.id === sheetId) {
        setActiveDetailSheet(prev => ({ ...prev, driver_name: cleanVal }));
      }
    } catch (e) {
      alert('ไม่สามารถอัปเดตคนขับได้: ' + (e.message || e));
    }
  };

  const handleDeleteSheet = async (sheet) => {
    if (!window.confirm(`⚠️ คุณแน่ใจหรือไม่ว่าต้องการลบใบงานนี้ออกจากระบบ?\n\n- รหัสใบงาน: ${sheet.id}\n- เบอร์รถ: ${sheet.truck_no}\n- รอบงาน: ${sheet.batch_name}\n- จำนวนตู้: ${sheet.total || sheet.total_containers || 0} ตู้\n\n(รายการตู้ทั้งหมดในใบงานนี้จะถูกลบออกจากฐานข้อมูล)`)) {
      return;
    }
    try {
      const res = await jobSheetService.deleteCompletedJobSheet(sheet);
      if (!res.success) throw res.error;
      alert('🗑️ ลบใบงานสำเร็จเรียบร้อยแล้ว');
      if (activeDetailSheet?.id === sheet.id) setActiveDetailSheet(null);
      loadPaginatedData();
    } catch (err) {
      console.error('Delete sheet error:', err);
      alert('ไม่สามารถลบใบงานได้: ' + (err.message || err));
    }
  };

  // 2. Debounce Search (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // 3. รีเซ็ตกลับไปหน้า 1 เมื่อตัวกรองเปลี่ยน
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBatchFilter, selectedTruckFilter, selectedMonth, rowsPerPage]);

  // 4. โหลดข้อมูลแบบ Server-Side Pagination จริง
  useEffect(() => {
    loadPaginatedData();
  }, [currentPage, rowsPerPage, debouncedSearch, selectedBatchFilter, selectedTruckFilter, selectedMonth, sortConfig]);

  const loadPaginatedData = async () => {
    setIsLoading(true);
    try {
      const res = await jobSheetService.fetchPaginatedCompletedJobSheets({
        page: currentPage,
        pageSize: rowsPerPage,
        searchTerm: debouncedSearch,
        batchFilter: selectedBatchFilter,
        truckFilter: selectedTruckFilter,
        monthFilter: selectedMonth,
        sortConfig: {
          key: sortConfig.key === 'saved_at' ? 'created_at' : sortConfig.key,
          direction: sortConfig.direction
        }
      });

      if (res.error) throw res.error;
      setJobSheetsList(res.data || []);
      setTotalCount(res.totalCount || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Fetch Completed Error:', err);
      alert('ไม่สามารถดึงข้อมูลประวัติใบงานได้: ' + (err.message || err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenImagePreview = (sheet) => {
    if (!sheet) return;
    const imageUrl = sheet.image_url;
    const driveFileId = sheet.drive_file_id || null;
    const imageName = sheet.image_name || `ใบงาน รถ ${sheet.truck_no || '-'}`;

    if (!imageUrl && !driveFileId) {
      alert('⚠️ ใบงานนี้ยังไม่มีรูปภาพบนระบบหรือ Google Drive');
      return;
    }

    setPreviewImage({
      url: imageUrl,
      name: imageName,
      drive_file_id: driveFileId,
      sheetId: sheet.id
    });
  };

  const getDriveThumbnailUrl = (url, driveFileId = null) => {
    if (driveFileId && typeof driveFileId === 'string' && driveFileId.length > 5) {
      return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w200`;
    }
    if (!url) return null;
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http://localhost') || url.includes('/assets/')) {
      return url;
    }
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200`;
    }
    return url;
  };

  const fetchCompletedRecords = async () => {
    await loadPaginatedData();
  };

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sortedSheets = jobSheetsList;
  const totalRows = totalCount;
  const startIndex = rowsPerPage === 'ALL' ? 0 : (currentPage - 1) * (Number(rowsPerPage) || 50);
  const endIndex = rowsPerPage === 'ALL' ? totalRows : Math.min(startIndex + jobSheetsList.length, totalRows);

  const kpiStats = useMemo(() => {
    const totalSheets = jobSheetsList.length;
    let totalContainers = 0;
    let totalGreen = 0;
    let totalRed = 0;

    jobSheetsList.forEach(s => {
      totalContainers += s.containers ? s.containers.length : 0;
      totalGreen += s.green || 0;
      totalRed += s.red || 0;
    });

    return { totalSheets, totalContainers, totalGreen, totalRed };
  }, [jobSheetsList]);

  // Hook สำหรับจัดการคอลัมน์
  const batchPrefs = useColumnPreferences({
    storageKeyPrefix: 'completed_jobs',
    rawColumns: BATCH_RAW_COLUMNS,
    defaultNames: BATCH_DEFAULT_NAMES,
    defaultWidths: BATCH_DEFAULT_WIDTHS,
    sampleRecords: sortedSheets,
    onSortChange: (newSort) => {
      setSortConfig(newSort);
    },
    formatCellValue: (col, val) => {
      if (col === 'saved_at') return val ? new Date(val).toLocaleString('th-TH') : '-';
      return String(val || '');
    }
  });

  const { activeColumns } = batchPrefs;

  // เปิดหน้าต่างแก้ไขเฉพาะตู้ที่ยังไม่พบใน DB (Red Containers Editor)
  const openRedEditor = (sheet) => {
    const onlyRed = (sheet.containers || []).filter(c => c.is_red || c.match_status === 'manual_red');
    setEditingRedSheet(sheet);
    setRedEditRows(onlyRed.map(c => ({
      id: c.id,
      container_no: c.container_no,
      raw_ocr_no: c.container_no,
      port: c.port !== '-' ? c.port : '',
      size: c.size !== '-' ? c.size : '',
      selectedDbId: null,
      isConfirmedMatch: false
    })));
  };

  // บันทึกการแก้ไขเฉพาะตู้สีแดงลง Supabase
  const handleSaveRedEdits = async () => {
    if (!editingRedSheet || redEditRows.length === 0) return;
    setIsSavingRed(true);

    try {
      const updates = redEditRows.map(row => {
        const cleanNo = String(row.container_no || '').trim();
        const exactMatch = masterDb.find(m => String(m.container_no || '').trim().toUpperCase() === cleanNo.toUpperCase());
        const isMatched = row.isConfirmedMatch || !!exactMatch;
        return {
          id: row.id,
          container_no: cleanNo,
          port: exactMatch?.port || row.port || null,
          size: exactMatch?.size || row.size || null,
          match_status: isMatched ? 'matched_green' : 'manual_red'
        };
      });

      const res = await jobSheetService.updateCompletedContainers(updates, editingRedSheet.id);
      if (!res.success && res.error) throw res.error;

      alert(`✅ บันทึกการแก้ไขตู้สำเร็จเรียบร้อย!`);
      setEditingRedSheet(null);
      setRedEditRows([]);
      await fetchCompletedRecords();
    } catch (err) {
      console.error('Save Red Edits Error:', err);
      alert('❌ เกิดข้อผิดพลาดในการบันทึก: ' + (err.message || err));
    } finally {
      setIsSavingRed(false);
    }
  };

  return (
    <div style={{ padding: '16px 24px', maxWidth: '1600px', margin: '0 auto', width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeIn 0.3s ease' }}>
      
      {/* 1. Header Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexShrink: 0, gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 2px 0', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ✅ Completed Job Sheets
          </h1>
          <p style={{ color: '#64748b', fontSize: '12.5px', margin: 0 }}>
            ประวัติใบงานที่ได้รับการตรวจสอบ ยืนยัน และบันทึกจบงานแล้วในระบบ
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={fetchCompletedRecords}
            disabled={isLoading}
            style={{
              height: '36px',
              padding: '0 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: isLoading ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}
          >
            <span>🔄</span>
            <span>รีเฟรชข้อมูล</span>
          </button>
        </div>
      </div>

      {/* 2. KPI Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: '10px',
        marginBottom: '14px',
        flexShrink: 0
      }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>📄 ใบงานทั้งหมด</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', fontFamily: "'Inter', sans-serif" }}>
            {kpiStats.totalSheets.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>ใบ</span>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748b', marginBottom: '2px' }}>📦 รวมงานทั้งหมด</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#2563eb', fontFamily: "'Inter', sans-serif" }}>
            {kpiStats.totalContainers.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>งาน</span>
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#166534', marginBottom: '2px' }}>🟢 จับคู่สมบูรณ์</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#15803d', fontFamily: "'Inter', sans-serif" }}>
            {kpiStats.totalGreen.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600, color: '#166534' }}>งาน</span>
          </div>
        </div>

        <div style={{ background: kpiStats.totalRed > 0 ? '#fef2f2' : '#f8fafc', border: kpiStats.totalRed > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: kpiStats.totalRed > 0 ? '#991b1b' : '#64748b', marginBottom: '2px' }}>🔴 ไม่พบในใบวางบิล</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: kpiStats.totalRed > 0 ? '#dc2626' : '#64748b', fontFamily: "'Inter', sans-serif" }}>
            {kpiStats.totalRed.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600, color: kpiStats.totalRed > 0 ? '#991b1b' : '#64748b' }}>งาน</span>
          </div>
        </div>
      </div>

      {/* 3. Filter & Search Controls */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '12px 16px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Table Toolbar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
              📄 รายการใบงานที่บันทึกแล้ว
            </span>
            <span style={{ fontSize: '12px', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
              {sortedSheets.length.toLocaleString()} ใบงาน
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            
            {/* 📅 Month Filter */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <MonthPicker
                value={selectedMonth}
                onChange={(newMonth) => setSelectedMonth(newMonth)}
                label="เดือน:"
              />
              {selectedMonth && selectedMonth !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedMonth('ALL')}
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

            {/* Search Box */}
            <div style={{ position: 'relative', width: '180px' }}>
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '13px', pointerEvents: 'none' }}>🔍</span>
              <input
                type="text"
                placeholder="ค้นหาเบอร์รถ, เลขตู้..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  height: '35px',
                  paddingLeft: '32px',
                  paddingRight: searchTerm ? '28px' : '10px',
                  borderRadius: '7px',
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

            {/* Truck Filter */}
            <select
              value={selectedTruckFilter}
              onChange={(e) => setSelectedTruckFilter(e.target.value)}
              style={{
                height: '35px',
                padding: '0 8px',
                borderRadius: '7px',
                border: '1px solid #cbd5e1',
                fontSize: '12px',
                fontWeight: selectedTruckFilter !== 'ALL' ? 700 : 500,
                background: selectedTruckFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
                color: selectedTruckFilter !== 'ALL' ? '#2563eb' : '#0f172a',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">🚚 ทุกเบอร์รถ ({availableTrucks.length})</option>
              {availableTrucks.map(t => (
                <option key={t} value={t}>เบอร์รถ: {t}</option>
              ))}
            </select>

            {/* Batch Filter */}
            <select
              value={selectedBatchFilter}
              onChange={(e) => setSelectedBatchFilter(e.target.value)}
              style={{
                height: '35px',
                padding: '0 8px',
                borderRadius: '7px',
                border: '1px solid #cbd5e1',
                fontSize: '12px',
                fontWeight: selectedBatchFilter !== 'ALL' ? 700 : 500,
                background: selectedBatchFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
                color: selectedBatchFilter !== 'ALL' ? '#2563eb' : '#0f172a',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">📁 ทุกรอบงาน (All Batches)</option>
              {availableBatches.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>

            {/* Clear Filters */}
            {(selectedTruckFilter !== 'ALL' || selectedBatchFilter !== 'ALL' || searchTerm.trim() !== '' || (selectedMonth && selectedMonth !== 'ALL')) && (
              <button
                onClick={() => {
                  setSelectedTruckFilter('ALL');
                  setSelectedBatchFilter('ALL');
                  setSelectedMonth('ALL');
                  setSearchTerm('');
                }}
                style={{
                  height: '35px',
                  padding: '0 9px',
                  borderRadius: '7px',
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                  color: '#b91c1c',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>✕</span>
                <span>ล้างตัวกรอง</span>
              </button>
            )}

            {/* Column Visibility Menu */}
            <ColumnVisibilityDropdown preferences={batchPrefs} />

            {/* 📥 Import Legacy JSON Button */}
            <button
              type="button"
              onClick={() => setIsLegacyImportModalOpen(true)}
              style={{
                height: '35px',
                padding: '0 12px',
                borderRadius: '7px',
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 3px rgba(37, 99, 235, 0.25)',
                whiteSpace: 'nowrap'
              }}
              title="นำเข้าไฟล์ manual_*.json หรือ result_*.json เดิมเข้าสู่ระบบ"
            >
              <span>📥</span>
              <span>นำเข้าจาก JSON เก่า</span>
            </button>

          </div>
        </div>

        {/* 4. Table */}
        {isLoading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>⏳</div>
            กำลังโหลดข้อมูลประวัติใบงาน...
          </div>
        ) : sortedSheets.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px', opacity: 0.6 }}>📭</div>
            {searchTerm || selectedBatchFilter !== 'ALL' ? 'ไม่พบใบงานที่ตรงตามเงื่อนไขการค้นหา' : 'ยังไม่มีประวัติใบงานที่บันทึก'}
          </div>
        ) : (
          <UniversalTableContainer
            preferences={batchPrefs}
          >
            <UniversalTableHeader
              preferences={batchPrefs}
              data={sortedSheets}
              alignMap={BATCH_ALIGN_MAP}
            />
            <tbody>
                {sortedSheets.map((sheet, index) => {
                  const isPerfect = sheet.red === 0;
                  const total = sheet.containers ? sheet.containers.length : 0;
                  const dateStr = sheet.saved_at ? new Date(sheet.saved_at).toLocaleString('th-TH', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : '-';

                  return (
                    <tr 
                      key={sheet.id || index}
                      style={{ 
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.15s ease',
                        background: index % 2 === 0 ? '#ffffff' : '#fcfdfd'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = index % 2 === 0 ? '#ffffff' : '#fcfdfd'; }}
                    >
                      {activeColumns.map(col => {
                        const align = BATCH_ALIGN_MAP[col] || 'left';
                        const cellStyle = {
                          padding: '8px 10px',
                          textAlign: align,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        };

                        if (col === 'index') {
                          return (
                            <td key={col} style={{ ...cellStyle, color: '#64748b', fontWeight: 600, fontSize: '13px' }}>
                              {index + 1}
                            </td>
                          );
                        }

                        if (col === 'thumbnail') {
                          const hasImage = Boolean(sheet.image_url || sheet.drive_file_id);
                          return (
                            <td key={col} style={{ ...cellStyle, padding: '4px 8px' }}>
                              {hasImage ? (
                                <div 
                                  onClick={() => handleOpenImagePreview(sheet)}
                                  style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '6px',
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    background: '#f1f5f9',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto',
                                    border: '1px solid #cbd5e1',
                                    transition: 'transform 0.15s ease'
                                  }}
                                  onMouseOver={e => e.currentTarget.style.transform = 'scale(1.08)'}
                                  onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                                  title="คลิกเพื่อเปิดดูภาพต้นฉบับ (ซูม/ลากดูได้)"
                                >
                                  <img 
                                    src={getDriveThumbnailUrl(sheet.image_url, sheet.drive_file_id)} 
                                    alt="Job Sheet" 
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                      if (e.target.parentElement) e.target.parentElement.innerHTML = '🖼️';
                                    }}
                                  />
                                </div>
                              ) : (
                                <span style={{ fontSize: '16px', color: '#94a3b8' }}>📄</span>
                              )}
                            </td>
                          );
                        }

                        if (col === 'image_name') {
                          const hasImage = Boolean(sheet.image_url || sheet.drive_file_id);
                          return (
                            <td key={col} style={cellStyle}>
                              <div 
                                onClick={hasImage ? () => handleOpenImagePreview(sheet) : undefined}
                                style={{
                                  fontWeight: 600,
                                  color: hasImage ? '#0284c7' : '#64748b',
                                  fontFamily: "'SF Mono', Consolas, monospace",
                                  fontSize: '12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  cursor: hasImage ? 'pointer' : 'default',
                                  textDecoration: hasImage ? 'underline' : 'none'
                                }}
                                title={hasImage ? `คลิกเพื่อเปิดดูภาพ: ${sheet.image_name}` : sheet.image_name}
                              >
                                <span style={{ fontSize: '13px' }}>🖼️</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{sheet.image_name || '-'}</span>
                              </div>
                            </td>
                          );
                        }

                        if (col === 'batch_name') {
                          return (
                            <td key={col} style={cellStyle}>
                              <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '13px' }}>
                                {sheet.batch_name}
                              </span>
                            </td>
                          );
                        }

                        if (col === 'truck_no') {
                          return (
                            <td key={col} style={cellStyle}>
                              <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                                {sheet.truck_no}
                              </span>
                            </td>
                          );
                        }

                        if (col === 'driver_name') {
                          const hasDriver = sheet.driver_name && sheet.driver_name !== '-';
                          return (
                            <td key={col} style={cellStyle}>
                              <span style={{
                                fontWeight: 700,
                                fontSize: '13px',
                                color: hasDriver ? '#0f172a' : '#94a3b8',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                {hasDriver ? `👤 ${sheet.driver_name}` : '-'}
                              </span>
                            </td>
                          );
                        }

                        if (col === 'total') {
                          return (
                            <td key={col} style={cellStyle}>
                              <span style={{ fontWeight: 700, fontSize: '13px', color: '#334155' }}>
                                {total} ตู้
                              </span>
                            </td>
                          );
                        }

                        if (col === 'match_summary') {
                          return (
                            <td key={col} style={cellStyle}>
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ color: '#15803d', fontWeight: 700, fontSize: '13px' }}>
                                  🟢 {sheet.green}
                                </span>
                                {sheet.red > 0 && (
                                  <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '13px' }}>
                                    🔴 {sheet.red}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (col === 'status') {
                          return (
                            <td key={col} style={cellStyle}>
                              {isPerfect ? (
                                <span style={{ color: '#15803d', fontWeight: 700, fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  ✓ ปิดจบงานแล้ว
                                </span>
                              ) : (
                                <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  ⚠️ ไม่พบ {sheet.red} ตู้
                                </span>
                              )}
                            </td>
                          );
                        }

                        if (col === 'saved_at') {
                          return (
                            <td key={col} style={{ ...cellStyle, color: '#475569', fontSize: '12.5px', fontWeight: 600 }}>
                              {dateStr}
                            </td>
                          );
                        }

                        if (col === 'actions') {
                          return (
                            <td key={col} style={cellStyle}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => setActiveDetailSheet(sheet)}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: '5px',
                                    border: '1px solid #cbd5e1',
                                    background: '#ffffff',
                                    color: '#0284c7',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                  title="คลิกเพื่อดูรายละเอียดใบงาน"
                                >
                                  รายละเอียด
                                </button>

                                {sheet.red > 0 && (
                                  <button
                                    onClick={() => openRedEditor(sheet)}
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: '5px',
                                      border: '1px solid #fde68a',
                                      background: '#fef3c7',
                                      color: '#b45309',
                                      fontSize: '12px',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '2px'
                                    }}
                                    title="เปิดหน้าต่างแก้ไขเฉพาะตู้ที่ยังไม่พบใน DB"
                                  >
                                    ✏️ แก้ไข ({sheet.red})
                                  </button>
                                )}

                                <button
                                  onClick={() => handleDeleteSheet(sheet)}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: '5px',
                                    border: '1px solid #fecaca',
                                    background: '#ffffff',
                                    color: '#dc2626',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                  title="ลบใบงานนี้ออกจากระบบ"
                                >
                                  🗑️ ลบ
                                </button>
                              </div>
                            </td>
                          );
                        }

                        return (
                          <td key={col} style={cellStyle}>
                            {String(sheet[col] || '-')}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
          </UniversalTableContainer>
        )}
      </div>

      {/* Modal: ดูรายละเอียดตู้ทั้งหมด */}
      {activeDetailSheet && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '750px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                    📦 รายการตู้ในใบงาน: เบอร์รถ {activeDetailSheet.truck_no}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>👤 คนขับ:</span>
                    {availableDrivers && availableDrivers.length > 0 ? (
                      <select
                        value={activeDetailSheet.driver_name || '-'}
                        onChange={(e) => handleUpdateDriver(activeDetailSheet.id, e.target.value)}
                        style={{
                          fontSize: '12.5px',
                          fontWeight: 700,
                          color: activeDetailSheet.driver_name && activeDetailSheet.driver_name !== '-' ? '#0f172a' : '#64748b',
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '2px 8px',
                          cursor: 'pointer',
                          outline: 'none'
                        }}
                      >
                        <option value="-">- ไม่ระบุคนขับ -</option>
                        {activeDetailSheet.driver_name && activeDetailSheet.driver_name !== '-' && !availableDrivers.includes(activeDetailSheet.driver_name) && (
                          <option value={activeDetailSheet.driver_name}>{activeDetailSheet.driver_name}</option>
                        )}
                        {availableDrivers.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ fontWeight: 700, color: '#334155' }}>
                        {activeDetailSheet.driver_name || '-'}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  รอบงาน: <b>{activeDetailSheet.batch_name}</b> | ทั้งหมด {activeDetailSheet.containers.length} ตู้ (🟢 สมบูรณ์: {activeDetailSheet.green}, 🔴 ไม่พบ DB: {activeDetailSheet.red})
                </div>
              </div>

              <button
                onClick={() => setActiveDetailSheet(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  fontWeight: 'bold'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Table Content */}
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: '#475569', fontWeight: 700 }}>
                    <th style={{ padding: '10px 12px', width: '50px', textAlign: 'center' }}>#</th>
                    <th style={{ padding: '10px 12px' }}>เลขตู้ (Container No)</th>
                    <th style={{ padding: '10px 12px', width: '100px' }}>ท่าเรือ</th>
                    <th style={{ padding: '10px 12px', width: '80px', textAlign: 'center' }}>ขนาด</th>
                    <th style={{ padding: '10px 12px', width: '110px' }}>วันทำงาน</th>
                    <th style={{ padding: '10px 12px', width: '130px', textAlign: 'center' }}>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDetailSheet.containers.map((c, i) => (
                    <tr key={c.id || i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                      <td style={{ padding: '10px 12px', fontFamily: "'SF Mono', Consolas, monospace", fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                        {c.container_no}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#334155' }}>
                        {c.port !== '-' ? `ท่า ${c.port}` : '-'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#334155' }}>
                        {c.size !== '-' ? `S${c.size}` : '-'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#475569', fontSize: '12px' }}>
                        {(() => {
                          const cleanNo = String(c.container_no || '').trim().toUpperCase();
                          const mRecord = masterDb.find(m => String(m.container_no || '').trim().toUpperCase() === cleanNo);
                          const rawDate = (c.date_job && c.date_job !== '-' && c.date_job !== 'null') ? c.date_job : (mRecord?.date_job || '-');
                          if (rawDate && rawDate !== '-') {
                            const iso = normalizeExcelDate(rawDate);
                            if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
                              const [y, m, d] = iso.split('-');
                              return `${d}/${m}/${y}`;
                            }
                            return `${rawDate}`;
                          }
                          return '-';
                        })()}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {(c.is_red || c.match_status === 'manual_red') ? (
                          <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '12px' }}>
                            🔴 ไม่พบใน DB
                          </span>
                        ) : (
                          <span style={{ color: '#15803d', fontWeight: 700, fontSize: '12px' }}>
                            🟢 สมบูรณ์
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {activeDetailSheet.image_url && (
                  <button
                    onClick={() => handleDownloadImage(activeDetailSheet.image_url, activeDetailSheet.truck_no, activeDetailSheet.batch_name)}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#0284c7',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>📥 ดาวน์โหลดภาพถ่ายใบงานต้นฉบับ</span>
                  </button>
                )}

                <button
                  onClick={() => handleDeleteSheet(activeDetailSheet)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="ลบใบงานนี้ออกจากระบบ"
                >
                  🗑️ ลบใบงานนี้
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {activeDetailSheet.red > 0 && (
                  <button
                    onClick={() => {
                      const sheet = activeDetailSheet;
                      setActiveDetailSheet(null);
                      openRedEditor(sheet);
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: '1px solid #f59e0b',
                      background: '#fef3c7',
                      color: '#b45309',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    ✏️ แก้ไขเฉพาะตู้ที่ยังไม่พบ ({activeDetailSheet.red})
                  </button>
                )}
                <button
                  onClick={() => setActiveDetailSheet(null)}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: แก้ไขเฉพาะตู้ที่ยังไม่พบ */}
      {editingRedSheet && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '24px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '850px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 24px',
              borderBottom: '1px solid #fed7aa',
              background: '#fff7ed',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '17px', fontWeight: 800, color: '#9a3412', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>✏️ แก้ไขเฉพาะตู้ที่ยังไม่พบในใบวางบิล</span>
                  <span style={{ fontSize: '13px', color: '#c2410c', background: '#ffedd5', padding: '2px 8px', borderRadius: '6px' }}>
                    เบอร์รถ: {editingRedSheet.truck_no} {editingRedSheet.driver_name && editingRedSheet.driver_name !== '-' ? `| คนขับ: ${editingRedSheet.driver_name}` : ''}
                  </span>
                </h3>
                <div style={{ fontSize: '12.5px', color: '#7c2d12' }}>
                  แก้ไขเฉพาะตู้สีแดง ({redEditRows.length} ตู้) ระบบจะไม่แตะต้องตู้ที่จับคู่สมบูรณ์แล้ว 🟢
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {editingRedSheet.image_url && (
                  <button
                    onClick={() => handleDownloadImage(editingRedSheet.image_url, editingRedSheet.truck_no, editingRedSheet.batch_name)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid #fdba74',
                      background: '#ffffff',
                      color: '#ea580c',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    📥 ดาวน์โหลดรูปใบงาน
                  </button>
                )}
                <button
                  onClick={() => setEditingRedSheet(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '20px',
                    color: '#9a3412',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    fontWeight: 'bold'
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {redEditRows.map((row, idx) => {
                const targetTruck = (editingRedSheet.truck_no || '').trim();
                let truckDbList = masterDb;
                if (targetTruck && targetTruck !== '-') {
                  truckDbList = masterDb.filter(r => String(r.truck_no || '').trim() === targetTruck);
                  if (truckDbList.length === 0) truckDbList = masterDb;
                }

                const candidates = findTopContainerMatches(row.container_no, truckDbList, 3);
                const exactMatch = masterDb.find(m => String(m.container_no || '').trim().toUpperCase() === String(row.container_no || '').trim().toUpperCase());
                const isGreen = row.isConfirmedMatch || !!exactMatch;

                return (
                  <div 
                    key={row.id || idx}
                    style={{
                      background: isGreen ? '#f0fdf4' : '#fff1f2',
                      border: isGreen ? '1px solid #bbf7d0' : '1px solid #fecdd3',
                      borderRadius: '10px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>
                          ตู้ที่ {idx + 1}:
                        </span>
                        <input
                          type="text"
                          value={row.container_no}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRedEditRows(prev => prev.map((r, i) => i === idx ? { ...r, container_no: val, isConfirmedMatch: false } : r));
                          }}
                          placeholder="พิมพ์เลขตู้..."
                          style={{
                            height: '36px',
                            padding: '0 12px',
                            borderRadius: '6px',
                            border: isGreen ? '1px solid #86efac' : '1px solid #cbd5e1',
                            fontSize: '14px',
                            fontWeight: 700,
                            fontFamily: "'SF Mono', Consolas, monospace",
                            color: '#0f172a',
                            width: '200px',
                            background: '#ffffff',
                            outline: 'none'
                          }}
                        />

                        {/* Status Indicator */}
                        {isGreen ? (
                          <span style={{ color: '#15803d', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            🟢 ตรงกับใบวางบิล (พร้อมบันทึก)
                          </span>
                        ) : (
                          <span style={{ color: '#dc2626', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            🔴 ยังไม่พบในใบวางบิล
                          </span>
                        )}
                      </div>

                      {/* Port & Size Preview */}
                      <div style={{ fontSize: '12.5px', color: '#475569', display: 'flex', gap: '12px' }}>
                        <span>ท่าเรือ: <b>{exactMatch?.port || row.port || '-'}</b></span>
                        <span>ขนาด: <b>{exactMatch?.size || row.size || '-'}</b></span>
                      </div>
                    </div>

                    {/* Candidate Quick Chooser Buttons */}
                    {candidates.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>ตัวเลือกแนะนำ:</span>
                        {candidates.map((cand, cIdx) => (
                          <button
                            key={cIdx}
                            onClick={() => {
                              setRedEditRows(prev => prev.map((r, i) => i === idx ? {
                                ...r,
                                container_no: cand.container_no,
                                port: cand.port || r.port,
                                size: cand.size || r.size,
                                isConfirmedMatch: true
                              } : r));
                            }}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: (cand.matchRate >= 90 || cand.score >= 0.9) ? '1px solid #86efac' : '1px solid #fed7aa',
                              background: (cand.matchRate >= 90 || cand.score >= 0.9) ? '#f0fdf4' : '#fff7ed',
                              color: (cand.matchRate >= 90 || cand.score >= 0.9) ? '#15803d' : '#c2410c',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <span>{cand.container_no}</span>
                            <span style={{ fontSize: '10.5px', opacity: 0.8 }}>({Math.round(cand.matchRate ?? (cand.score ? (cand.score > 1 ? cand.score : cand.score * 100) : 0))}%)</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 24px',
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                💡 กดเลือกตัวเลือกแนะนำ หรือพิมพ์เลขตู้ใหม่ แล้วกดปุ่มบันทึก
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setEditingRedSheet(null)}
                  disabled={isSavingRed}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '7px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  ยกเลิก
                </button>

                <button
                  onClick={handleSaveRedEdits}
                  disabled={isSavingRed}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '7px',
                    border: 'none',
                    background: '#10b981',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)'
                  }}
                >
                  {isSavingRed ? '⏳ กำลังบันทึก...' : '💾 บันทึกเฉพาะตู้ที่แก้ไข (Save Changes)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 📥 Legacy JSON Import Modal */}
      <LegacyJsonImportModal
        isOpen={isLegacyImportModalOpen}
        onClose={() => setIsLegacyImportModalOpen(false)}
        masterDbList={masterDb}
        driversList={fullDriversList}
        trucksList={fullTrucksList}
        opsList={fullOpsList}
        onImportSuccess={() => {
          loadPaginatedData();
        }}
      />

      {/* 🖼️ High-Res Image Preview Modal */}
      <ContainerImageModal
        previewImage={previewImage}
        onClose={() => setPreviewImage(null)}
      />

    </div>
  );
}
