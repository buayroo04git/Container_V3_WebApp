import React, { useState, useEffect, useRef } from 'react';
import { ADVANCE_CATEGORIES, ADVANCE_TYPES } from '../../services/driverAdvanceService';

const THAI_MONTHS = [
  { value: '01', label: 'มกราคม' },
  { value: '02', label: 'กุมภาพันธ์' },
  { value: '03', label: 'มีนาคม' },
  { value: '04', label: 'เมษายน' },
  { value: '05', label: 'พฤษภาคม' },
  { value: '06', label: 'มิถุนายน' },
  { value: '07', label: 'กรกฎาคม' },
  { value: '08', label: 'สิงหาคม' },
  { value: '09', label: 'กันยายน' },
  { value: '10', label: 'ตุลาคม' },
  { value: '11', label: 'พฤศจิกายน' },
  { value: '12', label: 'ธันวาคม' }
];

/**
 * 📅 MonthYearPicker: ตัวเลือกเดือน/งวดที่ทำงานได้สมบูรณ์บนทุกเบราว์เซอร์ (Firefox, Chrome, Safari, Edge)
 */
function MonthYearPicker({ value, onChange }) {
  const currentYear = new Date().getFullYear();
  const [selectedY, selectedM] = (value && typeof value === 'string' && value.includes('-'))
    ? value.split('-')
    : [String(currentYear), String(new Date().getMonth() + 1).padStart(2, '0')];

  const years = [
    currentYear - 1,
    currentYear,
    currentYear + 1,
    currentYear + 2,
    currentYear + 3
  ];

  const handleMonthChange = (m) => {
    onChange(`${selectedY}-${m}`);
  };

  const handleYearChange = (y) => {
    onChange(`${y}-${selectedM}`);
  };

  const handleSetQuick = (offsetMonths) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offsetMonths);
    const yStr = String(d.getFullYear());
    const mStr = String(d.getMonth() + 1).padStart(2, '0');
    onChange(`${yStr}-${mStr}`);
  };

  const currentMonthName = THAI_MONTHS.find(m => m.value === selectedM)?.label || selectedM;
  const thaiYear = Number(selectedY) + 543;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '6px' }}>
        <select
          value={selectedM}
          onChange={(e) => handleMonthChange(e.target.value)}
          style={{
            height: '38px',
            padding: '0 8px',
            borderRadius: '8px',
            border: '1.5px solid #cbd5e1',
            fontSize: '13px',
            fontWeight: 700,
            background: '#ffffff',
            color: '#0f172a',
            cursor: 'pointer'
          }}
        >
          {THAI_MONTHS.map(m => (
            <option key={m.value} value={m.value}>
              {m.label} ({m.value})
            </option>
          ))}
        </select>

        <select
          value={selectedY}
          onChange={(e) => handleYearChange(e.target.value)}
          style={{
            height: '38px',
            padding: '0 8px',
            borderRadius: '8px',
            border: '1.5px solid #cbd5e1',
            fontSize: '13px',
            fontWeight: 700,
            background: '#ffffff',
            color: '#0f172a',
            cursor: 'pointer'
          }}
        >
          {years.map(y => (
            <option key={y} value={String(y)}>
              {y + 543} ({y})
            </option>
          ))}
        </select>
      </div>

      {/* Quick Buttons & Preview Label */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            onClick={() => handleSetQuick(0)}
            style={{
              padding: '2px 7px',
              borderRadius: '4px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              fontSize: '11px',
              color: '#475569',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            📍 เดือนนี้
          </button>
          <button
            type="button"
            onClick={() => handleSetQuick(1)}
            style={{
              padding: '2px 7px',
              borderRadius: '4px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              fontSize: '11px',
              color: '#475569',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            ⏩ เดือนหน้า
          </button>
          <button
            type="button"
            onClick={() => handleSetQuick(2)}
            style={{
              padding: '2px 7px',
              borderRadius: '4px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              fontSize: '11px',
              color: '#475569',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            ⏩ +2 เดือน
          </button>
        </div>

        <span style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed' }}>
          🗓️ {currentMonthName} {thaiYear}
        </span>
      </div>
    </div>
  );
}

/**
 * 💸 DriverAdvanceModal: หน้าต่างบันทึกการเบิกเงินล่วงหน้า & เงินยืมก้อนผ่อนชำระ
 */
export default function DriverAdvanceModal({
  isOpen,
  onClose,
  onSave,
  driverList = [],
  defaultDriverName = '',
  advanceRecord = null,
  advance = null
}) {
  const currentRecord = advanceRecord || advance;
  const [category, setCategory] = useState('single_advance'); // 'single_advance' | 'installment_loan'
  const [formData, setFormData] = useState({
    advance_date: new Date().toISOString().slice(0, 10),
    driver_name: '',
    amount: '',
    advance_type: 'salary_advance',
    installments_total: '4',
    installment_amount: '',
    installments_paid: '0',
    remaining_amount: '',
    start_period: new Date().toISOString().slice(0, 7),
    status: 'pending',
    payment_method: 'transfer',
    slip_url: '',
    remark: ''
  });
  const [isManualInstallmentAmt, setIsManualInstallmentAmt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [slipPreviewUrl, setSlipPreviewUrl] = useState('');
  const fileInputRef = useRef(null);

  const safeDriverList = Array.isArray(driverList) ? driverList : (driverList?.data || []);

  useEffect(() => {
    if (currentRecord) {
      const isLoan = currentRecord.category === 'installment_loan' || currentRecord.advance_type === 'loan_installment';
      setCategory(isLoan ? 'installment_loan' : 'single_advance');
      setIsManualInstallmentAmt(false);
      const existingSlip = currentRecord.slip_url && currentRecord.slip_url !== '-' ? currentRecord.slip_url : '';
      setSlipPreviewUrl(existingSlip);
      setFormData({
        advance_date: currentRecord.advance_date ? String(currentRecord.advance_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
        driver_name: currentRecord.driver_name || '',
        amount: currentRecord.amount !== undefined ? String(currentRecord.amount) : '',
        advance_type: currentRecord.advance_type || (isLoan ? 'loan_installment' : 'salary_advance'),
        installments_total: String(currentRecord.installments_total || (isLoan ? 4 : 1)),
        installment_amount: currentRecord.installment_amount !== undefined ? String(currentRecord.installment_amount) : '',
        installments_paid: String(currentRecord.installments_paid || 0),
        remaining_amount: currentRecord.remaining_amount !== undefined ? String(currentRecord.remaining_amount) : '',
        start_period: currentRecord.start_period || (currentRecord.advance_date ? String(currentRecord.advance_date).slice(0, 7) : new Date().toISOString().slice(0, 7)),
        status: currentRecord.status || 'pending',
        payment_method: currentRecord.payment_method || 'transfer',
        slip_url: existingSlip,
        remark: currentRecord.remark && currentRecord.remark !== '-' ? String(currentRecord.remark).replace(/\s*\[LOAN:[^\]]+\]/g, '').trim() : ''
      });
    } else {
      const initialDriver = defaultDriverName || (safeDriverList.length > 0 ? safeDriverList[0].driver_name : '');
      const curMonth = new Date().toISOString().slice(0, 7);
      setCategory('single_advance');
      setIsManualInstallmentAmt(false);
      setSlipPreviewUrl('');
      setFormData({
        advance_date: new Date().toISOString().slice(0, 10),
        driver_name: initialDriver,
        amount: '',
        advance_type: 'salary_advance',
        installments_total: '4',
        installment_amount: '',
        installments_paid: '0',
        remaining_amount: '',
        start_period: curMonth,
        status: 'pending',
        payment_method: 'transfer',
        slip_url: '',
        remark: ''
      });
    }
    setErrorMsg('');
  }, [currentRecord, isOpen, defaultDriverName, safeDriverList]);

  // คำนวณค่างวดอัตโนมัติเมื่อจำนวนเงินหรือจำนวนงวดเปลี่ยน
  useEffect(() => {
    if (category === 'installment_loan') {
      const total = Number(formData.amount || 0);
      const inst = Math.max(1, Number(formData.installments_total || 1));
      if (!isManualInstallmentAmt && total > 0) {
        const perInst = Math.round(total / inst);
        setFormData(prev => ({
          ...prev,
          installment_amount: String(perInst),
          advance_type: 'loan_installment'
        }));
      }
    }
  }, [formData.amount, formData.installments_total, category, isManualInstallmentAmt]);

  if (!isOpen) return null;

  const handleCategoryChange = (newCat) => {
    setCategory(newCat);
    setIsManualInstallmentAmt(false);
    if (newCat === 'installment_loan') {
      const total = Number(formData.amount || 0);
      const inst = Math.max(1, Number(formData.installments_total || 4));
      const perInst = total > 0 ? Math.round(total / inst) : '';
      setFormData(prev => ({
        ...prev,
        advance_type: 'loan_installment',
        installments_total: prev.installments_total || '4',
        installment_amount: perInst ? String(perInst) : prev.installment_amount,
        start_period: prev.start_period || prev.advance_date.slice(0, 7)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        advance_type: 'salary_advance',
        installments_total: '1',
        installment_amount: prev.amount
      }));
    }
  };

  const handlePresetInstallment = (n) => {
    setIsManualInstallmentAmt(false);
    const total = Number(formData.amount || 0);
    const perInst = total > 0 ? Math.round(total / n) : '';
    setFormData(prev => ({
      ...prev,
      installments_total: String(n),
      installment_amount: perInst ? String(perInst) : prev.installment_amount
    }));
  };

  // จัดการอัปโหลดไฟล์รูปภาพสลิป
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('กรุณาเลือกไฟล์รูปภาพ (JPG, PNG, WebP) เท่านั้น');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('ขนาดรูปภาพต้องไม่เกิน 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Url = event.target.result;
      setSlipPreviewUrl(base64Url);
      setFormData(prev => ({ ...prev, slip_url: base64Url }));
      setErrorMsg('');
    };
    reader.onerror = () => {
      setErrorMsg('เกิดข้อผิดพลาดในการอ่านไฟล์รูปภาพ');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveSlip = () => {
    setSlipPreviewUrl('');
    setFormData(prev => ({ ...prev, slip_url: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerPicker = (e) => {
    try {
      if (typeof e.target.showPicker === 'function') {
        e.target.showPicker();
      }
    } catch (err) {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.driver_name) {
      setErrorMsg('กรุณาเลือกพนักงานขับรถ');
      return;
    }
    const amt = Number(formData.amount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('กรุณาระบุจำนวนเงินที่ถูกต้อง (มากกว่า 0 บาท)');
      return;
    }

    const isLoan = category === 'installment_loan';
    let instTotal = 1;
    let instAmt = amt;
    let instPaid = 0;

    if (isLoan) {
      instTotal = Math.max(1, Number(formData.installments_total || 1));
      instAmt = Number(formData.installment_amount) || Math.round(amt / instTotal);
      instPaid = Math.max(0, Number(formData.installments_paid || 0));

      if (instAmt <= 0) {
        setErrorMsg('กรุณาระบุยอดหักต่องวดที่ถูกต้อง (มากกว่า 0 บาท)');
        return;
      }
    }

    setSaving(true);
    setErrorMsg('');
    try {
      await onSave({
        ...formData,
        id: currentRecord?.id,
        category,
        advance_type: isLoan ? 'loan_installment' : formData.advance_type,
        amount: amt,
        installments_total: instTotal,
        installment_amount: instAmt,
        installments_paid: instPaid,
        remaining_amount: isLoan ? Math.max(0, amt - (instPaid * instAmt)) : (formData.status === 'settled' ? 0 : amt),
        start_period: isLoan ? (formData.start_period || formData.advance_date.slice(0, 7)) : formData.advance_date.slice(0, 7),
        slip_url: formData.slip_url ? formData.slip_url.trim() : '-'
      });
      onClose();
    } catch (err) {
      console.error('DriverAdvanceModal onSave error:', err);
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
    }
  };

  const calculateEndPeriod = (startStr, monthsCount) => {
    if (!startStr) return '-';
    try {
      const [y, m] = startStr.split('-').map(Number);
      const totalM = (y * 12 + (m - 1)) + (monthsCount - 1);
      const endY = Math.floor(totalM / 12);
      const endM = (totalM % 12) + 1;
      const mName = THAI_MONTHS.find(item => item.value === String(endM).padStart(2, '0'))?.label || endM;
      return `${mName} ${endY + 543}`;
    } catch (e) {
      return '-';
    }
  };

  const totalAmountNum = Number(formData.amount || 0);
  const instTotalNum = Math.max(1, Number(formData.installments_total || 1));
  const instAmtNum = Number(formData.installment_amount) || (totalAmountNum > 0 ? Math.round(totalAmountNum / instTotalNum) : 0);
  const instPaidNum = Number(formData.installments_paid || 0);
  const remainingNum = Math.max(0, totalAmountNum - (instPaidNum * instAmtNum));

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
        maxWidth: '540px',
        maxHeight: '92vh',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '22px' }}>
              {category === 'installment_loan' ? '🏦' : '💵'}
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                {currentRecord ? 'แก้ไขรายการเบิก / เงินยืม' : 'บันทึกเบิกเงินล่วงหน้า & เงินยืมก้อน'}
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#64748b' }}>
                ระบบบันทึกรายการหักเงินเดือนคนขับทั้งแบบงวดเดียวและผ่อนชำระ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              color: '#94a3b8',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {/* 🔀 Category Switcher (Tabs) */}
        <div style={{
          padding: '12px 20px 0 20px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px'
        }}>
          <button
            type="button"
            onClick={() => handleCategoryChange('single_advance')}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: category === 'single_advance' ? '2px solid #d97706' : '1px solid #e2e8f0',
              background: category === 'single_advance' ? '#fffbeb' : '#f8fafc',
              color: category === 'single_advance' ? '#b45309' : '#64748b',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <span>💵</span>
            <span>เบิกล่วงหน้า (หักงวดเดียว)</span>
          </button>

          <button
            type="button"
            onClick={() => handleCategoryChange('installment_loan')}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: category === 'installment_loan' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
              background: category === 'installment_loan' ? '#f5f3ff' : '#f8fafc',
              color: category === 'installment_loan' ? '#6d28d9' : '#64748b',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <span>🏦</span>
            <span>ยืมเงินก้อน (ผ่อนชำระ)</span>
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} style={{ padding: '16px 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {errorMsg && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '13px'
            }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {/* 📅 วันที่ & 👤 ชื่อคนขับ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                📅 {category === 'installment_loan' ? 'วันที่ทำสัญญายืม' : 'วันที่เบิกเงิน'} *
              </label>
              <input
                type="date"
                required
                value={formData.advance_date}
                onClick={triggerPicker}
                onFocus={triggerPicker}
                onChange={e => setFormData({ ...formData, advance_date: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  cursor: 'pointer',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                👤 พนักงานขับรถ *
              </label>
              <select
                required
                value={formData.driver_name}
                onChange={e => setFormData({ ...formData, driver_name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: '#fff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="">-- เลือกคนขับ --</option>
                {safeDriverList.map(d => (
                  <option key={d.id || d.driver_name} value={d.driver_name}>
                    {d.driver_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 💵 หมวดเบิกล่วงหน้างวดเดียว (Single Advance Fields) */}
          {category === 'single_advance' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#b45309', marginBottom: '4px' }}>
                  💰 จำนวนเงินที่เบิก (บาท) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  value={formData.amount}
                  onChange={e => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="เช่น 1000, 3000"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '2px solid #fed7aa',
                    fontSize: '15px',
                    fontWeight: 800,
                    color: '#b45309',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  🏷️ ประเภทการเบิก
                </label>
                <select
                  value={formData.advance_type}
                  onChange={e => setFormData({ ...formData, advance_type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    background: '#fff',
                    boxSizing: 'border-box'
                  }}
                >
                  {Object.entries(ADVANCE_TYPES)
                    .filter(([_, v]) => v.category === 'single_advance')
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.icon} {v.label}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          {/* 🏦 หมวดยืมเงินก้อนผ่อนชำระ (Installment Loan Fields) */}
          {category === 'installment_loan' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: '#faf5ff', padding: '14px', borderRadius: '12px', border: '1px solid #e9d5ff' }}>
              
              {/* ยอดเงินยืมทั้งหมด */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#6d28d9', marginBottom: '4px' }}>
                  💰 ยอดเงินยืมทั้งหมด (บาท) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  value={formData.amount}
                  onChange={e => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="เช่น 10000, 20000"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '2px solid #ddd6fe',
                    fontSize: '16px',
                    fontWeight: 800,
                    color: '#6d28d9',
                    background: '#ffffff',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* 📅 เริ่มหักในงวดเดือน (Cross-browser Month & Year Selector) */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#4c1d95', marginBottom: '4px' }}>
                  📅 เริ่มหักในงวดเดือน *
                </label>
                <MonthYearPicker
                  value={formData.start_period}
                  onChange={(newPeriod) => setFormData({ ...formData, start_period: newPeriod })}
                />
              </div>

              {/* จำนวนงวด & ปรับยอดหักต่องวด */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    🔢 จำนวนงวดที่ผ่อน *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="60"
                    value={formData.installments_total}
                    onChange={e => {
                      setIsManualInstallmentAmt(false);
                      setFormData({ ...formData, installments_total: e.target.value });
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '14px',
                      fontWeight: 700,
                      background: '#ffffff',
                      boxSizing: 'border-box'
                    }}
                  />
                  {/* Preset Buttons */}
                  <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                    {[2, 3, 4, 6, 10, 12].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handlePresetInstallment(n)}
                        style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: Number(formData.installments_total) === n ? '1px solid #7c3aed' : '1px solid #cbd5e1',
                          background: Number(formData.installments_total) === n ? '#7c3aed' : '#ffffff',
                          color: Number(formData.installments_total) === n ? '#ffffff' : '#475569',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        {n}งวด
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#6d28d9' }}>
                      💵 ยอดหักต่องวด (บาท/งวด) *
                    </label>
                    {isManualInstallmentAmt && (
                      <span style={{ fontSize: '10.5px', color: '#7c3aed', fontWeight: 600 }}>(กำหนดเอง)</span>
                    )}
                  </div>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    value={formData.installment_amount}
                    onChange={e => {
                      setIsManualInstallmentAmt(true);
                      setFormData({ ...formData, installment_amount: e.target.value });
                    }}
                    placeholder="คำนวณอัตโนมัติ"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '2px solid #ddd6fe',
                      fontSize: '14px',
                      fontWeight: 800,
                      color: '#6d28d9',
                      background: '#ffffff',
                      boxSizing: 'border-box'
                    }}
                  />
                  <span style={{ fontSize: '10.5px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    💡 คำนวณอัตโนมัติจากยอดรวม ÷ จำนวนงวด (แก้ไขได้)
                  </span>
                </div>
              </div>

              {/* กรณีโหมดแก้ไข: แสดงข้อมูลความคืบหน้างวด */}
              {advanceRecord && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', paddingTop: '8px', borderTop: '1px dashed #e9d5ff' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      ✅ ผ่อนชำระไปแล้ว (งวด)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={formData.installments_total}
                      value={formData.installments_paid}
                      onChange={e => setFormData({ ...formData, installments_paid: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12.5px',
                        background: '#fff'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      📌 ยอดหนี้คงเหลือ
                    </label>
                    <div style={{ padding: '6px 10px', borderRadius: '6px', background: '#f1f5f9', fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                      ฿{remainingNum.toLocaleString()}
                    </div>
                  </div>
                </div>
              )}

              {/* Interactive Calculation Preview Card */}
              {totalAmountNum > 0 && (
                <div style={{
                  background: '#ffffff',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  border: '1px solid #ddd6fe',
                  fontSize: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  color: '#4c1d95'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>📊 แผนการหักเงิน:</span>
                    <span>หักงวดละ ฿{instAmtNum.toLocaleString()} × {instTotalNum} งวด</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b21a8', fontSize: '11.5px' }}>
                    <span>📅 ระยะเวลาหักชำระ:</span>
                    <span>{THAI_MONTHS.find(m => m.value === formData.start_period.split('-')[1])?.label || ''} {Number(formData.start_period.split('-')[0]) + 543} ถึง {calculateEndPeriod(formData.start_period, instTotalNum)}</span>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* 💳 วิธีจ่ายเงินให้คนขับ */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
              💳 วิธีจ่ายเงินให้คนขับ
            </label>
            <div style={{ display: 'flex', gap: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="adv_pay_method"
                  value="transfer"
                  checked={formData.payment_method === 'transfer'}
                  onChange={e => setFormData({ ...formData, payment_method: e.target.value })}
                />
                🏦 โอนเงินเข้าบัญชี
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="adv_pay_method"
                  value="cash"
                  checked={formData.payment_method === 'cash'}
                  onChange={e => setFormData({ ...formData, payment_method: e.target.value })}
                />
                💵 เงินสด
              </label>
            </div>
          </div>

          {/* 📎 แนบสลิปการโอนเงิน / หลักฐาน (ไม่บังคับ) */}
          <div style={{
            background: '#f8fafc',
            border: '1px dashed #cbd5e1',
            borderRadius: '10px',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                📎 แนบสลิปโอนเงิน / ใบสำคัญจ่าย <span style={{ color: '#64748b', fontWeight: 400 }}>(ไม่บังคับ)</span>
              </label>
              {slipPreviewUrl && (
                <button
                  type="button"
                  onClick={handleRemoveSlip}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  🗑️ ลบรูปสลิป
                </button>
              )}
            </div>

            {/* Preview Box if slip uploaded */}
            {slipPreviewUrl ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '8px 12px'
              }}>
                <img
                  src={slipPreviewUrl}
                  alt="สลิปโอนเงิน"
                  style={{
                    width: '48px',
                    height: '48px',
                    objectFit: 'cover',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1'
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                    ✅ แนบสลิปเรียบร้อยแล้ว
                  </div>
                  <a
                    href={slipPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '11px', color: '#2563eb', textDecoration: 'underline' }}
                  >
                    🔍 คลิกดูรูปขนาดเต็ม
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  เปลี่ยนรูป
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#0f172a',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>📷</span>
                    <span>เลือกไฟล์รูปสลิปจากเครื่อง</span>
                  </button>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                    (รองรับ JPG, PNG, WebP สูงสุด 5MB)
                  </span>
                </div>
                
                {/* หรือใส่ URL */}
                <input
                  type="text"
                  value={formData.slip_url && !formData.slip_url.startsWith('data:') ? formData.slip_url : ''}
                  onChange={e => {
                    const url = e.target.value;
                    setFormData(prev => ({ ...prev, slip_url: url }));
                    setSlipPreviewUrl(url);
                  }}
                  placeholder="หรือวางลิงก์ URL สลิป/รูปภาพ..."
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    fontSize: '11.5px',
                    background: '#ffffff',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {/* 💬 หมายเหตุ */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
              💬 หมายเหตุ / เหตุผล
            </label>
            <input
              type="text"
              value={formData.remark}
              onChange={e => setFormData({ ...formData, remark: e.target.value })}
              placeholder={category === 'installment_loan' ? "เช่น สัญญายืมเงินก้อนซ่อมบ้าน, ยืมชำระค่าประกัน..." : "เช่น เบิกเงินเดือนล่วงหน้า, ค่าน้ำมันสำรอง..."}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* 💡 Information Banner */}
          <div style={{
            padding: '10px 12px',
            borderRadius: '8px',
            background: category === 'installment_loan' ? '#f5f3ff' : '#f0fdf4',
            border: category === 'installment_loan' ? '1px solid #ddd6fe' : '1px solid #bbf7d0',
            fontSize: '12px',
            color: category === 'installment_loan' ? '#5b21b6' : '#166534',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>💡</span>
            <span>
              {category === 'installment_loan' 
                ? <>ยอดเงินยืมนี้จะถูกแบ่งเป็น <b>"รายการหักอัตโนมัติงวดละ ฿{instAmtNum.toLocaleString()}"</b> ในแต่ละเดือนจนครบ {instTotalNum} งวด</>
                : <>ยอดเบิกล่วงหน้านี้จะถูกนำไปเป็น <b>"รายการหักอัตโนมัติเต็มจำนวน"</b> ในรอบเงินเดือนถัดไปของคนขับ</>}
            </span>
          </div>

          {/* Footer Buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '6px',
            paddingTop: '12px',
            borderTop: '1px solid #f1f5f9'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
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
                padding: '8px 22px',
                borderRadius: '8px',
                border: 'none',
                background: category === 'installment_loan'
                  ? 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)'
                  : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15)'
              }}
            >
              {saving ? 'กำลังบันทึก...' : (category === 'installment_loan' ? '💾 บันทึกสัญญายืมเงิน' : '💾 บันทึกรายการเบิก')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
