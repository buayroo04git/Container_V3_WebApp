import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import Badge from '../ui/Badge';

/**
 * 🔍 Modal แสดงรายละเอียดการคำนวณค่าตอบแทนรายบุคคล (Container Breakdown)
 * รองรับทั้งตู้ที่ตรวจแล้ว (🟢 Verified), ตู้รอตรวจ (⏳ Pending), และสถานะการตัดจ่าย (💳 Payment Status)
 */
export default function DriverPayrollDetailModal({
  isOpen,
  onClose,
  driverSummary = null,
  dateRangeText = 'ทั้งหมด',
  onOpenSettlementModal = null,
  onOpenDriverEdit = null
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sizeFilter, setSizeFilter] = useState('ALL');
  const [typeTab, setTypeTab] = useState('verified'); // 'verified' | 'pending' | 'unpaid' | 'paid'

  // Combine items based on active typeTab
  const currentList = useMemo(() => {
    if (!driverSummary) return [];
    const verified = driverSummary.containers || [];
    const pending = driverSummary.pending_list || [];

    if (typeTab === 'pending') {
      return pending;
    }
    if (typeTab === 'unpaid') {
      return verified.filter(c => c.payment_status !== 'paid');
    }
    if (typeTab === 'paid') {
      return verified.filter(c => c.payment_status === 'paid');
    }
    return verified;
  }, [driverSummary, typeTab]);

  // Filter container items
  const filteredContainers = useMemo(() => {
    return currentList.filter(c => {
      const matchSearch = !searchTerm || 
        c.container_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.port?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.truck_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.batch_name?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchSize = sizeFilter === 'ALL' || c.sizeCategory === sizeFilter || c.size === sizeFilter;
      return matchSearch && matchSize;
    });
  }, [currentList, searchTerm, sizeFilter]);

  if (!isOpen || !driverSummary) return null;

  const unpaidContainers = (driverSummary.containers || []).filter(c => c.payment_status !== 'paid');
  const pendingCount = driverSummary.pending_containers || (driverSummary.pending_list || []).length;
  const verifiedCount = driverSummary.verified_containers || (driverSummary.containers || []).length;

  // Export Individual Driver Statement to Excel
  const handleExportDriverExcel = () => {
    try {
      const exportData = (driverSummary.containers || []).map((c, index) => ({
        'ลำดับ': index + 1,
        'เลขตู้ (Container No)': c.container_no,
        'ขนาดตู้ (Size)': c.size,
        'ประเภทขนาด': c.sizeCategory || c.size,
        'ท่าเรือ (Port)': c.port,
        'วันที่ในใบวางบิล (Master Date)': c.master_date || '-',
        'วันที่ใบงาน': c.sheet_date || '-',
        'เบอร์รถ': c.truck_no,
        'รอบงาน (Batch)': c.batch_name,
        'เรทราคาที่ใช้': c.rate_name || 'มาตรฐาน',
        'ค่ารอบ (บาท)': c.unit_price || 0,
        'สถานะการตัดรอบ': c.payment_status === 'paid' ? 'ตัดรอบแล้ว' : 'รอตัดรอบ',
        'สถานะการจับคู่': c.match_status === 'matched_green' ? 'จับคู่สมบูรณ์' : 'ตู้ค้าง/นอกไฟล์'
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // Auto-fit columns
      ws['!cols'] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 10 },
        { wch: 10 },
        { wch: 12 },
        { wch: 16 },
        { wch: 14 },
        { wch: 10 },
        { wch: 18 },
        { wch: 18 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, `ค่ารอบ_${driverSummary.driver_name.slice(0, 15)}`);
      XLSX.writeFile(wb, `ใบสรุปค่ารอบ_${driverSummary.driver_name}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      console.error('Export driver payroll error:', e);
      alert('เกิดข้อผิดพลาดในการส่งออก Excel');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '1080px',
        maxHeight: '92vh',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #e2e8f0',
          background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px'
            }}>
              👤
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                  {driverSummary.driver_name}
                </h3>
                <span style={{
                  fontSize: '11.5px',
                  background: '#f1f5f9',
                  color: '#475569',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontWeight: 600
                }}>
                  🚛 รถ {driverSummary.assigned_truck_no || '-'}
                </span>
                <span style={{
                  fontSize: '11px',
                  background: '#e0f2fe',
                  color: '#0369a1',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontWeight: 600
                }}>
                  ช่วง: {dateRangeText}
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                รายละเอียดรายการตู้และอัตราค่ารอบรายตู้ (อิงตามวันที่ในใบวางบิล Master DB)
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onOpenDriverEdit && (
              <button
                type="button"
                onClick={() => onOpenDriverEdit(driverSummary.driver_name)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0 12px',
                  height: '34px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                ⚙️ ตั้งค่าเงินเดือน/สปส.
              </button>
            )}



            <button
              type="button"
              onClick={handleExportDriverExcel}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 14px',
                height: '34px',
                borderRadius: '8px',
                border: '1px solid #bbf7d0',
                background: '#f0fdf4',
                color: '#16a34a',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              📥 ส่งออก Excel
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: 'none',
                background: '#f1f5f9',
                fontSize: '16px',
                cursor: 'pointer',
                color: '#64748b',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Summary Stat Cards */}
        <div style={{
          padding: '12px 24px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '10px'
        }}>
          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '10px', border: '2px solid #10b981' }}>
            <div style={{ fontSize: '11px', color: '#15803d', fontWeight: 700 }}>💰 รวมรับสุทธิ</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
              ฿{((driverSummary.total_earnings || 0) + (driverSummary.special_bonus || 0)).toLocaleString()}
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: 700 }}>📦 ค่ารอบวิ่งงาน</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#1e40af', marginTop: '2px' }}>
              ฿{(driverSummary.total_earnings || 0).toLocaleString()}
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '10px', border: Number(driverSummary.special_bonus || 0) > 0 ? '1px solid #fde68a' : '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', color: Number(driverSummary.special_bonus || 0) > 0 ? '#b45309' : '#64748b', fontWeight: 700 }}>🎁 เงินพิเศษ</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: Number(driverSummary.special_bonus || 0) > 0 ? '#b45309' : '#94a3b8', marginTop: '2px' }}>
              {Number(driverSummary.special_bonus || 0) > 0 ? `+฿${Number(driverSummary.special_bonus).toLocaleString()}` : '-'}
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', color: '#059669', fontWeight: 700 }}>🟢 ตรวจเสร็จแล้ว</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
              {verifiedCount} <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748b' }}>ตู้</span>
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '10px', border: pendingCount > 0 ? '1px solid #fed7aa' : '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', color: pendingCount > 0 ? '#ea580c' : '#64748b', fontWeight: 700 }}>⏳ รอตรวจสอบ</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: pendingCount > 0 ? '#ea580c' : '#94a3b8', marginTop: '2px' }}>
              {pendingCount} <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748b' }}>ตู้</span>
            </div>
          </div>
        </div>

        {/* Tab & Filter Bar within Modal */}
        <div style={{
          padding: '10px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          {/* Main Segment Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setTypeTab('verified')}
              style={{
                height: '30px',
                padding: '0 12px',
                borderRadius: '6px',
                border: typeTab === 'verified' ? '1px solid #2563eb' : '1px solid #e2e8f0',
                background: typeTab === 'verified' ? '#eff6ff' : '#ffffff',
                color: typeTab === 'verified' ? '#1d4ed8' : '#64748b',
                fontSize: '12px',
                fontWeight: typeTab === 'verified' ? 700 : 500,
                cursor: 'pointer'
              }}
            >
              🟢 ตรวจแล้ว ({verifiedCount})
            </button>

            <button
              type="button"
              onClick={() => setTypeTab('unpaid')}
              style={{
                height: '30px',
                padding: '0 12px',
                borderRadius: '6px',
                border: typeTab === 'unpaid' ? '1px solid #0284c7' : '1px solid #e2e8f0',
                background: typeTab === 'unpaid' ? '#f0f9ff' : '#ffffff',
                color: typeTab === 'unpaid' ? '#0284c7' : '#64748b',
                fontSize: '12px',
                fontWeight: typeTab === 'unpaid' ? 700 : 500,
                cursor: 'pointer'
              }}
            >
              ⏳ รอตัดรอบ ({unpaidContainers.length})
            </button>

            <button
              type="button"
              onClick={() => setTypeTab('paid')}
              style={{
                height: '30px',
                padding: '0 12px',
                borderRadius: '6px',
                border: typeTab === 'paid' ? '1px solid #059669' : '1px solid #e2e8f0',
                background: typeTab === 'paid' ? '#ecfdf5' : '#ffffff',
                color: typeTab === 'paid' ? '#059669' : '#64748b',
                fontSize: '12px',
                fontWeight: typeTab === 'paid' ? 700 : 500,
                cursor: 'pointer'
              }}
            >
              ✅ ตัดรอบแล้ว ({driverSummary.paid_count || 0})
            </button>

            <button
              type="button"
              onClick={() => setTypeTab('pending')}
              style={{
                height: '30px',
                padding: '0 12px',
                borderRadius: '6px',
                border: typeTab === 'pending' ? '1px solid #ea580c' : '1px solid #e2e8f0',
                background: typeTab === 'pending' ? '#fff7ed' : '#ffffff',
                color: typeTab === 'pending' ? '#ea580c' : '#64748b',
                fontSize: '12px',
                fontWeight: typeTab === 'pending' ? 700 : 500,
                cursor: 'pointer'
              }}
            >
              ⚠️ รอตรวจสอบ ({pendingCount})
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative', width: '210px' }}>
              <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="ค้นหาเลขตู้, ท่า, เบอร์รถ..."
                style={{
                  height: '30px',
                  paddingLeft: '28px',
                  paddingRight: searchTerm ? '24px' : '10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12px',
                  width: '100%',
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
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '11px',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              {['ALL', '20', '40', '45'].map(sz => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setSizeFilter(sz)}
                  style={{
                    height: '28px',
                    padding: '0 8px',
                    borderRadius: '5px',
                    border: sizeFilter === sz ? '1px solid #2563eb' : '1px solid #e2e8f0',
                    background: sizeFilter === sz ? '#eff6ff' : '#ffffff',
                    color: sizeFilter === sz ? '#1d4ed8' : '#64748b',
                    fontSize: '11px',
                    fontWeight: sizeFilter === sz ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  {sz === 'ALL' ? 'ทั้งหมด' : sz}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 20px 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ padding: '10px 8px', width: '45px', textAlign: 'center' }}>#</th>
                <th style={{ padding: '10px 10px' }}>เลขตู้</th>
                <th style={{ padding: '10px 8px', width: '70px', textAlign: 'center' }}>ขนาด</th>
                <th style={{ padding: '10px 8px', width: '70px', textAlign: 'center' }}>ท่า</th>
                <th style={{ padding: '10px 10px', minWidth: '100px' }}>📅 วันที่ Master</th>
                <th style={{ padding: '10px 8px', width: '75px', textAlign: 'center' }}>เบอร์รถ</th>
                <th style={{ padding: '10px 10px' }}>รอบงาน (Batch)</th>
                <th style={{ padding: '10px 8px', width: '100px', textAlign: 'center' }}>สถานะตรวจ</th>
                <th style={{ padding: '10px 8px', width: '100px', textAlign: 'center' }}>สถานะจ่ายเงิน</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '90px' }}>ค่ารอบ</th>
              </tr>
            </thead>
            <tbody>
              {filteredContainers.map((item, idx) => {
                const isPending = item.is_pending || typeTab === 'pending';
                const isPaid = item.payment_status === 'paid';

                return (
                  <tr
                    key={item.id || idx}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: isPending ? '#fffbeb' : (idx % 2 === 0 ? '#ffffff' : '#fafafa')
                    }}
                  >
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: '#94a3b8', fontSize: '11.5px' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '9px 10px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                      {item.container_no}
                    </td>
                    <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: item.sizeCategory === '20' || item.size === '20' ? '#eff6ff' : '#fef3c7',
                        color: item.sizeCategory === '20' || item.size === '20' ? '#1d4ed8' : '#b45309'
                      }}>
                        {item.size || item.sizeCategory || '20'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: '#475569' }}>
                      {item.port || '-'}
                    </td>
                    <td style={{ padding: '9px 10px', color: '#0f172a', fontWeight: 600 }}>
                      {item.master_date || item.date_job || '-'}
                    </td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: '#2563eb', fontWeight: 700 }}>
                      {item.truck_no || '-'}
                    </td>
                    <td style={{ padding: '9px 10px', color: '#64748b', fontSize: '11.5px' }}>
                      {item.batch_name || '-'}
                    </td>
                    <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                      {isPending ? (
                        <Badge variant="amber" style={{ fontSize: '10.5px' }}>
                          ⏳ รอตรวจสอบ
                        </Badge>
                      ) : (
                        <Badge variant="green" style={{ fontSize: '10.5px' }}>
                          🟢 ตรวจแล้ว
                        </Badge>
                      )}
                    </td>
                    <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                      {isPending ? (
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>-</span>
                      ) : isPaid ? (
                        <Badge variant="green" style={{ fontSize: '10.5px' }}>
                          ✅ จ่ายแล้ว
                        </Badge>
                      ) : (
                        <Badge variant="blue" style={{ fontSize: '10.5px' }}>
                          ⏳ ยังไม่จ่าย
                        </Badge>
                      )}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: isPending ? '#94a3b8' : '#16a34a' }}>
                      {isPending ? (
                        <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>รอตรวจ</span>
                      ) : (
                        `฿${(item.unit_price || 0).toLocaleString()}`
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredContainers.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    ไม่พบรายการตู้ในกลุ่มนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
