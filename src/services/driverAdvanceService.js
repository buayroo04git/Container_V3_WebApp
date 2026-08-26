import { supabase } from '../supabaseClient.js';

const STORAGE_KEY = 'driver_advances_cache_v1';

const safeGetStorage = (key) => {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch (e) {}
  return null;
};

const safeSetStorage = (key, value) => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch (e) {}
};

/**
 * 🏷️ หมวดหมู่หลักของการเบิก / กู้ยืม
 */
export const ADVANCE_CATEGORIES = {
  single_advance: {
    id: 'single_advance',
    label: 'เบิกล่วงหน้า (หักงวดเดียว)',
    shortLabel: 'เบิกล่วงหน้า',
    icon: '💵',
    color: '#d97706',
    bg: '#fffbeb',
    description: 'หักเต็มจำนวนในรอบเงินเดือนถัดไปทันที'
  },
  installment_loan: {
    id: 'installment_loan',
    label: 'ยืมเงินก้อน (ผ่อนชำระเป็นงวด)',
    shortLabel: 'ยืมเงินก้อน',
    icon: '🏦',
    color: '#7c3aed',
    bg: '#f5f3ff',
    description: 'แบ่งหักเงินเดือนเป็นงวดๆ ตามจำนวนงวดที่ระบุ'
  }
};

/**
 * 🔖 ประเภทย่อยของการเบิกเงิน
 */
export const ADVANCE_TYPES = {
  // --- หมวดเบิกล่วงหน้างวดเดียว (Single Advance) ---
  salary_advance: {
    label: 'เบิกเงินเดือนล่วงหน้า',
    category: 'single_advance',
    icon: '💵',
    color: '#d97706',
    bg: '#fffbeb'
  },
  trip_advance: {
    label: 'เบิกค่าเที่ยว / ค่าน้ำมัน',
    category: 'single_advance',
    icon: '⛽',
    color: '#2563eb',
    bg: '#eff6ff'
  },
  emergency: {
    label: 'เบิกฉุกเฉิน',
    category: 'single_advance',
    icon: '🚨',
    color: '#dc2626',
    bg: '#fef2f2'
  },
  // --- หมวดยืมเงินก้อนผ่อนชำระ (Installment Loan) ---
  loan_installment: {
    label: 'ยืมเงินก้อน / ผ่อนชำระ',
    category: 'installment_loan',
    icon: '🏦',
    color: '#7c3aed',
    bg: '#f5f3ff'
  },
  // --- อื่นๆ ---
  other: {
    label: 'อื่นๆ',
    category: 'single_advance',
    icon: '📦',
    color: '#475569',
    bg: '#f8fafc'
  }
};

