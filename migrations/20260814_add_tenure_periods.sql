-- Bi-annual tenure bonus: the admin enters the pool (1% of revenue) per payout; the
-- app subtracts damages for the window and splits by tenure shares. Paid end of June
-- and end of December, each on the trailing 6 months (Dec payout = Jun–Nov; Jun
-- payout = the prior Dec–May).
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS tenure_bonus_periods (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_key   TEXT NOT NULL UNIQUE,     -- 'YYYY-06' (June payout) | 'YYYY-12' (December)
  payout_date  DATE NOT NULL,
  window_start DATE NOT NULL,
  window_end   DATE NOT NULL,
  pool_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,  -- the entered 1%-of-revenue pool
  note         TEXT,
  updated_by   UUID REFERENCES employees(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
