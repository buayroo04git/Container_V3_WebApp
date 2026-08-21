-- =========================================================================
-- 🛡️ SQL Blueprint V3.1: Data Integrity & Atomic Transactions (Stored Procedures)
-- 
-- 1. Preflight Cleanup & Partial Unique Indexes ป้องกันครองรถ/คนขับซ้ำ
-- 2. Stored Procedure: complete_job_sheet_rpc (Atomic Job Sheet Complete)
-- 3. Stored Procedure: assign_driver_to_truck_rpc (Atomic Driver Assignment)
-- 4. Stored Procedure: unassign_driver_truck_rpc (Atomic Driver Unassignment)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. 🚚 Preflight Cleanup & Partial Unique Indexes บน truck_operations
-- -------------------------------------------------------------------------

-- 🧹 1.1 Preflight Cleanup: หากมี active ซ้ำเดิมในฐาน ให้ปรับแถวที่เก่ากว่าเป็น completed ทันทีเพื่อกัน Error
DO $$
BEGIN
    WITH ranked_truck_ops AS (
        SELECT id, ROW_NUMBER() OVER(PARTITION BY truck_no ORDER BY created_at DESC, start_date DESC) as rn
        FROM public.truck_operations
        WHERE status = 'active'
    )
    UPDATE public.truck_operations
    SET status = 'completed', end_date = COALESCE(end_date, CURRENT_DATE), updated_at = NOW()
    WHERE id IN (SELECT id FROM ranked_truck_ops WHERE rn > 1);

    WITH ranked_driver_ops AS (
        SELECT id, ROW_NUMBER() OVER(PARTITION BY driver_name ORDER BY created_at DESC, start_date DESC) as rn
        FROM public.truck_operations
        WHERE status = 'active'
    )
    UPDATE public.truck_operations
    SET status = 'completed', end_date = COALESCE(end_date, CURRENT_DATE), updated_at = NOW()
    WHERE id IN (SELECT id FROM ranked_driver_ops WHERE rn > 1);
END $$;

-- 🛡️ 1.2 Partial Unique Indexes: บังคับระดับ DB ห้ามมี Active ซ้ำเด็ดขาด
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_truck_op 
ON public.truck_operations (truck_no) 
WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_driver_op 
ON public.truck_operations (driver_name) 
WHERE status = 'active';


-- -------------------------------------------------------------------------
-- 2. ⚡ Stored Procedure: complete_job_sheet_rpc (Atomic Job Sheet Complete)
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

  -- ถ้าเป็นการแก้ไข ให้ล้างข้อมูลเดิมออกก่อนอย่างแม่นยำ (Target by job_sheet_id)
  IF p_is_edit THEN
    DELETE FROM public.job_sheet_items WHERE job_sheet_id = v_sheet_id;
    DELETE FROM public.ocr_records WHERE job_sheet_id = v_sheet_id;
    
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

  -- 3. บันทึกข้อมูลประวัติ (ocr_records - Backward Compatibility & Accurate Targeting)
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


