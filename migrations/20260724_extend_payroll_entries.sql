-- Phase 2: extend payroll_entries to hold everything the weekly Payroll Summary
-- CSV carries, so one import populates both the weekly bonus (hours) and the crew
-- Payroll cards (actual pay + total comp). Table is empty today, so this is purely
-- additive. Existing columns keep their meaning:
--   hourly_rate = Standard Rate, tip = Tips, lunch_reimbursement = Lunch,
--   warehouse_hours = Warehouse Hours, total_hours = Total Hours,
--   gross_pay = Standard Pay + Overtime Pay, job_hours = Billable Hours.

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS billable_hours     NUMERIC,
  ADD COLUMN IF NOT EXISTS marketing_hours    NUMERIC,
  ADD COLUMN IF NOT EXISTS overtime_hours     NUMERIC,
  ADD COLUMN IF NOT EXISTS standard_pay       NUMERIC,
  ADD COLUMN IF NOT EXISTS overtime_rate      NUMERIC,
  ADD COLUMN IF NOT EXISTS overtime_pay       NUMERIC,
  ADD COLUMN IF NOT EXISTS bonus_amount       NUMERIC,   -- Bonus column (bonus actually paid)
  ADD COLUMN IF NOT EXISTS commissions        NUMERIC,
  ADD COLUMN IF NOT EXISTS miles              NUMERIC,   -- mile count from the file
  ADD COLUMN IF NOT EXISTS total_compensation NUMERIC,   -- the all-in take
  ADD COLUMN IF NOT EXISTS period_start       DATE,
  ADD COLUMN IF NOT EXISTS period_end         DATE,
  ADD COLUMN IF NOT EXISTS source_file        TEXT;
