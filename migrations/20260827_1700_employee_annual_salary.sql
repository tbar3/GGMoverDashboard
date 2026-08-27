-- Salaried employees. Until now every employee was paid hourly: the payroll run
-- computed base pay as hours x hourly_rate, so a salaried manager with no rate on
-- file came through at $0 base pay and was paid only commissions and bonus. Their
-- salary was not represented anywhere in the system.
--
-- annual_salary NULL  => paid hourly (unchanged behaviour for everyone existing)
-- annual_salary SET   => salaried and FLSA-exempt: weekly pay is annual/52 regardless
--                        of hours, and no overtime premium is computed. Hours are
--                        still tracked, because the weekly bonus is driven by them.
--
-- Confirmed with the owner 2026-08-27: enter salary annually, exempt from overtime,
-- and ADP already carries the salary so the ADP hours columns stay empty for these
-- people (keying hours there would pay them twice).
--
-- Additive, idempotent.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS annual_salary NUMERIC(12,2);

COMMENT ON COLUMN employees.annual_salary IS
  'Gross annual salary. NULL = hourly employee. Set = salaried and exempt: weekly pay is annual_salary/52 and no OT premium applies.';
