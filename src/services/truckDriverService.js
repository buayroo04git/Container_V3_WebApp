import { supabase } from '../supabaseClient.js';
import { recordAssignmentHistory, getLastMaintenanceRecord, getLastLeaveRecord } from './historyService.js';
import { createMaintenanceRecord, completeMaintenanceRecord } from './maintenanceService.js';
import { createLeaveRecord, completeLeaveRecord } from './leaveService.js';
import { normalizeExcelDate } from '../utils/matchingLogic.js';

const DRIVER_PROFILES_KEY = 'driver_payroll_profiles_cache_v1';

export const getDriverPayrollProfile = (driverName) => {
  try {
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(DRIVER_PROFILES_KEY);
      if (cached) {
        const map = JSON.parse(cached);
        const prof = map[driverName];
        if (prof) {
          if (Number(prof.social_security_amount) === 750) {
            prof.social_security_amount = 875;
          }
          return prof;
        }
      }
    }
  } catch (e) {}
  return null;
};

export const saveDriverPayrollProfile = (driverName, profile) => {
  try {
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(DRIVER_PROFILES_KEY);
      const map = cached ? JSON.parse(cached) : {};
      map[driverName] = {
        ...(map[driverName] || {}),
        ...profile,
        updated_at: new Date().toISOString()
      };
      localStorage.setItem(DRIVER_PROFILES_KEY, JSON.stringify(map));
    }
  } catch (e) {}
};

/**
 * 🚚 Service Layer: Truck & Driver Management
 * จัดการตาราง truck_records และ driver_records พร้อมระบบซิงค์เชื่อมโยงคนขับ-รถประจำ
 */

/**
 * 🎯 Helper คำนวณการจับคู่แบบ 1:1 Consumption (ตู้ที่ถูกจับคู่แล้วจะไม่ถูกนำมาใช้ซ้ำ)
 * @param {Array} masterList - รายการแถวใน Master DB (container_records)
 * @param {Array} completedItems - รายการตู้ที่ตรวจเสร็จแล้วจากใบงาน (job_sheet_items)
 * @returns {Set<number>} Set ของ Master Record IDs ที่ถูกจับคู่แล้ว (ขนาด = ยอดตู้ที่จับคู่ได้จริง)
 */
export function calculateMatchedMasterIds(masterList = [], completedItems = []) {
  const consumedMasterIds = new Set();

  // สร้าง Map ของ Master DB ID และ Map ของ container_no เพื่อค้นหาแบบ O(1)
  const masterIdMap = new Map();
  const masterByContainerNo = new Map();

  masterList.forEach(m => {
    if (m.id) {
      const idNum = Number(m.id);
      masterIdMap.set(idNum, m);
      if (m.container_no) {
        const cKey = String(m.container_no).toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (cKey) {
          if (!masterByContainerNo.has(cKey)) masterByContainerNo.set(cKey, []);
          masterByContainerNo.get(cKey).push(m);
        }
      }
    }
  });

  // 🎯 Pass 1: จับคู่ตาม ref_master_id แบบ 1:1 เท่านั้น (Strict ref_master_id Matching)
  completedItems.forEach(item => {
    if (!item || item.match_status === 'manual_red' || item.match_status === 'cancelled') return;

    const refId = item.ref_master_id ? Number(item.ref_master_id) : (item.ref_db_id ? Number(item.ref_db_id) : null);
    if (refId && masterIdMap.has(refId) && !consumedMasterIds.has(refId)) {
      consumedMasterIds.add(refId);
    }
  });

  // 🎯 Pass 2: Fallback จับคู่ตาม container_no สำหรับรายการที่ไม่มี ref_master_id (1:1 Consumption)
  completedItems.forEach(item => {
    if (!item || item.match_status === 'manual_red' || item.match_status === 'cancelled') return;

    const refId = item.ref_master_id ? Number(item.ref_master_id) : (item.ref_db_id ? Number(item.ref_db_id) : null);
    if (!refId && item.container_no) {
      const cKey = String(item.container_no).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const candidates = masterByContainerNo.get(cKey) || [];
      const match = candidates.find(c => !consumedMasterIds.has(Number(c.id)));
      if (match) {
        consumedMasterIds.add(Number(match.id));
      }
    }
  });

  return consumedMasterIds;
}

// ==========================================
// 🚛 TRUCKS API
// ==========================================

/**
 * ดึงรายการรถทั้งหมด พร้อมสรุปสถิติงานจริงจากใบงาน (1:1 Consumption ไม่นับเบิ้ล)
 */
export async function fetchTrucks() {
  try {
    const [trucksRes, masterRes, itemsRes, sheetsRes, opsRes] = await Promise.all([
      supabase.from('truck_records').select('*').order('truck_no', { ascending: true }),
      supabase.from('container_records').select('id, container_no, truck_no, port, dis_load, date_job, date_job_parsed').limit(10000),
      supabase.from('job_sheet_items').select('id, job_sheet_id, container_no, match_status, ref_master_id, date_job, date_job_parsed').limit(10000),
      supabase.from('job_sheets').select('id, truck_no, status, created_at').neq('status', 'deleted').limit(10000),
      supabase.from('truck_operations').select('id, truck_no, driver_name, start_date, end_date, status').limit(5000)
    ]);

    if (trucksRes.error) throw trucksRes.error;
    const trucks = trucksRes.data || [];
    const masterData = masterRes.data || [];
    const itemsData = itemsRes.data || [];
    const sheetsData = sheetsRes.data || [];
    const opsData = opsRes?.data || [];
    const hasOpsTable = !opsRes?.error && Array.isArray(opsRes?.data);

    const sheetMap = {};
    sheetsData.forEach(s => { sheetMap[s.id] = s; });

    // 🚚 จัดกลุ่ม Master Container (container_records) ฝั่งใบวางบิลตามเบอร์รถ
    const masterByTruck = {};
    masterData.forEach(m => {
      const tNo = String(m.truck_no || '').trim();
      if (!tNo) return;
      if (!masterByTruck[tNo]) masterByTruck[tNo] = [];
      masterByTruck[tNo].push(m);
    });

    // 📄 จัดกลุ่ม Completed Items ตามเบอร์รถ
    const itemsByTruck = {};
    const redByTruck = {};
    itemsData.forEach(item => {
      if (item.match_status === 'cancelled') return;
      const sheet = sheetMap[item.job_sheet_id] || {};
      const tNo = String(sheet.truck_no || '').trim();
      if (!tNo) return;

      if (item.match_status === 'manual_red') {
        if (!redByTruck[tNo]) redByTruck[tNo] = [];
        redByTruck[tNo].push(item);
      } else {
        if (!itemsByTruck[tNo]) itemsByTruck[tNo] = [];
        itemsByTruck[tNo].push({
          ...item,
          truck_no: tNo
        });
      }
    });

    const enrichedTrucks = trucks.map(t => {
      const tNo = String(t.truck_no || '').trim();
      const truckMasterList = masterByTruck[tNo] || [];
      const truckItems = itemsByTruck[tNo] || [];
      const masterTotal = truckMasterList.length; // 📋 ยอดงานทั้งหมดของรถคันนี้จาก Master DB (ใบวางบิล)

      // 🔍 ค้นหาคนขับปัจจุบันจาก truck_operations (Single Source of Truth)
      const activeOp = opsData.find(op => String(op.truck_no || '').trim() === tNo && (op.status === 'active' || !op.end_date));
      const liveDriver = hasOpsTable
        ? (activeOp && activeOp.driver_name && activeOp.driver_name !== '-' ? String(activeOp.driver_name).trim() : '-')
        : (t.assigned_driver_name || '-');

      // 🎯 1:1 Consumption Matching Algorithm (ตู้ที่จับคู่แล้วจะไม่ถูกใช้ซ้ำ)
      const matchedMasterIds = calculateMatchedMasterIds(truckMasterList, truckItems);
      const matchedCount = matchedMasterIds.size;
      const baseMissing = Math.max(0, masterTotal - matchedCount);
      const redCount = (redByTruck[tNo] || []).length;
      const totalMissing = baseMissing + redCount; // รวมตู้ยังไม่สแกน + ตู้แดง
      const matchRate = masterTotal > 0 ? Math.round((matchedCount / masterTotal) * 100) : 0;

      return {
        ...t,
        assigned_driver_name: liveDriver,    // สะท้อนคนขับปัจจุบันจาก truck_operations สด 100%
        master_containers: masterTotal,      // งานทั้งหมดใน DB (ฝั่งใบวางบิล)
        matched_containers: matchedCount,    // มีใบงานแล้ว (จับคู่แล้ว 1:1)
        missing_containers: totalMissing,    // รอตรวจสอบ (รวมตู้ยังไม่สแกน + ตู้แดง)
        red_containers: redCount,            // ยอดตู้แดงเฉพาะ
        match_rate: matchRate,               // อัตราความคืบหน้า %
        total_containers: masterTotal        // ยอดงานรวม (งานใน DB)
      };
    });

    return { data: enrichedTrucks, error: null };
  } catch (err) {
    console.error('fetchTrucks error:', err);
    return { data: [], error: err.message };
  }
}

