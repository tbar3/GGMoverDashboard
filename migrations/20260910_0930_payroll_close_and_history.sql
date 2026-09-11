-- Closing a payroll week, and the history that makes possible.
--
-- Until now getPayrollRun() recomputed the whole week from scratch on every page
-- load: hours from payroll_entries, bonus from the LIVE bonus board, overrides,
-- marketing, mileage. Nothing was ever written down. Two consequences, both bad:
--
--   1. A week you already paid could silently change. Void a strike or re-import
--      hours a month later and last month's payroll figures move underneath you.
--      There was no record of what was actually paid to disagree with.
--   2. There was no payroll history to analyse at all. payroll_entries is written
--      only by the importers and its bonus_amount column is empty for every recent
--      week, so even the bonus that WAS paid was not recorded anywhere.
--
-- Closing a week freezes it: every line is snapshotted here, and from then on the
-- run, the export and the history all read the snapshot rather than recomputing.
--
-- Additive. Idempotent. Nothing here changes how an OPEN week behaves.

-- === 1. The closed run ========================================================
-- One row per close. Re-opening does not delete it — it stamps reopened_at, and
-- the next close writes version + 1. That is the amend trail: every version of a
-- week that was ever considered final is still here, in order, with who did it.
CREATE TABLE IF NOT EXISTS payroll_runs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_start          DATE NOT NULL,
  version             INTEGER NOT NULL DEFAULT 1,

  period_start        DATE,
  period_end          DATE,
  pay_date            DATE,

  -- Totals frozen at close, so history never has to re-derive them from lines.
  gross_payroll       DECIMAL(12,2) NOT NULL DEFAULT 0,
  bonus_total         DECIMAL(12,2) NOT NULL DEFAULT 0,
  reimbursement_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_hours         DECIMAL(10,2) NOT NULL DEFAULT 0,
  headcount           INTEGER NOT NULL DEFAULT 0,

  -- Revenue and labor ratio as they stood at close. Revenue is the gross Total
  -- Actual Cost of Closed jobs, tips and tax included — the same definition the
  -- weekly summary uses. Stored, not recomputed, because a late-closing job would
  -- otherwise quietly rewrite a ratio that was already reported.
  revenue             DECIMAL(12,2),
  labor_ratio         DECIMAL(8,4),

  -- What the bonus week was when this run was closed. Closing REQUIRES 'approved',
  -- so today this is always that — it is recorded anyway so that if the rule is
  -- ever relaxed, history still says which runs were frozen against a live board.
  bonus_week_status   TEXT,

  closed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_by           UUID REFERENCES employees(id) ON DELETE SET NULL,
  closed_by_name      TEXT NOT NULL,
  note                TEXT,

  reopened_at         TIMESTAMPTZ,
  reopened_by         UUID REFERENCES employees(id) ON DELETE SET NULL,
  reopen_reason       TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_runs_version
  ON payroll_runs(week_start, version);

-- A week has at most ONE run that is currently in force. Everything else is a
-- superseded version. Enforcing this in the index means "is this week closed?" is
-- a lookup, not a MAX(version) subquery that could race two closes into a tie.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_runs_current
  ON payroll_runs(week_start) WHERE reopened_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_week ON payroll_runs(week_start DESC);

-- === 2. The frozen lines ======================================================
-- One row per person per closed run: what they were actually paid, not what a
-- recomputation would say today.
--
-- employee_name is denormalised on purpose. People leave, and a payroll record
-- that renders as a blank name because the row it joined to is gone is not a
-- payroll record. The FK stays for linking; the name is the historical fact.
CREATE TABLE IF NOT EXISTS payroll_run_lines (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id             UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id        UUID REFERENCES employees(id) ON DELETE SET NULL,
  employee_name      TEXT NOT NULL,
  classification     TEXT,

  billable_hours     DECIMAL(10,2) NOT NULL DEFAULT 0,
  warehouse_hours    DECIMAL(10,2) NOT NULL DEFAULT 0,
  marketing_hours    DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_hours        DECIMAL(10,2) NOT NULL DEFAULT 0,
  regular_hours      DECIMAL(10,2) NOT NULL DEFAULT 0,
  overtime_hours     DECIMAL(10,2) NOT NULL DEFAULT 0,

  hourly_rate        DECIMAL(10,2),
  weekly_salary      DECIMAL(10,2),
  base_pay           DECIMAL(10,2) NOT NULL DEFAULT 0,
  overtime_pay       DECIMAL(10,2) NOT NULL DEFAULT 0,
  tips               DECIMAL(10,2) NOT NULL DEFAULT 0,
  commissions        DECIMAL(10,2) NOT NULL DEFAULT 0,
  bonus              DECIMAL(10,2) NOT NULL DEFAULT 0,
  mileage_amount     DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_compensation DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Where this line's bonus number came from, kept per line because an override
  -- applies to one person, not the week. 'locked' is the normal case.
  bonus_source       TEXT NOT NULL DEFAULT 'locked'
                       CHECK (bonus_source IN ('locked','live','override','none')),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_run_lines_unique
  ON payroll_run_lines(run_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_run_lines_run ON payroll_run_lines(run_id);
-- "Show me this person's pay history" — the whole point of keeping lines.
CREATE INDEX IF NOT EXISTS idx_payroll_run_lines_employee
  ON payroll_run_lines(employee_id);
