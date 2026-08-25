-- ==============================================================================
-- Migration 06: Create Canonical Database View for High-Performance Server-Side Pagination
-- Target: vw_ocr_container_history
-- Description: Unifies completed job_sheet_items, pending ocr_cache JSON rows,
--              and legacy ocr_records into a single high-performance queryable view.
-- ==============================================================================

CREATE OR REPLACE VIEW vw_ocr_container_history AS

-- 1. Completed Job Sheet Items (Primary Source)
SELECT 
    ('completed_item_' || i.id::text) AS id,
    i.id AS db_id,
    i.id AS job_sheet_item_id,
    NULL::uuid AS ocr_record_id,
    'job_sheet_items' AS source_table,
    i.job_sheet_id AS sheet_id,
    i.container_no,
    COALESCE(i.raw_ocr_text, i.container_no) AS raw_ocr_text,
    COALESCE(i.line_no::text, '-') AS line_no,
    COALESCE(i.port, '-') AS port,
    COALESCE(i.size, '-') AS size,
    COALESCE(i.job_type, '-') AS job_type,
    COALESCE(i.date_job, '-') AS date_job,
    i.date_job_parsed,
    COALESCE(i.match_status, 'matched_green') AS match_status,
    'completed' AS workflow_status,
    COALESCE(s.batch_name, 'General_Batch') AS batch_name,
    COALESCE(s.truck_no, '-') AS truck_no,
    s.image_url,
    COALESCE(s.image_name, '-') AS image_name,
    s.drive_file_id,
    COALESCE(i.created_at, s.created_at) AS created_at
FROM job_sheet_items i
LEFT JOIN job_sheets s ON i.job_sheet_id = s.id
WHERE (s.status IS NULL OR s.status != 'deleted')

UNION ALL

-- 2. Pending Cache Items (Un-nested from JSON array)
SELECT 
    ('pending_' || c.id::text || '_' || COALESCE(elem->>'line_no', elem->>'index', row_number() OVER (PARTITION BY c.id)::text)) AS id,
    c.id AS db_id,
    NULL::uuid AS job_sheet_item_id,
    NULL::uuid AS ocr_record_id,
    'ocr_cache' AS source_table,
    NULL::uuid AS sheet_id,
    COALESCE(elem->>'container_no', elem->>'clean_container_no', elem->>'originalText', elem->>'raw_text', '-') AS container_no,
    COALESCE(elem->>'raw_ocr_text', elem->>'raw_text', elem->>'container_no', '-') AS raw_ocr_text,
    COALESCE(elem->>'line_no', elem->>'index', '-')::text AS line_no,
    COALESCE(elem->>'port', '-') AS port,
    COALESCE(elem->>'size', '-') AS size,
    COALESCE(elem->>'job_type', elem->>'type', '-') AS job_type,
    COALESCE(elem->>'date_job', '-') AS date_job,
    NULL::date AS date_job_parsed,
    COALESCE(elem->>'match_status', 'pending') AS match_status,
    'pending' AS workflow_status,
    COALESCE(c.ocr_data->>'batch_guess', c.ocr_data->>'folder_name', 'Pending_Batch') AS batch_name,
    COALESCE(c.ocr_data->>'truck_no', c.ocr_data->>'truck_guess', '-') AS truck_no,
    c.ocr_data->>'image_url' AS image_url,
    COALESCE(c.image_name, c.ocr_data->>'relative_path', 'Pending_Image.jpg') AS image_name,
    c.ocr_data->>'drive_file_id' AS drive_file_id,
    c.created_at
FROM ocr_cache c,
LATERAL jsonb_array_elements(
    CASE 
        WHEN jsonb_typeof(c.ocr_data->'rows') = 'array' THEN c.ocr_data->'rows'
        WHEN jsonb_typeof(c.ocr_data->'draft_items') = 'array' THEN c.ocr_data->'draft_items'
        WHEN jsonb_typeof(c.ocr_data->'containers') = 'array' THEN c.ocr_data->'containers'
        WHEN jsonb_typeof(c.ocr_data->'matching_results') = 'array' THEN c.ocr_data->'matching_results'
        WHEN jsonb_typeof(c.ocr_data->'results') = 'array' THEN c.ocr_data->'results'
        ELSE '[]'::jsonb
    END
) AS elem
WHERE c.model_used NOT IN ('completed', 'deleted')

UNION ALL

-- 3. Legacy ocr_records (where not recorded in job_sheet_items)
SELECT 
    ('legacy_ocr_' || r.id::text) AS id,
    r.id AS db_id,
    NULL::uuid AS job_sheet_item_id,
    r.id AS ocr_record_id,
    'ocr_records' AS source_table,
    r.job_sheet_id AS sheet_id,
    r.container_no,
    COALESCE(r.raw_ocr_text, r.container_no) AS raw_ocr_text,
    '-' AS line_no,
    COALESCE(r.port, '-') AS port,
    COALESCE(r.size, '-') AS size,
    COALESCE(r.job_type, '-') AS job_type,
    COALESCE(r.date_job, '-') AS date_job,
    r.date_job_parsed,
    COALESCE(r.match_status, 'matched_green') AS match_status,
    'completed' AS workflow_status,
    COALESCE(r.batch_name, 'General_Batch') AS batch_name,
    COALESCE(r.truck_no, '-') AS truck_no,
    r.image_url,
    COALESCE(r.image_name, '-') AS image_name,
    r.drive_file_id,
    r.created_at
FROM ocr_records r
WHERE r.match_status != 'deleted'
  AND NOT EXISTS (SELECT 1 FROM job_sheet_items jsi WHERE jsi.container_no = r.container_no);
