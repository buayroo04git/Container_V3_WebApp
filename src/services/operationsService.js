import { supabase } from '../supabaseClient';
import { recordAssignmentHistory } from './historyService';

const STORAGE_KEY = 'fleet_truck_operations_v2';

/**
 * โหลดรายการการดำเนินงานจาก Local Cache
 */
export function getAllOperationsFromStorage() {
  try {
    if (localStorage.getItem('fleet_truck_operations')) {
      localStorage.removeItem('fleet_truck_operations');
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    const clean = Array.isArray(parsed) ? parsed.filter(p => !String(p.id).startsWith('op_50')) : [];
    if (clean.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    }
    return clean;
  } catch (e) {
    return [];
  }
}

/**
 * บันทึกลง Storage Cache
 */
function saveOperationsToStorage(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('saveOperationsToStorage error:', e);
  }
}

/**
 * 📥 ดึงรายการการดำเนินงานทั้งหมดจาก Supabase (Fetch All Operations)
 */
export async function fetchOperations() {
  try {
    const { data: sbData, error: sbError } = await supabase
      .from('truck_operations')
      .select('*')
      .order('start_date', { ascending: false });

    if (sbError) {
      const isMissing = sbError.code === 'PGRST205' || sbError.message?.includes('schema cache');
      console.warn('Supabase fetch truck_operations warning (using local fallback):', sbError.message);
      // ถ้า table ยังไม่ได้สร้าง หรือมี error ให้ fallback ไปยัง LocalStorage
      const localList = getAllOperationsFromStorage();
      return { data: localList, error: null, isTableMissing: isMissing };
    }

    if (sbData) {
      saveOperationsToStorage(sbData);
      return { data: sbData, error: null, isTableMissing: false };
    }
  } catch (e) {
    console.error('fetchOperations exception:', e);
  }

  const localList = getAllOperationsFromStorage();
  return { data: localList, error: null, isTableMissing: false };
}

/**
 * ➕ เพิ่มบันทึกการดำเนินงานใหม่ (บันทึกลง Supabase ทันที + Auto-close previous active record)
 */
