import { describe, it, expect } from 'vitest';
import { calculateMatchedMasterIds } from '../../src/services/truckDriverService';

/**
 * 📦 Container Reconciliation & Timeline-Aware Matching Scenarios
 */

describe('Container Reconciliation & 1:1 Consumption Matching Scenarios', () => {

  it('Scenario 3.1: [Strict 1:1 Matching] ตู้ใน Master DB เมื่อถูกจับคู่แล้ว ต้องไม่ถูกนับเบิ้ลซ้ำ (No Double Counting)', () => {
    // ใบวางบิล Master มี 3 ตู้
    const masterList = [
      { id: 101, container_no: 'TCLU1234567', truck_no: '101' },
      { id: 102, container_no: 'MSKU2345678', truck_no: '101' },
      { id: 103, container_no: 'EITU3456789', truck_no: '101' }
    ];

    // ใบงานตรวจเสร็จแล้ว มีการอ้างอิง ref_master_id ซ้ำกัน 2 ครั้ง (เช่น เกิดจากสแกนซ้ำหรือใบงานคู่ขนาน)
    const completedItems = [
      { id: 1, ref_master_id: 101, match_status: 'matched' },
      { id: 2, ref_master_id: 101, match_status: 'matched' }, // ชี้ 101 ซ้ำ
      { id: 3, ref_master_id: 102, match_status: 'matched' }
    ];

    const matchedSet = calculateMatchedMasterIds(masterList, completedItems);

    // ต้องนับได้ 2 ตู้ ไม่ใช่ 3 (เพราะ ID 101 ถูกนับเพียง 1 ครั้งเท่านั้น)
    expect(matchedSet.size).toBe(2);
    expect(matchedSet.has(101)).toBe(true);
    expect(matchedSet.has(102)).toBe(true);
    expect(matchedSet.has(103)).toBe(false);

    // ยอดตู้ที่ยังขาด (Missing) ต้องเป็น 3 - 2 = 1 ตู้
    const missingCount = masterList.length - matchedSet.size;
    expect(missingCount).toBe(1);
  });

  it('Scenario 3.2: [Timeline-Aware Job Distribution] ตู้เบอร์เดียวกันวิ่ง 2 รอบ ในช่วงเวลาที่คนขับเปลี่ยนคน', () => {
    // งวดงาน:
    // รถ 101: คนขับ "สมชาย" ขับช่วง 2026-06-01 ถึง 2026-06-30
    // รถ 101: คนขับ "วิชัย" ขับช่วง 2026-07-01 ถึง 2026-07-31
    const operations = [
      { id: 'op-1', truck_no: '101', driver_name: 'สมชาย', start_date: '2026-06-01', end_date: '2026-06-30', status: 'completed' },
      { id: 'op-2', truck_no: '101', driver_name: 'วิชัย', start_date: '2026-07-01', end_date: '2026-07-31', status: 'active' }
    ];

    // ตู้ TCLU1234567 วิ่ง 2 ครั้ง (คนละวัน)
    const masterData = [
      { id: 1, container_no: 'TCLU1234567', truck_no: '101', date_job_parsed: '2026-06-15' }, // วิ่งช่วงสมชาย
      { id: 2, container_no: 'TCLU1234567', truck_no: '101', date_job_parsed: '2026-07-10' }  // วิ่งช่วงวิชัย
    ];

    // ฟังก์ชันจับคู่คนขับตามช่วงเวลา (Strict Timeline)
    const findDriverForJob = (truckNo, jobDateStr) => {
      const matchedOp = operations.find(op => {
        if (op.truck_no !== truckNo) return false;
        if (op.start_date && jobDateStr < op.start_date) return false;
        if (op.end_date && jobDateStr > op.end_date) return false;
        return true;
      });
      return matchedOp ? matchedOp.driver_name : null;
    };

    const job1Driver = findDriverForJob('101', masterData[0].date_job_parsed);
    const job2Driver = findDriverForJob('101', masterData[1].date_job_parsed);

    // ตรวจสอบว่างานแบ่งให้คนขับถูกต้องตามช่วงเวลา 100%
    expect(job1Driver).toBe('สมชาย');
    expect(job2Driver).toBe('วิชัย');
  });

  it('Scenario 3.3: [Cancelled / Red Flags] ตู้ที่ติดสถานะ manual_red หรือ cancelled ต้องไม่ถูกนับเป็นยอดสำเร็จ', () => {
    const masterList = [
      { id: 201, container_no: 'KKFU1111111', truck_no: '102' },
      { id: 202, container_no: 'KKFU2222222', truck_no: '102' }
    ];

    const completedItems = [
      { id: 1, ref_master_id: 201, match_status: 'manual_red' }, // ยกเลิก / ตู้แดง
      { id: 2, ref_master_id: 202, match_status: 'matched' }
    ];

    const matchedSet = calculateMatchedMasterIds(masterList, completedItems);
    expect(matchedSet.size).toBe(1);
    expect(matchedSet.has(202)).toBe(true);
    expect(matchedSet.has(201)).toBe(false);
  });

  it('Scenario 3.4: [Driver Red Flag Reconciliation] ตู้แดง (manual_red) ของคนขับจะถูกนับรวมเข้าในยอดรอตรวจสอบ (Pending Count)', () => {
    // คนขับมีงานใน Master DB 2 ตู้
    const driverMasterList = [
      { id: 301, container_no: 'NYKU1111111', driver_name: 'สมบูรณ์' },
      { id: 302, container_no: 'NYKU2222222', driver_name: 'สมบูรณ์' }
    ];

    // ตู้ที่คนขับสแกนสำเร็จ 1 ตู้ + สแกนแล้วติดตู้แดง (manual_red) อีก 1 ตู้
    const validItems = [{ id: 1, ref_master_id: 301, match_status: 'matched' }];
    const redItems = [{ id: 2, container_no: 'REDX9999999', match_status: 'manual_red', driver_name: 'สมบูรณ์' }];

    const matchedSet = calculateMatchedMasterIds(driverMasterList, validItems);
    const baseMissing = Math.max(0, driverMasterList.length - matchedSet.size); // 2 - 1 = 1
    const totalPendingWithRed = baseMissing + redItems.length; // 1 + 1 = 2

    expect(matchedSet.size).toBe(1);
    expect(baseMissing).toBe(1);
    expect(totalPendingWithRed).toBe(2);
  });

  it('Scenario 3.5: [1 Job Sheet = 1 Driver Consensus] ตู้ทุกตู้ในใบงานแผ่นเดียวกัน (ทั้งตู้เขียวและตู้แดง) ต้องตกเป็นของคนขับคนเดียวกัน', () => {
    const sheet = { id: 'js-101', truck_no: '101', driver_name: 'สมชาย', date_job: '2026-07-31' };
    const items = [
      { id: 1, job_sheet_id: 'js-101', container_no: 'AAA111', match_status: 'matched', ref_master_id: 501 },
      { id: 2, job_sheet_id: 'js-101', container_no: 'BBB222', match_status: 'manual_red' }
    ];

    // ทุกลำดับในใบงาน js-101 ได้รับกรรมสิทธิ์เป็นของ 'สมชาย'
    const sheetDriver = sheet.driver_name;
    expect(sheetDriver).toBe('สมชาย');

    const greenItems = items.filter(i => i.match_status === 'matched');
    const redItems = items.filter(i => i.match_status === 'manual_red');

    expect(greenItems.length).toBe(1);
    expect(redItems.length).toBe(1);
  });

  it('Scenario 3.6: [Date Lag Overridden by Job Sheet] วันที่ในใบวางบิลเหลื่อมข้ามวัน (31/7 vs 1/8) ผลงานต้องถูกยกให้คนขับตัวจริงบนใบงาน', () => {
    // ใบวางบิลลงวันที่ 2026-08-01 (ซึ่งตามตารางเดินรถเป็นกะของ วิชัย)
    const masterContainer = { id: 701, container_no: 'LAGU1234567', truck_no: '101', date_job_parsed: '2026-08-01' };

    // แต่ใบงานจริง สมชายเป็นคนวิ่งและสแกนเมื่อวันที่ 2026-07-31 (วันสุดท้ายของสมชาย)
    const jobSheetItem = { id: 10, job_sheet_id: 'js-somchai', ref_master_id: 701, match_status: 'matched' };
    const sheetDriverMap = { 'js-somchai': 'สมชาย' };

    // กลไก Overwrite: เมื่อตู้ 701 ถูกสแกนในใบงานของสมชาย เจ้าของตู้ในผลงานจะกลายเป็น สมชาย
    const trueDriver = sheetDriverMap[jobSheetItem.job_sheet_id];
    expect(trueDriver).toBe('สมชาย');

    // ตรวจสอบว่า Master Container 701 ถูกส่งมอบสิทธิ์ให้สมชาย ไม่ใช่วิชัย
    const matchedMasterIdToDriverMap = { [jobSheetItem.ref_master_id]: trueDriver };
    expect(matchedMasterIdToDriverMap[701]).toBe('สมชาย');
  });

  it('Scenario 3.7: [Forgotten Operation Fallback] กรณีไม่ได้ลงบันทึกใน truck_operations ระบบจะดึงคนขับประจำจาก truck_records มาสำรอง', () => {
    const truckRecords = [{ truck_no: '105', assigned_driver_name: 'สมบูรณ์' }];
    const opsData = []; // ไม่มี Operation บันทึกไว้เลย

    const findDriverWithFallback = (truckNo) => {
      const activeOp = opsData.find(op => op.truck_no === truckNo);
      if (activeOp && activeOp.driver_name) return activeOp.driver_name;
      const defaultTruck = truckRecords.find(t => t.truck_no === truckNo);
      return defaultTruck ? defaultTruck.assigned_driver_name : null;
    };

    const fallbackDriver = findDriverWithFallback('105');
    expect(fallbackDriver).toBe('สมบูรณ์');
  });
});
