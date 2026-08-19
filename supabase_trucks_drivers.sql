-- ==============================================================================
-- 🚚 SQL Schema: Truck & Driver Management (Supabase)
-- ==============================================================================

-- 1. ตารางข้อมูลรถ (Truck Records)
CREATE TABLE IF NOT EXISTS public.truck_records (
    id BIGSERIAL PRIMARY KEY,
    truck_no TEXT NOT NULL UNIQUE,          -- เบอร์รถ เช่น "501", "502"
    truck_license TEXT DEFAULT '-',          -- ป้ายทะเบียน เช่น "70-1234 ชบ"
    owner TEXT DEFAULT '-',                 -- เจ้าของรถ / สังกัด เช่น "ทีชอว์", "บจก.แก้วมณี"
    truck_type TEXT DEFAULT 'หัวลาก',       -- ประเภทรถ เช่น "หัวลาก 10 ล้อ", "หางพ่วง 3 เพลา", "รถบรรทุก 6 ล้อ"
    truck_kind TEXT DEFAULT 'กึ่งพ่วง',       -- ชนิดรถ เช่น "กึ่งพ่วง", "พื้นเรียบ", "ก้างปลา"
    brand TEXT DEFAULT '-',                 -- ยี่ห้อ เช่น "HINO", "ISUZU", "SCANIA", "VOLVO"
    status TEXT DEFAULT 'active',           -- สถานะ: 'active' (พร้อมใช้งาน), 'maintenance' (ซ่อมบำรุง), 'inactive' (ระงับชั่วคราว)
    assigned_driver_name TEXT DEFAULT '-',  -- ชื่อคนขับประจำรถ
    tax_expiry_date DATE,                   -- วันหมดอายุภาษี
    act_expiry_date DATE,                   -- วันหมดอายุ พ.ร.บ.
    insurance_expiry_date DATE,             -- วันหมดอายุประกันภัย
    remark TEXT DEFAULT '-',                -- หมายเหตุ
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- สำหรับเพิ่มคอลัมน์ owner หากสร้างตารางไปแล้ว
ALTER TABLE public.truck_records ADD COLUMN IF NOT EXISTS owner TEXT DEFAULT '-';

-- 2. ตารางข้อมูลคนขับ (Driver Records)
CREATE TABLE IF NOT EXISTS public.driver_records (
    id BIGSERIAL PRIMARY KEY,
    driver_name TEXT NOT NULL,              -- ชื่อ-นามสกุล คนขับ
    phone TEXT DEFAULT '-',                 -- เบอร์โทรศัพท์
    id_card TEXT DEFAULT '-',               -- เลขบัตรประชาชน (13 หลัก)
    license_no TEXT DEFAULT '-',            -- เลขที่ใบอนุญาตขับขี่
    license_type TEXT DEFAULT 'ท.4',        -- ประเภทใบขับขี่ เช่น "ท.4", "ท.3", "ท.2", "บ.2"
    license_expiry_date DATE,               -- วันหมดอายุใบขับขี่
    assigned_truck_no TEXT DEFAULT '-',     -- เบอร์รถประจำ
    status TEXT DEFAULT 'active',           -- สถานะ: 'active' (ปฏิบัติงาน), 'leave' (ลางาน), 'inactive' (ลาออก/พักงาน)
    rate_per_trip NUMERIC DEFAULT 0,        -- อัตราค่าเที่ยวมาตรฐาน (บาท/เที่ยว)
    start_date DATE,                        -- วันเริ่มงาน
    emergency_contact TEXT DEFAULT '-',     -- บุคคลติดต่อฉุกเฉิน + เบอร์โทร
    remark TEXT DEFAULT '-',                -- หมายเหตุ
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ตารางประวัติการครองรถ & สลับคนขับ (Assignment History Timeline)
CREATE TABLE IF NOT EXISTS public.driver_truck_history (
    id BIGSERIAL PRIMARY KEY,
    driver_name TEXT NOT NULL,              -- ชื่อคนขับ
    truck_no TEXT NOT NULL,                 -- เบอร์รถ
    action TEXT NOT NULL,                   -- 'ASSIGN', 'TRANSFER', 'UNASSIGN', 'LEAVE', 'RESIGN'
    reason TEXT DEFAULT '-',                -- รายละเอียดเหตุผล
    previous_driver TEXT DEFAULT '-',       -- คนขับเดิมก่อนหน้า (ถ้ามี)
    previous_truck TEXT DEFAULT '-',        -- รถคันเดิมก่อนหน้า (ถ้ามี)
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ตารางการดำเนินงานรถ & งวดการขับขี่ (Vehicle Operations Timeline)
CREATE TABLE IF NOT EXISTS public.truck_operations (
    id TEXT PRIMARY KEY,                   -- รหัสการดำเนินงาน เช่น op_xxx
    truck_no TEXT NOT NULL,                -- เบอร์รถ เช่น "501"
    driver_name TEXT NOT NULL,             -- ชื่อคนขับ
    start_date DATE NOT NULL,              -- วันที่เริ่มงวด
    end_date DATE,                         -- วันที่สิ้นสุด (NULL = กำลังปฏิบัติงานอยู่ Ongoing)
    status TEXT DEFAULT 'active',          -- 'active' (กำลังขับอยู่), 'completed' (สิ้นสุดงวด)
    operation_type TEXT DEFAULT 'primary', -- 'primary' (คนขับประจำ), 'substitute' (ขับแทน), 'contract' (จ๊อบพิเศษ)
    rate_per_trip NUMERIC DEFAULT 0,       -- อัตราค่าเที่ยวในงวดนี้
    remark TEXT DEFAULT '-',               -- หมายเหตุ
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Indexes เพิ่มความเร็ว Query
CREATE INDEX IF NOT EXISTS idx_truck_records_no ON public.truck_records(truck_no);
CREATE INDEX IF NOT EXISTS idx_truck_records_status ON public.truck_records(status);
CREATE INDEX IF NOT EXISTS idx_driver_records_name ON public.driver_records(driver_name);
CREATE INDEX IF NOT EXISTS idx_driver_records_truck ON public.driver_records(assigned_truck_no);
CREATE INDEX IF NOT EXISTS idx_driver_records_status ON public.driver_records(status);
CREATE INDEX IF NOT EXISTS idx_driver_truck_hist_truck ON public.driver_truck_history(truck_no);
CREATE INDEX IF NOT EXISTS idx_driver_truck_hist_driver ON public.driver_truck_history(driver_name);
CREATE INDEX IF NOT EXISTS idx_truck_ops_truck ON public.truck_operations(truck_no);
CREATE INDEX IF NOT EXISTS idx_truck_ops_driver ON public.truck_operations(driver_name);
CREATE INDEX IF NOT EXISTS idx_truck_ops_date ON public.truck_operations(start_date, end_date);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.truck_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_truck_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.truck_operations ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS Policies (Allow anon & authenticated read/write)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'truck_records' AND policyname = 'Allow anon all on truck_records') THEN
        CREATE POLICY "Allow anon all on truck_records" ON public.truck_records FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'truck_records' AND policyname = 'Allow authenticated all on truck_records') THEN
        CREATE POLICY "Allow authenticated all on truck_records" ON public.truck_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'driver_records' AND policyname = 'Allow anon all on driver_records') THEN
        CREATE POLICY "Allow anon all on driver_records" ON public.driver_records FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'driver_records' AND policyname = 'Allow authenticated all on driver_records') THEN
        CREATE POLICY "Allow authenticated all on driver_records" ON public.driver_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'driver_truck_history' AND policyname = 'Allow anon all on driver_truck_history') THEN
        CREATE POLICY "Allow anon all on driver_truck_history" ON public.driver_truck_history FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'driver_truck_history' AND policyname = 'Allow authenticated all on driver_truck_history') THEN
        CREATE POLICY "Allow authenticated all on driver_truck_history" ON public.driver_truck_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'truck_operations' AND policyname = 'Allow anon all on truck_operations') THEN
        CREATE POLICY "Allow anon all on truck_operations" ON public.truck_operations FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'truck_operations' AND policyname = 'Allow authenticated all on truck_operations') THEN
        CREATE POLICY "Allow authenticated all on truck_operations" ON public.truck_operations FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

