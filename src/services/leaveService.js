import { supabase } from '../supabaseClient';

const STORAGE_KEY = 'fleet_driver_leave_records';

/**
 * 🏖️ Leave Service: จัดการประวัติการลางานและวันหยุดของคนขับ
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
 * 📥 ดึงรายการประวัติการลางานทั้งหมด
 */
export async function fetchLeaveRecords() {
  try {
    const { data, error } = await supabase
      .from('driver_leave_records')
      .select('*')
      .order('start_date', { ascending: false });

    if (!error && data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return { data, error: null };
    }
  } catch (e) {
    console.warn('Supabase fetchLeaveRecords warning, using cache:', e);
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
 * ➕ สร้างใบลางานใหม่
 */
export async function createLeaveRecord(recordData) {
  try {
    const id = recordData.id || `leave_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const isIndefinite = recordData.is_indefinite !== false;
    const targetEndDate = recordData.end_date || (!isIndefinite && recordData.expected_end_date ? recordData.expected_end_date : null);
    const duration = calculateDuration(recordData.start_date, targetEndDate);

    const cleanRecord = {
      id,
      driver_name: String(recordData.driver_name || '').trim(),
      leave_type: recordData.leave_type || 'personal',
      start_date: recordData.start_date || new Date().toISOString().slice(0, 10),
      end_date: recordData.end_date || null,
      expected_end_date: isIndefinite ? null : (recordData.expected_end_date || null),
      is_indefinite: isIndefinite,
      duration_days: duration,
      leave_reason: recordData.leave_reason?.trim() || '-',
      with_pay: recordData.with_pay || 'unpaid',
      status: recordData.status || (recordData.end_date ? 'completed' : 'active_leave'),
      approved_by: recordData.approved_by?.trim() || 'Admin',
      remark: recordData.remark?.trim() || '-',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 1. บันทึกลง Supabase
    try {
      await supabase.from('driver_leave_records').insert([cleanRecord]);
    } catch (e) {
      console.warn('Supabase createLeaveRecord fallback to local:', e);
    }

    // 2. ซิงค์ Local Cache
    const { data: currentList } = await fetchLeaveRecords();
    const updatedList = [cleanRecord, ...currentList.filter(item => item.id !== id)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));

    return { data: cleanRecord, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * ✏️ อัปเดตใบลางาน
 */
export async function updateLeaveRecord(id, recordData) {
  try {
    const isIndefinite = recordData.is_indefinite !== false;
    const targetEndDate = recordData.end_date || (!isIndefinite && recordData.expected_end_date ? recordData.expected_end_date : null);
    const duration = calculateDuration(recordData.start_date, targetEndDate);

    const cleanRecord = {
      ...recordData,
      driver_name: String(recordData.driver_name || '').trim(),
      leave_type: recordData.leave_type || 'personal',
      start_date: recordData.start_date || new Date().toISOString().slice(0, 10),
      end_date: recordData.end_date || null,
      expected_end_date: isIndefinite ? null : (recordData.expected_end_date || null),
      is_indefinite: isIndefinite,
      duration_days: duration,
      leave_reason: recordData.leave_reason?.trim() || '-',
      with_pay: recordData.with_pay || 'unpaid',
      status: recordData.status || (recordData.end_date ? 'completed' : 'active_leave'),
      approved_by: recordData.approved_by?.trim() || 'Admin',
      remark: recordData.remark?.trim() || '-',
      updated_at: new Date().toISOString()
    };

    // 1. อัปเดตลง Supabase
    try {
      await supabase.from('driver_leave_records').update(cleanRecord).eq('id', id);
    } catch (e) {
      console.warn('Supabase updateLeaveRecord fallback to local:', e);
    }

    // 2. ซิงค์ Local
    const { data: currentList } = await fetchLeaveRecords();
    const updatedList = currentList.map(item => item.id === id ? { ...item, ...cleanRecord } : item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));

    return { data: cleanRecord, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * 🟢 บันทึกคนขับกลับมาทำงาน (Complete Ongoing Leave & Adjust End Date)
 */
export async function completeLeaveRecord(driverName, returnData = {}) {
  try {
    const cleanName = String(driverName || '').trim();
    const returnDate = returnData.returnDate || new Date().toISOString().slice(0, 10);
    const { data: allList } = await fetchLeaveRecords();

    // หารายการลาล่าสุดที่ยังไม่สิ้นสุดของคนขับคนนี้
    const activeLeave = allList.find(item => item.driver_name === cleanName && item.status === 'active_leave');

    if (activeLeave) {
      const updated = {
        ...activeLeave,
        end_date: returnDate,
        status: 'completed',
        duration_days: calculateDuration(activeLeave.start_date, returnDate),
        leave_reason: returnData.leaveReason || activeLeave.leave_reason,
        remark: returnData.remark ? `${activeLeave.remark !== '-' ? activeLeave.remark + ' | ' : ''}${returnData.remark}` : activeLeave.remark
      };
      return await updateLeaveRecord(activeLeave.id, updated);
    } else {
      // ถ้าไม่พบใบลาก่อนหน้า ให้สร้างใบลางานที่เสร็จสิ้นแล้ว
      return await createLeaveRecord({
        driver_name: cleanName,
        start_date: returnData.startDate || returnDate,
        end_date: returnDate,
        status: 'completed',
        leave_reason: returnData.leaveReason || 'กลับมาปฏิบัติงาน',
        remark: returnData.remark || 'บันทึกการกลับมาปฏิบัติงาน'
      });
    }
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * 🗑️ ลบใบลางาน
 */
export async function deleteLeaveRecord(id) {
  try {
    try {
      await supabase.from('driver_leave_records').delete().eq('id', id);
    } catch (e) {}

    const { data: currentList } = await fetchLeaveRecords();
    const updatedList = currentList.filter(item => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));

    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * 🗑️ ล้างประวัติการลางานทั้งหมด
 */
export async function clearAllLeaveRecords() {
  try {
    try {
      await supabase.from('driver_leave_records').delete().neq('id', '0');
    } catch (e) {}
    localStorage.removeItem(STORAGE_KEY);
    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}
