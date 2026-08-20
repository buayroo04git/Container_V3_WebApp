-- =========================================================================
-- 🛡️ Data Integrity & Atomic Job Sheet Transaction Migration (V3.1)
-- 
-- 1. ป้องกันการมอบหมายรถซ้ำ และคนขับซ้ำ (Partial Unique Indexes)
-- 2. สร้าง Stored Procedure สำหรับบันทึกใบงานแบบ Atomic Transaction (All-or-Nothing)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. 🚚 ป้องกัน Active ซ้ำใน truck_operations (Partial Unique Indexes)
-- -------------------------------------------------------------------------

-- รถ 1 คัน สามารถมีงวดงานที่ Active ได้เพียง 1 แถว ณ เวลาเดียวกัน
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_truck_op 
ON truck_operations (truck_no) 
WHERE status = 'active';

-- คนขับ 1 คน สามารถมีงวดงานที่ Active ได้เพียง 1 แถว ณ เวลาเดียวกัน
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_driver_op 
ON truck_operations (driver_name) 
WHERE status = 'active';


-- -------------------------------------------------------------------------
-- 2. ⚡ Stored Procedure: complete_job_sheet_rpc (Atomic Transaction)
-- บันทึกทั้งหัวใบงาน (job_sheets), รายการตู้ (job_sheet_items), 
-- ข้อมูลสำรอง (ocr_records), และอัปเดตแคช (ocr_cache) ภายใต้ Transaction เดียว 100%
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION complete_job_sheet_rpc(
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
BEGIN
  v_sheet_id := p_sheet->>'id';

  IF v_sheet_id IS NULL OR v_sheet_id = '' THEN
    RAISE EXCEPTION 'Missing sheet id';
  END IF;

  -- ถ้าเป็นการแก้ไข ให้ล้างข้อมูลเดิมออกก่อน
  IF p_is_edit THEN
    DELETE FROM job_sheet_items WHERE job_sheet_id = v_sheet_id;
    DELETE FROM job_sheets WHERE id = v_sheet_id;
    
    IF p_sheet->>'image_url' IS NOT NULL AND p_sheet->>'image_url' != '' THEN
      DELETE FROM ocr_records WHERE image_url = p_sheet->>'image_url';
    ELSE
      DELETE FROM ocr_records WHERE batch_name = p_sheet->>'batch_name' AND truck_no = p_sheet->>'truck_no';
    END IF;
  END IF;

  -- 1. บันทึกหัวใบงาน (job_sheets)
  INSERT INTO job_sheets (
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
    created_at
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
    COALESCE((p_sheet->>'created_at')::timestamptz, NOW())
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
    created_at = EXCLUDED.created_at;

  -- 2. บันทึกรายการตู้ (job_sheet_items)
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO job_sheet_items (
        job_sheet_id,
        line_no,
        container_no,
        raw_ocr_text,
        port,
        size,
        job_type,
        date_job,
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
        v_item->>'match_status',
        (v_item->>'ref_master_id')::bigint,
        COALESCE((v_item->>'created_at')::timestamptz, NOW())
      );
    END LOOP;
  END IF;

  -- 3. บันทึกข้อมูลประวัติ (ocr_records - Backward Compatibility)
  IF p_legacy_records IS NOT NULL AND jsonb_array_length(p_legacy_records) > 0 THEN
    FOR v_rec IN SELECT * FROM jsonb_array_elements(p_legacy_records)
    LOOP
      INSERT INTO ocr_records (
        batch_name,
        truck_no,
        image_url,
        container_no,
        port,
        size,
        date_job,
        match_status,
        ref_db_id,
        created_at
      ) VALUES (
        v_rec->>'batch_name',
        v_rec->>'truck_no',
        v_rec->>'image_url',
        v_rec->>'container_no',
        v_rec->>'port',
        v_rec->>'size',
        v_rec->>'date_job',
        v_rec->>'match_status',
        (v_rec->>'ref_db_id')::bigint,
        COALESCE((v_rec->>'created_at')::timestamptz, NOW())
      );
    END LOOP;
  END IF;

  -- 4. ปรับสถานะแคช (ocr_cache)
  IF p_cache_id IS NOT NULL AND p_cache_id != '' THEN
    UPDATE ocr_cache
    SET 
      model_used = 'completed',
      image_url = p_sheet->>'image_url',
      ocr_data = p_cache_update
    WHERE id = p_cache_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'sheet_id', v_sheet_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ให้สิทธิ์ anon และ authenticated เรียกใช้งาน RPC นี้ได้
GRANT EXECUTE ON FUNCTION complete_job_sheet_rpc(jsonb, jsonb, jsonb, text, jsonb, boolean) TO anon, authenticated, service_role;
