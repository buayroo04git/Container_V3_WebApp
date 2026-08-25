import React, { useState, useEffect, useMemo } from 'react';
import { portBillingService, DEFAULT_PORT_RATES } from '../services/portBillingService.js';
import MonthPicker from '../components/ui/MonthPicker.jsx';

export default function PortRatesView({
  selectedMonth: propMonth,
  setSelectedMonth: propSetMonth,
  onRatesChanged,
  isSubTab = false
}) {
  const [rates, setRates] = useState(DEFAULT_PORT_RATES);
  const [internalMonth, setInternalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const selectedMonth = propMonth || internalMonth;
  const setSelectedMonth = propSetMonth || setInternalMonth;

  const [loading, setLoading] = useState(true);
  const [editingRate, setEditingRate] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadRates = async () => {
    setLoading(true);
    const { data } = await portBillingService.fetchPortRates();
    if (data) setRates(data);
    setLoading(false);
    if (onRatesChanged) onRatesChanged(data);
  };

  useEffect(() => {
    loadRates();
  }, []);

  // แบ่งเรทตามงวดเดือนที่เลือก และแยกครึ่งเดือนแรก (H1) / ครึ่งเดือนหลัง (H2)
  const { h1Rates, h2Rates } = useMemo(() => {
    const monthRates = rates.filter(r => {
      if (r.month_period && r.month_period === selectedMonth) return true;
      if (r.start_date && r.start_date.startsWith(selectedMonth)) return true;
      return false;
    });

    const h1 = monthRates.filter(r => {
      if (r.cycle_half === 'H1') return true;
      const day = Number((r.start_date || '').slice(8, 10)) || 1;
      return day <= 15;
    }).sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));

    const h2 = monthRates.filter(r => {
      if (r.cycle_half === 'H2') return true;
      const day = Number((r.start_date || '').slice(8, 10)) || 1;
      return day > 15;
    }).sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));

    return { h1Rates: h1, h2Rates: h2 };
  }, [rates, selectedMonth]);

  const handleOpenAddModal = (cycleHalf = 'H1') => {
    const isH1 = cycleHalf === 'H1';
    const existingList = isH1 ? h1Rates : h2Rates;
    const nextPeriodNum = existingList.length + 1;
    const [yStr, mStr] = (selectedMonth || new Date().toISOString().slice(0, 7)).split('-');
    const year = Number(yStr) || new Date().getFullYear();
    const month = Number(mStr) || (new Date().getMonth() + 1);
    const lastDayNum = new Date(year, month, 0).getDate(); // 28, 29, 30, or 31

    let startDay = isH1 ? '01' : '16';
    if (existingList.length > 0) {
      const lastP = existingList[existingList.length - 1];
      const prevEnd = Number((lastP.end_date || '').slice(8, 10)) || (isH1 ? 1 : 16);
      const nextStart = Math.min(prevEnd + 1, isH1 ? 15 : lastDayNum);
      startDay = String(nextStart).padStart(2, '0');
    }
    const endDay = isH1 ? '15' : String(lastDayNum).padStart(2, '0');

    setEditingRate({
      id: `port_rate_${selectedMonth}_${cycleHalf.toLowerCase()}_p${nextPeriodNum}_${Date.now()}`,
      month_period: selectedMonth,
      cycle_half: cycleHalf,
      period_name: `ช่วงที่ ${nextPeriodNum}`,
      start_date: `${selectedMonth}-${startDay}`,
      end_date: `${selectedMonth}-${endDay}`,
      rate_20: 721,
      rate_40: 771,
      rate_45: 771,
      rate_default: 721,
      port_name: 'ท่าเรือทั่วไป',
      is_active: true,
      remark: `${isH1 ? 'ครึ่งแรก' : 'ครึ่งหลัง'} ช่วงที่ ${nextPeriodNum}`
    });
  };

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

  const renderCycleTable = (title, cycleHalf, list, badgeColor) => {
    return (
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}>
        {/* Sub Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                padding: '4px 10px',
                borderRadius: '8px',
                background: badgeColor.bg,
                color: badgeColor.text,
                fontWeight: 800,
                fontSize: '13px'
              }}>
                {title}
              </span>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                ตั้งค่าช่วงเวลาและราคา (ตั้งค่าตู้เริ่มต้น 0)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleOpenAddModal(cycleHalf)}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer'
            }}
          >
            ➕ เพิ่มช่วงเวลา ({title})
          </button>
        </div>

        {/* Table */}
        {list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', background: '#f8fafc', borderRadius: '10px', fontSize: '13px' }}>
            ยังไม่มีการตั้งค่าเรทสำหรับ {title} ในงวด {selectedMonth} (คลิกปุ่ม ➕ ด้านบนเพื่อเพิ่มช่วงเวลา)
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 800 }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>ช่วงที่</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>วันที่เริ่มต้น</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>วันที่สิ้นสุด</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', color: '#059669' }}>ราคาตู้ 20"</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', color: '#059669' }}>ราคาตู้ 40"</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>สถานะ</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {list.map((rate, idx) => (
                  <tr key={rate.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 800, color: '#1e40af' }}>
                      🏷️ {rate.period_name || `ช่วงที่ ${idx + 1}`}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#334155', fontWeight: 600 }}>
                      {rate.start_date}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#334155', fontWeight: 600 }}>
                      {rate.end_date || 'สิ้นสุดรอบ'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: '#059669', fontSize: '15px' }}>
                      ฿{Number(rate.rate_20).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: '#059669', fontSize: '15px' }}>
                      ฿{Number(rate.rate_40).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: rate.is_active ? '#dcfce7' : '#f1f5f9',
                        color: rate.is_active ? '#15803d' : '#64748b',
                        fontWeight: 700,
                        fontSize: '11.5px'
                      }}>
                        {rate.is_active ? '🟢 ใช้งาน' : '⚪ ปิด'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
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
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {!isSubTab && (
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
                เรทท่าเรือ (Port Billing Rates)
              </h1>
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              กำหนดราคาค่ารอบที่ท่าเรือจ่ายให้เรา แยกตามรอบครึ่งเดือนแรก (1-15) และครึ่งเดือนหลัง (16-สิ้นเดือน)
            </p>
          </div>

          <MonthPicker
            value={selectedMonth}
            onChange={setSelectedMonth}
            label="งวดเดือน:"
          />
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b', background: '#fff', borderRadius: '16px' }}>
          กำลังโหลดข้อมูลเรทราคา...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Section 1: ครึ่งเดือนแรก (1 - 15) */}
          {renderCycleTable(
            '🌓 ครึ่งเดือนแรก (วันที่ 1 - 15)',
            'H1',
            h1Rates,
            { bg: '#eff6ff', text: '#1d4ed8' }
          )}

          {/* Section 2: ครึ่งเดือนหลัง (16 - สิ้นเดือน) */}
          {renderCycleTable(
            '🌕 ครึ่งเดือนหลัง (วันที่ 16 - 31)',
            'H2',
            h2Rates,
            { bg: '#f5f3ff', text: '#7c3aed' }
          )}
        </div>
      )}

      {/* Edit / Add Modal */}
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
          <div style={{ background: '#ffffff', borderRadius: '16px', padding: '24px', width: '500px', maxWidth: '90vw', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                💵 กำหนดเรทราคาช่วงเวลา ({editingRate.cycle_half === 'H1' ? 'ครึ่งเดือนแรก' : 'ครึ่งเดือนหลัง'})
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
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>รอบครึ่งเดือน:</label>
                  <select
                    value={editingRate.cycle_half || 'H1'}
                    onChange={e => {
                      const newCycle = e.target.value;
                      const isH1 = newCycle === 'H1';
                      const [yStr, mStr] = (selectedMonth || new Date().toISOString().slice(0, 7)).split('-');
                      const lastDay = new Date(Number(yStr), Number(mStr), 0).getDate();
                      setEditingRate({
                        ...editingRate,
                        cycle_half: newCycle,
                        start_date: `${selectedMonth}-${isH1 ? '01' : '16'}`,
                        end_date: `${selectedMonth}-${isH1 ? '15' : String(lastDay).padStart(2, '0')}`
                      });
                    }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px', fontWeight: 700 }}
                  >
                    <option value="H1">🌓 ครึ่งเดือนแรก (1-15)</option>
                    <option value="H2">🌕 ครึ่งเดือนหลัง (16-สิ้นเดือน)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>ชื่อช่วงเวลา:</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น ช่วงที่ 1"
                    value={editingRate.period_name || ''}
                    onChange={e => setEditingRate({ ...editingRate, period_name: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
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
                  placeholder="เช่น เรทครึ่งแรก ช่วงที่ 1"
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
