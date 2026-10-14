-- Crew feedback notes — individual feedback, logged as it happens and reviewed
-- with the person at their next sit-down (crew_meetings).
--
-- The lifecycle is the whole design:
--   pending   — written by the back office, invisible to the crew member, still
--               editable. Carries forward with no expiry until it is discussed.
--   discussed — gone over in a completed meeting (meeting_id + discussed_at set),
--               optionally with what they said back. Locked from then on, and the
--               ONLY state the crew member can see, on their own profile.
--
-- "Visible once discussed" is enforced by the read query, not by a flag someone
-- could forget to flip: crew see a note only if it is linked to a meeting that
-- has actually been completed.
--
-- Additive and idempotent. No updated_at trigger — none exist in this schema.

CREATE TABLE IF NOT EXISTS crew_feedback_notes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id      UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('praise', 'needs_work', 'coaching')),
  body             TEXT NOT NULL,

  -- Optional job, with a frozen label — jobs are re-imported from SmartMoving.
  job_id           UUID REFERENCES jobs(id) ON DELETE SET NULL,
  job_label        TEXT,

  author_id        UUID REFERENCES employees(id) ON DELETE SET NULL,
  author_name      TEXT NOT NULL,

  -- Set together when the note is gone over in a meeting.
  meeting_id       UUID REFERENCES crew_meetings(id) ON DELETE SET NULL,
  discussed_at     TIMESTAMPTZ,
  -- What the crew member said back. Optional: "understood" is a valid outcome.
  crew_response    TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A response only exists for a note that was discussed.
  CONSTRAINT crew_feedback_response_needs_discussion
    CHECK (crew_response IS NULL OR discussed_at IS NOT NULL)
);

-- "Everything still waiting for Eduardo" — read on every employee page and
-- every time a meeting is recorded.
CREATE INDEX IF NOT EXISTS idx_crew_feedback_pending
  ON crew_feedback_notes(employee_id, created_at) WHERE discussed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crew_feedback_employee
  ON crew_feedback_notes(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_feedback_meeting
  ON crew_feedback_notes(meeting_id);