export async function createOperation(opData) {
  try {
    const truckNo = String(opData.truck_no || '').trim();
    const driverName = String(opData.driver_name || '').trim();
    const startDate = opData.start_date || new Date().toISOString().slice(0, 10);
    const endDate = opData.end_date ? opData.end_date : null;
    const isOngoing = !endDate;

    const newRecord = {
      id: 'op_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      truck_no: truckNo,
      driver_name: driverName,
      start_date: startDate,
      end_date: endDate,
      status: isOngoing ? 'active' : 'completed',
      operation_type: opData.operation_type || 'primary',
      remark: opData.remark?.trim() || '-',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 🔄 กฎอัจฉริยะ 1: ถ้าเป็น Record ใหม่ที่ยังไม่มีวันสิ้นสุด (Ongoing)
    // ให้ค้นหา Record เก่าของรถคันนี้ที่ยังเปิดอยู่ แล้วปิดวันสิ้นสุดให้อัตโนมัติ (1 วันก่อนหน้าวันเริ่มใหม่ หรือวันเริ่มใหม่)
    if (isOngoing) {
      try {
        await supabase
          .from('truck_operations')
          .update({
            end_date: startDate,
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('truck_no', truckNo)
          .eq('status', 'active');
      } catch (e) {
        console.warn('Auto-close previous record warning:', e);
      }
    }

    // 1. บันทึกลง Supabase
    const { data: insertedData, error: insertError } = await supabase
      .from('truck_operations')
      .insert([newRecord])
      .select()
      .single();

    if (insertError) {
      console.warn('Supabase insert error, saving to local cache as fallback:', insertError.message);
    }

    const savedRecord = insertedData || newRecord;

    // 2. ซิงค์ Local Cache
    const allOps = getAllOperationsFromStorage();
    if (isOngoing) {
      allOps.forEach(item => {
        if (String(item.truck_no).trim() === truckNo && (!item.end_date || item.status === 'active')) {
          item.end_date = startDate;
          item.status = 'completed';
        }
      });
    }
    allOps.unshift(savedRecord);
    saveOperationsToStorage(allOps);

    // 🔄 กฎอัจฉริยะ 2: ถ้ากำลัง Active อยู่ ซิงค์เข้า truck_records และ driver_records อัตโนมัติ (พร้อมปรับสถานะคนขับเป็น Active)
    if (isOngoing && truckNo && driverName) {
      try {
        await supabase
          .from('truck_records')
          .update({ assigned_driver_name: driverName, updated_at: new Date().toISOString() })
          .eq('truck_no', truckNo);

        const driverUpdatePayload = { 
          assigned_truck_no: truckNo, 
          updated_at: new Date().toISOString() 
        };
        if (opData.autoActivateDriver !== false) {
          driverUpdatePayload.status = 'active';
        }

        await supabase
          .from('driver_records')
          .update(driverUpdatePayload)
          .eq('driver_name', driverName);

        recordAssignmentHistory({
          driverName,
          truckNo,
          action: 'ASSIGN',
          reason: `เริ่มการดำเนินงานใหม่ (${opData.operation_type === 'substitute' ? 'ขับแทนชั่วคราว' : 'คนขับประจำ'}, เริ่ม ${startDate})`,
          effectiveDate: startDate,
          operationId: savedRecord.id
        });
      } catch (e) {
        console.error('Sync truck/driver record error:', e);
      }
    }

    return { data: savedRecord, error: null };
  } catch (err) {
    console.error('createOperation error:', err);
    return { data: null, error: err.message };
  }
}

/**
 * ✏️ แก้ไขบันทึกการดำเนินงาน (Update Supabase)
 */
export async function updateOperation(id, opData) {
  try {
    const isOngoing = !opData.end_date;
    const updatePayload = {
      truck_no: String(opData.truck_no || '').trim(),
      driver_name: String(opData.driver_name || '').trim(),
      start_date: opData.start_date,
      end_date: opData.end_date ? opData.end_date : null,
      status: isOngoing ? 'active' : 'completed',
      operation_type: opData.operation_type || 'primary',
      remark: opData.remark?.trim() || '-',
      updated_at: new Date().toISOString()
    };

    // 1. อัปเดตใน Supabase
    const { data: updatedData, error: sbError } = await supabase
      .from('truck_operations')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (sbError) {
      console.warn('Supabase update warning:', sbError.message);
    }

    // 2. อัปเดต Local Cache
    const allOps = getAllOperationsFromStorage();
    const idx = allOps.findIndex(o => String(o.id) === String(id));
    if (idx !== -1) {
      allOps[idx] = { ...allOps[idx], ...updatePayload, id };
      saveOperationsToStorage(allOps);
    }

    return { data: updatedData || { ...updatePayload, id }, error: null };
  } catch (err) {
    console.error('updateOperation error:', err);
    return { data: null, error: err.message };
  }
}

/**
 * 🛑 ปิดงวดการดำเนินงาน (End Operation & Unassign from Truck/Driver)
 */
export async function closeOperation(id, endDateStr = new Date().toISOString().slice(0, 10)) {
  try {
    const updatePayload = {
      end_date: endDateStr,
      status: 'completed',
      updated_at: new Date().toISOString()
    };

    // 1. อัปเดตตาราง truck_operations ใน Supabase
    const { data: updatedOp, error: sbError } = await supabase
      .from('truck_operations')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (sbError) {
      console.warn('Supabase closeOperation warning:', sbError.message);
    }

    // 2. อัปเดตใน Local Cache
    const allOps = getAllOperationsFromStorage();
    const target = allOps.find(o => String(o.id) === String(id)) || updatedOp;
    if (target) {
      target.end_date = endDateStr;
      target.status = 'completed';
      target.updated_at = new Date().toISOString();
      saveOperationsToStorage(allOps);
    }

    // 3. ปลดรถและคนขับออกจากกันใน truck_records และ driver_records
    const truckNo = target?.truck_no || updatedOp?.truck_no;
    const driverName = target?.driver_name || updatedOp?.driver_name;

    if (truckNo && driverName) {
      try {
        await supabase
          .from('truck_records')
          .update({ assigned_driver_name: '-', updated_at: new Date().toISOString() })
          .eq('truck_no', truckNo);

        await supabase
          .from('driver_records')
          .update({ assigned_truck_no: '-', updated_at: new Date().toISOString() })
          .eq('driver_name', driverName);

        recordAssignmentHistory({
          driverName,
          truckNo,
          action: 'UNASSIGN',
          reason: `สิ้นสุดการดำเนินงาน ณ วันที่ ${endDateStr}`
        });
      } catch (e) {
        console.error('Unassign error in truck/driver:', e);
      }
    }

    return { data: target || updatedOp, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

/**
 * 🗑️ ลบบันทึกการดำเนินงาน
 */
export async function deleteOperation(id) {
  try {
    const allOps = getAllOperationsFromStorage();
    const target = allOps.find(o => String(o.id) === String(id));

    // 1. ลบจาก Supabase
    const { error: sbError } = await supabase
      .from('truck_operations')
      .delete()
      .eq('id', id);

    if (sbError) {
      console.warn('Supabase delete warning:', sbError.message);
    }

    // 2. ลบจาก Local Cache
    const filtered = allOps.filter(o => String(o.id) !== String(id));
    saveOperationsToStorage(filtered);

    // 3. ถ้าเป็นงานที่ยัง Active อยู่ ให้ปลดรถและคนขับใน truck_records และ driver_records ด้วย
    const isOngoing = target ? (!target.end_date || target.status === 'active') : true;
    if (isOngoing && target) {
      const truckNo = target.truck_no;
      const driverName = target.driver_name;
      if (truckNo && driverName) {
        try {
          await supabase
            .from('truck_records')
            .update({ assigned_driver_name: '-', updated_at: new Date().toISOString() })
            .eq('truck_no', truckNo);

          await supabase
            .from('driver_records')
            .update({ assigned_truck_no: '-', updated_at: new Date().toISOString() })
            .eq('driver_name', driverName);
        } catch (e) {
          console.warn('Unassign on deleteOperation error:', e);
        }
      }
    }

    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * 🧹 ล้างรายการการดำเนินงานทั้งหมด (Clear All) และปลดการผูกรถ-คนขับทั้งหมด
 */
export async function clearAllOperations() {
  try {
    // 1. ล้าง Local Cache
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('fleet_truck_operations');

    // 2. ลบทุกแถวใน truck_operations
    try {
      await supabase.from('truck_operations').delete().neq('id', '___NEVER_MATCH___');
    } catch (e) {
      console.warn('Supabase clear operations warning:', e);
    }

    // 3. ปลดการมอบหมายคนขับประจำรถทั้งหมดใน truck_records (ตั้งเป็น '-')
    try {
      await supabase
        .from('truck_records')
        .update({ assigned_driver_name: '-', updated_at: new Date().toISOString() })
        .neq('truck_no', '___NEVER_MATCH___');
    } catch (e) {
      console.warn('Supabase reset truck assignments warning:', e);
    }

    // 4. ปลดการมอบหมายรถประจำของคนขับทั้งหมดใน driver_records (ตั้งเป็น '-')
    try {
      await supabase
        .from('driver_records')
        .update({ assigned_truck_no: '-', updated_at: new Date().toISOString() })
        .neq('driver_name', '___NEVER_MATCH___');
    } catch (e) {
      console.warn('Supabase reset driver assignments warning:', e);
    }

    return { error: null };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * ⚡ ซิงค์สร้างงวดการดำเนินงานอัตโนมัติจากคนขับประจำรถปัจจุบัน (Initial Auto-Populate)
 * และอัปโหลดข้อมูลจาก LocalStorage ขึ้น Supabase หากมีข้อมูลค้างอยู่
 */
export async function syncOperationsFromAssignedTrucks() {
  try {
    // 1. ตรวจสอบข้อมูลใน LocalStorage ก่อน ถ้ามีให้อัปโหลดขึ้น Supabase
    const localOps = getAllOperationsFromStorage();
    if (localOps.length > 0) {
      for (const op of localOps) {
        try {
          await supabase.from('truck_operations').upsert([op], { onConflict: 'id' });
        } catch (e) {}
      }
    }

    // 2. ดึงข้อมูลรถและคนขับปัจจุบันจาก Supabase
    const { data: trucks } = await supabase.from('truck_records').select('*');
    const { data: existingOps } = await supabase.from('truck_operations').select('*');
    const currentOps = existingOps || [];

    const newRecords = [];
    const today = new Date().toISOString().slice(0, 10);

    if (trucks && trucks.length > 0) {
      trucks.forEach(t => {
        const truckNo = String(t.truck_no || '').trim();
        const driverName = String(t.assigned_driver_name || '').trim();

        if (truckNo && driverName && driverName !== '-') {
          // ตรวจสอบว่ามีงวด active ของรถคันนี้อยู่แล้วหรือไม่
          const hasActive = currentOps.some(o => 
            String(o.truck_no).trim() === truckNo && 
            (!o.end_date || o.status === 'active')
          );

          if (!hasActive) {
            newRecords.push({
              id: 'op_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
              truck_no: truckNo,
              driver_name: driverName,
              start_date: today,
              end_date: null,
              status: 'active',
              operation_type: 'primary',
              rate_per_trip: 0,
              remark: 'ซิงค์เริ่มต้นจากข้อมูลรถและคนขับประจำ',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }
        }
      });
    }

    if (newRecords.length > 0) {
      await supabase.from('truck_operations').insert(newRecords);
    }

    return await fetchOperations();
  } catch (err) {
    console.error('syncOperationsFromAssignedTrucks error:', err);
    return { data: [], error: err.message };
  }
}

/**
 * 🔍 ค้นหาว่า ณ วันที่ dateStr รถคัน truckNo ใครเป็นคนขับ (Timeline Bridge Lookup)
 */
export function getDriverForTruckOnDate(truckNo, dateStr) {
  if (!truckNo || !dateStr) return null;
  const allOps = getAllOperationsFromStorage();
  const targetDate = new Date(dateStr);

  const matched = allOps.find(op => {
    if (String(op.truck_no).trim() !== String(truckNo).trim()) return false;
    const start = new Date(op.start_date);
    const end = op.end_date ? new Date(op.end_date) : new Date('9999-12-31');
    return targetDate >= start && targetDate <= end;
  });

  return matched ? matched.driver_name : null;
}