-- -------------------------------------------------------------------------
-- 3. 🚚 Stored Procedure: assign_driver_to_truck_rpc (Atomic Fleet Assignment)
-- -------------------------------------------------------------------------
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
    -- ค้นหาข้อมูลเดิม
    SELECT assigned_driver_name, truck_license INTO v_old_driver_on_truck, v_truck_license
    FROM public.truck_records WHERE truck_no = p_truck_no;

    SELECT assigned_truck_no INTO v_old_truck_of_driver
    FROM public.driver_records WHERE driver_name = p_driver_name;

    -- ปลดคนขับเดิม (ถ้ามี)
    IF v_old_driver_on_truck IS NOT NULL AND v_old_driver_on_truck != '-' AND v_old_driver_on_truck != p_driver_name THEN
        UPDATE public.driver_records SET assigned_truck_no = '-', updated_at = NOW() WHERE driver_name = v_old_driver_on_truck;
        UPDATE public.truck_operations SET end_date = p_start_date, status = 'completed', updated_at = NOW() WHERE truck_no = p_truck_no AND (end_date IS NULL OR status = 'active');
        INSERT INTO public.driver_truck_history (
            driver_name, truck_no, action, reason, effective_date, truck_license, created_by, timestamp
        ) VALUES (
            v_old_driver_on_truck, p_truck_no, 'UNASSIGN', 'ปลดออกเนื่องจากมอบหมายคนขับใหม่ (' || p_driver_name || ')', p_start_date, COALESCE(v_truck_license, '-'), p_created_by, NOW()
        );
    END IF;

    -- ปลดรถเดิมของคนขับใหม่ (ถ้ามี)
    IF v_old_truck_of_driver IS NOT NULL AND v_old_truck_of_driver != '-' AND v_old_truck_of_driver != p_truck_no THEN
        UPDATE public.truck_records SET assigned_driver_name = '-', updated_at = NOW() WHERE truck_no = v_old_truck_of_driver;
        UPDATE public.truck_operations SET end_date = p_start_date, status = 'completed', updated_at = NOW() WHERE truck_no = v_old_truck_of_driver AND (end_date IS NULL OR status = 'active');
        INSERT INTO public.driver_truck_history (
            driver_name, truck_no, action, reason, previous_truck, effective_date, truck_license, created_by, timestamp
        ) VALUES (
            p_driver_name, v_old_truck_of_driver, 'TRANSFER', 'ย้ายจากรถ ' || v_old_truck_of_driver || ' ไปรถ ' || p_truck_no, v_old_truck_of_driver, p_start_date, COALESCE(v_truck_license, '-'), p_created_by, NOW()
        );
    END IF;

    -- 🛡️ ปิด active operations เดิมทั้งหมดของรถคันนี้และคนขับคนนี้ (Source of Truth)
    UPDATE public.truck_operations 
    SET end_date = p_start_date, status = 'completed', updated_at = NOW() 
    WHERE truck_no = p_truck_no AND (end_date IS NULL OR status = 'active');

    UPDATE public.truck_operations 
    SET end_date = p_start_date, status = 'completed', updated_at = NOW() 
    WHERE driver_name = p_driver_name AND (end_date IS NULL OR status = 'active');

    -- ผูกคนขับใหม่เข้ากับรถใหม่ใน Master Records
    UPDATE public.truck_records SET assigned_driver_name = p_driver_name, updated_at = NOW() WHERE truck_no = p_truck_no;
    UPDATE public.driver_records SET assigned_truck_no = p_truck_no, status = 'active', updated_at = NOW() WHERE driver_name = p_driver_name;

    -- สร้างงวดการดำเนินงานใหม่
    v_new_op_id := 'op_' || EXTRACT(EPOCH FROM NOW())::BIGINT || '_' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6);
    INSERT INTO public.truck_operations (id, truck_no, driver_name, start_date, end_date, status, operation_type, rate_per_trip, remark, created_at, updated_at)
    VALUES (v_new_op_id, p_truck_no, p_driver_name, p_start_date, NULL, 'active', p_operation_type, 0, p_remark, NOW(), NOW());

    -- บันทึกประวัติพร้อม Audit Trail
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


-- -------------------------------------------------------------------------
-- 4. 🚚 Stored Procedure: unassign_driver_truck_rpc (Atomic Fleet Unassignment)
-- -------------------------------------------------------------------------
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
        UPDATE public.truck_operations SET end_date = p_end_date, status = 'completed', updated_at = NOW() 
        WHERE truck_no = p_truck_no AND (end_date IS NULL OR status = 'active');
    END IF;

    IF p_driver_name IS NOT NULL AND p_driver_name != '-' THEN
        UPDATE public.driver_records SET assigned_truck_no = '-', updated_at = NOW() WHERE driver_name = p_driver_name;
        UPDATE public.truck_operations SET end_date = p_end_date, status = 'completed', updated_at = NOW() 
        WHERE driver_name = p_driver_name AND (end_date IS NULL OR status = 'active');
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


-- -------------------------------------------------------------------------
-- 5. 🔑 Permissions
-- -------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.complete_job_sheet_rpc(jsonb, jsonb, jsonb, text, jsonb, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_driver_to_truck_rpc(text, text, date, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unassign_driver_truck_rpc(text, text, date, text, text) TO anon, authenticated, service_role;
