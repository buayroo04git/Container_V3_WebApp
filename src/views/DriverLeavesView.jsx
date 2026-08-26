import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from '../context/ToastContext';
import {
  fetchLeaveRecords,
  createLeaveRecord,
  updateLeaveRecord,
  deleteLeaveRecord
} from '../services/leaveService';
import { fetchDrivers } from '../services/truckDriverService';
import LeaveModal from '../components/leaves/LeaveModal';
import ColumnVisibilityDropdown from '../components/ui/ColumnVisibilityDropdown';
import KpiCard from '../components/ui/KpiCard';
import UniversalTableContainer from '../components/ui/UniversalTableContainer';
import UniversalTableHeader from '../components/ui/UniversalTableHeader';
import MonthPicker from '../components/ui/MonthPicker';
import useActiveMonth from '../hooks/useActiveMonth';
import { useColumnPreferences } from '../hooks/useColumnPreferences';

const DEFAULT_LEAVE_COLUMNS = [
  'id',
  'driver_name',
  'leave_type',
  'start_date',
  'end_date',
  'duration_days',
  'with_pay',
  'status',
  'leave_reason',
  'approved_by',
  'remark',
  'actions'
];

const DEFAULT_COLUMN_NAMES = {
  id: '#',
  driver_name: 'พนักงานขับรถ',
  leave_type: 'ประเภทการลา',
  start_date: 'วันที่เริ่มลา',
  end_date: 'วันที่สิ้นสุด / กลับมา',
  duration_days: 'จำนวนวันลา',
  with_pay: 'การจ่ายค่าจ้าง',
  status: 'สถานะการลา',
  leave_reason: 'เหตุผลการลา',
  approved_by: 'ผู้อนุมัติ',
  remark: 'หมายเหตุ',
  actions: 'จัดการ'
};

const DEFAULT_LEAVE_WIDTHS = {
  id: 45,
  driver_name: 150,
  leave_type: 130,
  start_date: 110,
  end_date: 130,
  duration_days: 95,
  with_pay: 105,
  status: 115,
  leave_reason: 150,
  approved_by: 115,
  remark: 140,
  actions: 100
};

const LEAVE_ALIGN_MAP = {
  id: 'center',
  driver_name: 'left',
  leave_type: 'center',
  start_date: 'center',
  end_date: 'center',
  duration_days: 'right',
  with_pay: 'center',
  status: 'center',
  leave_reason: 'left',
  approved_by: 'left',
  remark: 'left',
  actions: 'center'
};

const LEAVE_TYPE_MAP = {
  personal: { label: '🟡 ลากิจส่วนตัว', color: '#b45309', bg: '#fef3c7' },
  sick: { label: '🩺 ลาป่วย', color: '#dc2626', bg: '#fee2e2' },
  vacation: { label: '🏖️ ลาพักร้อน', color: '#0284c7', bg: '#e0f2fe' },
  ordination: { label: '🙏 ลาบวช/คลอด', color: '#7c3aed', bg: '#ede9fe' },
  unauthorized: { label: '⚠️ ขาดงาน/ไม่แจ้ง', color: '#be123c', bg: '#ffe4e6' },
  suspended: { label: '⚪ พักงาน/สอบสวน', color: '#475569', bg: '#f1f5f9' },
  other: { label: '📝 อื่นๆ', color: '#0f172a', bg: '#f8fafc' }
};

