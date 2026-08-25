import React, { useState, useEffect } from 'react';
import { DEFAULT_INCENTIVE_TIERS } from '../../services/driverPayrollService';

/**
 * 🎁 Modal ตั้งค่าเกณฑ์เงินพิเศษคนขับตามจำนวนงาน (Incentive Tiers Modal)
 */
export default function IncentiveConfigModal({
  isOpen,
  onClose,
  onSave,
  config = null
}) {
  const [formData, setFormData] = useState({
    name: 'เกณฑ์เงินพิเศษขั้นบันไดมาตรฐาน (150 ตู้ขึ้นไป)',
    is_active: true,
    step_trips: 10,
    step_bonus: 1000,
    tiers: DEFAULT_INCENTIVE_TIERS,
    remark: ''
  });

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (config) {
      setFormData({
        name: config.name || 'เกณฑ์เงินพิเศษขั้นบันได',
        is_active: config.is_active !== undefined ? config.is_active : true,
        step_trips: config.step_trips || 10,
        step_bonus: config.step_bonus || 1000,
        tiers: Array.isArray(config.tiers) && config.tiers.length > 0 ? config.tiers : DEFAULT_INCENTIVE_TIERS,
        remark: config.remark && config.remark !== '-' ? config.remark : ''
      });
    } else {
      setFormData({
        name: 'เกณฑ์เงินพิเศษขั้นบันไดมาตรฐาน',
        is_active: true,
        step_trips: 10,
        step_bonus: 1000,
        tiers: DEFAULT_INCENTIVE_TIERS,
        remark: ''
      });
    }
    setErrorMsg('');
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleTierChange = (index, field, value) => {
    const updated = [...formData.tiers];
    updated[index] = {
      ...updated[index],
      [field]: Number(value) || 0
    };
    setFormData({ ...formData, tiers: updated });
  };

  const handleAddTier = () => {
    const lastTier = formData.tiers[formData.tiers.length - 1];
    const newMin = lastTier ? Number(lastTier.minTrips) + 10 : 150;
    const newBonus = lastTier ? Number(lastTier.bonus) + 1000 : 1000;
    setFormData({
      ...formData,
      tiers: [...formData.tiers, { minTrips: newMin, bonus: newBonus }]
    });
  };

  const handleRemoveTier = (index) => {
    if (formData.tiers.length <= 1) {
      setErrorMsg('ต้องมีอย่างน้อย 1 ขั้นบันได');
      return;
    }
    const updated = formData.tiers.filter((_, idx) => idx !== index);
    setFormData({ ...formData, tiers: updated });
  };

  const handleResetDefault = () => {
    setFormData({
      ...formData,
      tiers: DEFAULT_INCENTIVE_TIERS,
      step_trips: 10,
      step_bonus: 1000
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.name?.trim()) {
      setErrorMsg('กรุณากรอกชื่อเกณฑ์เงินพิเศษ');
      return;
    }

    try {
      setSaving(true);
      const sortedTiers = [...formData.tiers].sort((a, b) => Number(a.minTrips) - Number(b.minTrips));
      await onSave({
        id: config?.id,
        name: formData.name.trim(),
        is_active: formData.is_active,
        tiers: sortedTiers,
        step_trips: Number(formData.step_trips),
        step_bonus: Number(formData.step_bonus),
        remark: formData.remark.trim() || '-'
      });
      onClose();
    } catch (err) {
      console.error('Error saving incentive config:', err);
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem',
      backdropFilter: 'blur(3px)'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🎁</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: '#1e293b' }}>
                {config ? 'แก้ไขตารางขั้นเงินพิเศษ' : 'ตั้งค่าตารางขั้นเงินพิเศษ (Incentive Tiers)'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                คำนวณเงินพิเศษอัตโนมัติตามขั้นจำนวนงานที่คนขับทำได้จริงในแต่ละงวด
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: '0.25rem'
            }}
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {errorMsg && (
              <div style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                color: '#dc2626',
                fontSize: '0.9rem'
              }}>
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Name */}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#334155', marginBottom: '0.35rem' }}>
                ชื่อเกณฑ์เงินพิเศษ <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="เช่น เกณฑ์เงินพิเศษขั้นบันไดมาตรฐาน"
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '0.95rem',
                  outline: 'none'
                }}
              />
            </div>

            {/* Tier Ladder Table */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b' }}>
                  📊 ขั้นบันไดจำนวนงาน (ตู้) vs เงินพิเศษ (บาท)
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleResetDefault}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '0.3rem 0.6rem',
                      fontSize: '0.8rem',
                      color: '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 รีเซ็ตเป็นค่ามาตรฐาน
                  </button>
                  <button
                    type="button"
                    onClick={handleAddTier}
                    style={{
                      background: '#3b82f6',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.3rem 0.6rem',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      cursor: 'pointer'
                    }}
                  >
                    ➕ เพิ่มขั้น
                  </button>
                </div>
              </div>

              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr 1fr 60px',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: '#e2e8f0',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#334155'
              }}>
                <div>ขั้นที่</div>
                <div>จำนวนงานขั้นต่ำ (งาน/ตู้)</div>
                <div>เงินพิเศษที่ได้รับ (บาท)</div>
                <div style={{ textAlign: 'center' }}>ลบ</div>
              </div>

              {/* Rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem', maxHeight: '280px', overflowY: 'auto' }}>
                {formData.tiers.map((tier, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '80px 1fr 1fr 60px',
                      gap: '0.5rem',
                      alignItems: 'center',
                      padding: '0.4rem 0.75rem',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px'
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>
                      #{idx + 1}
                    </div>
                    <div>
                      <input
                        type="number"
                        value={tier.minTrips}
                        onChange={e => handleTierChange(idx, 'minTrips', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.4rem 0.6rem',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          fontSize: '0.9rem',
                          textAlign: 'right'
                        }}
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        value={tier.bonus}
                        onChange={e => handleTierChange(idx, 'bonus', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.4rem 0.6rem',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          fontSize: '0.9rem',
                          textAlign: 'right',
                          fontWeight: 600,
                          color: '#059669'
                        }}
                      />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleRemoveTier(idx)}
                        style={{
                          background: '#fee2e2',
                          color: '#dc2626',
                          border: 'none',
                          borderRadius: '4px',
                          width: '28px',
                          height: '28px',
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Incremental Step setting */}
              <div style={{
                marginTop: '0.75rem',
                paddingTop: '0.75rem',
                borderTop: '1px dashed #cbd5e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.85rem',
                color: '#475569'
              }}>
                <span>📈 เกินขั้นสูงสุด คิดเพิ่มทุกๆ:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="number"
                    value={formData.step_trips}
                    onChange={e => setFormData({ ...formData, step_trips: e.target.value })}
                    style={{ width: '60px', padding: '0.3rem', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'right' }}
                  />
                  <span>งาน</span>
                  <span>= +</span>
                  <input
                    type="number"
                    value={formData.step_bonus}
                    onChange={e => setFormData({ ...formData, step_bonus: e.target.value })}
                    style={{ width: '80px', padding: '0.3rem', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'right', fontWeight: 600, color: '#059669' }}
                  />
                  <span>บาท</span>
                </div>
              </div>
            </div>

            {/* Remark */}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#334155', marginBottom: '0.35rem' }}>
                หมายเหตุ
              </label>
              <input
                type="text"
                value={formData.remark}
                onChange={e => setFormData({ ...formData, remark: e.target.value })}
                placeholder="ระบุข้อความเพิ่มเติม (ถ้ามี)"
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '0.95rem',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            backgroundColor: '#f8fafc'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.6rem 1.25rem',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                background: '#ffffff',
                color: '#475569',
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '0.6rem 1.5rem',
                border: 'none',
                borderRadius: '6px',
                background: '#10b981',
                color: '#ffffff',
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1
              }}
            >
              {saving ? 'กำลังบันทึก...' : '💾 บันทึกเกณฑ์เงินพิเศษ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
