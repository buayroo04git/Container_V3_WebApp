-- ==============================================================================
-- 🚚 SQL Migration V2.3 (Comprehensive Schema Improvements & Integrity Polish)
-- รันสคริปต์นี้ใน Supabase SQL Editor
-- ==============================================================================

-- 1. Automatic updated_at Trigger Function
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. สร้างตารางถ้ายังไม่มี
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

-- 3. Constraints & Validation
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_driver_name') THEN
        ALTER TABLE public.driver_records ADD CONSTRAINT unique_driver_name UNIQUE (driver_name);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_truck_no') THEN
        ALTER TABLE public.truck_records ADD CONSTRAINT unique_truck_no UNIQUE (truck_no);
    END IF;
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

-- 4. Foreign Keys
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_truck_ops_truck_no') THEN
        ALTER TABLE public.truck_operations
            ADD CONSTRAINT fk_truck_ops_truck_no
            FOREIGN KEY (truck_no) REFERENCES public.truck_records(truck_no)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_truck_ops_driver_name') THEN
        ALTER TABLE public.truck_operations
            ADD CONSTRAINT fk_truck_ops_driver_name
            FOREIGN KEY (driver_name) REFERENCES public.driver_records(driver_name)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_maint_truck_no') THEN
        ALTER TABLE public.truck_maintenance_records
            ADD CONSTRAINT fk_maint_truck_no
            FOREIGN KEY (truck_no) REFERENCES public.truck_records(truck_no)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_leave_driver_name') THEN
        ALTER TABLE public.driver_leave_records
            ADD CONSTRAINT fk_leave_driver_name
            FOREIGN KEY (driver_name) REFERENCES public.driver_records(driver_name)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

-- 5. Maintenance Cost Trigger
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

-- 6. Attach updated_at Triggers
DROP TRIGGER IF EXISTS trg_truck_records_updated_at ON public.truck_records;
CREATE TRIGGER trg_truck_records_updated_at BEFORE UPDATE ON public.truck_records FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_driver_records_updated_at ON public.driver_records;
CREATE TRIGGER trg_driver_records_updated_at BEFORE UPDATE ON public.driver_records FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_truck_operations_updated_at ON public.truck_operations;
CREATE TRIGGER trg_truck_operations_updated_at BEFORE UPDATE ON public.truck_operations FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_truck_maint_updated_at ON public.truck_maintenance_records;
CREATE TRIGGER trg_truck_maint_updated_at BEFORE UPDATE ON public.truck_maintenance_records FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_driver_leave_updated_at ON public.driver_leave_records;
CREATE TRIGGER trg_driver_leave_updated_at BEFORE UPDATE ON public.driver_leave_records FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- 7. สร้าง Indexes
CREATE INDEX IF NOT EXISTS idx_truck_records_no ON public.truck_records(truck_no);
CREATE INDEX IF NOT EXISTS idx_truck_records_status ON public.truck_records(status);
CREATE INDEX IF NOT EXISTS idx_driver_records_name ON public.driver_records(driver_name);
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

-- 8. เปิดใช้งาน RLS
ALTER TABLE public.truck_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.truck_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_truck_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.truck_maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_leave_records ENABLE ROW LEVEL SECURITY;

-- 9. Safe RLS Policies
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

-- 10. Stored Procedures (Atomic RPCs with created_by)
CREATE OR REPLACE FUNCTION public.assign_driver_to_truck_rpc(
    p_truck_no TEXT,
    p_driver_name TEXT,
    p_start_date DATE DEFAULT CURRENT_DATE,
    p_operation_type TEXT DEFAULT 'primary',
    p_remark TEXT DEFAULT '-',
    p_created_by TEXT DEFAULT 'Admin'
) RETURNS JSONB AS $$
DECLARE
    v_old_driver_on_truck TEXT;
    v_old_truck_of_driver TEXT;
    v_truck_license TEXT;
    v_new_op_id TEXT;
    v_result JSONB;
