-- Per-week business summary shown on the Payroll Run. Revenue & job count come from
-- SmartMoving (not in the app), so they're entered here; payroll gross is computed
-- from the run but can be overridden (e.g. to add the two base salaries at ADP-preview
-- time). Labor-cost ratio and week-over-week deltas are derived, not stored.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS payroll_week_summary (
  week_start    DATE PRIMARY KEY,
  jobs          INTEGER,
  revenue       NUMERIC(12,2),
  payroll_gross NUMERIC(12,2),  -- optional override; NULL → use the run's computed gross
  note          TEXT,
  updated_by    UUID REFERENCES employees(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
