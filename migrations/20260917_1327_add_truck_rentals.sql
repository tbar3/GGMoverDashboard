-- Rental Truck Board.
--
-- Three things slip today and they are all timing: we do not know the day by
-- which a truck has to be BOOKED, we do not know the day it should go BACK, and
-- there is no process for what has to happen before it can be returned.
--
-- The board derives the first two from booked SmartMoving demand (see
-- src/lib/rentals-windows.ts) and this migration stores only what cannot be
-- derived: the rental we actually took, and the return checklist.
--
-- Deliberately NO window/forecast table. Windows are recomputed from jobs on
-- every load, so there is nothing to drift out of date when bookings change.
--
-- Additive and idempotent. No updated_at trigger — this schema has none; actions
-- set updated_at = NOW() by hand, like every other module here.

-- ── 1. The rental ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS truck_rentals (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor           TEXT NOT NULL,
  vendor_ref       TEXT,                    -- reservation / confirmation number
  size             TEXT,                    -- 16', 26'

  -- What this rental COVERS. Compared against freshly computed demand windows to
  -- answer "should it stay out longer?" and "could it go back a day early?".
  needed_from      DATE NOT NULL,
  est_return_date  DATE NOT NULL,

  status           TEXT NOT NULL DEFAULT 'planned'
                     CHECK (status IN ('planned', 'booked', 'picked_up', 'returned', 'cancelled')),
  picked_up_at     TIMESTAMPTZ,
  returned_at      TIMESTAMPTZ,

  -- A rental is a working truck while we have it: pickup creates or reactivates
  -- the materials truck so crews can load it, plus a fleet vehicle row with
  -- ownership='rented'. Return deactivates both so it leaves the count sheets.
  truck_id         INTEGER REFERENCES trucks(id) ON DELETE SET NULL,
  vehicle_id       UUID REFERENCES vehicles(id) ON DELETE SET NULL,

  daily_rate       NUMERIC(10, 2),
  notes            TEXT,

  created_by       UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_by_name  TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT truck_rentals_dates_ordered CHECK (est_return_date >= needed_from)
);

-- The board's hot query: everything not yet closed out, by when it is needed.
CREATE INDEX IF NOT EXISTS idx_truck_rentals_open
  ON truck_rentals(status, needed_from)
  WHERE status IN ('planned', 'booked', 'picked_up');
CREATE INDEX IF NOT EXISTS idx_truck_rentals_truck ON truck_rentals(truck_id);

-- ── 2. The offload checklist template ────────────────────────────────────────
-- Mirrors routine_items (the established admin-editable checklist pattern).
-- system_key marks an item with live behaviour attached; NULL is a plain tick.
CREATE TABLE IF NOT EXISTS rental_offload_items (
  id          SERIAL PRIMARY KEY,
  label       TEXT NOT NULL,
  system_key  TEXT UNIQUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rental_offload_items_active
  ON rental_offload_items(active, sort_order);

-- ── 3. What was actually done, and by whom ───────────────────────────────────
-- Rows rather than a TEXT[] of ids: "who said the truck was empty, and when" is
-- the entire value of the checklist when a vendor charge shows up next week.
CREATE TABLE IF NOT EXISTS rental_offload_checks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rental_id       UUID NOT NULL REFERENCES truck_rentals(id) ON DELETE CASCADE,
  item_id         INTEGER NOT NULL REFERENCES rental_offload_items(id) ON DELETE CASCADE,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_by      UUID REFERENCES employees(id) ON DELETE SET NULL,
  checked_by_name TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Ticking twice is the same fact, so the write can be a plain upsert.
  UNIQUE (rental_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_rental_offload_checks_rental
  ON rental_offload_checks(rental_id);

-- ── 4. Seeds ─────────────────────────────────────────────────────────────────
-- Seeded by label so re-running never duplicates or resurrects an item the
-- office edited or switched off.
INSERT INTO rental_offload_items (label, system_key, sort_order)
SELECT * FROM (VALUES
  ('Materials offloaded back to the warehouse', 'materials_offloaded', 10),
  ('Equipment, pads and dollies off the truck',  NULL::TEXT,           20),
  ('Back of truck swept / blown out',            NULL::TEXT,           30),
  ('Trash removed from cab and box',             NULL::TEXT,           40),
  ('Fuel level photographed',                    NULL::TEXT,           50),
  ('Personal items removed',                     NULL::TEXT,           60),
  ('Damage photos taken (walk the whole truck)', NULL::TEXT,           70),
  ('Rental paperwork collected',                 NULL::TEXT,           80)
) AS seed(label, system_key, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM rental_offload_items r WHERE r.label = seed.label
);

-- Book-by date = needed_from - this many days. Editable on the board; the code
-- falls back to CONFIG.RENTAL_LEAD_TIME_DAYS if the row is missing.
INSERT INTO app_settings (key, value) VALUES ('rental_lead_time_days', '3')
ON CONFLICT (key) DO NOTHING;
