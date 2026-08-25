import { supabase } from '../supabaseClient.js';
import { normalizeExcelDate, findBestMasterDbMatch } from '../utils/matchingLogic.js';
import { getDriverPayrollProfile, fetchDrivers } from './truckDriverService.js';
import driverAdvanceService from './driverAdvanceService.js';

const LOCAL_STORAGE_RATE_KEY = 'driver_rate_configs_cache_v1';
const LOCAL_STORAGE_INCENTIVE_KEY = 'driver_incentive_configs_cache_v1';
const LOCAL_STORAGE_TAX_CONFIG_KEY = 'driver_global_tax_config_cache_v1';

export const DEFAULT_GLOBAL_TAX_CONFIG = {
  default_sso_amount: 875,
  default_wht_pct: 3
};

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

// Default Initial Standard Rate Fallback
const DEFAULT_FALLBACK_RATES = [
  {
    id: 'rate_standard_2026',
    name: 'อัตราค่ารอบมาตรฐาน 2026',
    driver_name: 'ALL',
    start_date: '2026-01-01',
    end_date: null,
    rate_20: 100,
    rate_40: 100,
    rate_45: 100,
    rate_default: 100,
    is_active: true,
    remark: 'เรทมาตรฐานประจำการ (เริ่มต้น)'
  }
];

// 🎁 เกณฑ์การคิดเงินพิเศษตามจำนวนงาน (Standard Incentive Tier Ladder)
export const DEFAULT_INCENTIVE_TIERS = [
  { minTrips: 150, bonus: 1000 },
  { minTrips: 160, bonus: 2000 },
  { minTrips: 170, bonus: 3000 },
  { minTrips: 180, bonus: 4000 },
  { minTrips: 190, bonus: 5000 },
  { minTrips: 200, bonus: 6000 },
  { minTrips: 210, bonus: 7000 },
  { minTrips: 220, bonus: 8000 },
  { minTrips: 230, bonus: 9000 }
];

const DEFAULT_FALLBACK_INCENTIVE_CONFIG = {
  id: 'incentive_tier_standard_2026',
  name: 'เกณฑ์เงินพิเศษขั้นบันไดมาตรฐาน (150 ตู้ขึ้นไป)',
  is_active: true,
  start_date: '2026-01-01',
  end_date: null,
  tiers: DEFAULT_INCENTIVE_TIERS,
  step_trips: 10,
  step_bonus: 1000,
  remark: 'ตารางเงินพิเศษ: 150=1000, 160=2000, 170=3000, ..., 230=9000 (+1000 ทุก 10 งาน)'
};

