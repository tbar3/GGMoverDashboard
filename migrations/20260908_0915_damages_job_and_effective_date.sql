-- Damages: separate "when the job was" from "when we paid it out".
--
-- Until now a damage row only had created_at — the moment it was typed into the
-- dashboard. That conflates three different things: the move the damage happened
-- on, the day the money actually came out of the pool, and the data-entry
-- timestamp. Finance needs the first two to reconcile a payout period.
--
--   job_date       = the date of the move the damage happened on. Nullable —
--                    some damages (warehouse, shop, truck) aren't tied to a job.
--                    Auto-filled from the linked job when there is one.
--   effective_date = the date the damage was actually deducted / paid out. This
--                    is what windows a bonus period, mirroring the same column
--                    already on bonus_positives / bonus_strikes / write_ups
--                    (see 20260727_effective_date_and_arrival.sql).
--
-- Backfill keeps every existing row in the period it is in today:
--   job_date       <- the linked job's date, else NULL (unknown, not guessed)
--   effective_date <- created_at::date, which is what the pool math used before.
--
-- Additive and idempotent.

ALTER TABLE damages ADD COLUMN IF NOT EXISTS job_date       DATE;
ALTER TABLE damages ADD COLUMN IF NOT EXISTS effective_date DATE;

UPDATE damages d
   SET job_date = j.date
  FROM jobs j
 WHERE d.job_id = j.id
   AND d.job_date IS NULL;

UPDATE damages SET effective_date = created_at::date WHERE effective_date IS NULL;

ALTER TABLE damages ALTER COLUMN effective_date SET DEFAULT CURRENT_DATE;
ALTER TABLE damages ALTER COLUMN effective_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_damages_effective_date ON damages(effective_date);
CREATE INDEX IF NOT EXISTS idx_damages_job_date       ON damages(job_date);

COMMENT ON COLUMN damages.job_date IS
  'Date of the move the damage occurred on. NULL when the damage is not tied to a job.';
COMMENT ON COLUMN damages.effective_date IS
  'Date the damage was actually deducted from the bonus pool. Drives which payout period it lands in.';
