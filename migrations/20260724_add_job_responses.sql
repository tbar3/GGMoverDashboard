-- Crew accept/decline on assigned jobs.
--
-- One response per (job, employee). Declines carry a reason. Jobs come from the
-- calendar-synced `jobs` table (crew_ids holds employee ids). A crew member may
-- only respond to a job they're assigned to (enforced in the server action).
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS job_responses (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id         UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  employee_id    UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  response       TEXT NOT NULL CHECK (response IN ('accepted', 'declined')),
  decline_reason TEXT,
  responded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_job_responses_employee ON job_responses(employee_id);
CREATE INDEX IF NOT EXISTS idx_job_responses_job ON job_responses(job_id);
