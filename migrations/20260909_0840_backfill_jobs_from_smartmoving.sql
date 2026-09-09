-- Backfill `jobs` from the SmartMoving history already sitting in smartmoving_jobs.
--
-- `jobs` is fed only by the Google Calendar sync. That calendar ("SmartMoving Jobs")
-- carries no events before 2026-06-24 — verified directly against the Google API
-- across every calendar on the connected account — so every job older than that was
-- invisible to the app: absent from the Damages / Mileage / Materials job pickers and
-- unavailable for review matching.
--
-- The data was never actually missing. A SmartMoving "all jobs" report was imported
-- on 2026-07-24 into smartmoving_jobs (784 rows back to 2026-01-25), but nothing ever
-- bridged that table into `jobs`. This migration is the one-time catch-up;
-- bridgeSmartMovingJobsIntoJobs() in import-handlers.ts now runs the same statement
-- automatically at the end of every future SmartMoving import.
--
-- Scope: 'Closed' and 'Booked' only. Deliberately narrower than profitability.ts's
-- REAL_JOB (which also counts 'Opportunity') — a P&L wants pipeline value, but `jobs`
-- is an operational record of work performed or scheduled, and an unbooked quote has
-- no business in a damage-attribution picker. Lost / Cancelled / Bad lead excluded.
--
-- DO NOTHING, never DO UPDATE: where a job_number already exists it came from the
-- calendar, which has real street addresses and crew assignments. SmartMoving only has
-- origin/destination city + state, so updating would trade richer data for poorer.
--
-- crew_ids left empty on purpose. SmartMoving stores crew as free text; resolving it
-- to employee ids would change per-crew job counts that weekly bonus math reads for
-- already-paid weeks. The names remain on smartmoving_jobs if ever needed.
--
-- Dry-run against production data inside a rolled-back transaction:
--   264 -> 619 jobs (+355), earliest date 2026-06-24 -> 2026-02-02,
--   all 264 pre-existing rows byte-identical (md5 unchanged),
--   a second run inserts 0.
--
-- Idempotent: the ON CONFLICT makes re-running a no-op.

INSERT INTO jobs (
  date, customer_name, pickup_address, dropoff_address, revenue,
  job_number, service_type, customer_phone, customer_email,
  volume_cuft, weight_lbs, pricing_type, truck_name, crew_ids
)
SELECT
  s.job_date,
  s.customer_name,
  COALESCE(NULLIF(concat_ws(', ', s.origin_city, s.origin_state), ''), ''),
  COALESCE(NULLIF(concat_ws(', ', s.destination_city, s.destination_state), ''), ''),
  s.total_actual_cost,
  s.job_number,
  s.job_type,
  s.customer_phone,
  s.customer_email,
  s.volume,
  s.weight,
  s.pricing_method,
  s.truck_names,
  '{}'
  FROM smartmoving_jobs s
 WHERE s.job_number IS NOT NULL
   AND s.job_date IS NOT NULL
   AND s.customer_name IS NOT NULL
   AND s.opportunity_status IN ('Closed', 'Booked')
ON CONFLICT (job_number) WHERE job_number IS NOT NULL DO NOTHING;
