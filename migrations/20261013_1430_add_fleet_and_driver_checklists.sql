-- Fleet & driver compliance checklists.
--
-- Two grids on top of the existing compliance module:
--   * Owned-truck checklist — what's onboard each truck (insurance card,
--     registration copy, hazard triangles, listed on the MCS-150), plus the DOT
--     inspection, registration, PM and oil change for that truck.
--   * Driver files — application, DOT medical card, driver test, insurance
--     approval, for every driver.
--
-- Dated / uploaded things reuse what already exists: compliance_items (with
-- attachments) for inspection, registration and the driver documents, and
-- vehicle_pm_schedules for PM and oil changes. Only two things are new:
--
--   1. compliance_checks — plain yes/no boxes. A checkbox has no expiry and no
--      file, so it is not a compliance_item; forcing it into one would make every
--      "is the triangle kit onboard" row show up in the expiry registry.
--   2. compliance_items.standard_key — which checklist slot an item fills, so the
--      grid finds "this truck's DOT inspection" by key rather than by guessing
--      from a free-text name somebody may rename.
--
-- Additive and idempotent, except section 0, which is a one-time data fix
-- guarded so it never re-runs.

-- === 0. Which trucks are actually owned (one-time) ===========================
-- The original seed marked every materials truck 'owned'. Per Trent (2026-10-13)
-- only Bus, OG, Trace and the new Peanut are owned; the Idealease, Penske and
-- trailer units are leased (rentals stay 'rented'). Guarded on Peanut not yet
-- existing, so a re-run can never undo an ownership someone corrected by hand.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vehicles WHERE name = 'Peanut') THEN
    UPDATE vehicles
       SET ownership = 'leased', updated_at = NOW()
     WHERE ownership = 'owned'
       AND name NOT IN ('Bus', 'OG', 'Trace');

    INSERT INTO vehicles (name, vehicle_type, ownership)
    VALUES ('Peanut', 'box_truck', 'owned');
  END IF;
END $$;

-- === 1. Yes/no checks ========================================================
CREATE TABLE IF NOT EXISTS compliance_checks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Which box: 'insurance_card', 'registration_copy', 'hazard_triangles',
  -- 'mcs150_listed' (vehicle) or 'insurance_approved' (driver). Validated in app
  -- code against one list, so adding a box later is a code change, not a migration.
  check_key        TEXT NOT NULL,
  vehicle_id       UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  employee_id      UUID REFERENCES employees(id) ON DELETE CASCADE,
  checked          BOOLEAN NOT NULL DEFAULT FALSE,
  -- When it was last ticked or unticked, and by whom — "who said the triangles
  -- were onboard" is the question an inspector's finding raises.
  checked_on       DATE,
  checked_by       UUID REFERENCES employees(id) ON DELETE SET NULL,
  checked_by_name  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT compliance_checks_one_parent
    CHECK ((vehicle_id IS NOT NULL)::int + (employee_id IS NOT NULL)::int = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_checks_vehicle
  ON compliance_checks(vehicle_id, check_key) WHERE vehicle_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_checks_employee
  ON compliance_checks(employee_id, check_key) WHERE employee_id IS NOT NULL;

-- === 2. Checklist slots on compliance items ==================================
-- 'dot_inspection' / 'registration' on a vehicle; 'driver_application' /
-- 'medical_card' / 'driver_test' on an employee. NULL for everything else.
ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS standard_key TEXT;

-- One item per slot per truck / per driver — the grid's upsert relies on it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_items_vehicle_slot
  ON compliance_items(vehicle_id, standard_key)
  WHERE standard_key IS NOT NULL AND vehicle_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_items_employee_slot
  ON compliance_items(entity_employee_id, standard_key)
  WHERE standard_key IS NOT NULL AND entity_employee_id IS NOT NULL;
