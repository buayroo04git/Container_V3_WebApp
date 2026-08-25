import React, { useState, useEffect } from 'react';
import { driverPayrollService } from '../../services/driverPayrollService';

/**
 * 💵 Modal สำหรับกำหนดฐานเงินเดือน & รูปแบบการหักประกันสังคม/ภาษี 3% ของคนขับ
 */
export default function DriverSalaryConfigModal({
  isOpen,
  onClose,
  onSave,
  driverRecord = null,
  driverList = []
}) {
  const [formData, setFormData] = useState({
    driver_name: '',
    base_salary: '0',
    tax_profile: 'social_security',
    social_security_amount: '875',
    remark: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const globalTax = driverPayrollService.fetchGlobalTaxConfig ? driverPayrollService.fetchGlobalTaxConfig() : { default_sso_amount: 875 };
    const defaultSso = String(globalTax.default_sso_amount || 875);

    if (driverRecord) {
      const rawSso = (driverRecord.social_security_amount !== undefined && driverRecord.social_security_amount !== null)
        ? Number(driverRecord.social_security_amount)
        : Number(defaultSso);
      const ssoVal = (rawSso === 750 || !rawSso) ? defaultSso : String(rawSso);

      setFormData({
        driver_name: driverRecord.driver_name || '',
        base_salary: (driverRecord.base_salary !== undefined && driverRecord.base_salary !== null) ? String(driverRecord.base_salary) : '0',
        tax_profile: driverRecord.tax_profile || 'social_security',
        social_security_amount: ssoVal,
        remark: driverRecord.remark || ''
      });
    } else {
      setFormData({
        driver_name: driverList[0]?.driver_name || '',
        base_salary: '0',
        tax_profile: 'social_security',
        social_security_amount: defaultSso,
        remark: ''
      });
    }
  }, [driverRecord, driverList, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.driver_name) {
      alert('กรุณาระบุชื่อพนักงานขับรถ');
      return;
    }
    setSaving(true);
    try {
      if (onSave) {
        await onSave({
          driver_name: formData.driver_name,
          base_salary: Number(formData.base_salary || 0),
          tax_profile: formData.tax_profile,
          social_security_amount: Number(formData.social_security_amount || 875),
          remark: formData.remark
        });
      }
      onClose();
    } catch (err) {
      console.error('Save driver salary profile error:', err);
      alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
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
      zIndex: 10000,
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '520px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid #cbd5e1',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.3rem' }}>💵</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                ตั้งค่าฐานเงินเดือน & รูปแบบการหักภาษี/สปส.
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                กำหนดฐานเงินเดือนประจำและเงื่อนไขการหักประกันสังคม/3% รายคน
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.2rem',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Driver Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              👤 พนักงานขับรถ *
            </label>
            {driverRecord ? (
              <input
                type="text"
                readOnly
                value={formData.driver_name}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  color: '#0f172a',
                  boxSizing: 'border-box'
                }}
              />
            ) : (
              <select
                value={formData.driver_name}
                onChange={e => setFormData({ ...formData, driver_name: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#ffffff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="" disabled>-- เลือกคนขับ --</option>
                {driverList.map(d => (
                  <option key={d.driver_name} value={d.driver_name}>
                    {d.driver_name} {d.assigned_truck_no ? `(รถ ${d.assigned_truck_no})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Base Salary Input */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              💵 ฐานเงินเดือนประจำ (บาท/เดือน)
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={formData.base_salary}
              onChange={e => setFormData({ ...formData, base_salary: e.target.value })}
              placeholder="เช่น 0 หรือ 9000"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                fontWeight: 700,
                color: '#2563eb',
                boxSizing: 'border-box'
              }}
            />
            <span style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px', display: 'block' }}>
              * ใส่ 0 หากคนขับรับเฉพาะค่ารอบวิ่งงานและเงินพิเศษ
            </span>
          </div>

          {/* Tax / SSO Profile Select */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              🏥 รูปแบบการหักภาษี & ประกันสังคม
            </label>
            <select
              value={formData.tax_profile}
              onChange={e => setFormData({ ...formData, tax_profile: e.target.value })}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: 600,
                background: '#ffffff',
                boxSizing: 'border-box'
              }}
            >
              <option value="social_security">🏥 มีประกันสังคม (หัก {formData.social_security_amount || 875}฿)</option>
              <option value="withholding_3pct">📑 หัก ณ ที่จ่าย 3% (บุคคลธรรมดา)</option>
              <option value="none">⚪ ไม่หัก (รับเงินเต็มจำนวน)</option>
            </select>
          </div>

          {/* SSO Amount Input (If Social Security Selected) */}
          {formData.tax_profile === 'social_security' && (
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '12px 14px'
            }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                🏥 ยอดหักประกันสังคมต่อเดือน (บาท)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={formData.social_security_amount}
                onChange={e => setFormData({ ...formData, social_security_amount: e.target.value })}
                style={{
                  width: '180px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#1e40af',
                  boxSizing: 'border-box'
                }}
              />
              <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '3px' }}>
                ค่าเริ่มต้นมาตรฐานคือ 875 บาท (แก้ไขได้อิสระ)
              </span>
            </div>
          )}

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 16px',
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
                padding: '9px 20px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
              }}
            >
              {saving ? '⏳ กำลังบันทึก...' : '💾 บันทึกการตั้งค่า'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
