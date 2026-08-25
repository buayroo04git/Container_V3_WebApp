import React, { useState, useEffect } from 'react';
import { portBillingService, DEFAULT_PORT_RATES } from '../services/portBillingService.js';

export default function PortRatesView() {
  const [rates, setRates] = useState(DEFAULT_PORT_RATES);
  const [loading, setLoading] = useState(true);
  const [editingRate, setEditingRate] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadRates() {
      setLoading(true);
      const { data } = await portBillingService.fetchPortRates();
      if (data) setRates(data);
      setLoading(false);
    }
    loadRates();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!editingRate) return;
    setSaving(true);
    const { data } = await portBillingService.savePortRate(editingRate);
    if (data) {
      const { data: updated } = await portBillingService.fetchPortRates();
      if (updated) setRates(updated);
      setEditingRate(null);
    }
    setSaving(false);
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
            กำหนดราคาค่ารอบที่ท่าเรือ/สายเรือจ่ายให้เราตามขนาดตู้ 20'/40'/45' เพื่อคำนวณเป็นรายรับของรถ
          </p>
        </div>

        <button
          type="button"
          onClick={() => setEditingRate({
            id: `port_rate_${Date.now()}`,
            port_name: '',
            start_date: new Date().toISOString().slice(0, 10),
            end_date: null,
            rate_20: 1200,
            rate_40: 1600,
            rate_45: 1800,
            rate_default: 1400,
            is_active: true,
            remark: ''
          })}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(5,150,105,0.2)'
          }}
        >
          ➕ เพิ่มเรทท่าเรือใหม่
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>ชื่อท่าเรือ / เส้นทาง</th>
              <th style={{ padding: '10px 12px', textAlign: 'center' }}>ช่วงวันที่ใช้งาน</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>เรทตู้ 20’</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>เรทตู้ 40’</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>เรทตู้ 45’</th>
              <th style={{ padding: '10px 12px', textAlign: 'center' }}>สถานะ</th>
              <th style={{ padding: '10px 12px', textAlign: 'center' }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rates.map(rate => (
              <tr key={rate.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px', fontWeight: 700, color: '#1e40af' }}>{rate.port_name}</td>
                <td style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>
                  {rate.start_date} ถึง {rate.end_date || 'ปัจจุบัน (Ongoing)'}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: '14px' }}>
                  ฿{Number(rate.rate_20).toLocaleString()}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: '14px' }}>
                  ฿{Number(rate.rate_40).toLocaleString()}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: '14px' }}>
                  ฿{Number(rate.rate_45).toLocaleString()}
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
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
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setEditingRate(rate)}
                    style={{
                      padding: '5px 10px',
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editingRate && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '480px', maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
              💵 กำหนดเรทราคาที่ท่าเรือจ่ายเรา
            </h3>
            
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>ชื่อท่าเรือ / เส้นทาง:</label>
                <input
                  type="text"
                  required
                  value={editingRate.port_name}
                  onChange={e => setEditingRate({ ...editingRate, port_name: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>วันที่เริ่มใช้:</label>
                  <input
                    type="date"
                    required
                    value={editingRate.start_date}
                    onChange={e => setEditingRate({ ...editingRate, start_date: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>วันที่สิ้นสุด (เว้นว่างได้):</label>
                  <input
                    type="date"
                    value={editingRate.end_date || ''}
                    onChange={e => setEditingRate({ ...editingRate, end_date: e.target.value || null })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>เรทตู้ 20’ (฿):</label>
                  <input
                    type="number"
                    required
                    value={editingRate.rate_20}
                    onChange={e => setEditingRate({ ...editingRate, rate_20: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>เรทตู้ 40’ (฿):</label>
                  <input
                    type="number"
                    required
                    value={editingRate.rate_40}
                    onChange={e => setEditingRate({ ...editingRate, rate_40: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px', fontWeight: 700 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>เรทตู้ 45’ (฿):</label>
                  <input
                    type="number"
                    required
                    value={editingRate.rate_45}
                    onChange={e => setEditingRate({ ...editingRate, rate_45: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px', fontWeight: 700 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>หมายเหตุ:</label>
                <input
                  type="text"
                  value={editingRate.remark || ''}
                  onChange={e => setEditingRate({ ...editingRate, remark: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
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
