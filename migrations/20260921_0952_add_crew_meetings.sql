-- Crew meetings: a quarterly cadence, plus ad-hoc conversations.
--
-- There was nowhere to remember to sit down with the crew. Quarterly reviews
-- happened when someone thought of them, which means they stopped happening, and
-- ad-hoc conversations left no trace — so a recurring problem looked new every
-- time it came up.
--
-- Deliberately NO scheduled rows are pre-seeded for the cadence. Who is due is
-- computed from the calendar quarter and the absence of a review, exactly the way
-- getPendingNewCrewEvals derives "due" from start_date. A table of generated
-- future meetings is a table that drifts the moment anything changes.
--
-- Additive and idempotent. No updated_at trigger — this schema has none anywhere;
-- actions set updated_at = NOW() by hand.

CREATE TABLE IF NOT EXISTS crew_meetings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type              TEXT NOT NULL CHECK (type IN
                      ('quarterly_review', 'feedback_positive',
                       'feedback_negative', 'catch_up')),

  -- Which quarter a quarterly review satisfies, as '2026-Q3'. NULL for ad-hoc.
  -- Stored rather than derived from scheduled_for: a Q3 review that actually
  -- happens in the first week of October still closes out Q3, and the date alone
  -- cannot say that.
  quarter           TEXT,

  scheduled_for     DATE NOT NULL,
  -- Wall-clock, America/New_York, like the 7:15 meeting. A timestamptz would
  -- imply a precision nobody has about a sit-down that may move by a day.
  scheduled_time    TIME,
  completed_at      TIMESTAMPTZ,             -- NULL = still scheduled
  notes             TEXT,

  created_by        UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_by_name   TEXT NOT NULL,
  completed_by      UUID REFERENCES employees(id) ON DELETE SET NULL,
  completed_by_name TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A meeting marked done with nothing written down is the failure this module
  -- exists to prevent: the record, not the calendar entry, is what makes a
  -- recurring problem visible months later. One line is enough — but there has
  -- to be one, and the database is what guarantees it.
  CONSTRAINT crew_meetings_completed_has_notes
    CHECK (completed_at IS NULL OR notes IS NOT NULL),

  -- A quarterly review must name the quarter it satisfies; an ad-hoc meeting
  -- must not pretend to satisfy one.
  CONSTRAINT crew_meetings_quarter_matches_type
    CHECK ((type = 'quarterly_review') = (quarter IS NOT NULL))
);

-- One quarterly review per person per quarter, scheduled or completed. Enforced
-- here rather than in the UI, because two admins booking the same review on the
-- same morning is exactly how you end up with two.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_crew_meeting_quarter
  ON crew_meetings(employee_id, quarter)
  WHERE type = 'quarterly_review';

CREATE INDEX IF NOT EXISTS idx_crew_meetings_employee ON crew_meetings(employee_id);
CREATE INDEX IF NOT EXISTS idx_crew_meetings_open
  ON crew_meetings(scheduled_for) WHERE completed_at IS NULL;
