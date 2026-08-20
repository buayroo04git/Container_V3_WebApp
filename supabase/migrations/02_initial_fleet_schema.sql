-- ==============================================================================
-- 🚚 SQL Blueprint V3.1: Fleet Management Module Schema (Trucks & Drivers)
-- 
-- รวบรวม DDL เริ่มต้นสำหรับโครงสร้างกลุ่ม Fleet ทั้งหมด
-- (truck_records, driver_records, truck_operations, driver_truck_history,
--  truck_maintenance_records, driver_leave_records)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Automatic updated_at Trigger Function
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 2. Core Tables
-- ------------------------------------------------------------------------------

-- 2.1 ตารางข้อมูลรถ (Truck Records)
CREATE TABLE IF NOT EXISTS public.truck_records (
    id BIGSERIAL PRIMARY KEY,
    truck_no TEXT NOT NULL UNIQUE,
    truck_license TEXT DEFAULT '-',
    owner TEXT DEFAULT '-',
    truck_type TEXT DEFAULT 'หัวลาก',
    truck_kind TEXT DEFAULT 'กึ่งพ่วง',
    brand TEXT DEFAULT '-',
    status TEXT DEFAULT 'active',
    assigned_driver_name TEXT DEFAULT '-',
    tax_expiry_date DATE,
    act_expiry_date DATE,
    insurance_expiry_date DATE,
    remark TEXT DEFAULT '-',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 ตารางข้อมูลคนขับ (Driver Records)
CREATE TABLE IF NOT EXISTS public.driver_records (
    id BIGSERIAL PRIMARY KEY,
    driver_name TEXT NOT NULL UNIQUE,
    phone TEXT DEFAULT '-',
    id_card TEXT DEFAULT '-',
    license_no TEXT DEFAULT '-',
    license_type TEXT DEFAULT 'ท.4',
    license_expiry_date DATE,
    assigned_truck_no TEXT DEFAULT '-',
    status TEXT DEFAULT 'active',
    rate_per_trip NUMERIC DEFAULT 0,
    start_date DATE,
    emergency_contact TEXT DEFAULT '-',
    remark TEXT DEFAULT '-',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.3 ตารางงวดการขับขี่ / การดำเนินงาน (Truck Operations)
CREATE TABLE IF NOT EXISTS public.truck_operations (
    id TEXT PRIMARY KEY,
    truck_no TEXT NOT NULL,
    driver_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    status TEXT DEFAULT 'active',
    operation_type TEXT DEFAULT 'primary',
    rate_per_trip NUMERIC DEFAULT 0,
    remark TEXT DEFAULT '-',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.4 ตารางประวัติการมอบหมาย / Timeline Log (Driver Truck History)
CREATE TABLE IF NOT EXISTS public.driver_truck_history (
    id BIGSERIAL PRIMARY KEY,
    driver_name TEXT NOT NULL,
    truck_no TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT DEFAULT '-',
    previous_driver TEXT DEFAULT '-',
    previous_truck TEXT DEFAULT '-',
    effective_date DATE DEFAULT CURRENT_DATE,
    truck_license TEXT DEFAULT '-',
    operation_id TEXT DEFAULT '-',
    created_by TEXT DEFAULT 'Admin',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.5 ตารางซ่อมบำรุงรถ (Truck Maintenance Records)
CREATE TABLE IF NOT EXISTS public.truck_maintenance_records (
    id TEXT PRIMARY KEY,
    truck_no TEXT NOT NULL,
    maintenance_type TEXT DEFAULT 'general',
    start_date DATE NOT NULL,
    end_date DATE,
    duration_days INT DEFAULT 1,
    garage_name TEXT DEFAULT '-',
    mileage NUMERIC DEFAULT 0,
    cost_parts NUMERIC DEFAULT 0,
    cost_labor NUMERIC DEFAULT 0,
    cost_total NUMERIC DEFAULT 0,
    invoice_no TEXT DEFAULT '-',
    status TEXT DEFAULT 'in_progress',
    parts_list TEXT DEFAULT '-',
    performed_by TEXT DEFAULT '-',
    remark TEXT DEFAULT '-',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.6 ตารางการลางานของคนขับ (Driver Leave Records)
CREATE TABLE IF NOT EXISTS public.driver_leave_records (
    id TEXT PRIMARY KEY,
    driver_name TEXT NOT NULL,
    leave_type TEXT DEFAULT 'personal',
    start_date DATE NOT NULL,
    end_date DATE,
    expected_end_date DATE,
    is_indefinite BOOLEAN DEFAULT true,
    duration_days INT DEFAULT 1,
    leave_reason TEXT DEFAULT '-',
    with_pay TEXT DEFAULT 'unpaid',
    status TEXT DEFAULT 'active_leave',
    approved_by TEXT DEFAULT 'Admin',
    remark TEXT DEFAULT '-',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. Core Status Check Constraints
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_truck_status') THEN
        ALTER TABLE public.truck_records ADD CONSTRAINT chk_truck_status 
            CHECK (status IN ('active', 'maintenance', 'inactive'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_driver_status') THEN
        ALTER TABLE public.driver_records ADD CONSTRAINT chk_driver_status 
            CHECK (status IN ('active', 'leave', 'inactive'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_op_status') THEN
        ALTER TABLE public.truck_operations ADD CONSTRAINT chk_op_status 
            CHECK (status IN ('active', 'completed'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_op_type') THEN
        ALTER TABLE public.truck_operations ADD CONSTRAINT chk_op_type 
            CHECK (operation_type IN ('primary', 'substitute', 'contract'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_maint_status') THEN
        ALTER TABLE public.truck_maintenance_records ADD CONSTRAINT chk_maint_status 
            CHECK (status IN ('in_progress', 'completed', 'cancelled'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_leave_status') THEN
        ALTER TABLE public.driver_leave_records ADD CONSTRAINT chk_leave_status 
            CHECK (status IN ('active_leave', 'completed', 'cancelled'));
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. High-Performance Indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_truck_records_truck ON public.truck_records(truck_no);
CREATE INDEX IF NOT EXISTS idx_truck_records_driver ON public.truck_records(assigned_driver_name);
CREATE INDEX IF NOT EXISTS idx_truck_records_status ON public.truck_records(status);

CREATE INDEX IF NOT EXISTS idx_driver_records_driver ON public.driver_records(driver_name);
CREATE INDEX IF NOT EXISTS idx_driver_records_truck ON public.driver_records(assigned_truck_no);
CREATE INDEX IF NOT EXISTS idx_driver_records_status ON public.driver_records(status);

CREATE INDEX IF NOT EXISTS idx_truck_ops_truck ON public.truck_operations(truck_no);
CREATE INDEX IF NOT EXISTS idx_truck_ops_driver ON public.truck_operations(driver_name);
CREATE INDEX IF NOT EXISTS idx_truck_ops_status ON public.truck_operations(status);
CREATE INDEX IF NOT EXISTS idx_truck_ops_date ON public.truck_operations(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_driver_truck_hist_truck ON public.driver_truck_history(truck_no);
CREATE INDEX IF NOT EXISTS idx_driver_truck_hist_driver ON public.driver_truck_history(driver_name);
CREATE INDEX IF NOT EXISTS idx_driver_truck_hist_time ON public.driver_truck_history(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_truck_maint_truck ON public.truck_maintenance_records(truck_no);
CREATE INDEX IF NOT EXISTS idx_truck_maint_status ON public.truck_maintenance_records(status);
CREATE INDEX IF NOT EXISTS idx_truck_maint_date ON public.truck_maintenance_records(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_driver_leave_driver ON public.driver_leave_records(driver_name);
CREATE INDEX IF NOT EXISTS idx_driver_leave_status ON public.driver_leave_records(status);
CREATE INDEX IF NOT EXISTS idx_driver_leave_date ON public.driver_leave_records(start_date, end_date);

-- ------------------------------------------------------------------------------
-- 5. Maintenance Cost Calculation Trigger
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_maintenance_cost_total()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.cost_total IS NULL OR NEW.cost_total = 0 THEN
        NEW.cost_total = COALESCE(NEW.cost_parts, 0) + COALESCE(NEW.cost_labor, 0);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_maintenance_cost_total ON public.truck_maintenance_records;
CREATE TRIGGER trg_maintenance_cost_total
    BEFORE INSERT OR UPDATE OF cost_parts, cost_labor ON public.truck_maintenance_records
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_maintenance_cost_total();

-- ------------------------------------------------------------------------------
-- 6. Attach updated_at Triggers
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    t text;
    tables text[] := ARRAY['truck_records', 'driver_records', 'truck_operations', 'truck_maintenance_records', 'driver_leave_records'];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', t, t);
        EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at()', t, t);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 7. Row Level Security Policies (Idempotent)
-- ------------------------------------------------------------------------------
ALTER TABLE public.truck_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.truck_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_truck_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.truck_maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_leave_records ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY['truck_records', 'driver_records', 'truck_operations', 'driver_truck_history', 'truck_maintenance_records', 'driver_leave_records'];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow anon all on %I" ON public.%I', tbl, tbl);
        EXECUTE format('CREATE POLICY "Allow anon all on %I" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)', tbl, tbl);
        
        EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated all on %I" ON public.%I', tbl, tbl);
        EXECUTE format('CREATE POLICY "Allow authenticated all on %I" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl, tbl);
    END LOOP;
END $$;
