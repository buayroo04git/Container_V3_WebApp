-- =========================================================================
-- 🛡️ SQL Blueprint V3.1: Foreign Keys & Database Integrity Constraints
-- 
-- 1. Foreign Keys สำหรับโมดูล OCR และ Fleet (Cascade Updates & Nullables)
-- 2. Data Integrity Checks สำหรับการซ่อมบำรุง, ลางาน, Audit Action, สถานะใบงาน
-- 3. Normalized Date Columns (date_job_parsed) สำหรับ Query ความเร็วสูง
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. 🔗 Foreign Keys สำหรับโมดูล OCR (job_sheet_items)
-- -------------------------------------------------------------------------
DO $$
BEGIN
    -- 1.1 ผูก job_sheet_items กับ job_sheets (ถ้าลบหัวใบงาน ไส้ข้างในจะถูกลบตามทันที)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_job_sheet_items_sheet'
    ) THEN
        ALTER TABLE public.job_sheet_items
        ADD CONSTRAINT fk_job_sheet_items_sheet
        FOREIGN KEY (job_sheet_id) 
        REFERENCES public.job_sheets(id) 
        ON DELETE CASCADE;
    END IF;

    -- 1.2 ผูก job_sheet_items กับ container_records (ถ้าลบ Master ให้เซ็ต ref เป็น NULL ไม่ลบใบงาน)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_job_sheet_items_master'
    ) THEN
        ALTER TABLE public.job_sheet_items
        ADD CONSTRAINT fk_job_sheet_items_master
        FOREIGN KEY (ref_master_id) 
        REFERENCES public.container_records(id) 
        ON DELETE SET NULL;
    END IF;
END $$;


-- -------------------------------------------------------------------------
-- 2. 🚚 Foreign Keys สำหรับโมดูล Fleet (Cascade Updates & Seed Missing)
-- -------------------------------------------------------------------------
DO $$
BEGIN
    -- 2.1 ผูก truck_operations(truck_no) -> truck_records(truck_no)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_truck_ops_truck_no') THEN
        INSERT INTO public.truck_records (truck_no, owner, status)
        SELECT DISTINCT o.truck_no, 'Auto-Created', 'active'
        FROM public.truck_operations o
        LEFT JOIN public.truck_records t ON o.truck_no = t.truck_no
        WHERE t.truck_no IS NULL AND o.truck_no IS NOT NULL AND o.truck_no != '-';

        ALTER TABLE public.truck_operations
            ADD CONSTRAINT fk_truck_ops_truck_no
            FOREIGN KEY (truck_no) REFERENCES public.truck_records(truck_no)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;

    -- 2.2 ผูก truck_operations(driver_name) -> driver_records(driver_name)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_truck_ops_driver_name') THEN
        INSERT INTO public.driver_records (driver_name, status)
        SELECT DISTINCT o.driver_name, 'active'
        FROM public.truck_operations o
        LEFT JOIN public.driver_records d ON o.driver_name = d.driver_name
        WHERE d.driver_name IS NULL AND o.driver_name IS NOT NULL AND o.driver_name != '-';

        ALTER TABLE public.truck_operations
            ADD CONSTRAINT fk_truck_ops_driver_name
            FOREIGN KEY (driver_name) REFERENCES public.driver_records(driver_name)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;

    -- 2.3 ผูก truck_maintenance_records(truck_no) -> truck_records(truck_no)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_maint_truck_no') THEN
        INSERT INTO public.truck_records (truck_no, owner, status)
        SELECT DISTINCT m.truck_no, 'Auto-Created', 'active'
        FROM public.truck_maintenance_records m
        LEFT JOIN public.truck_records t ON m.truck_no = t.truck_no
        WHERE t.truck_no IS NULL AND m.truck_no IS NOT NULL AND m.truck_no != '-';

        ALTER TABLE public.truck_maintenance_records
            ADD CONSTRAINT fk_maint_truck_no
            FOREIGN KEY (truck_no) REFERENCES public.truck_records(truck_no)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;

    -- 2.4 ผูก driver_leave_records(driver_name) -> driver_records(driver_name)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_leave_driver_name') THEN
        INSERT INTO public.driver_records (driver_name, status)
        SELECT DISTINCT l.driver_name, 'active'
        FROM public.driver_leave_records l
        LEFT JOIN public.driver_records d ON l.driver_name = d.driver_name
        WHERE d.driver_name IS NULL AND l.driver_name IS NOT NULL AND l.driver_name != '-';

        ALTER TABLE public.driver_leave_records
            ADD CONSTRAINT fk_leave_driver_name
            FOREIGN KEY (driver_name) REFERENCES public.driver_records(driver_name)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;


