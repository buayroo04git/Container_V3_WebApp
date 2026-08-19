import { createClient } from '@supabase/supabase-js';

// ฟังก์ชันล้างค่าตัวแปร (ตัดช่องว่าง, เครื่องหมายคำพูด " หรือ ' และขึ้นบรรทัดใหม่ออกทั้งหมดทุกตำแหน่ง)
const sanitize = (val) => {
  if (!val || typeof val !== 'string') return '';
  return val.replace(/[\s\r\n"'`]/g, '').trim();
};

const rawEnvUrl = import.meta.env.VITE_SUPABASE_URL;
const rawEnvKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseUrl = sanitize(rawEnvUrl);
const supabaseAnonKey = sanitize(rawEnvKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ [Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in Environment Variables!');
}

export const supabase = createClient(
  supabaseUrl || 'https://siayvbmblmfgrxlbtzja.supabase.co', 
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  }
);