export const driverAdvanceService = {
  /**
   * Helper จัดการค่าเริ่มต้นของรายการให้สมบูรณ์
   */
  normalizeAdvanceItem(item) {
    if (!item) return item;
    const totalInst = Number(item.installments_total || 1);
    const hasMultipleInst = totalInst > 1;
    const isLoan = item.category === 'installment_loan' || 
                   item.advance_type === 'loan_installment' || 
                   hasMultipleInst ||
                   (Number(item.installment_amount || 0) > 0 && Number(item.installment_amount) < Number(item.amount || 0));

    const category = isLoan ? 'installment_loan' : 'single_advance';
    const advance_type = isLoan ? 'loan_installment' : (item.advance_type || 'salary_advance');
    const amount = Number(item.amount || 0);
    const installments_total = isLoan ? Math.max(1, totalInst) : 1;
    const installments_paid = isLoan ? Math.max(0, Number(item.installments_paid || 0)) : (item.status === 'settled' ? 1 : 0);
    const installment_amount = isLoan 
      ? (Number(item.installment_amount) || Math.round(amount / installments_total))
      : amount;
    const remaining_amount = isLoan
      ? (item.remaining_amount !== undefined && item.remaining_amount !== null && !isNaN(Number(item.remaining_amount))
          ? Number(item.remaining_amount) 
          : Math.max(0, amount - (installments_paid * installment_amount)))
      : (item.status === 'settled' ? 0 : amount);

    let status = item.status || 'pending';
    if (isLoan) {
      if (installments_paid >= installments_total || remaining_amount <= 0) {
        status = 'settled';
      } else if (installments_paid > 0) {
        status = 'in_progress';
      } else {
        status = item.status || 'pending';
      }
    }

    return {
      ...item,
      id: item.id || `adv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      category,
      advance_type,
      amount,
      installments_total,
      installments_paid,
      installment_amount,
      remaining_amount,
      start_period: item.start_period || (item.advance_date ? String(item.advance_date).slice(0, 7) : ''),
      status,
      slip_url: item.slip_url && item.slip_url !== '-' ? item.slip_url : '-'
    };
  },

  /**
   * 1. ดึงรายการเบิกล่วงหน้า / เงินยืม (ผสาน Supabase + Local Cache อัตโนมัติ ป้องกันข้อมูลหาย)
   */
  async fetchAdvances({ driverName = null, dateFrom = null, dateTo = null, status = 'ALL', category = 'ALL', batchName = null } = {}) {
    try {
      // 1. อ่านข้อมูลจาก Local Storage ก่อนเสมอ
      const cached = safeGetStorage(STORAGE_KEY);
      let localList = cached ? JSON.parse(cached).map(r => this.normalizeAdvanceItem(r)) : [];
      const localMap = new Map(localList.map(r => [r.id, r]));

      // 2. ดึงจาก Supabase
      try {
        let query = supabase
          .from('driver_advances')
          .select('*')
          .order('advance_date', { ascending: false });

        if (driverName && driverName !== 'ALL') {
          query = query.eq('driver_name', driverName);
        }
        if (dateFrom) {
          query = query.gte('advance_date', dateFrom);
        }
        if (dateTo) {
          query = query.lte('advance_date', dateTo);
        }
        if (status && status !== 'ALL') {
          query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (!error && Array.isArray(data)) {
          // รวม Supabase data กับ Local cache โดยให้ฟิลด์ของ Local เสริมความสมบูรณ์
          const mergedMap = new Map();
          
          data.forEach(dbItem => {
            const local = localMap.get(dbItem.id) || {};
            const merged = { ...local };
            Object.keys(dbItem).forEach(k => {
              if (dbItem[k] !== null && dbItem[k] !== undefined && dbItem[k] !== '') {
                merged[k] = dbItem[k];
              }
            });
            const normalized = this.normalizeAdvanceItem(merged);
            mergedMap.set(dbItem.id, normalized);
          });

          // เก็บรายการ local ที่ยังไม่ซิงค์ลง Supabase ไว้ด้วย
          localList.forEach(localItem => {
            if (!mergedMap.has(localItem.id)) {
              mergedMap.set(localItem.id, localItem);
            }
          });

          localList = Array.from(mergedMap.values());
          localList.sort((a, b) => (b.advance_date || '').localeCompare(a.advance_date || ''));
          safeSetStorage(STORAGE_KEY, JSON.stringify(localList));
        }
      } catch (err) {
        console.warn('driverAdvanceService.fetchAdvances Supabase network fallback:', err.message);
      }

      // 3. กรองตามเงื่อนไข
      let result = localList;
      if (driverName && driverName !== 'ALL') {
        result = result.filter(r => r.driver_name === driverName);
      }
      if (category && category !== 'ALL') {
        result = result.filter(r => (r.category || (r.advance_type === 'loan_installment' ? 'installment_loan' : 'single_advance')) === category);
      }
      if (dateFrom) {
        result = result.filter(r => (r.advance_date || '') >= dateFrom);
      }
      if (dateTo) {
        result = result.filter(r => (r.advance_date || '') <= dateTo);
      }
      if (status && status !== 'ALL') {
        result = result.filter(r => r.status === status);
      }
      if (batchName && batchName !== 'ALL') {
        result = result.filter(r => r.batch_name === batchName);
      }

      return { data: result, error: null };
    } catch (error) {
      console.error('driverAdvanceService.fetchAdvances error:', error);
      const cached = safeGetStorage(STORAGE_KEY);
      const list = cached ? JSON.parse(cached).map(r => this.normalizeAdvanceItem(r)) : [];
      return { data: list, error: null };
    }
  },

  /**
   * 2. บันทึก / แก้ไขรายการเบิกล่วงหน้า / เงินยืม
   */
  async saveAdvance(advanceData) {
    try {
      const isNew = !advanceData.id;
      const id = advanceData.id || `adv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const isLoan = advanceData.category === 'installment_loan' || advanceData.advance_type === 'loan_installment';
      const category = isLoan ? 'installment_loan' : 'single_advance';
      const advance_type = advanceData.advance_type || (isLoan ? 'loan_installment' : 'salary_advance');
      const amount = Number(advanceData.amount || 0);

      // ป้องกันการกดบันทึกซ้ำ (Duplicate Prevention) สำหรับรายการใหม่
      if (isNew) {
        const cachedCheck = safeGetStorage(STORAGE_KEY);
        const listCheck = cachedCheck ? JSON.parse(cachedCheck) : [];
        const checkDate = advanceData.advance_date ? String(advanceData.advance_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
        const checkDriver = String(advanceData.driver_name || '').trim();
        
        const existingDup = listCheck.find(r => 
          String(r.driver_name || '').trim() === checkDriver &&
          String(r.advance_date || '').slice(0, 10) === checkDate &&
          Number(r.amount) === amount &&
          r.category === category &&
          r.status === 'pending'
        );

        if (existingDup) {
          console.warn('driverAdvanceService: Duplicate pending advance detected, returning existing record.');
          return { data: this.normalizeAdvanceItem(existingDup), error: null, isDuplicate: true };
        }
      }
      const installments_total = isLoan ? Math.max(1, Number(advanceData.installments_total || 1)) : 1;
      const installments_paid = isLoan ? Math.max(0, Number(advanceData.installments_paid || 0)) : (advanceData.status === 'settled' ? 1 : 0);
      const installment_amount = isLoan
        ? (Number(advanceData.installment_amount) || Math.round(amount / installments_total))
        : amount;
      
      const calculatedRemaining = Math.max(0, amount - (installments_paid * installment_amount));
      const remaining_amount = advanceData.remaining_amount !== undefined && advanceData.remaining_amount !== null && !isNaN(Number(advanceData.remaining_amount))
        ? Number(advanceData.remaining_amount)
        : (isLoan ? calculatedRemaining : (advanceData.status === 'settled' ? 0 : amount));

      let status = advanceData.status || 'pending';
      if (isLoan) {
        if (installments_paid >= installments_total || remaining_amount <= 0) {
          status = 'settled';
        } else if (installments_paid > 0) {
          status = 'in_progress';
        } else {
          status = 'pending';
        }
      }

      const advance_date = advanceData.advance_date ? String(advanceData.advance_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
      const start_period = advanceData.start_period || advance_date.slice(0, 7);

      const payload = {
        id,
        advance_date,
        driver_id: advanceData.driver_id || null,
        driver_name: String(advanceData.driver_name || '').trim(),
        assigned_truck_no: '-',
        batch_name: advanceData.batch_name || '-',
        category,
        advance_type,
        amount,
        installments_total,
        installments_paid,
        installment_amount,
        remaining_amount,
        start_period,
        status,
        settlement_batch_id: advanceData.settlement_batch_id || null,
        payment_method: advanceData.payment_method || 'transfer',
        slip_url: advanceData.slip_url || '-',
        remark: advanceData.remark || '-',
        created_by: advanceData.created_by || 'Admin',
        updated_at: new Date().toISOString()
      };

      const normalizedPayload = this.normalizeAdvanceItem(payload);

      // 1. บันทึกใส่ LocalStorage ก่อนทันที เพื่อความรวดเร็วและกันข้อมูลสูญหาย
      const cached = safeGetStorage(STORAGE_KEY);
      let list = cached ? JSON.parse(cached) : [];
      const idx = list.findIndex(r => r.id === id);
      if (idx >= 0) list[idx] = normalizedPayload;
      else list.unshift(normalizedPayload);
      safeSetStorage(STORAGE_KEY, JSON.stringify(list));

      // 2. ซิงค์ลง Supabase
      try {
        const { error } = await supabase
          .from('driver_advances')
          .upsert([payload]);

        if (error) {
          console.warn('driverAdvanceService.saveAdvance Supabase upsert full fallback:', error.message);
          // หากติดเรื่อง column ใหม่ ให้ลองบันทึกเฉพาะ column มาตรฐาน
          const basePayload = {
            id,
            advance_date,
            driver_id: advanceData.driver_id || null,
            driver_name: String(advanceData.driver_name || '').trim(),
            assigned_truck_no: '-',
            batch_name: advanceData.batch_name || '-',
            amount,
            advance_type,
            status,
            settlement_batch_id: advanceData.settlement_batch_id || null,
            payment_method: advanceData.payment_method || 'transfer',
            slip_url: advanceData.slip_url || '-',
            remark: advanceData.remark || '-',
            created_by: advanceData.created_by || 'Admin',
            updated_at: new Date().toISOString()
          };
          await supabase.from('driver_advances').upsert([basePayload]);
        }
      } catch (dbErr) {
        console.warn('driverAdvanceService.saveAdvance Supabase sync error:', dbErr.message);
      }

      return { data: normalizedPayload, error: null };
    } catch (error) {
      console.error('driverAdvanceService.saveAdvance error:', error);
      return { data: null, error };
    }
  },

  /**
   * 3. ลบรายการเบิกล่วงหน้า / เงินยืม
   */
  async deleteAdvance(id) {
    try {
      const cached = safeGetStorage(STORAGE_KEY);
      if (cached) {
        let list = JSON.parse(cached);
        list = list.filter(r => r.id !== id);
        safeSetStorage(STORAGE_KEY, JSON.stringify(list));
      }

      try {
        await supabase
          .from('driver_advances')
          .delete()
          .eq('id', id);
      } catch (err) {
        console.warn('driverAdvanceService.deleteAdvance Supabase delete error:', err.message);
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('driverAdvanceService.deleteAdvance error:', error);
      return { success: false, error };
    }
  },

  /**
   * 4. ตัดรอบรายการเบิกล่วงหน้า (มาร์กว่าหักแล้วในงวดนี้ หรือเพิ่มงวดที่ผ่อน)
   */
  async markAdvancesAsSettled(advanceIds = [], settlementBatchId = null) {
    try {
      if (!advanceIds || advanceIds.length === 0) return { count: 0 };

      const cached = safeGetStorage(STORAGE_KEY);
      let list = cached ? JSON.parse(cached) : [];

      const updates = list
        .filter(r => advanceIds.includes(r.id))
        .map(item => {
          const isLoan = item.category === 'installment_loan' || item.advance_type === 'loan_installment';
          if (isLoan) {
            const totalInst = Math.max(1, Number(item.installments_total || 1));
            const newPaid = Math.min(totalInst, Number(item.installments_paid || 0) + 1);
            const instAmt = Number(item.installment_amount || Math.round(Number(item.amount || 0) / totalInst));
            const newRemaining = Math.max(0, Number(item.amount || 0) - (newPaid * instAmt));
            const isComplete = newPaid >= totalInst || newRemaining <= 0;

            return {
              ...item,
              installments_paid: newPaid,
              remaining_amount: newRemaining,
              status: isComplete ? 'settled' : 'in_progress',
              settlement_batch_id: settlementBatchId,
              updated_at: new Date().toISOString()
            };
          } else {
            return {
              ...item,
              status: 'settled',
              remaining_amount: 0,
              settlement_batch_id: settlementBatchId,
              updated_at: new Date().toISOString()
            };
          }
        });

      if (cached) {
        const updateMap = new Map(updates.map(u => [u.id, u]));
        list = list.map(r => updateMap.has(r.id) ? updateMap.get(r.id) : r);
        safeSetStorage(STORAGE_KEY, JSON.stringify(list));
      }

      try {
        if (updates.length > 0) {
          await supabase.from('driver_advances').upsert(updates);
        }
      } catch (err) {
        console.warn('markAdvancesAsSettled Supabase sync error:', err.message);
      }

      return { count: advanceIds.length, error: null };
    } catch (error) {
      console.error('markAdvancesAsSettled error:', error);
      return { count: 0, error };
    }
  }
};

export default driverAdvanceService;
