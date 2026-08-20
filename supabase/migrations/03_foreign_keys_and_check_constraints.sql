-- =========================================================================
-- 🛡️ SQL Migration V3.1: Foreign Keys & Database Data Integrity Constraints
-- 
-- รันสคริปต์นี้ใน Supabase SQL Editor เพื่อผูก Foreign Keys และเปิดใช้งาน
-- Check Constraints ป้องกันข้อมูลผิดพลาดระดับ Database Engine (Safe 100%)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. 🔗 ผูก Foreign Keys บนตาราง job_sheet_items
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
-- 2. 🚚 Data Integrity Constraints: ตารางซ่อมบำรุง (truck_maintenance_records)
-- -------------------------------------------------------------------------

DO $$
BEGIN
    -- 2.1 วันที่เสร็จต้องไม่มาก่อนวันที่เริ่ม
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_truck_maint_date'
    ) THEN
        ALTER TABLE public.truck_maintenance_records
        ADD CONSTRAINT chk_truck_maint_date
        CHECK (end_date IS NULL OR end_date >= start_date);
    END IF;

    -- 2.2 ค่าใช้จ่ายห้ามติดลบ
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_truck_maint_costs'
    ) THEN
        ALTER TABLE public.truck_maintenance_records
        ADD CONSTRAINT chk_truck_maint_costs
        CHECK (cost_parts >= 0 AND cost_labor >= 0 AND cost_total >= 0);
    END IF;

    -- 2.3 เลขไมล์ห้ามติดลบ
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_truck_maint_mileage'
    ) THEN
        ALTER TABLE public.truck_maintenance_records
        ADD CONSTRAINT chk_truck_maint_mileage
        CHECK (mileage >= 0);
    END IF;
END $$;


-- -------------------------------------------------------------------------
-- 3. 👤 Data Integrity Constraints: ตารางลางาน (driver_leave_records)
-- -------------------------------------------------------------------------

DO $$
BEGIN
    -- 3.1 วันที่สิ้นสุดการลาต้องไม่มาก่อนวันที่เริ่มลา
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_driver_leave_date'
    ) THEN
        ALTER TABLE public.driver_leave_records
        ADD CONSTRAINT chk_driver_leave_date
        CHECK (end_date IS NULL OR end_date >= start_date);
    END IF;

    -- 3.2 จำนวนวันลาห้ามติดลบ
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_driver_leave_duration'
    ) THEN
        ALTER TABLE public.driver_leave_records
        ADD CONSTRAINT chk_driver_leave_duration
        CHECK (duration_days >= 0);
    END IF;
END $$;


-- -------------------------------------------------------------------------
-- 4. 📜 Data Integrity Constraints: ตาราง Audit History (driver_truck_history)
-- -------------------------------------------------------------------------

DO $$
BEGIN
    -- 4.1 กำหนด Action ที่ถูกต้อง ป้องกันการสะกดผิด
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_history_action'
    ) THEN
        ALTER TABLE public.driver_truck_history
        ADD CONSTRAINT chk_history_action
        CHECK (action IN ('ASSIGN', 'UNASSIGN', 'TRANSFER', 'MAINTENANCE', 'LEAVE', 'CANCEL', 'STATUS_CHANGE', 'OTHER'));
    END IF;
END $$;
