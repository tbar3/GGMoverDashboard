-- GG Points: a "GG Point" is any 0.5x increase in the weekly bonus. The new
-- DISCRETIONARY GG Point is hand-awarded and survives strikes — a strike forfeits
-- the normal bonus but the discretionary 0.5x per point is retained, UNLESS the
-- week has >= the forfeit threshold (3) strikes, which wipes everything.

ALTER TABLE bonus_positives DROP CONSTRAINT IF EXISTS bonus_positives_type_check;
ALTER TABLE bonus_positives ADD CONSTRAINT bonus_positives_type_check
  CHECK (type IN ('FIVE_STAR_REVIEW', 'CUSTOMER_CALLOUT', 'COMPLIANCE_PLUS', 'GG_POINT'));

ALTER TABLE bonus_positives ADD COLUMN IF NOT EXISTS discretionary BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO app_settings (key, value) VALUES ('bonus_strike_forfeit_threshold', '3')
ON CONFLICT (key) DO NOTHING;
