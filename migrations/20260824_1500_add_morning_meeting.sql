-- Morning Meeting module (back office only).
--
-- The 7:15–7:45 AM meeting needs a structure to walk: who earned recognition
-- since we last read names out, what got reminded about, and one standing policy
-- to reinforce. Three concerns, three tables — plus a per-day record of which
-- policy we actually covered.
--
-- Additive and idempotent. Touches no existing table's shape; the recognition
-- ledger points AT bonus_positives rather than adding a column to it, so the
-- payroll-critical bonus engine keeps sole ownership of its own table.

-- ── 1. Recognition ledger ────────────────────────────────────────────────────
-- A positive stays on the board until it is dismissed here. PK on positive_id
-- makes dismissal idempotent (ON CONFLICT DO NOTHING) and un-dismissal a plain
-- DELETE. dismissed_by NULL = dismissed by the system, not a person.
CREATE TABLE IF NOT EXISTS morning_meeting_recognitions (
  positive_id  UUID PRIMARY KEY REFERENCES bonus_positives(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_by UUID REFERENCES employees(id)
);

-- Backfill: the board opens on the week of Mon 2026-08-17 and nothing older.
-- Without this, the first morning meeting would open with every positive ever
-- logged stacked on it. Anything that happened before that Monday — or was logged
-- before it — is marked as already read out (dismissed_by NULL = by the system).
--
-- The cutoff is a literal date, not a relative expression: this migration runs
-- once, and "a week ago" would silently mean something different if it were ever
-- replayed against a fresh database.
--
-- Both conditions are checked, because the two dates diverge: a Google review for
-- an old job can be credited days later, and a win credited last week is one the
-- crew has not heard read out either way.
INSERT INTO morning_meeting_recognitions (positive_id, dismissed_by)
SELECT id, NULL FROM bonus_positives
 WHERE event_date < DATE '2026-08-17'
   AND created_at < TIMESTAMPTZ '2026-08-17 00:00:00-04'
ON CONFLICT (positive_id) DO NOTHING;

-- ── 2. Standing policy reminders ─────────────────────────────────────────────
-- The list management keeps updated. Categories deliberately mirror the approved
-- policies module design (docs/superpowers/specs/2026-07-22-policies-design.md)
-- so these can be married to real handbook policies later without a data fix.
CREATE TABLE IF NOT EXISTS policy_reminders (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title            TEXT NOT NULL,
  body             TEXT,
  category         TEXT NOT NULL DEFAULT 'general' CHECK (category IN
                     ('safety','conduct','pay_benefits','operations','vehicles','general')),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       UUID REFERENCES employees(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_policy_reminders_active
  ON policy_reminders(is_active) WHERE is_active = TRUE;

-- Note: there is deliberately no last_featured_on / feature_count cache here.
-- "When did we last cover this?" is answered by morning_meeting_days below, which
-- is the record of what was actually covered. A cache would drift the moment a
-- pin replaced an auto-pick that had already been stamped.

-- ── 3. Ad-hoc reminders logged in the meeting ────────────────────────────────
-- Whatever came up that morning. author_name is denormalized (same reasoning as
-- messages.author_name) so the log survives its author's row being removed.
CREATE TABLE IF NOT EXISTS morning_meeting_notes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_date DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/New_York')::date,
  body         TEXT NOT NULL,
  reminder_id  UUID REFERENCES policy_reminders(id) ON DELETE SET NULL,
  author_id    UUID REFERENCES employees(id),
  author_name  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mm_notes_date ON morning_meeting_notes(meeting_date DESC);

-- ── 4. The day's policy pick ─────────────────────────────────────────────────
-- One row per meeting day, so the Policy of the Day is stable through the day and
-- leaves a record of what was actually covered on what date. pinned = chosen by
-- hand; otherwise it was auto-rotated.
CREATE TABLE IF NOT EXISTS morning_meeting_days (
  meeting_date  DATE PRIMARY KEY,
  reminder_id   UUID REFERENCES policy_reminders(id) ON DELETE SET NULL,
  pinned        BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_by     UUID REFERENCES employees(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Rotation reads this by reminder: last covered, and how many times.
CREATE INDEX IF NOT EXISTS idx_mm_days_reminder ON morning_meeting_days(reminder_id);

-- ── Seed: reminders drawn from rules already enforced elsewhere in the app ────
-- Seeded once, by title, so re-running the migration never duplicates or
-- resurrects a reminder that was edited or deactivated.
INSERT INTO policy_reminders (title, body, category)
SELECT * FROM (VALUES
  ('7:15 AM warehouse call',
   'Everyone is at the warehouse and ready at 7:15. The morning meeting runs 7:15–7:45. Arriving after 7:15 is logged as a Late strike and the minutes come out of paid time.',
   'conduct'),
  ('Any strike zeroes the week''s bonus',
   'One unvoided strike in a week means the weekly bonus is $0 — no matter how many positives were earned that week. Discretionary GG Points survive a strike, but not once the week hits the forfeit threshold.',
   'pay_benefits'),
  ('Report every damage, same day',
   'Damage reported the day it happens counts once against the bonus pool. Unreported damage counts 2× when it surfaces later. Say it out loud on the job — hiding it is what costs money.',
   'conduct'),
  ('Declining a job after Sunday 3 PM',
   'The schedule locks Sunday at 3 PM. A call-out after that cutoff is a Call-Out strike, not a decline. Look at your week and respond before the deadline.',
   'operations'),
  ('Tools on the truck, every day',
   'Leads and drivers are responsible for the full tool set being on the truck before roll-out. Missing tools is a strike on the crew member responsible.',
   'operations'),
  ('Uniform standard',
   'Company shirt, clean and tucked, work boots, no exceptions. Uniform violations are logged as a strike.',
   'conduct'),
  ('Hit the customer arrival window',
   'The arrival window we gave the customer is a promise. Missing it is a Missed Arrival Window strike on the crew. If you are going to be outside the window, the office hears about it before the customer does.',
   'operations'),
  ('Truck ready the night before',
   'Fuel, straps, pads, dollies, materials — checked and loaded before you leave. A truck that is not ready in the morning is a strike on the whole crew.',
   'vehicles'),
  ('Truck audits: 70% is the floor',
   'Audits below 70% are a Failed Audit strike. A clean audit earns Compliance Plus — a positive on the weekly bonus for everyone on that truck.',
   'vehicles'),
  ('5-star reviews pay the whole crew',
   'A named 5-star review credits every crew member on that job with a positive, which raises the weekly bonus multiplier. Ask for the review at the end of the move — every time.',
   'pay_benefits')
) AS seed(title, body, category)
WHERE NOT EXISTS (SELECT 1 FROM policy_reminders pr WHERE pr.title = seed.title);