export default function DriverLeavesView() {
  const { success, error: toastError, warning } = useToast();
  const [records, setRecords] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [driverFilter, setDriverFilter] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useActiveMonth();

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
  const leavesPrefs = useColumnPreferences({
    storageKeyPrefix: 'driver_leaves',
    rawColumns: DEFAULT_LEAVE_COLUMNS,
    defaultNames: DEFAULT_COLUMN_NAMES,
    defaultWidths: DEFAULT_COLUMN_WIDTHS,
    sampleRecords: records,
    formatCellValue: (col, val, row) => {
      if (col === 'start_date') return formatDateDisplay(val);
      if (col === 'end_date') return row?.status === 'active_leave' ? (row?.is_indefinite ? '🟡 ลาไม่มีกำหนด' : `🟡 ถึง ${formatDateDisplay(row?.expected_end_date)}`) : formatDateDisplay(val);
      if (col === 'leave_type') return LEAVE_TYPE_MAP[val]?.label || val;
      if (col === 'duration_days') return `${val || 1} วัน`;
      if (col === 'status') return row?.status === 'active_leave' ? '🟡 กำลังลางาน' : '🟢 สิ้นสุดแล้ว';
      if (col === 'with_pay') return val === 'paid' ? '✅ จ่ายค่าจ้าง' : '❌ ไม่จ่าย';
      return String(val || '');
    }
  });

  const { activeColumns, sortRecords, sortConfig } = leavesPrefs;

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [leavesRes, driversRes] = await Promise.all([
        fetchLeaveRecords(),
        fetchDrivers()
      ]);
      setRecords(leavesRes?.data || []);
      const driverList = Array.isArray(driversRes) ? driversRes : (driversRes?.data || []);
      setDrivers(driverList);
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
      if (selectedMonth && selectedMonth !== 'ALL') {
        const rawDate = r.start_date || r.end_date || '';
        if (!rawDate.startsWith(selectedMonth)) return false;
      }
      if (typeFilter !== 'ALL' && r.leave_type !== typeFilter) return false;
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (driverFilter !== 'ALL' && r.driver_name !== driverFilter) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchDriver = String(r.driver_name || '').toLowerCase().includes(q);
        const matchReason = String(r.leave_reason || '').toLowerCase().includes(q);
        const matchApproved = String(r.approved_by || '').toLowerCase().includes(q);
        const matchRemark = String(r.remark || '').toLowerCase().includes(q);
        if (!matchDriver && !matchReason && !matchApproved && !matchRemark) return false;
      }
      return true;
    });
  }, [records, selectedMonth, typeFilter, statusFilter, driverFilter, searchTerm]);

  // Displayed Records (Sorted & Filtered)
  const displayedRecords = useMemo(() => {
    return sortRecords(filteredRecords);
  }, [filteredRecords, sortConfig, sortRecords]);

  // KPI Calculations
  const kpis = useMemo(() => {
    const activeLeave = records.filter(r => r.status === 'active_leave').length;
    const completed = records.filter(r => r.status === 'completed').length;
    const totalDays = records.reduce((sum, r) => sum + (Number(r.duration_days) || 1), 0);
    const uniqueDrivers = new Set(records.map(r => r.driver_name)).size;
    return { activeLeave, completed, totalDays, uniqueDrivers, total: records.length };
  }, [records]);

  // Save Record
  const handleSaveRecord = async (formData, id) => {
    try {
      if (id) {
        const { error } = await updateLeaveRecord(id, formData);
        if (error) throw new Error(error);
        success('อัปเดตบันทึกการลางานเรียบร้อยแล้ว');
      } else {
        const { error } = await createLeaveRecord(formData);
        if (error) throw new Error(error);
        success('เพิ่มบันทึกการลางานเรียบร้อยแล้ว');
      }
      loadData();
    } catch (err) {
      toastError('บันทึกไม่สำเร็จ: ' + err.message);
    }
  };

  // Delete Record
  const handleDeleteRecord = async (id, driverName) => {
    if (!window.confirm(`ยืนยันการลบบันทึกการลางานของ ${driverName} หรือไม่?`)) return;
    try {
      const { error } = await deleteLeaveRecord(id);
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
      'พนักงานขับรถ': r.driver_name,
      'ประเภทการลา': LEAVE_TYPE_MAP[r.leave_type]?.label || r.leave_type,
      'วันที่เริ่มลา': r.start_date || '-',
      'วันที่สิ้นสุด / กลับมา': r.status === 'active_leave' ? (r.is_indefinite ? 'ลาไม่มีกำหนด' : `คาดว่าถึง ${r.expected_end_date}`) : (r.end_date || '-'),
      'จำนวนวันลา': r.duration_days || 1,
      'การจ่ายค่าจ้าง': r.with_pay === 'paid' ? 'จ่ายค่าจ้าง' : 'ไม่จ่าย',
      'สถานะ': r.status === 'active_leave' ? 'กำลังลางาน' : 'สิ้นสุดแล้ว',
      'เหตุผลการลา': r.leave_reason || '-',
      'ผู้อนุมัติ': r.approved_by || '-',
      'หมายเหตุ': r.remark || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Driver_Leaves');
    XLSX.writeFile(wb, `Driver_Leaves_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
            <span>🏖️</span> ประวัติการลางานคนขับ (Driver Leave Records)
          </h1>
          <p style={{ margin: 0, fontSize: '13.5px', color: '#64748b' }}>
            บันทึกประวัติการลางาน พักร้อน ลาป่วย วันหยุดพักผ่อน และสถิติวันลาของพนักงานขับรถ
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
            ➕ เพิ่มบันทึกการลา
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
            placeholder="ค้นหาชื่อคนขับ, เหตุผล, หมายเหตุ..."
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
          {/* 📅 Month Filter */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <MonthPicker
              value={selectedMonth === 'ALL' ? '' : selectedMonth}
              onChange={(newMonth) => setSelectedMonth(newMonth)}
              label="เดือน:"
            />
            {selectedMonth !== 'ALL' && (
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

          {/* ฟิลเตอร์ประเภทการลา */}
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
            <option value="ALL">ทุกประเภทการลา</option>
            {Object.entries(LEAVE_TYPE_MAP).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>

          {/* ฟิลเตอร์สถานะ */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              background: '#fff'
            }}
          >
            <option value="ALL">ทุกสถานะ</option>
            <option value="active_leave">🟡 กำลังลางาน (On Leave)</option>
            <option value="completed">🟢 สิ้นสุดแล้ว (Returned)</option>
          </select>

          {/* ฟิลเตอร์คนขับ */}
          <select
            value={driverFilter}
            onChange={e => setDriverFilter(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: '7px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              background: '#fff'
            }}
          >
            <option value="ALL">คนขับทุกคน</option>
            {drivers.map(d => (
              <option key={d.driver_name} value={d.driver_name}>{d.driver_name}</option>
            ))}
          </select>

          {/* Column Visibility Dropdown */}
          <div style={{ marginLeft: '6px' }}>
            <ColumnVisibilityDropdown preferences={leavesPrefs} />
          </div>
        </div>
      </div>

      {/* Universal Table Area */}
      <UniversalTableContainer
        preferences={leavesPrefs}
      >
        <UniversalTableHeader
          preferences={leavesPrefs}
          data={filteredRecords}
          alignMap={LEAVE_ALIGN_MAP}
        />
        <tbody>
            {loading ? (
              <tr>
                <td colSpan={activeColumns.length} style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>
                  <div>กำลังโหลดข้อมูลประวัติการลางาน...</div>
                </td>
              </tr>
            ) : displayedRecords.length === 0 ? (
              <tr>
                <td colSpan={activeColumns.length} style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
                  <div>ไม่พบข้อมูลการลางานตามเงื่อนไข</div>
                </td>
              </tr>
            ) : (
              displayedRecords.map((r, idx) => {
                const typeStyle = LEAVE_TYPE_MAP[r.leave_type] || LEAVE_TYPE_MAP.other;
                const isActive = r.status === 'active_leave';

                return (
                  <tr
                    key={r.id || idx}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.12s ease',
                      background: isActive ? '#fffbeb' : '#ffffff'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = isActive ? '#fffbeb' : '#ffffff'}
                  >
                    {activeColumns.map(col => {
                      const align = LEAVE_ALIGN_MAP[col] || 'left';
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
                      if (col === 'driver_name') {
                        return (
                          <td key={col} style={{ ...cellStyle, fontWeight: 800, color: '#0f172a' }}>
                            👤 {r.driver_name}
                          </td>
                        );
                      }
                      if (col === 'leave_type') {
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
                          <td key={col} style={cellStyle}>
                            {isActive ? (
                              <span style={{ color: '#b45309', fontWeight: 600 }}>
                                {r.is_indefinite ? '🟡 ลาไม่มีกำหนด' : `🟡 คาดว่าถึง ${formatDateDisplay(r.expected_end_date)}`}
                              </span>
                            ) : (
                              formatDateDisplay(r.end_date || r.expected_end_date)
                            )}
                          </td>
                        );
                      }
                      if (col === 'duration_days') {
                        return (
                          <td key={col} style={{ ...cellStyle, fontWeight: 700, color: '#0f172a' }}>
                            {r.duration_days || 1} วัน
                          </td>
                        );
                      }
                      if (col === 'with_pay') {
                        return (
                          <td key={col} style={cellStyle}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              color: r.with_pay === 'paid' ? '#16a34a' : '#64748b',
                              background: r.with_pay === 'paid' ? '#dcfce7' : '#f1f5f9'
                            }}>
                              {r.with_pay === 'paid' ? '✅ จ่ายค่าจ้าง' : '❌ ไม่จ่าย'}
                            </span>
                          </td>
                        );
                      }
                      if (col === 'status') {
                        return (
                          <td key={col} style={cellStyle}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              color: isActive ? '#b45309' : '#15803d',
                              background: isActive ? '#fef3c7' : '#dcfce7',
                              border: isActive ? '1px solid #fde68a' : '1px solid #bbf7d0'
                            }}>
                              {isActive ? '🟡 กำลังลางาน' : '🟢 สิ้นสุดแล้ว'}
                            </span>
                          </td>
                        );
                      }
                      if (col === 'leave_reason') {
                        return (
                          <td key={col} style={{ ...cellStyle, color: '#475569' }} title={r.leave_reason}>
                            {r.leave_reason || '-'}
                          </td>
                        );
                      }
                      if (col === 'approved_by') {
                        return (
                          <td key={col} style={{ ...cellStyle, color: '#64748b' }}>
                            {r.approved_by || '-'}
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
                                onClick={() => handleDeleteRecord(r.id, r.driver_name)}
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
                      return <td key={col} style={{ padding: '10px 14px' }}>{r[col] || '-'}</td>;
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
      </UniversalTableContainer>

      {/* Leave Modal */}
      <LeaveModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveRecord}
        record={editingRecord}
        driverList={drivers}
      />

    </div>
  );
}
