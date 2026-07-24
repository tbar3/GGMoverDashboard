-- Editable app settings (key/value). First use: the pay-scale base rate, so it
-- can be changed from the admin panel instead of being a code constant. Other
-- config (bonus pool %, mileage rate, etc.) can move here later.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the base hourly rate from the pay scale (only if not already set).
INSERT INTO app_settings (key, value) VALUES ('base_hourly_rate', '18.00')
ON CONFLICT (key) DO NOTHING;
