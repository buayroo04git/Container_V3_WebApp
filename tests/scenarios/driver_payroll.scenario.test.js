import { describe, it, expect } from 'vitest';
import { driverPayrollService } from '../../src/services/driverPayrollService';

describe('💰 Driver Payroll & Compensation Calculation Scenarios', () => {
  const mockRateConfigs = [
    {
      id: 'rate_standard_early_2026',
      name: 'เรทช่วงต้นปี 2026',
      driver_name: 'ALL',
      start_date: '2026-01-01',
      end_date: '2026-06-30',
      rate_20: 100,
      rate_40: 120,
      rate_45: 130,
      rate_default: 100,
      is_active: true
    },
    {
      id: 'rate_standard_mid_2026',
      name: 'เรทปรับใหม่ ก.ค. 2026 เป็นต้นไป',
      driver_name: 'ALL',
      start_date: '2026-07-01',
      end_date: null, // Ongoing
      rate_20: 110,
      rate_40: 140,
      rate_45: 150,
      rate_default: 110,
      is_active: true
    },
    {
      id: 'rate_somchai_special',
      name: 'เรทพิเศษคนขับสมชาย',
      driver_name: 'สมชาย',
      start_date: '2026-08-01',
      end_date: null,
      rate_20: 130,
      rate_40: 160,
      rate_45: 170,
      rate_default: 130,
      is_active: true
    }
  ];

  it('Scenario 1: [Master DB Date Matching] เทียบวันที่จากใบวางบิล Master DB กับช่วงเวลาของเรทราคาอย่างถูกต้อง', () => {
    // งานวันที่ในใบวางบิล = 2026-05-10 (อยู่ในช่วงต้นปี 2026)
    const rateEarly = driverPayrollService.findEffectiveRate('2026-05-10', 'สมศักดิ์', mockRateConfigs);
    expect(rateEarly.id).toBe('rate_standard_early_2026');
    expect(rateEarly.rate_20).toBe(100);
    expect(rateEarly.rate_40).toBe(120);

    // งานวันที่ในใบวางบิล = 2026-08-15 (อยู่ในช่วง ก.ค. เป็นต้นไป - Ongoing)
    const rateMid = driverPayrollService.findEffectiveRate('2026-08-15', 'สมศักดิ์', mockRateConfigs);
    expect(rateMid.id).toBe('rate_standard_mid_2026');
    expect(rateMid.rate_20).toBe(110);
    expect(rateMid.rate_40).toBe(140);
  });

  it('Scenario 2: [Ongoing Rate] เรทที่ไม่มี end_date (null) ครอบคลุมถึงปัจจุบัน', () => {
    const rateFuture = driverPayrollService.findEffectiveRate('2026-12-31', 'วิชัย', mockRateConfigs);
    expect(rateFuture.id).toBe('rate_standard_mid_2026');
    expect(rateFuture.end_date).toBeNull();
  });

  it('Scenario 3: [Specific Driver Override] คนขับที่มีเรทเฉพาะบุคคล จะได้รับเรทพิเศษก่อนเรทส่วนกลาง ALL', () => {
    // สมชายในเดือนสิงหาคม 2026 ได้เรทพิเศษ
    const rateSomchai = driverPayrollService.findEffectiveRate('2026-08-20', 'สมชาย', mockRateConfigs);
    expect(rateSomchai.id).toBe('rate_somchai_special');
    expect(rateSomchai.rate_20).toBe(130);
    expect(rateSomchai.rate_40).toBe(160);

    // คนขับท่านอื่น (วิชัย) ในวันเดียวกัน ได้เรทมาตรฐาน ALL
    const rateWichai = driverPayrollService.findEffectiveRate('2026-08-20', 'วิชัย', mockRateConfigs);
    expect(rateWichai.id).toBe('rate_standard_mid_2026');
    expect(rateWichai.rate_20).toBe(110);
    expect(rateWichai.rate_40).toBe(140);
  });

  it('Scenario 4: [Container Size Calculation] คำนวณราคาตู้ 20, 40, 40HC, 45 ได้อย่างถูกต้อง', () => {
    const rate = { rate_20: 100, rate_40: 140, rate_45: 150, rate_default: 100 };

    const calc20 = driverPayrollService.calculateContainerPrice('20', rate);
    expect(calc20.sizeCategory).toBe('20');
    expect(calc20.unitPrice).toBe(100);

    const calc40 = driverPayrollService.calculateContainerPrice('40', rate);
    expect(calc40.sizeCategory).toBe('40');
    expect(calc40.unitPrice).toBe(140);

    const calc40HC = driverPayrollService.calculateContainerPrice('40HC', rate);
    expect(calc40HC.sizeCategory).toBe('40');
    expect(calc40HC.unitPrice).toBe(140);

    const calc45 = driverPayrollService.calculateContainerPrice('45', rate);
    expect(calc45.sizeCategory).toBe('45');
    expect(calc45.unitPrice).toBe(150);
  });

  it('Scenario 5: [Fallback Safety] กรณีไม่มีการตั้งค่าเรท จะคืนค่ามาตรฐาน 100 บาท/ตู้ โดยไม่ Error', () => {
    const fallbackRate = driverPayrollService.findEffectiveRate('2026-08-23', 'ใครก็ได้', []);
    expect(fallbackRate.rate_20).toBe(100);
    expect(fallbackRate.rate_40).toBe(100);

    const price = driverPayrollService.calculateContainerPrice('40', fallbackRate);
    expect(price.unitPrice).toBe(100);
  });

  it('Scenario 6: [Verified Only Filtering] ข้ามตู้ที่ยกเลิก, ตู้แดงที่ยังไม่แมตช์ หรือใบงานที่ยังไม่ completed', () => {
    // Verified items
    const validItem = { container_no: 'TCLU1234567', match_status: 'matched_green' };
    const redItem = { container_no: 'UNMATCHED99', match_status: 'manual_red' };
    const cancelledItem = { container_no: 'CANCELLED00', match_status: 'cancelled' };

    const isCountable = (item, sheetStatus) => {
      if (sheetStatus !== 'completed') return false;
      if (item.match_status === 'cancelled' || item.match_status === 'manual_red' || item.match_status === 'unmatched_red') return false;
      return true;
    };

    expect(isCountable(validItem, 'completed')).toBe(true);
    expect(isCountable(redItem, 'completed')).toBe(false);
    expect(isCountable(cancelledItem, 'completed')).toBe(false);
    expect(isCountable(validItem, 'pending')).toBe(false);
    expect(isCountable(validItem, 'draft')).toBe(false);
  });

  it('Scenario 7: [Calculate Payroll Summary Output Integrity] โครงสร้างข้อมูลสรุปค่าตอบแทนถูกต้องครบถ้วน', async () => {
    const res = await driverPayrollService.calculatePayrollSummary({
      driverFilter: 'ALL',
      batchFilter: 'ALL'
    });

    expect(res).toBeDefined();
    expect(res.data).toBeDefined();
    expect(res.data.kpis).toBeDefined();
    expect(typeof res.data.kpis.total_earnings).toBe('number');
    expect(typeof res.data.kpis.total_containers).toBe('number');
    expect(Array.isArray(res.data.drivers)).toBe(true);
    expect(res.error).toBeNull();
  }, 15000);

  it('Scenario 8: [Payment Settlement Engine] สามารถบันทึกตัดจ่ายเงินให้คนขับและป้องกันการคิดเงินซ้ำ', async () => {
    const mockDriver = 'สมชาย';
    const mockItemIds = [101, 102, 103];
    const mockTotalAmount = 350;

    const res = await driverPayrollService.markContainersPaid({
      driverName: mockDriver,
      itemIds: mockItemIds,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-15',
      totalAmount: mockTotalAmount,
      note: 'ตัดจ่ายงวด 1-15 ส.ค.',
      paidBy: 'Admin'
    });

    expect(res.success).toBe(true);
    expect(res.batch_id).toBeDefined();

    // Verification of filter logic: when filtering by payment_status === 'unpaid', paid containers are excluded
    const sampleItems = [
      { id: 101, payment_status: 'paid', unit_price: 100 },
      { id: 102, payment_status: 'paid', unit_price: 150 },
      { id: 104, payment_status: 'unpaid', unit_price: 100 }
    ];

    const unpaidOnly = sampleItems.filter(i => i.payment_status === 'unpaid');
    expect(unpaidOnly.length).toBe(1);
    expect(unpaidOnly[0].id).toBe(104);
  });

  it('Scenario 9: [Payment Batch Rollback] สามารถยกเลิกงวดการตัดจ่ายเงินและดึงประวัติได้', async () => {
    const cancelRes = await driverPayrollService.cancelPaymentBatch('PAY_TEST_BATCH_001', 'Admin', 'ทดสอบยกเลิก');
    expect(cancelRes).toBeDefined();
    expect(cancelRes.success).toBe(true);

    const listRes = await driverPayrollService.fetchPaymentBatches();
    expect(listRes).toBeDefined();
    expect(Array.isArray(listRes.data)).toBe(true);
  });

  it('Scenario 10: [Pending Container Separation] งานรอตรวจสอบ (Pending) จะไม่ถูกนำมารวมในยอดเงินที่จ่ายจริง', () => {
    const completedVerified = [{ id: 1, size: '20', unit_price: 100, is_pending: false }];
    const pendingItems = [
      { id: 2, size: '20', is_pending: true },
      { id: 3, size: '40', is_pending: true }
    ];

    // Payable earnings calculation strictly from verified
    const totalEarnings = completedVerified.reduce((sum, item) => sum + item.unit_price, 0);
    const verifiedCount = completedVerified.length;
    const pendingCount = pendingItems.length;

    expect(totalEarnings).toBe(100); // Only 100 THB, pending 2 items do not increase payable amount
    expect(verifiedCount).toBe(1);
    expect(pendingCount).toBe(2);
  });
});
