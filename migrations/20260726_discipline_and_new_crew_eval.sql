-- Discipline automation + 30-day New Crew Member Evaluation.
--
-- 1) write_ups.source distinguishes hand-written write-ups from ones the system
--    auto-creates when a crew member hits 3 strikes in a week. Used to dedupe the
--    auto write-up (one per employee per week) and to label it in the UI.
-- 2) new_crew_evaluations tracks the 30-day probation review every new crew member
--    gets. One row per employee (their current/most-recent eval); due 30 days after
--    start_date. Ratings are 1-5 across a fixed set of categories.

ALTER TABLE write_ups
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- 30-day New Crew Member Evaluation ----------------------------------------
CREATE TABLE IF NOT EXISTS new_crew_evaluations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id    UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  due_date       DATE NOT NULL,               -- start_date + 30 days
  completed_at   TIMESTAMPTZ,                 -- NULL = still pending
  completed_by   UUID REFERENCES employees(id),
  outcome        TEXT,                         -- 'pass' | 'extend' | 'terminate'
  -- Category ratings, 1-5 (NULL until evaluated)
  attendance     SMALLINT,
  attitude       SMALLINT,
  work_ethic     SMALLINT,
  customer_service SMALLINT,
  care_with_items  SMALLINT,
  follows_procedures SMALLINT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active (incomplete) evaluation per employee.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_new_crew_eval_open
  ON new_crew_evaluations(employee_id)
  WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_new_crew_eval_emp ON new_crew_evaluations(employee_id);
