import React, { useState, useEffect } from 'react';
import { driverPayrollService } from '../../services/driverPayrollService';
import Badge from '../ui/Badge';

/**
 * 💳 Modal ยืนยันการตัดจ่ายเงินให้คนขับ (Payment Settlement Modal)
 * บันทึกสถานะการจ่ายเงิน ป้องกันการนำตู้ไปคำนวณเงินซ้ำในงวดถัดไป
 */
export default function PaymentSettlementModal({
  isOpen,
  onClose,
  driverSummary,
  dateRange,
  onSuccess
}) {
  const [note, setNote] = useState('');
  const [paidBy, setPaidBy] = useState('Admin');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setNote(`ตัดรอบงวดวันที่ ${dateRange?.start || 'เริ่มต้น'} ถึง ${dateRange?.end || 'ปัจจุบัน'}`);
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, dateRange]);

  if (!isOpen || !driverSummary) return null;

  // รายการตู้ที่ยังไม่ตัดรอบ (unpaid)
  const unpaidContainers = (driverSummary.containers || []).filter(c => c.payment_status !== 'paid');
  const unpaidItemIds = unpaidContainers.map(c => c.id).filter(Boolean);
  const totalAmountToPay = unpaidContainers.reduce((sum, c) => sum + (c.unit_price || 0), 0);

  const handleConfirmPayment = async () => {
    if (unpaidItemIds.length === 0) {
      alert('ไม่มีรายการตู้ที่รอตัดรอบสำหรับคนขับท่านนี้');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const res = await driverPayrollService.markContainersPaid({
        driverName: driverSummary.driver_name,
        itemIds: unpaidItemIds,
        periodStart: dateRange?.start || null,
        periodEnd: dateRange?.end || null,
        totalAmount: totalAmountToPay,
        note: note.trim() || `ตัดรอบค่ารอบคนขับ ${driverSummary.driver_name}`,
        paidBy: paidBy.trim() || 'Admin'
      });

      if (!res.success) {
        throw new Error(res.error || 'ไม่สามารถบันทึกการตัดรอบได้');
      }

      if (onSuccess) {
        onSuccess(res);
      }
      onClose();
    } catch (err) {
      console.error('Confirm payment settlement error:', err);
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการตัดรอบ');
    } finally {
      setIsSubmitting(false);
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
        maxWidth: '560px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>💳</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc' }}>
                ยืนยันการตัดรอบค่ารอบ
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                บันทึกสถานะตัดรอบแล้วเพื่อป้องกันการคิดเงินซ้ำ
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

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {errorMsg && (
            <div style={{
              padding: '12px 16px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#b91c1c',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Driver & Payout Summary Card */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>พนักงานขับรถ:</span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                🚚 {driverSummary.driver_name}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>งวดวันที่:</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                📅 {dateRange?.start || 'ทั้งหมด'} ถึง {dateRange?.end || 'ปัจจุบัน'}
              </span>
            </div>

            <div style={{ height: '1px', background: '#e2e8f0', margin: '2px 0' }} />

            {/* รายได้ */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: '#475569' }}>📦 ค่ารอบวิ่งงาน ({unpaidContainers.length} ตู้):</span>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>+฿{totalAmountToPay.toLocaleString()}</span>
            </div>

            {Number(driverSummary.special_bonus || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                <span style={{ color: '#b45309' }}>🎁 เงินพิเศษ (Incentive {driverSummary.total_containers} งาน):</span>
                <span style={{ fontWeight: 700, color: '#b45309' }}>+฿{Number(driverSummary.special_bonus).toLocaleString()}</span>
              </div>
            )}

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: '8px',
              marginTop: '4px'
            }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#065f46' }}>
                💰 ยอดรวมตัดรอบจ่าย:
              </span>
              <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#059669' }}>
                ฿{(totalAmountToPay + (driverSummary.special_bonus || 0)).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Form Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
              📝 บันทึกข้อความ / เลขอ้างอิงการโอนเงิน (Note):
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น โอนเข้าบัญชี กสิกรไทย งวดวันที่ 1-15 ส.ค. 69"
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
              👤 ผู้บันทึกการตัดรอบ (Authorized By):
            </label>
            <input
              type="text"
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              placeholder="Admin"
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>

          <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>
            💡 <strong>คำแนะนำ:</strong> เมื่อกดบันทึกแล้ว ตู้ทั้งหมด {unpaidContainers.length} ตู้ในงวดนี้จะถูกปรับสถานะเป็น <code style={{ color: '#059669' }}>paid</code> (ตัดรอบแล้ว) และจะไม่ถูกนำมารวมในการคิดเงินของงวดถัดไปอีก (สามารถดูประวัติหรือยกเลิกย้อนหลังได้ในแท็บ "ประวัติการตัดรอบ")
          </p>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleConfirmPayment}
            disabled={isSubmitting || unpaidContainers.length === 0}
            style={{
              padding: '9px 22px',
              borderRadius: '8px',
              border: 'none',
              background: unpaidContainers.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              color: '#ffffff',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: unpaidContainers.length === 0 || isSubmitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 6px -1px rgba(5, 150, 105, 0.2)'
            }}
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>กำลังบันทึก...</span>
              </>
            ) : (
              <>
                <span>💳</span>
                <span>ยืนยันการตัดรอบ</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
