import React, { useState, useEffect, useMemo } from 'react';
import { getLastMaintenanceRecord, getLastLeaveRecord } from '../../services/historyService';

/**
 * 🚛 / 👤 Modal ถามยืนยันการเปลี่ยนสถานะการปฏิบัติงานของรถ / คนขับ (App Native Confirmation Modal)
 * โฟกัสความพร้อมในการปฏิบัติงานและบันทึกประวัติ Timeline
 */
export default function StatusChangeConfirmModal({
  isOpen,
  onClose,
  type = 'TRUCK', // 'TRUCK' หรือ 'DRIVER'
  data = null, // ข้อมูลรถ หรือ คนขับ
  newStatus = '', // สถานะใหม่ที่เลือก
  onConfirm // callback: ({ ...payload }) => void
}) {
  const isTruck = type === 'TRUCK';
  const currentStatus = data?.status || 'active';

  // ตรวจจับทิศทางการเปลี่ยนสถานะ
  const isEnteringMaintenance = isTruck && newStatus === 'maintenance';
  const isReturningFromMaintenance = isTruck && currentStatus === 'maintenance' && newStatus === 'active';
  const isEnteringLeave = !isTruck && (newStatus === 'leave' || newStatus === 'inactive');
  const isReturningFromLeave = !isTruck && (currentStatus === 'leave' || currentStatus === 'inactive') && newStatus === 'active';
  const isReturningToActive = isReturningFromMaintenance || isReturningFromLeave;

  // Form State
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10)); // วันที่มีผล / วันเสร็จ / วันกลับมา
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10)); // วันที่เริ่มเข้าซ่อม / เริ่มลา
  const [expectedEndDate, setExpectedEndDate] = useState(''); // วันที่คาดว่าจะเสร็จ / คาดว่าจะกลับ
  const [isIndefinite, setIsIndefinite] = useState(true); // ไม่มีกำหนดวันเสร็จ / ลาไม่มีกำหนด
  const [statusReason, setStatusReason] = useState('');
  const [autoStopOperation, setAutoStopOperation] = useState(true);

  // ข้อมูลเสริมสำหรับ ลางาน
  const [leaveType, setLeaveType] = useState('personal');
  const [withPay, setWithPay] = useState('unpaid');

  // คำนวณวันเดิมเมื่อเปิด Modal
  useEffect(() => {
    if (isOpen && data) {
      const today = new Date().toISOString().slice(0, 10);
      setEffectiveDate(today);
      setIsIndefinite(true);
      setExpectedEndDate('');
      setStatusReason('');
      setAutoStopOperation(true);
      setLeaveType('personal');
      setWithPay('unpaid');

      // ถ้าเป็นการซ่อมเสร็จ หรือ กลับจากลา ให้ดึงวันที่เริ่มจาก History หรือ UpdatedAt
      if (isReturningFromMaintenance) {
        const lastRec = getLastMaintenanceRecord(data.truck_no);
        const priorDate = lastRec?.effective_date || (data.updated_at ? data.updated_at.slice(0, 10) : today);
        setStartDate(priorDate);
      } else if (isReturningFromLeave) {
        const lastRec = getLastLeaveRecord(data.driver_name);
        const priorDate = lastRec?.effective_date || (data.updated_at ? data.updated_at.slice(0, 10) : today);
        setStartDate(priorDate);
      } else {
        setStartDate(today);
      }
    }
  }, [isOpen, data, newStatus, currentStatus]);

  // คำนวณจำนวนวัน
  const durationDays = useMemo(() => {
    if (!startDate || !effectiveDate) return 1;
    try {
      const d1 = new Date(startDate);
      const d2 = new Date(effectiveDate);
      const diffTime = d2.getTime() - d1.getTime();
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return days > 0 ? days : 1;
    } catch {
      return 1;
    }
  }, [startDate, effectiveDate]);

  if (!isOpen || !data) return null;

  const truckNo = isTruck ? data.truck_no : data.assigned_truck_no;
  const driverName = isTruck ? data.assigned_driver_name : data.driver_name;
  const hasAssigned = isTruck 
    ? (data.assigned_driver_name && data.assigned_driver_name !== '-')
    : (data.assigned_truck_no && data.assigned_truck_no !== '-');

  // ป้ายสถานะใหม่
  const getStatusLabel = (status, isTruckType) => {
    if (isTruckType) {
      if (status === 'maintenance') return { text: '🔧 ซ่อมบำรุง (Maintenance)', color: '#b45309', bg: '#fffbeb', border: '#fde68a' };
      if (status === 'inactive') return { text: '⚪ ระงับใช้งาน (Inactive)', color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' };
      return { text: '🟢 พร้อมใช้งาน (Active)', color: '#15803d', bg: '#ecfdf5', border: '#a7f3d0' };
    } else {
      if (status === 'leave') return { text: '🟡 ลางาน / พักงาน (On Leave)', color: '#b45309', bg: '#fffbeb', border: '#fde68a' };
      if (status === 'inactive') return { text: '⚪ พักงาน / ลาออก (Inactive)', color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' };
      return { text: '🟢 ปฏิบัติงาน (Active)', color: '#15803d', bg: '#ecfdf5', border: '#a7f3d0' };
    }
  };

  const statusInfo = getStatusLabel(newStatus, isTruck);

  const handleConfirmAction = (stopOp = true) => {
    onConfirm({
      autoStopOperation: stopOp,
      effectiveDate,
      startDate,
      expectedEndDate: isIndefinite ? null : expectedEndDate,
      isIndefinite,
      statusReason: statusReason.trim(),
      leaveType,
      withPay
    });
    onClose();
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
      zIndex: 1200,
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '540px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: isReturningToActive ? '1px solid #bbf7d0' : '1px solid #fee2e2',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: isReturningToActive ? '#f0fdf4' : '#fff1f2'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>
              {isReturningFromMaintenance ? '✅' : isReturningFromLeave ? '👤' : isEnteringMaintenance ? '🔧' : '⚠️'}
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: isReturningToActive ? '#166534' : '#991b1b' }}>
                {isReturningFromMaintenance ? 'บันทึกซ่อมเสร็จ & กลับมาพร้อมใช้งาน' :
                 isReturningFromLeave ? 'บันทึกคนขับกลับมาปฏิบัติงาน' :
                 isEnteringMaintenance ? 'ยืนยันรถเข้าซ่อมบำรุง' :
                 isEnteringLeave ? 'บันทึกการลางานของคนขับ' :
                 (isTruck ? 'ยืนยันการเปลี่ยนสถานะรถ' : 'ยืนยันการเปลี่ยนสถานะคนขับ')}
              </h3>
              <div style={{ fontSize: '12px', color: isReturningToActive ? '#15803d' : '#b91c1c', marginTop: '2px' }}>
                {isTruck ? `รถเบอร์ ${truckNo}` : `คุณ ${driverName}`}
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

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* ข้อมูลปัจจุบัน & สถานะใหม่ */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '13px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>{isTruck ? 'คนขับปัจจุบัน:' : 'รถประจำปัจจุบัน:'}</span>
              <strong style={{ color: '#0f172a' }}>
                {isTruck ? (driverName && driverName !== '-' ? `👤 ${driverName}` : '⚪ ไม่มีคนขับ (รถว่าง)') : (truckNo && truckNo !== '-' ? `🚛 รถเบอร์ ${truckNo}` : '⚪ ไม่มีรถประจำ')}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748b' }}>สถานะใหม่ที่ต้องการปรับ:</span>
              <span style={{
                padding: '3px 10px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: 700,
                color: statusInfo.color,
                background: statusInfo.bg,
                border: `1px solid ${statusInfo.border}`
              }}>
                {statusInfo.text}
              </span>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* กรณี 1: กลับมาพร้อมใช้งาน (ซ่อมเสร็จ หรือ กลับจากลา) */}
          {/* ═══════════════════════════════════════════════════════ */}
          {isReturningToActive && (
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '10px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#166534' }}>
                ⏱️ บันทึกสรุปช่วงเวลา{isReturningFromMaintenance ? 'เข้าซ่อมบำรุง' : 'ลางาน'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#15803d', marginBottom: '4px' }}>
                    📅 วันที่เริ่ม{isReturningFromMaintenance ? 'เข้าซ่อม' : 'ลา'}
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #86efac',
                      fontSize: '13px',
                      fontWeight: 600,
                      background: '#ffffff',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#15803d', marginBottom: '4px' }}>
                    📅 วันที่{isReturningFromMaintenance ? 'ซ่อมเสร็จ (พร้อมใช้)' : 'กลับมาทำงาน'}
                  </label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={e => setEffectiveDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #86efac',
                      fontSize: '13px',
                      fontWeight: 600,
                      background: '#ffffff',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* ป้ายคำนวณจำนวนวัน */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #86efac',
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12.5px'
              }}>
                <span style={{ color: '#15803d' }}>
                  สรุปช่วงเวลา{isReturningFromMaintenance ? 'ซ่อมบำรุง' : 'ลางาน'}:
                </span>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: '6px',
                  background: '#dcfce7',
                  color: '#166534',
                  fontWeight: 800
                }}>
                  {durationDays} วัน ({startDate} ถึง {effectiveDate})
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#15803d', marginBottom: '4px' }}>
                  📝 หมายเหตุ (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={statusReason}
                  onChange={e => setStatusReason(e.target.value)}
                  placeholder={isReturningFromMaintenance ? "เช่น ซ่อมเสร็จเรียบร้อย พร้อมใช้งาน" : "เช่น กลับมาปฏิบัติงานตามปกติ"}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #86efac',
                    fontSize: '12.5px',
                    background: '#ffffff',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/* กรณี 2: เข้าสู่สถานะ ซ่อมบำรุง / ลางาน / ระงับใช้ */}
          {/* ═══════════════════════════════════════════════════════ */}
          {!isReturningToActive && (
            <>
              {/* ประเภทการลา (กรณีคนขับลา) */}
              {isEnteringLeave && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      🏷️ ประเภทการลา
                    </label>
                    <select
                      value={leaveType}
                      onChange={e => setLeaveType(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '7px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        background: '#ffffff',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="personal">🟡 ลากิจส่วนตัว</option>
                      <option value="sick">🩺 ลาป่วย</option>
                      <option value="vacation">🏖️ ลาพักร้อนประจำปี</option>
                      <option value="ordination">🙏 ลาบวช / ลาคลอด</option>
                      <option value="unauthorized">⚠️ ขาดงาน / ไม่แจ้งล่วงหน้า</option>
                      <option value="suspended">⚪ พักงาน / รอสอบสวน</option>
                      <option value="other">📝 อื่นๆ</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      💵 การจ่ายค่าจ้าง
                    </label>
                    <select
                      value={withPay}
                      onChange={e => setWithPay(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '7px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        background: '#ffffff',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="unpaid">❌ ไม่จ่ายค่าจ้าง (Unpaid)</option>
                      <option value="paid">✅ จ่ายค่าจ้าง (Paid)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* วันที่เริ่มมีผล */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  📅 วันที่เริ่มมีผล ({isEnteringMaintenance ? 'วันที่เริ่มเข้าซ่อม' : isEnteringLeave ? 'วันที่เริ่มลา' : 'วันที่มีผล'}) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={e => {
                    setEffectiveDate(e.target.value);
                    setStartDate(e.target.value);
                  }}
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13.5px',
                    fontWeight: 600,
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    cursor: 'pointer'
                  }}
                />
              </div>

              {/* วันที่คาดว่าจะเสร็จ / คาดว่าจะกลับมา */}
              {(isEnteringMaintenance || isEnteringLeave) && (
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
                      📅 วันที่คาดว่าจะ{isEnteringMaintenance ? 'ซ่อมเสร็จ' : 'กลับมาทำงาน'}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isIndefinite}
                        onChange={e => setIsIndefinite(e.target.checked)}
                        style={{ accentColor: '#2563eb' }}
                      />
                      <span>{isEnteringMaintenance ? 'ยังไม่มีกำหนดวันเสร็จ' : 'ลาไม่มีกำหนด'}</span>
                    </label>
                  </div>

                  {!isIndefinite && (
                    <input
                      type="date"
                      value={expectedEndDate}
                      onChange={e => setExpectedEndDate(e.target.value)}
                      min={effectiveDate}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        fontWeight: 600,
                        background: '#ffffff',
                        boxSizing: 'border-box'
                      }}
                    />
                  )}
                </div>
              )}

              {/* รายการซ่อม / เหตุผลการลา */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  📝 {isEnteringMaintenance ? 'รายการซ่อม / อาการที่ต้องแก้ไข' : isEnteringLeave ? 'เหตุผลการลา / รายละเอียด' : 'หมายเหตุ / เหตุผล'}
                </label>
                <input
                  type="text"
                  value={statusReason}
                  onChange={e => setStatusReason(e.target.value)}
                  placeholder={isEnteringMaintenance ? "เช่น เข้าอู่เช็กระบบเครื่องยนต์, ซ่อมช่วงล่าง" : isEnteringLeave ? "เช่น ลาพักร้อนกลับต่างจังหวัด, ลาป่วย" : "ระบุหมายเหตุ"}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* คำถามยืนยันการปลดคนขับ/รถ (ถ้ามีประจำอยู่) */}
              {hasAssigned && (
                <div style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderLeft: '4px solid #f59e0b',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  fontSize: '12.5px',
                  color: '#92400e',
                  lineHeight: '1.5'
                }}>
                  <strong>คำถามยืนยัน:</strong> ต้องการ <strong>"สิ้นสุดการปฏิบัติงานและปลด{isTruck ? 'คนขับออก (รถว่าง)' : 'รถประจำออก (ว่าง)'}"</strong> ณ วันที่มีผลนี้ด้วยหรือไม่?
                </div>
              )}
            </>
          )}

        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '16px 24px',
          background: '#f8fafc',
          borderTop: '1px solid #f1f5f9',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {/* ปุ่มหลัก */}
          <button
            type="button"
            onClick={() => handleConfirmAction(true)}
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: isReturningToActive ? '#16a34a' : '#dc2626',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: isReturningToActive ? '0 2px 6px rgba(22, 163, 74, 0.25)' : '0 2px 6px rgba(220, 38, 38, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>
              {isReturningFromMaintenance ? '✅ ยืนยัน (บันทึกซ่อมเสร็จและเปิดใช้งานรถ)' :
               isReturningFromLeave ? '✅ ยืนยัน (สิ้นสุดการลาและกลับมาปฏิบัติงาน)' :
               hasAssigned ? `🛑 ยืนยัน (เปลี่ยนสถานะ + สิ้นสุดการปฏิบัติงานและปลด${isTruck ? 'คนขับ' : 'รถ'})` :
               '🛑 ยืนยันการเปลี่ยนสถานะ'}
            </span>
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: hasAssigned && !isReturningToActive ? '1fr 1fr' : '1fr', gap: '8px' }}>
            {/* ปุ่มรอง: เปลี่ยนเฉพาะสถานะ (ถ้ามีคนขับ/รถประจำ) */}
            {hasAssigned && !isReturningToActive && (
              <button
                type="button"
                onClick={() => handleConfirmAction(false)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
                title="เปลี่ยนแค่สถานะแต่ยังคงบันทึกการดำเนินงานและคนขับ/รถเดิมไว้"
              >
                เปลี่ยนเฉพาะสถานะ (คง{isTruck ? 'คนขับ' : 'รถ'}เดิมไว้)
              </button>
            )}

            {/* ปุ่มยกเลิก */}
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: '#f1f5f9',
                color: '#64748b',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'center'
              }}
            >
              ยกเลิก
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
