import React, { useState, useEffect, useMemo } from 'react';
import { fetchOperations, checkOperationDateOverlap, getPreviousDay, getAllOperationsFromStorage } from '../../services/operationsService';

/**
 * 🚛 Modal Form สำหรับเพิ่ม / แก้ไข บันทึกการดำเนินงานรถ & มอบหมายคนขับ
 */
export default function OperationModal({
  isOpen,
  onClose,
  onSave,
  operation = null,
  truckList = [],
  driverList = []
}) {
  const [formData, setFormData] = useState({
    truck_no: '',
    driver_name: '',
    operation_type: 'primary',
    start_date: new Date().toISOString().slice(0, 10),
    isOngoing: true,
    end_date: '',
    remark: ''
  });
  const [autoActivateDriver, setAutoActivateDriver] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allOperations, setAllOperations] = useState([]);

  // โหลดรายการการดำเนินงานทั้งหมดเพื่อตรวจเช็กการทับซ้อนของช่วงเวลา
  useEffect(() => {
    if (isOpen) {
      fetchOperations().then(res => {
        if (res?.data) {
          setAllOperations(res.data);
        } else {
          setAllOperations(getAllOperationsFromStorage());
        }
      }).catch(() => {
        setAllOperations(getAllOperationsFromStorage());
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (operation) {
      setFormData({
        truck_no: operation.truck_no || '',
        driver_name: operation.driver_name || '',
        operation_type: operation.operation_type || 'primary',
        start_date: operation.start_date || new Date().toISOString().slice(0, 10),
        isOngoing: operation.isOngoing !== undefined ? operation.isOngoing : (!operation.end_date || operation.status === 'active'),
        end_date: operation.end_date || '',
        remark: operation.remark && operation.remark !== '-' ? operation.remark : ''
      });
    } else {
      setFormData({
        truck_no: '',
        driver_name: '',
        operation_type: 'primary',
        start_date: new Date().toISOString().slice(0, 10),
        isOngoing: true,
        end_date: '',
        remark: ''
      });
    }
  }, [operation, isOpen]);

  // ข้อมูลรถที่ถูกเลือก
  const selectedTruck = useMemo(() => {
    if (!formData.truck_no) return null;
    return truckList.find(t => String(t.truck_no).trim() === String(formData.truck_no).trim()) || null;
  }, [formData.truck_no, truckList]);

  // ข้อมูลคนขับที่ถูกเลือก
  const selectedDriver = useMemo(() => {
    if (!formData.driver_name) return null;
    return driverList.find(d => String(d.driver_name).trim().toLowerCase() === String(formData.driver_name).trim().toLowerCase()) || null;
  }, [formData.driver_name, driverList]);

  // 🛡️ ตรวจสอบความทับซ้อนของช่วงเวลากับประวัติเดิมในระบบแบบ Real-time
  const dateConflicts = useMemo(() => {
    if (!formData.truck_no || !formData.start_date || allOperations.length === 0) {
      return [];
    }
    return checkOperationDateOverlap(
      allOperations,
      formData.truck_no,
      formData.driver_name,
      formData.start_date,
      formData.end_date,
      formData.isOngoing,
      operation?.id || null
    );
  }, [allOperations, formData.truck_no, formData.driver_name, formData.start_date, formData.end_date, formData.isOngoing, operation?.id]);

  // ฟังก์ชันแปลงวันที่แสดงผล
  const formatDateDisplay = (dateStr) => {
    if (!dateStr || dateStr === '-') return 'ปัจจุบัน';
    try {
      const [y, m, d] = dateStr.split('-');
      if (y && m && d) return `${d}/${m}/${y}`;
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.truck_no.trim()) {
      alert('กรุณาเลือกรถ');
      return;
    }
    if (!formData.driver_name.trim()) {
      alert('กรุณาเลือกคนขับ');
      return;
    }
    if (!formData.start_date) {
      alert('กรุณาระบุวันที่เริ่มดำเนินงาน');
      return;
    }
    if (!formData.isOngoing && formData.end_date && formData.end_date < formData.start_date) {
      alert('วันที่สิ้นสุดต้องไม่มาก่อนวันที่เริ่มต้น');
      return;
    }
    if (dateConflicts.length > 0) {
      alert('ไม่สามารถบันทึกได้: ตรวจพบช่วงเวลาทับซ้อนกับประวัติเดิมในระบบ กรุณาเลือกวันที่ใหม่');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        truck_no: formData.truck_no.trim(),
        driver_name: formData.driver_name.trim(),
        operation_type: formData.operation_type,
        start_date: formData.start_date,
        end_date: formData.isOngoing ? null : formData.end_date,
        rate_per_trip: 0,
        remark: formData.remark.trim() || '-',
        autoActivateDriver: selectedDriver && selectedDriver.status !== 'active' ? autoActivateDriver : false
      };
      await onSave(payload, operation?.id);
      onClose();
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSaving(false);
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
        maxWidth: '580px',
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
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>🚚</span>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
              {operation?.id ? 'แก้ไขบันทึกการดำเนินงานรถ' : 'เพิ่มการดำเนินงานรถ (มอบหมายคนขับใหม่)'}
            </h3>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* แถวเลือกรถ & คนขับ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* เบอร์รถ */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                เบอร์รถ <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={formData.truck_no}
                onChange={e => setFormData({ ...formData, truck_no: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  background: '#ffffff',
                  boxSizing: 'border-box',
                  cursor: 'pointer'
                }}
              >
                <option value="">-- เลือกรถ --</option>
                {truckList.map(t => (
                  <option key={t.id || t.truck_no} value={t.truck_no}>
                    รถ {t.truck_no} {t.assigned_driver_name && t.assigned_driver_name !== '-' ? `(คนขับ: ${t.assigned_driver_name})` : ''}
                  </option>
                ))}
              </select>

              {/* ข้อมูลรถที่เลือก */}
              {selectedTruck && (
                <div style={{
                  marginTop: '8px',
                  padding: '9px 11px',
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  color: '#0369a1',
                  lineHeight: '1.55'
                }}>
                  <div><strong>ทะเบียน:</strong> {selectedTruck.truck_license || '-'}</div>
                  <div><strong>เจ้าของ/สังกัด:</strong> {selectedTruck.owner || '-'}</div>
                  <div><strong>ประเภท/ยี่ห้อ:</strong> {selectedTruck.truck_type || '-'} {selectedTruck.brand && selectedTruck.brand !== '-' ? `(${selectedTruck.brand})` : ''}</div>
                </div>
              )}

              {/* 🔄 แจ้งเตือนกรณีรถคันนี้มีคนขับเดิมอยู่แล้ว */}
              {selectedTruck && selectedTruck.assigned_driver_name && selectedTruck.assigned_driver_name !== '-' && selectedTruck.assigned_driver_name !== formData.driver_name && (
                <div style={{
                  marginTop: '6px',
                  padding: '7px 9px',
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#92400e',
                  lineHeight: '1.4'
                }}>
                  🔄 คนขับเดิม: <strong>{selectedTruck.assigned_driver_name}</strong> (ระบบจะสิ้นสุดงวดเดิมในวันที่ <strong>{formatDateDisplay(getPreviousDay(formData.start_date))}</strong> ให้อัตโนมัติ)
                </div>
              )}
            </div>

            {/* คนขับ */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                พนักงานขับรถ <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={formData.driver_name}
                onChange={e => setFormData({ ...formData, driver_name: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  background: '#ffffff',
                  boxSizing: 'border-box',
                  cursor: 'pointer'
                }}
              >
                <option value="">-- เลือกคนขับ --</option>
                {driverList.map(d => (
                  <option key={d.id || d.driver_name} value={d.driver_name}>
                    {d.driver_name} {d.assigned_truck_no && d.assigned_truck_no !== '-' ? `(ประจำรถ ${d.assigned_truck_no})` : ''} {d.status === 'leave' ? '(🟡 ลางาน)' : (d.status === 'inactive' ? '(⚪ พักงาน/ออก)' : '')}
                  </option>
                ))}
              </select>

              {/* ข้อมูลคนขับที่เลือก */}
              {selectedDriver && (
                <div style={{
                  marginTop: '8px',
                  padding: '9px 11px',
                  background: selectedDriver.status === 'active' ? '#f0fdf4' : '#fffbeb',
                  border: selectedDriver.status === 'active' ? '1px solid #bbf7d0' : '1px solid #fde68a',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  color: selectedDriver.status === 'active' ? '#15803d' : '#92400e',
                  lineHeight: '1.55'
                }}>
                  <div><strong>เบอร์โทร:</strong> {selectedDriver.phone || '-'}</div>
                  <div><strong>ใบขับขี่:</strong> {selectedDriver.license_type || '-'} {selectedDriver.license_no && selectedDriver.license_no !== '-' ? `(${selectedDriver.license_no})` : ''}</div>
                  <div><strong>สถานะพนักงาน:</strong> {selectedDriver.status === 'active' ? '🟢 ปกติ (Active)' : (selectedDriver.status === 'leave' ? '🟡 ลางาน (On Leave)' : '⚪ พักงาน/ออก (Inactive)')}</div>
                </div>
              )}

              {/* 🔄 แจ้งเตือนกรณีคนขับท่านนี้ประจำรถคันอื่นอยู่แล้ว */}
              {selectedDriver && selectedDriver.assigned_truck_no && selectedDriver.assigned_truck_no !== '-' && String(selectedDriver.assigned_truck_no).trim() !== String(formData.truck_no).trim() && (
                <div style={{
                  marginTop: '6px',
                  padding: '7px 9px',
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#92400e',
                  lineHeight: '1.4'
                }}>
                  🔄 รถประจำเดิม: <strong>รถ {selectedDriver.assigned_truck_no}</strong> (ระบบจะสิ้นสุดงวดเดิมในวันที่ <strong>{formatDateDisplay(getPreviousDay(formData.start_date))}</strong> ให้อัตโนมัติ)
                </div>
              )}

              {/* ⚠️ Prompt if driver is not active */}
              {selectedDriver && selectedDriver.status !== 'active' && (
                <div style={{
                  marginTop: '8px',
                  padding: '10px 12px',
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  borderLeft: '4px solid #f59e0b',
                  borderRadius: '8px'
                }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>
                    ⚠️ คนขับท่านนี้ปัจจุบันอยู่ในสถานะ: {selectedDriver.status === 'leave' ? '🟡 ลางาน' : '⚪ พักงาน/ลาออก'}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#78350f' }}>
                    <input
                      type="checkbox"
                      checked={autoActivateDriver}
                      onChange={e => setAutoActivateDriver(e.target.checked)}
                      style={{ width: '15px', height: '15px', accentColor: '#16a34a' }}
                    />
                    <span>เปลี่ยนสถานะกลับเป็น "🟢 ปฏิบัติงาน (Active)" อัตโนมัติ</span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* ประเภทการดำเนินงาน */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              ประเภทการดำเนินงาน
            </label>
            <select
              value={formData.operation_type}
              onChange={e => setFormData({ ...formData, operation_type: e.target.value })}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                background: '#fff',
                boxSizing: 'border-box',
                cursor: 'pointer'
              }}
            >
              <option value="primary">🟢 คนขับประจำ (Primary)</option>
              <option value="substitute">🟡 ขับแทนชั่วคราว (Substitute)</option>
              <option value="contract">🟣 จ๊อบพิเศษ / เหมาเที่ยว (Contract)</option>
            </select>
          </div>

          {/* ช่วงเวลาการขับขี่ */}
          <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '12px' }}>
              📅 กำหนดช่วงเวลาการดำเนินงาน
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                  วันที่เริ่มขับ <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '7px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: '#fff',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748b' }}>
                    วันที่สิ้นสุด
                  </label>
                  <label style={{ fontSize: '11.5px', color: '#2563eb', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.isOngoing}
                      onChange={e => setFormData({ ...formData, isOngoing: e.target.checked, end_date: e.target.checked ? '' : formData.end_date })}
                    />
                    กำลังปฏิบัติงานอยู่ (Ongoing)
                  </label>
                </div>

                <input
                  type="date"
                  value={formData.end_date}
                  disabled={formData.isOngoing}
                  onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                  placeholder={formData.isOngoing ? 'ปัจจุบัน' : ''}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '7px',
                    border: formData.isOngoing ? '1px dashed #cbd5e1' : '1px solid #cbd5e1',
                    background: formData.isOngoing ? '#f1f5f9' : '#fff',
                    color: formData.isOngoing ? '#94a3b8' : '#0f172a',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {formData.isOngoing && (
              <div style={{ fontSize: '11.5px', color: '#16a34a', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span>💡</span>
                <span>การดำเนินงานนี้จะนับต่อเนื่องไปเรื่อยๆ จนกว่าจะมีการเปลี่ยนคนขับใหม่ หรือเข้ามากำหนดวันสิ้นสุด</span>
              </div>
            )}

            {/* 🔴 Date Conflict / Overlap Error Banner */}
            {dateConflicts.length > 0 && (
              <div style={{
                marginTop: '12px',
                padding: '12px 14px',
                background: '#fef2f2',
                border: '1.5px solid #fecaca',
                borderLeft: '5px solid #ef4444',
                borderRadius: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '16px' }}>🚫</span>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#991b1b' }}>
                    ไม่สามารถบันทึกได้: ตรวจพบช่วงเวลาทับซ้อนกับประวัติเดิม
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#b91c1c', lineHeight: '1.5' }}>
                  {dateConflicts.map((c, i) => (
                    <div key={c.id || i} style={{ marginBottom: '4px' }}>
                      • <strong>{c.reason}</strong> (ช่วงวันที่ {formatDateDisplay(c.start_date)} ถึง {formatDateDisplay(c.end_date)})
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#7f1d1d', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #fca5a5' }}>
                  💡 กรุณาเลือกวันที่เริ่มต้น/สิ้นสุดใหม่ที่ไม่ทับซ้อนกับช่วงเวลาดังกล่าว หรือเข้าไปปรับแก้วันที่ในประวัติเดิมก่อน
                </div>
              </div>
            )}
          </div>

          {/* หมายเหตุ */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              หมายเหตุ / บันทึกเพิ่มเติม
            </label>
            <input
              type="text"
              value={formData.remark}
              onChange={e => setFormData({ ...formData, remark: e.target.value })}
              placeholder="เช่น ขับแทนช่วงวันหยุด, รับเข้าใหม่, ประจำสายชลบุรี"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Footer Actions */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '8px',
            paddingTop: '16px',
            borderTop: '1px solid #f1f5f9'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || dateConflicts.length > 0}
              title={dateConflicts.length > 0 ? 'กรุณาแก้ไขช่วงเวลาที่ทับซ้อนก่อนบันทึก' : ''}
              style={{
                padding: '9px 24px',
                borderRadius: '8px',
                border: 'none',
                background: dateConflicts.length > 0 ? '#94a3b8' : (saving ? '#93c5fd' : '#2563eb'),
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: (saving || dateConflicts.length > 0) ? 'not-allowed' : 'pointer',
                boxShadow: dateConflicts.length > 0 ? 'none' : '0 2px 6px rgba(37, 99, 235, 0.25)',
                transition: 'all 0.15s ease'
              }}
            >
              {saving ? 'กำลังบันทึก...' : (dateConflicts.length > 0 ? '⛔ ช่วงเวลาทับซ้อน' : (operation ? 'บันทึกการแก้ไข' : 'บันทึกการดำเนินงาน'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
