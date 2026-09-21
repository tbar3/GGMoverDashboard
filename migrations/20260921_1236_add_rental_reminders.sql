-- Rental reminder emails: what has already been sent, so we do not nag twice.
--
-- Three kinds of reminder, on the schedule the office asked for:
--   book   — 5, then 3, then 1 BUSINESS days before a truck is needed, and only
--            while it still shows as not booked
--   pickup — the day before we are due to collect one
--   return — the day before it is due back, then every day once it is overdue,
--            because that one bills daily
--
-- Without this table the daily cron would resend the same 5-day warning every
-- morning until the thing was booked, which is how an inbox learns to ignore a
-- sender. One row per (subject, milestone) is the record that it went out.
--
-- A reminder is about EITHER a rental we have logged (rental_id) or a coverage
-- gap with no rental against it yet (window_key = the first short day). Hence one
-- of the two, not both required.
--
-- Additive and idempotent. No updated_at trigger — this schema has none; rows
-- here are write-once anyway.

CREATE TABLE IF NOT EXISTS rental_reminders_sent (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind        TEXT NOT NULL CHECK (kind IN ('book', 'pickup', 'return')),
  rental_id   UUID REFERENCES truck_rentals(id) ON DELETE CASCADE,
  -- yyyy-MM-dd of the window's first short day, when no rental exists yet.
  window_key  TEXT,
  milestone   TEXT NOT NULL CHECK (milestone IN ('5bd', '3bd', '1bd', 'day_before', 'overdue')),
  sent_on     DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/New_York')::date,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT rental_reminders_subject
    CHECK (rental_id IS NOT NULL OR window_key IS NOT NULL)
);

-- Each milestone fires once per subject. COALESCE because the subject is a
-- rental when we have one and a bare date when we do not.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_rental_reminder_once
  ON rental_reminders_sent(kind, COALESCE(rental_id::text, window_key), milestone)
  WHERE milestone <> 'overdue';

-- Overdue is the exception: it repeats, but only once a day.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_rental_reminder_overdue_daily
  ON rental_reminders_sent(rental_id, sent_on)
  WHERE milestone = 'overdue';

CREATE INDEX IF NOT EXISTS idx_rental_reminders_sent_on
  ON rental_reminders_sent(sent_on DESC);

-- Who gets them. A setting rather than an env var so it changes without a
-- deploy, matching how the lead time already works. Comma-separated.
INSERT INTO app_settings (key, value)
VALUES ('rental_reminder_emails', 'trent@goodguysserve.com')
ON CONFLICT (key) DO NOTHING;

-- Lead time moves from 3 calendar days to 5 BUSINESS days. Only touched if it
-- is still sitting at the old default, so a value tuned by hand is not clobbered
-- by a re-run.
UPDATE app_settings SET value = '5', updated_at = NOW()
 WHERE key = 'rental_lead_time_days' AND value = '3';
