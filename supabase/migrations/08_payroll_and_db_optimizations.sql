-- ==============================================================================
-- 🚀 Migration 08: Database-First Optimization for Driver Payroll & Container Views
-- Target: vw_completed_driver_containers, Indexes & Driver Column Guarantees
-- ==============================================================================

-- 1. ตรวจสอบคอลัมน์ driver_name ใน job_sheets และ ocr_records
ALTER TABLE public.job_sheets ADD COLUMN IF NOT EXISTS driver_name TEXT DEFAULT '-';
ALTER TABLE public.ocr_records ADD COLUMN IF NOT EXISTS driver_name TEXT DEFAULT '-';

CREATE INDEX IF NOT EXISTS idx_job_sheets_driver_name ON public.job_sheets(driver_name);
CREATE INDEX IF NOT EXISTS idx_ocr_records_driver_name ON public.ocr_records(driver_name);

-- 2. สร้าง Canonical View สำหรับดึงตู้ที่ตรวจเสร็จแล้วพร้อมข้อมูลคนขับและเรทวันที่ Master DB
CREATE OR REPLACE VIEW public.vw_completed_driver_containers AS
SELECT
    i.id AS id,
    i.id AS item_id,
    s.id AS job_sheet_id,
    COALESCE(s.batch_name, 'General_Batch') AS batch_name,
    COALESCE(s.truck_no, '-') AS truck_no,
    COALESCE(
        NULLIF(s.driver_name, '-'),
        NULLIF(s.driver_name, ''),
        (
            SELECT op.driver_name 
            FROM public.truck_operations op 
            WHERE op.truck_no = s.truck_no AND op.status = 'active' 
            ORDER BY op.created_at DESC 
            LIMIT 1
        ),
        (
            SELECT tr.assigned_driver_name 
            FROM public.truck_records tr 
            WHERE tr.truck_no = s.truck_no 
            LIMIT 1
        ),
        'ไม่ระบุคนขับ'
    ) AS driver_name,
    i.container_no,
    COALESCE(NULLIF(i.port, '-'), m.port, '-') AS port,
    COALESCE(NULLIF(m.size, '-'), NULLIF(i.size, '-'), '20') AS size,
    COALESCE(m.date_job_parsed, i.date_job_parsed, s.date_job_parsed) AS master_date_parsed,
    COALESCE(NULLIF(m.date_job, '-'), NULLIF(i.date_job, '-'), s.date_job, '-') AS master_date,
    COALESCE(s.date_job, '-') AS sheet_date,
    i.match_status,
    (m.id IS NOT NULL OR i.match_status = 'matched_green') AS is_matched,
    i.created_at
FROM public.job_sheet_items i
JOIN public.job_sheets s ON i.job_sheet_id = s.id AND (s.status IS NULL OR s.status = 'completed')
LEFT JOIN public.container_records m ON i.ref_master_id = m.id
WHERE i.match_status NOT IN ('cancelled', 'manual_red', 'unmatched_red');

-- 3. มอบสิทธิ์ให้ทุก Role เข้าถึง View ได้
GRANT SELECT ON public.vw_completed_driver_containers TO anon, authenticated, service_role;
