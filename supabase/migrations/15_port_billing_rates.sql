-- Migration 15: Port Billing Rates Matrix
CREATE TABLE IF NOT EXISTS public.port_billing_rates (
    id TEXT PRIMARY KEY,
    period_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    rate_20 NUMERIC NOT NULL DEFAULT 721,
    rate_40 NUMERIC NOT NULL DEFAULT 771,
    rate_45 NUMERIC DEFAULT 771,
    rate_default NUMERIC DEFAULT 721,
    port_name TEXT DEFAULT ''ท่าเรือทั่วไป'',
    is_active BOOLEAN DEFAULT true,
    remark TEXT DEFAULT ''-'',
    created_by TEXT DEFAULT ''Admin'',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.port_billing_rates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = ''port_billing_rates'' AND policyname = ''Allow public all port_billing_rates'') THEN
        CREATE POLICY "Allow public all port_billing_rates" ON public.port_billing_rates FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_port_billing_rates_dates ON public.port_billing_rates(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_port_billing_rates_active ON public.port_billing_rates(is_active);

INSERT INTO public.port_billing_rates (id, period_name, start_date, end_date, rate_20, rate_40, rate_45, rate_default, port_name, is_active, remark)
VALUES 
  (''port_rate_2026_05_p1'', ''ช่วงที่ 1'', ''2026-05-01'', ''2026-05-02'', 734, 784, 784, 734, ''ท่าเรือทั่วไป'', true, ''เรทท่าเรือ 01/05/2026 - 02/05/2026''),
  (''port_rate_2026_05_p2'', ''ช่วงที่ 2'', ''2026-05-03'', ''2026-05-09'', 721, 771, 771, 721, ''ท่าเรือทั่วไป'', true, ''เรทท่าเรือ 03/05/2026 - 09/05/2026''),
  (''port_rate_2026_05_p3'', ''ช่วงที่ 3'', ''2026-05-10'', ''2026-05-15'', 721, 771, 771, 721, ''ท่าเรือทั่วไป'', true, ''เรทท่าเรือ 10/05/2026 - 15/05/2026'')
ON CONFLICT (id) DO NOTHING;
