import { describe, it, expect } from 'vitest';

/**
 * 🪪 Compliance, Expiry & Human Date Error Scenarios
 * (การทดสอบจำลองสถานการณ์วันหมดอายุใบขับขี่, ภาษี, พ.ร.บ., ประกันภัย และความผิดพลาดจากการกรอกวันที่)
 */

describe('Compliance, Expiry & Human Date Error Scenarios', () => {

  // ฟังก์ชันคำนวณสถานะวันหมดอายุ (Expired, Expiring Soon <= 30 วัน, Valid)
  function checkExpiryStatus(expiryDateStr, systemDateStr) {
    if (!expiryDateStr || expiryDateStr === '-') return { status: 'none', daysLeft: null, label: 'ไม่ได้ระบุ' };
    
    try {
      const expDate = new Date(expiryDateStr);
      const curDate = new Date(systemDateStr);
      
      if (isNaN(expDate.getTime()) || isNaN(curDate.getTime())) {
        return { status: 'none', daysLeft: null, label: 'วันที่ไม่ถูกต้อง' };
      }

      const diffTime = expDate.getTime() - curDate.getTime();
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (daysLeft < 0) {
        return { status: 'expired', daysLeft, label: `⚠️ หมดอายุแล้ว (${Math.abs(daysLeft)} วัน)` };
      } else if (daysLeft <= 30) {
        return { status: 'expiring_soon', daysLeft, label: `🟡 ใกล้หมดอายุ (เหลือ ${daysLeft} วัน)` };
      } else {
        return { status: 'valid', daysLeft, label: `🟢 ปกติ (เหลือ ${daysLeft} วัน)` };
      }
    } catch {
      return { status: 'none', daysLeft: null, label: 'ข้อผิดพลาด' };
    }
  }

  // ฟังก์ชันตรวจจับการลงวันลาซ้อนทับกัน (Overlap Detection)
  function detectLeaveOverlap(newLeave, existingLeaves) {
    const newStart = newLeave.start_date;
    const newEnd = newLeave.end_date || newLeave.expected_end_date || newStart;
    const driver = String(newLeave.driver_name || '').trim().toLowerCase();

    const conflicts = existingLeaves.filter(item => {
      if (item.id && newLeave.id && item.id === newLeave.id) return false;
      if (String(item.driver_name || '').trim().toLowerCase() !== driver) return false;
      if (item.status === 'cancelled') return false;

      const itemStart = item.start_date;
      const itemEnd = item.end_date || item.expected_end_date || itemStart;

      // ตรวจสอบว่าช่วงเวลาคาบเกี่ยวกันหรือไม่: (StartA <= EndB) and (EndA >= StartB)
      return (newStart <= itemEnd) && (newEnd >= itemStart);
    });

    return {
      hasOverlap: conflicts.length > 0,
      conflictingRecords: conflicts
    };
  }

  // ฟังก์ชันป้องกันวันที่กลับด้าน (Inverted Dates: end_date < start_date)
  function sanitizeDateRange(startDate, endDate) {
    if (!startDate) return { startDate: new Date().toISOString().slice(0, 10), endDate, isFixed: false };
    if (!endDate) return { startDate, endDate: null, isFixed: false };

    if (endDate < startDate) {
      // สลับวันที่ให้ถูกต้อง หรือปรับวันสิ้นสุดให้เท่ากับวันเริ่ม
      return {
        startDate: endDate,
        endDate: startDate,
        isFixed: true,
        warning: 'วันสิ้นสุดมาก่อนวันเริ่ม ระบบสลับลำดับวันที่ให้อัตโนมัติ'
      };
    }

    return { startDate, endDate, isFixed: false };
  }

  describe('1. 🪪 ตรวจสอบใบขับขี่คนขับ (Driver License Compliance)', () => {
    const today = '2026-08-23';

    it('Scenario 4.1.1: [ใบขับขี่หมดอายุแล้ว] หมดอายุวันที่ 15/8/2026 แต่วันนี้ 23/8/2026', () => {
      const result = checkExpiryStatus('2026-08-15', today);
      expect(result.status).toBe('expired');
      expect(result.daysLeft).toBe(-8); // หมดอายุมาแล้ว 8 วัน
      expect(result.label).toContain('หมดอายุแล้ว');
    });

    it('Scenario 4.1.2: [ใบขับขี่ใกล้หมดอายุ] จะหมดอายุในอีก 15 วัน (7/9/2026)', () => {
      const result = checkExpiryStatus('2026-09-07', today);
      expect(result.status).toBe('expiring_soon');
      expect(result.daysLeft).toBe(15);
      expect(result.label).toContain('ใกล้หมดอายุ');
    });

    it('Scenario 4.1.3: [ใบขับขี่ยังไม่หมดอายุ] เหลือเวลาอีก 1 ปี (23/8/2027)', () => {
      const result = checkExpiryStatus('2027-08-23', today);
      expect(result.status).toBe('valid');
      expect(result.daysLeft).toBe(365);
    });
  });

  describe('2. 🚛 ตรวจสอบภาษี, พ.ร.บ. และประกันภัยรถยนต์ (Truck Fleet Compliance)', () => {
    const today = '2026-08-23';

    it('Scenario 4.2.1: [ภาษีรถประจำปีหมดอายุ] tax_expiry_date = 2026-08-01', () => {
      const truck = {
        truck_no: '101',
        tax_expiry_date: '2026-08-01',
        act_expiry_date: '2026-12-31',
        insurance_expiry_date: '2027-03-31'
      };

      const taxCheck = checkExpiryStatus(truck.tax_expiry_date, today);
      const actCheck = checkExpiryStatus(truck.act_expiry_date, today);
      const insCheck = checkExpiryStatus(truck.insurance_expiry_date, today);

      expect(taxCheck.status).toBe('expired'); // ภาษีหมดอายุ
      expect(actCheck.status).toBe('valid');   // พ.ร.บ. ยังไม่หมด
      expect(insCheck.status).toBe('valid');   // ประกันยังไม่หมด
    });

    it('Scenario 4.2.2: [พ.ร.บ. และประกันภัยใกล้หมดอายุพร้อมกัน]', () => {
      const truck = {
        truck_no: '102',
        tax_expiry_date: '2027-01-15',
        act_expiry_date: '2026-09-01',       // เหลือ 9 วัน
        insurance_expiry_date: '2026-09-10'  // เหลือ 18 วัน
      };

      const actCheck = checkExpiryStatus(truck.act_expiry_date, today);
      const insCheck = checkExpiryStatus(truck.insurance_expiry_date, today);

      expect(actCheck.status).toBe('expiring_soon');
      expect(insCheck.status).toBe('expiring_soon');
    });
  });

  describe('3. ⚠️ ความผิดพลาดจากการกรอกวันที่ (Human Date Errors)', () => {
    it('Scenario 1.1: [กรอกวันสิ้นสุดมาก่อนวันเริ่ม] start: 20/8/2026, end: 15/8/2026', () => {
      const sanitized = sanitizeDateRange('2026-08-20', '2026-08-15');
      expect(sanitized.isFixed).toBe(true);
      expect(sanitized.startDate).toBe('2026-08-15');
      expect(sanitized.endDate).toBe('2026-08-20');
    });

    it('Scenario 1.2: [ลงวันลาซ้อนทับกัน] นายสมชายมีใบลา 1-5 ส.ค. อยู่แล้ว แล้วมีคนมาลง 3-7 ส.ค. ซ้ำ', () => {
      const existingLeaves = [
        { id: 'leave-1', driver_name: 'สมชาย', start_date: '2026-08-01', end_date: '2026-08-05', status: 'completed' }
      ];

      const newLeaveAttempt = {
        id: 'leave-2',
        driver_name: 'สมชาย',
        start_date: '2026-08-03',
        end_date: '2026-08-07'
      };

      const overlapCheck = detectLeaveOverlap(newLeaveAttempt, existingLeaves);
      expect(overlapCheck.hasOverlap).toBe(true);
      expect(overlapCheck.conflictingRecords.length).toBe(1);
      expect(overlapCheck.conflictingRecords[0].id).toBe('leave-1');
    });

    it('Scenario 1.3: [ลงวันลาคนละช่วงเวลาไม่ซ้อนทับ] นายสมชายลา 1-5 ส.ค. และมาลงเพิ่ม 10-15 ส.ค.', () => {
      const existingLeaves = [
        { id: 'leave-1', driver_name: 'สมชาย', start_date: '2026-08-01', end_date: '2026-08-05', status: 'completed' }
      ];

      const newLeaveValid = {
        id: 'leave-3',
        driver_name: 'สมชาย',
        start_date: '2026-08-10',
        end_date: '2026-08-15'
      };

      const overlapCheck = detectLeaveOverlap(newLeaveValid, existingLeaves);
      expect(overlapCheck.hasOverlap).toBe(false);
    });
  });
});
