-- Morning Meeting — Culture.
--
-- One culture card per meeting: a core value, the mission, the purpose, or
-- anything else worth repeating. It rotates least-recently-shown first, exactly
-- like Policy of the Day, and can be pinned for the day.
--
--   culture_items               — the list, edited from the Morning Meeting page
--   morning_meeting_culture_days — which item each meeting covered. Its own table
--     rather than a column on morning_meeting_days: "back to rotation" for the
--     policy DELETES that day's row, and it must not take the culture pick with it.
--
-- Seeded with the six core values the hiring scorecard already interviews for
-- (src/lib/interview-scorecard.ts), names only — the wording is Trent's to write.
-- Mission and Purpose start as empty slots so the editor shows where they go;
-- an empty mission or purpose never rotates (see getCultureOfDay).
--
-- Additive and idempotent. No updated_at trigger — none exist in this schema.

CREATE TABLE IF NOT EXISTS culture_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind        TEXT NOT NULL DEFAULT 'core_value'
                CHECK (kind IN ('core_value', 'mission', 'purpose', 'vision', 'other')),
  title       TEXT NOT NULL,
  body        TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_culture_items_order ON culture_items(sort_order, created_at);

CREATE TABLE IF NOT EXISTS morning_meeting_culture_days (
  meeting_date     DATE PRIMARY KEY,
  culture_item_id  UUID REFERENCES culture_items(id) ON DELETE SET NULL,
  pinned           BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_by        UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mm_culture_days_item ON morning_meeting_culture_days(culture_item_id);

-- Seed only into an empty list, so re-running never resurrects something deleted.
INSERT INTO culture_items (kind, title, sort_order)
SELECT v.kind, v.title, v.sort_order
  FROM (VALUES
    ('mission', 'Our Mission', 10),
    ('purpose', 'Our Purpose', 20),
    ('core_value', 'Radical Hospitality', 30),
    ('core_value', 'People over Profit', 40),
    ('core_value', 'Do the Right Thing', 50),
    ('core_value', 'Always be Learning', 60),
    ('core_value', 'Communication is Key', 70),
    ('core_value', 'No Complaints without Solutions', 80)
  ) AS v(kind, title, sort_order)
 WHERE NOT EXISTS (SELECT 1 FROM culture_items);
