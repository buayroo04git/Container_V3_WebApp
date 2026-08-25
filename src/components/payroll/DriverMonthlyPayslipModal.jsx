import React, { useRef } from 'react';

/**
 * 📄 Modal แสดงและพิมพ์สลิปเงินเดือนคนขับประจำเดือน (Driver Monthly Payslip)
 */
export default function DriverMonthlyPayslipModal({ isOpen, onClose, monthlyRecord = null, yearMonth = '' }) {
  const printRef = useRef(null);

  if (!isOpen || !monthlyRecord) return null;

  const formatMoney = (val) => Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const formatMonthDisplay = (ym) => {
    if (!ym) return '';
    try {
      const [y, m] = ym.split('-');
      const months = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
      const thaiYear = Number(y) + 543;
      return `${months[Number(m)]} ${thaiYear}`;
    } catch (e) {
      return ym;
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.7)',
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
        maxWidth: '680px',
        maxHeight: '92vh',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid #cbd5e1',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Modal Top Toolbar */}
        <div style={{
          padding: '14px 24px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>📄</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                ใบแจ้งยอดรายได้ & เงินเดือนคนขับ (Payslip)
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                ประจำเดือน {formatMonthDisplay(yearMonth)}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🖨️ พิมพ์สลิป
            </button>
            <button
              type="button"
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
        </div>

        {/* Printable Payslip Body */}
        <div ref={printRef} style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Company / Header Card */}
          <div style={{
            borderBottom: '2px dashed #e2e8f0',
            paddingBottom: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                🏢 ใบแจ้งยอดรายได้พนักงานขับรถ (Driver Monthly Payslip)
              </div>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                งวดประจำเดือน: <strong style={{ color: '#0f172a' }}>{formatMonthDisplay(yearMonth)}</strong>
              </div>
            </div>

            <div style={{ textAlign: 'right', fontSize: '12.5px' }}>
              <div style={{ color: '#64748b' }}>วันที่พิมพ์: {new Date().toLocaleDateString('th-TH')}</div>
              <div style={{ fontWeight: 700, color: '#059669', marginTop: '2px' }}>สถานะ: อนุมัติตัดจ่าย</div>
            </div>
          </div>

          {/* Driver Information Card */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '10px',
            fontSize: '13px'
          }}>
            <div>
              <span style={{ color: '#64748b' }}>👤 ชื่อพนักงาน:</span>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px', marginTop: '2px' }}>
                {monthlyRecord.driver_name}
              </div>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>🚚 เบอร์รถประจำ/วิ่งงาน:</span>
              <div style={{ fontWeight: 700, color: '#1d4ed8', marginTop: '2px' }}>
                {monthlyRecord.assigned_truck_no || '-'}
              </div>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>📦 จำนวนตู้ที่วิ่งได้:</span>
              <div style={{ fontWeight: 700, color: '#059669', marginTop: '2px' }}>
                {monthlyRecord.total_containers || 0} ตู้ (20': {monthlyRecord.count_20 || 0}, 40': {monthlyRecord.count_40 || 0})
              </div>
            </div>
          </div>

          {/* 2-Column Earnings & Deductions Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '14px' }}>
            
            {/* 🟢 Column 1: รายการรับ (Earnings) */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #bbf7d0',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#15803d', borderBottom: '1px solid #dcfce7', paddingBottom: '6px' }}>
                💰 รายการรับ (Earnings)
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#334155' }}>
                <span>💵 ฐานเงินเดือนประจำ:</span>
                <span style={{ fontWeight: 700 }}>฿{formatMoney(monthlyRecord.base_salary)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#334155' }}>
                <span>📦 ค่ารอบตู้ 20’ ({monthlyRecord.count_20 || 0} ตู้):</span>
                <span style={{ fontWeight: 600 }}>฿{formatMoney(monthlyRecord.earnings_20)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#334155' }}>
                <span>📦 ค่ารอบตู้ 40’ ({monthlyRecord.count_40 || 0} ตู้):</span>
                <span style={{ fontWeight: 600 }}>฿{formatMoney(monthlyRecord.earnings_40)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#b45309' }}>
                <span>🎁 เงินพิเศษ (โบนัส {monthlyRecord.total_containers || 0} ตู้):</span>
                <span style={{ fontWeight: 700 }}>+฿{formatMoney(monthlyRecord.special_bonus)}</span>
              </div>

              <div style={{ borderTop: '1px solid #dcfce7', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', fontWeight: 800, color: '#15803d' }}>
                <span>รวมรายได้ทั้งหมด (Gross):</span>
                <span>฿{formatMoney(monthlyRecord.gross_income)}</span>
              </div>
            </div>

            {/* 🔴 Column 2: รายการหัก (Deductions) */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#b91c1c', borderBottom: '1px solid #fee2e2', paddingBottom: '6px' }}>
                🔻 รายการหัก (Deductions)
              </div>

              {monthlyRecord.tax_profile === 'social_security' ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#dc2626' }}>
                  <span>🏥 ประกันสังคม (สปส.):</span>
                  <span style={{ fontWeight: 700 }}>-฿{formatMoney(monthlyRecord.sso_amount)}</span>
                </div>
              ) : monthlyRecord.tax_profile === 'withholding_3pct' ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#d97706' }}>
                  <span>📑 หัก ณ ที่จ่าย 3%:</span>
                  <span style={{ fontWeight: 700 }}>-฿{formatMoney(monthlyRecord.wht_amount)}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#64748b' }}>
                  <span>⚪ ภาษี / ประกันสังคม:</span>
                  <span>-</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: '#dc2626' }}>
                <span>💸 หักเบิกล่วงหน้า / เงินยืม:</span>
                <span style={{ fontWeight: 700 }}>
                  {monthlyRecord.advance_amount > 0 ? `-฿${formatMoney(monthlyRecord.advance_amount)}` : '-'}
                </span>
              </div>

              {monthlyRecord.advances_list && monthlyRecord.advances_list.length > 0 && (
                <div style={{
                  background: '#fef2f2',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '11px',
                  color: '#991b1b',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  {monthlyRecord.advances_list.map((adv, idx) => {
                    const isLoan = adv.category === 'installment_loan' || adv.advance_type === 'loan_installment';
                    const label = adv.display_label || (isLoan ? `ยืมเงินก้อน (งวด ${adv.current_installment_no || '1'}/${adv.installments_total || '1'})` : 'เบิกเงินล่วงหน้า');
                    const amt = adv.deduct_this_period || adv.display_amount || adv.amount;
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>• {label}:</span>
                        <span style={{ fontWeight: 700 }}>-฿{formatMoney(amt)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ borderTop: '1px solid #fee2e2', paddingTop: '8px', marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', fontWeight: 800, color: '#b91c1c' }}>
                <span>รวมรายการหักทั้งหมด:</span>
                <span>-฿{formatMoney(monthlyRecord.total_deductions)}</span>
              </div>
            </div>

          </div>

          {/* 🏆 Net Payout Bottom Highlight Banner */}
          <div style={{
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            borderRadius: '12px',
            padding: '16px 20px',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 6px -1px rgba(5, 150, 105, 0.2)'
          }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#a7f3d0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                🏆 ยอดโอนรับสุทธิประจำเดือน (Net Payout)
              </div>
              <div style={{ fontSize: '12px', color: '#e6fffa', marginTop: '2px' }}>
                (รายได้รวม ฿{formatMoney(monthlyRecord.gross_income)} - รวมหัก ฿{formatMoney(monthlyRecord.total_deductions)})
              </div>
            </div>

            <div style={{ fontSize: '26px', fontWeight: 900, color: '#ffffff' }}>
              ฿{formatMoney(monthlyRecord.total_net_payout)}
            </div>
          </div>

          {/* Signatures */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '30px',
            marginTop: '20px',
            paddingTop: '20px',
            borderTop: '1px solid #e2e8f0',
            textAlign: 'center',
            fontSize: '12px',
            color: '#64748b'
          }}>
            <div>
              <div style={{ height: '40px', borderBottom: '1px solid #94a3b8', margin: '0 auto 8px auto', width: '180px' }} />
              <div>ลงชื่อ .................................................... (ผู้จัดทำ)</div>
              <div style={{ marginTop: '2px' }}>วันที่: ____/____/________</div>
            </div>

            <div>
              <div style={{ height: '40px', borderBottom: '1px solid #94a3b8', margin: '0 auto 8px auto', width: '180px' }} />
              <div>ลงชื่อ .................................................... (พนักงานขับรถ)</div>
              <div style={{ marginTop: '2px' }}>วันที่: ____/____/________</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
