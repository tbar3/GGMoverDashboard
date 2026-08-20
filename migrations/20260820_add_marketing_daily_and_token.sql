-- Self-service marketing hours: a per-employee share token (unguessable, no login)
-- and per-day marketing hours. The public form writes days here; the weekly total
-- (marketing_hours) is recomputed from the day rows so the Payroll Run is unchanged.
--
-- Additive, idempotent.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS marketing_token UUID DEFAULT uuid_generate_v4();
UPDATE employees SET marketing_token = uuid_generate_v4() WHERE marketing_token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_marketing_token ON employees(marketing_token);

CREATE TABLE IF NOT EXISTS marketing_day_hours (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  hours       NUMERIC(6,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, date)
);
CREATE INDEX IF NOT EXISTS idx_marketing_day_hours_date ON marketing_day_hours(date);
