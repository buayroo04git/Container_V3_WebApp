import React, { useState, useEffect } from 'react';
import { portBillingService, DEFAULT_PORT_RATES } from '../services/portBillingService.js';

export default function PortRatesView() {
  const [rates, setRates] = useState(DEFAULT_PORT_RATES);
  const [loading, setLoading] = useState(true);
  const [editingRate, setEditingRate] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadRates = async () => {
    setLoading(true);
    const { data } = await portBillingService.fetchPortRates();
    if (data) setRates(data);
    setLoading(false);
  };

  useEffect(() => {
    loadRates();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!editingRate) return;
    setSaving(true);
    const { data } = await portBillingService.savePortRate(editingRate);
    if (data) {
      await loadRates();
      setEditingRate(null);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบเรทช่วงเวลานี้?')) return;
    await portBillingService.deletePortRate(id);
    await loadRates();
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        background: '#ffffff',
        padding: '16px 20px',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '22px' }}>💵</span>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
              เรทรายได้ที่ท่าเรือจ่ายให้เรา (Port Billing Rates)
            </h1>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            กำหนดราคาค่ารอบที่ท่าเรือจ่ายให้บริษัทตามช่วงวันที่และขนาดตู้ 20" / 40" เพื่อนำไปคิดเป็นรายรับของรถแต่ละคัน
          </p>
        </div>

        <button
          type="button"
          onClick={() => setEditingRate({
            id: `port_rate_${Date.now()}`,
            period_name: `ช่วงที่ ${rates.length + 1}`,
            start_date: new Date().toISOString().slice(0, 10),
            end_date: '',
            rate_20: 721,
            rate_40: 771,
            rate_45: 771,
            rate_default: 721,
            port_name: 'ท่าเรือทั่วไป',
            is_active: true,
            remark: ''
          })}
          style={{
            padding: '8px 18px',
            borderRadius: '8px',
            border: 'none',
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(5,150,105,0.2)'
          }}
        >
          ➕ เพิ่มเรทช่วงเวลาใหม่
        </button>
      </div>

      {/* Main Table */}
      <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>กำลังโหลดเรทราคา...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 800 }}>
                <th style={{ padding: '12px 14px', textAlign: 'left' }}>ช่วงที่</th>
                <th style={{ padding: '12px 14px', textAlign: 'center' }}>วันที่เริ่มต้น</th>
                <th style={{ padding: '12px 14px', textAlign: 'center' }}>วันที่สิ้นสุด</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', color: '#059669' }}>ราคาตู้ 20"</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', color: '#059669' }}>ราคาตู้ 40"</th>
                <th style={{ padding: '12px 14px', textAlign: 'center' }}>สถานะ</th>
                <th style={{ padding: '12px 14px', textAlign: 'center' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((rate, idx) => (
                <tr key={rate.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '14px', fontWeight: 800, color: '#1e40af' }}>
                    🏷️ {rate.period_name || `ช่วงที่ ${idx + 1}`}
                  </td>
                  <td style={{ padding: '14px', textAlign: 'center', color: '#334155', fontWeight: 600 }}>
                    {rate.start_date}
                  </td>
                  <td style={{ padding: '14px', textAlign: 'center', color: '#334155', fontWeight: 600 }}>
                    {rate.end_date || 'ปัจจุบัน (Ongoing)'}
                  </td>
                  <td style={{ padding: '14px', textAlign: 'right', fontWeight: 900, color: '#059669', fontSize: '15px' }}>
                    ฿{Number(rate.rate_20).toLocaleString()}
                  </td>
                  <td style={{ padding: '14px', textAlign: 'right', fontWeight: 900, color: '#059669', fontSize: '15px' }}>
                    ฿{Number(rate.rate_40).toLocaleString()}
                  </td>
                  <td style={{ padding: '14px', textAlign: 'center' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: rate.is_active ? '#dcfce7' : '#f1f5f9',
                      color: rate.is_active ? '#15803d' : '#64748b',
                      fontWeight: 700,
                      fontSize: '11.5px'
                    }}>
                      {rate.is_active ? '🟢 ใช้งานอยู่' : '⚪ ปิดใช้งาน'}
                    </span>
                  </td>
                  <td style={{ padding: '14px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setEditingRate(rate)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#2563eb',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        ✏️ แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(rate.id)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid #fecaca',
                          background: '#ffffff',
                          color: '#dc2626',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

      </div>

      {/* Edit / Create Modal */}
      {editingRate && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', padding: '24px', width: '480px', maxWidth: '90vw', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                💵 กำหนดเรทราคาที่ท่าเรือจ่ายเรา
              </h3>
              <button
                type="button"
                onClick={() => setEditingRate(null)}
                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>ชื่อช่วงเวลา (เช่น ช่วงที่ 1, ช่วงที่ 2):</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ช่วงที่ 1"
                  value={editingRate.period_name || ''}
                  onChange={e => setEditingRate({ ...editingRate, period_name: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>วันที่เริ่มต้น:</label>
                  <input
                    type="date"
                    required
                    value={editingRate.start_date || ''}
                    onChange={e => setEditingRate({ ...editingRate, start_date: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>วันที่สิ้นสุด:</label>
                  <input
                    type="date"
                    value={editingRate.end_date || ''}
                    onChange={e => setEditingRate({ ...editingRate, end_date: e.target.value || null })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#059669' }}>ราคาตู้ 20" (บาท):</label>
                  <input
                    type="number"
                    required
                    placeholder="เช่น 734"
                    value={editingRate.rate_20}
                    onChange={e => setEditingRate({ ...editingRate, rate_20: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '14px', fontWeight: 800, color: '#059669', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#059669' }}>ราคาตู้ 40" (บาท):</label>
                  <input
                    type="number"
                    required
                    placeholder="เช่น 784"
                    value={editingRate.rate_40}
                    onChange={e => setEditingRate({ ...editingRate, rate_40: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '14px', fontWeight: 800, color: '#059669', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>หมายเหตุ:</label>
                <input
                  type="text"
                  placeholder="เช่น เรทท่าเรือต้นเดือน พ.ค. 2026"
                  value={editingRate.remark || ''}
                  onChange={e => setEditingRate({ ...editingRate, remark: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setEditingRate(null)}
                  style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600 }}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
