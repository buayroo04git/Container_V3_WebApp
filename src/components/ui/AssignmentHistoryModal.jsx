import React, { useState, useEffect, useMemo } from 'react';
import { fetchAssignmentHistory, getAllAssignmentHistory, getHistoryByTruck, getHistoryByDriver } from '../../services/historyService';

/**
 * 📜 AssignmentHistoryModal
 * แสดงประวัติ Timeline การมอบหมาย / สลับ / ปลดรถ ของคนขับและรถ
 */
export default function AssignmentHistoryModal({
  isOpen,
  onClose,
  targetType = 'ALL', // 'ALL' | 'TRUCK' | 'DRIVER'
  targetId = null,    // e.g. '501' or 'สายัน หงษ์สันเทียะ'
  targetTitle = ''
}) {
  const [filterText, setFilterText] = useState('');
  const [rawHistory, setRawHistory] = useState([]);

  // โหลดข้อมูลล่าสุดจาก Supabase เมื่อเปิด Modal
  useEffect(() => {
    if (isOpen) {
      fetchAssignmentHistory().then(data => {
        setRawHistory(data || []);
      });
    }
  }, [isOpen]);

  // โหลดรายการประวัติตาม target
  const historyList = useMemo(() => {
    if (!isOpen) return [];
    if (targetType === 'TRUCK' && targetId) {
      const cleanNo = String(targetId).trim();
      return rawHistory.filter(item => 
        String(item.truck_no).trim() === cleanNo || 
        String(item.previous_truck).trim() === cleanNo
      );
    }
    if (targetType === 'DRIVER' && targetId) {
      const cleanName = String(targetId).trim().toLowerCase();
      return rawHistory.filter(item => 
        String(item.driver_name).trim().toLowerCase() === cleanName ||
        String(item.previous_driver).trim().toLowerCase() === cleanName
      );
    }
    return rawHistory.length > 0 ? rawHistory : getAllAssignmentHistory();
  }, [isOpen, targetType, targetId, rawHistory]);

  // กรองตามคำค้นหา
  const filteredList = useMemo(() => {
    if (!filterText.trim()) return historyList;
    const q = filterText.toLowerCase();
    return historyList.filter(item =>
      String(item.driver_name || '').toLowerCase().includes(q) ||
      String(item.truck_no || '').toLowerCase().includes(q) ||
      String(item.reason || '').toLowerCase().includes(q) ||
      String(item.action || '').toLowerCase().includes(q)
    );
  }, [historyList, filterText]);

  if (!isOpen) return null;

  const actionStyles = {
    ASSIGN: { label: '🟢 เริ่มปฏิบัติงาน', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
    TRANSFER: { label: '🔄 ย้ายรถประจำ', bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' },
    UNASSIGN: { label: '🔴 สิ้นสุดการปฏิบัติงาน', bg: '#fee2e2', color: '#dc2626', border: '#fecaca' },
    LEAVE: { label: '🟡 ลางาน', bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
    RESUME_WORK: { label: '🟢 กลับมาทำงาน', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
    MAINTENANCE: { label: '🔧 เข้าซ่อมบำรุง', bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
    MAINTENANCE_END: { label: '✅ ซ่อมเสร็จ', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
    MAINTENANCE_QUICK: { label: '⚡ ซ่อมด่วนเสร็จในวัน', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    RESIGN: { label: '⚪ ลาออก/พ้นสภาพ', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' }
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '720px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid #e2e8f0',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>📜</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                {targetTitle || 'ประวัติการปฏิบัติงาน (Timeline)'}
              </h3>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                {targetType === 'TRUCK' ? `ประวัติการปฏิบัติงานของรถเบอร์ ${targetId}` : 
                 targetType === 'DRIVER' ? `ประวัติการปฏิบัติงานของคุณ ${targetId}` : 
                 'บันทึกประวัติการเริ่มงาน สลับรถ สิ้นสุดงาน ซ่อมบำรุง และลางานของทั้งระบบ'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Filter Bar */}
        <div style={{
          padding: '12px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: '#ffffff'
        }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
            <input
              type="text"
              placeholder="ค้นหาชื่อคนขับ, เบอร์รถ, เหตุผล..."
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              style={{
                width: '100%',
                height: '34px',
                paddingLeft: '30px',
                paddingRight: filterText ? '26px' : '10px',
                borderRadius: '7px',
                border: '1px solid #cbd5e1',
                fontSize: '12.5px',
                boxSizing: 'border-box'
              }}
            />
            {filterText && (
              <button
                type="button"
                onClick={() => setFilterText('')}
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
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, flexShrink: 0 }}>
            {filteredList.length} รายการ
          </span>
        </div>

        {/* Timeline List Body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          background: '#ffffff'
        }}>
          {filteredList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>ยังไม่มีบันทึกประวัติในช่วงนี้</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                เมื่อมีการมอบหมายรถ สลับคนขับ หรือคนขับลาออก ระบบจะบันทึก Timeline ให้อัตโนมัติ
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
              {/* Timeline Line */}
              <div style={{
                position: 'absolute',
                left: '19px',
                top: '12px',
                bottom: '12px',
                width: '2px',
                background: '#e2e8f0',
                zIndex: 1
              }} />

              {filteredList.map((item, idx) => {
                const badge = actionStyles[item.action] || actionStyles.ASSIGN;
                return (
                  <div
                    key={item.id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '14px',
                      position: 'relative',
                      zIndex: 2
                    }}
                  >
                    {/* Circle Node */}
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: badge.bg,
                      border: `2px solid ${badge.color}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '15px',
                      flexShrink: 0,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                    }}>
                      {item.action === 'ASSIGN' ? '🚛' : 
                       item.action === 'TRANSFER' ? '🔄' : 
                       item.action === 'LEAVE' ? '🟡' : 
                       item.action === 'RESIGN' ? '⚪' : '📦'}
                    </div>

                    {/* Card Content */}
                    <div style={{
                      flex: 1,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '12px 16px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '5px',
                          background: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`
                        }}>
                          {badge.label}
                        </span>
                        <span style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 500 }}>
                          ⏱️ {formatTime(item.timestamp || item.created_at)}
                        </span>
                      </div>

                      <div style={{ fontSize: '13.5px', color: '#0f172a', fontWeight: 700, marginBottom: '4px' }}>
                        👤 คนขับ: <span style={{ color: '#2563eb' }}>{item.driver_name}</span> &nbsp;|&nbsp; 
                        🚛 รถ: <span style={{ color: '#059669' }}>เบอร์ {item.truck_no}</span>
                        {item.truck_license && item.truck_license !== '-' && (
                          <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 500 }}> ({item.truck_license})</span>
                        )}
                      </div>

                      <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.4 }}>
                        📝 รายละเอียด: {item.reason}
                        {item.effective_date && (
                          <span style={{ color: '#0284c7', display: 'block', fontSize: '11.5px', marginTop: '2px', fontWeight: 600 }}>
                            📅 วันที่มีผล: {item.effective_date}
                          </span>
                        )}
                        {item.previous_driver && item.previous_driver !== '-' && (
                          <span style={{ color: '#64748b', display: 'block', fontSize: '11.5px', marginTop: '2px' }}>
                            ↳ คนขับเดิมก่อนหน้า: {item.previous_driver}
                          </span>
                        )}
                        {item.previous_truck && item.previous_truck !== '-' && (
                          <span style={{ color: '#64748b', display: 'block', fontSize: '11.5px', marginTop: '2px' }}>
                            ↳ รถคันเดิมก่อนย้าย: เบอร์ {item.previous_truck}
                          </span>
                        )}
                        {item.created_by && item.created_by !== '-' && item.created_by !== 'Admin' && (
                          <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px', marginTop: '3px' }}>
                            👤 ผู้ทำรายการ: {item.created_by}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'flex-end',
          background: '#f8fafc'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
