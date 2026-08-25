-- Policies + Documents.
--
-- Two crew-facing surfaces the hub has been missing:
--   * policies  — the handbook, written and edited in the app, readable by crew.
--   * documents — real files (handbook PDF, SOPs, forms) stored in Vercel Blob.
--
-- This also MERGES Morning Meeting's policy_reminders into policies, per the
-- decision that there should be one list, not two that drift. The reminders keep
-- their ids, so everything already pointing at them keeps pointing at the right
-- row — the pointers are simply re-aimed at the new table.
--
-- Additive except for the deliberate merge at the end. Idempotent throughout.

-- ── 1. Policies ──────────────────────────────────────────────────────────────
-- Categories match the approved policies design (docs/superpowers/specs/
-- 2026-07-22-policies-design.md), which is also what policy_reminders used, so
-- the merge below needs no value mapping.
--
-- Deliberately NO policy_versions / policy_acknowledgements tables: sign-off
-- tracking was explicitly deferred. Versioning in that design existed to anchor
-- acknowledgements to exact wording, so with no sign-off there is nothing for it
-- to anchor. Adding it later means a new table plus a backfill of version 1 from
-- these rows — not a rewrite.
CREATE TABLE IF NOT EXISTS policies (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        TEXT NOT NULL,
  title_es     TEXT,
  body_en      TEXT NOT NULL DEFAULT '',
  body_es      TEXT,
  category     TEXT NOT NULL DEFAULT 'general' CHECK (category IN
                 ('safety','conduct','pay_benefits','operations','vehicles','general')),
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  -- Published policies crew can read; in_rotation is the narrower question of
  -- whether it also works as a 30-second Policy of the Day. A long handbook
  -- section can be published and still be a poor thing to read out at 7:15.
  in_rotation  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES employees(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_category ON policies(category);
CREATE INDEX IF NOT EXISTS idx_policies_rotation
  ON policies(in_rotation) WHERE status = 'published' AND in_rotation = TRUE;

-- ── 2. Documents ─────────────────────────────────────────────────────────────
-- The file itself lives in Vercel Blob under PRIVATE access; this table holds the
-- metadata and the blob pointer. Crew never get the blob URL — they go through an
-- authenticated download route that checks `audience` first. That is the whole
-- reason for private access: a public blob URL is a permanent unauthenticated
-- link to an insurance cert the moment it leaks.
CREATE TABLE IF NOT EXISTS documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             TEXT NOT NULL,
  description       TEXT,
  category          TEXT NOT NULL DEFAULT 'general' CHECK (category IN
                      ('safety','conduct','pay_benefits','operations','vehicles','general')),
  audience          TEXT NOT NULL DEFAULT 'crew' CHECK (audience IN ('crew','back_office')),
  blob_url          TEXT NOT NULL,
  blob_pathname     TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  content_type      TEXT,
  size_bytes        BIGINT,
  is_handbook       BOOLEAN NOT NULL DEFAULT FALSE,  -- pinned to the top for crew
  uploaded_by       UUID REFERENCES employees(id),
  uploaded_by_name  TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_audience ON documents(audience);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);

-- ── 3. Merge policy_reminders into policies ──────────────────────────────────
-- Ids are carried over verbatim. That is what makes the re-pointing below a
-- constraint swap rather than a data migration with a lookup table.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = current_schema() AND table_name = 'policy_reminders') THEN

    INSERT INTO policies (id, title, body_en, category, status, in_rotation, created_by, created_at)
    SELECT r.id, r.title, COALESCE(r.body, ''), r.category,
           -- A retired reminder becomes an archived policy: out of the rotation
           -- and out of the crew's list, but its history stays readable.
           CASE WHEN r.is_active THEN 'published' ELSE 'archived' END,
           r.is_active, r.created_by, r.created_at
      FROM policy_reminders r
    ON CONFLICT (id) DO NOTHING;

    -- Re-aim Morning Meeting at policies, and rename the columns to say so.
    ALTER TABLE morning_meeting_days
      DROP CONSTRAINT IF EXISTS morning_meeting_days_reminder_id_fkey;
    ALTER TABLE morning_meeting_notes
      DROP CONSTRAINT IF EXISTS morning_meeting_notes_reminder_id_fkey;

    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'morning_meeting_days' AND column_name = 'reminder_id') THEN
      ALTER TABLE morning_meeting_days RENAME COLUMN reminder_id TO policy_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'morning_meeting_notes' AND column_name = 'reminder_id') THEN
      ALTER TABLE morning_meeting_notes RENAME COLUMN reminder_id TO policy_id;
    END IF;

    ALTER TABLE morning_meeting_days
      ADD CONSTRAINT morning_meeting_days_policy_id_fkey
      FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE SET NULL;
    ALTER TABLE morning_meeting_notes
      ADD CONSTRAINT morning_meeting_notes_policy_id_fkey
      FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE SET NULL;

    DROP INDEX IF EXISTS idx_mm_days_reminder;
    CREATE INDEX IF NOT EXISTS idx_mm_days_policy ON morning_meeting_days(policy_id);

    DROP TABLE policy_reminders;
  END IF;
END $$;

-- Seeded reminders were written from rules found in the code, not from the real
-- handbook. Flag that on the row itself so the admin list can show which policies
-- still need a human to check them against the handbook — and so it is impossible
-- to forget which ones were drafted by inference.
ALTER TABLE policies ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE policies SET needs_review = TRUE
 WHERE created_at < TIMESTAMPTZ '2026-08-25 00:00:00-04' AND needs_review = FALSE;
