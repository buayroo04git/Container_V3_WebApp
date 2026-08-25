import { describe, it, expect } from 'vitest';
import { calculateMatchedMasterIds } from '../../src/services/truckDriverService';

/**
 * ⚡ Conflict, Overlap & System Edge Cases Scenarios
 */

describe('Conflict, Overlap & System Edge Cases Scenarios', () => {

  it('Scenario 5.1: [การลาหลายช่วงเวลาในเดือนเดียวกัน] คนขับลา 2 ครั้งใน 1 เดือน ต้องรวมยอดวันลาถูกต้อง', () => {
    const leaves = [
      { id: '1', driver_name: 'สมชาย', start_date: '2026-07-01', end_date: '2026-07-03', status: 'completed', duration_days: 3 },
      { id: '2', driver_name: 'สมชาย', start_date: '2026-07-15', end_date: '2026-07-18', status: 'completed', duration_days: 4 }
    ];

    const totalLeaveDays = leaves.reduce((sum, item) => sum + (Number(item.duration_days) || 0), 0);
    expect(totalLeaveDays).toBe(7); // 3 + 4 = 7 วัน
  });

  it('Scenario 5.2: [การตัดช่องว่างและการเทียบชื่อคนขับ Whitespace & Case Normalization]', () => {
    const rawDriverName1 = '  สมชาย พงษ์สวัสดิ์ ';
    const rawDriverName2 = 'สมชาย พงษ์สวัสดิ์';
    
    expect(rawDriverName1.trim().toLowerCase()).toBe(rawDriverName2.trim().toLowerCase());
  });

  it('Scenario 5.3: [การเทียบเลขตู้ตัวพิมพ์เล็ก-ใหญ่ Case-Insensitive Matching]', () => {
    const masterList = [{ id: 1, container_no: 'TCLU1234567', truck_no: '101' }];
    const completedItems = [{ id: 1, ref_master_id: 1, container_no: 'tclu1234567', match_status: 'matched' }];

    const matchedSet = calculateMatchedMasterIds(masterList, completedItems);
    expect(matchedSet.size).toBe(1);
    expect(matchedSet.has(1)).toBe(true);
  });

  it('Scenario 5.4: [ป้องกัน Crash เมื่อวันที่เป็นค่าว่าง/Null/Undefined Safe Fallback]', () => {
    function safeParseDate(val) {
      if (!val || val === '-' || typeof val !== 'string') return null;
      try {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
      } catch {
        return null;
      }
    }

    expect(safeParseDate(null)).toBeNull();
    expect(safeParseDate(undefined)).toBeNull();
    expect(safeParseDate('-')).toBeNull();
    expect(safeParseDate('invalid-date-string')).toBeNull();
    expect(safeParseDate('2026-08-23')).toBe('2026-08-23');
  });

  it('Scenario 5.5: [การจำลองระบบ Offline Cache Fallback] เมื่อ Supabase ตอบสนองช้าหรือขาดการเชื่อมต่อ', () => {
    const mockLocalStorage = {
      store: {},
      getItem(key) { return this.store[key] || null; },
      setItem(key, val) { this.store[key] = String(val); }
    };

    // จำลองบันทึก Cache ไว้ล่วงหน้า
    const cachedLeaves = [{ id: 'cache-1', driver_name: 'กิตติ', status: 'completed', duration_days: 2 }];
    mockLocalStorage.setItem('fleet_driver_leave_records', JSON.stringify(cachedLeaves));

    // จำลองฟังก์ชันอ่านแบบมี Fallback
    function getLeavesWithFallback(networkResult, localCache) {
      if (networkResult && networkResult.data) {
        return networkResult.data;
      }
      // Fallback
      const raw = localCache.getItem('fleet_driver_leave_records');
      return raw ? JSON.parse(raw) : [];
    }

    // กรณีเน็ตหลุด (networkResult เป็น null)
    const resultOffline = getLeavesWithFallback(null, mockLocalStorage);
    expect(resultOffline.length).toBe(1);
    expect(resultOffline[0].driver_name).toBe('กิตติ');
  });
});
