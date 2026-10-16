-- Fleet: one place to manage a truck for compliance, materials and jobs.
--
-- Jobs name their truck in free text from the calendar ("#1 OG", "#2 The Bus"),
-- and that text has never matched the truck's name ("OG", "Bus"), so no job could
-- be tied to a truck. Rather than rename trucks to whatever the calendar happens
-- to say, each vehicle records the names the calendar uses for it. The Fleet page
-- reads this to flag calendar names that match no truck at all.
--
-- Array, not a child table: it is a handful of short strings per truck, read and
-- written whole from one form. Matching is case-insensitive in the app.
--
-- Additive and idempotent. No updated_at trigger — this schema has none.

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS calendar_names TEXT[] NOT NULL DEFAULT '{}';
