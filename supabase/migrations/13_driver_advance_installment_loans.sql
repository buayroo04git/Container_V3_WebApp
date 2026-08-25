-- =========================================================================
-- Migration 13: Add Installment Loan Support to driver_advances
-- =========================================================================

-- 1. Alter driver_advances table to support installment loans and categories
ALTER TABLE IF EXISTS driver_advances
  ADD COLUMN IF NOT EXISTS category VARCHAR(30) DEFAULT 'single_advance',
  ADD COLUMN IF NOT EXISTS installments_total INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS installments_paid INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS installment_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_period VARCHAR(10) DEFAULT '';

COMMENT ON COLUMN driver_advances.category IS 'รูปแบบ: single_advance (เบิกล่วงหน้างวดเดียว), installment_loan (ยืมเงินก้อนผ่อนชำระ)';
COMMENT ON COLUMN driver_advances.installments_total IS 'จำนวนงวดผ่อนชำระทั้งหมด';
COMMENT ON COLUMN driver_advances.installments_paid IS 'จำนวนงวดที่หักชำระไปแล้ว';
COMMENT ON COLUMN driver_advances.installment_amount IS 'ยอดหักชำระต่องวด (บาท)';
COMMENT ON COLUMN driver_advances.remaining_amount IS 'ยอดหนี้เงินยืมคงเหลือ (บาท)';
COMMENT ON COLUMN driver_advances.start_period IS 'งวดเดือนที่เริ่มหักชำระ (YYYY-MM)';

-- 2. Create index on category and start_period for fast filtering
CREATE INDEX IF NOT EXISTS idx_driver_advances_category ON driver_advances(category);
CREATE INDEX IF NOT EXISTS idx_driver_advances_start_period ON driver_advances(start_period);
