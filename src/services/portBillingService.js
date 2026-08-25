import { supabase } from '../supabaseClient.js';
import { normalizeExcelDate } from '../utils/matchingLogic.js';

const LOCAL_STORAGE_PORT_RATES_KEY = 'port_billing_rates_cache_v3';

export const DEFAULT_PORT_RATES = [
  // 🌓 ครึ่งเดือนแรก (01/05/2026 - 15/05/2026)
  {
    id: 'port_rate_2026_05_h1_p1',
    month_period: '2026-05',
    cycle_half: 'H1',
    period_name: 'ช่วงที่ 1',
    start_date: '2026-05-01',
    end_date: '2026-05-02',
    rate_20: 734,
    rate_40: 784,
    rate_45: 784,
    rate_default: 734,
    port_name: 'ท่าเรือทั่วไป',
    is_active: true,
    remark: 'ครึ่งแรก ช่วงที่ 1 (01-02 พ.ค.)'
  },
  {
    id: 'port_rate_2026_05_h1_p2',
    month_period: '2026-05',
    cycle_half: 'H1',
    period_name: 'ช่วงที่ 2',
    start_date: '2026-05-03',
    end_date: '2026-05-09',
    rate_20: 721,
    rate_40: 771,
    rate_45: 771,
    rate_default: 721,
    port_name: 'ท่าเรือทั่วไป',
    is_active: true,
    remark: 'ครึ่งแรก ช่วงที่ 2 (03-09 พ.ค.)'
  },
  {
    id: 'port_rate_2026_05_h1_p3',
    month_period: '2026-05',
    cycle_half: 'H1',
    period_name: 'ช่วงที่ 3',
    start_date: '2026-05-10',
    end_date: '2026-05-15',
    rate_20: 721,
    rate_40: 771,
    rate_45: 771,
    rate_default: 721,
    port_name: 'ท่าเรือทั่วไป',
    is_active: true,
    remark: 'ครึ่งแรก ช่วงที่ 3 (10-15 พ.ค.)'
  },
  // 🌕 ครึ่งเดือนหลัง (16/05/2026 - 31/05/2026)
  {
    id: 'port_rate_2026_05_h2_p1',
    month_period: '2026-05',
    cycle_half: 'H2',
    period_name: 'ช่วงที่ 1',
    start_date: '2026-05-16',
    end_date: '2026-05-23',
    rate_20: 721,
    rate_40: 771,
    rate_45: 771,
    rate_default: 721,
    port_name: 'ท่าเรือทั่วไป',
    is_active: true,
    remark: 'ครึ่งหลัง ช่วงที่ 1 (16-23 พ.ค.)'
  },
  {
    id: 'port_rate_2026_05_h2_p2',
    month_period: '2026-05',
    cycle_half: 'H2',
    period_name: 'ช่วงที่ 2',
    start_date: '2026-05-24',
    end_date: '2026-05-31',
    rate_20: 734,
    rate_40: 784,
    rate_45: 784,
    rate_default: 734,
    port_name: 'ท่าเรือทั่วไป',
    is_active: true,
    remark: 'ครึ่งหลัง ช่วงที่ 2 (24-31 พ.ค.)'
  }
];

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

