-- =====================================================================================
-- 🚀 Migration 12: Clean & Simplified Truck Expenses Schema
-- =====================================================================================
-- Idempotent script: Handles both fresh creation and updating existing tables.

-- 1. Create table if not exists with clean simplified columns
CREATE TABLE IF NOT EXISTS public.truck_expenses (
    id TEXT PRIMARY KEY,
    expense_date DATE NOT NULL,
    truck_no TEXT NOT NULL,                                     -- เบอร์รถ เช่น '39', '501' หรือ 'FLEET_SHARED'
    driver_name TEXT DEFAULT '-',                               -- คนขับ ณ วันที่เกิดรายการ
    batch_name TEXT DEFAULT '-',                                -- งวดงาน / รอบเดือน
    category TEXT NOT NULL DEFAULT 'misc',                     -- หมวดหมู่ (รวม salary)
    description TEXT NOT NULL,                                  -- รายการค่าใช้จ่าย
    amount_total NUMERIC DEFAULT 0,                             -- ยอดเงินสุทธิ
    has_vat BOOLEAN DEFAULT false,                              -- VAT Flag
    vat_amount NUMERIC DEFAULT 0,                               -- ยอด VAT
    payment_method TEXT DEFAULT 'cash',                         -- วิธีชำระเงิน
    invoice_no TEXT DEFAULT '-',                                -- เลขที่บิล
    slip_url TEXT DEFAULT '-',                                  -- แนบสลิป
    remark TEXT DEFAULT '-',                                    -- หมายเหตุ
    created_by TEXT DEFAULT 'Admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. If table already existed with old columns, safely drop unused columns
ALTER TABLE public.truck_expenses 
    DROP COLUMN IF EXISTS amount_goods,
    DROP COLUMN IF EXISTS amount_labor,
    DROP COLUMN IF EXISTS trip_count,
    DROP COLUMN IF EXISTS cost_per_trip,
    DROP COLUMN IF EXISTS fuel_liters,
    DROP COLUMN IF EXISTS odometer,
    DROP COLUMN IF EXISTS vendor_name;

-- 3. Category CHECK Constraint (Includes 'salary')
DO $$
BEGIN
    ALTER TABLE public.truck_expenses DROP CONSTRAINT IF EXISTS chk_truck_expense_category;
    ALTER TABLE public.truck_expenses ADD CONSTRAINT chk_truck_expense_category
        CHECK (category IN ('fuel', 'maintenance', 'toll_port', 'installment', 'tax_insurance', 'salary', 'misc'));
END $$;

-- 4. High-performance Indexes
CREATE INDEX IF NOT EXISTS idx_truck_expenses_date ON public.truck_expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_truck_expenses_truck ON public.truck_expenses(truck_no);
CREATE INDEX IF NOT EXISTS idx_truck_expenses_category ON public.truck_expenses(category);
CREATE INDEX IF NOT EXISTS idx_truck_expenses_batch ON public.truck_expenses(batch_name);
CREATE INDEX IF NOT EXISTS idx_truck_expenses_driver ON public.truck_expenses(driver_name);

-- 5. Row Level Security (RLS) Policies
ALTER TABLE public.truck_expenses ENABLE ROW LEVEL SECURITY;

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
