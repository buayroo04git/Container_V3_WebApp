import { describe, it, expect, beforeEach } from 'vitest';
import { createMockDatabase } from '../helpers/mockSupabase';

/**
 * 🚚 Truck Operations Scenarios (การทดสอบจำลองสถานการณ์การมอบหมายรถ, สลับรถ, และไทม์ไลน์)
 */

describe('Truck Operations & Driver Handover Scenarios', () => {
  let mock;

  beforeEach(() => {
    mock = createMockDatabase({
      truck_records: [
        { id: 1, truck_no: '101', assigned_driver_name: 'สมชาย', status: 'active' },
        { id: 2, truck_no: '102', assigned_driver_name: '-', status: 'active' }
      ],
      driver_records: [
        { id: 1, driver_name: 'สมชาย', assigned_truck_no: '101', status: 'active' },
        { id: 2, driver_name: 'วิชัย', assigned_truck_no: '-', status: 'active' },
        { id: 3, driver_name: 'สมศักดิ์', assigned_truck_no: '-', status: 'leave' }
      ],
      truck_operations: [
        { id: 'op-1', truck_no: '101', driver_name: 'สมชาย', start_date: '2026-06-01', end_date: null, status: 'active' }
      ],
      driver_leave_records: [
        { id: 'leave-1', driver_name: 'สมศักดิ์', start_date: '2026-08-10', end_date: null, is_indefinite: true, status: 'active_leave' }
      ]
    });
  });

  it('Scenario 2.1: [มอบหมายรถใหม่] มอบหมายรถว่าง 102 ให้คนขับวิชัยที่ยังไม่มีรถประจำ', async () => {
    const { client, db } = mock;

    const res = await client.rpc('assign_driver_to_truck_rpc', {
      p_truck_no: '102',
      p_driver_name: 'วิชัย',
      p_effective_date: '2026-08-23',
      p_remark: 'เริ่มประจำการรถ 102',
      p_created_by: 'Admin'
    });

    expect(res.error).toBeNull();
    expect(res.data.success).toBe(true);

    // ตรวจสอบสถานะรถ 102
    const truck102 = db.truck_records.find(t => t.truck_no === '102');
    expect(truck102.assigned_driver_name).toBe('วิชัย');

    // ตรวจสอบสถานะคนขับวิชัย
    const driverVichai = db.driver_records.find(d => d.driver_name === 'วิชัย');
    expect(driverVichai.assigned_truck_no).toBe('102');
    expect(driverVichai.status).toBe('active');

    // ตรวจสอบว่ามี Truck Operation active ใหม่เกิดขึ้น
    const activeOp = db.truck_operations.find(op => op.truck_no === '102' && op.status === 'active');
    expect(activeOp).toBeDefined();
    expect(activeOp.driver_name).toBe('วิชัย');
    expect(activeOp.start_date).toBe('2026-08-23');
    expect(activeOp.end_date).toBeNull();
  });

  it('Scenario 2.2: [ส่งมอบรถ/สลับคนขับ Handover] คนขับวิชัยมารับช่วงขับรถ 101 ต่อจากสมชาย', async () => {
    const { client, db } = mock;

    const res = await client.rpc('assign_driver_to_truck_rpc', {
      p_truck_no: '101',
      p_driver_name: 'วิชัย',
      p_effective_date: '2026-08-25',
      p_remark: 'รับมอบรถต่อจากสมชาย',
      p_created_by: 'Admin'
    });

    expect(res.error).toBeNull();

    // 1. งวดงานเดิมของสมชายต้องถูกปิด (end_date = 2026-08-25, status = completed)
    const oldOp = db.truck_operations.find(op => op.id === 'op-1');
    expect(oldOp.status).toBe('completed');
    expect(oldOp.end_date).toBe('2026-08-25');

    // 2. มีงวดงานใหม่ของวิชัยเปิดขึ้น (status = active, start_date = 2026-08-25)
    const newOp = db.truck_operations.find(op => op.truck_no === '101' && op.status === 'active');
    expect(newOp.driver_name).toBe('วิชัย');
    expect(newOp.start_date).toBe('2026-08-25');

    // 3. รถ 101 ชี้ไปที่วิชัย
    const truck101 = db.truck_records.find(t => t.truck_no === '101');
    expect(truck101.assigned_driver_name).toBe('วิชัย');
  });

  it('Scenario 2.3: [ปลดคนขับ Unassign] ปลดคนขับสมชายออกจากรถ 101', async () => {
    const { client, db } = mock;

    const res = await client.rpc('unassign_driver_truck_rpc', {
      p_truck_no: '101',
      p_effective_date: '2026-08-23',
      p_remark: 'ปลดคนขับชั่วคราว',
      p_created_by: 'Admin'
    });

    expect(res.error).toBeNull();

    // 1. รถ 101 ต้องว่าง
    const truck101 = db.truck_records.find(t => t.truck_no === '101');
    expect(truck101.assigned_driver_name).toBe('-');

    // 2. คนขับสมชายต้องไม่มีรถประจำ
    const somchai = db.driver_records.find(d => d.driver_name === 'สมชาย');
    expect(somchai.assigned_truck_no).toBe('-');

    // 3. งวดงานต้องถูกปิด
    const oldOp = db.truck_operations.find(op => op.id === 'op-1');
    expect(oldOp.status).toBe('completed');
    expect(oldOp.end_date).toBe('2026-08-23');
  });

  it('Scenario 2.4: [Auto-Complete Leave on Assignment] มอบหมายรถให้สมศักดิ์ที่กำลังอยู่ในสถานะลา', async () => {
    const { client, db } = mock;

    // สมศักดิ์กำลังลาตั้งแต่วันที่ 2026-08-10 แบบไม่มีกำหนด
    const initialLeave = db.driver_leave_records.find(l => l.driver_name === 'สมศักดิ์');
    expect(initialLeave.status).toBe('active_leave');

    // นำสมศักดิ์มามอบหมายรถ 102 เริ่มวิ่งวันที่ 2026-08-23
    const res = await client.rpc('assign_driver_to_truck_rpc', {
      p_truck_no: '102',
      p_driver_name: 'สมศักดิ์',
      p_effective_date: '2026-08-23',
      p_remark: 'กลับมาทำงานและรับมอบรถ',
      p_created_by: 'Admin'
    });

    expect(res.error).toBeNull();

    // 1. ใบลางานของสมศักดิ์ต้องถูกปิดอัตโนมัติ (status = completed, end_date = 2026-08-22 ก่อนวันเริ่มวิ่ง 1 วัน)
    const updatedLeave = db.driver_leave_records.find(l => l.driver_name === 'สมศักดิ์');
    expect(updatedLeave.status).toBe('completed');
    expect(updatedLeave.end_date).toBe('2026-08-22');

    // 2. สถานะคนขับต้องกลับเป็น active
    const somsak = db.driver_records.find(d => d.driver_name === 'สมศักดิ์');
    expect(somsak.status).toBe('active');
    expect(somsak.assigned_truck_no).toBe('102');
  });
});
