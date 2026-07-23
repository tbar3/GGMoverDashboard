-- Materials management port — schema (hub roadmap step 5)
--
-- Rebuilt from the LIVE structure of the gg-materials-management database
-- (introspected read-only 2026-07-23), NOT from that app's committed
-- db/schema.sql, which had drifted: it was missing the equipment,
-- job_equipment, and warehouses tables and several warehouse_id / low_level
-- columns that exist in production.
--
-- Side-by-side port: tables land in this hub's schema (mover_dashboard) keeping
-- their own SERIAL keys and data. The one rename is the materials app's `jobs`
-- table -> `materials_jobs`, because `jobs` already exists in the hub (a
-- different concept: SmartMoving moves). Every FK that referenced jobs is
-- repointed to materials_jobs.
--
-- The old `allowed_users` invite table is intentionally NOT created — access in
-- the hub is governed by lib/auth.ts (requireEmployee / requireBackOffice).
--
-- Additive only: touches nothing the hub already has. Idempotent.

-- ── Catalogs ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warehouses (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS materials (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,
  par               NUMERIC(10,2) NOT NULL DEFAULT 0,   -- supports half units
  reorder_threshold INTEGER NOT NULL DEFAULT 0,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  cost_per_unit     NUMERIC(10,2) NOT NULL DEFAULT 0,   -- reporting only
  charge_per_unit   NUMERIC(10,2) NOT NULL DEFAULT 0,   -- reporting only
  low_alert_tier    TEXT NOT NULL DEFAULT 'ok',         -- ok|warn20|warn10|warn5|critical
  is_storage_pad    BOOLEAN NOT NULL DEFAULT FALSE,     -- flags the storage-in pad item
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trucks (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  warehouse_id INTEGER REFERENCES warehouses(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  par            INTEGER NOT NULL DEFAULT 0,            -- whole units (unlike materials)
  total_on_hand  INTEGER NOT NULL DEFAULT 0,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  is_storage_pad BOOLEAN NOT NULL DEFAULT FALSE,
  low_alerted    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Stock ledgers ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warehouse_stock (
  warehouse_id   INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  material_id    INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  on_hand        NUMERIC(10,2) NOT NULL DEFAULT 0,
  low_level      INTEGER NOT NULL DEFAULT 0,
  low_alert_tier TEXT NOT NULL DEFAULT 'ok',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (warehouse_id, material_id)
);

CREATE TABLE IF NOT EXISTS truck_stock (
  truck_id    INTEGER NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  on_hand     NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (truck_id, material_id)
);

-- ── Jobs (renamed from the materials app's `jobs`) ──────────────────────────

CREATE TABLE IF NOT EXISTS materials_jobs (
  id                     SERIAL PRIMARY KEY,
  job_date               DATE NOT NULL,
  truck_id               INTEGER NOT NULL REFERENCES trucks(id),
  sequence_no            INTEGER NOT NULL DEFAULT 1,     -- nth job of the day for that truck
  customer               TEXT,
  job_number             TEXT,
  crew_lead              TEXT,
  crew                   TEXT,                            -- chosen names, free text
  status                 TEXT NOT NULL DEFAULT 'draft',   -- draft | complete
  entered_in_smartmoving BOOLEAN NOT NULL DEFAULT FALSE,
  morning_routine        JSONB NOT NULL DEFAULT '{}'::jsonb,
  close_routine          JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_storage_in          BOOLEAN NOT NULL DEFAULT FALSE,
  storage_pads_used      INTEGER,
  created_by             TEXT,                            -- Clerk user id of creator
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_materials_jobs_date ON materials_jobs(job_date);
CREATE INDEX IF NOT EXISTS idx_materials_jobs_truck_date ON materials_jobs(truck_id, job_date);
CREATE INDEX IF NOT EXISTS idx_materials_jobs_created_by ON materials_jobs(created_by);

CREATE TABLE IF NOT EXISTS job_counts (
  job_id        INTEGER NOT NULL REFERENCES materials_jobs(id) ON DELETE CASCADE,
  material_id   INTEGER NOT NULL REFERENCES materials(id),
  pre_dispatch  NUMERIC(10,2),
  post_dispatch NUMERIC(10,2),
  post_job      NUMERIC(10,2),
  charged       NUMERIC(10,2),                            -- for the leakage report
  par_entered   NUMERIC(10,2),                            -- crew-typed par
  used          NUMERIC(10,2) GENERATED ALWAYS AS (post_dispatch - post_job) STORED,
  PRIMARY KEY (job_id, material_id)
);

CREATE TABLE IF NOT EXISTS job_equipment (
  job_id         INTEGER NOT NULL REFERENCES materials_jobs(id) ON DELETE CASCADE,
  equipment_id   INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  dispatch_count INTEGER,
  after_count    INTEGER,
  PRIMARY KEY (job_id, equipment_id)
);

-- ── Audit ledger ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id           SERIAL PRIMARY KEY,
  material_id  INTEGER NOT NULL REFERENCES materials(id),
  truck_id     INTEGER REFERENCES trucks(id),
  warehouse_id INTEGER,                                   -- nullable; no FK on live either
  job_id       INTEGER REFERENCES materials_jobs(id) ON DELETE SET NULL,
  type         TEXT NOT NULL,                             -- receive|load|use|adjust|return
  qty_delta    NUMERIC(10,2) NOT NULL,
  note         TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_txn_material ON inventory_transactions(material_id);
CREATE INDEX IF NOT EXISTS idx_txn_job ON inventory_transactions(job_id);
CREATE INDEX IF NOT EXISTS idx_txn_type_created ON inventory_transactions(type, created_at);

-- ── Admin-managed config ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS routine_items (
  id         SERIAL PRIMARY KEY,
  phase      TEXT NOT NULL CHECK (phase IN ('morning', 'close')),
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_routine_phase ON routine_items(phase, sort_order);

-- Roster of names for the count-sheet crew multi-select. Kept separate from
-- employees for the side-by-side port; merging is a later step.
CREATE TABLE IF NOT EXISTS crew_members (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
