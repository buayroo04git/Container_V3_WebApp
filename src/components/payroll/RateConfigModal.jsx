import React, { useState, useEffect } from 'react';

/**
 * ⚙️ Modal Form สำหรับสร้างและแก้ไขช่วงเวลาและเรทราคาค่าตอบแทนคนขับ
 */
export default function RateConfigModal({
  isOpen,
  onClose,
  onSave,
  config = null,
  driverList = []
}) {
  const [formData, setFormData] = useState({
    name: '',
    driver_name: 'ALL',
    start_date: new Date().toISOString().slice(0, 10),
    isOngoing: true,
    end_date: '',
    rate_20: 100,
    rate_40: 100,
    rate_45: 100,
    rate_default: 100,
    is_active: true,
    remark: ''
  });

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (config) {
      setFormData({
        name: config.name || '',
        driver_name: config.driver_name || 'ALL',
        start_date: config.start_date || new Date().toISOString().slice(0, 10),
        isOngoing: !config.end_date,
        end_date: config.end_date || '',
        rate_20: config.rate_20 !== undefined ? config.rate_20 : 100,
        rate_40: config.rate_40 !== undefined ? config.rate_40 : 100,
        rate_45: config.rate_45 !== undefined ? config.rate_45 : 100,
        rate_default: config.rate_default !== undefined ? config.rate_default : 100,
        is_active: config.is_active !== undefined ? config.is_active : true,
        remark: config.remark && config.remark !== '-' ? config.remark : ''
      });
    } else {
      setFormData({
        name: 'เรทค่ารอบมาตรฐาน ' + new Date().getFullYear(),
        driver_name: 'ALL',
        start_date: new Date().toISOString().slice(0, 10),
        isOngoing: true,
        end_date: '',
        rate_20: 100,
        rate_40: 100,
        rate_45: 100,
        rate_default: 100,
        is_active: true,
        remark: ''
      });
    }
    setErrorMsg('');
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.name?.trim()) {
      setErrorMsg('กรุณากรอกชื่อช่วงเรทราคา');
      return;
    }

    if (!formData.start_date) {
      setErrorMsg('กรุณาระบุวันที่เริ่มต้นที่มีผล');
      return;
    }

    if (!formData.isOngoing && formData.end_date) {
      if (formData.start_date > formData.end_date) {
        setErrorMsg('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด');
        return;
      }
    }

    if (Number(formData.rate_20) < 0 || Number(formData.rate_40) < 0) {
      setErrorMsg('อัตราราคาต้องไม่ติดลบ');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        id: config?.id || undefined,
        name: formData.name.trim(),
        driver_name: formData.driver_name,
        start_date: formData.start_date,
        end_date: formData.isOngoing ? null : (formData.end_date || null),
        rate_20: Number(formData.rate_20),
        rate_40: Number(formData.rate_40),
        rate_45: Number(formData.rate_45),
        rate_default: Number(formData.rate_default || formData.rate_20),
        is_active: formData.is_active,
        remark: formData.remark?.trim() || '-'
      };

      await onSave(payload);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSaving(false);
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
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '540px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh',
        border: '1px solid #e2e8f0'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px'
            }}>
              ⚙️
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 700, color: '#0f172a' }}>
                {config ? 'แก้ไขช่วงเวลาและเรทราคา' : 'เพิ่มช่วงเวลาและกำหนดราคาค่ารอบ'}
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                กำหนดช่วงเวลาที่มีผลบังคับใช้และราคาแยกตามขนาดตู้
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '18px',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: '4px 8px',
              borderRadius: '6px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {errorMsg && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '12.5px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>🚫</span>
              <span>{errorMsg}</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* ชื่อช่วงเรท */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                ชื่อช่วงเรทราคา <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="เช่น เรทมาตรฐานปี 2026, เรทปรับใหม่ ส.ค. 2026"
                required
                style={{
                  width: '100%',
                  height: '38px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* ผู้มีผลบังคับใช้ (คนขับทุกคน หรือเฉพาะคน) */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                มีผลบังคับใช้กับคนขับ
              </label>
              <select
                value={formData.driver_name}
                onChange={e => setFormData({ ...formData, driver_name: e.target.value })}
                style={{
                  width: '100%',
                  height: '38px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  outline: 'none',
                  background: '#ffffff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="ALL">🌐 พนักงานขับรถทุกคน (มาตรฐานทั่วไป)</option>
                {driverList.filter(d => d.driver_name && d.driver_name !== '-').map(d => (
                  <option key={d.driver_name} value={d.driver_name}>
                    👤 {d.driver_name} {d.assigned_truck_no ? `(รถ ${d.assigned_truck_no})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* ช่วงเวลาที่มีผลบังคับใช้ */}
            <div style={{
              background: '#f8fafc',
              padding: '14px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#1e293b' }}>
                  🗓️ ช่วงเวลาที่มีผล (เทียบกับวันที่ในใบวางบิล Master DB)
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                    วันที่เริ่มต้น <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      height: '36px',
                      padding: '0 10px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12.5px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                    วันที่สิ้นสุด
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={e => setFormData({ ...formData, end_date: e.target.value, isOngoing: false })}
                    disabled={formData.isOngoing}
                    style={{
                      width: '100%',
                      height: '36px',
                      padding: '0 10px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12.5px',
                      background: formData.isOngoing ? '#f1f5f9' : '#ffffff',
                      color: formData.isOngoing ? '#94a3b8' : '#0f172a',
                      cursor: formData.isOngoing ? 'not-allowed' : 'text',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <label style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '10px',
                fontSize: '12px',
                color: '#334155',
                cursor: 'pointer',
                userSelect: 'none'
              }}>
                <input
                  type="checkbox"
                  checked={formData.isOngoing}
                  onChange={e => {
                    const checked = e.target.checked;
                    setFormData({
                      ...formData,
                      isOngoing: checked,
                      end_date: checked ? '' : (formData.end_date || formData.start_date)
                    });
                  }}
                  style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: formData.isOngoing ? 600 : 400, color: formData.isOngoing ? '#2563eb' : '#475569' }}>
                  ✓ มีผลต่อเนื่องถึงปัจจุบัน (ไม่มีกำหนดวันสิ้นสุด)
                </span>
              </label>
            </div>

            {/* อัตราค่ารอบแยกตามขนาดตู้ (Size & Price Table) */}
            <div style={{
              background: '#f0fdf4',
              padding: '14px',
              borderRadius: '10px',
              border: '1px solid #bbf7d0'
            }}>
              <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#166534', marginBottom: '10px' }}>
                💵 อัตราค่ารอบตามขนาดตู้ (บาท / ตู้)
              </span>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {/* Size 20 */}
                <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#15803d', marginBottom: '4px' }}>
                    📦 ตู้ Size 20
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={formData.rate_20}
                      onChange={e => setFormData({ ...formData, rate_20: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        height: '34px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        fontWeight: 700,
                        textAlign: 'right',
                        boxSizing: 'border-box'
                      }}
                    />
                    <span style={{ fontSize: '11px', color: '#64748b' }}>฿</span>
                  </div>
                </div>

                {/* Size 40 */}
                <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#15803d', marginBottom: '4px' }}>
                    📦 ตู้ Size 40 ฟุต
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={formData.rate_40}
                      onChange={e => setFormData({ ...formData, rate_40: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        height: '34px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        fontWeight: 700,
                        textAlign: 'right',
                        boxSizing: 'border-box'
                      }}
                    />
                    <span style={{ fontSize: '11px', color: '#64748b' }}>฿</span>
                  </div>
                </div>

                {/* Size 45 / Other */}
                <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#15803d', marginBottom: '4px' }}>
                    📦 ตู้ Size 45 / อื่นๆ
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={formData.rate_45}
                      onChange={e => setFormData({ ...formData, rate_45: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        height: '34px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        fontWeight: 700,
                        textAlign: 'right',
                        boxSizing: 'border-box'
                      }}
                    />
                    <span style={{ fontSize: '11px', color: '#64748b' }}>฿</span>
                  </div>
                </div>
              </div>
            </div>

            {/* หมายเหตุ */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                หมายเหตุ / เหตุผลการกำหนดเรท
              </label>
              <input
                type="text"
                value={formData.remark}
                onChange={e => setFormData({ ...formData, remark: e.target.value })}
                placeholder="เช่น เรทพิเศษช่วงเทศกาล, ปรับตามต้นทุน"
                style={{
                  width: '100%',
                  height: '36px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12.5px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* สถานะเปิดใช้งาน */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="is_active_check"
                checked={formData.is_active}
                onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="is_active_check" style={{ fontSize: '12.5px', color: '#334155', cursor: 'pointer', fontWeight: 600 }}>
                เปิดใช้งานเรทนี้ (Active)
              </label>
            </div>
          </div>

          {/* Modal Footer */}
          <div style={{
            marginTop: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                height: '38px',
                padding: '0 16px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: '13px',
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
                height: '38px',
                padding: '0 20px',
                borderRadius: '8px',
                border: 'none',
                background: saving ? '#94a3b8' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
              }}
            >
              {saving ? 'กำลังบันทึก...' : (config ? 'บันทึกการแก้ไข' : 'สร้างช่วงเรทราคา')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
