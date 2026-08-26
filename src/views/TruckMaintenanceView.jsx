import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from '../context/ToastContext';
import {
  fetchMaintenanceRecords,
  createMaintenanceRecord,
  updateMaintenanceRecord,
  deleteMaintenanceRecord
} from '../services/maintenanceService';
import { fetchTrucks } from '../services/truckDriverService';
import MaintenanceModal from '../components/maintenance/MaintenanceModal';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown';
import UniversalTableContainer from '../components/ui/UniversalTableContainer';
import UniversalTableHeader from '../components/ui/UniversalTableHeader';
import { useColumnPreferences } from '../hooks/useColumnPreferences';

const DEFAULT_MAINTENANCE_COLUMNS = [
  'id',
  'truck_no',
  'maintenance_type',
  'start_date',
  'end_date',
  'duration_days',
  'garage_name',
  'mileage',
  'parts_list',
  'invoice_no',
  'remark',
  'actions'
];

const DEFAULT_COLUMN_NAMES = {
  id: '#',
  truck_no: 'เบอร์รถ',
  maintenance_type: 'ประเภทการซ่อม',
  start_date: 'วันที่เข้าซ่อม',
  end_date: 'วันที่ซ่อมเสร็จ',
  duration_days: 'ระยะเวลา',
  garage_name: 'อู่ / ศูนย์บริการ',
  mileage: 'เลขไมล์ (กม.)',
  parts_list: 'รายการอะไหล่ / งานที่ทำ',
  invoice_no: 'เลขที่บิล / ใบสั่งซ่อม',
  remark: 'หมายเหตุ',
  actions: 'จัดการ'
};

const DEFAULT_MAINTENANCE_WIDTHS = {
  id: 45,
  truck_no: 95,
  maintenance_type: 140,
  start_date: 110,
  end_date: 110,
  duration_days: 90,
  garage_name: 150,
  mileage: 110,
  parts_list: 220,
  invoice_no: 120,
  remark: 140,
  actions: 100
};

const MAINTENANCE_ALIGN_MAP = {
  id: 'center',
  truck_no: 'center',
  maintenance_type: 'center',
  start_date: 'center',
  end_date: 'center',
  duration_days: 'center',
  garage_name: 'left',
  mileage: 'right',
  parts_list: 'left',
  invoice_no: 'left',
  remark: 'left',
  actions: 'center'
};

const MAINTENANCE_TYPE_MAP = {
  general: { label: '🔧 ซ่อมทั่วไป', color: '#475569', bg: '#f1f5f9' },
  periodic: { label: '🛢️ เช็กระยะ/ของเหลว', color: '#0284c7', bg: '#e0f2fe' },
  tire: { label: '🛞 ยาง/ปะยาง', color: '#7c3aed', bg: '#ede9fe' },
  brake: { label: '🛑 ระบบเบรก/ลม', color: '#dc2626', bg: '#fee2e2' },
  engine: { label: '⚙️ เครื่องยนต์/เกียร์', color: '#b45309', bg: '#fef3c7' },
  suspension: { label: '🔩 ช่วงล่าง/เพลา', color: '#c2410c', bg: '#ffedd5' },
  electrical: { label: '⚡ ไฟ/แอร์', color: '#ca8a04', bg: '#fef9c3' },
  body: { label: '🚛 ตัวถัง/สี', color: '#4f46e5', bg: '#e0e7ff' },
  inspection: { label: '📋 ตรวจสภาพ/ภาษี', color: '#059669', bg: '#d1fae5' }
};