/**
 * เพิ่มข้อมูลรถใหม่
 */
export async function createTruck(truckData) {
  try {
    const cleanData = {
      truck_no: String(truckData.truck_no || '').trim(),
      truck_license: truckData.truck_license?.trim() || '-',
      owner: truckData.owner?.trim() || '-',
      truck_type: truckData.truck_type?.trim() || 'หัวลาก 10 ล้อ',
      truck_kind: truckData.truck_kind?.trim() || 'กึ่งพ่วง',
      brand: truckData.brand?.trim() || '-',
      status: truckData.status || 'active',
      assigned_driver_name: truckData.assigned_driver_name?.trim() || '-',
      tax_expiry_date: truckData.tax_expiry_date || null,
      act_expiry_date: truckData.act_expiry_date || null,
      insurance_expiry_date: truckData.insurance_expiry_date || null,
      remark: truckData.remark?.trim() || '-',
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('truck_records')
      .insert([cleanData])
      .select()
      .single();

    if (error) throw error;

    // ถ้ามีการระบุคนขับประจำ ให้ไปอัปเดตที่ตาราง driver_records ด้วย
    if (cleanData.assigned_driver_name && cleanData.assigned_driver_name !== '-') {
      // 1. ปลดรถคันเก่าของคนขับคนนี้ (ถ้ามี)
      await supabase
        .from('truck_records')
        .update({ assigned_driver_name: '-', updated_at: new Date().toISOString() })
        .eq('assigned_driver_name', cleanData.assigned_driver_name)
        .neq('id', data.id);

      // 2. มอบหมายรถให้คนขับ
      await supabase
        .from('driver_records')
        .update({ assigned_truck_no: cleanData.truck_no, status: 'active', updated_at: new Date().toISOString() })
        .eq('driver_name', cleanData.assigned_driver_name);

      // 3. บันทึก History Timeline
      recordAssignmentHistory({
        driverName: cleanData.assigned_driver_name,
        truckNo: cleanData.truck_no,
        action: 'ASSIGN',
        reason: 'เพิ่มรถใหม่และผูกคนขับประจำ'
      });
    }

    return { data, error: null };
  } catch (err) {
    console.error('createTruck error:', err);
    return { data: null, error: err.message };
  }
}

/**
 * แก้ไขข้อมูลรถ
 */
export async function updateTruck(id, truckData) {
  try {
    // 1. ดึงข้อมูลรถเดิมเพื่อดูการเปลี่ยนแปลงคนขับและสถานะ
    const { data: oldTruck } = await supabase
      .from('truck_records')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    const isNonActiveStatus = truckData.status === 'maintenance' || truckData.status === 'inactive';
    const shouldStopOp = isNonActiveStatus && truckData.autoStopOperation !== false;
    const effDate = truckData.effectiveDate || new Date().toISOString().slice(0, 10);
    // ถ้ารถเข้าซ่อมหรือระงับใช้ และผู้ใช้ยืนยันหยุดงวดงาน ให้ปลดคนขับเป็นว่าง ('-') อัตโนมัติ
    const targetDriverName = shouldStopOp ? '-' : (truckData.assigned_driver_name?.trim() || oldTruck?.assigned_driver_name || '-');

    const cleanData = {
      truck_no: String(truckData.truck_no || '').trim(),
      truck_license: truckData.truck_license?.trim() || '-',
      owner: truckData.owner?.trim() || '-',
      truck_type: truckData.truck_type?.trim() || 'หัวลาก 10 ล้อ',
      truck_kind: truckData.truck_kind?.trim() || 'กึ่งพ่วง',
      brand: truckData.brand?.trim() || '-',
      status: truckData.status || 'active',
      assigned_driver_name: targetDriverName,
      tax_expiry_date: truckData.tax_expiry_date || null,
      act_expiry_date: truckData.act_expiry_date || null,
      insurance_expiry_date: truckData.insurance_expiry_date || null,
      remark: truckData.remark?.trim() || '-',
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('truck_records')
      .update(cleanData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    const oldDriver = oldTruck?.assigned_driver_name && oldTruck.assigned_driver_name !== '-' ? oldTruck.assigned_driver_name : null;
    const newDriver = cleanData.assigned_driver_name && cleanData.assigned_driver_name !== '-' ? cleanData.assigned_driver_name : null;

    // 🛑 กฎข้อที่ 1: ถ้ารถเปลี่ยนสถานะเป็น ซ่อมบำรุง หรือ ระงับใช้งาน และยืนยันหยุดงวดงาน ➡️ สั่งหยุดงวดงานปัจจุบันและปลดคนขับอัตโนมัติ
    if (shouldStopOp && (oldDriver || oldTruck)) {
      let rpcHandled = false;
      const stopReason = truckData.status === 'maintenance'
        ? `รถ ${cleanData.truck_no} เข้าอู่ซ่อมบำรุง (ปลดคนขับอัตโนมัติ)`
        : `รถ ${cleanData.truck_no} ถูกระงับใช้งาน/ปลดระวาง (ปลดคนขับอัตโนมัติ)`;

      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('unassign_driver_truck_rpc', {
          p_truck_no: cleanData.truck_no,
          p_driver_name: oldDriver || '-',
          p_end_date: effDate,
          p_reason: stopReason
        });
        if (!rpcErr && rpcRes?.success) {
          rpcHandled = true;
        }
      } catch (e) {
        console.warn('RPC unassign for maintenance/inactive error:', e);
      }

      if (!rpcHandled) {
        if (oldDriver) {
          await supabase
            .from('driver_records')
            .update({ assigned_truck_no: '-', updated_at: new Date().toISOString() })
            .eq('driver_name', oldDriver);

          recordAssignmentHistory({
            driverName: oldDriver,
            truckNo: cleanData.truck_no,
            action: 'UNASSIGN',
            reason: stopReason,
            effectiveDate: effDate
          });
        }

        try {
          await supabase
            .from('truck_operations')
            .update({
              end_date: effDate,
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('truck_no', cleanData.truck_no)
            .eq('status', 'active');
        } catch (e) {
          console.warn('Close active operation on truck maintenance error:', e);
        }
      }
    }

    // 🔧 กฎข้อที่ 1.1: บันทึกประวัติการเข้าซ่อมบำรุงใน Timeline (Maintenance Start)
    if (cleanData.status === 'maintenance' && oldTruck?.status !== 'maintenance') {
      const maintenanceReason = truckData.statusReason 
        ? `รถ ${cleanData.truck_no} เข้าอู่ซ่อมบำรุง (${truckData.statusReason})`
        : (truckData.expectedEndDate 
          ? `รถ ${cleanData.truck_no} เข้าอู่ซ่อมบำรุง (กำหนดเสร็จ: ${truckData.expectedEndDate})`
          : `รถ ${cleanData.truck_no} เข้าอู่ซ่อมบำรุง (ยังไม่มีกำหนดเสร็จ)`);

      recordAssignmentHistory({
        driverName: oldDriver || '-',
        truckNo: cleanData.truck_no,
        action: 'MAINTENANCE',
        reason: maintenanceReason,
        effectiveDate: effDate,
        truckLicense: cleanData.truck_license
      });
    }

    // ✅ กฎข้อที่ 1.2: บันทึกประวัติซ่อมเสร็จ & สรุปช่วงเวลาเข้าซ่อมใน Timeline (Maintenance Finished)
    if (cleanData.status === 'active' && oldTruck?.status === 'maintenance') {
      const sDate = truckData.startDate || getLastMaintenanceRecord(cleanData.truck_no)?.effective_date || oldTruck?.updated_at?.slice(0, 10) || effDate;
      let days = 1;
      try {
        const d1 = new Date(sDate);
        const d2 = new Date(effDate);
        const diff = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        days = diff > 0 ? diff : 1;
      } catch {}
      const repairNote = truckData.statusReason ? ` [${truckData.statusReason}]` : '';
      const finishReason = `รถ ${cleanData.truck_no} ซ่อมเสร็จพร้อมใช้งาน${repairNote} (ช่วงเวลาเข้าซ่อม: ${sDate} ถึง ${effDate} รวม ${days} วัน)`;

      recordAssignmentHistory({
        driverName: cleanData.assigned_driver_name || '-',
        truckNo: cleanData.truck_no,
        action: 'MAINTENANCE_END',
        reason: finishReason,
        effectiveDate: effDate,
        truckLicense: cleanData.truck_license
      });
    }

    // 🔄 กฎข้อที่ 2: ตรวจสอบการเปลี่ยนคนขับประจำรถกรณีสถานะ Active
    if (!isNonActiveStatus && oldDriver !== newDriver) {
      let rpcHandled = false;

      // 1. ถ้าเป็นการมอบหมายคนขับใหม่ ลองใช้ RPC ก่อนเพื่อความ Atomic 100%
      if (newDriver) {
        try {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('assign_driver_to_truck_rpc', {
            p_truck_no: cleanData.truck_no,
            p_driver_name: newDriver,
            p_start_date: new Date().toISOString().slice(0, 10),
            p_operation_type: 'primary',
            p_remark: 'มอบหมายประจำรถผ่านเมนูข้อมูลรถ',
            p_created_by: truckData?.createdBy || 'Admin'
          });

          if (!rpcErr && rpcRes?.success) {
            rpcHandled = true;
          }
        } catch (e) {
          console.warn('RPC assign_driver_to_truck_rpc fallback to client sync:', e);
        }
      } else if (oldDriver && !newDriver) {
        // ถ้าเป็นการปลดคนขับ ลองใช้ RPC ปลด
        try {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('unassign_driver_truck_rpc', {
            p_truck_no: cleanData.truck_no,
            p_driver_name: oldDriver,
            p_end_date: new Date().toISOString().slice(0, 10),
            p_reason: `ปลดจากรถ ${cleanData.truck_no}`,
            p_created_by: truckData?.createdBy || 'Admin'
          });
          if (!rpcErr && rpcRes?.success) {
            rpcHandled = true;
          }
        } catch (e) {
          console.warn('RPC unassign fallback:', e);
        }
      }

      // 2. ถ้า RPC ยังไม่ได้รัน ให้ใช้ Client-Side Sync ทำงานเป็น Fallback
      if (!rpcHandled) {
        // ปลดคนขับเดิม (ถ้ามี)
        if (oldDriver) {
          await supabase
            .from('driver_records')
            .update({ assigned_truck_no: '-', updated_at: new Date().toISOString() })
            .eq('driver_name', oldDriver);

          recordAssignmentHistory({
            driverName: oldDriver,
            truckNo: cleanData.truck_no,
            action: 'UNASSIGN',
            reason: `ปลดจากรถ ${cleanData.truck_no}`,
            effectiveDate: new Date().toISOString().slice(0, 10)
          });

          try {
            await supabase
              .from('truck_operations')
              .update({ end_date: new Date().toISOString().slice(0, 10), status: 'completed', updated_at: new Date().toISOString() })
              .eq('truck_no', cleanData.truck_no)
              .eq('status', 'active');
          } catch (e) {
            console.warn('Close operation warning:', e);
          }
        }

        // มอบหมายคนขับใหม่ (ถ้ามี)
        if (newDriver) {
          // ปลดรถคันเก่าของคนขับคนใหม่ (ถ้ามี)
          await supabase
            .from('truck_records')
            .update({ assigned_driver_name: '-', updated_at: new Date().toISOString() })
            .eq('assigned_driver_name', newDriver)
            .neq('id', id);

          await supabase
            .from('driver_records')
            .update({ assigned_truck_no: cleanData.truck_no, status: 'active', updated_at: new Date().toISOString() })
            .eq('driver_name', newDriver);

          recordAssignmentHistory({
            driverName: newDriver,
            truckNo: cleanData.truck_no,
            action: 'ASSIGN',
            reason: `มอบหมายประจำรถ ${cleanData.truck_no}`,
            effectiveDate: new Date().toISOString().slice(0, 10)
          });
        }
      }
    }

    return { data, error: null };
  } catch (err) {
    console.error('updateTruck error:', err);
    return { data: null, error: err.message };
  }
}

/**
 * ลบข้อมูลรถ (Safe Delete: Soft-delete เป็น inactive หากมีประวัติในระบบ เพื่อป้องกัน FK Constraint & รักษา Ledger)
 */
export async function deleteTruck(id, truckNo) {
  try {
    const cleanTruck = String(truckNo || '').trim();
    let hasHistory = false;

    if (cleanTruck && cleanTruck !== '-') {
      const [opsCheck, maintCheck] = await Promise.all([
        supabase.from('truck_operations').select('id').eq('truck_no', cleanTruck).limit(1),
        supabase.from('truck_maintenance_records').select('id').eq('truck_no', cleanTruck).limit(1)
      ]);

      if ((opsCheck?.data && opsCheck.data.length > 0) || (maintCheck?.data && maintCheck.data.length > 0)) {
        hasHistory = true;
      }
    }

    if (hasHistory) {
      // 🛡️ Soft Delete: ปรับสถานะเป็น inactive, ปลดคนขับ และปิดงวดงาน
      await supabase.from('truck_records').update({
        status: 'inactive',
        assigned_driver_name: '-',
        updated_at: new Date().toISOString()
      }).eq('id', id);

      if (cleanTruck && cleanTruck !== '-') {
        await supabase.from('truck_operations').update({
          end_date: new Date().toISOString().slice(0, 10),
          status: 'completed',
          updated_at: new Date().toISOString()
        }).eq('truck_no', cleanTruck).eq('status', 'active');

        await supabase.from('driver_records').update({
          assigned_truck_no: '-',
          updated_at: new Date().toISOString()
        }).eq('assigned_truck_no', cleanTruck);

        recordAssignmentHistory({
          driverName: '-',
          truckNo: cleanTruck,
          action: 'STATUS_CHANGE',
          reason: 'ระงับใช้งานรถ (Soft Delete เนื่องจากมีประวัติงาน/ซ่อมบำรุงในระบบ)'
        });
      }

      return { error: null, softDeleted: true, message: `รถเบอร์ ${cleanTruck} มีประวัติการใช้งาน/ซ่อมบำรุงในระบบ ระบบจึงได้ปรับสถานะเป็น "ระงับใช้งาน" (Soft Delete) เพื่อรักษาประวัติการทำงาน` };
    }

    // 🗑️ Hard Delete สำหรับรายการที่ไม่มีประวัติผูกพัน
    const { error } = await supabase
      .from('truck_records')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === '23503' || String(error.message || '').includes('violates foreign key')) {
        await supabase.from('truck_records').update({
          status: 'inactive',
          assigned_driver_name: '-',
          updated_at: new Date().toISOString()
        }).eq('id', id);

        return { error: null, softDeleted: true, message: `ไม่สามารถลบถาวรได้เนื่องจากมีข้อมูลอ้างอิง ระบบจึงปรับสถานะเป็น "ระงับใช้งาน" (Soft Delete)` };
      }
      throw error;
    }

    // ปลดเบอร์รถในตาราง driver_records
    if (cleanTruck && cleanTruck !== '-') {
      await supabase
        .from('driver_records')
        .update({ assigned_truck_no: '-', updated_at: new Date().toISOString() })
        .eq('assigned_truck_no', cleanTruck);
    }

    return { error: null, softDeleted: false };
  } catch (err) {
    console.error('deleteTruck error:', err);
    return { error: err.message, softDeleted: false };
  }
}

/**
 * นำเข้าข้อมูลรถเป็นชุดจาก Excel (Bulk Upsert)
 */
export async function bulkUpsertTrucks(truckList) {
  try {
    const cleanList = truckList.map(t => ({
      truck_no: String(t.truck_no || '').trim(),
      truck_license: t.truck_license ? String(t.truck_license).trim() : '-',
      owner: t.owner ? String(t.owner).trim() : (t.remark ? String(t.remark).trim() : '-'),
      truck_type: t.truck_type ? String(t.truck_type).trim() : 'หัวลาก',
      truck_kind: t.truck_kind ? String(t.truck_kind).trim() : 'กึ่งพ่วง',
      brand: t.brand ? String(t.brand).trim() : '-',
      status: t.status || 'active',
      assigned_driver_name: t.assigned_driver_name ? String(t.assigned_driver_name).trim() : '-',
      tax_expiry_date: t.tax_expiry_date || null,
      act_expiry_date: t.act_expiry_date || null,
      insurance_expiry_date: t.insurance_expiry_date || null,
      remark: t.remark ? String(t.remark).trim() : '-',
      updated_at: new Date().toISOString()
    })).filter(t => t.truck_no);

    const { data, error } = await supabase
      .from('truck_records')
      .upsert(cleanList, { onConflict: 'truck_no' });

    if (error) throw error;
    return { count: cleanList.length, error: null };
  } catch (err) {
    console.error('bulkUpsertTrucks error:', err);
    return { count: 0, error: err.message };
  }
}


// ==========================================
// 👤 DRIVERS API
// ==========================================

/**
 * ดึงรายการคนขับทั้งหมด พร้อมสรุปสถิติงานจริง (ผูกตามช่วงเวลาที่ขึ้นขับจริงใน truck_operations)
 */
export async function fetchDrivers() {
  try {
    const [driversRes, masterRes, itemsRes, sheetsRes, opsRes, trucksRes, leavesRes] = await Promise.all([
      supabase.from('driver_records').select('*').order('driver_name', { ascending: true }),
      supabase.from('container_records').select('id, container_no, truck_no, port, dis_load, date_job, date_job_parsed').limit(10000),
      supabase.from('job_sheet_items').select('id, job_sheet_id, container_no, match_status, ref_master_id, date_job, date_job_parsed').limit(10000),
      supabase.from('job_sheets').select('id, truck_no, status, created_at').neq('status', 'deleted').limit(10000),
      supabase.from('truck_operations').select('id, truck_no, driver_name, start_date, end_date, status').limit(5000),
      supabase.from('truck_records').select('truck_no, assigned_driver_name').limit(1000),
      supabase.from('driver_leave_records').select('id, driver_name, start_date, end_date, expected_end_date, is_indefinite, status').limit(5000)
    ]);

    if (driversRes.error) throw driversRes.error;
    const drivers = driversRes.data || [];
    const masterData = masterRes.data || [];
    const itemsData = itemsRes.data || [];
    const sheetsData = sheetsRes.data || [];
    const opsData = opsRes?.data || [];
    const trucksData = trucksRes?.data || [];
    const leavesData = leavesRes?.data || [];

    const sheetMap = {};
    sheetsData.forEach(s => { sheetMap[s.id] = s; });

    // 🚚 ฟังก์ชันค้นหาคนขับที่วิ่งงานจริงในวันนั้น ตามช่วงเวลาใน truck_operations เท่านั้น (Strict Timeline)
    const findDriverForJob = (truckNo, jobDateStr) => {
      if (!truckNo || truckNo === '-') return null;
      const cleanTruck = String(truckNo).trim();

      // แปลงวันที่ date_job ให้อยู่ในรูปแบบ ISO YYYY-MM-DD เพื่อเทียบช่วงเวลา
      let isoDate = null;
      if (jobDateStr && jobDateStr !== '-') {
        const norm = normalizeExcelDate(jobDateStr);
        if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) {
          isoDate = norm;
        }
      }

      // 1. ค้นหา Operation ของรถคันนี้ที่ครอบคลุมวันที่ทำงานนั้น (start_date <= date_job <= end_date)
      if (isoDate && opsData.length > 0) {
        const matchedOp = opsData.find(op => {
          if (String(op.truck_no || '').trim() !== cleanTruck) return false;
          const sDate = op.start_date ? String(op.start_date).slice(0, 10) : null;
          const eDate = op.end_date ? String(op.end_date).slice(0, 10) : null;
          
          // ถ้ามี start_date แล้ว date_job มาก่อนวันเริ่ม -> ไม่ใช่งวดนี้
          if (sDate && isoDate < sDate) return false;
          // ถ้ามี end_date แล้ว date_job เลยวันสิ้นสุด -> ไม่ใช่งวดนี้
          if (eDate && isoDate > eDate) return false;
          return true;
        });

        if (matchedOp && matchedOp.driver_name && matchedOp.driver_name !== '-') {
          return String(matchedOp.driver_name).trim();
        }
      }

      // 2. Fallback: ถ้าหาตามช่วงเวลาไม่พบ ให้ดูคนขับประจำปัจจุบันใน truck_operations
      const activeOp = opsData.find(op => String(op.truck_no || '').trim() === cleanTruck && (op.status === 'active' || !op.end_date));
      if (activeOp && activeOp.driver_name && activeOp.driver_name !== '-') {
        return String(activeOp.driver_name).trim();
      }

      // 3. Fallback: ดูคนขับประจำในทะเบียนรถ truck_records (กรณีลืมลง Operation)
      const defaultTruck = trucksData.find(t => String(t.truck_no || '').trim() === cleanTruck);
      if (defaultTruck && defaultTruck.assigned_driver_name && defaultTruck.assigned_driver_name !== '-') {
        return String(defaultTruck.assigned_driver_name).trim();
      }

      return null;
    };

    // 📄 สร้าง Map เจ้าของใบงาน (1 Job Sheet = 1 Driver Consensus)
    const sheetDriverMap = {};
    sheetsData.forEach(sheet => {
      const sId = sheet.id;
      const tNo = String(sheet.truck_no || '').trim();
      const sDate = sheet.date_job_parsed || sheet.date_job;
      
      // 1. ถ้ามีระบุ driver_name ชัดเจนบนหัวใบงาน
      if (sheet.driver_name && sheet.driver_name !== '-') {
        sheetDriverMap[sId] = String(sheet.driver_name).trim();
        return;
      }
      
      // 2. หาคนขับตามวันที่และเบอร์รถบนหัวใบงาน (พร้อม Fallback คนขับประจำรถ)
      const detectedDriver = findDriverForJob(tNo, sDate);
      if (detectedDriver) {
        sheetDriverMap[sId] = detectedDriver;
      }
    });

    // 📄 จัดกลุ่ม Completed & Red Items จากใบงานตามเจ้าของใบงาน (1 Sheet = 1 Driver)
    const itemsByDriver = {};
    const redByDriver = {};
    const matchedMasterIdToDriverMap = {};

    itemsData.forEach(item => {
      if (item.match_status === 'cancelled') return;
      const sheet = sheetMap[item.job_sheet_id] || {};
      const tNo = String(sheet.truck_no || '').trim();
      
      // เจ้าของใบงานของตู้นี้ (ยึดตาม 1 ใบงาน = 1 คนขับ)
      const drvName = sheetDriverMap[item.job_sheet_id] || findDriverForJob(tNo, item.date_job_parsed || item.date_job);
      if (!drvName || drvName === '-') return;

      if (item.match_status === 'manual_red' || item.match_status === 'unmatched_red') {
        if (!redByDriver[drvName]) redByDriver[drvName] = [];
        redByDriver[drvName].push(item);
      } else {
        if (!itemsByDriver[drvName]) itemsByDriver[drvName] = [];
        itemsByDriver[drvName].push({
          ...item,
          truck_no: tNo,
          assigned_driver_at_job: drvName
        });

        // บันทึกว่า Master Record ID นี้ถูกคนขับคนไหนสแกนตรวจสำเร็จ (Job Sheet Driver Override Date Lag)
        if (item.ref_master_id) {
          matchedMasterIdToDriverMap[Number(item.ref_master_id)] = drvName;
        }
      }
    });

    // 👤 จัดกลุ่มงานตู้จาก Master DB ตามคนขับจริง (ตู้ที่สแกนแล้วยึดคนขับจากใบงาน / ตู้ยังไม่สแกนยึดตามช่วงเวลา)
    const masterByDriver = {};
    masterData.forEach(m => {
      const mId = Number(m.id);
      const tNo = String(m.truck_no || '').trim();
      
      // หากตู้นี้ในใบวางบิลถูกสแกนสำเร็จแล้ว -> ให้สิทธิ์เป็นของคนขับตัวจริงที่สแกนใบงานนั้น (แก้ปัญหา Date Lag ข้ามวัน)
      let drvName = matchedMasterIdToDriverMap[mId];
      
      // หากยังไม่ได้สแกน -> กระจายตามช่วงเวลาในใบวางบิล (Planned Driver Assignment)
      if (!drvName) {
        drvName = findDriverForJob(tNo, m.date_job_parsed || m.date_job);
      }

      if (!drvName || drvName === '-') return;

      if (!masterByDriver[drvName]) masterByDriver[drvName] = [];
      masterByDriver[drvName].push({
        ...m,
        assigned_truck_at_job: tNo
      });
    });

    const hasOpsTable = !opsRes?.error && Array.isArray(opsRes?.data);
    const todayStr = new Date().toISOString().slice(0, 10);
    const staleLeaveDriverNames = [];

    const enrichedDrivers = drivers.map(d => {
      const dName = String(d.driver_name || '').trim();
      const driverMasterList = masterByDriver[dName] || [];
      const driverItems = itemsByDriver[dName] || [];
      const masterTotal = driverMasterList.length;

      // 🔍 ค้นหารถประจำปัจจุบันจาก truck_operations (Single Source of Truth)
      const activeOp = opsData.find(op => String(op.driver_name || '').trim() === dName && (op.status === 'active' || !op.end_date));
      const liveTruck = hasOpsTable
        ? (activeOp && activeOp.truck_no && activeOp.truck_no !== '-' ? String(activeOp.truck_no).trim() : '-')
        : (d.assigned_truck_no || '-');

      // 🏖️ ตรวจสอบสถานะการลางานสด (Live Leave Status Check):
      // คนขับจะอยู่ในสถานะ leave ก็ต่อเมื่อมีใบลาที่ active อยู่ ณ วันนี้จริงๆ
      const activeLeave = leavesData.find(l => {
        if (String(l.driver_name || '').trim().toLowerCase() !== dName.toLowerCase()) return false;
        const isIndef = l.is_indefinite === true;
        const sDate = l.start_date || '2000-01-01';
        const eDate = l.end_date || (!isIndef && l.expected_end_date ? l.expected_end_date : null);
        
        if (l.status === 'completed') return false;
        if (eDate && eDate < todayStr) return false;
        return sDate <= todayStr;
      });

      let liveStatus = d.status || 'active';
      if (activeLeave) {
        liveStatus = 'leave';
      } else if (d.status === 'leave') {
        // ถ้าเคยเป็น leave แต่ไม่มี active leave ณ วันนี้แล้ว -> ปรับสถานะกลับเป็น active อัตโนมัติ!
        liveStatus = 'active';
        staleLeaveDriverNames.push(dName);
      }

      // 🎯 1:1 Consumption Matching Algorithm (ตู้ที่จับคู่แล้วจะไม่ถูกใช้ซ้ำ)
      const matchedMasterIds = calculateMatchedMasterIds(driverMasterList, driverItems);
      const matchedCount = matchedMasterIds.size;
      const baseMissing = Math.max(0, masterTotal - matchedCount);
      const redCount = (redByDriver[dName] || []).length;
      const totalMissing = baseMissing + redCount; // รวมตู้ยังไม่สแกน + ตู้แดงที่คนขับสแกนเข้ามา
      const matchRate = masterTotal > 0 ? Math.round((matchedCount / masterTotal) * 100) : 0;

      const cachedProfile = getDriverPayrollProfile(dName) || {};
      const baseSalary = (d.base_salary !== undefined && d.base_salary !== null) ? Number(d.base_salary) : Number(cachedProfile.base_salary || 0);
      const taxProfile = d.tax_profile || cachedProfile.tax_profile || 'social_security';
      const ssoRaw = (d.social_security_amount !== undefined && d.social_security_amount !== null) ? Number(d.social_security_amount) : Number(cachedProfile.social_security_amount || 875);
      const socialSecurityAmount = ssoRaw === 750 ? 875 : ssoRaw;

      return {
        ...d,
        base_salary: baseSalary,
        tax_profile: taxProfile,
        social_security_amount: socialSecurityAmount,
        status: liveStatus,                  // สะท้อนสถานะการทำงานจริงตามใบลาอัตโนมัติ
        assigned_truck_no: liveTruck,        // สะท้อนรถประจำปัจจุบันจาก truck_operations สด 100%
        master_containers: masterTotal,      // งานในใบวางบิลที่คนขับรับผิดชอบ
        total_containers: masterTotal,
        matched_containers: matchedCount,    // ตรวจสอบแล้ว (ตรงใบวางบิล Green)
        missing_containers: totalMissing,    // รอตรวจสอบ (ตู้ยังไม่สแกน + ตู้แดง)
        red_containers: redCount,            // ยอดตู้แดงเฉพาะ
        match_rate: matchRate
      };
    });

    // 🔄 ซิงค์แก้ไขสถานะใน DB สำหรับคนขับที่สิ้นสุดการลาแล้วแต่สถานะในตารางหลักค้างอยู่
    if (staleLeaveDriverNames.length > 0) {
      setTimeout(async () => {
        for (const name of staleLeaveDriverNames) {
          try {
            await supabase
              .from('driver_records')
              .update({ status: 'active', updated_at: new Date().toISOString() })
              .eq('driver_name', name)
              .eq('status', 'leave');
          } catch (e) {
            console.warn('Auto restore driver active status error:', e);
          }
        }
      }, 50);
    }

    return { data: enrichedDrivers, error: null };
  } catch (err) {
    console.error('fetchDrivers error:', err);
    return { data: [], error: err.message };
  }
}

/**
 * เพิ่มคนขับใหม่ (Smart Assignment & History Recording)
 */
export async function createDriver(driverData) {
  try {
    const isInactiveOrLeave = driverData.status === 'inactive' || driverData.status === 'leave';
    const targetTruckNo = isInactiveOrLeave ? '-' : (driverData.assigned_truck_no ? String(driverData.assigned_truck_no).trim() : '-');

    const cleanData = {
      driver_name: String(driverData.driver_name || '').trim(),
      phone: driverData.phone?.trim() || '-',
      id_card: driverData.id_card?.trim() || '-',
      license_no: driverData.license_no?.trim() || '-',
      license_type: driverData.license_type?.trim() || 'ท.4',
      license_expiry_date: driverData.license_expiry_date || null,
      assigned_truck_no: targetTruckNo,
      status: driverData.status || 'active',
      start_date: driverData.start_date || null,
      base_salary: Number(driverData.base_salary || 0),
      tax_profile: driverData.tax_profile || 'social_security',
      social_security_amount: Number(driverData.social_security_amount || 875),
      emergency_contact: driverData.emergency_contact?.trim() || '-',
      remark: driverData.remark?.trim() || '-',
      updated_at: new Date().toISOString()
    };

    saveDriverPayrollProfile(cleanData.driver_name, {
      base_salary: cleanData.base_salary,
      tax_profile: cleanData.tax_profile,
      social_security_amount: cleanData.social_security_amount
    });

    // 1. ถ้ามีการระบุรถ และสถานะ Active ➡️ ตรวจสอบและปลดคนขับเดิมของรถคันนี้ (ถ้ามี)
    let previousDriverOfTruck = null;
    if (cleanData.assigned_truck_no && cleanData.assigned_truck_no !== '-') {
      const { data: existingOnTruck } = await supabase
        .from('driver_records')
        .select('id, driver_name')
        .eq('assigned_truck_no', cleanData.assigned_truck_no);

      if (existingOnTruck && existingOnTruck.length > 0) {
        previousDriverOfTruck = existingOnTruck[0].driver_name;
        for (const prev of existingOnTruck) {
          await supabase
            .from('driver_records')
            .update({ assigned_truck_no: '-', updated_at: new Date().toISOString() })
            .eq('id', prev.id);

          recordAssignmentHistory({
            driverName: prev.driver_name,
            truckNo: cleanData.assigned_truck_no,
            action: 'UNASSIGN',
            reason: `สลับรถให้คนขับใหม่ (${cleanData.driver_name})`
          });
        }
      }
    }

    // 2. Insert คนขับใหม่ (พร้อม Fallback กรณี Database ยังไม่ได้รัน Migration เพิ่มคอลัมน์)
    let insertResult = await supabase
      .from('driver_records')
      .insert([cleanData])
      .select()
      .maybeSingle();

    let data = insertResult.data;
    let error = insertResult.error;

    if (error && (error.message?.includes('schema cache') || error.message?.includes('base_salary') || error.message?.includes('column'))) {
      console.warn('Supabase missing salary/tax columns, retrying without them and using local cache fallback');
      const fallbackData = { ...cleanData };
      delete fallbackData.base_salary;
      delete fallbackData.tax_profile;
      delete fallbackData.social_security_amount;
      const retry = await supabase.from('driver_records').insert([fallbackData]).select().maybeSingle();
      if (retry.error) throw retry.error;
      data = retry.data ? { ...retry.data, ...cleanData } : cleanData;
      error = null;
    } else if (error) {
      throw error;
    }

    // 3. ผูกชื่อคนขับเข้ากับตาราง truck_records
    if (cleanData.assigned_truck_no && cleanData.assigned_truck_no !== '-') {
      await supabase
        .from('truck_records')
        .update({ assigned_driver_name: cleanData.driver_name, updated_at: new Date().toISOString() })
        .eq('truck_no', cleanData.assigned_truck_no);

      recordAssignmentHistory({
        driverName: cleanData.driver_name,
        truckNo: cleanData.assigned_truck_no,
        action: 'ASSIGN',
        reason: 'รับเข้าใหม่และมอบหมายรถประจำ',
        previousDriver: previousDriverOfTruck
      });
    }

    return { data, error: null };
  } catch (err) {
    console.error('createDriver error:', err);
    return { data: null, error: err.message };
  }
}

/**
 * แก้ไขข้อมูลคนขับ (Smart Reassignment & Lifecycle Management)
 */
export async function updateDriver(id, driverData) {
  try {
    // 1. ดึงข้อมูลคนขับเดิม
    const { data: oldDriver } = await supabase
      .from('driver_records')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    const isInactiveOrLeave = driverData.status === 'inactive' || driverData.status === 'leave';
    const shouldStopOp = isInactiveOrLeave && driverData.autoStopOperation !== false;
    const effDate = driverData.effectiveDate || new Date().toISOString().slice(0, 10);
    const targetTruckNo = shouldStopOp ? '-' : (driverData.assigned_truck_no ? String(driverData.assigned_truck_no).trim() : oldDriver?.assigned_truck_no || '-');

    const cleanData = {
      driver_name: String(driverData.driver_name || '').trim(),
      phone: driverData.phone?.trim() || '-',
      id_card: driverData.id_card?.trim() || '-',
      license_no: driverData.license_no?.trim() || '-',
      license_type: driverData.license_type?.trim() || 'ท.4',
      license_expiry_date: driverData.license_expiry_date || null,
      assigned_truck_no: targetTruckNo,
      status: driverData.status || 'active',
      start_date: driverData.start_date || null,
      base_salary: driverData.base_salary !== undefined ? Number(driverData.base_salary || 0) : (oldDriver?.base_salary || 0),
      tax_profile: driverData.tax_profile || oldDriver?.tax_profile || 'social_security',
      social_security_amount: driverData.social_security_amount !== undefined ? Number(driverData.social_security_amount || 875) : (oldDriver?.social_security_amount || 875),
      emergency_contact: driverData.emergency_contact?.trim() || '-',
      remark: driverData.remark?.trim() || '-',
      updated_at: new Date().toISOString()
    };

    saveDriverPayrollProfile(cleanData.driver_name, {
      base_salary: cleanData.base_salary,
      tax_profile: cleanData.tax_profile,
      social_security_amount: cleanData.social_security_amount
    });

    const oldTruckNo = oldDriver?.assigned_truck_no && oldDriver.assigned_truck_no !== '-' ? String(oldDriver.assigned_truck_no).trim() : null;
    const newTruckNo = cleanData.assigned_truck_no && cleanData.assigned_truck_no !== '-' ? String(cleanData.assigned_truck_no).trim() : null;
    const oldStatus = oldDriver?.status || 'active';
    const newStatus = cleanData.status;

    // 2. อัปเดตข้อมูลคนขับ (พร้อม Fallback กรณี Database ยังไม่ได้รัน Migration เพิ่มคอลัมน์)
    let updateResult = await supabase
      .from('driver_records')
      .update(cleanData)
      .eq('id', id)
      .select()
      .maybeSingle();

    let data = updateResult.data;
    let error = updateResult.error;

    if (error && (error.message?.includes('schema cache') || error.message?.includes('base_salary') || error.message?.includes('column'))) {
      console.warn('Supabase missing salary/tax columns, updating without them and using local cache fallback');
      const fallbackData = { ...cleanData };
      delete fallbackData.base_salary;
      delete fallbackData.tax_profile;
      delete fallbackData.social_security_amount;
      const retry = await supabase.from('driver_records').update(fallbackData).eq('id', id).select().maybeSingle();
      if (retry.error) throw retry.error;
      data = retry.data ? { ...retry.data, ...cleanData } : cleanData;
      error = null;
    } else if (error) {
      throw error;
    }

    if (error) throw error;

    // 3. จัดการกรณีเปลี่ยนสถานะเป็น ลางาน หรือ ลาออก (และยืนยันหยุดงวดงาน)
    if (shouldStopOp && oldTruckNo) {
      let rpcHandled = false;
      const leaveReason = newStatus === 'inactive' 
        ? 'พนักงานลาออก/พ้นสภาพ (ปลดรถอัตโนมัติ)' 
        : 'พนักงานลางาน/พักงาน (ปลดรถชั่วคราว)';

      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('unassign_driver_truck_rpc', {
          p_truck_no: oldTruckNo,
          p_driver_name: cleanData.driver_name,
          p_end_date: effDate,
          p_reason: leaveReason
        });
        if (!rpcErr && rpcRes?.success) {
          rpcHandled = true;
        }
      } catch (e) {
        console.warn('RPC unassign for leave/inactive error:', e);
      }

      if (!rpcHandled) {
        await supabase
          .from('truck_records')
          .update({ assigned_driver_name: '-', updated_at: new Date().toISOString() })
          .eq('truck_no', oldTruckNo);

        recordAssignmentHistory({
          driverName: cleanData.driver_name,
          truckNo: oldTruckNo,
          action: newStatus === 'inactive' ? 'RESIGN' : 'LEAVE',
          reason: leaveReason,
          effectiveDate: effDate
        });

        try {
          await supabase
            .from('truck_operations')
            .update({ end_date: effDate, status: 'completed', updated_at: new Date().toISOString() })
            .eq('truck_no', oldTruckNo)
            .eq('status', 'active');
        } catch (e) {
          console.warn('Close operation on leave error:', e);
        }
      }
    }

    // 🟡 3.1 บันทึกประวัติการลางาน (Leave Start)
    if (newStatus === 'leave' && oldStatus !== 'leave') {
      const leaveReason = driverData.statusReason || (driverData.expectedEndDate 
        ? `คุณ ${cleanData.driver_name} ลางาน (กำหนดกลับ: ${driverData.expectedEndDate})`
        : `คุณ ${cleanData.driver_name} ลางาน (ไม่มีกำหนดกลับ)`);

      if (!oldTruckNo) {
        recordAssignmentHistory({
          driverName: cleanData.driver_name,
          truckNo: '-',
          action: 'LEAVE',
          reason: leaveReason,
          effectiveDate: effDate
        });
      }

      // 🏖️ บันทึกลงตาราง driver_leave_records โดยตรง
      createLeaveRecord({
        driver_name: cleanData.driver_name,
        start_date: effDate,
        expected_end_date: driverData.expectedEndDate || null,
        is_indefinite: driverData.isIndefinite !== false,
        leave_type: driverData.leaveType || 'personal',
        leave_reason: driverData.statusReason || 'แจ้งลางาน',
        with_pay: driverData.withPay || 'unpaid',
        remark: driverData.remark || '-'
      });
    }

    // 🟢 3.2 บันทึกประวัติคนขับกลับมาปฏิบัติงาน & สรุปช่วงเวลาที่ลา (Resume Work / End of Leave)
    if (newStatus === 'active' && (oldStatus === 'leave' || oldStatus === 'inactive')) {
      const sDate = driverData.startDate || getLastLeaveRecord(cleanData.driver_name)?.effective_date || oldDriver?.updated_at?.slice(0, 10) || effDate;
      let days = 1;
      try {
        const d1 = new Date(sDate);
        const d2 = new Date(effDate);
        const diff = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        days = diff > 0 ? diff : 1;
      } catch {}
      const returnNote = driverData.statusReason ? ` [${driverData.statusReason}]` : '';
      const returnReason = `คุณ ${cleanData.driver_name} กลับมาปฏิบัติงาน${returnNote} (ช่วงเวลาลางาน: ${sDate} ถึง ${effDate} รวม ${days} วัน)`;

      recordAssignmentHistory({
        driverName: cleanData.driver_name,
        truckNo: cleanData.assigned_truck_no || '-',
        action: 'RESUME_WORK',
        reason: returnReason,
        effectiveDate: effDate
      });

      // 🏖️ บันทึกสิ้นสุดการลาในตาราง driver_leave_records
      completeLeaveRecord(cleanData.driver_name, {
        startDate: sDate,
        returnDate: effDate,
        leaveReason: driverData.statusReason,
        remark: driverData.statusReason
      });
    }

    // 4. จัดการกรณีเปลี่ยนเบอร์รถ (Active)
    if (!isInactiveOrLeave && oldTruckNo !== newTruckNo) {
      let rpcHandled = false;

      // 4.0 ถ้าเป็นการมอบหมายรถใหม่ ลองใช้ RPC ก่อนเพื่อความปลอดภัยแบบ Atomic
      if (newTruckNo) {
        try {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('assign_driver_to_truck_rpc', {
            p_truck_no: newTruckNo,
            p_driver_name: cleanData.driver_name,
            p_start_date: new Date().toISOString().slice(0, 10),
            p_operation_type: 'primary',
            p_remark: 'มอบหมายประจำรถผ่านเมนูข้อมูลคนขับ',
            p_created_by: driverData?.createdBy || 'Admin'
          });

          if (!rpcErr && rpcRes?.success) {
            rpcHandled = true;
          }
        } catch (e) {
          console.warn('RPC assign_driver_to_truck_rpc error, fallback to client sync:', e);
        }
      } else if (oldTruckNo && (!newTruckNo || newTruckNo === '-')) {
        try {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('unassign_driver_truck_rpc', {
            p_truck_no: oldTruckNo,
            p_driver_name: cleanData.driver_name,
            p_end_date: new Date().toISOString().slice(0, 10),
            p_reason: 'ปลดรถออกจากคนขับ',
            p_created_by: driverData?.createdBy || 'Admin'
          });
          if (!rpcErr && rpcRes?.success) {
            rpcHandled = true;
          }
        } catch (e) {
          console.warn('RPC unassign fallback:', e);
        }
      }

      if (!rpcHandled) {
        // 4.1 ปลดรถคันเดิม
        if (oldTruckNo) {
          await supabase
            .from('truck_records')
            .update({ assigned_driver_name: '-', updated_at: new Date().toISOString() })
            .eq('truck_no', oldTruckNo);

          recordAssignmentHistory({
            driverName: cleanData.driver_name,
            truckNo: oldTruckNo,
            action: 'TRANSFER',
            reason: `ย้ายจากรถ ${oldTruckNo} ไปรถ ${newTruckNo || 'ว่าง'}`
          });

          try {
            await supabase
              .from('truck_operations')
              .update({ end_date: new Date().toISOString().slice(0, 10), status: 'completed', updated_at: new Date().toISOString() })
              .eq('truck_no', oldTruckNo)
              .eq('status', 'active');
          } catch (e) {
            console.warn('Close old operation warning:', e);
          }
        }

        // 4.2 มอบหมายรถคันใหม่
        if (newTruckNo) {
          // ปลดคนขับคนอื่นที่เคยประจำรถคันนี้ (ถ้ามี)
          const { data: othersOnNewTruck } = await supabase
            .from('driver_records')
            .select('id, driver_name')
            .eq('assigned_truck_no', newTruckNo)
            .neq('id', id);

          let prevDriverName = null;
          if (othersOnNewTruck && othersOnNewTruck.length > 0) {
            prevDriverName = othersOnNewTruck[0].driver_name;
            for (const o of othersOnNewTruck) {
              await supabase
                .from('driver_records')
                .update({ assigned_truck_no: '-', updated_at: new Date().toISOString() })
                .eq('id', o.id);

              recordAssignmentHistory({
                driverName: o.driver_name,
                truckNo: newTruckNo,
                action: 'UNASSIGN',
                reason: `สลับรถให้ ${cleanData.driver_name}`
              });
            }
          }

          await supabase
            .from('truck_records')
            .update({ assigned_driver_name: cleanData.driver_name, updated_at: new Date().toISOString() })
            .eq('truck_no', newTruckNo);

          recordAssignmentHistory({
            driverName: cleanData.driver_name,
            truckNo: newTruckNo,
            action: 'ASSIGN',
            reason: `มอบหมายประจำรถ ${newTruckNo}`,
            previousDriver: prevDriverName,
            previousTruck: oldTruckNo
          });

          try {
            await supabase
              .from('truck_operations')
              .update({ end_date: new Date().toISOString().slice(0, 10), status: 'completed', updated_at: new Date().toISOString() })
              .eq('truck_no', newTruckNo)
              .eq('status', 'active');

            await supabase
              .from('truck_operations')
              .insert([{
                id: 'op_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                truck_no: newTruckNo,
                driver_name: cleanData.driver_name,
                start_date: new Date().toISOString().slice(0, 10),
                end_date: null,
                status: 'active',
                operation_type: 'primary',
                rate_per_trip: 0,
                remark: 'มอบหมายผ่านเมนูข้อมูลคนขับ',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }]);
          } catch (e) {
            console.warn('Insert operation warning:', e);
          }
        }
      }
    }

    return { data, error: null };
  } catch (err) {
    console.error('updateDriver error:', err);
    return { data: null, error: err.message };
  }
}