-- -------------------------------------------------------------------------
-- 3. 🛠️ Data Integrity Constraints: ซ่อมบำรุง, ลางาน, Audit Action
-- -------------------------------------------------------------------------
DO $$
BEGIN
    -- 3.1 Maintenance Constraints
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_truck_maint_date') THEN
        ALTER TABLE public.truck_maintenance_records
        ADD CONSTRAINT chk_truck_maint_date CHECK (end_date IS NULL OR end_date >= start_date);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_truck_maint_costs') THEN
        ALTER TABLE public.truck_maintenance_records
        ADD CONSTRAINT chk_truck_maint_costs CHECK (cost_parts >= 0 AND cost_labor >= 0 AND cost_total >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_truck_maint_mileage') THEN
        ALTER TABLE public.truck_maintenance_records
        ADD CONSTRAINT chk_truck_maint_mileage CHECK (mileage >= 0);
    END IF;

    -- 3.2 Leave Constraints
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_driver_leave_date') THEN
        ALTER TABLE public.driver_leave_records
        ADD CONSTRAINT chk_driver_leave_date CHECK (end_date IS NULL OR end_date >= start_date);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_driver_leave_duration') THEN
        ALTER TABLE public.driver_leave_records
        ADD CONSTRAINT chk_driver_leave_duration CHECK (duration_days >= 0);
    END IF;

    -- 3.3 Audit History Action Constraints (Full action list)
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_history_action') THEN
        ALTER TABLE public.driver_truck_history DROP CONSTRAINT chk_history_action;
    END IF;

    ALTER TABLE public.driver_truck_history
    ADD CONSTRAINT chk_history_action
    CHECK (action IN (
        'ASSIGN', 'UNASSIGN', 'TRANSFER',
        'MAINTENANCE', 'MAINTENANCE_END',
        'LEAVE', 'RESUME_WORK', 'RESIGN',
        'CANCEL', 'STATUS_CHANGE', 'OTHER'
    ));
END $$;


-- -------------------------------------------------------------------------
-- 4. 📄 Status Constraints: job_sheets & job_sheet_items
-- -------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_job_sheets_status') THEN
        ALTER TABLE public.job_sheets
        ADD CONSTRAINT chk_job_sheets_status
        CHECK (status IN ('completed', 'draft', 'deleted', 'in_progress', 'pending'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_js_items_match_status') THEN
        ALTER TABLE public.job_sheet_items
        ADD CONSTRAINT chk_js_items_match_status
        CHECK (match_status IN ('matched_green', 'manual_red', 'duplicate_auto', 'cancelled'));
    END IF;
END $$;


-- -------------------------------------------------------------------------
-- 5. 📅 Normalized Date Columns (date_job_parsed)
-- -------------------------------------------------------------------------
ALTER TABLE public.container_records ADD COLUMN IF NOT EXISTS date_job_parsed DATE;
ALTER TABLE public.job_sheet_items ADD COLUMN IF NOT EXISTS date_job_parsed DATE;

CREATE INDEX IF NOT EXISTS idx_master_date_job_parsed ON public.container_records(date_job_parsed);
CREATE INDEX IF NOT EXISTS idx_js_items_date_job_parsed ON public.job_sheet_items(date_job_parsed);
