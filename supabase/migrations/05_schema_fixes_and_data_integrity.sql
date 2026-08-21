-- =========================================================================
-- 🛡️ SQL Blueprint V3.1: Schema Fixes, Ledger Protection & Targeting Upgrade
-- Migration: 05_schema_fixes_and_data_integrity.sql
--
-- 1. เพิ่ม date_job และ date_job_parsed ใน job_sheets พร้อม Backfill
-- 2. ปรับ ON DELETE CASCADE -> ON DELETE RESTRICT ใน truck_maintenance_records & driver_leave_records
-- 3. เพิ่ม job_sheet_id ใน ocr_records พร้อม FK ไปยัง job_sheets(id)
-- 4. อัปเกรด Stored Procedure: complete_job_sheet_rpc ให้บันทึก date_job และจัดการลบแบบตรงจุด 100%
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. 📅 เพิ่ม date_job และ date_job_parsed ใน job_sheets พร้อม Index & Backfill
-- -------------------------------------------------------------------------
ALTER TABLE public.job_sheets ADD COLUMN IF NOT EXISTS date_job TEXT DEFAULT '-';
ALTER TABLE public.job_sheets ADD COLUMN IF NOT EXISTS date_job_parsed DATE;

-- Auto Backfill date_job และ date_job_parsed จาก job_sheet_items
UPDATE public.job_sheets s
SET 
  date_job = COALESCE((
    SELECT i.date_job 
    FROM public.job_sheet_items i 
    WHERE i.job_sheet_id = s.id AND i.date_job IS NOT NULL AND i.date_job != '-' AND i.date_job != 'null'
    ORDER BY i.line_no ASC 
    LIMIT 1
  ), '-'),
  date_job_parsed = COALESCE((
    SELECT i.date_job_parsed 
    FROM public.job_sheet_items i 
    WHERE i.job_sheet_id = s.id AND i.date_job_parsed IS NOT NULL 
    ORDER BY i.line_no ASC 
    LIMIT 1
  ), (
    SELECT CASE 
      WHEN i.date_job ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(i.date_job FROM 1 FOR 10))::DATE 
      ELSE NULL 
    END
    FROM public.job_sheet_items i 
    WHERE i.job_sheet_id = s.id AND i.date_job IS NOT NULL AND i.date_job != '-'
    ORDER BY i.line_no ASC 
    LIMIT 1
  ))
WHERE s.date_job IS NULL OR s.date_job = '-' OR s.date_job_parsed IS NULL;

-- Indexes สำหรับ job_sheets date
CREATE INDEX IF NOT EXISTS idx_job_sheets_date_job ON public.job_sheets(date_job);
CREATE INDEX IF NOT EXISTS idx_job_sheets_date_parsed ON public.job_sheets(date_job_parsed);


-- -------------------------------------------------------------------------
-- 2. 🔒 ป้องกันการลบประวัติ Ledger: เปลี่ยน ON DELETE CASCADE -> ON DELETE RESTRICT
-- -------------------------------------------------------------------------
DO $$
BEGIN
    -- 2.1 truck_maintenance_records -> truck_records
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_maint_truck_no') THEN
        ALTER TABLE public.truck_maintenance_records DROP CONSTRAINT fk_maint_truck_no;
    END IF;

    ALTER TABLE public.truck_maintenance_records
        ADD CONSTRAINT fk_maint_truck_no
        FOREIGN KEY (truck_no) REFERENCES public.truck_records(truck_no)
        ON UPDATE CASCADE ON DELETE RESTRICT;

    -- 2.2 driver_leave_records -> driver_records
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_leave_driver_name') THEN
        ALTER TABLE public.driver_leave_records DROP CONSTRAINT fk_leave_driver_name;
    END IF;

    ALTER TABLE public.driver_leave_records
        ADD CONSTRAINT fk_leave_driver_name
        FOREIGN KEY (driver_name) REFERENCES public.driver_records(driver_name)
        ON UPDATE CASCADE ON DELETE RESTRICT;
END $$;


