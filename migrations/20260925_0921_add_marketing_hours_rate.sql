-- Marketing-only payroll rows.
--
-- Someone who did marketing all week and never went out on a move has no row in
-- the imported SmartMoving payroll report. Rate normally arrives per-week on that
-- row (payroll_entries.hourly_rate), so a marketing-only person has nothing to
-- inherit it from. This column carries the rate for exactly that case.
--
-- computePayrollRun resolves it as:
--   COALESCE(marketing_hours.hourly_rate, employees.hourly_rate, 0)
--
-- Deliberately NULLable with no default: NULL means "fall back to the employee
-- record", which is not the same as 0 — a 0 default would silently pay nothing
-- and look like a deliberate figure. A rateless row instead trips the existing
-- "$0 hourly rate" audit warning.
--
-- Additive, idempotent, non-destructive. marketing_hours already carries id,
-- created_at and updated_at from migration 20260814.

ALTER TABLE marketing_hours
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2);

COMMENT ON COLUMN marketing_hours.hourly_rate IS
  'Rate for a marketing-only payroll week, where no imported payroll_entries row exists to carry one. NULL = fall back to employees.hourly_rate.';
