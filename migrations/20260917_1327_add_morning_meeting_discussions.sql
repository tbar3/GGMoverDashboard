-- Morning Meeting — Discussion Points and Questions (section 4 of the walk-through).
--
-- Back office logs a question about a previous job — "the truck was 40 minutes
-- late on the Henderson move, what happened?" — raises it at 7:15 with the lead
-- standing there, and types back what was actually said. The answer is the point:
-- without it a recurring problem looks new every time it comes up.
--
-- A point stays open until it is answered. Same principle as the recognition
-- ledger: a skipped meeting or a weekend must never swallow the question.
--
-- Additive and idempotent. No trigger on updated_at — this schema has none
-- anywhere, and every action in src/lib sets updated_at = NOW() by hand.

CREATE TABLE IF NOT EXISTS morning_meeting_discussions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question         TEXT NOT NULL,

  -- The job this is about. Optional: most points reference a move, but "the
  -- Collier Rd gate code" is a legitimate thing to raise with nowhere else to go.
  job_id           UUID REFERENCES jobs(id) ON DELETE SET NULL,
  -- Frozen label ("Aug 14 · Henderson · #10482"). Jobs are re-imported from
  -- SmartMoving and can be deleted; a question from three months ago still has to
  -- read as a sentence when the row it pointed at is gone.
  job_label        TEXT,

  -- Who the question is FOR. Stored explicitly rather than derived, because there
  -- is no per-job lead anywhere in this schema: jobs.crew_ids is a flat UUID[] and
  -- 'lead' is an employee-level role. Deriving it would silently pick wrong on a
  -- job with two leads and find nobody on a job with none.
  employee_id      UUID REFERENCES employees(id) ON DELETE SET NULL,
  employee_name    TEXT,

  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered')),
  answer           TEXT,
  answered_at      TIMESTAMPTZ,
  answered_by      UUID REFERENCES employees(id) ON DELETE SET NULL,
  answered_by_name TEXT,

  author_id        UUID REFERENCES employees(id) ON DELETE SET NULL,
  author_name      TEXT NOT NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- "Answered" with no answer is the one state that would defeat the purpose, so
  -- the database refuses it rather than trusting every future caller.
  CONSTRAINT mm_discussions_answered_has_answer
    CHECK (status = 'open' OR (answer IS NOT NULL AND answered_at IS NOT NULL))
);

-- The board reads open points on every load, newest first.
CREATE INDEX IF NOT EXISTS idx_mm_discussions_status
  ON morning_meeting_discussions(status, created_at DESC);
-- "Everything still open for Marcus", before a coaching conversation.
CREATE INDEX IF NOT EXISTS idx_mm_discussions_employee
  ON morning_meeting_discussions(employee_id);
CREATE INDEX IF NOT EXISTS idx_mm_discussions_job
  ON morning_meeting_discussions(job_id);
