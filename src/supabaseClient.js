import { createClient } from '@supabase/supabase-js';

const defaultUrl = 'https://siayvbmblmfgrxlbtzja.supabase.co';
const defaultKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpYXl2Ym1ibG1mZ3J4bGJ0emphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MzkxNDQsImV4cCI6MjA5ODExNTE0NH0.9sblmdvNbKRU5j1QSCRA247WZlxWZ24IIfKXJSc4CvI';

// ฟังก์ชันล้างค่าตัวแปร (ตัดช่องว่าง, เครื่องหมายคำพูด " หรือ ' และขึ้นบรรทัดใหม่ออกทั้งหมดทุกตำแหน่ง)
const sanitize = (val, fallback, prefix) => {
  if (!val || typeof val !== 'string') return fallback;
  const cleaned = val.replace(/[\s\r\n"'`]/g, '').trim();
  if (!cleaned || (prefix && !cleaned.startsWith(prefix)) || cleaned.length < 15) return fallback;
  return cleaned;
};

const rawEnvUrl = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_URL : null;
const rawEnvKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_SUPABASE_ANON_KEY : null;

const supabaseUrl = sanitize(rawEnvUrl, defaultUrl, 'https://');
const supabaseAnonKey = sanitize(rawEnvKey, defaultKey, 'eyJ');

console.log('[Supabase] Endpoint:', supabaseUrl, '| Key check:', supabaseAnonKey.startsWith('eyJ'), 'Length:', supabaseAnonKey.length);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});