export default function TruckMaintenanceView() {
  const { success, error: toastError, warning } = useToast();
  const [records, setRecords] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [truckFilter, setTruckFilter] = useState('ALL');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  // Format Date
  const formatDateDisplay = (dateStr) => {
    if (!dateStr || dateStr === '-') return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  // Column Preferences Hook
  const maintPrefs = useColumnPreferences({
    storageKeyPrefix: 'truck_maintenance_v3',
    rawColumns: DEFAULT_MAINTENANCE_COLUMNS,
    defaultNames: DEFAULT_COLUMN_NAMES,
    defaultWidths: DEFAULT_MAINTENANCE_WIDTHS,
    sampleRecords: records,
    formatCellValue: (col, val, row) => {
      if (col === 'start_date' || col === 'end_date') return formatDateDisplay(val);
      if (col === 'duration_days') return val ? `${val} วัน` : '1 วัน';
      if (col === 'maintenance_type') return MAINTENANCE_TYPE_MAP[val]?.label || val;
      if (col === 'mileage') return val ? `${Number(val).toLocaleString()} กม.` : '-';
      return String(val || '');
    }
  });

  const { activeColumns, sortRecords, sortConfig } = maintPrefs;

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [maintRes, truckRes] = await Promise.all([
        fetchMaintenanceRecords(),
        fetchTrucks()
      ]);
      setRecords(maintRes?.data || []);
      const truckList = Array.isArray(truckRes) ? truckRes : (truckRes?.data || []);
      setTrucks(truckList);
    } catch (err) {
      toastError('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered List
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (typeFilter !== 'ALL' && r.maintenance_type !== typeFilter) return false;
      if (truckFilter !== 'ALL' && r.truck_no !== truckFilter) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchTruck = String(r.truck_no || '').toLowerCase().includes(q);
        const matchGarage = String(r.garage_name || '').toLowerCase().includes(q);
        const matchInvoice = String(r.invoice_no || '').toLowerCase().includes(q);
        const matchParts = String(r.parts_list || '').toLowerCase().includes(q);
        const matchRemark = String(r.remark || '').toLowerCase().includes(q);
        if (!matchTruck && !matchGarage && !matchInvoice && !matchParts && !matchRemark) return false;
      }
      return true;
    });
  }, [records, typeFilter, truckFilter, searchTerm]);

  // Displayed Records (Sorted & Filtered)
  const displayedRecords = useMemo(() => {
    return sortRecords(filteredRecords);
  }, [filteredRecords, sortConfig, sortRecords]);

  // Save Record
  const handleSaveRecord = async (formData, id) => {
    try {
      if (id) {
        const { error } = await updateMaintenanceRecord(id, formData);
        if (error) throw new Error(error);
        success('อัปเดตบันทึกการซ่อมบำรุงเรียบร้อยแล้ว');
      } else {
        const { error } = await createMaintenanceRecord(formData);
        if (error) throw new Error(error);
        success('เพิ่มบันทึกการซ่อมบำรุงเรียบร้อยแล้ว');
      }
      loadData();
    } catch (err) {
      toastError('บันทึกไม่สำเร็จ: ' + err.message);
    }
  };

  // Delete Record
  const handleDeleteRecord = async (id, truckNo) => {
    if (!window.confirm(`ยืนยันการลบบันทึกการซ่อมบำรุงของรถ ${truckNo} หรือไม่?`)) return;
    try {
      const { error } = await deleteMaintenanceRecord(id);
      if (error) throw new Error(error);
      success('ลบบันทึกเรียบร้อยแล้ว');
      loadData();
    } catch (err) {
      toastError('ลบไม่สำเร็จ: ' + err.message);
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    if (filteredRecords.length === 0) {
      warning('ไม่มีข้อมูลสำหรับส่งออก');
      return;
    }
    const exportData = filteredRecords.map((r, idx) => ({
      '#': idx + 1,
      'เบอร์รถ': r.truck_no,
      'ประเภทการซ่อม': MAINTENANCE_TYPE_MAP[r.maintenance_type]?.label || r.maintenance_type,
      'วันที่เข้าซ่อม': r.start_date || '-',
      'วันที่ซ่อมเสร็จ': r.end_date || r.start_date || '-',
      'ระยะเวลา (วัน)': r.duration_days || 1,
      'อู่ / ศูนย์บริการ': r.garage_name || '-',
      'เลขไมล์ (กม.)': r.mileage || 0,
      'เลขที่บิล / ใบสั่งซ่อม': r.invoice_no || '-',
      'รายการอะไหล่ / งานที่ทำ': r.parts_list || '-',
      'หมายเหตุ': r.remark || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Truck_Maintenance');
    XLSX.writeFile(wb, `Truck_Maintenance_${new Date().toISOString().slice(0, 10)}.xlsx`);
    success('ส่งออกไฟล์ Excel เรียบร้อยแล้ว');
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '4px 28px 20px 28px',
      boxSizing: 'border-box',
      background: '#f8fafc',
      overflow: 'hidden'
    }}>
      
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        flexShrink: 0,
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔧</span> ประวัติการซ่อมบำรุงรถ (Truck Maintenance Log)
          </h1>
          <p style={{ margin: 0, fontSize: '13.5px', color: '#64748b' }}>
            สมุดบันทึกประวัติการเข้าอู่ รายการซ่อมบำรุง อะไหล่ และเลขไมล์ประจำรถ (บันทึกค่าใช้จ่ายได้ที่เมนูค่าใช้จ่ายรถ)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={handleExportExcel}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            📊 ส่งออก Excel
          </button>

          <button
            onClick={() => {
              setEditingRecord(null);
              setIsModalOpen(true);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
            }}
          >
            ➕ เพิ่มบันทึกการซ่อม
          </button>
        </div>
      </div>


      {/* Filters Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#ffffff',
        padding: '12px 16px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        marginBottom: '14px',
        flexShrink: 0,
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        {/* ช่องค้นหา */}
        <div style={{ position: 'relative', width: '260px' }}>
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
          <input
            type="text"
            placeholder="ค้นหาเบอร์รถ, อู่, บิล, อะไหล่..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              height: '36px',
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

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* ฟิลเตอร์ประเภทการซ่อม */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              background: '#fff'
            }}
          >
            <option value="ALL">ทุกประเภทการซ่อม</option>
            {Object.entries(MAINTENANCE_TYPE_MAP).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>

          {/* ฟิลเตอร์เบอร์รถ */}
          <select
            value={truckFilter}
            onChange={e => setTruckFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              background: '#fff'
            }}
          >
            <option value="ALL">ทุกเบอร์รถ</option>
            {trucks.map(t => (
              <option key={t.truck_no} value={t.truck_no}>รถ {t.truck_no}</option>
            ))}
          </select>

          {/* Column Visibility Dropdown */}
          <div style={{ marginLeft: '6px' }}>
            <ColumnVisibilityDropdown preferences={maintPrefs} />
          </div>
        </div>
      </div>

      {/* Universal Table Area */}
      <UniversalTableContainer
        preferences={maintPrefs}
      >
        <UniversalTableHeader
          preferences={maintPrefs}
          data={filteredRecords}
          alignMap={MAINTENANCE_ALIGN_MAP}
        />
        <tbody>
            {loading ? (
              <tr>
                <td colSpan={activeColumns.length} style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>
                  <div>กำลังโหลดข้อมูลประวัติการซ่อมบำรุง...</div>
                </td>
              </tr>
            ) : displayedRecords.length === 0 ? (
              <tr>
                <td colSpan={activeColumns.length} style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
                  <div>ไม่พบข้อมูลประวัติการซ่อมบำรุงตามเงื่อนไข</div>
                </td>
              </tr>
            ) : (
              displayedRecords.map((r, idx) => {
                const typeStyle = MAINTENANCE_TYPE_MAP[r.maintenance_type] || MAINTENANCE_TYPE_MAP.general;

                return (
                  <tr
                    key={r.id || idx}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.12s ease',
                      background: '#ffffff'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                  >
                    {activeColumns.map(col => {
                      const align = MAINTENANCE_ALIGN_MAP[col] || 'left';
                      const cellStyle = {
                        padding: '8px 10px',
                        textAlign: align,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      };

                      if (col === 'id') {
                        return <td key={col} style={{ ...cellStyle, color: '#94a3b8' }}>{idx + 1}</td>;
                      }
                      if (col === 'truck_no') {
                        return (
                          <td key={col} style={{ ...cellStyle, fontWeight: 800, color: '#0f172a' }}>
                            🚛 {r.truck_no}
                          </td>
                        );
                      }
                      if (col === 'maintenance_type') {
                        return (
                          <td key={col} style={cellStyle}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: typeStyle.color,
                              background: typeStyle.bg
                            }}>
                              {typeStyle.label}
                            </span>
                          </td>
                        );
                      }
                      if (col === 'start_date') {
                        return (
                          <td key={col} style={{ ...cellStyle, color: '#334155' }}>
                            {formatDateDisplay(r.start_date)}
                          </td>
                        );
                      }
                      if (col === 'end_date') {
                        return (
                          <td key={col} style={{ ...cellStyle, color: '#059669', fontWeight: 600 }}>
                            {formatDateDisplay(r.end_date || r.start_date)}
                          </td>
                        );
                      }
                      if (col === 'duration_days') {
                        const days = r.duration_days || 1;
                        return (
                          <td key={col} style={{ ...cellStyle, color: '#64748b' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: '#f1f5f9',
                              fontSize: '11.5px',
                              fontWeight: 600
                            }}>
                              {days} วัน
                            </span>
                          </td>
                        );
                      }
                      if (col === 'garage_name') {
                        return (
                          <td key={col} style={{ ...cellStyle, color: '#334155' }}>
                            {r.garage_name || '-'}
                          </td>
                        );
                      }
                      if (col === 'mileage') {
                        return (
                          <td key={col} style={{ ...cellStyle, color: '#64748b' }}>
                            {r.mileage && r.mileage > 0 ? `${Number(r.mileage).toLocaleString()} กม.` : '-'}
                          </td>
                        );
                      }
                      if (col === 'invoice_no') {
                        return (
                          <td key={col} style={cellStyle}>
                            {r.invoice_no && r.invoice_no !== '-' ? (
                              <span style={{ padding: '2px 6px', background: '#f1f5f9', borderRadius: '4px', fontSize: '11.5px', fontWeight: 600 }}>
                                {r.invoice_no}
                              </span>
                            ) : '-'}
                          </td>
                        );
                      }
                      if (col === 'parts_list') {
                        return (
                          <td key={col} style={{ ...cellStyle, color: '#334155' }} title={r.parts_list}>
                            {r.parts_list && r.parts_list !== '-' ? r.parts_list : '-'}
                          </td>
                        );
                      }
                      if (col === 'remark') {
                        return (
                          <td key={col} style={{ ...cellStyle, color: '#64748b' }} title={r.remark}>
                            {r.remark && r.remark !== '-' ? r.remark : '-'}
                          </td>
                        );
                      }
                      if (col === 'actions') {
                        return (
                          <td key={col} style={cellStyle}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button
                                onClick={() => {
                                  setEditingRecord(r);
                                  setIsModalOpen(true);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  color: '#2563eb',
                                  fontSize: '12px',
                                  cursor: 'pointer'
                                }}
                                title="แก้ไข"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteRecord(r.id, r.truck_no)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid #fee2e2',
                                  background: '#fff1f2',
                                  color: '#e11d48',
                                  fontSize: '12px',
                                  cursor: 'pointer'
                                }}
                                title="ลบ"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        );
                      }
                      return <td key={col} style={{ ...cellStyle, color: '#334155' }}>{r[col] || '-'}</td>;
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
      </UniversalTableContainer>

      {/* Maintenance Modal */}
      <MaintenanceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveRecord}
        record={editingRecord}
        truckList={trucks}
      />

    </div>
  );
}
