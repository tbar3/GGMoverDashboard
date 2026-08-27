-- Payroll audit trail. payroll_overrides / marketing_hours / payroll_week_summary
-- each keep only the CURRENT value plus a single updated_by — so a correction made
-- three times leaves no trace of the first two, and F&A cannot answer "who changed
-- this, when, and from what?". This is the append-only log that can.
--
-- Nothing reads it to compute pay; it is written alongside the existing upserts and
-- read only by the Payroll Audit view. Actor and employee names are snapshotted as
-- text so the log stays readable even if a roster row is later renamed or removed.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS payroll_change_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_start      DATE NOT NULL,
  -- NULL for week-level changes (revenue, jobs, payroll-gross override).
  employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  employee_name   TEXT,
  scope           TEXT NOT NULL CHECK (scope IN ('override', 'marketing', 'week_summary', 'classification')),
  field           TEXT NOT NULL,
  old_value       TEXT,
  new_value       TEXT,
  changed_by      UUID REFERENCES employees(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_change_log_week ON payroll_change_log(week_start, changed_at);
CREATE INDEX IF NOT EXISTS idx_payroll_change_log_emp  ON payroll_change_log(employee_id);
