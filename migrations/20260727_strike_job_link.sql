-- Link strikes to a job + mark auto-generated ones, so a late-decline can create
-- an automatic Call-Out strike (deduped one-per-job) without stacking on re-decline.

ALTER TABLE bonus_strikes ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;
ALTER TABLE bonus_strikes ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_bonus_strikes_job ON bonus_strikes(job_id);
