-- ==============================================================================
-- 💰 Migration 09: Driver Payroll Payment Settlement Engine
-- Target: Payment Status on job_sheet_items, driver_payment_batches Table & RPCs
-- ==============================================================================

-- 1. เพิ่มคอลัมน์การจ่ายเงินใน job_sheet_items
ALTER TABLE public.job_sheet_items 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';

ALTER TABLE public.job_sheet_items 
ADD COLUMN IF NOT EXISTS payment_batch_id TEXT;

ALTER TABLE public.job_sheet_items 
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE public.job_sheet_items 
ADD COLUMN IF NOT EXISTS paid_by TEXT DEFAULT '-';

-- Check constraint บน payment_status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_js_items_payment_status') THEN
        ALTER TABLE public.job_sheet_items
        ADD CONSTRAINT chk_js_items_payment_status
        CHECK (payment_status IN ('unpaid', 'paid', 'hold', 'cancelled'));
    END IF;
END $$;

-- Indexes สำหรับการสืบค้นสถานะการจ่ายเงินความเร็วสูง
CREATE INDEX IF NOT EXISTS idx_js_items_payment_status ON public.job_sheet_items(payment_status);
CREATE INDEX IF NOT EXISTS idx_js_items_payment_batch ON public.job_sheet_items(payment_batch_id);

-- 2. สร้างตารางบันทึกประวัติการตัดจ่ายเงิน (driver_payment_batches)
CREATE TABLE IF NOT EXISTS public.driver_payment_batches (
    id TEXT PRIMARY KEY,
    batch_no TEXT NOT NULL,
    driver_name TEXT NOT NULL,
    period_start DATE,
    period_end DATE,
    total_containers INT DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'paid',           -- 'paid', 'cancelled'
    note TEXT DEFAULT '-',
    item_ids JSONB DEFAULT '[]'::jsonb,
    paid_by TEXT DEFAULT 'Admin',
    paid_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Check constraint บน status ของ driver_payment_batches
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pay_batch_status') THEN
        ALTER TABLE public.driver_payment_batches
        ADD CONSTRAINT chk_pay_batch_status
        CHECK (status IN ('paid', 'cancelled', 'draft'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pay_batches_driver ON public.driver_payment_batches(driver_name);
CREATE INDEX IF NOT EXISTS idx_pay_batches_date ON public.driver_payment_batches(paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_pay_batches_status ON public.driver_payment_batches(status);

-- Enable RLS
ALTER TABLE public.driver_payment_batches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'driver_payment_batches' AND policyname = 'Allow public all driver_payment_batches') THEN
        CREATE POLICY "Allow public all driver_payment_batches" ON public.driver_payment_batches FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 3. อัปเดต Canonical View: vw_completed_driver_containers ให้รวมข้อมูล payment_status
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
    COALESCE(i.payment_status, 'unpaid') AS payment_status,
    i.payment_batch_id,
    i.paid_at,
    COALESCE(i.paid_by, '-') AS paid_by,
    i.created_at
FROM public.job_sheet_items i
JOIN public.job_sheets s ON i.job_sheet_id = s.id AND (s.status IS NULL OR s.status = 'completed')
LEFT JOIN public.container_records m ON i.ref_master_id = m.id
WHERE i.match_status NOT IN ('cancelled', 'manual_red', 'unmatched_red');

GRANT SELECT ON public.vw_completed_driver_containers TO anon, authenticated, service_role;

-- 4. ⚡ Stored Procedure: mark_driver_containers_paid_rpc (Atomic Settlement)
CREATE OR REPLACE FUNCTION public.mark_driver_containers_paid_rpc(
    p_driver_name TEXT,
    p_item_ids JSONB,
    p_period_start DATE DEFAULT NULL,
    p_period_end DATE DEFAULT NULL,
    p_total_amount NUMERIC DEFAULT 0,
    p_note TEXT DEFAULT '-',
    p_paid_by TEXT DEFAULT 'Admin'
) RETURNS JSONB AS $$
DECLARE
    v_batch_id TEXT;
    v_batch_no TEXT;
    v_item_count INT;
    v_id_bigint BIGINT;
    v_elem JSONB;
BEGIN
    IF p_driver_name IS NULL OR p_driver_name = '' THEN
        RAISE EXCEPTION 'Driver name is required';
    END IF;

    IF p_item_ids IS NULL OR jsonb_array_length(p_item_ids) = 0 THEN
        RAISE EXCEPTION 'Item IDs list cannot be empty';
    END IF;

    v_item_count := jsonb_array_length(p_item_ids);
    v_batch_id := 'PAY_' || TO_CHAR(NOW(), 'YYYYMMDD_HH24MISS') || '_' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6);
    v_batch_no := 'PV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4);

    -- 1. อัปเดตรายการตู้ที่ระบุเป็น 'paid' พร้อมผูก batch id
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_item_ids)
    LOOP
        v_id_bigint := (v_elem)::text::bigint;
        UPDATE public.job_sheet_items
        SET 
            payment_status = 'paid',
            payment_batch_id = v_batch_id,
            paid_at = NOW(),
            paid_by = p_paid_by
        WHERE id = v_id_bigint;
    END LOOP;

    -- 2. บันทึกลงตารางประวัติ driver_payment_batches
    INSERT INTO public.driver_payment_batches (
        id,
        batch_no,
        driver_name,
        period_start,
        period_end,
        total_containers,
        total_amount,
        status,
        note,
        item_ids,
        paid_by,
        paid_at,
        created_at,
        updated_at
    ) VALUES (
        v_batch_id,
        v_batch_no,
        p_driver_name,
        p_period_start,
        p_period_end,
        v_item_count,
        p_total_amount,
        'paid',
        p_note,
        p_item_ids,
        p_paid_by,
        NOW(),
        NOW(),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'batch_id', v_batch_id,
        'batch_no', v_batch_no,
        'driver_name', p_driver_name,
        'total_containers', v_item_count,
        'total_amount', p_total_amount
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. ⚡ Stored Procedure: cancel_driver_payment_batch_rpc (Rollback Settlement)
CREATE OR REPLACE FUNCTION public.cancel_driver_payment_batch_rpc(
    p_batch_id TEXT,
    p_cancelled_by TEXT DEFAULT 'Admin',
    p_reason TEXT DEFAULT 'ยกเลิกการตัดจ่าย'
) RETURNS JSONB AS $$
DECLARE
    v_batch RECORD;
BEGIN
    SELECT * INTO v_batch FROM public.driver_payment_batches WHERE id = p_batch_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment batch not found: %', p_batch_id;
    END IF;

    IF v_batch.status = 'cancelled' THEN
        RAISE EXCEPTION 'Payment batch is already cancelled';
    END IF;

    -- 1. ปรับรายการตู้ในงวดนี้กลับเป็น 'unpaid'
    UPDATE public.job_sheet_items
    SET 
        payment_status = 'unpaid',
        payment_batch_id = NULL,
        paid_at = NULL,
        paid_by = '-'
    WHERE payment_batch_id = p_batch_id;

    -- 2. ปรับสถานะ batch เป็น 'cancelled'
    UPDATE public.driver_payment_batches
    SET 
        status = 'cancelled',
        note = note || ' [ยกเลิกโดย ' || p_cancelled_by || ': ' || p_reason || ' เมื่อ ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') || ']',
        updated_at = NOW()
    WHERE id = p_batch_id;

    RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.mark_driver_containers_paid_rpc(TEXT, JSONB, DATE, DATE, NUMERIC, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_driver_payment_batch_rpc(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