export const portBillingService = {
  /**
   * ดึงรายการเรทราคาที่ท่าเรือจ่ายให้เรา
   */
  async fetchPortRates() {
    try {
      const cached = safeGetStorage(LOCAL_STORAGE_PORT_RATES_KEY);
      let localRates = cached ? JSON.parse(cached) : DEFAULT_PORT_RATES;

      try {
        const { data, error } = await supabase
          .from('port_billing_rates')
          .select('*')
          .order('start_date', { ascending: true });

        if (!error && Array.isArray(data) && data.length > 0) {
          safeSetStorage(LOCAL_STORAGE_PORT_RATES_KEY, JSON.stringify(data));
          return { data, error: null };
        }
      } catch (err) {
        // Table might not exist yet on Supabase, fallback to local
      }

      return { data: localRates, error: null };
    } catch (error) {
      console.error('fetchPortRates error:', error);
      return { data: DEFAULT_PORT_RATES, error };
    }
  },

  /**
   * บันทึกหรืออัปเดตเรทราคาช่วงเวลา
   */
  async savePortRate(rateRecord) {
    try {
      const { data: currentRates } = await this.fetchPortRates();
      const updatedList = [...(currentRates || [])];

      const startDate = rateRecord.start_date || new Date().toISOString().slice(0, 10);
      const monthPeriod = rateRecord.month_period || startDate.slice(0, 7);
      const dayNum = Number(startDate.slice(8, 10)) || 1;
      const cycleHalf = rateRecord.cycle_half || (dayNum <= 15 ? 'H1' : 'H2');

      const recordToSave = {
        id: rateRecord.id || `port_rate_${Date.now()}`,
        month_period: monthPeriod,
        cycle_half: cycleHalf,
        period_name: rateRecord.period_name || 'ช่วงที่ 1',
        port_name: rateRecord.port_name || 'ท่าเรือทั่วไป',
        start_date: startDate,
        end_date: rateRecord.end_date || null,
        rate_20: Number(rateRecord.rate_20) || 721,
        rate_40: Number(rateRecord.rate_40) || 771,
        rate_45: Number(rateRecord.rate_45) || 771,
        rate_default: Number(rateRecord.rate_default) || Number(rateRecord.rate_20) || 721,
        is_active: rateRecord.is_active !== undefined ? rateRecord.is_active : true,
        remark: rateRecord.remark || '-',
        updated_at: new Date().toISOString()
      };

      const existingIndex = updatedList.findIndex(r => r.id === recordToSave.id);
      if (existingIndex >= 0) {
        updatedList[existingIndex] = recordToSave;
      } else {
        updatedList.push(recordToSave);
      }

      updatedList.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
      safeSetStorage(LOCAL_STORAGE_PORT_RATES_KEY, JSON.stringify(updatedList));

      try {
        await supabase.from('port_billing_rates').upsert(recordToSave);
      } catch (err) {}

      return { data: recordToSave, error: null };
    } catch (error) {
      console.error('savePortRate error:', error);
      return { data: null, error };
    }
  },

  /**
   * ลบเรทราคา
   */
  async deletePortRate(id) {
    try {
      const { data: currentRates } = await this.fetchPortRates();
      const updatedList = (currentRates || []).filter(r => r.id !== id);
      safeSetStorage(LOCAL_STORAGE_PORT_RATES_KEY, JSON.stringify(updatedList));

      try {
        await supabase.from('port_billing_rates').delete().eq('id', id);
      } catch (err) {}

      return { success: true };
    } catch (error) {
      console.error('deletePortRate error:', error);
      return { success: false, error };
    }
  },

  /**
   * ค้นหาเรทราคาที่มีผลตามวันที่วิ่งงานจริง
   */
  findEffectivePortRate(jobDateStr, portRates = DEFAULT_PORT_RATES) {
    const list = Array.isArray(portRates) && portRates.length > 0 ? portRates : DEFAULT_PORT_RATES;
    if (!jobDateStr || jobDateStr === '-') {
      return list.find(r => r.is_active) || list[0];
    }

    let isoDate = jobDateStr;
    if (typeof normalizeExcelDate === 'function') {
      const norm = normalizeExcelDate(jobDateStr);
      if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) isoDate = norm;
    }

    // Match exact period where start_date <= isoDate <= end_date
    const matched = list.find(r => {
      if (!r.is_active) return false;
      const start = r.start_date;
      const end = r.end_date;
      if (start && isoDate < start) return false;
      if (end && isoDate > end) return false;
      return true;
    });

    return matched || list.find(r => r.is_active) || list[0];
  },

  /**
   * คำนวณราคาตู้จากเรทท่าเรือตามขนาดและวันที่
   */
  calculatePortUnitPrice(size, jobDateStr = null, portRates = DEFAULT_PORT_RATES) {
    const effectiveRate = this.findEffectivePortRate(jobDateStr, portRates);
    const cleanSize = String(size || '').trim();

    if (cleanSize.includes('45')) return Number(effectiveRate.rate_45) || Number(effectiveRate.rate_40) || 771;
    if (cleanSize.includes('40')) return Number(effectiveRate.rate_40) || 771;
    if (cleanSize.includes('20')) return Number(effectiveRate.rate_20) || 721;
    return Number(effectiveRate.rate_default) || Number(effectiveRate.rate_20) || 721;
  }
};

export default portBillingService;
