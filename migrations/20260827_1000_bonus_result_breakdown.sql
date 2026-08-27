-- The weekly bonus export could only show a final multiplier and a dollar figure,
-- so nobody could see HOW a bonus was reached. The snapshot froze the answer but
-- not the inputs. These columns freeze the inputs too, so a locked week's report
-- can show the full arithmetic forever — even after skills, settings, or the
-- per-employee base multiplier change.
--
-- Deliberately NULLable with no default: NULL marks a row locked before this
-- migration, which the report detects and reconstructs from live events (flagged
-- as reconstructed rather than silently presented as frozen). Additive, idempotent.

ALTER TABLE bonus_week_results
  ADD COLUMN IF NOT EXISTS base_rate           NUMERIC,
  ADD COLUMN IF NOT EXISTS base_multiplier     NUMERIC,
  ADD COLUMN IF NOT EXISTS discretionary_count INTEGER,
  ADD COLUMN IF NOT EXISTS auto_bonus          NUMERIC,
  ADD COLUMN IF NOT EXISTS strike_count        INTEGER,
  ADD COLUMN IF NOT EXISTS gross_multiplier    NUMERIC;

COMMENT ON COLUMN bonus_week_results.base_rate           IS 'bonus_base_rate at lock time ($/hour/multiplier)';
COMMENT ON COLUMN bonus_week_results.base_multiplier     IS 'employee base multiplier at lock time (override or company default)';
COMMENT ON COLUMN bonus_week_results.discretionary_count IS 'strike-proof GG Points awarded this week';
COMMENT ON COLUMN bonus_week_results.auto_bonus          IS 'automatic role add-ons (Driver / 2-Truck Lead) in multiplier units';
COMMENT ON COLUMN bonus_week_results.strike_count        IS 'unvoided strikes in the week';
COMMENT ON COLUMN bonus_week_results.gross_multiplier    IS 'multiplier before strike forfeiture — what they would have earned clean';