-- -------------------------------------------------------------------------
-- 3. 🎯 เพิ่ม job_sheet_id ให้ ocr_records และผูก FK Cascade
-- -------------------------------------------------------------------------
ALTER TABLE public.ocr_records ADD COLUMN IF NOT EXISTS job_sheet_id TEXT;
ALTER TABLE public.ocr_records ADD COLUMN IF NOT EXISTS date_job_parsed DATE;

-- Auto backfill date_job_parsed ใน ocr_records
UPDATE public.ocr_records
SET date_job_parsed = CASE 
    WHEN date_job ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(date_job FROM 1 FOR 10))::DATE 
    ELSE NULL 
END
WHERE date_job IS NOT NULL AND date_job != '-' AND date_job_parsed IS NULL;

CREATE INDEX IF NOT EXISTS idx_ocr_records_sheet_id ON public.ocr_records(job_sheet_id);
CREATE INDEX IF NOT EXISTS idx_ocr_records_date_parsed ON public.ocr_records(date_job_parsed);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ocr_records_sheet') THEN
        ALTER TABLE public.ocr_records
            ADD CONSTRAINT fk_ocr_records_sheet
            FOREIGN KEY (job_sheet_id) REFERENCES public.job_sheets(id)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;


-- -------------------------------------------------------------------------
-- 4. ⚡ อัปเกรด Stored Procedure: complete_job_sheet_rpc (Atomic & Accurate)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_job_sheet_rpc(
  p_sheet jsonb,
  p_items jsonb,
  p_legacy_records jsonb,
  p_cache_id text,
  p_cache_update jsonb,
  p_is_edit boolean DEFAULT false
) RETURNS jsonb AS $$
DECLARE
  v_sheet_id text;
  v_item jsonb;
  v_rec jsonb;
  v_sheet_date text;
  v_sheet_date_parsed date;
