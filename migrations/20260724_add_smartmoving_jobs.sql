-- SmartMoving "all jobs" report import target.
--
-- A dedicated, side-by-side table (kept separate from the calendar-synced
-- `jobs` table on purpose): this holds a wholesale weekly export from
-- SmartMoving, re-uploaded periodically and upserted by SmartMoving's own Job
-- Id. It carries crew/trucks as names (not employee ids) and a full financial
-- breakdown the calendar sync doesn't have. The back-office dashboard reads it.
--
-- Note: the report is a TRAILING snapshot (typically the prior week), so this is
-- not live data — `imported_at` records when each row was last refreshed.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS smartmoving_jobs (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  smartmoving_job_id   TEXT UNIQUE NOT NULL,        -- SmartMoving "Job Id" (stable key)
  job_number           TEXT,
  opportunity_status   TEXT,                          -- Booked | Closed | Lost | Cancelled | ...
  job_type             TEXT,                          -- Moving | Packing | Moving and Packing | ...
  opportunity_type     TEXT,                          -- Local | Intrastate | Interstate
  job_rating           TEXT,

  job_date             DATE,
  booked_at_utc        TIMESTAMPTZ,
  completed_at_utc     TIMESTAMPTZ,

  customer_name        TEXT,
  customer_email       TEXT,
  customer_phone       TEXT,
  referral_source      TEXT,
  sales_person_name    TEXT,
  estimator_name       TEXT,
  move_coordinator_name TEXT,
  branch_name          TEXT,

  volume               NUMERIC(12, 2),
  weight               NUMERIC(12, 2),
  mileage              NUMERIC(12, 2),

  est_trucks           NUMERIC(6, 2),
  est_crew             NUMERIC(6, 2),
  est_materials_cost   NUMERIC(12, 2),
  est_labor_cost       NUMERIC(12, 2),
  total_estimated_cost NUMERIC(12, 2),

  actual_trucks        NUMERIC(6, 2),
  actual_crew          NUMERIC(6, 2),
  actual_materials_cost NUMERIC(12, 2),
  actual_labor_cost    NUMERIC(12, 2),
  total_actual_cost    NUMERIC(12, 2),
  tip_amount           NUMERIC(12, 2),

  origin_city          TEXT,
  origin_state         TEXT,
  destination_city     TEXT,
  destination_state    TEXT,

  crew_member_names    TEXT,
  truck_names          TEXT,
  pricing_method       TEXT,
  services_requested   TEXT,

  imported_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sm_jobs_status ON smartmoving_jobs(opportunity_status);
CREATE INDEX IF NOT EXISTS idx_sm_jobs_date ON smartmoving_jobs(job_date);
CREATE INDEX IF NOT EXISTS idx_sm_jobs_type ON smartmoving_jobs(job_type);
