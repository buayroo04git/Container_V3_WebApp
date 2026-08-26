import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { jobSheetService } from '../services/jobSheetService';
import { containerService } from '../services/containerService';
import { normalizeExcelDate } from '../utils/matchingLogic';
import Badge from '../components/ui/Badge';
import ContainerImageModal from '../components/containers/ContainerImageModal';
import EditOcrContainerModal from '../components/ui/EditOcrContainerModal';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown';
import UniversalTableContainer from '../components/ui/UniversalTableContainer';
import UniversalTableHeader from '../components/ui/UniversalTableHeader';
import MonthPicker from '../components/ui/MonthPicker';
import useActiveMonth from '../hooks/useActiveMonth';
import { useColumnPreferences } from '../hooks/useColumnPreferences';

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

const OCR_RAW_COLUMNS = [
  'index',
  'container_no',
  'workflow_status',
  'match_status',
  'job_type',
  'size',
  'port',
  'date_job',
  'truck_no',
  'driver_name',
  'batch_name',
  'created_at',
  'image_url',
  'actions'
];

const OCR_DEFAULT_NAMES = {
  index: '#',
  container_no: 'เลขตู้คอนเทนเนอร์',
  workflow_status: 'สถานะใบงาน',
  match_status: 'ผลการจับคู่',
  job_type: 'ประเภทงาน',
  size: 'ขนาด',
  port: 'ท่าเรือ',
  date_job: 'วันทำงาน (Date Job)',
  truck_no: 'เบอร์รถ',
  driver_name: 'คนขับ',
  batch_name: 'รอบงาน',
  created_at: 'วันที่บันทึก',
  image_url: 'ดูใบงาน',
  actions: 'จัดการ'
};

const OCR_DEFAULT_WIDTHS = {
  index: 45,
  container_no: 150,
  workflow_status: 120,
  match_status: 120,
  job_type: 90,
  size: 70,
  port: 75,
  date_job: 110,
  truck_no: 95,
  driver_name: 130,
  batch_name: 130,
  created_at: 125,
  image_url: 80,
  actions: 90
};

const OCR_ALIGN_MAP = {
  index: 'center',
  container_no: 'left',
  workflow_status: 'center',
  match_status: 'center',
  job_type: 'center',
  size: 'center',
  port: 'center',
  date_job: 'center',
  truck_no: 'center',
  driver_name: 'left',
  batch_name: 'left',
  created_at: 'center',
  image_url: 'center',
  actions: 'center'
};