BEGIN
  v_sheet_id := p_sheet->>'id';

  IF v_sheet_id IS NULL OR v_sheet_id = '' THEN
    RAISE EXCEPTION 'Missing sheet id';
  END IF;

  -- สกัดวันที่สำหรับหัวใบงาน
  v_sheet_date := COALESCE(p_sheet->>'date_job', '-');
  IF (p_sheet->>'date_job_parsed') ~ '^\d{4}-\d{2}-\d{2}' THEN
    v_sheet_date_parsed := (p_sheet->>'date_job_parsed')::DATE;
  ELSIF v_sheet_date ~ '^\d{4}-\d{2}-\d{2}' THEN
    v_sheet_date_parsed := (SUBSTRING(v_sheet_date FROM 1 FOR 10))::DATE;
  ELSE
    v_sheet_date_parsed := NULL;
  END IF;

  -- ถ้าเป็นการแก้ไข ให้ล้างข้อมูลเดิมของใบงานนี้ออกก่อนอย่างแม่นยำ (Target by job_sheet_id)
  IF p_is_edit THEN
    DELETE FROM public.job_sheet_items WHERE job_sheet_id = v_sheet_id;
    DELETE FROM public.ocr_records WHERE job_sheet_id = v_sheet_id;
    
    -- เผื่อกรณี legacy record เดิมไม่มี job_sheet_id แต่มี image_url
    IF p_sheet->>'image_url' IS NOT NULL AND p_sheet->>'image_url' != '' THEN
      DELETE FROM public.ocr_records WHERE image_url = p_sheet->>'image_url' AND job_sheet_id IS NULL;
    END IF;

    DELETE FROM public.job_sheets WHERE id = v_sheet_id;
  END IF;

  -- 1. บันทึกหัวใบงาน (job_sheets)
  INSERT INTO public.job_sheets (
    id,
    batch_name,
    truck_no,
    image_url,
    image_name,
    drive_file_id,
    total_containers,
    matched_count,
    unmatched_count,
    status,
    date_job,
    date_job_parsed,
    created_at,
    updated_at
  ) VALUES (
    v_sheet_id,
    p_sheet->>'batch_name',
    p_sheet->>'truck_no',
    p_sheet->>'image_url',
    p_sheet->>'image_name',
    p_sheet->>'drive_file_id',
    COALESCE((p_sheet->>'total_containers')::int, 0),
    COALESCE((p_sheet->>'matched_count')::int, 0),
    COALESCE((p_sheet->>'unmatched_count')::int, 0),
    COALESCE(p_sheet->>'status', 'completed'),
    v_sheet_date,
    v_sheet_date_parsed,
    COALESCE((p_sheet->>'created_at')::timestamptz, NOW()),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    batch_name = EXCLUDED.batch_name,
    truck_no = EXCLUDED.truck_no,
    image_url = EXCLUDED.image_url,
    image_name = EXCLUDED.image_name,
    drive_file_id = EXCLUDED.drive_file_id,
    total_containers = EXCLUDED.total_containers,
    matched_count = EXCLUDED.matched_count,
    unmatched_count = EXCLUDED.unmatched_count,
    status = EXCLUDED.status,
    date_job = EXCLUDED.date_job,
    date_job_parsed = EXCLUDED.date_job_parsed,
    updated_at = NOW();

  -- 2. บันทึกรายการตู้ (job_sheet_items)
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.job_sheet_items (
        job_sheet_id,
        line_no,
        container_no,
        raw_ocr_text,
        port,
        size,
        job_type,
        date_job,
        date_job_parsed,
        match_status,
        ref_master_id,
        created_at
      ) VALUES (
        v_sheet_id,
        (v_item->>'line_no')::int,
        v_item->>'container_no',
        v_item->>'raw_ocr_text',
        v_item->>'port',
        v_item->>'size',
        v_item->>'job_type',
        v_item->>'date_job',
        CASE 
          WHEN (v_item->>'date_job_parsed') ~ '^\d{4}-\d{2}-\d{2}' THEN (v_item->>'date_job_parsed')::DATE
          WHEN (v_item->>'date_job') ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(v_item->>'date_job' FROM 1 FOR 10))::DATE 
          ELSE NULL 
        END,
        v_item->>'match_status',
        (v_item->>'ref_master_id')::bigint,
        COALESCE((v_item->>'created_at')::timestamptz, NOW())
      );
    END LOOP;
  END IF;

  -- 3. บันทึกข้อมูลประวัติ (ocr_records - พร้อมระบุ job_sheet_id)
  IF p_legacy_records IS NOT NULL AND jsonb_array_length(p_legacy_records) > 0 THEN
    FOR v_rec IN SELECT * FROM jsonb_array_elements(p_legacy_records)
    LOOP
      INSERT INTO public.ocr_records (
        job_sheet_id,
        batch_name,
        truck_no,
        image_url,
        container_no,
        port,
        size,
        date_job,
        date_job_parsed,
        match_status,
        ref_db_id,
        created_at
      ) VALUES (
        v_sheet_id,
        v_rec->>'batch_name',
        v_rec->>'truck_no',
        v_rec->>'image_url',
        v_rec->>'container_no',
        v_rec->>'port',
        v_rec->>'size',
        v_rec->>'date_job',
        CASE 
          WHEN (v_rec->>'date_job_parsed') ~ '^\d{4}-\d{2}-\d{2}' THEN (v_rec->>'date_job_parsed')::DATE
          WHEN (v_rec->>'date_job') ~ '^\d{4}-\d{2}-\d{2}' THEN (SUBSTRING(v_rec->>'date_job' FROM 1 FOR 10))::DATE 
          ELSE NULL 
        END,
        v_rec->>'match_status',
        (v_rec->>'ref_db_id')::bigint,
        COALESCE((v_rec->>'created_at')::timestamptz, NOW())
      );
    END LOOP;
  END IF;

  -- 4. ปรับสถานะแคช (ocr_cache)
  IF p_cache_id IS NOT NULL AND p_cache_id != '' THEN
    UPDATE public.ocr_cache
    SET 
      model_used = 'completed',
      image_url = p_sheet->>'image_url',
      ocr_data = p_cache_update,
      updated_at = NOW()
    WHERE id = p_cache_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'sheet_id', v_sheet_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.complete_job_sheet_rpc(jsonb, jsonb, jsonb, text, jsonb, boolean) TO anon, authenticated, service_role;