BEGIN
    SELECT assigned_driver_name, truck_license INTO v_old_driver_on_truck, v_truck_license
    FROM public.truck_records WHERE truck_no = p_truck_no;

    SELECT assigned_truck_no INTO v_old_truck_of_driver
    FROM public.driver_records WHERE driver_name = p_driver_name;

    IF v_old_driver_on_truck IS NOT NULL AND v_old_driver_on_truck != '-' AND v_old_driver_on_truck != p_driver_name THEN
        UPDATE public.driver_records SET assigned_truck_no = '-', updated_at = NOW() WHERE driver_name = v_old_driver_on_truck;
        UPDATE public.truck_operations SET end_date = p_start_date, status = 'completed', updated_at = NOW() WHERE truck_no = p_truck_no AND (end_date IS NULL OR status = 'active');
        INSERT INTO public.driver_truck_history (
            driver_name, truck_no, action, reason, effective_date, truck_license, created_by, timestamp
        ) VALUES (
            v_old_driver_on_truck, p_truck_no, 'UNASSIGN', 'ปลดออกเนื่องจากมอบหมายคนขับใหม่ (' || p_driver_name || ')', p_start_date, COALESCE(v_truck_license, '-'), p_created_by, NOW()
        );
    END IF;

    IF v_old_truck_of_driver IS NOT NULL AND v_old_truck_of_driver != '-' AND v_old_truck_of_driver != p_truck_no THEN
        UPDATE public.truck_records SET assigned_driver_name = '-', updated_at = NOW() WHERE truck_no = v_old_truck_of_driver;
        UPDATE public.truck_operations SET end_date = p_start_date, status = 'completed', updated_at = NOW() WHERE truck_no = v_old_truck_of_driver AND (end_date IS NULL OR status = 'active');
        INSERT INTO public.driver_truck_history (
            driver_name, truck_no, action, reason, previous_truck, effective_date, truck_license, created_by, timestamp
        ) VALUES (
            p_driver_name, v_old_truck_of_driver, 'TRANSFER', 'ย้ายจากรถ ' || v_old_truck_of_driver || ' ไปรถ ' || p_truck_no, v_old_truck_of_driver, p_start_date, COALESCE(v_truck_license, '-'), p_created_by, NOW()
        );
    END IF;

    UPDATE public.truck_records SET assigned_driver_name = p_driver_name, updated_at = NOW() WHERE truck_no = p_truck_no;
    UPDATE public.driver_records SET assigned_truck_no = p_truck_no, status = 'active', updated_at = NOW() WHERE driver_name = p_driver_name;
    UPDATE public.truck_operations SET end_date = p_start_date, status = 'completed', updated_at = NOW() WHERE truck_no = p_truck_no AND (end_date IS NULL OR status = 'active');

    v_new_op_id := 'op_' || EXTRACT(EPOCH FROM NOW())::BIGINT || '_' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6);
    INSERT INTO public.truck_operations (id, truck_no, driver_name, start_date, end_date, status, operation_type, rate_per_trip, remark, created_at, updated_at)
    VALUES (v_new_op_id, p_truck_no, p_driver_name, p_start_date, NULL, 'active', p_operation_type, 0, p_remark, NOW(), NOW());

    INSERT INTO public.driver_truck_history (
        driver_name, truck_no, action, reason, previous_driver, previous_truck, effective_date, truck_license, operation_id, created_by, timestamp
    ) VALUES (
        p_driver_name, p_truck_no, 'ASSIGN', 'มอบหมายประจำรถ ' || p_truck_no, 
        COALESCE(NULLIF(v_old_driver_on_truck, '-'), '-'), 
        COALESCE(NULLIF(v_old_truck_of_driver, '-'), '-'), 
        p_start_date, 
        COALESCE(v_truck_license, '-'), 
        v_new_op_id, 
        p_created_by, 
        NOW()
    );

    v_result := jsonb_build_object('success', true, 'operation_id', v_new_op_id, 'truck_no', p_truck_no, 'driver_name', p_driver_name);
    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.unassign_driver_truck_rpc(
    p_truck_no TEXT,
    p_driver_name TEXT,
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_reason TEXT DEFAULT 'ปลดการครองรถ',
    p_created_by TEXT DEFAULT 'Admin'
) RETURNS JSONB AS $$
DECLARE
    v_truck_license TEXT;
BEGIN
    IF p_truck_no IS NOT NULL AND p_truck_no != '-' THEN
        SELECT truck_license INTO v_truck_license FROM public.truck_records WHERE truck_no = p_truck_no;
        UPDATE public.truck_records SET assigned_driver_name = '-', updated_at = NOW() WHERE truck_no = p_truck_no;
        UPDATE public.truck_operations SET end_date = p_end_date, status = 'completed', updated_at = NOW() WHERE truck_no = p_truck_no AND (end_date IS NULL OR status = 'active');
    END IF;

    IF p_driver_name IS NOT NULL AND p_driver_name != '-' THEN
        UPDATE public.driver_records SET assigned_truck_no = '-', updated_at = NOW() WHERE driver_name = p_driver_name;
    END IF;

    INSERT INTO public.driver_truck_history (
        driver_name, truck_no, action, reason, effective_date, truck_license, created_by, timestamp
    ) VALUES (
        COALESCE(p_driver_name, '-'), COALESCE(p_truck_no, '-'), 'UNASSIGN', p_reason, p_end_date, COALESCE(v_truck_license, '-'), p_created_by, NOW()
    );

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
