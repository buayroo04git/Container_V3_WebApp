-- =========================================================================
-- 📦 SQL Blueprint V3.1: OCR & Master Container Module Schema
-- 
-- รวบรวม DDL เริ่มต้นสำหรับโครงสร้างกลุ่ม OCR / Master Container ทั้งหมด
-- สามารถนำไฟล์นี้ไปรันเพื่อ Spin-up หรือ Restore ฐานข้อมูลใหม่ได้ 100%
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. 📋 ตาราง Master DB ใบวางบิล (container_records)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.container_records (
    id BIGSERIAL PRIMARY KEY,
    container_no TEXT NOT NULL,
    truck_no TEXT DEFAULT '-',
    dis_load TEXT DEFAULT '-',
    size TEXT DEFAULT '-',
    date_eta TEXT DEFAULT '-',
    vessel TEXT DEFAULT '-',
    port TEXT DEFAULT '-',
    time_work TEXT DEFAULT '-',
    date_job TEXT DEFAULT '-',
    planner TEXT DEFAULT '-',
    out_yard TEXT DEFAULT '-',
    at_gate_port TEXT DEFAULT '-',
    at_front_port TEXT DEFAULT '-',
    time_lift TEXT DEFAULT '-',
    at_gate_dg TEXT DEFAULT '-',
    time_drop TEXT DEFAULT '-',
    at_yard TEXT DEFAULT '-',
    total_time_dis TEXT DEFAULT '-',
    out_yard_2 TEXT DEFAULT '-',
    at_gate_dg_2 TEXT DEFAULT '-',
    time_up_tail TEXT DEFAULT '-',
    out_gate_dg TEXT DEFAULT '-',
    at_gate_port_2 TEXT DEFAULT '-',
    time_up_ship TEXT DEFAULT '-',
    at_yard_3 TEXT DEFAULT '-',
    total_time_load TEXT DEFAULT '-',
    truck_license TEXT DEFAULT '-',
    truck_type TEXT DEFAULT '-',
    truck_kind TEXT DEFAULT '-',
    remark TEXT DEFAULT '-',
    batch_name TEXT DEFAULT 'General_Batch',
    source_file TEXT DEFAULT '-',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes สำหรับ container_records
CREATE INDEX IF NOT EXISTS idx_master_container_no ON public.container_records(container_no);
CREATE INDEX IF NOT EXISTS idx_master_truck_no ON public.container_records(truck_no);
CREATE INDEX IF NOT EXISTS idx_master_batch_name ON public.container_records(batch_name);
CREATE INDEX IF NOT EXISTS idx_master_date_job ON public.container_records(date_job);


-- -------------------------------------------------------------------------
-- 2. 📄 ตารางหัวเอกสารใบงานตรวจเสร็จ (job_sheets)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_sheets (
    id TEXT PRIMARY KEY,
    batch_name TEXT DEFAULT 'General_Batch',
    truck_no TEXT NOT NULL,
    image_url TEXT,
    image_name TEXT,
    drive_file_id TEXT,
    total_containers INT DEFAULT 0,
    matched_count INT DEFAULT 0,
    unmatched_count INT DEFAULT 0,
    status TEXT DEFAULT 'completed',           -- 'completed', 'draft', 'deleted'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes สำหรับ job_sheets
CREATE INDEX IF NOT EXISTS idx_job_sheets_truck_no ON public.job_sheets(truck_no);
CREATE INDEX IF NOT EXISTS idx_job_sheets_batch_name ON public.job_sheets(batch_name);
CREATE INDEX IF NOT EXISTS idx_job_sheets_status ON public.job_sheets(status);
CREATE INDEX IF NOT EXISTS idx_job_sheets_created_at ON public.job_sheets(created_at DESC);


-- -------------------------------------------------------------------------
-- 3. 📦 ตารางรายการตู้ในใบงาน (job_sheet_items - Detail Items 25 แถว)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_sheet_items (
    id BIGSERIAL PRIMARY KEY,
    job_sheet_id TEXT NOT NULL,
    line_no INT DEFAULT 1,
    container_no TEXT NOT NULL,
    raw_ocr_text TEXT,
    port TEXT DEFAULT '-',
    size TEXT DEFAULT '-',
    job_type TEXT DEFAULT '-',
    date_job TEXT DEFAULT '-',
    match_status TEXT DEFAULT 'matched_green',  -- 'matched_green', 'manual_red', 'duplicate_auto', 'cancelled'
    ref_master_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes สำหรับ job_sheet_items
CREATE INDEX IF NOT EXISTS idx_js_items_container_no ON public.job_sheet_items(container_no);
CREATE INDEX IF NOT EXISTS idx_js_items_sheet_id ON public.job_sheet_items(job_sheet_id);
CREATE INDEX IF NOT EXISTS idx_js_items_match_status ON public.job_sheet_items(match_status);
CREATE INDEX IF NOT EXISTS idx_js_items_ref_master_id ON public.job_sheet_items(ref_master_id);
CREATE INDEX IF NOT EXISTS idx_js_items_date_job ON public.job_sheet_items(date_job);


-- -------------------------------------------------------------------------
-- 4. ⏳ ตารางแคชคิวตรวจ OCR และรูปภาพชั่วคราว (ocr_cache)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ocr_cache (
    id TEXT PRIMARY KEY,
    image_name TEXT,
    model_used TEXT DEFAULT 'gemini-3.1-flash-lite',
    image_url TEXT,
    ocr_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- เพิ่ม image_name เผื่อกรณีตารางมีอยู่เดิมแล้ว
ALTER TABLE public.ocr_cache ADD COLUMN IF NOT EXISTS image_name TEXT;

-- Indexes สำหรับ ocr_cache
CREATE INDEX IF NOT EXISTS idx_ocr_cache_model_used ON public.ocr_cache(model_used);
CREATE INDEX IF NOT EXISTS idx_ocr_cache_created_at ON public.ocr_cache(created_at DESC);


-- -------------------------------------------------------------------------
-- 5. 🗄️ ตารางสำรองประวัติ OCR เดิม (ocr_records - Backward Compatibility)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ocr_records (
    id BIGSERIAL PRIMARY KEY,
    batch_name TEXT DEFAULT 'General_Batch',
    truck_no TEXT DEFAULT '-',
    image_url TEXT,
    container_no TEXT NOT NULL,
    port TEXT DEFAULT '-',
    size TEXT DEFAULT '-',
    date_job TEXT DEFAULT '-',
    match_status TEXT DEFAULT 'matched_green',
    ref_db_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes สำหรับ ocr_records
CREATE INDEX IF NOT EXISTS idx_ocr_records_cno ON public.ocr_records(container_no);
CREATE INDEX IF NOT EXISTS idx_ocr_records_truck ON public.ocr_records(truck_no);
CREATE INDEX IF NOT EXISTS idx_ocr_records_batch ON public.ocr_records(batch_name);
CREATE INDEX IF NOT EXISTS idx_ocr_records_date ON public.ocr_records(date_job);


-- -------------------------------------------------------------------------
-- 6. 🏷️ ตารางการตั้งชื่อ Alias ของหัวคอลัมน์ (column_aliases)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.column_aliases (
    id BIGSERIAL PRIMARY KEY,
    original_name TEXT UNIQUE NOT NULL,
    alias_name TEXT NOT NULL,
    column_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 7. 🛡️ เปิดใช้งาน RLS และ Idempotent Policies
-- -------------------------------------------------------------------------
ALTER TABLE public.container_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_sheet_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.column_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all on container_records" ON public.container_records;
CREATE POLICY "Allow anon all on container_records" ON public.container_records FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth all on container_records" ON public.container_records;
CREATE POLICY "Allow auth all on container_records" ON public.container_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on job_sheets" ON public.job_sheets;
CREATE POLICY "Allow anon all on job_sheets" ON public.job_sheets FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth all on job_sheets" ON public.job_sheets;
CREATE POLICY "Allow auth all on job_sheets" ON public.job_sheets FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on job_sheet_items" ON public.job_sheet_items;
CREATE POLICY "Allow anon all on job_sheet_items" ON public.job_sheet_items FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth all on job_sheet_items" ON public.job_sheet_items;
CREATE POLICY "Allow auth all on job_sheet_items" ON public.job_sheet_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on ocr_cache" ON public.ocr_cache;
CREATE POLICY "Allow anon all on ocr_cache" ON public.ocr_cache FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth all on ocr_cache" ON public.ocr_cache;
CREATE POLICY "Allow auth all on ocr_cache" ON public.ocr_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on ocr_records" ON public.ocr_records;
CREATE POLICY "Allow anon all on ocr_records" ON public.ocr_records FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth all on ocr_records" ON public.ocr_records;
CREATE POLICY "Allow auth all on ocr_records" ON public.ocr_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on column_aliases" ON public.column_aliases;
CREATE POLICY "Allow anon all on column_aliases" ON public.column_aliases FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow auth all on column_aliases" ON public.column_aliases;
CREATE POLICY "Allow auth all on column_aliases" ON public.column_aliases FOR ALL TO authenticated USING (true) WITH CHECK (true);