/**
 * ลบข้อมูลคนขับ (Safe Delete: Soft-delete เป็น inactive หากมีประวัติในระบบ เพื่อป้องกัน FK Constraint & รักษา Ledger)
 */
export async function deleteDriver(id, driverName) {
  try {
    const cleanName = String(driverName || '').trim();
    let hasHistory = false;

    if (cleanName && cleanName !== '-') {
      const [opsCheck, leaveCheck] = await Promise.all([
        supabase.from('truck_operations').select('id').eq('driver_name', cleanName).limit(1),
        supabase.from('driver_leave_records').select('id').eq('driver_name', cleanName).limit(1)
      ]);

      if ((opsCheck?.data && opsCheck.data.length > 0) || (leaveCheck?.data && leaveCheck.data.length > 0)) {
        hasHistory = true;
      }
    }

    if (hasHistory) {
      // 🛡️ Soft Delete: ปรับสถานะเป็น inactive, ปลดรถ และปิดงวดงาน
      await supabase.from('driver_records').update({
        status: 'inactive',
        assigned_truck_no: '-',
        updated_at: new Date().toISOString()
      }).eq('id', id);

      if (cleanName && cleanName !== '-') {
        await supabase.from('truck_operations').update({
          end_date: new Date().toISOString().slice(0, 10),
          status: 'completed',
          updated_at: new Date().toISOString()
        }).eq('driver_name', cleanName).eq('status', 'active');

        await supabase.from('truck_records').update({
          assigned_driver_name: '-',
          updated_at: new Date().toISOString()
        }).eq('assigned_driver_name', cleanName);

        recordAssignmentHistory({
          driverName: cleanName,
          truckNo: '-',
          action: 'RESIGN',
          reason: 'พ้นสภาพคนขับ/ระงับใช้งาน (Soft Delete เนื่องจากมีประวัติงาน/การลาในระบบ)'
        });
      }

      return { error: null, softDeleted: true, message: `คุณ ${cleanName} มีประวัติการทำงาน/การลาในระบบ ระบบจึงได้ปรับสถานะเป็น "ระงับใช้งาน" (Soft Delete) เพื่อรักษาประวัติการทำงาน` };
    }

    // 🗑️ Hard Delete สำหรับรายการที่ไม่มีประวัติผูกพัน
    const { error } = await supabase
      .from('driver_records')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === '23503' || String(error.message || '').includes('violates foreign key')) {
        await supabase.from('driver_records').update({
          status: 'inactive',
          assigned_truck_no: '-',
          updated_at: new Date().toISOString()
        }).eq('id', id);

        return { error: null, softDeleted: true, message: `ไม่สามารถลบถาวรได้เนื่องจากมีข้อมูลอ้างอิง ระบบจึงปรับสถานะเป็น "ระงับใช้งาน" (Soft Delete)` };
      }
      throw error;
    }

    // ปลดชื่อคนขับในตาราง truck_records
    if (cleanName && cleanName !== '-') {
      await supabase
        .from('truck_records')
        .update({ assigned_driver_name: '-', updated_at: new Date().toISOString() })
        .eq('assigned_driver_name', cleanName);

      recordAssignmentHistory({
        driverName: cleanName,
        truckNo: '-',
        action: 'UNASSIGN',
        reason: 'ลบข้อมูลคนขับออกจากระบบ'
      });
    }

    return { error: null, softDeleted: false };
  } catch (err) {
    console.error('deleteDriver error:', err);
    return { error: err.message, softDeleted: false };
  }
}

