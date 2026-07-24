-- Weekly bonus — Phase 1: the event tables (positives, strikes, write-ups) that
-- drive the multiplier, plus config in app_settings. Weeks are Monday-anchored
-- (week_start = the Monday of the event's week); the week open/approve lifecycle
-- comes in a later phase. Reuses employees / jobs (calendar) / trucks (materials).
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS bonus_positives (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start  DATE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('FIVE_STAR_REVIEW', 'CUSTOMER_CALLOUT', 'COMPLIANCE_PLUS')),
  event_date  DATE NOT NULL,
  job_id      UUID REFERENCES jobs(id) ON DELETE SET NULL,
  source      TEXT NOT NULL DEFAULT 'manual',
  note        TEXT,
  created_by  UUID REFERENCES employees(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bonus_positives_emp_week ON bonus_positives(employee_id, week_start);

CREATE TABLE IF NOT EXISTS bonus_strikes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start  DATE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('LATE', 'NO_SHOW', 'TRUCK_NOT_READY')),
  event_date  DATE NOT NULL,
  truck_id    INTEGER,               -- materials trucks id (nullable, loose across schema)
  voided      BOOLEAN NOT NULL DEFAULT FALSE,
  void_reason TEXT,
  note        TEXT,
  created_by  UUID REFERENCES employees(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bonus_strikes_emp_week ON bonus_strikes(employee_id, week_start);

CREATE TABLE IF NOT EXISTS write_ups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start  DATE NOT NULL,
  event_date  DATE NOT NULL,
  summary     TEXT NOT NULL,
  created_by  UUID REFERENCES employees(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_write_ups_emp_week ON write_ups(employee_id, week_start);

-- Bonus config (reuse app_settings). Editable later.
INSERT INTO app_settings (key, value) VALUES
  ('bonus_base_rate', '1.00'),
  ('bonus_positive_increment', '0.50'),
  ('bonus_base_multiplier', '0.50')
ON CONFLICT (key) DO NOTHING;
