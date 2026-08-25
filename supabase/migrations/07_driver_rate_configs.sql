-- ==============================================================================
-- 💰 SQL Migration: Driver Rate Configurations (ตารางกำหนดอัตราค่าตอบแทนคนขับตามช่วงเวลาและขนาดตู้)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.driver_rate_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    driver_name TEXT DEFAULT 'ALL',                 -- 'ALL' = คนขับทุกคน, หรือระบุชื่อคนขับเฉพาะ
    start_date DATE NOT NULL,
    end_date DATE,                                  -- NULL หรือเว้นว่าง = มีผลถึงปัจจุบัน (Ongoing)
    rate_20 NUMERIC DEFAULT 100,                    -- ราคาตู้ขนาด 20 ฟุต (บาท)
    rate_40 NUMERIC DEFAULT 100,                    -- ราคาตู้ขนาด 40 ฟุต (บาท)
    rate_45 NUMERIC DEFAULT 100,                    -- ราคาตู้ขนาด 45 ฟุต / อื่นๆ (บาท)
    rate_default NUMERIC DEFAULT 100,               -- ราคาตู้เริ่มต้นกรณีไม่ระบุขนาด (บาท)
    is_active BOOLEAN DEFAULT true,                 -- สถานะเปิดใช้งาน
    remark TEXT DEFAULT '-',                        -- หมายเหตุ
    created_by TEXT DEFAULT 'Admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_driver_rate_configs_dates ON public.driver_rate_configs(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_driver_rate_configs_driver ON public.driver_rate_configs(driver_name);
CREATE INDEX IF NOT EXISTS idx_driver_rate_configs_active ON public.driver_rate_configs(is_active);

-- Enable RLS
ALTER TABLE public.driver_rate_configs ENABLE ROW LEVEL SECURITY;

-- Allow read/write policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'driver_rate_configs' AND policyname = 'Allow public read driver_rate_configs'
    ) THEN
        CREATE POLICY "Allow public read driver_rate_configs" ON public.driver_rate_configs FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'driver_rate_configs' AND policyname = 'Allow public insert driver_rate_configs'
    ) THEN
        CREATE POLICY "Allow public insert driver_rate_configs" ON public.driver_rate_configs FOR INSERT WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'driver_rate_configs' AND policyname = 'Allow public update driver_rate_configs'
    ) THEN
        CREATE POLICY "Allow public update driver_rate_configs" ON public.driver_rate_configs FOR UPDATE USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'driver_rate_configs' AND policyname = 'Allow public delete driver_rate_configs'
    ) THEN
        CREATE POLICY "Allow public delete driver_rate_configs" ON public.driver_rate_configs FOR DELETE USING (true);
    END IF;
END $$;

-- Default Seed: Initial Standard Rate
INSERT INTO public.driver_rate_configs (
    id, name, driver_name, start_date, end_date, rate_20, rate_40, rate_45, rate_default, is_active, remark
) VALUES (
    'rate_standard_2026',
    'อัตราค่ารอบมาตรฐาน (เริ่มต้น)',
    'ALL',
    '2026-01-01',
    NULL,
    100,
    100,
    100,
    100,
    true,
    'เรทค่ารอบมาตรฐานประจำการ'
) ON CONFLICT (id) DO NOTHING;
