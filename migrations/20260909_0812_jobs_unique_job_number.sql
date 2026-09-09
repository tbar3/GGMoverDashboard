-- Make job_number a real key so historical jobs can be imported safely.
--
-- importJobs() carries the comment "Upsert by job_number" but the SQL says
-- ON CONFLICT (calendar_event_id) DO NOTHING. A CSV row has a NULL
-- calendar_event_id, and Postgres treats NULLs as distinct in a unique index, so
-- that conflict target can never fire for an import: re-running the same file
-- inserts a second copy of every row, and a job the calendar sync already owns
-- gets a duplicate rather than being matched.
--
-- The fix needs an actual unique key to conflict on. Partial (WHERE job_number IS
-- NOT NULL) because manually created jobs have no number and several may coexist.
--
-- Verified before writing this: 264 jobs, zero duplicate job_numbers, so the index
-- builds without a cleanup pass.
--
-- Interaction with the calendar sync: that insert still conflicts on
-- calendar_event_id, which is correct — it owns the calendar-sourced rows. If a
-- calendar event ever arrives carrying a job_number that a CSV import already
-- created, that one insert raises a unique violation; syncCalendarJobs catches per
-- event and reports it in `errors`, so the rest of the sync is unaffected. Imports
-- now update the calendar's row instead of racing it, which is what keeps the two
-- paths from diverging in the first place.
--
-- Additive and idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_job_number_unique
  ON jobs (job_number)
  WHERE job_number IS NOT NULL;

COMMENT ON INDEX idx_jobs_job_number_unique IS
  'Upsert key for CSV job imports. Partial: manually created jobs may have no job_number.';
