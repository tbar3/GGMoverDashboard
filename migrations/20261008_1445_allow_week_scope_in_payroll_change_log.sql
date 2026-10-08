-- Closing and reopening a payroll week log a scope='week' status change
-- (src/lib/payroll-close.ts), but the original CHECK predates close/reopen and
-- only allowed override / marketing / week_summary / classification. The insert
-- runs inside the close transaction, so every close attempt rolled back with
-- payroll_change_log_scope_check. Widen the list; existing rows are unaffected.

ALTER TABLE payroll_change_log DROP CONSTRAINT IF EXISTS payroll_change_log_scope_check;

ALTER TABLE payroll_change_log
  ADD CONSTRAINT payroll_change_log_scope_check
  CHECK (scope IN ('override', 'marketing', 'week_summary', 'classification', 'week'));
