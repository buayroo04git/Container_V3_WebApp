import { supabase } from '../supabaseClient';
import { recordAssignmentHistory } from './historyService';

const STORAGE_KEY = 'fleet_truck_maintenance_records';

/**
 * 🛠️ Maintenance Service: จัดการประวัติการซ่อมบำรุงรถและค่าใช้จ่าย
 */

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

/**
 * 📥 ดึงรายการซ่อมบำรุงทั้งหมด
 */
export async function fetchMaintenanceRecords() {
  try {
    const { data, error } = await supabase
      .from('truck_maintenance_records')
      .select('*')
      .order('start_date', { ascending: false });

    if (!error && data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return { data, error: null };
    }
  } catch (e) {
    console.warn('Supabase fetchMaintenanceRecords warning, using cache:', e);
  }

  // Fallback Local Storage
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return { data: saved ? JSON.parse(saved) : [], error: null };
  } catch (e) {
    return { data: [], error: null };
  }
}

/**
 * ➕ สร้างบันทึกการซ่อมบำรุงใหม่
 */
export async function createMaintenanceRecord(recordData) {
  try {
    const id = recordData.id || `maint_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const costParts = Number(recordData.cost_parts) || 0;
    const costLabor = Number(recordData.cost_labor) || 0;
    const costTotal = Number(recordData.cost_total) || (costParts + costLabor);
    const duration = calculateDuration(recordData.start_date, recordData.end_date);

    const cleanRecord = {
      id,
      truck_no: String(recordData.truck_no || '').trim(),
      maintenance_type: recordData.maintenance_type || 'general',
      start_date: recordData.start_date || new Date().toISOString().slice(0, 10),
      end_date: recordData.end_date || null,
      duration_days: duration,
      garage_name: recordData.garage_name?.trim() || '-',
      mileage: Number(recordData.mileage) || 0,
      cost_parts: costParts,
      cost_labor: costLabor,
      cost_total: costTotal,
      invoice_no: recordData.invoice_no?.trim() || '-',
      status: recordData.status || (recordData.end_date ? 'completed' : 'in_progress'),
      parts_list: recordData.parts_list?.trim() || '-',
      performed_by: recordData.performed_by?.trim() || '-',
      remark: recordData.remark?.trim() || '-',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 1. บันทึกลง Supabase
    try {
      await supabase.from('truck_maintenance_records').insert([cleanRecord]);
    } catch (e) {
      console.warn('Supabase createMaintenanceRecord fallback to local:', e);
    }

    // 2. ซิงค์ลง Local Cache
    const { data: currentList } = await fetchMaintenanceRecords();
    const updatedList = [cleanRecord, ...currentList.filter(item => item.id !== id)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));

    return { data: cleanRecord, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * ✏️ อัปเดตบันทึกการซ่อมบำรุง
 */
export async function updateMaintenanceRecord(id, recordData) {
  try {
    const costParts = Number(recordData.cost_parts) || 0;
    const costLabor = Number(recordData.cost_labor) || 0;
    const costTotal = Number(recordData.cost_total) || (costParts + costLabor);
    const duration = calculateDuration(recordData.start_date, recordData.end_date);

    const cleanRecord = {
      ...recordData,
      truck_no: String(recordData.truck_no || '').trim(),
      maintenance_type: recordData.maintenance_type || 'general',
      start_date: recordData.start_date || new Date().toISOString().slice(0, 10),
      end_date: recordData.end_date || null,
      duration_days: duration,
      garage_name: recordData.garage_name?.trim() || '-',
      mileage: Number(recordData.mileage) || 0,
      cost_parts: costParts,
      cost_labor: costLabor,
      cost_total: costTotal,
      invoice_no: recordData.invoice_no?.trim() || '-',
      status: recordData.status || (recordData.end_date ? 'completed' : 'in_progress'),
      parts_list: recordData.parts_list?.trim() || '-',
      performed_by: recordData.performed_by?.trim() || '-',
      remark: recordData.remark?.trim() || '-',
      updated_at: new Date().toISOString()
    };

    // 1. อัปเดตลง Supabase
    try {
      await supabase.from('truck_maintenance_records').update(cleanRecord).eq('id', id);
    } catch (e) {
      console.warn('Supabase updateMaintenanceRecord fallback to local:', e);
    }

    // 2. ซิงค์ Local
    const { data: currentList } = await fetchMaintenanceRecords();
    const updatedList = currentList.map(item => item.id === id ? { ...item, ...cleanRecord } : item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));

    return { data: cleanRecord, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * ✅ บันทึกซ่อมเสร็จ (Complete Ongoing Maintenance)
 */
export async function completeMaintenanceRecord(truckNo, completionData = {}) {
  try {
    const cleanNo = String(truckNo).trim();
    const endDate = completionData.endDate || new Date().toISOString().slice(0, 10);
    const { data: allList } = await fetchMaintenanceRecords();

    // หารายการล่าสุดที่กำลังซ่อมอยู่ของรถคันนี้
    const ongoing = allList.find(item => item.truck_no === cleanNo && item.status === 'in_progress');

    if (ongoing) {
      const updated = {
        ...ongoing,
        end_date: endDate,
        status: 'completed',
        duration_days: calculateDuration(ongoing.start_date, endDate),
        garage_name: completionData.garageName || ongoing.garage_name,
        cost_parts: Number(completionData.costParts) || ongoing.cost_parts || 0,
        cost_labor: Number(completionData.costLabor) || ongoing.cost_labor || 0,
        cost_total: Number(completionData.costTotal) || ongoing.cost_total || 0,
        invoice_no: completionData.invoiceNo || ongoing.invoice_no,
        remark: completionData.remark ? `${ongoing.remark !== '-' ? ongoing.remark + ' | ' : ''}${completionData.remark}` : ongoing.remark
      };
      return await updateMaintenanceRecord(ongoing.id, updated);
    } else {
      // ถ้าไม่พบรายการที่ค้างอยู่ ให้สร้างรายการซ่อมเสร็จใหม่
      return await createMaintenanceRecord({
        truck_no: cleanNo,
        start_date: completionData.startDate || endDate,
        end_date: endDate,
        status: 'completed',
        garage_name: completionData.garageName || '-',
        cost_parts: Number(completionData.costParts) || 0,
        cost_labor: Number(completionData.costLabor) || 0,
        cost_total: Number(completionData.costTotal) || 0,
        invoice_no: completionData.invoiceNo || '-',
        remark: completionData.remark || 'บันทึกซ่อมเสร็จพร้อมใช้งาน'
      });
    }
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * 🗑️ ลบบันทึกการซ่อมบำรุง
 */
export async function deleteMaintenanceRecord(id) {
  try {
    try {
      await supabase.from('truck_maintenance_records').delete().eq('id', id);
    } catch (e) {}

    const { data: currentList } = await fetchMaintenanceRecords();
    const updatedList = currentList.filter(item => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));

    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * 🗑️ ล้างประวัติการซ่อมบำรุงทั้งหมด
 */
export async function clearAllMaintenanceRecords() {
  try {
    try {
      await supabase.from('truck_maintenance_records').delete().neq('id', '0');
    } catch (e) {}
    localStorage.removeItem(STORAGE_KEY);
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}
