import React, { useState, useEffect } from 'react';

/**
 * 👤 Modal Form สำหรับเพิ่ม / แก้ไขข้อมูลคนขับ
 */
export default function DriverModal({ isOpen, onClose, onSave, driver = null, truckList = [] }) {
  const [formData, setFormData] = useState({
    driver_name: '',
    phone: '',
    id_card: '',
    license_no: '',
    license_type: 'ท.4',
    license_expiry_date: '',
    assigned_truck_no: '',
    status: 'active',
    start_date: '',
    emergency_contact: '',
    remark: ''
  });
  const [autoStopOperation, setAutoStopOperation] = useState(true);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (driver) {
      setFormData({
        driver_name: driver.driver_name || '',
        phone: driver.phone && driver.phone !== '-' ? driver.phone : '',
        id_card: driver.id_card && driver.id_card !== '-' ? driver.id_card : '',
        license_no: driver.license_no && driver.license_no !== '-' ? driver.license_no : '',
        license_type: driver.license_type || 'ท.4',
        license_expiry_date: driver.license_expiry_date || '',
        assigned_truck_no: driver.assigned_truck_no && driver.assigned_truck_no !== '-' ? driver.assigned_truck_no : '',
        status: driver.status || 'active',
        start_date: driver.start_date || '',
        emergency_contact: driver.emergency_contact && driver.emergency_contact !== '-' ? driver.emergency_contact : '',
        remark: driver.remark && driver.remark !== '-' ? driver.remark : ''
      });
      setAutoStopOperation(true);
      setEffectiveDate(new Date().toISOString().slice(0, 10));
    } else {
      setFormData({
        driver_name: '',
        phone: '',
        id_card: '',
        license_no: '',
        license_type: 'ท.4',
        license_expiry_date: '',
        assigned_truck_no: '',
        status: 'active',
        start_date: '',
        emergency_contact: '',
        remark: ''
      });
      setAutoStopOperation(true);
      setEffectiveDate(new Date().toISOString().slice(0, 10));
    }
  }, [driver, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.driver_name.trim()) {
      alert('กรุณาระบุชื่อ-นามสกุลคนขับ');
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...formData, autoStopOperation, effectiveDate }, driver?.id);
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
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '620px',
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
            <span style={{ fontSize: '22px' }}>👤</span>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
              {driver ? `แก้ไขข้อมูลคนขับ (${driver.driver_name})` : 'เพิ่มข้อมูลคนขับใหม่'}
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
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* ชื่อ-นามสกุล */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                ชื่อ-นามสกุล <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.driver_name}
                onChange={e => setFormData({ ...formData, driver_name: e.target.value })}
                placeholder="เช่น สมชาย ใจดี"
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  color: '#0f172a',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* เบอร์โทรศัพท์ */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                เบอร์โทรศัพท์
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                placeholder="เช่น 081-234-5678"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13.5px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* เลขบัตรประชาชน */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                เลขบัตรประชาชน (13 หลัก)
              </label>
              <input
                type="text"
                maxLength={13}
                value={formData.id_card}
                onChange={e => setFormData({ ...formData, id_card: e.target.value })}
                placeholder="1xxxxxxxxxxxx"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13.5px',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* เบอร์รถประจำ (Read-Only: ขับเคลื่อนจากเมนูการดำเนินงานรถ) */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                รถประจำปัจจุบัน
              </label>
              <div style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                fontSize: '13.5px',
                fontWeight: 700,
                fontFamily: 'monospace',
                color: formData.assigned_truck_no && formData.assigned_truck_no !== '-' && formData.status === 'active' ? '#1d4ed8' : '#94a3b8',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                {formData.assigned_truck_no && formData.assigned_truck_no !== '-' && formData.status === 'active' ? (
                  <span>🚛 รถ {formData.assigned_truck_no}</span>
                ) : (
                  <span>⚪ ไม่มีรถประจำ (ว่าง)</span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                💡 มอบหมายหรือสลับรถได้ที่ <strong>เมนูการดำเนินงานรถ</strong>
              </div>
            </div>
          </div>

          {/* ⚠️ Prompt if changing driver status to leave/inactive while having an assigned truck */}
          {(formData.status === 'leave' || formData.status === 'inactive') && driver?.assigned_truck_no && driver.assigned_truck_no !== '-' && (
            <div style={{
              padding: '14px 16px',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderLeft: '4px solid #f59e0b',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#92400e' }}>
                ⚠️ คุณ "{driver.driver_name}" ปัจจุบันมีรถประจำคือ รถเบอร์ {driver.assigned_truck_no}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600, color: '#78350f' }}>
                <input
                  type="checkbox"
                  checked={autoStopOperation}
                  onChange={e => setAutoStopOperation(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#ef4444' }}
                />
                <span>ต้องการสิ้นสุดการปฏิบัติงานและปลดรถประจำออก (ว่าง) ด้วย</span>
              </label>
              {autoStopOperation && (
                <div style={{ marginTop: '2px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>
                    📅 วันที่มีผล (Effective Date)
                  </label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={e => setEffectiveDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      fontWeight: 600,
                      background: '#ffffff',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* ใบขับขี่ */}
          <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '10px' }}>
              🪪 ข้อมูลใบอนุญาตขับขี่
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                  ประเภทใบขับขี่
                </label>
                <select
                  value={formData.license_type}
                  onChange={e => setFormData({ ...formData, license_type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12.5px',
                    background: '#fff',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="ท.4">ท.4 (ทุกประเภท)</option>
                  <option value="ท.3">ท.3 (สาธารณะ)</option>
                  <option value="ท.2">ท.2 (ส่วนบุคคล)</option>
                  <option value="บ.2">บ.2</option>
                  <option value="ส่วนบุคคล">ส่วนบุคคล</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                  เลขที่ใบขับขี่
                </label>
                <input
                  type="text"
                  value={formData.license_no}
                  onChange={e => setFormData({ ...formData, license_no: e.target.value })}
                  placeholder="เลขที่ใบขับขี่"
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12.5px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                  วันหมดอายุใบขับขี่
                </label>
                <input
                  type="date"
                  value={formData.license_expiry_date}
                  onChange={e => setFormData({ ...formData, license_expiry_date: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12.5px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {/* สถานะ */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                สถานะการทำงาน
              </label>
              <select
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#fff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="active">🟢 ปฏิบัติงาน (Active)</option>
                <option value="leave">🟡 ลางาน (On Leave)</option>
                <option value="inactive">⚪ พักงาน/ลาออก (Inactive)</option>
              </select>
            </div>

            {/* วันเริ่มงาน */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                วันเริ่มงาน
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12.5px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* บุคคลติดต่อฉุกเฉิน */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              ติดต่อฉุกเฉิน (ชื่อ + ความสัมพันธ์ + เบอร์โทร)
            </label>
            <input
              type="text"
              value={formData.emergency_contact}
              onChange={e => setFormData({ ...formData, emergency_contact: e.target.value })}
              placeholder="เช่น คุณสมศรี (ภรรยา) 089-xxx-xxxx"
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

          {/* หมายเหตุ */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              หมายเหตุ
            </label>
            <textarea
              value={formData.remark}
              onChange={e => setFormData({ ...formData, remark: e.target.value })}
              rows={2}
              placeholder="ข้อมูลเพิ่มเติม เช่น ความชำนาญเส้นทาง, ประวัติการฝึกอบรม..."
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: '13.5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '9px 22px',
                borderRadius: '8px',
                border: 'none',
                background: saving ? '#94a3b8' : '#2563eb',
                color: '#ffffff',
                fontSize: '13.5px',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
              }}
            >
              {saving ? '⏳ กำลังบันทึก...' : '💾 บันทึกข้อมูล'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
