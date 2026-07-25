-- Phase 4: the week open → approved(locked) lifecycle, the frozen per-employee
-- snapshot taken at lock, and post-lock adjustments (audit trail). Weeks are the
-- same Monday-anchored week_start used everywhere else. Additive, idempotent.

CREATE TABLE IF NOT EXISTS bonus_weeks (
  week_start   DATE PRIMARY KEY,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved')),
  approved_by  UUID REFERENCES employees(id),
  approved_at  TIMESTAMPTZ
);

-- The figures frozen at lock time, so later event/hour edits can't rewrite a
-- closed week. Export and the admin board read these once a week is approved.
CREATE TABLE IF NOT EXISTS bonus_week_results (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_start      DATE NOT NULL,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  hours           NUMERIC NOT NULL DEFAULT 0,
  positives_count INTEGER NOT NULL DEFAULT 0,
  perfect_week    BOOLEAN NOT NULL DEFAULT FALSE,
  multiplier      NUMERIC NOT NULL DEFAULT 0,
  has_strike      BOOLEAN NOT NULL DEFAULT FALSE,
  bonus           NUMERIC NOT NULL DEFAULT 0,
  locked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by       UUID REFERENCES employees(id),
  UNIQUE (week_start, employee_id)
);

-- Corrections after lock: a signed delta + a required reason, surfaced as a
-- separate line on the next payroll export rather than rewriting the frozen row.
CREATE TABLE IF NOT EXISTS bonus_adjustments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_start  DATE NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  delta       NUMERIC NOT NULL,
  reason      TEXT NOT NULL,
  created_by  UUID REFERENCES employees(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bonus_adjustments_week ON bonus_adjustments(week_start);
