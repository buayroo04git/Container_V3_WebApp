-- =========================================================================
-- Migration 11: Driver Salary, Tax Profiles, and Advance Withdrawals
-- =========================================================================

-- 1. Alter driver_records to include base_salary, tax_profile, social_security_amount
ALTER TABLE IF EXISTS driver_records 
  ADD COLUMN IF NOT EXISTS base_salary NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_profile VARCHAR(30) DEFAULT 'social_security',
  ADD COLUMN IF NOT EXISTS social_security_amount NUMERIC DEFAULT 875;

COMMENT ON COLUMN driver_records.base_salary IS 'ฐานเงินเดือนประจำ (บาท)';
COMMENT ON COLUMN driver_records.tax_profile IS 'รูปแบบการหักเงิน: social_security (ประกันสังคม), withholding_3pct (หัก 3%), none (ไม่หัก)';
COMMENT ON COLUMN driver_records.social_security_amount IS 'ยอดหักประกันสังคมต่อเดือน (บาท)';

-- 2. Create driver_advances table for recording advance withdrawals
CREATE TABLE IF NOT EXISTS driver_advances (
  id VARCHAR(64) PRIMARY KEY,
  advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  driver_id VARCHAR(64),
  driver_name VARCHAR(100) NOT NULL,
  assigned_truck_no VARCHAR(50) DEFAULT '-',
  batch_name VARCHAR(100) DEFAULT '-',
  amount NUMERIC NOT NULL DEFAULT 0,
  advance_type VARCHAR(50) DEFAULT 'trip_advance',
  status VARCHAR(30) DEFAULT 'pending',
  settlement_batch_id VARCHAR(64),
  payment_method VARCHAR(30) DEFAULT 'transfer',
  slip_url TEXT DEFAULT '-',
  remark TEXT DEFAULT '-',
  created_by VARCHAR(100) DEFAULT 'System',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for fast search and aggregation
CREATE INDEX IF NOT EXISTS idx_driver_advances_date ON driver_advances(advance_date);
CREATE INDEX IF NOT EXISTS idx_driver_advances_driver ON driver_advances(driver_name);
CREATE INDEX IF NOT EXISTS idx_driver_advances_status ON driver_advances(status);
CREATE INDEX IF NOT EXISTS idx_driver_advances_batch ON driver_advances(batch_name);

-- 3. Alter payroll_payment_batches and payroll_settlement_items if existing
ALTER TABLE IF EXISTS payroll_payment_batches
  ADD COLUMN IF NOT EXISTS total_base_salary NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_sso_deductions NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_wht_deductions NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_advance_deductions NUMERIC DEFAULT 0;

ALTER TABLE IF EXISTS payroll_settlement_items
  ADD COLUMN IF NOT EXISTS base_salary NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_profile VARCHAR(30) DEFAULT 'social_security',
  ADD COLUMN IF NOT EXISTS sso_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wht_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_amount NUMERIC DEFAULT 0;

-- 4. Enable RLS and create open policies
ALTER TABLE driver_advances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access on driver_advances" ON driver_advances;
CREATE POLICY "Allow public read access on driver_advances"
  ON driver_advances FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow public insert access on driver_advances" ON driver_advances;
CREATE POLICY "Allow public insert access on driver_advances"
  ON driver_advances FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update access on driver_advances" ON driver_advances;
CREATE POLICY "Allow public update access on driver_advances"
  ON driver_advances FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "Allow public delete access on driver_advances" ON driver_advances;
CREATE POLICY "Allow public delete access on driver_advances"
  ON driver_advances FOR DELETE
  USING (true);
