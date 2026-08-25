import React, { useState, useEffect } from 'react';
import { EXPENSE_CATEGORIES, detectExpenseCategory } from '../../services/truckExpenseService';

/**
 * 💰 Modal Form สำหรับบันทึกและแก้ไขรายการค่าใช้จ่ายรถ (Unified Truck Expense Modal)
 */
export default function ExpenseModal({
  isOpen,
  onClose,
  onSave,
  record = null,
  truckList = [],
  driverList = []
}) {
  const [formData, setFormData] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    truck_no: '',
    driver_name: '-',
    batch_name: '',
    category: 'fuel',
    description: '',
    amount_goods: '',
    amount_labor: '',
    amount_total: '',
    has_vat: false,
    vat_amount: '',
    trip_count: '',
    cost_per_trip: '',
    fuel_liters: '',
    odometer: '',
    payment_method: 'cash',
    vendor_name: '',
    invoice_no: '',
    slip_url: '',
    remark: ''
  });

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const safeTruckList = Array.isArray(truckList) ? truckList : (truckList?.data || []);
  const safeDriverList = Array.isArray(driverList) ? driverList : (driverList?.data || []);

  useEffect(() => {
    if (record) {
      setFormData({
        expense_date: record.expense_date || new Date().toISOString().slice(0, 10),
        truck_no: record.truck_no || '',
        driver_name: record.driver_name || '-',
        batch_name: record.batch_name || '',
        category: record.category || 'misc',
        description: record.description || '',
        amount_goods: record.amount_goods !== undefined ? String(record.amount_goods) : '',
        amount_labor: record.amount_labor !== undefined ? String(record.amount_labor) : '',
        amount_total: record.amount_total !== undefined ? String(record.amount_total) : '',
        has_vat: !!record.has_vat,
        vat_amount: record.vat_amount !== undefined ? String(record.vat_amount) : '',
        trip_count: record.trip_count !== undefined && record.trip_count > 0 ? String(record.trip_count) : '',
        cost_per_trip: record.cost_per_trip !== undefined ? String(record.cost_per_trip) : '',
        fuel_liters: record.fuel_liters !== undefined && record.fuel_liters > 0 ? String(record.fuel_liters) : '',
        odometer: record.odometer !== undefined && record.odometer > 0 ? String(record.odometer) : '',
        payment_method: record.payment_method || 'cash',
        vendor_name: record.vendor_name && record.vendor_name !== '-' ? record.vendor_name : '',
        invoice_no: record.invoice_no && record.invoice_no !== '-' ? record.invoice_no : '',
        slip_url: record.slip_url && record.slip_url !== '-' ? record.slip_url : '',
        remark: record.remark && record.remark !== '-' ? record.remark : ''
      });
    } else {
      const defaultTruck = safeTruckList.length > 0 ? safeTruckList[0].truck_no : '';
      const d = new Date();
      const monthNames = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
      ];
      const currentBatch = `${monthNames[d.getMonth()]} ${d.getFullYear() + 543}`;
      
      setFormData({
        expense_date: new Date().toISOString().slice(0, 10),
        truck_no: defaultTruck,
        driver_name: '-',
        batch_name: currentBatch,
        category: 'fuel',
        description: 'เติมน้ำมัน ผ่านท่า',
        amount_goods: '',
        amount_labor: '',
        amount_total: '',
        has_vat: false,
        vat_amount: '',
        trip_count: '',
        cost_per_trip: '',
        fuel_liters: '',
        odometer: '',
        payment_method: 'cash',
        vendor_name: 'ผ่านท่า',
        invoice_no: '',
        slip_url: '',
        remark: ''
      });
    }
    setErrorMsg('');
  }, [record, isOpen, truckList]);

  // Auto detect driver when truck changes
  const handleTruckChange = (truckNo) => {
    let driver = '-';
    if (truckNo && truckNo !== 'FLEET_SHARED') {
      const foundTruck = safeTruckList.find(t => String(t.truck_no) === String(truckNo));
      if (foundTruck?.assigned_driver_name && foundTruck.assigned_driver_name !== '-') {
        driver = foundTruck.assigned_driver_name;
      } else {
        const foundDriver = safeDriverList.find(d => String(d.assigned_truck_no) === String(truckNo));
        if (foundDriver?.driver_name) driver = foundDriver.driver_name;
      }
    }
    setFormData(prev => ({ ...prev, truck_no: truckNo, driver_name: driver }));
  };

  // Auto calculate total and cost per trip
  const handleAmountChange = (goodsVal, laborVal, tripVal) => {
    const g = Number(goodsVal || 0);
    const l = Number(laborVal || 0);
    const total = g + l;
    const trips = Number(tripVal || 0);
    const avg = trips > 0 ? Number((total / trips).toFixed(2)) : '';

    setFormData(prev => ({
      ...prev,
      amount_goods: goodsVal,
      amount_labor: laborVal,
      amount_total: total > 0 ? String(total) : '',
      trip_count: tripVal,
      cost_per_trip: avg ? String(avg) : ''
    }));
  };

  const handleDescriptionChange = (desc) => {
    const cat = detectExpenseCategory(desc);
    setFormData(prev => ({
      ...prev,
      description: desc,
      category: prev.category === 'misc' || !record ? cat : prev.category
    }));
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.expense_date) {
      setErrorMsg('กรุณาระบุวันที่บันทึก');
      return;
    }
    if (!formData.truck_no) {
      setErrorMsg('กรุณาเลือกเบอร์รถหรือระบุกองกลาง');
      return;
    }
    if (!formData.description?.trim()) {
      setErrorMsg('กรุณากรอกชื่อรายการค่าใช้จ่าย');
      return;
    }

    const totalAmt = Number(formData.amount_total || (Number(formData.amount_goods || 0) + Number(formData.amount_labor || 0)));
    if (totalAmt <= 0 && !formData.trip_count) {
      setErrorMsg('กรุณากรอกยอดเงินค่าใช้จ่าย');
      return;
    }

    try {
      setSaving(true);
      await onSave({
        id: record?.id,
        expense_date: formData.expense_date,
        truck_no: formData.truck_no,
        driver_name: formData.driver_name || '-',
        batch_name: formData.batch_name || '-',
        category: formData.category,
        description: formData.description.trim(),
        amount_goods: Number(formData.amount_goods || 0),
        amount_labor: Number(formData.amount_labor || 0),
        amount_total: totalAmt,
        has_vat: formData.has_vat,
        vat_amount: Number(formData.vat_amount || 0),
        trip_count: Number(formData.trip_count || 0),
        cost_per_trip: Number(formData.cost_per_trip || 0),
        fuel_liters: Number(formData.fuel_liters || 0),
        odometer: Number(formData.odometer || 0),
        payment_method: formData.payment_method,
        vendor_name: formData.vendor_name.trim() || '-',
        invoice_no: formData.invoice_no.trim() || '-',
        slip_url: formData.slip_url.trim() || '-',
        remark: formData.remark.trim() || '-'
      });
      onClose();
    } catch (err) {
      console.error('Error saving expense:', err);
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
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
            <span style={{ fontSize: '1.5rem' }}>💰</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: '#1e293b' }}>
                {record ? 'แก้ไขรายการค่าใช้จ่ายรถ' : 'บันทึกค่าใช้จ่ายรถ & ค่าน้ำมัน'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                ตารางบันทึกค่าใช้จ่ายแบบเบ็ดเสร็จ (น้ำมัน, ซ่อมบำรุง, อะไหล่, ค่าผ่านท่า, ผ่อนรถ)
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

            {/* Category Selector Buttons */}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>
                หมวดหมู่ค่าใช้จ่าย <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                {Object.values(EXPENSE_CATEGORIES).map(cat => {
                  const isSelected = formData.category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, category: cat.id })}
                      style={{
                        padding: '0.6rem 0.75rem',
                        borderRadius: '8px',
                        border: isSelected ? `2px solid ${cat.color}` : '1px solid #e2e8f0',
                        background: isSelected ? cat.bg : '#ffffff',
                        color: isSelected ? cat.color : '#475569',
                        fontWeight: isSelected ? 600 : 500,
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row 1: Date, Truck, Driver */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#334155', marginBottom: '0.35rem' }}>
                  📅 วันที่ <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="date"
                  value={formData.expense_date}
                  onChange={e => {
                    const newDate = e.target.value;
                    const d = new Date(newDate || new Date());
                    const mNames = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
                    const currentBatch = `${mNames[d.getMonth()]} ${d.getFullYear() + 543}`;
                    setFormData({ ...formData, expense_date: newDate, batch_name: currentBatch });
                  }}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#334155', marginBottom: '0.35rem' }}>
                  🚛 เบอร์รถ <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={formData.truck_no}
                  onChange={e => handleTruckChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <option value="">-- เลือกเบอร์รถ --</option>
                  <option value="FLEET_SHARED">🏢 กองกลาง / ส่วนกลาง (Shared)</option>
                  {safeTruckList.map(t => (
                    <option key={t.truck_no} value={t.truck_no}>
                      เบอร์ {t.truck_no} ({t.truck_license || '-'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#334155', marginBottom: '0.35rem' }}>
                  👤 คนขับ
                </label>
                <input
                  type="text"
                  value={formData.driver_name}
                  onChange={e => setFormData({ ...formData, driver_name: e.target.value })}
                  placeholder="ชื่อคนขับ"
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
            </div>

            {/* Row 2: Description & Batch */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#334155', marginBottom: '0.35rem' }}>
                  📝 รายการค่าใช้จ่าย <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => handleDescriptionChange(e.target.value)}
                  placeholder="เช่น เติมน้ำมัน ผ่านท่า, ปะยาง, ซ่อมแอร์, ผ่อนรถ งวด 6"
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#334155', marginBottom: '0.35rem' }}>
                  🏷️ งวด/รอบงาน
                </label>
                <select
                  value={formData.batch_name}
                  onChange={e => {
                    if (e.target.value === 'custom') {
                      const custom = prompt('ระบุงวด/รอบงาน (เช่น สิงหาคม 2568)');
                      if (custom) setFormData({ ...formData, batch_name: custom });
                    } else {
                      setFormData({ ...formData, batch_name: e.target.value });
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    backgroundColor: '#ffffff'
                  }}
                >
                  {(() => {
                    const opts = [];
                    const d = new Date(formData.expense_date || new Date());
                    const mNames = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
                    for (let i = 0; i < 3; i++) {
                      const date = new Date(d.getFullYear(), d.getMonth() - i, 1);
                      const label = `${mNames[date.getMonth()]} ${date.getFullYear() + 543}`;
                      opts.push(<option key={label} value={label}>{label}</option>);
                    }
                    if (!opts.find(o => o.props.value === formData.batch_name) && formData.batch_name && formData.batch_name !== 'custom') {
                      opts.unshift(<option key={formData.batch_name} value={formData.batch_name}>{formData.batch_name}</option>);
                    }
                    opts.push(<option key="custom" value="custom">ระบุเดือนที่ย้อนหลังมากกว่า...</option>);
                    return opts;
                  })()}
                </select>
              </div>
            </div>

            {/* Row 3: Financial breakdown (Total) */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>
                💵 จำนวนเงิน
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.25rem' }}>
                    💰 ยอดรวมสุทธิ (บาท)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.amount_total}
                    onChange={e => setFormData({ ...formData, amount_total: e.target.value })}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '2px solid #3b82f6',
                      borderRadius: '6px',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      color: '#1e40af',
                      textAlign: 'right',
                      background: '#eff6ff'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Row 4: Invoice No & Payment Method */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#334155', marginBottom: '0.35rem' }}>
                  📄 เลขที่บิล / ใบเสร็จ
                </label>
                <input
                  type="text"
                  value={formData.invoice_no}
                  onChange={e => setFormData({ ...formData, invoice_no: e.target.value })}
                  placeholder="เช่น INV-690513"
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#334155', marginBottom: '0.35rem' }}>
                  💳 วิธีชำระเงิน
                </label>
                <select
                  value={formData.payment_method}
                  onChange={e => setFormData({ ...formData, payment_method: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <option value="cash">💵 เงินสด</option>
                  <option value="fleet_card">💳 บัตรน้ำมัน (Fleet Card)</option>
                  <option value="transfer">📱 โอนเงินผ่านบัญชี</option>
                  <option value="driver_advance">👤 คนขับสำรองจ่าย</option>
                  <option value="company">🏢 บริษัทวางบิล</option>
                </select>
              </div>
            </div>

            {/* Row 5: Remark */}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#334155', marginBottom: '0.35rem' }}>
                💬 หมายเหตุ
              </label>
              <input
                type="text"
                value={formData.remark}
                onChange={e => setFormData({ ...formData, remark: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '0.9rem'
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
                background: '#2563eb',
                color: '#ffffff',
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1
              }}
            >
              {saving ? 'กำลังบันทึก...' : '💾 บันทึกรายการ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
