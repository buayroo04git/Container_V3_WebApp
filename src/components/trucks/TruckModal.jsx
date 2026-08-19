import React, { useState, useEffect } from 'react';

/**
 * 🚛 Modal Form สำหรับเพิ่ม / แก้ไขข้อมูลรถ
 */
export default function TruckModal({ isOpen, onClose, onSave, truck = null, driverList = [] }) {
  const [formData, setFormData] = useState({
    truck_no: '',
    truck_license: '',
    owner: '',
    brand: '',
    truck_type: 'หัวลาก 10 ล้อ',
    truck_kind: 'กึ่งพ่วง',
    status: 'active',
    assigned_driver_name: '',
    tax_expiry_date: '',
    act_expiry_date: '',
    insurance_expiry_date: '',
    remark: ''
  });
  const [autoStopOperation, setAutoStopOperation] = useState(true);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (truck) {
      setFormData({
        truck_no: truck.truck_no || '',
        truck_license: truck.truck_license && truck.truck_license !== '-' ? truck.truck_license : '',
        owner: truck.owner && truck.owner !== '-' ? truck.owner : '',
        brand: truck.brand && truck.brand !== '-' ? truck.brand : '',
        truck_type: truck.truck_type || 'หัวลาก 10 ล้อ',
        truck_kind: truck.truck_kind || 'กึ่งพ่วง',
        status: truck.status || 'active',
        assigned_driver_name: truck.assigned_driver_name && truck.assigned_driver_name !== '-' ? truck.assigned_driver_name : '',
        tax_expiry_date: truck.tax_expiry_date || '',
        act_expiry_date: truck.act_expiry_date || '',
        insurance_expiry_date: truck.insurance_expiry_date || '',
        remark: truck.remark && truck.remark !== '-' ? truck.remark : ''
      });
      setAutoStopOperation(true);
    } else {
      setFormData({
        truck_no: '',
        truck_license: '',
        owner: '',
        brand: '',
        truck_type: 'หัวลาก 10 ล้อ',
        truck_kind: 'กึ่งพ่วง',
        status: 'active',
        assigned_driver_name: '',
        tax_expiry_date: '',
        act_expiry_date: '',
        insurance_expiry_date: '',
        remark: ''
      });
      setAutoStopOperation(true);
    }
  }, [truck, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.truck_no.trim()) {
      alert('กรุณาระบุเบอร์รถ');
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...formData, autoStopOperation, effectiveDate }, truck?.id);
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
            <span style={{ fontSize: '22px' }}>🚛</span>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
              {truck ? `แก้ไขข้อมูลรถ (เบอร์ ${truck.truck_no})` : 'เพิ่มข้อมูลรถใหม่'}
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
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '14px' }}>
            {/* เบอร์รถ */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                เบอร์รถ <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.truck_no}
                onChange={e => setFormData({ ...formData, truck_no: e.target.value })}
                placeholder="เช่น 501, 502"
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  color: '#0f172a',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* ทะเบียนรถ */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                ป้ายทะเบียน
              </label>
              <input
                type="text"
                value={formData.truck_license}
                onChange={e => setFormData({ ...formData, truck_license: e.target.value })}
                placeholder="เช่น 70-1234 ชบ"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13.5px',
                  color: '#0f172a',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* เจ้าของรถ */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                เจ้าของรถ / สังกัด
              </label>
              <input
                type="text"
                value={formData.owner}
                onChange={e => setFormData({ ...formData, owner: e.target.value })}
                placeholder="เช่น ทีชอว์, บจก.แก้วมณี"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13.5px',
                  color: '#0f172a',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
            {/* ยี่ห้อ */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                ยี่ห้อรถ
              </label>
              <input
                type="text"
                value={formData.brand}
                onChange={e => setFormData({ ...formData, brand: e.target.value })}
                placeholder="HINO, ISUZU, SCANIA"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13.5px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* ประเภทรถ */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                ประเภทรถ
              </label>
              <select
                value={formData.truck_type}
                onChange={e => setFormData({ ...formData, truck_type: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13.5px',
                  background: '#fff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="หัวลาก 10 ล้อ">หัวลาก 10 ล้อ</option>
                <option value="หัวลาก 6 ล้อ">หัวลาก 6 ล้อ</option>
                <option value="หางพ่วง 3 เพลา">หางพ่วง 3 เพลา</option>
                <option value="หางพ่วง 2 เพลา">หางพ่วง 2 เพลา</option>
                <option value="รถบรรทุก 10 ล้อ">รถบรรทุก 10 ล้อ</option>
                <option value="รถบรรทุก 6 ล้อ">รถบรรทุก 6 ล้อ</option>
              </select>
            </div>

            {/* ชนิดตัวถัง */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                ชนิดตัวถัง
              </label>
              <select
                value={formData.truck_kind}
                onChange={e => setFormData({ ...formData, truck_kind: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13.5px',
                  background: '#fff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="กึ่งพ่วง">กึ่งพ่วง</option>
                <option value="ก้างปลา">ก้างปลา</option>
                <option value="พื้นเรียบ">พื้นเรียบ</option>
                <option value="ตู้แห้ง">ตู้แห้ง</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* สถานะ */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                สถานะรถ
              </label>
              <select
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value })}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  background: '#fff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="active">🟢 พร้อมใช้งาน (Active)</option>
                <option value="maintenance">🔧 ซ่อมบำรุง (Maintenance)</option>
                <option value="inactive">⚪ ระงับใช้งาน (Inactive)</option>
              </select>
            </div>

            {/* คนขับประจำรถ (Read-Only: ขับเคลื่อนจากเมนูการดำเนินงานรถ) */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                คนขับประจำรถปัจจุบัน
              </label>
              <div style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                fontSize: '13.5px',
                fontWeight: 600,
                color: formData.assigned_driver_name && formData.assigned_driver_name !== '-' ? '#1d4ed8' : '#94a3b8',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                {formData.assigned_driver_name && formData.assigned_driver_name !== '-' ? (
                  <span>👤 {formData.assigned_driver_name}</span>
                ) : (
                  <span>⚪ ไม่มีคนขับประจำ (รถว่าง)</span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                💡 มอบหมายหรือเปลี่ยนคนขับได้ที่ <strong>เมนูการดำเนินงานรถ</strong>
              </div>
            </div>
          </div>

          {/* ⚠️ Prompt if changing truck status to maintenance/inactive while having an assigned driver */}
          {(formData.status === 'maintenance' || formData.status === 'inactive') && formData.assigned_driver_name && formData.assigned_driver_name !== '-' && (
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
                ⚠️ รถคันนี้ปัจจุบันมีคุณ "{formData.assigned_driver_name}" กำลังปฏิบัติงานอยู่
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600, color: '#78350f' }}>
                <input
                  type="checkbox"
                  checked={autoStopOperation}
                  onChange={e => setAutoStopOperation(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#ef4444' }}
                />
                <span>ต้องการสิ้นสุดการปฏิบัติงานและปลดคนขับออก (รถว่าง) ด้วย</span>
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

          {/* เอกสาร / วันหมดอายุ */}
          <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '10px' }}>
              📅 วันหมดอายุเอกสารประจำรถ
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                  ภาษีประจำปี
                </label>
                <input
                  type="date"
                  value={formData.tax_expiry_date}
                  onChange={e => setFormData({ ...formData, tax_expiry_date: e.target.value })}
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
                  พ.ร.บ.
                </label>
                <input
                  type="date"
                  value={formData.act_expiry_date}
                  onChange={e => setFormData({ ...formData, act_expiry_date: e.target.value })}
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
                  ประกันภัย
                </label>
                <input
                  type="date"
                  value={formData.insurance_expiry_date}
                  onChange={e => setFormData({ ...formData, insurance_expiry_date: e.target.value })}
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

          {/* หมายเหตุ */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              หมายเหตุ
            </label>
            <textarea
              value={formData.remark}
              onChange={e => setFormData({ ...formData, remark: e.target.value })}
              rows={2}
              placeholder="ข้อมูลเพิ่มเติม เช่น เบอร์โครง, ประกันภัยชั้น 1..."
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
