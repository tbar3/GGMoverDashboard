-- Two dates per event:
--   event_date     = when it happened (the job date)
--   effective_date = when we recorded it (drives the pay-period export)
-- Plus arrival_time on strikes so a "Late" strike captures when they got to work.
--
-- Backfill effective_date = event_date for existing rows so nothing shifts periods.

ALTER TABLE bonus_positives ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE bonus_strikes   ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE bonus_strikes   ADD COLUMN IF NOT EXISTS arrival_time TIME;
ALTER TABLE write_ups       ADD COLUMN IF NOT EXISTS effective_date DATE;

UPDATE bonus_positives SET effective_date = event_date WHERE effective_date IS NULL;
UPDATE bonus_strikes   SET effective_date = event_date WHERE effective_date IS NULL;
UPDATE write_ups       SET effective_date = event_date WHERE effective_date IS NULL;

ALTER TABLE bonus_positives ALTER COLUMN effective_date SET DEFAULT CURRENT_DATE;
ALTER TABLE bonus_strikes   ALTER COLUMN effective_date SET DEFAULT CURRENT_DATE;
ALTER TABLE write_ups       ALTER COLUMN effective_date SET DEFAULT CURRENT_DATE;

ALTER TABLE bonus_positives ALTER COLUMN effective_date SET NOT NULL;
ALTER TABLE bonus_strikes   ALTER COLUMN effective_date SET NOT NULL;
ALTER TABLE write_ups       ALTER COLUMN effective_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bonus_positives_effective ON bonus_positives(effective_date);
CREATE INDEX IF NOT EXISTS idx_bonus_strikes_effective   ON bonus_strikes(effective_date);
CREATE INDEX IF NOT EXISTS idx_write_ups_effective       ON write_ups(effective_date);
