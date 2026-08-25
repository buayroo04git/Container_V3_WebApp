-- =========================================================================
-- Complete Master Setup for Driver Payroll Subsystem
-- =========================================================================

-- 1. Table: driver_rate_configs
CREATE TABLE IF NOT EXISTS public.driver_rate_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    driver_name TEXT DEFAULT 'ALL',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    rate_20 NUMERIC DEFAULT 100,
    rate_40 NUMERIC DEFAULT 100,
    rate_45 NUMERIC DEFAULT 100,
    rate_default NUMERIC DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    remark TEXT DEFAULT '-',
    created_by TEXT DEFAULT 'Admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.driver_rate_configs ENABLE ROW LEVEL SECURITY;

-- 2. Table: driver_incentive_configs
CREATE TABLE IF NOT EXISTS public.driver_incentive_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    start_date DATE NOT NULL DEFAULT '2026-01-01',
    end_date DATE,
    tiers JSONB NOT NULL DEFAULT '[
        {"minTrips": 150, "bonus": 1000},
        {"minTrips": 160, "bonus": 2000},
        {"minTrips": 170, "bonus": 3000},
        {"minTrips": 180, "bonus": 4000},
        {"minTrips": 190, "bonus": 5000},
        {"minTrips": 200, "bonus": 6000},
        {"minTrips": 210, "bonus": 7000},
        {"minTrips": 220, "bonus": 8000},
        {"minTrips": 230, "bonus": 9000}
    ]'::jsonb,
    step_trips INT DEFAULT 10,
    step_bonus NUMERIC DEFAULT 1000,
    remark TEXT DEFAULT '-',
    created_by TEXT DEFAULT 'Admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.driver_incentive_configs ENABLE ROW LEVEL SECURITY;

-- 3. Table: driver_advances
CREATE TABLE IF NOT EXISTS public.driver_advances (
    id VARCHAR(64) PRIMARY KEY,
    advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    driver_id VARCHAR(64),
    driver_name VARCHAR(100) NOT NULL,
    assigned_truck_no VARCHAR(50) DEFAULT '-',
    batch_name VARCHAR(100) DEFAULT '-',
    amount NUMERIC NOT NULL DEFAULT 0,
    advance_type VARCHAR(50) DEFAULT 'trip_advance',
    status VARCHAR(30) DEFAULT 'pending',
    settlement_batch_id VARCHAR(64),
    payment_method VARCHAR(30) DEFAULT 'transfer',
    slip_url TEXT DEFAULT '-',
    remark TEXT DEFAULT '-',
    category VARCHAR(30) DEFAULT 'single_advance',
    installments_total INT DEFAULT 1,
    installments_paid INT DEFAULT 0,
    installment_amount NUMERIC DEFAULT 0,
    remaining_amount NUMERIC DEFAULT 0,
    start_period VARCHAR(10) DEFAULT '',
    created_by VARCHAR(100) DEFAULT 'System',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.driver_advances ENABLE ROW LEVEL SECURITY;

-- 4. Alter existing tables to ensure all needed columns exist
ALTER TABLE IF EXISTS public.job_sheet_items
    ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid',
    ADD COLUMN IF NOT EXISTS payment_batch_id TEXT,
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS paid_by TEXT DEFAULT '-';

ALTER TABLE IF EXISTS public.driver_records
    ADD COLUMN IF NOT EXISTS base_salary NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_profile VARCHAR(30) DEFAULT 'social_security',
    ADD COLUMN IF NOT EXISTS social_security_amount NUMERIC DEFAULT 875;

-- 5. RLS Policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'driver_rate_configs' AND policyname = 'Allow public all driver_rate_configs') THEN
        CREATE POLICY "Allow public all driver_rate_configs" ON public.driver_rate_configs FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'driver_incentive_configs' AND policyname = 'Allow public all driver_incentive_configs') THEN
        CREATE POLICY "Allow public all driver_incentive_configs" ON public.driver_incentive_configs FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'driver_advances' AND policyname = 'Allow public all driver_advances') THEN
        CREATE POLICY "Allow public all driver_advances" ON public.driver_advances FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 6. Initial Seed Data
INSERT INTO public.driver_rate_configs (id, name, driver_name, start_date, end_date, rate_20, rate_40, rate_45, rate_default, is_active, remark)
VALUES ('rate_standard_2026', 'อัตราค่ารอบมาตรฐาน (เริ่มต้น)', 'ALL', '2026-01-01', NULL, 100, 100, 100, 100, true, 'เรทค่ารอบมาตรฐาน')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.driver_incentive_configs (id, name, is_active, start_date, step_trips, step_bonus, remark)
VALUES ('inc_standard_2026', 'เกณฑ์เงินพิเศษมาตรฐาน 2026', true, '2026-01-01', 10, 1000, 'บันไดเงินพิเศษเริ่มต้น 150 ตู้')
ON CONFLICT (id) DO NOTHING;

-- 7. High-Performance Indexes
CREATE INDEX IF NOT EXISTS idx_driver_advances_settlement_batch_id ON public.driver_advances(settlement_batch_id);
CREATE INDEX IF NOT EXISTS idx_driver_advances_driver_status ON public.driver_advances(driver_name, status);
CREATE INDEX IF NOT EXISTS idx_job_sheet_items_payment_status_sheet_id ON public.job_sheet_items(payment_status, job_sheet_id);
CREATE INDEX IF NOT EXISTS idx_job_sheet_items_ref_master_id ON public.job_sheet_items(ref_master_id);
CREATE INDEX IF NOT EXISTS idx_job_sheet_items_match_status ON public.job_sheet_items(match_status);
CREATE INDEX IF NOT EXISTS idx_driver_rate_configs_active_lookup ON public.driver_rate_configs(driver_name, is_active, start_date);
CREATE INDEX IF NOT EXISTS idx_container_records_date_truck ON public.container_records(date_job_parsed, truck_no);

-- 8. Atomic Batch RPC for payment mark
CREATE OR REPLACE FUNCTION public.mark_driver_containers_paid_rpc(p_batch_id TEXT, p_item_ids JSONB, p_paid_by TEXT DEFAULT 'Admin')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_count INT := 0;
    v_item_id_array BIGINT[];
BEGIN
    SELECT ARRAY_AGG(x::bigint)
    INTO v_item_id_array
    FROM jsonb_array_elements_text(p_item_ids) AS x
    WHERE x IS NOT NULL AND x ~ '^[0-9]+$';

    IF v_item_id_array IS NOT NULL AND array_length(v_item_id_array, 1) > 0 THEN
        UPDATE public.job_sheet_items
        SET 
            payment_status = 'paid',
            payment_batch_id = p_batch_id,
            paid_at = NOW(),
            paid_by = COALESCE(p_paid_by, 'Admin')
        WHERE id = ANY(v_item_id_array)
          AND match_status <> 'cancelled';

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'batch_id', p_batch_id,
        'updated_count', v_updated_count
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'detail', SQLSTATE
        );
END;
$$;