/**
 * นำเข้าข้อมูลคนขับเป็นชุดจาก Excel (Smart Upsert & Auto-sync to Trucks)
 */
export async function bulkUpsertDrivers(driverList) {
  try {
    const cleanList = driverList.map(d => ({
      driver_name: String(d.driver_name || '').trim(),
      phone: d.phone ? String(d.phone).trim() : '-',
      id_card: d.id_card ? String(d.id_card).trim() : '-',
      license_no: d.license_no ? String(d.license_no).trim() : '-',
      license_type: d.license_type ? String(d.license_type).trim() : 'ท.4',
      license_expiry_date: d.license_expiry_date || null,
      assigned_truck_no: d.assigned_truck_no ? String(d.assigned_truck_no).trim() : '-',
      status: d.status || 'active',
      start_date: d.start_date || null,
      emergency_contact: d.emergency_contact ? String(d.emergency_contact).trim() : '-',
      remark: d.remark ? String(d.remark).trim() : '-',
      updated_at: new Date().toISOString()
    })).filter(d => d.driver_name);

    if (cleanList.length === 0) return { count: 0, error: null };

    // 1. ดึงคนขับเดิมเพื่อแยก Insert หรือ Update
    const { data: existingDrivers } = await supabase
      .from('driver_records')
      .select('id, driver_name');

    const existingMap = {};
    (existingDrivers || []).forEach(d => {
      existingMap[String(d.driver_name).trim().toLowerCase()] = d.id;
    });

    const toInsert = [];
    const toUpdate = [];

    cleanList.forEach(item => {
      const key = item.driver_name.toLowerCase();
      if (existingMap[key]) {
        toUpdate.push({ id: existingMap[key], ...item });
      } else {
        toInsert.push(item);
      }
    });

    // 2. ดำเนินการ Insert รายการใหม่
    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from('driver_records').insert(toInsert);
      if (insErr) throw insErr;
    }

    // 3. ดำเนินการ Update รายการที่มีอยู่เดิม
    for (const item of toUpdate) {
      const { id, ...dataToUpdate } = item;
      await supabase.from('driver_records').update(dataToUpdate).eq('id', id);
    }

    // 4. ซิงค์ชื่อคนขับเข้าตาราง truck_records สำหรับทุกคันที่มีการผูกรถประจำ
    for (const d of cleanList) {
      if (d.assigned_truck_no && d.assigned_truck_no !== '-') {
        await supabase
          .from('truck_records')
          .update({
            assigned_driver_name: d.driver_name,
            updated_at: new Date().toISOString()
          })
          .eq('truck_no', d.assigned_truck_no);
      }
    }

    return { count: cleanList.length, error: null };
  } catch (err) {
    console.error('bulkUpsertDrivers error:', err);
    return { count: 0, error: err.message };
  }
}

export const truckDriverService = {
  calculateMatchedMasterIds,
  fetchTrucks,
  createTruck,
  updateTruck,
  deleteTruck,
  bulkUpsertTrucks,
  fetchDrivers,
  createDriver,
  updateDriver,
  deleteDriver,
  bulkUpsertDrivers
};

export default truckDriverService;

