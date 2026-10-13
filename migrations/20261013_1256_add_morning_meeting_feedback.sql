-- Morning Meeting — Feedback (section 5 of the walk-through).
--
-- Two ways in, one table:
--
--   1. Queued ahead of time. A customer calls about yesterday's move, or the office
--      hears something worth passing on. It's logged during the day and lands on
--      the NEXT meeting (meeting_date), so it gets mentioned instead of forgotten.
--   2. Raised live. At 7:15 the crew says how things could run better — for the
--      crew, or for the back office. Logged straight in with source = 'crew'.
--
-- Everything stays open until someone closes it: queued feedback once it has been
-- mentioned, crew suggestions once they've been addressed. Same carry-forward rule
-- as recognition and discussion points — a skipped meeting never swallows it.
--
-- Additive and idempotent. No trigger on updated_at — this schema has none
-- anywhere, and every action in src/lib sets updated_at = NOW() by hand.

CREATE TABLE IF NOT EXISTS morning_meeting_feedback (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  body             TEXT NOT NULL,

  -- Where it came from.
  source           TEXT NOT NULL CHECK (source IN ('customer', 'back_office', 'crew')),
  -- Who it's for: what the crew should hear, or what the office should change.
  audience         TEXT NOT NULL DEFAULT 'crew' CHECK (audience IN ('crew', 'back_office')),

  -- The first meeting it should appear at. Queued feedback lands on the next
  -- meeting; live crew feedback is today's.
  meeting_date     DATE NOT NULL,

  -- Optional job (customer feedback is usually about one) with a frozen label —
  -- jobs are re-imported from SmartMoving and can disappear.
  job_id           UUID REFERENCES jobs(id) ON DELETE SET NULL,
  job_label        TEXT,

  -- Optional person: who it's about (customer / office feedback) or who raised it
  -- (crew feedback — left blank when they'd rather not be named).
  employee_id      UUID REFERENCES employees(id) ON DELETE SET NULL,
  employee_name    TEXT,

  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at        TIMESTAMPTZ,
  closed_by        UUID REFERENCES employees(id) ON DELETE SET NULL,
  closed_by_name   TEXT,

  author_id        UUID REFERENCES employees(id) ON DELETE SET NULL,
  author_name      TEXT NOT NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT mm_feedback_closed_has_time
    CHECK (status = 'open' OR closed_at IS NOT NULL)
);

-- The board reads open feedback on every load.
CREATE INDEX IF NOT EXISTS idx_mm_feedback_status
  ON morning_meeting_feedback(status, meeting_date, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mm_feedback_employee
  ON morning_meeting_feedback(employee_id);
CREATE INDEX IF NOT EXISTS idx_mm_feedback_job
  ON morning_meeting_feedback(job_id);