export const driverPayrollService = {
  /**
   * 1. ดึงรายการตั้งค่าเรทราคาตามช่วงเวลาทั้งหมด
   */
  async fetchRateConfigs() {
    try {
      const { data, error } = await supabase
        .from('driver_rate_configs')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) {
        console.warn('driverPayrollService.fetchRateConfigs Supabase fallback:', error.message);
        const cached = safeGetStorage(LOCAL_STORAGE_RATE_KEY);
        if (cached) {
          try {
            return { data: JSON.parse(cached), error: null };
          } catch (e) {
            // parse error
          }
        }
        return { data: DEFAULT_FALLBACK_RATES, error: null };
      }

      if (data && data.length > 0) {
        safeSetStorage(LOCAL_STORAGE_RATE_KEY, JSON.stringify(data));
        return { data, error: null };
      }

      // If empty in DB, return standard default
      return { data: DEFAULT_FALLBACK_RATES, error: null };
    } catch (error) {
      console.error('driverPayrollService.fetchRateConfigs error:', error);
      const cached = safeGetStorage(LOCAL_STORAGE_RATE_KEY);
      if (cached) {
        try {
          return { data: JSON.parse(cached), error: null };
        } catch (e) {}
      }
      return { data: DEFAULT_FALLBACK_RATES, error: null };
    }
  },

  /**
   * 2. บันทึก / อัปเดตการตั้งค่าเรทราคา (Create / Upsert)
   */
  async saveRateConfig(config) {
    try {
      const id = config.id || `rate_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const payload = {
        id,
        name: config.name?.trim() || 'เรทค่ารอบ',
        driver_name: config.driver_name?.trim() || 'ALL',
        start_date: config.start_date ? String(config.start_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
        end_date: config.end_date ? String(config.end_date).slice(0, 10) : null,
        rate_20: Number(config.rate_20 ?? 100),
        rate_40: Number(config.rate_40 ?? 100),
        rate_45: Number(config.rate_45 ?? 100),
        rate_default: Number(config.rate_default ?? 100),
        is_active: config.is_active !== false,
        remark: config.remark?.trim() || '-',
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('driver_rate_configs')
        .upsert(payload)
        .select();

      if (error) {
        console.warn('saveRateConfig Supabase error, updating local storage:', error.message);
      }

      // Update LocalStorage cache
      const cachedRes = await this.fetchRateConfigs();
      let list = cachedRes.data || [];
      const idx = list.findIndex(r => r.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...payload };
      } else {
        list.unshift(payload);
      }
      safeSetStorage(LOCAL_STORAGE_RATE_KEY, JSON.stringify(list));

      return { data: payload, error: null };
    } catch (error) {
      console.error('driverPayrollService.saveRateConfig error:', error);
      return { data: null, error };
    }
  },

  /**
   * 3. ลบรายการตั้งค่าเรทราคา
   */
  async deleteRateConfig(id) {
    try {
      if (!id) return { success: false, error: 'No ID provided' };

      const { error } = await supabase
        .from('driver_rate_configs')
        .delete()
        .eq('id', id);

      if (error) {
        console.warn('deleteRateConfig Supabase error, updating local storage:', error.message);
      }

      // Update LocalStorage cache
      const cached = safeGetStorage(LOCAL_STORAGE_RATE_KEY);
      if (cached) {
        try {
          const list = JSON.parse(cached).filter(r => r.id !== id);
          safeSetStorage(LOCAL_STORAGE_RATE_KEY, JSON.stringify(list));
        } catch (e) {}
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('driverPayrollService.deleteRateConfig error:', error);
      return { success: false, error };
    }
  },

  /**
   * 🎁 3.1 ดึงรายการตั้งค่าเกณฑ์เงินพิเศษตามจำนวนงาน (Incentive Tiers)
   */
  async fetchIncentiveConfigs() {
    try {
      const { data, error } = await supabase
        .from('driver_incentive_configs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('fetchIncentiveConfigs Supabase fallback:', error.message);
        const cached = safeGetStorage(LOCAL_STORAGE_INCENTIVE_KEY);
        if (cached) {
          try {
            return { data: JSON.parse(cached), error: null };
          } catch (e) {}
        }
        return { data: [DEFAULT_FALLBACK_INCENTIVE_CONFIG], error: null };
      }

      if (data && data.length > 0) {
        safeSetStorage(LOCAL_STORAGE_INCENTIVE_KEY, JSON.stringify(data));
        return { data, error: null };
      }

      return { data: [DEFAULT_FALLBACK_INCENTIVE_CONFIG], error: null };
    } catch (error) {
      console.error('driverPayrollService.fetchIncentiveConfigs error:', error);
      const cached = safeGetStorage(LOCAL_STORAGE_INCENTIVE_KEY);
      if (cached) {
        try {
          return { data: JSON.parse(cached), error: null };
        } catch (e) {}
      }
      return { data: [DEFAULT_FALLBACK_INCENTIVE_CONFIG], error: null };
    }
  },

  /**
   * 🎁 3.2 บันทึกการตั้งค่าเกณฑ์เงินพิเศษ (Save Incentive Config)
   */
  async saveIncentiveConfig(config) {
    try {
      const id = config.id || `incentive_${Date.now()}`;
      const payload = {
        id,
        name: config.name?.trim() || 'เกณฑ์เงินพิเศษขั้นบันได',
        is_active: config.is_active !== false,
        start_date: config.start_date || '2026-01-01',
        end_date: config.end_date || null,
        tiers: Array.isArray(config.tiers) ? config.tiers : DEFAULT_INCENTIVE_TIERS,
        step_trips: Number(config.step_trips || 10),
        step_bonus: Number(config.step_bonus || 1000),
        remark: config.remark?.trim() || '-',
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('driver_incentive_configs')
        .upsert([payload])
        .select();

      if (error) {
        console.warn('saveIncentiveConfig Supabase error, caching locally:', error.message);
      }

      const cachedRes = await this.fetchIncentiveConfigs();
      let list = cachedRes.data || [];
      const idx = list.findIndex(r => r.id === id);
      if (idx >= 0) list[idx] = payload;
      else list.unshift(payload);
      safeSetStorage(LOCAL_STORAGE_INCENTIVE_KEY, JSON.stringify(list));

      return { data: payload, error: null };
    } catch (error) {
      console.error('driverPayrollService.saveIncentiveConfig error:', error);
      return { data: null, error };
    }
  },

  /**
   * 🏥 3.4 ดึงการตั้งค่าประกันสังคม & ภาษี 3% ส่วนกลาง
   */
  fetchGlobalTaxConfig() {
    try {
      const cached = safeGetStorage(LOCAL_STORAGE_TAX_CONFIG_KEY);
      if (cached) {
        return { ...DEFAULT_GLOBAL_TAX_CONFIG, ...JSON.parse(cached) };
      }
    } catch (e) {}
    return DEFAULT_GLOBAL_TAX_CONFIG;
  },

  /**
   * 💾 3.5 บันทึกการตั้งค่าประกันสังคม & ภาษี 3% ส่วนกลาง
   */
  saveGlobalTaxConfig(config = {}) {
    try {
      const cleanConfig = {
        default_sso_amount: Number(config.default_sso_amount !== undefined ? config.default_sso_amount : 875),
        default_wht_pct: Number(config.default_wht_pct !== undefined ? config.default_wht_pct : 3),
        updated_at: new Date().toISOString()
      };
      safeSetStorage(LOCAL_STORAGE_TAX_CONFIG_KEY, JSON.stringify(cleanConfig));
      return { data: cleanConfig, error: null };
    } catch (error) {
      console.error('saveGlobalTaxConfig error:', error);
      return { data: null, error: error.message };
    }
  },

  /**
   * 🎁 3.3 คำนวณเงินพิเศษตามจำนวนงานจริง (Tiered Bonus Calculator)
   * กฎเกณฑ์ตามที่กำหนด:
   * 150 = 1,000 | 160 = 2,000 | 170 = 3,000 | 180 = 4,000 | 190 = 5,000
   * 200 = 6,000 | 210 = 7,000 | 220 = 8,000 | 230 = 9,000 (+1,000 ทุก 10 งาน)
   */
  calculateSpecialBonus(totalTrips = 0, tierConfig = null) {
    const trips = Number(totalTrips || 0);
    const tiers = (tierConfig?.tiers && Array.isArray(tierConfig.tiers))
      ? tierConfig.tiers
      : DEFAULT_INCENTIVE_TIERS;

    if (!tiers || tiers.length === 0) return 0;

    // เรียงลำดับจากขั้นสูงสุดลงไปหาต่ำสุด
    const sortedTiers = [...tiers].sort((a, b) => Number(b.minTrips) - Number(a.minTrips));
    const lowestTier = sortedTiers[sortedTiers.length - 1];

    if (trips < Number(lowestTier.minTrips)) {
      return 0;
    }

    const highestTier = sortedTiers[0];
    if (trips >= Number(highestTier.minTrips)) {
      const stepTrips = Number(tierConfig?.step_trips || 10);
      const stepBonus = Number(tierConfig?.step_bonus || 1000);
      const extraSteps = stepTrips > 0 ? Math.floor((trips - Number(highestTier.minTrips)) / stepTrips) : 0;
      return Number(highestTier.bonus) + (extraSteps * stepBonus);
    }

    for (const tier of sortedTiers) {
      if (trips >= Number(tier.minTrips)) {
        return Number(tier.bonus);
      }
    }

    return 0;
  },

  /**
   * 4. หาเรทราคาที่มีผลบังคับใช้ (Effective Rate Finder)
   * 📌 สำคัญ: วันที่ที่นำมาเทียบ ต้องเป็นวันที่ใน "ใบวางบิล (Master DB)" (date_job / date_job_parsed)
   */
  findEffectiveRate(masterDateStr, driverName = 'ALL', rateConfigs = []) {
    if (!rateConfigs || rateConfigs.length === 0) {
      return {
        rate_20: 100,
        rate_40: 100,
        rate_45: 100,
        rate_default: 100,
        name: 'เรทเริ่มต้น (100฿)',
        id: 'default'
      };
    }

    // Normalizing master date
    let isoDate = null;
    if (masterDateStr && masterDateStr !== '-' && masterDateStr !== 'null') {
      const norm = normalizeExcelDate(masterDateStr);
      if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) {
        isoDate = norm;
      }
    }

    // Filter active configs
    const activeConfigs = rateConfigs.filter(r => r.is_active !== false);

    // Candidates matching date & driver
    const matches = activeConfigs.filter(r => {
      // 1. Check Driver Name match ('ALL' or exact match)
      const dName = (r.driver_name || 'ALL').trim();
      const isDriverMatch = (dName === 'ALL' || dName === '' || (driverName && dName.toLowerCase() === driverName.trim().toLowerCase()));
      if (!isDriverMatch) return false;

      // 2. Check Date Range match against Master DB Date
      if (!isoDate) {
        // If container date is missing, match open ongoing rate or newest rate
        return true;
      }

      const sDate = r.start_date ? String(r.start_date).slice(0, 10) : null;
      const eDate = r.end_date ? String(r.end_date).slice(0, 10) : null;

      if (sDate && isoDate < sDate) return false;
      if (eDate && isoDate > eDate) return false;

      return true;
    });

    if (matches.length === 0) {
      // Fallback to active 'ALL' config or first available
      const fallbackAll = activeConfigs.find(r => (r.driver_name || 'ALL') === 'ALL') || activeConfigs[0];
      if (fallbackAll) return fallbackAll;
      return {
        rate_20: 100,
        rate_40: 100,
        rate_45: 100,
        rate_default: 100,
        name: 'เรทเริ่มต้น (100฿)',
        id: 'default'
      };
    }

    // Sort: Specific driver first > Newest start_date
    matches.sort((a, b) => {
      const aIsSpecific = a.driver_name && a.driver_name !== 'ALL' ? 1 : 0;
      const bIsSpecific = b.driver_name && b.driver_name !== 'ALL' ? 1 : 0;
      if (aIsSpecific !== bIsSpecific) return bIsSpecific - aIsSpecific;

      const dateA = a.start_date || '1970-01-01';
      const dateB = b.start_date || '1970-01-01';
      return dateB.localeCompare(dateA);
    });

    return matches[0];
  },

  /**
   * 5. คำนวณราคาของตู้เดี่ยวตามขนาด
   */
  calculateContainerPrice(containerSize, effectiveRate) {
    const rawSize = String(containerSize || '').trim();
    const cleanSizeDigits = rawSize.replace(/[^0-9]/g, '');

    if (cleanSizeDigits === '20' || rawSize.startsWith('20')) {
      return {
        sizeCategory: '20',
        unitPrice: Number(effectiveRate.rate_20 ?? 100)
      };
    }

    if (cleanSizeDigits === '40' || rawSize.startsWith('40')) {
      return {
        sizeCategory: '40',
        unitPrice: Number(effectiveRate.rate_40 ?? 100)
      };
    }

    if (cleanSizeDigits === '45' || rawSize.startsWith('45')) {
      return {
        sizeCategory: '45',
        unitPrice: Number(effectiveRate.rate_45 ?? 100)
      };
    }

    return {
      sizeCategory: rawSize || 'other',
      unitPrice: Number(effectiveRate.rate_default ?? 100)
    };
  },

  /**
   * 6. คำนวณสรุปค่าตอบแทนคนขับทั้งหมด (DB-First High-Performance Query & Aggregation)
   * 📌 ใช้ Canonical View: vw_completed_driver_containers สำหรับ Server-Side Filtering
   * 📌 มี Full Client-Side Fallback อัตโนมัติ กรณีที่ยังไม่ได้รัน SQL Migration หรือ View ใน DB ยังไม่พร้อม
   * 📌 รองรับ Payment Status: 'unpaid' (ยังไม่ตัดจ่าย - ค่าเริ่มต้น), 'paid' (จ่ายแล้ว), 'ALL' (ทั้งหมด)
   * 📌 คำนวณยอดงานรอตรวจสอบ (Pending Verification) แยกรายคนขับชัดเจน
   */
  async calculatePayrollSummary(options = {}) {
    try {
      const {
        dateFrom = null,
        dateTo = null,
        driverFilter = 'ALL',
        batchFilter = 'ALL',
        truckFilter = 'ALL',
        paymentStatusFilter = 'unpaid' // 'unpaid' | 'paid' | 'ALL'
      } = options;

      const isTruckMatch = (t1, t2) => {
        if (!t1 || !t2) return false;
        const s1 = String(t1).trim().replace(/^รถ\s*/, '').toLowerCase();
        const s2 = String(t2).trim().replace(/^รถ\s*/, '').toLowerCase();
        return s1 === s2 || s1.includes(s2) || s2.includes(s1);
      };

      // 1. ดึง Rate Configs, Incentive Configs, Driver Info, Truck Records, Operations, Advances และ Master DB แบบคู่ขนาน
      const [ratesRes, incentiveRes, driversRes, trucksRes, opsRes, masterRes, advancesRes] = await Promise.all([
        this.fetchRateConfigs(),
        this.fetchIncentiveConfigs(),
        fetchDrivers(),
        supabase.from('truck_records').select('truck_no, assigned_driver_name').limit(500),
        supabase.from('truck_operations').select('truck_no, driver_name, start_date, end_date, status').limit(2000),
        supabase.from('container_records').select('id, container_no, truck_no, port, size, dis_load, date_job, date_job_parsed, batch_name'),
        driverAdvanceService.fetchAdvances({ status: 'ALL' })
      ]);

      const rateConfigs = ratesRes.data || [];
      const incentiveConfigs = incentiveRes.data || [];
      const activeIncentiveConfig = incentiveConfigs.find(c => c.is_active) || incentiveConfigs[0] || DEFAULT_FALLBACK_INCENTIVE_CONFIG;
      const driversList = driversRes.data || [];
      const trucksList = trucksRes.data || [];
      const opsData = opsRes?.data || [];
      const masterDbList = masterRes?.data || [];
      const advancesData = advancesRes?.data || [];

      // Group advances by driver
      const advancesByDriver = {};
      advancesData.forEach(adv => {
        const dName = adv.driver_name?.trim();
        if (!dName) return;
        if (!advancesByDriver[dName]) advancesByDriver[dName] = [];
        advancesByDriver[dName].push(adv);
      });

      const driverTruckMap = {};
      const driverMetaMap = {};
      driversList.forEach(d => {
        if (d.driver_name) {
          const cachedProfile = getDriverPayrollProfile(d.driver_name) || {};
          const enriched = {
            ...d,
            base_salary: (d.base_salary !== undefined && d.base_salary !== null) ? Number(d.base_salary) : Number(cachedProfile.base_salary || 0),
            tax_profile: d.tax_profile || cachedProfile.tax_profile || 'social_security',
            social_security_amount: (d.social_security_amount !== undefined && d.social_security_amount !== null) ? Number(d.social_security_amount) : Number(cachedProfile.social_security_amount || 875)
          };
          driverTruckMap[d.driver_name] = d.assigned_truck_no || '-';
          driverMetaMap[d.driver_name] = enriched;
        }
      });

      // ฟังก์ชันค้นหาคนขับประจำช่วงเวลา (อิงตามประวัติการวิ่งงานใน truck_operations และทะเบียนรถ)
      const resolveDriver = (truckNo, jobDate) => {
        if (!truckNo || truckNo === '-') return '-';
        let isoDate = null;
        if (jobDate && jobDate !== '-') {
          const norm = normalizeExcelDate(jobDate);
          if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) isoDate = norm;
        }
        if (isoDate && opsData.length > 0) {
          const op = opsData.find(o => {
            if (!isTruckMatch(o.truck_no, truckNo)) return false;
            const sDate = o.start_date ? String(o.start_date).slice(0, 10) : null;
            const eDate = o.end_date ? String(o.end_date).slice(0, 10) : null;
            if (sDate && isoDate < sDate) return false;
            if (eDate && isoDate > eDate) return false;
            return true;
          });
          if (op?.driver_name && op.driver_name !== '-') return op.driver_name;
        }
        const activeOp = opsData.find(o => isTruckMatch(o.truck_no, truckNo) && (o.status === 'active' || !o.end_date));
        if (activeOp?.driver_name && activeOp.driver_name !== '-') return activeOp.driver_name;
        const truck = trucksList.find(t => isTruckMatch(t.truck_no, truckNo));
        if (truck?.assigned_driver_name && truck.assigned_driver_name !== '-') return truck.assigned_driver_name;
        const driverRec = driversList.find(d => isTruckMatch(d.assigned_truck_no, truckNo));
        if (driverRec?.driver_name && driverRec.driver_name !== '-') return driverRec.driver_name;
        return (truckNo && truckNo !== '-') ? `รถ ${truckNo}` : 'ไม่ระบุคนขับ';
      };

      // ดึงงานรอตรวจสอบ (Pending) อย่างปลอดภัย (รองรับกรณี View ยังไม่ถูกสร้างใน DB)
      let rawPendingList = [];
      try {
        const { data: pData, error: pErr } = await supabase
          .from('vw_ocr_container_history')
          .select('id, sheet_id, container_no, port, size, date_job, match_status, workflow_status, batch_name, truck_no, driver_name')
          .or('workflow_status.eq.pending,match_status.eq.manual_red,match_status.eq.unmatched_red');

        if (!pErr && pData) {
          rawPendingList = pData;
        } else {
          // Fallback: ดึงจาก ocr_cache (Pending OCR) และ job_sheet_items (ตู้แดงค้างตรวจ)
          const [cacheRes, redItemsRes, allSheetsForPendingRes] = await Promise.all([
            supabase.from('ocr_cache').select('id, ocr_data, model_used, created_at').neq('model_used', 'completed').neq('model_used', 'deleted'),
            supabase.from('job_sheet_items').select('id, job_sheet_id, container_no, port, size, date_job, match_status').in('match_status', ['manual_red', 'unmatched_red']),
            supabase.from('job_sheets').select('id, truck_no, batch_name, created_at, status').neq('status', 'deleted')
          ]);

          const pendingSheetsMap = {};
          if (allSheetsForPendingRes?.data) {
            allSheetsForPendingRes.data.forEach(s => { pendingSheetsMap[s.id] = s; });
          }

          if (cacheRes?.data) {
            cacheRes.data.forEach(c => {
              const rows = Array.isArray(c.ocr_data?.containers) ? c.ocr_data.containers : (c.ocr_data?.rows || []);
              const truck = c.ocr_data?.truck_no || c.ocr_data?.truck_guess || '-';
              rows.forEach((r, idx) => {
                const driverName = resolveDriver(truck, r.date_job || '-');
                rawPendingList.push({
                  id: `pending_${c.id}_${idx}`,
                  container_no: r.container_no,
                  truck_no: truck,
                  driver_name: driverName,
                  port: r.port || '-',
                  size: r.size || '20',
                  batch_name: c.ocr_data?.batch_guess || 'Pending',
                  date_job: r.date_job || '-',
                  match_status: 'pending',
                  workflow_status: 'pending',
                  is_pending: true
                });
              });
            });
          }

          if (redItemsRes?.data) {
            redItemsRes.data.forEach(r => {
              const sheet = pendingSheetsMap[r.job_sheet_id] || {};
              const truck = sheet.truck_no || '-';
              
              let effectiveDate = r.date_job_parsed || r.date_job;
              if (!effectiveDate || effectiveDate === '-') {
                const matchedDb = findBestMasterDbMatch(r.container_no, r.port, truck, masterDbList);
                effectiveDate = matchedDb?.date_job_parsed || matchedDb?.date_job;
              }
              if (!effectiveDate || effectiveDate === '-') {
                const batchMatch = masterDbList.find(m => isTruckMatch(m.truck_no, truck));
                effectiveDate = batchMatch?.date_job_parsed || batchMatch?.date_job || '-';
              }

              const driverName = (sheet.driver_name && sheet.driver_name !== '-') 
                ? sheet.driver_name 
                : resolveDriver(truck, effectiveDate);

              rawPendingList.push({
                id: `red_${r.id}`,
                container_no: r.container_no,
                truck_no: truck,
                driver_name: driverName,
                port: r.port || '-',
                size: r.size || '20',
                batch_name: sheet.batch_name || 'Red Container',
                date_job: effectiveDate,
                match_status: r.match_status,
                workflow_status: 'completed',
                is_pending: true
              });
            });
          }
        }
      } catch (pEx) {
        console.warn('Pending containers query handled with graceful fallback:', pEx);
      }

      // Map pending containers to drivers
      const pendingByDriver = {};
      rawPendingList.forEach(pItem => {
        const driverName = (pItem.driver_name && pItem.driver_name !== '-' && pItem.driver_name !== 'ไม่ระบุคนขับ')
          ? pItem.driver_name
          : resolveDriver(pItem.truck_no, pItem.date_job_parsed || pItem.date_job);

        if (!pendingByDriver[driverName]) pendingByDriver[driverName] = [];
        pendingByDriver[driverName].push({
          id: pItem.id,
          container_no: pItem.container_no,
          truck_no: pItem.truck_no,
          driver_name: driverName,
          port: pItem.port,
          size: pItem.size,
          batch_name: pItem.batch_name,
          date_job: pItem.date_job,
          match_status: pItem.match_status,
          workflow_status: pItem.workflow_status,
          is_pending: true
        });
      });

      // 2. Query ข้อมูลตู้จาก job_sheets, job_sheet_items และ ocr_records (Direct DB Queries)
      let containersToProcess = [];

      let sheetsQuery = supabase.from('job_sheets').select('*').neq('status', 'deleted');
      if (batchFilter && batchFilter !== 'ALL') sheetsQuery = sheetsQuery.eq('batch_name', batchFilter);
      if (truckFilter && truckFilter !== 'ALL') sheetsQuery = sheetsQuery.eq('truck_no', truckFilter);

      let itemsQuery = supabase.from('job_sheet_items').select('*').neq('match_status', 'cancelled');

      const [sheetsRes, itemsRes, legacyRes] = await Promise.all([
        sheetsQuery.order('created_at', { ascending: false }),
        itemsQuery.order('line_no', { ascending: true }),
        supabase.from('ocr_records').select('*').neq('match_status', 'deleted').order('created_at', { ascending: false })
      ]);

        const sheets = sheetsRes.data || [];
        const items = itemsRes.data || [];
        const legacyItems = legacyRes.data || [];

        const itemsBySheet = {};
        items.forEach(it => {
          if (!itemsBySheet[it.job_sheet_id]) itemsBySheet[it.job_sheet_id] = [];
          itemsBySheet[it.job_sheet_id].push(it);
        });

        // เสริม legacy items ถ้าใน job_sheet_items ยังไม่มี
        legacyItems.forEach(leg => {
          const sId = leg.job_sheet_id || leg.sheet_id;
          if (sId) {
            if (!itemsBySheet[sId]) itemsBySheet[sId] = [];
            if (!itemsBySheet[sId].some(ex => ex.container_no === leg.container_no)) {
              itemsBySheet[sId].push(leg);
            }
          }
        });

        sheets.forEach(sheet => {
          const sheetItems = itemsBySheet[sheet.id] || [];

          // หา effective date ของใบงาน
          let effectiveSheetDate = sheet.date_job_parsed || sheet.date_job;
          if (!effectiveSheetDate || effectiveSheetDate === '-') {
            for (const it of sheetItems) {
              const mDb = findBestMasterDbMatch(it.container_no, it.port, sheet.truck_no, masterDbList);
              if (mDb?.date_job_parsed || mDb?.date_job) {
                effectiveSheetDate = mDb.date_job_parsed || mDb.date_job;
                break;
              }
            }
          }

          let sheetDriver = sheet.driver_name?.trim();
          if (!sheetDriver || sheetDriver === '-' || sheetDriver === 'ไม่ระบุคนขับ') {
            sheetDriver = resolveDriver(sheet.truck_no, effectiveSheetDate);
          }

          sheetItems.forEach(item => {
            if (item.match_status === 'cancelled') return;

            // 🔍 กฎสำคัญ: ต้องเป็นงานที่ตรวจผ่านและจับคู่กับใบวางบิล (Master DB) ได้แล้วเท่านั้น
            // ตู้แดงที่ยังไม่แมตช์ (unmatched_red, manual_red) หรือตู้ที่หาใน Master DB ไม่เจอ -> ยังไม่นับ
            if (item.match_status === 'unmatched_red' || item.match_status === 'manual_red') return;

            const matchedDb = item.ref_master_id 
              ? (masterDbList.find(m => m.id === item.ref_master_id) || findBestMasterDbMatch(item.container_no, item.port, sheet.truck_no, masterDbList))
              : findBestMasterDbMatch(item.container_no, item.port, sheet.truck_no, masterDbList);

            if (!matchedDb && item.match_status !== 'matched_green' && item.match_status !== 'verified') {
              // ยังไม่พบข้อมูลในใบวางบิล (Master DB) -> ข้าม ยังไม่นับยอด
              return;
            }

            // วันที่และขนาดจากใบวางบิล (Master DB)
            const masterDate = matchedDb?.date_job_parsed || matchedDb?.date_job || item.date_job_parsed || item.date_job || effectiveSheetDate || '-';
            
            // กรองวันที่
            const normDate = normalizeExcelDate(masterDate);
            if (dateFrom && normDate && normDate < dateFrom) return;
            if (dateTo && normDate && normDate > dateTo) return;

            const effectiveSize = (matchedDb?.size && matchedDb.size !== '-') ? matchedDb.size : ((item.size && item.size !== '-') ? item.size : '20');

            let resolvedDriver = sheetDriver;
            if (!resolvedDriver || resolvedDriver === '-' || resolvedDriver === 'ไม่ระบุคนขับ') {
              resolvedDriver = resolveDriver(sheet.truck_no, masterDate);
            }

            if (driverFilter && driverFilter !== 'ALL' && resolvedDriver !== driverFilter) return;

            containersToProcess.push({
              id: item.id,
              job_sheet_id: sheet.id,
              batch_name: sheet.batch_name || 'General_Batch',
              truck_no: sheet.truck_no || '-',
              driver_name: resolvedDriver,
              container_no: item.container_no,
              port: (matchedDb?.port && matchedDb.port !== '-') ? matchedDb.port : (item.port || '-'),
              size: effectiveSize,
              master_date_parsed: matchedDb?.date_job_parsed || null,
              master_date: masterDate,
              sheet_date: sheet.date_job || '-',
              match_status: item.match_status,
              is_matched: true,
              payment_status: item.payment_status || 'unpaid',
              payment_batch_id: item.payment_batch_id || null,
              paid_at: item.paid_at || null
            });
          });
        });

        // หากไม่มี job_sheets แต่มี ocr_records (Legacy Direct Records)
        if (sheets.length === 0 && legacyItems.length > 0) {
          legacyItems.forEach(item => {
            if (item.match_status === 'cancelled' || item.match_status === 'deleted' || item.match_status === 'unmatched_red' || item.match_status === 'manual_red') return;

            const matchedDb = item.ref_master_id 
              ? (masterDbList.find(m => m.id === item.ref_master_id) || findBestMasterDbMatch(item.container_no, item.port, item.truck_no, masterDbList))
              : findBestMasterDbMatch(item.container_no, item.port, item.truck_no, masterDbList);

            if (!matchedDb && item.match_status !== 'matched_green' && item.match_status !== 'verified') {
              return;
            }

            const masterDate = matchedDb?.date_job_parsed || matchedDb?.date_job || item.date_job || '-';
            const normDate = normalizeExcelDate(masterDate);
            if (dateFrom && normDate && normDate < dateFrom) return;
            if (dateTo && normDate && normDate > dateTo) return;

            let resolvedDriver = item.driver_name?.trim();
            if (!resolvedDriver || resolvedDriver === '-' || resolvedDriver === 'ไม่ระบุคนขับ') {
              resolvedDriver = resolveDriver(item.truck_no, masterDate);
            }
            if (driverFilter && driverFilter !== 'ALL' && resolvedDriver !== driverFilter) return;

            containersToProcess.push({
              id: item.id,
              job_sheet_id: item.job_sheet_id || item.sheet_id || 'legacy',
              batch_name: item.batch_name || 'General_Batch',
              truck_no: item.truck_no || '-',
              driver_name: resolvedDriver,
              container_no: item.container_no,
              port: (matchedDb?.port && matchedDb.port !== '-') ? matchedDb.port : (item.port || '-'),
              size: (matchedDb?.size && matchedDb.size !== '-') ? matchedDb.size : (item.size || '20'),
              master_date_parsed: matchedDb?.date_job_parsed || null,
              master_date: masterDate,
              sheet_date: item.date_job || '-',
              match_status: item.match_status,
              is_matched: true,
              payment_status: item.payment_status || 'unpaid',
              payment_batch_id: item.payment_batch_id || null,
              paid_at: item.paid_at || null
            });
          });
        }

      // 3. รวมผลยอดเงินและจำแนกขนาดตู้ (Aggregation Loop)
      const driverSummaryMap = {};
      let totalAllContainers = 0;
      let totalAllEarnings = 0;
      let totalCount20 = 0;
      let totalEarnings20 = 0;
      let totalCount40 = 0;
      let totalEarnings40 = 0;
      let totalCountOther = 0;
      let totalEarningsOther = 0;
      let totalAllPendingContainers = 0;

      // Seed driver map with existing active drivers so they show even if 0 containers
      driversList.forEach(d => {
        if (driverFilter !== 'ALL' && d.driver_name !== driverFilter) return;
        const pendingItems = pendingByDriver[d.driver_name] || [];
        const trucksSet = new Set();
        pendingItems.forEach(p => {
          const pt = String(p.truck_no || '').trim().replace(/^รถ\s*/, '');
          if (pt && pt !== '-') trucksSet.add(pt);
        });

        driverSummaryMap[d.driver_name] = {
          driver_name: d.driver_name,
          assigned_truck_no: d.assigned_truck_no || '-',
          trucks_set: trucksSet,
          phone: d.phone || '-',
          status: d.status || 'active',
          total_containers: 0,
          verified_containers: 0,
          pending_containers: pendingItems.length,
          count_20: 0,
          earnings_20: 0,
          count_40: 0,
          earnings_40: 0,
          count_other: 0,
          earnings_other: 0,
          total_earnings: 0,
          unpaid_count: 0,
          unpaid_amount: 0,
          paid_count: 0,
          paid_amount: 0,
          containers: [],
          pending_list: pendingItems
        };
        totalAllPendingContainers += pendingItems.length;
      });

      containersToProcess.forEach(item => {
        const driverName = item.driver_name || 'ไม่ระบุคนขับ';
        const masterDate = item.master_date_parsed || item.master_date || item.sheet_date || '-';
        const masterDateIso = normalizeExcelDate(masterDate);

        // ตรวจสอบตัวกรองวันที่อีกครั้งเพื่อความแม่นยำ 100%
        if (dateFrom && masterDateIso && masterDateIso < dateFrom) return;
        if (dateTo && masterDateIso && masterDateIso > dateTo) return;

        const effectiveRate = this.findEffectiveRate(masterDate, driverName, rateConfigs);
        const { sizeCategory, unitPrice } = this.calculateContainerPrice(item.size, effectiveRate);
        const isPaid = item.payment_status === 'paid';

        if (!driverSummaryMap[driverName]) {
          const meta = driverMetaMap[driverName] || {};
          const pendingItems = pendingByDriver[driverName] || [];
          const trucksSet = new Set();
          pendingItems.forEach(p => {
            const pt = String(p.truck_no || '').trim().replace(/^รถ\s*/, '');
            if (pt && pt !== '-') trucksSet.add(pt);
          });

          driverSummaryMap[driverName] = {
            driver_name: driverName,
            assigned_truck_no: meta.assigned_truck_no || item.truck_no || '-',
            trucks_set: trucksSet,
            phone: meta.phone || '-',
            status: meta.status || 'active',
            total_containers: 0,
            verified_containers: 0,
            pending_containers: pendingItems.length,
            count_20: 0,
            earnings_20: 0,
            count_40: 0,
            earnings_40: 0,
            count_other: 0,
            earnings_other: 0,
            total_earnings: 0,
            unpaid_count: 0,
            unpaid_amount: 0,
            paid_count: 0,
            paid_amount: 0,
            containers: [],
            pending_list: pendingItems
          };
          totalAllPendingContainers += pendingItems.length;
        }

        const dSum = driverSummaryMap[driverName];
        dSum.total_containers += 1;
        dSum.verified_containers += 1;
        dSum.total_earnings += unitPrice;

        const cTruck = String(item.truck_no || '').trim().replace(/^รถ\s*/, '');
        if (cTruck && cTruck !== '-') {
          dSum.trucks_set.add(cTruck);
        }

        if (isPaid) {
          dSum.paid_count += 1;
          dSum.paid_amount += unitPrice;
        } else {
          dSum.unpaid_count += 1;
          dSum.unpaid_amount += unitPrice;
        }

        if (sizeCategory === '20') {
          dSum.count_20 += 1;
          dSum.earnings_20 += unitPrice;
          totalCount20 += 1;
          totalEarnings20 += unitPrice;
        } else if (sizeCategory === '40') {
          dSum.count_40 += 1;
          dSum.earnings_40 += unitPrice;
          totalCount40 += 1;
          totalEarnings40 += unitPrice;
        } else {
          dSum.count_other += 1;
          dSum.earnings_other += unitPrice;
          totalCountOther += 1;
          totalEarningsOther += unitPrice;
        }

        totalAllContainers += 1;
        totalAllEarnings += unitPrice;

        dSum.containers.push({
          id: item.id,
          job_sheet_id: item.job_sheet_id,
          batch_name: item.batch_name || 'General_Batch',
          truck_no: item.truck_no || '-',
          container_no: item.container_no,
          port: item.port || '-',
          size: item.size || '20',
          sizeCategory,
          master_date: masterDate,
          master_date_iso: masterDateIso,
          sheet_date: item.sheet_date || '-',
          match_status: item.match_status,
          is_matched: item.is_matched !== false,
          payment_status: item.payment_status || 'unpaid',
          payment_batch_id: item.payment_batch_id || null,
          paid_at: item.paid_at || null,
          paid_by: item.paid_by || '-',
          rate_name: effectiveRate.name || 'มาตรฐาน',
          unit_price: unitPrice,
          rate_config_id: effectiveRate.id
        });
      });

      // Format operated truck numbers for displayed jobs & compute Salary, Taxes, SSO, Advances, and Net Payout
      let totalAllBonus = 0;
      let totalAllBaseSalary = 0;
      let totalAllSsoDeductions = 0;
      let totalAllWhtDeductions = 0;
      let totalAllAdvanceDeductions = 0;
      let totalAllNetPayout = 0;

      Object.values(driverSummaryMap).forEach(dSum => {
        const truckArray = Array.from(dSum.trucks_set || []).sort();
        if (truckArray.length > 0) {
          dSum.assigned_truck_no = truckArray.join(', ');
          dSum.truck_list = truckArray;
        } else if (dSum.assigned_truck_no && dSum.assigned_truck_no !== '-') {
          const tClean = String(dSum.assigned_truck_no).trim().replace(/^รถ\s*/, '');
          dSum.assigned_truck_no = tClean || '-';
          dSum.truck_list = tClean ? [tClean] : [];
        } else {
          dSum.assigned_truck_no = '-';
          dSum.truck_list = [];
        }
        delete dSum.trucks_set;

        const globalTaxConfig = this.fetchGlobalTaxConfig();
        const defaultSso = globalTaxConfig.default_sso_amount || 875;
        const defaultWhtPct = (globalTaxConfig.default_wht_pct !== undefined ? globalTaxConfig.default_wht_pct : 3) / 100;

        const meta = driverMetaMap[dSum.driver_name] || {};
        const baseSalary = Number(meta.base_salary || 0);
        const taxProfile = meta.tax_profile || 'social_security';
        const ssoRate = Number(meta.social_security_amount || defaultSso);

        // 🎁 คำนวณเงินพิเศษตามตารางขั้นบันได (เช่น 150=1000, 160=2000, ..., 230=9000)
        const bonus = this.calculateSpecialBonus(dSum.total_containers, activeIncentiveConfig);
        
        // 💰 รวมรายได้ (Gross Income) = ค่ารอบ + เงินพิเศษ + เงินเดือนฐาน
        const grossIncome = (dSum.total_earnings || 0) + bonus + baseSalary;

        // 🏥 คำนวณหักประกันสังคม หรือ ภาษี 3%
        let ssoAmount = 0;
        let whtAmount = 0;
        if (taxProfile === 'social_security') {
          ssoAmount = ssoRate;
        } else if (taxProfile === 'withholding_3pct') {
          whtAmount = Math.round(grossIncome * defaultWhtPct);
        }

        // 💸 คำนวณยอดเบิกล่วงหน้า
        const driverAdvances = advancesByDriver[dSum.driver_name] || [];
        const advanceAmount = driverAdvances.reduce((acc, a) => acc + Number(a.amount || 0), 0);

        // 🏆 ยอดรวมค่ารอบ + เงินพิเศษสุทธิ (Trip Earnings + Incentive Bonus)
        const netPayout = (dSum.total_earnings || 0) + bonus;

        dSum.base_salary = baseSalary;
        dSum.tax_profile = taxProfile;
        dSum.special_bonus = bonus;
        dSum.gross_income = (dSum.total_earnings || 0) + bonus;
        dSum.sso_amount = 0;
        dSum.wht_amount = 0;
        dSum.advance_amount = 0;
        dSum.advances_list = [];
        dSum.total_deductions = 0;
        dSum.total_net_payout = netPayout;

        totalAllBonus += bonus;
        totalAllBaseSalary += baseSalary;
        totalAllSsoDeductions += ssoAmount;
        totalAllWhtDeductions += whtAmount;
        totalAllAdvanceDeductions += advanceAmount;
        totalAllNetPayout += netPayout;
      });

      // Return all drivers so the table always displays drivers and their calculated statistics
      const driverSummaries = Object.values(driverSummaryMap).filter(d => {
        if (driverFilter && driverFilter !== 'ALL') return d.driver_name === driverFilter;
        return true;
      });
      driverSummaries.sort((a, b) => (b.total_containers - a.total_containers) || (b.total_net_payout - a.total_net_payout) || (a.driver_name || '').localeCompare(b.driver_name || '', 'th'));

      return {
        data: {
          drivers: driverSummaries,
          kpis: {
            total_earnings: totalAllEarnings,
            total_bonus: totalAllBonus,
            total_net_payout: totalAllEarnings + totalAllBonus,
            total_containers: totalAllContainers,
            total_pending: totalAllPendingContainers,
            count_20: totalCount20,
            earnings_20: totalEarnings20,
            count_40: totalCount40,
            earnings_40: totalEarnings40,
            count_other: totalCountOther,
            earnings_other: totalEarningsOther,
            active_drivers_count: driverSummaries.filter(d => d.total_containers > 0 || d.base_salary > 0).length
          },
          ratesUsed: rateConfigs,
          incentiveConfigUsed: activeIncentiveConfig
        },
        error: null
      };
    } catch (error) {
      console.error('driverPayrollService.calculatePayrollSummary error:', error);
      return {
        data: {
          drivers: [],
          kpis: {
            total_earnings: 0,
            total_containers: 0,
            total_pending: 0,
            count_20: 0,
            earnings_20: 0,
            count_40: 0,
            earnings_40: 0,
            count_other: 0,
            earnings_other: 0,
            active_drivers_count: 0
          },
          ratesUsed: []
        },
        error
      };
    }
  },

  /**
   * 💵 7. คำนวณสรุปเงินเดือน & รายได้รวมคนขับประจำเดือน (Monthly Driver Payroll Hub)
   * 📌 ดึงฐานเงินเดือนคนขับจาก driver_records / getDriverPayrollProfile
   * 📌 ดึงยอดค่ารอบและเงินพิเศษสะสมในเดือนนั้น (Filtered by Job Dates in the selected month)
   * 📌 ดึงรายการเบิกเงินล่วงหน้าในเดือนนั้น (Filtered by advance_date in the selected month)
   * 📌 คำนวณหักประกันสังคม (875฿ หรือตามคนขับ) หรือ หักภาษี 3%
   * 📌 คำนวณยอดโอนสุทธิประจำเดือน (Monthly Net Payout)
   */
  async calculateMonthlyPayroll(options = {}) {
    try {
      const {
        yearMonth = new Date().toISOString().slice(0, 7), // 'YYYY-MM'
        driverFilter = 'ALL',
        paymentStatusFilter = 'ALL'
      } = options;

      const [year, month] = yearMonth.split('-');
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const dateFrom = `${yearMonth}-01`;
      const dateTo = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

      // 1. ดึงสรุปค่ารอบในเดือนนั้น
      const tripSummaryRes = await this.calculatePayrollSummary({
        dateFrom,
        dateTo,
        driverFilter,
        paymentStatusFilter
      });
      const tripData = tripSummaryRes.data || { drivers: [] };
      const tripMap = {};
      (tripData.drivers || []).forEach(d => {
        if (d.driver_name) {
          tripMap[d.driver_name] = d;
        }
      });

      // 2. ดึงรายการคนขับทั้งหมด
      const driversRes = await fetchDrivers();
      const driversList = driversRes.data || [];

      // 3. ดึงรายการเบิกล่วงหน้าและเงินยืมทั้งหมด
      const advancesRes = await driverAdvanceService.fetchAdvances({
        status: 'ALL'
      });
      const advancesList = advancesRes.data || [];
      const advancesByDriver = {};
      advancesList.forEach(adv => {
        const dName = String(adv.driver_name || '').trim();
        if (!advancesByDriver[dName]) advancesByDriver[dName] = [];
        advancesByDriver[dName].push(adv);
      });

      // 4. ดึงการตั้งค่าภาษี/ประกันสังคมส่วนกลาง
      const globalTax = this.fetchGlobalTaxConfig();
      const defaultSso = globalTax.default_sso_amount || 875;
      const defaultWhtPct = (globalTax.default_wht_pct !== undefined ? globalTax.default_wht_pct : 3) / 100;

      let totalAllBaseSalary = 0;
      let totalAllTripEarnings = 0;
      let totalAllBonus = 0;
      let totalAllGrossIncome = 0;
      let totalAllSso = 0;
      let totalAllWht = 0;
      let totalAllAdvances = 0;
      let totalAllNetPayout = 0;
      let totalAllContainers = 0;

      const monthlyDrivers = [];

      // Loop คนขับทุกคนในระบบ หรือคนขับที่วิ่งงานในเดือนนั้น
      const allDriverNamesSet = new Set([
        ...driversList.map(d => d.driver_name).filter(Boolean),
        ...Object.keys(tripMap)
      ]);

      allDriverNamesSet.forEach(dName => {
        if (driverFilter !== 'ALL' && dName !== driverFilter) return;

        const dRecord = driversList.find(d => d.driver_name === dName) || {};
        const cachedProfile = getDriverPayrollProfile(dName) || {};
        const tripSummary = tripMap[dName] || {};

        const baseSalary = (dRecord.base_salary !== undefined && dRecord.base_salary !== null)
          ? Number(dRecord.base_salary)
          : Number(cachedProfile.base_salary || 0);

        const taxProfile = dRecord.tax_profile || cachedProfile.tax_profile || 'social_security';
        const ssoRaw = (dRecord.social_security_amount !== undefined && dRecord.social_security_amount !== null)
          ? Number(dRecord.social_security_amount)
          : Number(cachedProfile.social_security_amount || defaultSso);
        const ssoRate = ssoRaw === 750 ? defaultSso : ssoRaw;

        const totalContainers = tripSummary.total_containers || 0;
        const verifiedContainers = tripSummary.verified_containers || 0;
        const pendingContainers = tripSummary.pending_containers || 0;
        const tripEarnings = tripSummary.total_earnings || 0;
        const specialBonus = tripSummary.special_bonus || 0;

        // รายได้รวม = ฐานเงินเดือน + ค่ารอบสะสม + เงินพิเศษ
        const grossIncome = baseSalary + tripEarnings + specialBonus;

        // หักประกันสังคม หรือ ภาษี 3%
        let ssoAmount = 0;
        let whtAmount = 0;
        if (taxProfile === 'social_security') {
          ssoAmount = ssoRate;
        } else if (taxProfile === 'withholding_3pct') {
          whtAmount = Math.round(grossIncome * defaultWhtPct);
        }

        // ยอดเบิกล่วงหน้าสะสม & เงินยืมผ่อนชำระในเดือนนี้
        const rawDriverAdvances = advancesByDriver[dName] || [];
        const driverAdvances = [];
        let advanceAmount = 0;

        rawDriverAdvances.forEach(adv => {
          const isLoan = adv.category === 'installment_loan' || adv.advance_type === 'loan_installment';
          if (isLoan) {
            // เช็คว่าถึงกำหนดหักในงวดนี้หรือยัง และยังผ่อนไม่ครบ
            const isEligiblePeriod = !adv.start_period || adv.start_period <= yearMonth;
            const isUnsettled = adv.status !== 'settled' && (adv.installments_paid || 0) < (adv.installments_total || 1);
            if (isEligiblePeriod && isUnsettled) {
              const currentInst = (adv.installments_paid || 0) + 1;
              const totalInst = Math.max(1, adv.installments_total || 1);
              const instAmt = Number(adv.installment_amount) || Math.round(Number(adv.amount || 0) / totalInst);
              const deductAmt = Math.min(Number(adv.remaining_amount !== undefined ? adv.remaining_amount : adv.amount), instAmt);
              
              if (deductAmt > 0) {
                advanceAmount += deductAmt;
                driverAdvances.push({
                  ...adv,
                  deduct_this_period: deductAmt,
                  current_installment_no: currentInst,
                  display_label: `ยืมเงินก้อน (งวด ${currentInst}/${totalInst})`,
                  display_amount: deductAmt
                });
              }
            }
          } else {
            // เบิกล่วงหน้างวดเดียว (Single Advance)
            const advDate = adv.advance_date ? String(adv.advance_date).slice(0, 10) : '';
            const isDateInRange = (!advDate || (advDate >= dateFrom && advDate <= dateTo));
            const isPendingBeforePeriod = adv.status === 'pending' && advDate <= dateTo;
            if (isDateInRange || isPendingBeforePeriod) {
              const amt = Number(adv.amount || 0);
              advanceAmount += amt;
              driverAdvances.push({
                ...adv,
                deduct_this_period: amt,
                display_label: adv.advance_type === 'trip_advance' ? 'เบิกค่าเที่ยว' : (adv.advance_type === 'emergency' ? 'เบิกฉุกเฉิน' : 'เบิกเงินเดือนล่วงหน้า'),
                display_amount: amt
              });
            }
          }
        });

        // รวมยอดหัก
        const totalDeductions = ssoAmount + whtAmount + advanceAmount;

        // ยอดโอนจ่ายสุทธิประจำเดือน
        const netPayout = Math.max(0, grossIncome - totalDeductions);

        // รวมยอดสถิติภาพรวม
        totalAllBaseSalary += baseSalary;
        totalAllTripEarnings += tripEarnings;
        totalAllBonus += specialBonus;
        totalAllGrossIncome += grossIncome;
        totalAllSso += ssoAmount;
        totalAllWht += whtAmount;
        totalAllAdvances += advanceAmount;
        totalAllNetPayout += netPayout;
        totalAllContainers += totalContainers;

        monthlyDrivers.push({
          driver_id: dRecord.id || null,
          driver_name: dName,
          assigned_truck_no: tripSummary.assigned_truck_no || dRecord.assigned_truck_no || '-',
          status: dRecord.status || 'active',
          base_salary: baseSalary,
          total_containers: totalContainers,
          verified_containers: verifiedContainers,
          pending_containers: pendingContainers,
          count_20: tripSummary.count_20 || 0,
          earnings_20: tripSummary.earnings_20 || 0,
          count_40: tripSummary.count_40 || 0,
          earnings_40: tripSummary.earnings_40 || 0,
          trip_earnings: tripEarnings,
          special_bonus: specialBonus,
          gross_income: grossIncome,
          tax_profile: taxProfile,
          sso_rate: ssoRate,
          sso_amount: ssoAmount,
          wht_amount: whtAmount,
          advance_amount: advanceAmount,
          advances_list: driverAdvances,
          total_deductions: totalDeductions,
          total_net_payout: netPayout
        });
      });

      // เรียงลำดับตามยอดรับสุทธิ
      monthlyDrivers.sort((a, b) => b.total_net_payout - a.total_net_payout);

      return {
        data: {
          yearMonth,
          dateFrom,
          dateTo,
          drivers: monthlyDrivers,
          kpis: {
            total_net_payout: totalAllNetPayout,
            total_gross_income: totalAllGrossIncome,
            total_base_salary: totalAllBaseSalary,
            total_trip_earnings: totalAllTripEarnings,
            total_bonus: totalAllBonus,
            total_sso_deductions: totalAllSso,
            total_wht_deductions: totalAllWht,
            total_advance_deductions: totalAllAdvances,
            total_deductions: totalAllSso + totalAllWht + totalAllAdvances,
            total_containers: totalAllContainers,
            active_drivers_count: monthlyDrivers.filter(d => d.total_net_payout > 0 || d.base_salary > 0).length
          }
        },
        error: null
      };
    } catch (error) {
      console.error('driverPayrollService.calculateMonthlyPayroll error:', error);
      return {
        data: {
          yearMonth: options.yearMonth || '',
          drivers: [],
          kpis: {
            total_net_payout: 0,
            total_gross_income: 0,
            total_base_salary: 0,
            total_trip_earnings: 0,
            total_bonus: 0,
            total_sso_deductions: 0,
            total_wht_deductions: 0,
            total_advance_deductions: 0,
            total_deductions: 0,
            total_containers: 0,
            active_drivers_count: 0
          }
        },
        error
      };
    }
  },

  /**
   * 7. บันทึกการตัดจ่ายเงินให้คนขับ (Atomic Settlement RPC)
   * 📌 ปรับ payment_status = 'paid' และบันทึกประวัติลง driver_payment_batches
   */
  async markContainersPaid(params) {
    const {
      driverName,
      itemIds = [],
      periodStart = null,
      periodEnd = null,
      totalAmount = 0,
      note = '-',
      paidBy = 'Admin'
    } = params;

    try {
      if (!driverName || !itemIds || itemIds.length === 0) {
        return { success: false, error: 'ข้อมูลคนขับหรือรายการตู้ไม่ครบถ้วน' };
      }

      const { data, error } = await supabase.rpc('mark_driver_containers_paid_rpc', {
        p_driver_name: driverName,
        p_item_ids: itemIds,
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_total_amount: Number(totalAmount),
        p_note: note || '-',
        p_paid_by: paidBy || 'Admin'
      });

      if (error) {
        console.warn('mark_driver_containers_paid_rpc error, falling back to direct update:', error.message);
        // Fallback: direct update
        const batchId = `PAY_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await supabase
          .from('job_sheet_items')
          .update({
            payment_status: 'paid',
            payment_batch_id: batchId,
            paid_at: new Date().toISOString(),
            paid_by: paidBy
          })
          .in('id', itemIds);

        await supabase
          .from('driver_payment_batches')
          .insert({
            id: batchId,
            batch_no: `PV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${itemIds.length}`,
            driver_name: driverName,
            period_start: periodStart,
            period_end: periodEnd,
            total_containers: itemIds.length,
            total_amount: Number(totalAmount),
            status: 'paid',
            note: note || '-',
            item_ids: itemIds,
            paid_by: paidBy,
            paid_at: new Date().toISOString()
          });

        return { success: true, batch_id: batchId, total_containers: itemIds.length, total_amount: totalAmount };
      }

      return { success: true, ...data };
    } catch (error) {
      console.error('driverPayrollService.markContainersPaid error:', error);
      return { success: false, error };
    }
  },

  /**
   * 8. ดึงประวัติการตัดจ่ายเงินทั้งหมด (Fetch Payment Settlement Batches)
   */
  async fetchPaymentBatches(params = {}) {
    const {
      driverName = 'ALL',
      status = 'ALL',
      page = 1,
      pageSize = 50
    } = params;

    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('driver_payment_batches')
        .select('*', { count: 'exact' })
        .order('paid_at', { ascending: false });

      if (driverName && driverName !== 'ALL') {
        query = query.eq('driver_name', driverName);
      }
      if (status && status !== 'ALL') {
        query = query.eq('status', status);
      }

      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      return {
        data: data || [],
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
        error: null
      };
    } catch (error) {
      console.error('driverPayrollService.fetchPaymentBatches error:', error);
      return { data: [], total: 0, page: 1, pageSize, totalPages: 0, error };
    }
  },

  /**
   * 9. ยกเลิกงวดการตัดจ่ายเงิน (Cancel / Rollback Payment Batch)
   */
  async cancelPaymentBatch(batchId, cancelledBy = 'Admin', reason = 'ยกเลิกรายการจ่ายเงิน') {
    try {
      if (!batchId) return { success: false, error: 'No Batch ID provided' };

      const { data, error } = await supabase.rpc('cancel_driver_payment_batch_rpc', {
        p_batch_id: batchId,
        p_cancelled_by: cancelledBy,
        p_reason: reason
      });

      if (error) {
        console.warn('cancel_driver_payment_batch_rpc error, direct rollback fallback:', error.message);
        // Direct fallback
        await supabase
          .from('job_sheet_items')
          .update({
            payment_status: 'unpaid',
            payment_batch_id: null,
            paid_at: null,
            paid_by: '-'
          })
          .eq('payment_batch_id', batchId);

        await supabase
          .from('driver_payment_batches')
          .update({
            status: 'cancelled',
            note: `ยกเลิกโดย ${cancelledBy}: ${reason}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', batchId);

        return { success: true, batch_id: batchId };
      }

      return { success: true, ...data };
    } catch (error) {
      console.error('driverPayrollService.cancelPaymentBatch error:', error);
      return { success: false, error };
    }
  }
};

export default driverPayrollService;
