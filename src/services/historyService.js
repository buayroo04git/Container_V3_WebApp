import { supabase } from '../supabaseClient';

const STORAGE_KEY = 'fleet_driver_truck_history';

/**
 * 📜 History Service: บริการบันทึกและจัดการประวัติการครองรถของคนขับตามช่วงเวลา
 * รองรับการดึงจาก Supabase driver_truck_history เป็นหลัก พร้อม LocalStorage Cache
 */

/**
 * 📥 ดึงรายการประวัติทั้งหมดจาก Supabase
 */
export async function fetchAssignmentHistory() {
  try {
    const { data, error } = await supabase
      .from('driver_truck_history')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) {
      console.warn('Supabase fetch driver_truck_history error, using cache:', error.message);
      return getAllAssignmentHistory();
    }

    if (data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
    }
  } catch (e) {
    console.error('fetchAssignmentHistory exception:', e);
  }

  return getAllAssignmentHistory();
}

/**
 * โหลดประวัติทั้งหมดจาก Local Cache
 */
export function getAllAssignmentHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
}

/**
 * บันทึกประวัติใหม่ (Detailed Audit Trail)
 */
export async function recordAssignmentHistory({
  driverName,
  truckNo,
  action = 'ASSIGN', // 'ASSIGN' | 'TRANSFER' | 'UNASSIGN' | 'RESIGN' | 'LEAVE'
  reason = '-',
  previousDriver = null,
  previousTruck = null,
  effectiveDate = new Date().toISOString().slice(0, 10),
  truckLicense = '-',
  operationId = '-',
  createdBy = 'Admin',
  date = new Date().toISOString()
}) {
  try {
    const newEntry = {
      driver_name: driverName || '-',
      truck_no: truckNo || '-',
      action,
      reason: reason || '-',
      previous_driver: previousDriver || '-',
      previous_truck: previousTruck || '-',
      effective_date: effectiveDate || new Date().toISOString().slice(0, 10),
      truck_license: truckLicense || '-',
      operation_id: operationId || '-',
      created_by: createdBy || 'Admin',
      timestamp: date,
      created_at: new Date().toISOString()
    };

    // 1. บันทึกลง Supabase
    try {
      await supabase.from('driver_truck_history').insert([newEntry]);
    } catch (sbErr) {
      console.warn('recordAssignmentHistory Supabase warning:', sbErr);
    }

    // 2. บันทึกลง Local Cache
    const historyList = getAllAssignmentHistory();
    const localEntry = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      ...newEntry
    };
    historyList.unshift(localEntry);
    if (historyList.length > 500) {
      historyList.length = 500;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historyList));

    return localEntry;
  } catch (e) {
    console.error('recordAssignmentHistory error:', e);
    return null;
  }
}

/**
 * ดึงประวัติตามเบอร์รถ
 */
export function getHistoryByTruck(truckNo) {
  if (!truckNo || truckNo === '-') return [];
  const cleanNo = String(truckNo).trim();
  const all = getAllAssignmentHistory();
  return all.filter(item => 
    String(item.truck_no).trim() === cleanNo || 
    String(item.previous_truck).trim() === cleanNo
  );
}

/**
 * ดึงประวัติตามชื่อคนขับ
 */
export function getHistoryByDriver(driverName) {
  if (!driverName || driverName === '-') return [];
  const cleanName = String(driverName).trim().toLowerCase();
  const all = getAllAssignmentHistory();
  return all.filter(item => 
    String(item.driver_name).trim().toLowerCase() === cleanName ||
    String(item.previous_driver).trim().toLowerCase() === cleanName
  );
}

/**
 * ค้นหาประวัติการเข้าซ่อมบำรุงล่าสุดของรถ
 */
export function getLastMaintenanceRecord(truckNo) {
  if (!truckNo || truckNo === '-') return null;
  const cleanNo = String(truckNo).trim();
  const all = getAllAssignmentHistory();
  return all.find(item => 
    String(item.truck_no).trim() === cleanNo && 
    (item.action === 'MAINTENANCE' || item.action === 'MAINTENANCE_START')
  ) || null;
}

/**
 * ค้นหาประวัติการลางานล่าสุดของคนขับ
 */
export function getLastLeaveRecord(driverName) {
  if (!driverName || driverName === '-') return null;
  const cleanName = String(driverName).trim().toLowerCase();
  const all = getAllAssignmentHistory();
  return all.find(item => 
    String(item.driver_name).trim().toLowerCase() === cleanName && 
    (item.action === 'LEAVE' || item.action === 'LEAVE_START')
  ) || null;
}

/**
 * 🧹 ล้างประวัติการปฏิบัติงานทั้งหมด (Clear All Assignment History Audit Trail)
 */
export async function clearAssignmentHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    try {
      await supabase.from('driver_truck_history').delete().neq('truck_no', '___NEVER_MATCH___');
    } catch (e) {
      console.warn('clearAssignmentHistory Supabase warning:', e);
    }
    return { error: null };
  } catch (e) {
    return { error: e.message };
  }
}