export default function OcrContainerHistoryView({ setActiveTab }) {
  const [containers, setContainers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [masterDb, setMasterDb] = useState([]);
  const [kpis, setKpis] = useState({ total: 0, completed: 0, pending: 0, matched: 0, unmatched: 0 });
  const [availableBatches, setAvailableBatches] = useState([]);
  const [availableTrucks, setAvailableTrucks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'COMPLETED' | 'PENDING' | 'MATCHED' | 'UNMATCHED'
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('ALL');
  const [selectedTruckFilter, setSelectedTruckFilter] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useActiveMonth();
  const [previewImage, setPreviewImage] = useState(null);
  const [editingContainer, setEditingContainer] = useState(null);

  // 📄 ระบบ Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50); // 25, 50, 100, 200, 'ALL'
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

  // 1. โหลดข้อมูล Metadata (KPIs, Batches, Trucks, Master DB) ตอนเปิดหน้าจอ
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [kpiRes, batchesRes, trucksRes, masterRes] = await Promise.all([
          jobSheetService.fetchOcrKpis(),
          supabase.from('job_sheets').select('batch_name').neq('status', 'deleted').limit(150),
          supabase.from('truck_records').select('truck_no').order('truck_no'),
          containerService.fetchMasterContainers()
        ]);
        if (kpiRes) setKpis(kpiRes);
        if (batchesRes?.data) {
          const bSet = new Set(batchesRes.data.map(b => b.batch_name).filter(Boolean));
          setAvailableBatches(Array.from(bSet).sort());
        }
        if (trucksRes?.data) {
          const tSet = new Set(trucksRes.data.map(t => t.truck_no).filter(Boolean));
          setAvailableTrucks(Array.from(tSet).sort());
        }
        if (masterRes?.data) {
          setMasterDb(masterRes.data);
        }
      } catch (e) {
        console.error('Error fetching OCR metadata:', e);
      }
    };
    fetchMetadata();
  }, []);

  // 2. Debounce การพิมพ์ค้นหา (300ms) เพื่อไม่ให้ยิง Query ทุกตัวอักษร
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // 3. รีเซ็ตกลับไปหน้าที่ 1 เมื่อตัวกรองเปลี่ยน
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, selectedBatchFilter, selectedTruckFilter, selectedMonth, rowsPerPage]);

  // 4. ดึงข้อมูลตารางแบบ Server-Side Pagination จริงเมื่อเงื่อนไขเปลี่ยน
  useEffect(() => {
    loadPaginatedData();
  }, [currentPage, rowsPerPage, debouncedSearch, statusFilter, selectedBatchFilter, selectedTruckFilter, selectedMonth, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const loadPaginatedData = async () => {
    setIsLoading(true);
    try {
      const res = await jobSheetService.fetchPaginatedOcrContainersHistory({
        page: currentPage,
        pageSize: rowsPerPage,
        searchTerm: debouncedSearch,
        statusFilter,
        batchFilter: selectedBatchFilter,
        truckFilter: selectedTruckFilter,
        monthFilter: selectedMonth,
        sortConfig
      });

      if (res.error) {
        // Fallback: ถ้า View ใน Postgres ยังไม่ได้สร้าง ให้ดึงแบบเดิมชั่วคราว
        const fallbackRes = await jobSheetService.fetchAllOcrContainersHistory();
        if (fallbackRes.error) throw fallbackRes.error;
        const all = fallbackRes.data || [];
        const size = rowsPerPage === 'ALL' ? all.length : (Number(rowsPerPage) || 50);
        const start = (currentPage - 1) * size;
        setContainers(all.slice(start, start + size));
        setTotalCount(all.length);
        setTotalPages(Math.ceil(all.length / (size || 50)) || 1);
      } else {
        setContainers(res.data || []);
        setTotalCount(res.totalCount || 0);
        setTotalPages(res.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load paginated OCR containers:', err);
      alert('ไม่สามารถดึงข้อมูลประวัติตู้ OCR ได้: ' + (err.message || err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEditedContainer = async (updatedFields) => {
    if (!editingContainer) return;
    const res = await jobSheetService.updateSingleOcrContainerRecord(editingContainer, updatedFields);
    if (res.success) {
      // อัปเดตข้อมูลตู้ใน State ทันทีแบบ Realtime
      setContainers(prev => prev.map(c => {
        if (c.id === editingContainer.id || (c.db_id && c.db_id === editingContainer.db_id)) {
          return {
            ...c,
            container_no: updatedFields.container_no,
            job_type: updatedFields.job_type,
            port: updatedFields.port,
            size: updatedFields.size,
            truck_no: updatedFields.truck_no,
            match_status: res.match_status
          };
        }
        return c;
      }));
      setEditingContainer(null);
    } else {
      throw res.error || new Error('Update failed');
    }
  };

  // แถวที่แสดงผลในตาราง (คือชุดข้อมูลที่เพิ่งโหลดมาจาก Server ตาม Page ปัจจุบัน)
  const paginatedContainers = containers;
  const sortedContainers = containers; // สำหรับฟังก์ชัน Export หรือ Helper
  const totalRows = totalCount;
  const startIndex = rowsPerPage === 'ALL' ? 0 : (currentPage - 1) * (Number(rowsPerPage) || 50);
  const endIndex = rowsPerPage === 'ALL' ? totalRows : Math.min(startIndex + containers.length, totalRows);

  // Hook สำหรับจัดการคอลัมน์ (Visibility, Reorder, Resize, Auto-fit, Context Menu)
  const ocrPrefs = useColumnPreferences({
    storageKeyPrefix: 'ocr_history',
    rawColumns: OCR_RAW_COLUMNS,
    defaultNames: OCR_DEFAULT_NAMES,
    defaultWidths: OCR_DEFAULT_WIDTHS,
    sampleRecords: sortedContainers,
    onSortChange: (newSort) => {
      setSortConfig(newSort);
    },
    formatCellValue: (col, val) => {
      if (col === 'image_url') return val ? '🖼️ รูป' : '-';
      if (col === 'actions') return '✏️ จัดการ';
      if (col === 'date_job') {
        const iso = normalizeExcelDate(val);
        if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
          const [y, m, d] = iso.split('-');
          return `${d}/${m}/${y}`;
        }
        return String(val || '-');
      }
      if (col === 'created_at') return val ? new Date(val).toLocaleString('th-TH') : '-';
      return String(val || '');
    }
  });

  const { activeColumns } = ocrPrefs;

  // ส่งออกข้อมูลเป็นไฟล์ Excel
  const handleExportExcel = () => {
    if (sortedContainers.length === 0) {
      alert('ไม่มีข้อมูลสำหรับส่งออกตามตัวกรองที่เลือก');
      return;
    }

    const exportRows = sortedContainers.map((c, idx) => {
      let cleanJob = '-';
      if (c.job_type && c.job_type !== '-') {
        const upper = String(c.job_type).trim().toUpperCase();
        if (upper.includes('DIS') || upper === 'D') cleanJob = 'DIS';
        else if (upper.includes('LOAD') || upper === 'L') cleanJob = 'LOAD';
        else cleanJob = upper;
      }
      let cleanSz = '-';
      if (c.size && c.size !== '-') {
        cleanSz = String(c.size).replace(/[^0-9]/g, '') || String(c.size).trim();
      }

      let formattedDateJob = '-';
      if (c.date_job && c.date_job !== '-') {
        const iso = normalizeExcelDate(c.date_job);
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
          const [y, m, d] = iso.split('-');
          formattedDateJob = `${d}/${m}/${y}`;
        } else {
          formattedDateJob = dj;
        }
      }

      return {
        'ลำดับ': idx + 1,
        'เลขตู้ (Container No)': c.container_no,
        'ข้อความเดิม OCR': c.raw_ocr_text || '',
        'สถานะใบงาน': c.workflow_status === 'completed' ? 'เสร็จสมบูรณ์ (Completed)' : 'รอตรวจ (Pending)',
        'สถานะจับคู่': c.match_status === 'manual_red' ? 'ไม่พบใน DB (Red)' : 'ตรง DB (Green)',
        'ประเภทงาน': cleanJob,
        'ขนาด': cleanSz,
        'ท่าเรือ': c.port || '',
        'วันทำงาน (Date Job)': formattedDateJob,
        'เบอร์รถ': c.truck_no || '',
        'รอบงาน': c.batch_name || '',
        'บรรทัดที่': c.line_no || '',
        'วันที่บันทึก': c.created_at ? new Date(c.created_at).toLocaleString('th-TH') : ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'OCR_Containers');
    const filename = `OCR_Container_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  return (
    <div style={{ padding: '16px 24px', maxWidth: '1600px', margin: '0 auto', width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeIn 0.3s ease' }}>
      
      {/* 1. Header Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexShrink: 0, gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 2px 0', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📊 OCR Container History
          </h1>
          <p style={{ color: '#64748b', fontSize: '12.5px', margin: 0 }}>
            ประวัติตู้ทั้งหมดจากใบงานในระบบ (ทั้งที่จบงานแล้วและยังรอการยืนยัน)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={loadPaginatedData}
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
            <span>รีเฟรช</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={isLoading || sortedContainers.length === 0}
            style={{
              height: '36px',
              padding: '0 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#1e293b',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: (isLoading || sortedContainers.length === 0) ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}
          >
            <span>📥</span>
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* 2. KPI Summary Cards (Compact 5-column layout) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        gap: '10px',
        marginBottom: '14px',
        flexShrink: 0
      }}>
        {/* Card 1: All */}
        <div 
          onClick={() => setStatusFilter('ALL')}
          style={{
            background: statusFilter === 'ALL' ? '#eff6ff' : '#ffffff',
            border: statusFilter === 'ALL' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
            borderRadius: '9px',
            padding: '10px 14px',
            cursor: 'pointer',
            boxShadow: statusFilter === 'ALL' ? '0 2px 8px rgba(37, 99, 235, 0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
            transition: 'all 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '80px',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ fontSize: '11.5px', color: statusFilter === 'ALL' ? '#1d4ed8' : '#64748b', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            📦 งานทั้งหมดในใบงาน
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', lineHeight: 1.1, fontFamily: "'Inter', sans-serif" }}>
              {kpis.total.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>งาน</span>
            </div>
            <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              รวม Completed + Pending
            </div>
          </div>
        </div>

        {/* Card 2: Completed */}
        <div 
          onClick={() => setStatusFilter('COMPLETED')}
          style={{
            background: statusFilter === 'COMPLETED' ? '#f0fdf4' : '#ffffff',
            border: statusFilter === 'COMPLETED' ? '1.5px solid #16a34a' : '1px solid #e2e8f0',
            borderRadius: '9px',
            padding: '10px 14px',
            cursor: 'pointer',
            boxShadow: statusFilter === 'COMPLETED' ? '0 2px 8px rgba(22, 163, 74, 0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
            transition: 'all 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '80px',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ fontSize: '11.5px', color: '#15803d', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            ✅ บันทึกเสร็จแล้ว
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#15803d', lineHeight: 1.1, fontFamily: "'Inter', sans-serif" }}>
              {kpis.completed.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600, color: '#166534' }}>งาน</span>
            </div>
            <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {kpis.total > 0 ? `${((kpis.completed / kpis.total) * 100).toFixed(0)}% จบงานแล้ว` : 'จบงานแล้ว'}
            </div>
          </div>
        </div>

        {/* Card 3: Pending */}
        <div 
          onClick={() => setStatusFilter('PENDING')}
          style={{
            background: statusFilter === 'PENDING' ? '#fffbeb' : '#ffffff',
            border: statusFilter === 'PENDING' ? '1.5px solid #d97706' : '1px solid #e2e8f0',
            borderRadius: '9px',
            padding: '10px 14px',
            cursor: 'pointer',
            boxShadow: statusFilter === 'PENDING' ? '0 2px 8px rgba(217, 119, 6, 0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
            transition: 'all 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '80px',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ fontSize: '11.5px', color: '#b45309', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            ⏳ กำลังรอตรวจ
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#d97706', lineHeight: 1.1, fontFamily: "'Inter', sans-serif" }}>
              {kpis.pending.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600, color: '#854d0e' }}>งาน</span>
            </div>
            <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              อยู่ในคิวรอตรวจ
            </div>
          </div>
        </div>

        {/* Card 4: Matched Green */}
        <div 
          onClick={() => setStatusFilter('MATCHED')}
          style={{
            background: statusFilter === 'MATCHED' ? '#eff6ff' : '#ffffff',
            border: statusFilter === 'MATCHED' ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
            borderRadius: '9px',
            padding: '10px 14px',
            cursor: 'pointer',
            boxShadow: statusFilter === 'MATCHED' ? '0 2px 8px rgba(37, 99, 235, 0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
            transition: 'all 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '80px',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ fontSize: '11.5px', color: '#1d4ed8', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            🟢 ตรงใบวางบิล
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#2563eb', lineHeight: 1.1, fontFamily: "'Inter', sans-serif" }}>
              {kpis.matched.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600, color: '#1e40af' }}>งาน</span>
            </div>
            <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {kpis.completed > 0 ? `${((kpis.matched / kpis.completed) * 100).toFixed(0)}% จากงานที่ตรวจเสร็จ` : 'ตรงใบวางบิล'}
            </div>
          </div>
        </div>

        {/* Card 5: Unmatched Red */}
        <div 
          onClick={() => setStatusFilter('UNMATCHED')}
          style={{
            background: statusFilter === 'UNMATCHED' ? '#fef2f2' : (kpis.unmatched > 0 ? '#fff1f2' : '#ffffff'),
            border: statusFilter === 'UNMATCHED' ? '1.5px solid #dc2626' : (kpis.unmatched > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0'),
            borderRadius: '9px',
            padding: '10px 14px',
            cursor: 'pointer',
            boxShadow: statusFilter === 'UNMATCHED' ? '0 2px 8px rgba(220, 38, 38, 0.12)' : '0 1px 2px rgba(0,0,0,0.02)',
            transition: 'all 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '80px',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ fontSize: '11.5px', color: kpis.unmatched > 0 ? '#991b1b' : '#64748b', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            🔴 ไม่พบในใบวางบิล
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: kpis.unmatched > 0 ? '#dc2626' : '#64748b', lineHeight: 1.1, fontFamily: "'Inter', sans-serif" }}>
              {kpis.unmatched.toLocaleString()} <span style={{ fontSize: '12px', fontWeight: 600, color: '#991b1b' }}>งาน</span>
            </div>
            <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {kpis.completed > 0 ? `${((kpis.unmatched / kpis.completed) * 100).toFixed(0)}% จากงานที่ตรวจเสร็จ` : 'ไม่มีในใบวางบิล'}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Table Card */}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexShrink: 0, marginBottom: '10px', flexWrap: 'wrap' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
              📋 รายการตู้ทั้งหมดจากใบงาน
            </span>
            <span style={{ fontSize: '12px', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
              {totalCount.toLocaleString()} รายการ
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
              {selectedMonth && (
                <button
                  type="button"
                  onClick={() => setSelectedMonth('')}
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

            {/* Batch Filter Dropdown */}
            {availableBatches.length > 0 && (
              <select
                value={selectedBatchFilter}
                onChange={(e) => setSelectedBatchFilter(e.target.value)}
                style={{
                  height: '35px',
                  padding: '0 8px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  background: selectedBatchFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
                  color: selectedBatchFilter !== 'ALL' ? '#2563eb' : '#334155',
                  fontSize: '12px',
                  fontWeight: selectedBatchFilter !== 'ALL' ? 700 : 500,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">📁 รอบงาน</option>
                {availableBatches.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            )}

            {/* Truck Filter Dropdown */}
            {availableTrucks.length > 0 && (
              <select
                value={selectedTruckFilter}
                onChange={(e) => setSelectedTruckFilter(e.target.value)}
                style={{
                  height: '35px',
                  padding: '0 8px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  background: selectedTruckFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
                  color: selectedTruckFilter !== 'ALL' ? '#2563eb' : '#334155',
                  fontSize: '12px',
                  fontWeight: selectedTruckFilter !== 'ALL' ? 700 : 500,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">🚚 เบอร์รถ</option>
                {availableTrucks.map(t => (
                  <option key={t} value={t}>รถ {t}</option>
                ))}
              </select>
            )}

            {/* Clear Filter Button */}
            {(selectedBatchFilter !== 'ALL' || selectedTruckFilter !== 'ALL' || searchTerm.trim() !== '' || statusFilter !== 'ALL' || selectedMonth !== '') && (
              <button
                onClick={() => {
                  setSelectedBatchFilter('ALL');
                  setSelectedTruckFilter('ALL');
                  setSelectedMonth('');
                  setStatusFilter('ALL');
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

            {/* Search Box */}
            <div style={{ position: 'relative', width: '220px' }}>
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '13px', pointerEvents: 'none' }}>🔍</span>
              <input 
                type="text" 
                placeholder="ค้นหาเลขตู้, เบอร์รถ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ 
                  height: '35px',
                  paddingLeft: '32px',
                  paddingRight: searchTerm ? '28px' : '10px',
                  width: '100%', 
                  borderRadius: '7px', 
                  background: '#ffffff', 
                  border: '1px solid #cbd5e1', 
                  color: '#0f172a',
                  fontSize: '12.5px',
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

            {/* Column Visibility Menu */}
            <ColumnVisibilityDropdown preferences={ocrPrefs} />

          </div>
        </div>

        {/* 4. Table */}
        <UniversalTableContainer
          preferences={ocrPrefs}
        >
          <UniversalTableHeader
            preferences={ocrPrefs}
            data={sortedContainers}
            alignMap={OCR_ALIGN_MAP}
          />
          <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={Math.max(activeColumns.length, 1)} style={{ padding: '56px 20px', textAlign: 'center', color: '#64748b' }}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>
                    <div style={{ fontWeight: 600 }}>กำลังดึงข้อมูลประวัติตู้ OCR...</div>
                  </td>
                </tr>
              ) : paginatedContainers.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(activeColumns.length, 1)} style={{ padding: '56px 20px', textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
                    <div style={{ fontWeight: 600 }}>ไม่พบข้อมูลเลขตู้ตามเงื่อนไขที่เลือก</div>
                  </td>
                </tr>
              ) : (
                paginatedContainers.map((item, index) => {
                  const isCompleted = item.workflow_status === 'completed';
                  const isRed = item.match_status === 'manual_red';
                  const isDup = item.match_status === 'duplicate_auto';
                  const isCancelled = item.match_status === 'cancelled';
                  const displayIndex = startIndex + index + 1;

                  let cleanJobType = '-';
                  if (item.job_type && item.job_type !== '-') {
                    const upper = String(item.job_type).trim().toUpperCase();
                    if (upper.includes('DIS') || upper === 'D') cleanJobType = 'DIS';
                    else if (upper.includes('LOAD') || upper === 'L') cleanJobType = 'LOAD';
                    else cleanJobType = upper;
                  }

                  let cleanSize = '-';
                  if (item.size && item.size !== '-') {
                    const digits = String(item.size).replace(/[^0-9]/g, '');
                    cleanSize = digits || String(item.size).trim();
                  }

                  const cleanPort = item.port && item.port !== '-' ? String(item.port).trim() : '-';

                  return (
                    <tr
                      key={item.id || index}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.15s ease',
                        background: index % 2 === 0 ? '#ffffff' : '#fcfdfd'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = index % 2 === 0 ? '#ffffff' : '#fcfdfd'; }}
                    >
                      {activeColumns.map(col => {
                        const align = OCR_ALIGN_MAP[col] || 'left';
                        const cellStyle = {
                          padding: '8px 10px',
                          textAlign: align,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        };

                        if (col === 'index') {
                          return (
                            <td key={col} style={{ ...cellStyle, color: '#64748b', fontSize: '12.5px', fontWeight: 700 }}>
                              {displayIndex}
                            </td>
                          );
                        }

                        if (col === 'container_no') {
                          return (
                            <td key={col} style={cellStyle}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{
                                  fontFamily: "'SF Mono', Consolas, Monaco, monospace",
                                  fontWeight: 700,
                                  fontSize: '13.5px',
                                  color: isCancelled ? '#94a3b8' : (isRed ? '#dc2626' : (isDup ? '#4f46e5' : '#1d4ed8')),
                                  letterSpacing: '0.4px',
                                  textDecoration: isCancelled ? 'line-through' : 'none'
                                }}>
                                  {item.container_no}
                                </span>
                                {item.raw_ocr_text && item.raw_ocr_text !== item.container_no && (
                                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, fontFamily: "'SF Mono', Consolas, Monaco, monospace" }}>
                                    OCR: {item.raw_ocr_text}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (col === 'workflow_status') {
                          return (
                            <td key={col} style={cellStyle}>
                              {isCompleted ? (
                                <Badge variant="success" size="sm" icon="✅">Completed</Badge>
                              ) : (
                                <Badge variant="warning" size="sm" icon="⏳">Pending Draft</Badge>
                              )}
                            </td>
                          );
                        }

                        if (col === 'match_status') {
                          return (
                            <td key={col} style={cellStyle}>
                              {isCancelled ? (
                                <Badge variant="neutral" size="sm" icon="🚫">ขีดฆ่า</Badge>
                              ) : isRed ? (
                                <Badge variant="danger" size="sm" icon="🔴">ไม่พบใน DB</Badge>
                              ) : isDup ? (
                                <Badge variant="indigo" size="sm" icon="🟣">ซ้ำ Auto</Badge>
                              ) : (
                                <Badge variant="success" size="sm" icon="🟢">ตรง DB</Badge>
                              )}
                            </td>
                          );
                        }

                        if (col === 'job_type') {
                          return (
                            <td key={col} style={cellStyle}>
                              {cleanJobType !== '-' ? (
                                cleanJobType === 'DIS' ? (
                                  <Badge variant="info" size="sm" style={{ minWidth: '52px', justifyContent: 'center', fontWeight: 800, letterSpacing: '0.5px' }}>DIS</Badge>
                                ) : (
                                  <Badge variant="warning" size="sm" style={{ minWidth: '52px', justifyContent: 'center', fontWeight: 800, letterSpacing: '0.5px' }}>LOAD</Badge>
                                )
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 700 }}>-</span>
                              )}
                            </td>
                          );
                        }

                        if (col === 'size') {
                          return (
                            <td key={col} style={cellStyle}>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: cleanSize !== '-' ? '#0f172a' : '#94a3b8' }}>
                                {cleanSize}
                              </span>
                            </td>
                          );
                        }

                        if (col === 'port') {
                          return (
                            <td key={col} style={cellStyle}>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: cleanPort !== '-' ? '#0f172a' : '#94a3b8' }}>
                                {cleanPort}
                              </span>
                            </td>
                          );
                        }

                        if (col === 'date_job') {
                          let formattedDate = '-';
                          if (item.date_job && item.date_job !== '-') {
                            const iso = normalizeExcelDate(item.date_job);
                            if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
                              const [y, m, d] = iso.split('-');
                              formattedDate = `${d}/${m}/${y}`;
                            } else {
                              formattedDate = String(item.date_job);
                            }
                          }
                          return (
                            <td key={col} style={cellStyle}>
                              <span style={{ fontWeight: 600, color: formattedDate !== '-' ? '#0f172a' : '#94a3b8', fontSize: '12.5px' }}>
                                {formattedDate}
                              </span>
                            </td>
                          );
                        }

                        if (col === 'truck_no') {
                          return (
                            <td key={col} style={cellStyle}>
                              <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>
                                {item.truck_no || '-'}
                              </span>
                            </td>
                          );
                        }

                        if (col === 'driver_name') {
                          return (
                            <td key={col} style={cellStyle}>
                              <span style={{ fontWeight: 600, color: item.driver_name && item.driver_name !== '-' ? '#1e293b' : '#94a3b8', fontSize: '13px' }}>
                                {item.driver_name || '-'}
                              </span>
                            </td>
                          );
                        }

                        if (col === 'batch_name') {
                          return (
                            <td key={col} style={cellStyle}>
                              <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '13px' }}>
                                {item.batch_name || '-'}
                              </span>
                            </td>
                          );
                        }

                        if (col === 'created_at') {
                          return (
                            <td key={col} style={{ ...cellStyle, color: '#475569', fontSize: '12.5px' }}>
                              <span style={{ fontWeight: 600 }}>
                                {item.created_at ? new Date(item.created_at).toLocaleString('th-TH', {
                                  year: '2-digit', month: 'short', day: 'numeric',
                                  hour: '2-digit', minute: '2-digit'
                                }) : '-'}
                              </span>
                            </td>
                          );
                        }

                        if (col === 'image_url') {
                          return (
                            <td key={col} style={cellStyle}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                {item.image_url ? (
                                  <button
                                    onClick={() => setPreviewImage({ url: item.image_url, name: item.image_name || item.container_no })}
                                    title="ดูรูปภาพใบงาน"
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: '5px',
                                      border: '1px solid #bfdbfe',
                                      background: '#eff6ff',
                                      color: '#2563eb',
                                      fontSize: '11.5px',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease'
                                    }}
                                    onMouseOver={e => e.currentTarget.style.background = '#dbeafe'}
                                    onMouseOut={e => e.currentTarget.style.background = '#eff6ff'}
                                  >
                                    🖼️ รูป
                                  </button>
                                ) : (
                                  <span style={{ color: '#cbd5e1', fontSize: '11px' }}>-</span>
                                )}

                                {!isCompleted && setActiveTab && (
                                  <button
                                    onClick={() => setActiveTab('jobsheet-pending')}
                                    title="ไปที่หน้าตรวจงาน"
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: '5px',
                                      border: '1px solid #fde68a',
                                      background: '#fef3c7',
                                      color: '#b45309',
                                      fontSize: '11.5px',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease'
                                    }}
                                    onMouseOver={e => e.currentTarget.style.background = '#fde68a'}
                                    onMouseOut={e => e.currentTarget.style.background = '#fef3c7'}
                                  >
                                    ✏️ ตรวจ
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (col === 'actions') {
                          return (
                            <td key={col} style={cellStyle}>
                              <button
                                onClick={() => setEditingContainer({ ...item, rowIndex: displayIndex })}
                                title="คลิกเพื่อแก้ไขข้อมูลตู้นี้ (เลขตู้, DIS/LOAD, ท่าเรือ, ขนาด)"
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
                                  gap: '4px',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseOver={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#93c5fd'; }}
                                onMouseOut={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                              >
                                <span>✏️</span>
                                <span>แก้ไข</span>
                              </button>
                            </td>
                          );
                        }

                        return (
                          <td key={col} style={cellStyle}>
                            {String(item[col] || '-')}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
        </UniversalTableContainer>

        {/* 5. Pagination Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '10px',
          paddingTop: '8px',
          borderTop: '1px solid #f1f5f9',
          flexShrink: 0,
          flexWrap: 'wrap',
          gap: '12px',
          fontSize: '12.5px',
          color: '#64748b'
        }}>
          {/* Row Count Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>
              แสดง {totalRows > 0 ? startIndex + 1 : 0} - {endIndex} จากทั้งหมด {totalRows.toLocaleString()} รายการ
            </span>
            <span style={{ color: '#cbd5e1' }}>•</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>แสดงหน้าละ:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  const val = e.target.value === 'ALL' ? 'ALL' : Number(e.target.value);
                  setRowsPerPage(val);
                }}
                style={{
                  height: '30px',
                  padding: '0 8px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#334155',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value="ALL">ทั้งหมด</option>
              </select>
            </div>
          </div>

          {/* Page Nav Buttons */}
          {rowsPerPage !== 'ALL' && totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                style={{
                  height: '30px',
                  minWidth: '30px',
                  padding: '0 6px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: currentPage === 1 ? '#f8fafc' : '#ffffff',
                  color: currentPage === 1 ? '#cbd5e1' : '#334155',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: '12px'
                }}
                title="หน้าแรก"
              >
                «
              </button>

              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                style={{
                  height: '30px',
                  minWidth: '30px',
                  padding: '0 6px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: currentPage === 1 ? '#f8fafc' : '#ffffff',
                  color: currentPage === 1 ? '#cbd5e1' : '#334155',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: '12px'
                }}
                title="หน้าก่อนหน้า"
              >
                ‹
              </button>

              {getPageNumbers(currentPage, totalPages).map((p, i) => (
                p === '...' ? (
                  <span key={`dots-${i}`} style={{ padding: '0 4px', color: '#94a3b8' }}>...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    style={{
                      height: '30px',
                      minWidth: '30px',
                      padding: '0 8px',
                      borderRadius: '6px',
                      border: p === currentPage ? '1px solid #2563eb' : '1px solid #e2e8f0',
                      background: p === currentPage ? '#2563eb' : '#ffffff',
                      color: p === currentPage ? '#ffffff' : '#334155',
                      cursor: 'pointer',
                      fontWeight: p === currentPage ? 700 : 500,
                      fontSize: '12px'
                    }}
                  >
                    {p}
                  </button>
                )
              ))}

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                style={{
                  height: '30px',
                  minWidth: '30px',
                  padding: '0 6px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: currentPage === totalPages ? '#f8fafc' : '#ffffff',
                  color: currentPage === totalPages ? '#cbd5e1' : '#334155',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: '12px'
                }}
                title="หน้าถัดไป"
              >
                ›
              </button>

              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                style={{
                  height: '30px',
                  minWidth: '30px',
                  padding: '0 6px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: currentPage === totalPages ? '#f8fafc' : '#ffffff',
                  color: currentPage === totalPages ? '#cbd5e1' : '#334155',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: '12px'
                }}
                title="หน้าสุดท้าย"
              >
                »
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Image Preview Modal */}
      <ContainerImageModal
        previewImage={previewImage}
        onClose={() => setPreviewImage(null)}
      />

      {/* Edit Single OCR Container Modal */}
      {editingContainer && (
        <EditOcrContainerModal
          item={editingContainer}
          masterDb={masterDb}
          onClose={() => setEditingContainer(null)}
          onSave={handleSaveEditedContainer}
        />
      )}

    </div>
  );
}
