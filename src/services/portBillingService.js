import { supabase } from '../supabaseClient.js';

const LOCAL_STORAGE_PORT_RATES_KEY = 'port_billing_rates_cache_v1';

export const DEFAULT_PORT_RATES = [
  {
    id: 'port_rate_lcb_standard',
    port_name: 'ท่าเรือแหลมฉบัง (LCB - B5, C1, C2)',
    start_date: '2026-01-01',
    end_date: null,
    rate_20: 1200,
    rate_40: 1600,
    rate_45: 1800,
    rate_default: 1400,
    is_active: true,
    remark: 'เรทมาตรฐานท่าเรือแหลมฉบัง'
  },
  {
    id: 'port_rate_bkk_standard',
    port_name: 'ท่าเรือกรุงเทพ (BKK - คลองเตย)',
    start_date: '2026-01-01',
    end_date: null,
    rate_20: 1400,
    rate_40: 1900,
    rate_45: 2100,
    rate_default: 1600,
    is_active: true,
    remark: 'เรทมาตรฐานท่าเรือกรุงเทพ'
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
          .order('start_date', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) {
          safeSetStorage(LOCAL_STORAGE_PORT_RATES_KEY, JSON.stringify(data));
          return { data, error: null };
        }
      } catch (err) {
        // Table might not exist yet on Supabase
      }

      return { data: localRates, error: null };
    } catch (error) {
      console.error('fetchPortRates error:', error);
      return { data: DEFAULT_PORT_RATES, error };
    }
  },

  /**
   * บันทึกหรืออัปเดตเรทราคา
   */
  async savePortRate(rateRecord) {
    try {
      const { data: currentRates } = await this.fetchPortRates();
      const updatedList = [...(currentRates || [])];

      const recordToSave = {
        id: rateRecord.id || `port_rate_${Date.now()}`,
        port_name: rateRecord.port_name || 'ทั่วไป',
        start_date: rateRecord.start_date || new Date().toISOString().slice(0, 10),
        end_date: rateRecord.end_date || null,
        rate_20: Number(rateRecord.rate_20) || 1200,
        rate_40: Number(rateRecord.rate_40) || 1600,
        rate_45: Number(rateRecord.rate_45) || 1800,
        rate_default: Number(rateRecord.rate_default) || 1400,
        is_active: rateRecord.is_active !== undefined ? rateRecord.is_active : true,
        remark: rateRecord.remark || '-',
        updated_at: new Date().toISOString()
      };

      const existingIndex = updatedList.findIndex(r => r.id === recordToSave.id);
      if (existingIndex >= 0) {
        updatedList[existingIndex] = recordToSave;
      } else {
        updatedList.unshift(recordToSave);
      }

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
   * คำนวณราคาตู้จากเรทท่าเรือ
   */
  calculatePortUnitPrice(size, portRates = DEFAULT_PORT_RATES) {
    const activeRate = (portRates && portRates.length > 0) 
      ? (portRates.find(r => r.is_active) || portRates[0])
      : DEFAULT_PORT_RATES[0];

    const cleanSize = String(size || '').trim();
    if (cleanSize.includes('45')) return Number(activeRate.rate_45) || 1800;
    if (cleanSize.includes('40')) return Number(activeRate.rate_40) || 1600;
    if (cleanSize.includes('20')) return Number(activeRate.rate_20) || 1200;
    return Number(activeRate.rate_default) || 1400;
  }
};

export default portBillingService;
