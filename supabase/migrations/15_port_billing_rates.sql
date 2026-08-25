-- Migration 15: Port Billing Rates Matrix with Half-Month Cycles (H1 & H2)
CREATE TABLE IF NOT EXISTS public.port_billing_rates (
    id TEXT PRIMARY KEY,
    month_period VARCHAR(7) NOT NULL DEFAULT ''2026-05'', -- เช่น ''2026-05''
    cycle_half VARCHAR(5) NOT NULL DEFAULT ''H1'',         -- ''H1'' (ครึ่งแรก 1-15), ''H2'' (ครึ่งหลัง 16-สิ้นเดือน)
    period_name TEXT NOT NULL,                             -- เช่น ''ช่วงที่ 1'', ''ช่วงที่ 2''
    start_date DATE NOT NULL,                              -- วันที่เริ่มต้น
    end_date DATE,                                         -- วันที่สิ้นสุด
    rate_20 NUMERIC NOT NULL DEFAULT 721,                  -- ราคาตู้ 20" (บาท)
    rate_40 NUMERIC NOT NULL DEFAULT 771,                  -- ราคาตู้ 40" (บาท)
    rate_45 NUMERIC DEFAULT 771,                           -- ราคาตู้ 45" (บาท)
    rate_default NUMERIC DEFAULT 721,                      -- ราคาตู้เริ่มต้น (บาท)
    port_name TEXT DEFAULT ''ท่าเรือทั่วไป'',
    is_active BOOLEAN DEFAULT true,
    remark TEXT DEFAULT ''-'',
    created_by TEXT DEFAULT ''Admin'',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ปรับเพิ่มคอลัมน์หากมีตารางอยู่แล้ว
ALTER TABLE public.port_billing_rates ADD COLUMN IF NOT EXISTS month_period VARCHAR(7) DEFAULT ''2026-05'';
ALTER TABLE public.port_billing_rates ADD COLUMN IF NOT EXISTS cycle_half VARCHAR(5) DEFAULT ''H1'';

ALTER TABLE public.port_billing_rates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = ''port_billing_rates'' AND policyname = ''Allow public all port_billing_rates'') THEN
        CREATE POLICY "Allow public all port_billing_rates" ON public.port_billing_rates FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_port_billing_rates_dates ON public.port_billing_rates(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_port_billing_rates_period ON public.port_billing_rates(month_period, cycle_half);

-- ข้อมูลเรทจริง เดือน พ.ค. 2026 (ครึ่งแรก H1 และ ครึ่งหลัง H2)
INSERT INTO public.port_billing_rates (id, month_period, cycle_half, period_name, start_date, end_date, rate_20, rate_40, rate_45, rate_default, port_name, is_active, remark)
VALUES 
  -- ครึ่งเดือนแรก (01/05/2026 - 15/05/2026)
  (''port_rate_2026_05_h1_p1'', ''2026-05'', ''H1'', ''ช่วงที่ 1'', ''2026-05-01'', ''2026-05-02'', 734, 784, 784, 734, ''ท่าเรือทั่วไป'', true, ''ครึ่งแรก ช่วงที่ 1 (01-02 พ.ค.)''),
  (''port_rate_2026_05_h1_p2'', ''2026-05'', ''H1'', ''ช่วงที่ 2'', ''2026-05-03'', ''2026-05-09'', 721, 771, 771, 721, ''ท่าเรือทั่วไป'', true, ''ครึ่งแรก ช่วงที่ 2 (03-09 พ.ค.)''),
  (''port_rate_2026_05_h1_p3'', ''2026-05'', ''H1'', ''ช่วงที่ 3'', ''2026-05-10'', ''2026-05-15'', 721, 771, 771, 721, ''ท่าเรือทั่วไป'', true, ''ครึ่งแรก ช่วงที่ 3 (10-15 พ.ค.)''),
  
  -- ครึ่งเดือนหลัง (16/05/2026 - 31/05/2026)
  (''port_rate_2026_05_h2_p1'', ''2026-05'', ''H2'', ''ช่วงที่ 1'', ''2026-05-16'', ''2026-05-23'', 721, 771, 771, 721, ''ท่าเรือทั่วไป'', true, ''ครึ่งหลัง ช่วงที่ 1 (16-23 พ.ค.)''),
  (''port_rate_2026_05_h2_p2'', ''2026-05'', ''H2'', ''ช่วงที่ 2'', ''2026-05-24'', ''2026-05-31'', 734, 784, 784, 734, ''ท่าเรือทั่วไป'', true, ''ครึ่งหลัง ช่วงที่ 2 (24-31 พ.ค.)'')
ON CONFLICT (id) DO UPDATE SET
  month_period = EXCLUDED.month_period,
  cycle_half = EXCLUDED.cycle_half,
  period_name = EXCLUDED.period_name,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  rate_20 = EXCLUDED.rate_20,
  rate_40 = EXCLUDED.rate_40,
  rate_45 = EXCLUDED.rate_45,
  rate_default = EXCLUDED.rate_default;
