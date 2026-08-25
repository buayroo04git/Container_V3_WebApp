import { describe, it, expect } from 'vitest';

/**
 * 🛠️ Truck Maintenance & Fleet Status Scenarios
 */

describe('Truck Maintenance & Cost Calculation Scenarios', () => {

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

  function processMaintenanceRecord(rawRecord) {
    const costParts = Number(rawRecord.cost_parts) || 0;
    const costLabor = Number(rawRecord.cost_labor) || 0;
    const costTotal = Number(rawRecord.cost_total) || (costParts + costLabor);
    const duration = calculateDuration(rawRecord.start_date, rawRecord.end_date);
    const status = rawRecord.end_date ? 'completed' : 'in_progress';

    return {
      ...rawRecord,
      cost_parts: costParts,
      cost_labor: costLabor,
      cost_total: costTotal,
      duration_days: duration,
      status
    };
  }

  it('Scenario 4.1: [ส่งรถเข้าซ่อม] รถ 103 เข้าซ่อมบำรุง ยังไม่ระบุวันเสร็จ', () => {
    const raw = {
      truck_no: '103',
      maintenance_type: 'engine',
      start_date: '2026-08-20',
      end_date: null,
      garage_name: 'อู่ช่างวิทย์',
      cost_parts: 5000,
      cost_labor: 1500
    };

    const processed = processMaintenanceRecord(raw);

    expect(processed.status).toBe('in_progress');
    expect(processed.cost_total).toBe(6500); // 5000 + 1500
  });

  it('Scenario 4.2: [ซ่อมเสร็จสิ้น] บันทึกปิดงานซ่อม พร้อมคำนวณจำนวนวันเข้าซ่อม', () => {
    const raw = {
      truck_no: '103',
      start_date: '2026-08-20',
      end_date: '2026-08-23', // 20, 21, 22, 23 = 4 วัน
      cost_parts: 8000,
      cost_labor: 2000
    };

    const processed = processMaintenanceRecord(raw);

    expect(processed.status).toBe('completed');
    expect(processed.duration_days).toBe(4);
    expect(processed.cost_total).toBe(10000);
  });
});
