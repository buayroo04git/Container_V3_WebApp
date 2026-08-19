import { createClient } from '@supabase/supabase-js';

const defaultUrl = 'https://siayvbmblmfgrxlbtzja.supabase.co';
const defaultKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpYXl2Ym1ibG1mZ3J4bGJ0emphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MzkxNDQsImV4cCI6MjA5ODExNTE0NH0.9sblmdvNbKRU5j1QSCRA247WZlxWZ24IIfKXJSc4CvI';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || defaultUrl;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || defaultKey;

const supabaseUrl = String(rawUrl || defaultUrl).trim();
const supabaseAnonKey = String(rawKey || defaultKey).trim();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
