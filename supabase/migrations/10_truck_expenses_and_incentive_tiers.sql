-- ==============================================================================
-- 💰 SQL Migration: Unified Truck Expenses & Driver Incentive Tiers
-- File: supabase/migrations/10_truck_expenses_and_incentive_tiers.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ตารางบันทึกค่าใช้จ่ายรถแบบเบ็ดเสร็จ (Unified Truck Expenses)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.truck_expenses (
    id TEXT PRIMARY KEY,
    expense_date DATE NOT NULL,
    truck_no TEXT NOT NULL,                                     -- เบอร์รถ เช่น '39', '501' หรือ 'FLEET_SHARED' (กองกลาง)
    driver_name TEXT DEFAULT '-',                               -- คนขับ ณ วันที่เกิดรายการ
    batch_name TEXT DEFAULT '-',                                -- งวดงาน / รอบเดือน เช่น '2026-05' หรือ 'พฤษภาคม 2569'
    category TEXT NOT NULL DEFAULT 'misc',                     -- หมวดหมู่: fuel, maintenance, toll_port, installment, tax_insurance, misc
    description TEXT NOT NULL,                                  -- รายการ เช่น 'เติมน้ำมัน ผ่านท่า', 'ปะยาง', 'ผ่อนรถ งวด6'
    amount_goods NUMERIC DEFAULT 0,                             -- ค่าของ / อะไหล่ / ค่าน้ำมัน (Col ซื้อของ)
    amount_labor NUMERIC DEFAULT 0,                             -- ค่าแรงช่าง / ค่าบริการ (Col ค่าแรง)
    amount_total NUMERIC DEFAULT 0,                             -- ยอดรวมสุทธิ (amount_goods + amount_labor)
    has_vat BOOLEAN DEFAULT false,                              -- มีภาษีมูลค่าเพิ่มหรือไม่
    vat_amount NUMERIC DEFAULT 0,                               -- ยอดภาษีมูลค่าเพิ่ม (VAT ซื้อ)
    trip_count NUMERIC DEFAULT 0,                               -- จน. เที่ยวน้ำมัน / รอบวิ่ง
    cost_per_trip NUMERIC DEFAULT 0,                            -- ค่าน้ำมันเฉลี่ยต่อเที่ยว (amount_total / trip_count)
    fuel_liters NUMERIC DEFAULT 0,                              -- จำนวนลิตร (ถ้ามี)
    odometer NUMERIC DEFAULT 0,                                 -- เลขไมล์ (ถ้ามี)
    payment_method TEXT DEFAULT 'cash',                         -- วิธีชำระ: cash, fleet_card, transfer, driver_advance, company
    vendor_name TEXT DEFAULT '-',                               -- ร้านค้า / อู่ / ปั๊มน้ำมัน เช่น ผ่านท่า, ช่างเอ
    invoice_no TEXT DEFAULT '-',                                -- เลขที่บิล / ใบกำกับภาษี
    slip_url TEXT DEFAULT '-',                                  -- แนบรูปภาพสลิป / บิลใบเสร็จ
    remark TEXT DEFAULT '-',                                    -- หมายเหตุเพิ่มเติม
    created_by TEXT DEFAULT 'Admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CHECK Constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_truck_expense_category') THEN
        ALTER TABLE public.truck_expenses ADD CONSTRAINT chk_truck_expense_category
            CHECK (category IN ('fuel', 'maintenance', 'toll_port', 'installment', 'tax_insurance', 'misc'));
    END IF;
END $$;

-- Indexes for high-performance filtering
CREATE INDEX IF NOT EXISTS idx_truck_expenses_date ON public.truck_expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_truck_expenses_truck ON public.truck_expenses(truck_no);
CREATE INDEX IF NOT EXISTS idx_truck_expenses_category ON public.truck_expenses(category);
CREATE INDEX IF NOT EXISTS idx_truck_expenses_batch ON public.truck_expenses(batch_name);
CREATE INDEX IF NOT EXISTS idx_truck_expenses_driver ON public.truck_expenses(driver_name);

