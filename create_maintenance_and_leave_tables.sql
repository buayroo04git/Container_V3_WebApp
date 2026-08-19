-- ==============================================================================
-- 🚚 SQL Migration V2.2: Truck Maintenance & Driver Leave Management Tables
-- รันสคริปต์นี้ใน Supabase SQL Editor เพื่อสร้างตารางบันทึกการซ่อมบำรุงและบันทึกการลางาน
-- ==============================================================================

-- 1. ตารางประวัติการซ่อมบำรุงรถ (Truck Maintenance Records)
CREATE TABLE IF NOT EXISTS public.truck_maintenance_records (
    id TEXT PRIMARY KEY,
    truck_no TEXT NOT NULL,
    maintenance_type TEXT DEFAULT 'general',    -- 'periodic' (เช็กระยะ), 'engine' (เครื่องยนต์), 'brake' (เบรก/ลม), 'tire' (ยาง), 'suspension' (ช่วงล่าง), 'electrical' (ไฟ/แอร์), 'body' (ตัวถัง/สี), 'inspection' (ตรวจสภาพ/พรบ), 'general' (ทั่วไป)
    start_date DATE NOT NULL,
    end_date DATE,
    duration_days INT DEFAULT 1,
    garage_name TEXT DEFAULT '-',               -- ชื่ออู่ / ศูนย์บริการ / ช่าง
    mileage NUMERIC DEFAULT 0,                  -- เลขไมล์ตอนเข้าซ่อม (กม.)
    cost_parts NUMERIC DEFAULT 0,               -- ค่าอะไหล่ (บาท)
    cost_labor NUMERIC DEFAULT 0,               -- ค่าแรงช่าง (บาท)
    cost_total NUMERIC DEFAULT 0,               -- ยอดรวมค่าใช้จ่าย (บาท)
    invoice_no TEXT DEFAULT '-',                -- เลขที่ใบเสร็จ / บิล
    status TEXT DEFAULT 'in_progress',          -- 'in_progress' (กำลังซ่อม), 'completed' (ซ่อมเสร็จ), 'cancelled' (ยกเลิก)
    parts_list TEXT DEFAULT '-',                -- รายการอะไหล่ / งานที่ซ่อม
    performed_by TEXT DEFAULT '-',              -- ผู้ส่งซ่อม / ช่างผู้รับผิดชอบ
    remark TEXT DEFAULT '-',                    -- หมายเหตุ
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ตารางประวัติการลางานของคนขับ (Driver Leave Records)
CREATE TABLE IF NOT EXISTS public.driver_leave_records (
    id TEXT PRIMARY KEY,
    driver_name TEXT NOT NULL,
    leave_type TEXT DEFAULT 'personal',         -- 'personal' (ลากิจ), 'sick' (ลาป่วย), 'vacation' (ลาพักร้อน), 'ordination' (ลาบวช/คลอด), 'unauthorized' (ขาดงาน), 'suspended' (พักงาน), 'other' (อื่นๆ)
    start_date DATE NOT NULL,
    end_date DATE,
    expected_end_date DATE,
    is_indefinite BOOLEAN DEFAULT true,         -- ลาไม่มีกำหนด
    duration_days INT DEFAULT 1,                -- จำนวนวันลาจริง
    leave_reason TEXT DEFAULT '-',              -- เหตุผลการลา
    with_pay TEXT DEFAULT 'unpaid',             -- 'paid' (จ่ายค่าจ้าง), 'unpaid' (ไม่จ่ายค่าจ้าง)
    status TEXT DEFAULT 'active_leave',         -- 'active_leave' (กำลังลา), 'completed' (กลับมาแล้ว), 'cancelled' (ยกเลิก)
    approved_by TEXT DEFAULT 'Admin',           -- ผู้อนุมัติ / ผู้บันทึก
    remark TEXT DEFAULT '-',                    -- หมายเหตุ
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. สร้าง Indexes เพื่อความรวดเร็วในการค้นหา
CREATE INDEX IF NOT EXISTS idx_truck_maint_truck ON public.truck_maintenance_records(truck_no);
CREATE INDEX IF NOT EXISTS idx_truck_maint_status ON public.truck_maintenance_records(status);
CREATE INDEX IF NOT EXISTS idx_truck_maint_date ON public.truck_maintenance_records(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_driver_leave_driver ON public.driver_leave_records(driver_name);
CREATE INDEX IF NOT EXISTS idx_driver_leave_status ON public.driver_leave_records(status);
CREATE INDEX IF NOT EXISTS idx_driver_leave_date ON public.driver_leave_records(start_date, end_date);

-- 4. เปิดใช้งาน RLS (Row Level Security)
ALTER TABLE public.truck_maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_leave_records ENABLE ROW LEVEL SECURITY;

-- 5. Safe RLS Policies
DROP POLICY IF EXISTS "Allow anon all on truck_maintenance_records" ON public.truck_maintenance_records;
CREATE POLICY "Allow anon all on truck_maintenance_records" ON public.truck_maintenance_records FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated all on truck_maintenance_records" ON public.truck_maintenance_records;
CREATE POLICY "Allow authenticated all on truck_maintenance_records" ON public.truck_maintenance_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on driver_leave_records" ON public.driver_leave_records;
CREATE POLICY "Allow anon all on driver_leave_records" ON public.driver_leave_records FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated all on driver_leave_records" ON public.driver_leave_records;
CREATE POLICY "Allow authenticated all on driver_leave_records" ON public.driver_leave_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
