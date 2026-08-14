-- Payroll Run support tables.
--
-- payroll_overrides: per-employee, per-week manual corrections applied ON TOP of the
--   imported/computed values before ADP entry (SmartMoving mis-attributes things —
--   e.g. Cam's commission, his warehouse hours). NULL = use the computed value, so a
--   re-import never clobbers a correction.
-- marketing_hours: per-employee, per-week marketing time (entered via the marketing
--   form, not in the SmartMoving report). Feeds the weekly total like warehouse hours.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS payroll_overrides (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start      DATE NOT NULL,
  warehouse_hours NUMERIC(6,2),
  tips            NUMERIC(10,2),
  commissions     NUMERIC(10,2),
  bonus           NUMERIC(10,2),
  miles           NUMERIC(10,2),
  note            TEXT,
  updated_by      UUID REFERENCES employees(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, week_start)
);

CREATE TABLE IF NOT EXISTS marketing_hours (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start  DATE NOT NULL,
  hours       NUMERIC(6,2) NOT NULL DEFAULT 0,
  note        TEXT,
  entered_by  UUID REFERENCES employees(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_marketing_hours_week ON marketing_hours(week_start);