-- Trigger Function: Auto calculate amount_total and cost_per_trip
CREATE OR REPLACE FUNCTION public.trigger_calc_truck_expense_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto sum goods + labor if total is not manually overridden
    IF NEW.amount_total IS NULL OR NEW.amount_total = 0 THEN
        NEW.amount_total := COALESCE(NEW.amount_goods, 0) + COALESCE(NEW.amount_labor, 0);
    END IF;

    -- Auto compute cost_per_trip if trip_count is present
    IF NEW.trip_count IS NOT NULL AND NEW.trip_count > 0 THEN
        NEW.cost_per_trip := ROUND(NEW.amount_total / NEW.trip_count, 2);
    ELSE
        NEW.cost_per_trip := 0;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calc_truck_expense_totals ON public.truck_expenses;
CREATE TRIGGER trg_calc_truck_expense_totals
    BEFORE INSERT OR UPDATE ON public.truck_expenses
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_calc_truck_expense_totals();

-- Enable RLS
ALTER TABLE public.truck_expenses ENABLE ROW LEVEL SECURITY;

-- Read/Write RLS Policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'truck_expenses' AND policyname = 'Allow public read truck_expenses') THEN
        CREATE POLICY "Allow public read truck_expenses" ON public.truck_expenses FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'truck_expenses' AND policyname = 'Allow public insert truck_expenses') THEN
        CREATE POLICY "Allow public insert truck_expenses" ON public.truck_expenses FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'truck_expenses' AND policyname = 'Allow public update truck_expenses') THEN
        CREATE POLICY "Allow public update truck_expenses" ON public.truck_expenses FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'truck_expenses' AND policyname = 'Allow public delete truck_expenses') THEN
        CREATE POLICY "Allow public delete truck_expenses" ON public.truck_expenses FOR DELETE USING (true);
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- 2. ตารางตั้งค่าขั้นเงินพิเศษคนขับตามจำนวนงาน (Driver Incentive Tiers)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_incentive_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,                                         -- ชื่อโครงสร้างเงินพิเศษ เช่น 'ขั้นเงินพิเศษมาตรฐาน 2026'
    is_active BOOLEAN DEFAULT true,                             -- สถานะเปิดใช้งาน
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
    step_trips INT DEFAULT 10,                                  -- อัตราก้าวหน้าหลังจากขั้นสูงสุด (ทุกๆ 10 ตู้)
    step_bonus NUMERIC DEFAULT 1000,                            -- เพิ่มเงินพิเศษขั้นละ 1,000 บาท
    remark TEXT DEFAULT '-',
    created_by TEXT DEFAULT 'Admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.driver_incentive_configs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'driver_incentive_configs' AND policyname = 'Allow public read driver_incentive_configs') THEN
        CREATE POLICY "Allow public read driver_incentive_configs" ON public.driver_incentive_configs FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'driver_incentive_configs' AND policyname = 'Allow public insert driver_incentive_configs') THEN
        CREATE POLICY "Allow public insert driver_incentive_configs" ON public.driver_incentive_configs FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'driver_incentive_configs' AND policyname = 'Allow public update driver_incentive_configs') THEN
        CREATE POLICY "Allow public update driver_incentive_configs" ON public.driver_incentive_configs FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'driver_incentive_configs' AND policyname = 'Allow public delete driver_incentive_configs') THEN
        CREATE POLICY "Allow public delete driver_incentive_configs" ON public.driver_incentive_configs FOR DELETE USING (true);
    END IF;
END $$;

-- Default Seed: Standard Tier
INSERT INTO public.driver_incentive_configs (
    id, name, is_active, start_date, end_date, tiers, step_trips, step_bonus, remark
) VALUES (
    'incentive_tier_standard_2026',
    'เกณฑ์เงินพิเศษขั้นบันไดมาตรฐาน (150 ตู้ขึ้นไป)',
    true,
    '2026-01-01',
    NULL,
    '[
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
    10,
    1000,
    'ตารางเงินพิเศษคิดตามจำนวนงาน: 150=1000, 160=2000, 170=3000, 180=4000, 190=5000, 200=6000, 210=7000, 220=8000, 230=9000 (+1000 ทุก 10 งาน)'
) ON CONFLICT (id) DO NOTHING;
