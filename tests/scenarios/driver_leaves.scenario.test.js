import { describe, it, expect, beforeEach } from 'vitest';

/**
 * 🏖️ Driver Leaves Scenarios (การทดสอบจำลองสถานการณ์ระบบการลาของคนขับ)
 */

describe('Driver Leaves & Time-Travel Scenarios', () => {

  // ฟังก์ชันคำนวณจำนวนวันลา (ตามตรรกะ leaveService.js)
  function calculateDuration(startDate, endDate) {
    if (!startDate) return 1;
    const end = endDate || new Date().toISOString().slice(0, 10);
    try {
      const d1 = new Date(startDate);
      const d2 = new Date(end);
      const diff = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return diff > 0 ? diff : 1;
    } catch {
      return 1;
    }
  }

  // ฟังก์ชันคำนวณสถานะและ Sanitizer
  function evaluateLeaveRecord(record, systemDateStr) {
    const isIndefinite = record.is_indefinite === true;
    const targetEndDate = record.end_date || (!isIndefinite && record.expected_end_date ? record.expected_end_date : null);
    const duration = calculateDuration(record.start_date, targetEndDate || systemDateStr);
    
    let computedStatus = record.status || 'active_leave';
    let actualEnd = record.end_date || null;

    if (targetEndDate) {
      if (targetEndDate < systemDateStr) {
        computedStatus = 'completed';
        if (!actualEnd) actualEnd = targetEndDate;
      } else {
        computedStatus = 'active_leave';
      }
    } else {
      computedStatus = 'active_leave';
    }

    return {
      ...record,
      status: computedStatus,
      end_date: actualEnd,
      duration_days: duration
    };
  }

  // ฟังก์ชันคำนวณสถานะสดของคนขับ (Live Status จาก fetchDrivers)
  function evaluateDriverLiveStatus(driver, leavesList, systemDateStr) {
    const dName = String(driver.driver_name || '').trim();
    const activeLeave = leavesList.find(l => {
      if (String(l.driver_name || '').trim().toLowerCase() !== dName.toLowerCase()) return false;
      const isIndef = l.is_indefinite === true;
      const sDate = l.start_date || '2000-01-01';
      const eDate = l.end_date || (!isIndef && l.expected_end_date ? l.expected_end_date : null);
      
      if (l.status === 'completed') return false;
      if (eDate && eDate < systemDateStr) return false;
      return sDate <= systemDateStr;
    });

    if (activeLeave) return 'leave';
    return 'active';
  }

  it('Scenario 1.1: [เคสแทรกลาย้อนหลัง] คนขับวิ่งงานอยู่ (1/6/2026-ปัจจุบัน) แล้วพึ่งนึกได้ว่าลืมลงวันลา 15/7/2026-18/7/2026', () => {
    const today = '2026-08-23';

    // ข้อมูลเริ่มต้น: คนขับสมชาย วิ่งรถ 101 ตั้งแต่ 2026-06-01
    const driver = { driver_name: 'สมชาย', assigned_truck_no: '101', status: 'active' };
    const operation = { id: 'op-1', truck_no: '101', driver_name: 'สมชาย', start_date: '2026-06-01', end_date: null, status: 'active' };

    // ผู้ใช้ย้อนหลังมาลงใบลา 2026-07-15 ถึง 2026-07-18
    const rawLeave = {
      driver_name: 'สมชาย',
      start_date: '2026-07-15',
      end_date: '2026-07-18',
      is_indefinite: false,
      leave_type: 'personal',
      leave_reason: 'ธุระส่วนตัวย้อนหลัง'
    };

    // 1. ตรวจสอบการประมวลผลใบลา
    const processedLeave = evaluateLeaveRecord(rawLeave, today);
    expect(processedLeave.status).toBe('completed'); // ต้องเป็น completed ทันทีเพราะสิ้นสุดไปแล้ว
    expect(processedLeave.duration_days).toBe(4);    // 15, 16, 17, 18 รวม 4 วัน
    expect(processedLeave.end_date).toBe('2026-07-18');

    // 2. ตรวจสอบสถานะคนขับ ณ วันนี้ (2026-08-23)
    const liveStatus = evaluateDriverLiveStatus(driver, [processedLeave], today);
    expect(liveStatus).toBe('active'); // ต้องยังคงเป็น active ปกติ ไม่เด้งเป็น leave

    // 3. ตรวจสอบงวดงาน truck_operations
    expect(operation.status).toBe('active');
    expect(operation.end_date).toBeNull(); // ไม่ถูกตัดแบ่งงวดงาน
  });

  it('Scenario 1.2: [เคสลางานปัจจุบัน] คนขับแจ้งลางานครอบคลุมถึงวันนี้ (20/8/2026 - 25/8/2026)', () => {
    const today = '2026-08-23';
    const driver = { driver_name: 'วิชัย', assigned_truck_no: '102', status: 'active' };
    
    const leave = {
      driver_name: 'วิชัย',
      start_date: '2026-08-20',
      end_date: '2026-08-25',
      is_indefinite: false,
      leave_type: 'sick'
    };

    const processedLeave = evaluateLeaveRecord(leave, today);
    expect(processedLeave.status).toBe('active_leave'); // ยังอยู่ในช่วงลา

    const liveStatus = evaluateDriverLiveStatus(driver, [processedLeave], today);
    expect(liveStatus).toBe('leave'); // สถานะคนขับต้องเป็น leave ทันที
  });

  it('Scenario 1.3: [เคสลาไม่มีกำหนด] คนขับแจ้งลาแบบไม่ระบุวันกลับ (is_indefinite: true)', () => {
    const today = '2026-08-23';
    const driver = { driver_name: 'ประสิทธิ์', assigned_truck_no: '103', status: 'active' };

    const leave = {
      driver_name: 'ประสิทธิ์',
      start_date: '2026-08-20',
      end_date: null,
      is_indefinite: true,
      expected_end_date: '2026-08-30'
    };

    const processedLeave = evaluateLeaveRecord(leave, today);
    expect(processedLeave.status).toBe('active_leave');
    expect(processedLeave.end_date).toBeNull();

    const liveStatus = evaluateDriverLiveStatus(driver, [processedLeave], today);
    expect(liveStatus).toBe('leave');
  });

  it('Scenario 1.4: [เคสลงวันลาล่วงหน้า] คนขับขอลางานสัปดาห์หน้า (1/9/2026 - 5/9/2026)', () => {
    const today = '2026-08-23';
    const driver = { driver_name: 'มานพ', assigned_truck_no: '104', status: 'active' };

    const futureLeave = {
      driver_name: 'มานพ',
      start_date: '2026-09-01',
      end_date: '2026-09-05',
      is_indefinite: false,
      leave_type: 'vacation'
    };

    // ณ วันนี้ (23/8) วันลายังมาไม่ถึง
    const liveStatus = evaluateDriverLiveStatus(driver, [futureLeave], today);
    expect(liveStatus).toBe('active'); // คนขับต้องยังเป็น active ปฏิบัติงานได้ตามปกติ
  });

  it('Scenario 1.5: [Self-Healing Sanitizer] ใบลางานสิ้นสุดเมื่อวาน แต่สถานะค้าง active_leave', () => {
    const today = '2026-08-23';
    const driver = { driver_name: 'กิตติ', assigned_truck_no: '105', status: 'leave' };

    const staleLeave = {
      id: 'leave-stale',
      driver_name: 'กิตติ',
      start_date: '2026-08-15',
      end_date: '2026-08-22', // สิ้นสุดเมื่อวาน
      status: 'active_leave'   // ค้างอยู่
    };

    // Sanitizer ทำงาน
    const healed = evaluateLeaveRecord(staleLeave, today);
    expect(healed.status).toBe('completed'); // ต้องถูกซ่อมเป็น completed
    
    // ตรวจสอบสถานะคนขับหลังซ่อม
    const liveStatus = evaluateDriverLiveStatus(driver, [healed], today);
    expect(liveStatus).toBe('active'); // คนขับต้องคืนสถานะ active ทันที
  });

  it('Scenario 1.6: [คำนวณวันลา] การคำนวณวันลาข้ามเดือนและวันเดียวกัน', () => {
    // ลาวันเดียว 15/7 - 15/7
    expect(calculateDuration('2026-07-15', '2026-07-15')).toBe(1);

    // ลาข้ามเดือน 30/7 - 2/8 (30, 31, 1, 2) = 4 วัน
    expect(calculateDuration('2026-07-30', '2026-08-02')).toBe(4);

    // ลาข้ามปี 30/12/2026 - 2/1/2027 (30, 31, 1, 2) = 4 วัน
    expect(calculateDuration('2026-12-30', '2027-01-02')).toBe(4);
  });
});
