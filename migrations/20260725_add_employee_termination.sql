-- Termination record for the separation flow + auto Letter of Separation.
-- Terminating an employee sets is_active = false and fills these fields.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS terminated_at       DATE,   -- when the decision was recorded
  ADD COLUMN IF NOT EXISTS last_day_worked      DATE,
  ADD COLUMN IF NOT EXISTS termination_type     TEXT,   -- voluntary | involuntary | layoff | other
  ADD COLUMN IF NOT EXISTS termination_reason   TEXT,   -- short reason / category
  ADD COLUMN IF NOT EXISTS termination_details  TEXT,   -- free-text notes
  ADD COLUMN IF NOT EXISTS rehire_eligible      BOOLEAN,
  ADD COLUMN IF NOT EXISTS terminated_by        UUID REFERENCES employees(id);
