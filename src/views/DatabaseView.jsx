import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { jobSheetService } from '../services/jobSheetService';
import { autoReconcileUnmatchedRecords, cleanBatchName, normalizeExcelDate } from '../utils/matchingLogic';
import { calculateMatchedMasterIds } from '../services/truckDriverService';
import * as XLSX from 'xlsx';

import ContainerKpiSummary from '../components/containers/ContainerKpiSummary';
import { ContainerHeaderActions, ContainerTableFilterBar } from '../components/containers/ContainerTableToolbar';
import ContainerMasterTable from '../components/containers/ContainerMasterTable';
import ContainerContextMenu from '../components/containers/ContainerContextMenu';
import ContainerImageModal from '../components/containers/ContainerImageModal';
import RenameColumnModal from '../components/ui/RenameColumnModal';
import useActiveMonth from '../hooks/useActiveMonth';

export default function DatabaseView({ activeFilter = 'all' }) {
  const [currentTab, setCurrentTab] = useState(activeFilter);
  const [masterRecords, setMasterRecords] = useState([]);
  const [scannedContainers, setScannedContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('ALL');
  const [selectedSourceFilter, setSelectedSourceFilter] = useState('ALL');
  const [selectedTruckFilter, setSelectedTruckFilter] = useState('ALL');
  const [selectedJobTypeFilter, setSelectedJobTypeFilter] = useState('ALL');
  const [selectedPortFilter, setSelectedPortFilter] = useState('ALL');
  const [selectedSizeFilter, setSelectedSizeFilter] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useActiveMonth();
  
  // Aliases & Columns
  const [aliases, setAliases] = useState(() => {
    try {
      const saved = localStorage.getItem('container_column_aliases');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const [renamingColumn, setRenamingColumn] = useState(null);
  
  // Persistent Column Visibility & Widths in LocalStorage
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem('container_visible_columns');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem('container_column_widths');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  // Persistent Column Order in LocalStorage
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('container_column_order');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  // Drag & Drop Column Reordering State
  const [draggedCol, setDraggedCol] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  // Right-click Header Context Menu State: { x, y, col }
  const [contextMenu, setContextMenu] = useState(null);
  
  // Image Preview Modal State: { url, name }
  const [previewImage, setPreviewImage] = useState(null);
  
  // Sorting
  const [sortConfig, setSortConfig] = useState({ key: 'id', direction: 'desc' });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);

  // อัปเดต tab ตาม props ที่ส่งมาจาก Sidebar
  useEffect(() => {
    if (activeFilter) {
      setCurrentTab(activeFilter);
    }
  }, [activeFilter]);

  // ปิดเมนูเมื่อคลิกที่อื่น
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowColumnMenu(false);
      }
      setContextMenu(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    fetchAllData();
  }, []);

  // รีเซ็ตหน้าเมื่อตัวกรองเปลี่ยน
  useEffect(() => {
    setCurrentPage(1);
  }, [currentTab, searchTerm, selectedMonth, selectedBatchFilter, selectedSourceFilter, selectedTruckFilter, selectedJobTypeFilter, selectedPortFilter, selectedSizeFilter, rowsPerPage]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // ⚡ ดึงข้อมูลแบบ Parallel 100% (High-Speed Concurrent Fetching)
      const [aliasRes, masterRes, ocrHistRes] = await Promise.all([
        supabase.from('column_aliases').select('*'),
        supabase.from('container_records').select('*').order('id', { ascending: false }),
        jobSheetService.fetchAllOcrContainersHistory()
      ]);
        
      if (aliasRes?.data) {
        const aliasMap = {};
        aliasRes.data.forEach(item => {
          aliasMap[item.original_name] = item.alias_name;
        });
        setAliases(aliasMap);
      }
      
      const masterData = masterRes?.data || [];
      if (masterRes?.error) throw masterRes.error;
      setMasterRecords(masterData);

      const scannedList = Array.isArray(ocrHistRes?.data) ? ocrHistRes.data : Array.isArray(ocrHistRes) ? ocrHistRes : [];
      setScannedContainers(scannedList);

      // ตั้งค่าให้เปิดทุกคอลัมน์เป็นค่าเริ่มต้น (ทำครั้งแรก)
      setVisibleColumns(prev => {
        if (Object.keys(prev).length === 0 && masterData && masterData.length > 0) {
          const cols = Object.keys(masterData[0]);
          const initial = {};
          cols.forEach(c => { initial[c] = true; });
          return initial;
        }
        return prev;
      });

    } catch (error) {
      console.error('Error fetching Supabase data:', error);
      alert('ไม่สามารถดึงข้อมูลจากฐานข้อมูลได้: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  // 📊 คำนวณ KPI Metrics แบบ Real-time ตามระบบ V3 (1:1 Consumption Matching)
  const kpi = useMemo(() => {
    const totalMaster = Array.isArray(masterRecords) ? masterRecords.length : 0;
    
    const unmatchedList = [];
    const completedList = [];
    const containerList = Array.isArray(scannedContainers) ? scannedContainers : [];

    // 🎯 กรองเฉพาะที่ตรวจใบงานเสร็จแล้ว (workflow_status === 'completed') เท่านั้น
    containerList.forEach(r => {
      if (r.workflow_status !== 'completed') return;

      if (r.match_status === 'manual_red') {
        unmatchedList.push(r);
      } else if (r.match_status !== 'cancelled') {
        completedList.push(r);
      }
    });

    // 🎯 ใช้ 1:1 Consumption Matching
    const matchedMasterIdSet = calculateMatchedMasterIds(masterRecords, completedList);

    const matchedList = masterRecords.filter(m => matchedMasterIdSet.has(Number(m.id)));
    const missingList = masterRecords.filter(m => !matchedMasterIdSet.has(Number(m.id)));

    const matchedCount = matchedList.length;
    const unmatchedCount = unmatchedList.length;
    const missingCount = missingList.length;
    const matchRate = totalMaster > 0 ? Math.round((matchedCount / totalMaster) * 100) : 0;

    return {
      totalMaster,
      matchedCount,
      unmatchedCount,
      missingCount,
      matchRate,
      matchedList,
      unmatchedList,
      missingList
    };
  }, [masterRecords, scannedContainers]);

  // ตัวเลือก Dropdown รอบงาน (Batch) และไฟล์ตั้งต้น
  const availableBatches = useMemo(() => {
    const set = new Set();
    masterRecords.forEach(m => {
      if (m.batch_name) set.add(m.batch_name);
    });
    return Array.from(set).sort();
  }, [masterRecords]);

  const availableSources = useMemo(() => {
    const set = new Set();
    masterRecords.forEach(m => {
      if (m.source_file) set.add(m.source_file);
    });
    return Array.from(set).sort();
  }, [masterRecords]);

  // ตัวเลือก Dropdown เบอร์รถ
  const availableTrucks = useMemo(() => {
    const set = new Set();
    (masterRecords || []).forEach(m => {
      const t = String(m.truck_no || '').trim();
      if (t && t !== '-') set.add(t);
    });
    (scannedContainers || []).forEach(sc => {
      const t = String(sc.truck_no || '').trim();
      if (t && t !== '-') set.add(t);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th-TH', { numeric: true }));
  }, [masterRecords, scannedContainers]);

  // ตัวเลือก Dropdown ท่าเรือ
  const availablePorts = useMemo(() => {
    const set = new Set();
    (masterRecords || []).forEach(m => {
      const p = String(m.port || '').trim();
      if (p && p !== '-') set.add(p);
    });
    (scannedContainers || []).forEach(sc => {
      const p = String(sc.port || '').trim();
      if (p && p !== '-') set.add(p);
    });
    return Array.from(set).sort();
  }, [masterRecords, scannedContainers]);

  // ตัวเลือก Dropdown ขนาด
  const availableSizes = useMemo(() => {
    const set = new Set();
    (masterRecords || []).forEach(m => {
      const sz = String(m.size || '').replace(/[^0-9]/g, '');
      if (sz) set.add(sz);
    });
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [masterRecords]);

  // Lookup Map ของข้อมูลตู้สแกนทั้งหมดเพื่อเชื่อมโยงกับ Master DB
  const scannedMap = useMemo(() => {
    const map = new Map();
    (scannedContainers || []).forEach(sc => {
      if (sc.ref_master_id) {
        map.set(Number(sc.ref_master_id), sc);
      }
      const cNo = String(sc.container_no || sc.raw_ocr_text || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const tNo = String(sc.truck_no || '').trim();
      if (cNo) {
        map.set(`${cNo}_${tNo}`, sc);
        if (!map.has(cNo)) map.set(cNo, sc);
      }
    });
    return map;
  }, [scannedContainers]);

  // กรองรายการข้อมูลที่จะแสดงในตารางตาม Tab ที่เลือก
  const currentTabRecords = useMemo(() => {
    if (currentTab === 'unmatched') {
      return (kpi.unmatchedList || []).map((sc, idx) => ({
        id: idx + 1,
        _raw_id: sc.id || sc.db_id,
        container_no: sc.container_no,
        match_status: sc.match_status || 'manual_red',
        image_url: sc.image_url || null,
        dis_load: sc.job_type || '-',
        size: sc.size || '-',
        date_job: sc.date_job || '-',
        date_eta: '-',
        port: sc.port || '-',
        time_work: '-',
        planner: '-',
        out_yard: '-',
        at_gate_port: '-',
        at_front_port: '-',
        time_lift: '-',
        at_gate_dg: '-',
        time_drop: '-',
        at_yard: '-',
        total_time_dis: '-',
        out_yard_2: '-',
        at_gate_dg_2: '-',
        time_up_tail: '-',
        out_gate_dg: '-',
        at_gate_port_2: '-',
        time_up_ship: '-',
        at_yard_3: '-',
        total_time_load: '-',
        truck_no: sc.truck_no || '-',
        truck_license: '-',
        truck_type: '-',
        truck_kind: '-',
        vessel: '-',
        remark: 'สแกนจากใบงาน (ไม่พบใน Master DB)',
        batch_name: sc.batch_name || '-',
        source_file: '-'
      }));
    }

    let sourceList = masterRecords;
    if (currentTab === 'matched') sourceList = kpi.matchedList;
    if (currentTab === 'missing') sourceList = kpi.missingList;

    return (sourceList || []).map(m => {
      const cleanKey = String(m.container_no || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const cleanTruck = String(m.truck_no || '').trim();
      const sc = scannedMap.get(Number(m.id)) || scannedMap.get(`${cleanKey}_${cleanTruck}`) || scannedMap.get(cleanKey);

      const matchStatus = sc ? (sc.match_status || 'matched_green') : (currentTab === 'missing' ? 'missing' : (scannedContainers.length > 0 ? 'missing' : '-'));

      return {
        id: m.id,
        container_no: m.container_no,
        match_status: matchStatus,
        image_url: sc?.image_url || m.image_url || null,
        dis_load: m.dis_load || '-',
        size: m.size || '-',
        date_job: m.date_job || '-',
        date_eta: m.date_eta || '-',
        port: m.port || '-',
        time_work: m.time_work || '-',
        planner: m.planner || '-',
        out_yard: m.out_yard || '-',
        at_gate_port: m.at_gate_port || '-',
        at_front_port: m.at_front_port || '-',
        time_lift: m.time_lift || '-',
        at_gate_dg: m.at_gate_dg || '-',
        time_drop: m.time_drop || '-',
        at_yard: m.at_yard || '-',
        total_time_dis: m.total_time_dis || '-',
        out_yard_2: m.out_yard_2 || '-',
        at_gate_dg_2: m.at_gate_dg_2 || '-',
        time_up_tail: m.time_up_tail || '-',
        out_gate_dg: m.out_gate_dg || '-',
        at_gate_port_2: m.at_gate_port_2 || '-',
        time_up_ship: m.time_up_ship || '-',
        at_yard_3: m.at_yard_3 || '-',
        total_time_load: m.total_time_load || '-',
        truck_no: m.truck_no || '-',
        truck_license: m.truck_license || '-',
        truck_type: m.truck_type || '-',
        truck_kind: m.truck_kind || '-',
        vessel: m.vessel || '-',
        remark: m.remark || '-',
        batch_name: m.batch_name || (m.source_file ? cleanBatchName(m.source_file) : '-'),
        source_file: m.source_file || '-'
      };
    });
  }, [currentTab, kpi, masterRecords, scannedMap, scannedContainers]);

const DEFAULT_COLUMN_ORDER = [
  'id',
  'container_no',
  'match_status',
  'image_url',
  'dis_load',
  'size',
  'date_job',
  'date_eta',
  'port',
  'time_work',
  'planner',
  'out_yard',
  'at_gate_port',
  'at_front_port',
  'time_lift',
  'at_gate_dg',
  'time_drop',
  'at_yard',
  'total_time_dis',
  'out_yard_2',
  'at_gate_dg_2',
  'time_up_tail',
  'out_gate_dg',
  'at_gate_port_2',
  'time_up_ship',
  'at_yard_3',
  'total_time_load',
  'truck_no',
  'truck_license',
  'truck_type',
  'truck_kind',
  'vessel',
  'remark',
  'batch_name',
  'source_file'
];

  // กรองตามคำค้นหา + รอบงาน + ไฟล์ + เบอร์รถ + DIS/LOAD + ท่าเรือ + ขนาด
  const filteredRecords = useMemo(() => {
    let result = currentTabRecords;

    if (selectedBatchFilter !== 'ALL') {
      result = result.filter(r => r.batch_name === selectedBatchFilter);
    }

    if (selectedSourceFilter !== 'ALL') {
      result = result.filter(r => r.source_file === selectedSourceFilter);
    }

    if (selectedTruckFilter !== 'ALL') {
      result = result.filter(r => String(r.truck_no || '').trim() === selectedTruckFilter);
    }

    if (selectedJobTypeFilter !== 'ALL') {
      result = result.filter(r => {
        const jt = String(r.dis_load || '').toUpperCase();
        if (selectedJobTypeFilter === 'DIS') return jt.includes('DIS') || jt === 'D';
        if (selectedJobTypeFilter === 'LOAD') return jt.includes('LOAD') || jt === 'L';
        return true;
      });
    }

    if (selectedPortFilter !== 'ALL') {
      result = result.filter(r => String(r.port || '').trim().toUpperCase() === selectedPortFilter.toUpperCase());
    }

    if (selectedSizeFilter !== 'ALL') {
      result = result.filter(r => {
        const sz = String(r.size || '').replace(/[^0-9]/g, '');
        return sz === selectedSizeFilter;
      });
    }

    if (selectedMonth && selectedMonth !== 'ALL') {
      result = result.filter(r => {
        const rawDate = r.date_job_parsed || r.date_job || '';
        if (rawDate) {
          const norm = normalizeExcelDate(rawDate);
          if (norm && norm.startsWith(selectedMonth)) return true;
          if (String(rawDate).includes(selectedMonth)) return true;
        }
        if (r.batch_name && String(r.batch_name).includes(selectedMonth)) return true;
        return false;
      });
    }

    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(r => 
        (r.container_no && String(r.container_no).toLowerCase().includes(lower)) ||
        (r.truck_no && String(r.truck_no).toLowerCase().includes(lower)) ||
        (r.batch_name && String(r.batch_name).toLowerCase().includes(lower)) ||
        (r.port && String(r.port).toLowerCase().includes(lower)) ||
        (r.vessel && String(r.vessel).toLowerCase().includes(lower)) ||
        (r.source_file && String(r.source_file).toLowerCase().includes(lower)) ||
        (r.remark && String(r.remark).toLowerCase().includes(lower))
      );
    }

    return result;
  }, [currentTabRecords, selectedMonth, searchTerm, selectedBatchFilter, selectedSourceFilter, selectedTruckFilter, selectedJobTypeFilter, selectedPortFilter, selectedSizeFilter]);

  // 🔀 ระบบ Sorting คอลัมน์
  const handleSort = (col) => {
    setSortConfig(prev => {
      if (prev.key === col) {
        return { key: col, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key: col, direction: 'asc' };
    });
  };

  const sortedAndFilteredRecords = useMemo(() => {
    const list = [...filteredRecords];
    if (!sortConfig.key) return list;

    return list.sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      if (sortConfig.key === 'size' || sortConfig.key === 'id') {
        const numA = Number(String(valA || '').replace(/[^0-9]/g, '')) || 0;
        const numB = Number(String(valB || '').replace(/[^0-9]/g, '')) || 0;
        return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
      }

      const strA = String(valA || '').toLowerCase();
      const strB = String(valB || '').toLowerCase();

      const comp = strA.localeCompare(strB, 'th-TH', { numeric: true, sensitivity: 'base' });
      return sortConfig.direction === 'asc' ? comp : -comp;
    });
  }, [filteredRecords, sortConfig]);

  // ระบบแบ่งหน้า (Pagination)
  const totalPages = rowsPerPage === 'ALL' ? 1 : Math.ceil(sortedAndFilteredRecords.length / rowsPerPage) || 1;
  const startIndex = rowsPerPage === 'ALL' ? 0 : (currentPage - 1) * rowsPerPage;
  const endIndex = rowsPerPage === 'ALL' ? sortedAndFilteredRecords.length : Math.min(startIndex + rowsPerPage, sortedAndFilteredRecords.length);
  const paginatedRecords = rowsPerPage === 'ALL' ? sortedAndFilteredRecords : sortedAndFilteredRecords.slice(startIndex, endIndex);

  // คอลัมน์ที่ใช้งาน
  const rawColumns = useMemo(() => {
    if (currentTabRecords.length === 0) return [];
    return Object.keys(currentTabRecords[0]);
  }, [currentTabRecords]);

  const allColumns = useMemo(() => {
    const rawSet = new Set(rawColumns);
    const orderBase = (columnOrder && columnOrder.length > 0) ? columnOrder : DEFAULT_COLUMN_ORDER;
    const ordered = orderBase.filter(c => rawSet.has(c));
    rawColumns.forEach(c => {
      if (!ordered.includes(c)) ordered.push(c);
    });
    return ordered;
  }, [rawColumns, columnOrder]);

  const activeColumns = useMemo(() => {
    return allColumns.filter(col => visibleColumns[col] !== false);
  }, [allColumns, visibleColumns]);

  // ชื่อที่แสดงของแต่ละคอลัมน์ (ตรงตามหัวตารางไฟล์ Excel วางบิลต้นฉบับ)
  const getColDisplayName = (col) => {
    if (aliases[col]) return aliases[col];
    if (col === 'id') return '#';
    if (col === 'container_no') return 'Container Number';
    if (col === 'match_status' || col === 'ocr_status') return 'สถานะจับคู่ (OCR)';
    if (col === 'image_url') return 'รูปใบงาน';
    if (col === 'dis_load') return 'Dis / Load';
    if (col === 'size') return 'Size';
    if (col === 'date_job') return 'Date Job';
    if (col === 'date_eta') return 'Date ETA';
    if (col === 'port') return 'Port';
    if (col === 'time_work') return 'Time work';
    if (col === 'planner') return 'PLANNER';
    if (col === 'out_yard') return 'ออกจากลานจอด';
    if (col === 'at_gate_port') return 'ถึง GATE ที่ท่า';
    if (col === 'at_front_port') return 'ถึง หน้าท่า';
    if (col === 'time_lift') return 'เวลาจับตู้';
    if (col === 'at_gate_dg') return 'ถึง GATE DG';
    if (col === 'time_drop') return 'เวลาลงตู้';
    if (col === 'at_yard') return 'เวลาถึงลานจอด';
    if (col === 'total_time_dis') return 'Time Total Dis';
    if (col === 'out_yard_2') return 'ออกจากลานจอด2';
    if (col === 'at_gate_dg_2') return 'ถึงGATE DG';
    if (col === 'time_up_tail') return 'เวลาตู้ขึ้นหาง';
    if (col === 'out_gate_dg') return 'ออกจากGATE DG';
    if (col === 'at_gate_port_2') return 'ถึง GATE ท่า';
    if (col === 'time_up_ship') return 'เวลาตู้ขึ้นเรือ';
    if (col === 'at_yard_3') return 'เวลาถึงลานจอด3';
    if (col === 'total_time_load') return 'Time Total Load';
    if (col === 'truck_no') return 'เลขรถ';
    if (col === 'truck_license') return 'ทะเบียน';
    if (col === 'truck_type') return 'ประเภทรถ';
    if (col === 'truck_kind') return 'ชนิดรถ';
    if (col === 'vessel') return 'Vessel';
    if (col === 'remark') return 'หมายเหตุ';
    if (col === 'batch_name') return 'รอบงาน (Batch)';
    if (col === 'source_file') return 'ไฟล์ตั้งต้น';
    return col;
  };

  // สลับตำแหน่งคอลัมน์ (Drag and Drop Reordering)
  const handleColumnReorder = (sourceCol, targetCol) => {
    if (!sourceCol || !targetCol || sourceCol === targetCol) return;
    const currentList = [...allColumns];
    const sourceIdx = currentList.indexOf(sourceCol);
    const targetIdx = currentList.indexOf(targetCol);
    if (sourceIdx === -1 || targetIdx === -1) return;

    currentList.splice(sourceIdx, 1);
    currentList.splice(targetIdx, 0, sourceCol);

    setColumnOrder(currentList);
    try {
      localStorage.setItem('container_column_order', JSON.stringify(currentList));
    } catch (e) {}
  };

  const handleResetColumnOrder = () => {
    setColumnOrder(null);
    try {
      localStorage.removeItem('container_column_order');
    } catch (e) {}
  };

  // คำนวณความกว้างคอลัมน์มาตรฐาน และรองรับการลากขยายความกว้าง
  const getDefaultColWidth = (col) => {
    if (columnWidths[col]) return columnWidths[col];
    if (col === 'id') return 70;
    if (col === 'container_no') return 180;
    if (col === 'match_status' || col === 'ocr_status') return 140;
    if (col === 'image_url') return 110;
    if (col === 'dis_load') return 95;
    if (col === 'size') return 80;
    if (col === 'date_job' || col === 'date_eta') return 125;
    if (col === 'port') return 90;
    if (col === 'time_work') return 100;
    if (col === 'planner') return 140;
    if (col.startsWith('out_') || col.startsWith('at_') || col.startsWith('time_') || col.startsWith('total_')) return 125;
    if (col === 'truck_no') return 110;
    if (col === 'truck_license') return 130;
    if (col === 'truck_type') return 120;
    if (col === 'truck_kind') return 120;
    if (col === 'vessel') return 180;
    if (col === 'remark') return 220;
    if (col === 'batch_name') return 180;
    if (col === 'source_file') return 260;
    return 130;
  };

  const handleResizeMouseDown = (e, col) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = getDefaultColWidth(col);

    const onMouseMove = (moveEvent) => {
      const currentWidth = Math.max(startWidth + (moveEvent.clientX - startX), 60);
      setColumnWidths(prev => ({
        ...prev,
        [col]: currentWidth
      }));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setColumnWidths(latest => {
        try {
          localStorage.setItem('container_column_widths', JSON.stringify(latest));
        } catch (e) {}
        return latest;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleToggleColumnHide = (col) => {
    setVisibleColumns(prev => {
      const next = { ...prev, [col]: !prev[col] };
      try {
        localStorage.setItem('container_visible_columns', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleShowAllColumns = () => {
    const next = {};
    allColumns.forEach(c => {
      next[c] = true;
    });
    setVisibleColumns(next);
    try {
      localStorage.removeItem('container_visible_columns');
    } catch (e) {}
  };

  const handleResetColumnWidth = (col) => {
    setColumnWidths(prev => {
      const next = { ...prev };
      delete next[col];
      try {
        localStorage.setItem('container_column_widths', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleHeaderContextMenu = (e, col) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      col: col
    });
  };

  const measureDatabaseTextPx = (text, isBold = false, isMonospace = false) => {
    if (!text && text !== 0) return 0;
    const str = String(text).trim();
    if (!str) return 0;
    const emojiMatches = str.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
    const emojiExtra = emojiMatches ? emojiMatches.length * 12 : 0;

    try {
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (isMonospace) {
          ctx.font = isBold ? '700 13.5px monospace, ui-monospace, Courier, sans-serif' : '500 13px monospace, ui-monospace, Courier, sans-serif';
        } else {
          ctx.font = isBold ? '700 13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : '500 13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        }
        return Math.ceil(ctx.measureText(str).width) + emojiExtra;
      }
    } catch (e) {}
    
    const visualLen = str.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').length;
    const charWidth = isMonospace ? 8.5 : (isBold ? 8.2 : 7.6);
    return Math.ceil(visualLen * charWidth) + emojiExtra;
  };

  const handleAutoFitColumn = (col) => {
    const isMonospaceCol = ['truck_no', 'container_no', 'booking_bl', 'seal_no', 'license_plate'].includes(col);
    const headerText = aliases[col] || getColDisplayName(col) || col;
    
    // Header width: Header Text + Sort Icon (▲/▼/↕) + Header Padding (12px + 12px) + Icon Gap (4px) + Buffer
    const headerW = measureDatabaseTextPx(headerText, true, false) + 48;
    let maxCellW = 0;

    const sampleRows = (sortedAndFilteredRecords || []).slice(0, 500);
    sampleRows.forEach(r => {
      let valStr = formatCellValue(col, r[col]);
      if (col === 'match_status') {
        const rawVal = r.match_status;
        valStr = rawVal === 'green' ? '🟢 ตรง 100%' : (rawVal === 'blue' ? '🔵 ใกล้เคียง' : (rawVal === 'yellow' ? '🟡 ตู้ซ้ำ' : (rawVal === 'red' ? '🔴 ไม่พบในใบวางบิล' : String(rawVal || ''))));
      } else if (col === 'job_type') {
        valStr = r.job_type === 'DIS' ? '📥 DIS' : (r.job_type === 'LOAD' ? '📤 LOAD' : String(r.job_type || ''));
      }

      if (valStr && valStr !== '-') {
        const hasBadge = valStr.includes('🟢') || valStr.includes('🟡') || valStr.includes('⚪') || valStr.includes('🔴') || valStr.includes('🔵') || valStr.includes('📥') || valStr.includes('📤');
        const paddingExtra = hasBadge ? 48 : 34;
        const isBoldCell = col === 'container_no' || col === 'truck_no';
        const w = measureDatabaseTextPx(valStr, isBoldCell, isMonospaceCol) + paddingExtra;
        if (w > maxCellW) maxCellW = w;
      }
    });

    const autoWidth = Math.min(Math.max(headerW, maxCellW, 75), 600);

    setColumnWidths(prev => {
      const updated = { ...prev, [col]: autoWidth };
      try {
        localStorage.setItem('container_column_widths', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const formatCellValue = (col, val) => {
    if (val === null || val === undefined || val === '') return '-';

    if (col === 'image_url') {
      return val ? '🖼️ ดูรูป' : '-';
    }

    if (col === 'date_job' || col === 'date_eta') {
      const iso = normalizeExcelDate(val);
      if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        const [y, m, d] = iso.split('-');
        return `${d}/${m}/${y}`;
      }
      return String(val);
    }

    if (col === 'created_at' || col === 'updated_at' || col === 'saved_at') {
      try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return d.toLocaleString('th-TH', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      } catch (e) {}
    }

    if (typeof val === 'string' && val.length >= 19 && val.includes('T') && (val.includes('+') || val.includes('Z') || val.includes('.'))) {
      try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return d.toLocaleString('th-TH', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      } catch (e) {}
    }

    return String(val);
  };

  const handleSaveAlias = async (col, newAlias) => {
    if (!col) return;
    const cleanAlias = (newAlias || '').trim();
    
    setAliases(prev => {
      const updated = { ...prev, [col]: cleanAlias };
      try {
        localStorage.setItem('container_column_aliases', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    
    try {
      await supabase
        .from('column_aliases')
        .upsert({ original_name: col, alias_name: cleanAlias, updated_at: new Date().toISOString() });
    } catch (error) {
      console.warn('Error updating alias:', error);
    }
  };

  const handleResetAlias = async (col) => {
    if (!col) return;
    setAliases(prev => {
      const updated = { ...prev };
      delete updated[col];
      try {
        localStorage.setItem('container_column_aliases', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    try {
      await supabase
        .from('column_aliases')
        .delete()
        .eq('original_name', col);
    } catch (e) {}
  };

  const handleResetAllAliases = async () => {
    if (!window.confirm("ต้องการรีเซ็ตชื่อคอลัมน์ทั้งหมดกลับเป็นค่าเริ่มต้นตามไฟล์ Excel ใช่หรือไม่?")) return;
    setAliases({});
    try {
      localStorage.removeItem('container_column_aliases');
    } catch (e) {}
    try {
      await supabase.from('column_aliases').delete().neq('original_name', '__dummy__');
    } catch (e) {}
  };

  const handleClearDB = async () => {
    if (!window.confirm("⚠️ แน่ใจหรือไม่ที่จะลบข้อมูลทั้งหมดในฐานข้อมูลใบวางบิล (Supabase)? การกระทำนี้ไม่สามารถย้อนกลับได้")) return;
    
    setLoading(true);
    const { error } = await supabase.from('container_records').delete().not('id', 'is', null);
    if (error) {
      alert("❌ ไม่สามารถลบข้อมูลได้: " + error.message);
    } else {
      alert("✅ เคลียร์ฐานข้อมูลใบวางบิลเรียบร้อยแล้ว");
      setMasterRecords([]);
    }
    setLoading(false);
  };

  const handleExportExcel = () => {
    if (sortedAndFilteredRecords.length === 0) {
      alert('⚠️ ไม่มีข้อมูลสำหรับส่งออกตามเงื่อนไขที่เลือก');
      return;
    }

    const exportRows = sortedAndFilteredRecords.map((row, idx) => {
      const formatted = { '#': idx + 1 };
      activeColumns.forEach(col => {
        const headerName = getColDisplayName(col);
        formatted[headerName] = formatCellValue(col, row[col]);
      });
      return formatted;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    
    let sheetTitle = 'Containers_Master';
    if (currentTab === 'matched') sheetTitle = 'Matched_Containers';
    else if (currentTab === 'unmatched') sheetTitle = 'Unmatched_Scans';
    else if (currentTab === 'missing') sheetTitle = 'Missing_Containers';

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetTitle.substring(0, 31));

    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `${sheetTitle}_${dateStr}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const handleFileUpload = async (e) => {
    try {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;
      
      setLoading(true);
      
      const excelFiles = files.filter(f => 
        (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) && !f.name.startsWith('~$')
      );
      
      if (excelFiles.length === 0) {
        alert("ไม่พบไฟล์ Excel ในโฟลเดอร์ที่เลือก");
        setLoading(false);
        return;
      }
      
      const { data: existingRecords, error: checkError } = await supabase
        .from('container_records')
        .select('source_file');
        
      if (checkError) throw checkError;
      
      const existingFiles = new Set(existingRecords.map(r => r.source_file));
      const newFiles = excelFiles.filter(f => !existingFiles.has(f.name));
      
      if (newFiles.length === 0) {
        alert("ไฟล์ทั้งหมดในโฟลเดอร์นี้ถูกอัปโหลดเข้าระบบแล้ว (ไม่มีไฟล์ใหม่ที่ต้อง Sync)");
        setLoading(false);
        return;
      }

      const readFileAsArrayBuffer = (file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target.result);
          reader.onerror = (err) => reject(err);
          reader.readAsArrayBuffer(file);
        });
      };

      let totalInserted = 0;

      for (const file of newFiles) {
        const batchName = cleanBatchName(file.name);
        const data = await readFileAsArrayBuffer(file);
        const workbook = XLSX.read(data, { type: 'array' });
        const targetSheetName = workbook.SheetNames.find(s => s.toLowerCase() === 'data') || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[targetSheetName];
        
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(rawData.length, 20); i++) {
          const rowVals = rawData[i].map(v => String(v).toLowerCase().trim());
          if (rowVals.some(v => v.includes("container number") || v.includes("เลขตู้"))) {
            headerRowIndex = i;
            break;
          }
        }
        
        if (headerRowIndex === -1) continue;
        
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false, range: headerRowIndex });
        if (jsonData.length === 0) continue;

        const colMap = {};
        const firstRow = jsonData[0];
        const originalCols = Object.keys(firstRow);
        
        originalCols.forEach(c => {
          const cStr = c.toLowerCase().trim();
          if (cStr.includes("container number") || cStr.includes("เลขตู้")) colMap["container_no"] = c;
          else if (cStr.includes("dis / load")) colMap["dis_load"] = c;
          else if (cStr.includes("size")) colMap["size"] = c;
          else if (cStr.includes("date eta")) colMap["date_eta"] = c;
          else if (cStr.includes("vessel")) colMap["vessel"] = c;
          else if (cStr.includes("port")) colMap["port"] = c;
          else if (cStr.includes("time work")) colMap["time_work"] = c;
          else if (cStr.includes("date job")) colMap["date_job"] = c;
          else if (cStr.includes("planner")) colMap["planner"] = c;
          else if (cStr.includes("ออกจากลานจอด2")) colMap["out_yard_2"] = c;
          else if (cStr.includes("ออกจากลานจอด")) colMap["out_yard"] = c;
          else if (cStr.includes("ถึง gate ที่ท่า")) colMap["at_gate_port"] = c;
          else if (cStr.includes("ถึง หน้าท่า")) colMap["at_front_port"] = c;
          else if (cStr.includes("เวลาจับตู้")) colMap["time_lift"] = c;
          else if (cStr.includes("ออกจากgate dg")) colMap["out_gate_dg"] = c;
          else if (cStr.includes("ถึง gate dg") || cStr.includes("ถึงgate dg")) {
            if (!colMap["at_gate_dg"]) colMap["at_gate_dg"] = c;
            else colMap["at_gate_dg_2"] = c;
          }
          else if (cStr.includes("เวลาลงตู้")) colMap["time_drop"] = c;
          else if (cStr.includes("เวลาถึงลานจอด3")) colMap["at_yard_3"] = c;
          else if (cStr.includes("เวลาถึงลานจอด")) colMap["at_yard"] = c;
          else if (cStr.includes("time  total dis") || cStr.includes("time total dis")) colMap["total_time_dis"] = c;
          else if (cStr.includes("เวลาตู้ขึ้นหาง")) colMap["time_up_tail"] = c;
          else if (cStr.includes("ถึง gate ท่า")) colMap["at_gate_port_2"] = c;
          else if (cStr.includes("เวลาตู้ขึ้นเรือ")) colMap["time_up_ship"] = c;
          else if (cStr.includes("time  total load") || cStr.includes("time total load")) colMap["total_time_load"] = c;
          else if (cStr.includes("เลขรถ")) colMap["truck_no"] = c;
          else if (cStr.includes("ทะเบียน")) colMap["truck_license"] = c;
          else if (cStr.includes("ประเภทรถ")) colMap["truck_type"] = c;
          else if (cStr.includes("ชนิดรถ")) colMap["truck_kind"] = c;
          else if (cStr.includes("หมายเหตุ")) colMap["remark"] = c;
          
          if (!colMap["truck_no"] && cStr.includes("รถ") && !cStr.includes("ประเภท") && !cStr.includes("ชนิด") && cStr.length < 10) {
            colMap["truck_no"] = c;
          }
        });

        const recordsToInsert = [];
        jsonData.forEach((row) => {
          const cNo = row[colMap["container_no"]] ? String(row[colMap["container_no"]]).trim() : "";
          if (!cNo) return;

          const normDateJob = normalizeExcelDate(row[colMap["date_job"]]);

          recordsToInsert.push({
            container_no: cNo,
            truck_no: row[colMap["truck_no"]] ? String(row[colMap["truck_no"]]).trim() : "",
            dis_load: row[colMap["dis_load"]] ? String(row[colMap["dis_load"]]).trim() : "",
            size: row[colMap["size"]] ? String(row[colMap["size"]]).trim() : "",
            date_eta: normalizeExcelDate(row[colMap["date_eta"]]),
            vessel: row[colMap["vessel"]] ? String(row[colMap["vessel"]]).trim() : "",
            port: row[colMap["port"]] ? String(row[colMap["port"]]).trim() : "",
            time_work: row[colMap["time_work"]] ? String(row[colMap["time_work"]]).trim() : "",
            date_job: normDateJob,
            date_job_parsed: (normDateJob && normDateJob.length >= 10) ? normDateJob.slice(0, 10) : null,
            planner: row[colMap["planner"]] ? String(row[colMap["planner"]]).trim() : "",
            out_yard: row[colMap["out_yard"]] ? String(row[colMap["out_yard"]]).trim() : "",
            at_gate_port: row[colMap["at_gate_port"]] ? String(row[colMap["at_gate_port"]]).trim() : "",
            at_front_port: row[colMap["at_front_port"]] ? String(row[colMap["at_front_port"]]).trim() : "",
            time_lift: row[colMap["time_lift"]] ? String(row[colMap["time_lift"]]).trim() : "",
            at_gate_dg: row[colMap["at_gate_dg"]] ? String(row[colMap["at_gate_dg"]]).trim() : "",
            time_drop: row[colMap["time_drop"]] ? String(row[colMap["time_drop"]]).trim() : "",
            at_yard: row[colMap["at_yard"]] ? String(row[colMap["at_yard"]]).trim() : "",
            total_time_dis: row[colMap["total_time_dis"]] ? String(row[colMap["total_time_dis"]]).trim() : "",
            out_yard_2: row[colMap["out_yard_2"]] ? String(row[colMap["out_yard_2"]]).trim() : "",
            at_gate_dg_2: row[colMap["at_gate_dg_2"]] ? String(row[colMap["at_gate_dg_2"]]).trim() : "",
            time_up_tail: row[colMap["time_up_tail"]] ? String(row[colMap["time_up_tail"]]).trim() : "",
            out_gate_dg: row[colMap["out_gate_dg"]] ? String(row[colMap["out_gate_dg"]]).trim() : "",
            at_gate_port_2: row[colMap["at_gate_port_2"]] ? String(row[colMap["at_gate_port_2"]]).trim() : "",
            time_up_ship: row[colMap["time_up_ship"]] ? String(row[colMap["time_up_ship"]]).trim() : "",
            at_yard_3: row[colMap["at_yard_3"]] ? String(row[colMap["at_yard_3"]]).trim() : "",
            total_time_load: row[colMap["total_time_load"]] ? String(row[colMap["total_time_load"]]).trim() : "",
            truck_license: row[colMap["truck_license"]] ? String(row[colMap["truck_license"]]).trim() : "",
            truck_type: row[colMap["truck_type"]] ? String(row[colMap["truck_type"]]).trim() : "",
            truck_kind: row[colMap["truck_kind"]] ? String(row[colMap["truck_kind"]]).trim() : "",
            remark: row[colMap["remark"]] ? String(row[colMap["remark"]]).trim() : "",
            batch_name: batchName,
            source_file: file.name
          });
        });

        if (recordsToInsert.length > 0) {
          const chunkSize = 200;
          for (let i = 0; i < recordsToInsert.length; i += chunkSize) {
            const chunk = recordsToInsert.slice(i, i + chunkSize);
            const { error: insertError } = await supabase.from('container_records').insert(chunk);
            if (insertError) throw insertError;
          }
          totalInserted += recordsToInsert.length;
        }
      }

      const { updatedCount } = await autoReconcileUnmatchedRecords();
      if (updatedCount > 0) {
        alert(`✅ ซิงค์ข้อมูลสำเร็จ! เพิ่มข้อมูลใหม่ ${totalInserted} รายการ และจับคู่ตู้ที่เคยค้างสำเร็จอัตโนมัติอีก ${updatedCount} ตู้! 🟢`);
      } else {
        alert(`✅ ซิงค์ข้อมูลสำเร็จ! เพิ่มข้อมูลใหม่ทั้งหมด ${totalInserted} รายการ`);
      }
      fetchAllData();

    } catch (err) {
      console.error(err);
      alert("❌ เกิดข้อผิดพลาดในการนำเข้าข้อมูล: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '16px 24px', maxWidth: '1600px', margin: '0 auto', width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeIn 0.3s ease' }}>
      
      {/* Hidden File Input for Folder Import */}
      <input 
        type="file" 
        webkitdirectory="true" 
        directory="true" 
        style={{ display: 'none' }} 
        ref={fileInputRef}
        onClick={(e) => { e.target.value = null; }}
        onChange={handleFileUpload} 
      />

      {/* 1. Header Toolbar & Action Buttons */}
      <ContainerHeaderActions
        loading={loading}
        filteredCount={sortedAndFilteredRecords.length}
        onAutoReMatch={async () => {
          setLoading(true);
          const { updatedCount } = await autoReconcileUnmatchedRecords();
          await fetchAllData();
          setLoading(false);
          if (updatedCount > 0) {
            alert(`🎉 จับคู่สำเร็จใหม่อัตโนมัติ ${updatedCount} ตู้! (เปลี่ยนเป็นสีเขียวเรียบร้อย) 🟢`);
          } else {
            alert(`ℹ️ ตรวจสอบเรียบร้อย ไม่พบตู้ที่จับคู่เพิ่มเติมในใบวางบิล`);
          }
        }}
        onRefresh={fetchAllData}
        onExportExcel={handleExportExcel}
        onImportClick={() => fileInputRef.current && fileInputRef.current.click()}
        onClearDB={handleClearDB}
      />

      {/* 2. Unified KPI Summary Cards */}
      <ContainerKpiSummary
        kpi={kpi}
        currentTab={currentTab}
        onTabSelect={(tab) => setCurrentTab(tab)}
      />

      {/* 3. Main Data Table Card */}
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
        {/* Filter & Search Bar */}
        <ContainerTableFilterBar
          currentTab={currentTab}
          filteredCount={sortedAndFilteredRecords.length}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          availableBatches={availableBatches}
          selectedBatchFilter={selectedBatchFilter}
          setSelectedBatchFilter={setSelectedBatchFilter}
          availableSources={availableSources}
          selectedSourceFilter={selectedSourceFilter}
          setSelectedSourceFilter={setSelectedSourceFilter}
          availableTrucks={availableTrucks}
          selectedTruckFilter={selectedTruckFilter}
          setSelectedTruckFilter={setSelectedTruckFilter}
          selectedJobTypeFilter={selectedJobTypeFilter}
          setSelectedJobTypeFilter={setSelectedJobTypeFilter}
          availablePorts={availablePorts}
          selectedPortFilter={selectedPortFilter}
          setSelectedPortFilter={setSelectedPortFilter}
          availableSizes={availableSizes}
          selectedSizeFilter={selectedSizeFilter}
          setSelectedSizeFilter={setSelectedSizeFilter}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          showColumnMenu={showColumnMenu}
          setShowColumnMenu={setShowColumnMenu}
          menuRef={menuRef}
          allColumns={allColumns}
          activeColumns={activeColumns}
          visibleColumns={visibleColumns}
          onToggleColumnVisibility={handleToggleColumnHide}
          getColDisplayName={getColDisplayName}
          onStartEditAlias={(col) => {
            setRenamingColumn({
              col,
              currentName: aliases[col] || getColDisplayName(col),
              defaultName: col
            });
          }}
          onResetAllAliases={handleResetAllAliases}
          onShowAllColumns={handleShowAllColumns}
        />

        <ContainerMasterTable
          loading={loading}
          paginatedRecords={paginatedRecords}
          activeColumns={activeColumns}
          allColumns={allColumns}
          sortConfig={sortConfig}
          onSort={handleSort}
          onHeaderContextMenu={handleHeaderContextMenu}
          onAutoFitColumn={handleAutoFitColumn}
          getColDisplayName={getColDisplayName}
          getDefaultColWidth={getDefaultColWidth}
          onResizeMouseDown={handleResizeMouseDown}
          draggedCol={draggedCol}
          dragOverCol={dragOverCol}
          setDraggedCol={setDraggedCol}
          setDragOverCol={setDragOverCol}
          onColumnReorder={handleColumnReorder}
          onPreviewImage={setPreviewImage}
          formatCellValue={formatCellValue}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          rowsPerPage={rowsPerPage}
          setRowsPerPage={setRowsPerPage}
          totalPages={totalPages}
          totalRecordsCount={sortedAndFilteredRecords.length}
          startIndex={startIndex}
          endIndex={endIndex}
        />
      </div>

      {/* Context Menu for Column Header */}
      <ContainerContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        onStartEditAlias={(col) => {
          setRenamingColumn({
            col,
            currentName: aliases[col] || getColDisplayName(col),
            defaultName: col
          });
        }}
        onAutoFitColumn={handleAutoFitColumn}
        onToggleColumnHide={handleToggleColumnHide}
        onShowAllColumns={handleShowAllColumns}
        onResetColumnWidth={handleResetColumnWidth}
        onResetColumnOrder={handleResetColumnOrder}
        getColDisplayName={getColDisplayName}
      />

      {/* Rename Column Modal */}
      <RenameColumnModal
        renamingColumn={renamingColumn}
        onClose={() => setRenamingColumn(null)}
        onSaveAlias={handleSaveAlias}
        onResetAlias={handleResetAlias}
      />

      {/* High-Res Image Preview Modal */}
      <ContainerImageModal
        previewImage={previewImage}
        onClose={() => setPreviewImage(null)}
      />

    </div>
  );
}
