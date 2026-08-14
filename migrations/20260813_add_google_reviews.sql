-- Auto-import of 5-star Google reviews into the weekly-bonus system.
--
-- A weekly job pulls reviews from the GoodGuys Google Business Profile and stores
-- each here (deduped by Google's stable review_id). Reviews whose author matches a
-- job's customer are auto-credited to that job's crew as FIVE_STAR_REVIEW positives
-- (see bonus_positives, source='google'); the rest sit in a queue (status='queued')
-- for a back-office admin to assign by hand. This table is the source of truth /
-- dedup ledger — bonus_positives is where the actual crew credit lands.
--
-- Credits reuse the auto-event precedent (created_by NULL, non-manual source), so
-- no system employee row is required.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS google_reviews (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id         TEXT NOT NULL UNIQUE,          -- Google's stable id → dedup key
  author_name       TEXT,
  comment           TEXT,
  star_rating       INT,                            -- normalized 1-5 (we import 5s)
  review_created_at TIMESTAMPTZ,                    -- when the customer left it
  status            TEXT NOT NULL DEFAULT 'pending' -- pending | matched | queued | dismissed
                      CHECK (status IN ('pending', 'matched', 'queued', 'dismissed')),
  matched_job_id    UUID REFERENCES jobs(id) ON DELETE SET NULL,
  credited_at       TIMESTAMPTZ,                    -- when bonus_positives rows were written
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The queue view filters by status; the sync filters/sorts by recency.
CREATE INDEX IF NOT EXISTS idx_google_reviews_status ON google_reviews(status);
CREATE INDEX IF NOT EXISTS idx_google_reviews_created ON google_reviews(review_created_at DESC);
