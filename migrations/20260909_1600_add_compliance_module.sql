-- Compliance.
--
-- Every recurring legal and regulatory obligation the business carries, in one
-- place: GA Secretary of State annual registration, the GA DPS household-goods
-- mover certificate, the USDOT number and its biennial MCS-150 update, UCR,
-- commercial auto / cargo / general liability insurance, workers' comp, the
-- business license, the drug & alcohol testing program, per-vehicle registration
-- and DOT annual inspection, per-driver CDL and medical cards -- plus
-- preventative maintenance on the fleet.
--
-- All of that previously lived in someone's head. A lapsed cert or an unfiled
-- MCS-150 puts trucks off the road, so the cost of forgetting is the whole
-- reason this exists.
--
-- Two shapes, deliberately not forced into one table:
--   * compliance_items -- "a document from an authority that expires on a date".
--     One expiration_date, one renewal cycle. That covers everything above except
--     one thing.
--   * vehicle_pm_schedules -- preventative maintenance, which has TWO independent
--     clocks (every 5,000 miles OR 6 months, whichever comes first) and no
--     issuing authority or certificate. An expiration_date cannot express that,
--     which is why PM gets its own tables rather than being crammed in as a fake
--     compliance item.
--
-- Additive throughout. Idempotent throughout.

-- === 1. Vehicles =============================================================
-- Deliberately a NEW table rather than columns bolted onto materials' `trucks`.
--   * `trucks` is SERIAL-PK and means "a loading position on the count sheet" --
--     it has rows like 'Trailer', it carries warehouse_id, and materials code
--     treats deactivating one as a materials decision. A VIN and an insurance
--     expiration are not that concept.
--   * Every hub table since 20260722 is UUID-PK. Hanging UUID compliance rows off
--     a SERIAL PK owned by another module means an INTEGER FK that breaks this
--     module's conventions everywhere else.
--   * `trucks.name` is UNIQUE and `jobs.truck_name` is free text aimed at it, so
--     renaming a truck is already materials-visible. Compliance must not add a
--     second reason a truck row can't be renamed.
-- The two are LINKED, not merged: vehicles.truck_id is an optional pointer, and
-- the seed at the bottom of this section sets it automatically.
CREATE TABLE IF NOT EXISTS vehicles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT NOT NULL UNIQUE,
  truck_id            INTEGER REFERENCES trucks(id) ON DELETE SET NULL,
  vehicle_type        TEXT NOT NULL DEFAULT 'box_truck' CHECK (vehicle_type IN
                        ('box_truck','tractor','trailer','van','pickup','other')),
  year                INTEGER,
  make                TEXT,
  model               TEXT,
  vin                 TEXT,
  license_plate       TEXT,
  plate_state         TEXT NOT NULL DEFAULT 'GA',
  gvwr_lbs            INTEGER,
  -- Decides which obligations even apply: over 10,000 lbs GVWR is a commercial
  -- motor vehicle under FMCSA, which is what pulls in the DOT annual inspection,
  -- driver qualification files, and the MCS-150. Stored rather than computed from
  -- gvwr_lbs because the office knows the answer and the threshold has edge cases.
  is_cmv              BOOLEAN NOT NULL DEFAULT TRUE,
  ownership           TEXT NOT NULL DEFAULT 'owned'
                        CHECK (ownership IN ('owned','leased','rented')),
  -- Denormalized mirror of the newest odometer reading, so PM due-by-mileage stays
  -- a single-table comparison instead of a correlated subquery on every dashboard
  -- load. Written ONLY by recordOdometer()/logService(), alongside the reading.
  current_odometer    INTEGER,
  odometer_updated_on DATE,
  -- The id Motive knows this vehicle by. Nothing reads it yet; it is here so the
  -- planned weekly telematics import is an INSERT rather than a migration.
  motive_vehicle_id   TEXT,
  in_service_date     DATE,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial uniques: VIN, plate and the truck link are unique WHEN KNOWN, but most
-- rows start with all three NULL while the office fills them in.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_vin
  ON vehicles(vin) WHERE vin IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_truck
  ON vehicles(truck_id) WHERE truck_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_motive
  ON vehicles(motive_vehicle_id) WHERE motive_vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_active ON vehicles(active);

-- Seed the fleet from the materials trucks so the vehicle picker is not empty on
-- day one and the link is made without data entry. Name-only rows; the office
-- adds VIN and plate. 'Trailer' comes across too -- it is a real asset with a
-- real registration.
INSERT INTO vehicles (name, truck_id, vehicle_type)
SELECT t.name, t.id,
       CASE WHEN t.name ILIKE '%trailer%' THEN 'trailer' ELSE 'box_truck' END
  FROM trucks t
 WHERE t.active = TRUE
ON CONFLICT (name) DO NOTHING;

-- === 2. Odometer readings ====================================================
-- A history table rather than only the mirror column above, because the plan is
-- to pull mileage from Motive weekly. With a table that import is an INSERT, and
-- "which trucks have not reported" becomes answerable; with only a column it is
-- an overwrite that loses the question.
CREATE TABLE IF NOT EXISTS vehicle_odometer_readings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id   UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  reading_date DATE NOT NULL,
  odometer     INTEGER NOT NULL CHECK (odometer >= 0),
  source       TEXT NOT NULL DEFAULT 'manual'
                 CHECK (source IN ('manual','service_log','motive','import')),
  note         TEXT,
  recorded_by  UUID REFERENCES employees(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Re-running an import for the same day is a no-op rather than a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_odometer_unique
  ON vehicle_odometer_readings(vehicle_id, reading_date, source);
CREATE INDEX IF NOT EXISTS idx_odometer_vehicle
  ON vehicle_odometer_readings(vehicle_id, reading_date DESC);

-- === 3. Compliance items =====================================================
-- Entity modelling: typed nullable FKs plus a discriminator, NOT an
-- entity_type/entity_id polymorphic pair. A polymorphic id cannot carry a foreign
-- key, so a deleted vehicle would silently orphan its registration row; and every
-- read joins for a display label anyway, which costs the same two LEFT JOINs with
-- none of the integrity. There are exactly three entity kinds and no fourth is
-- coming -- a customer or a job never holds a recurring permit.
--
-- The discriminator column still earns its place: "show me company-level items"
-- is a top-level filter, and it lets the CHECK below make the invalid
-- combinations unrepresentable rather than merely discouraged.
CREATE TABLE IF NOT EXISTS compliance_items (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               TEXT NOT NULL,
  category           TEXT NOT NULL DEFAULT 'other' CHECK (category IN (
                       'vehicle_registration','vehicle_inspection','insurance',
                       'operating_authority','state_filing','permit_license',
                       'tax_filing','driver_qualification','safety_program',
                       'environmental','other')),

  entity_type        TEXT NOT NULL DEFAULT 'company'
                       CHECK (entity_type IN ('company','vehicle','employee')),
  -- Both CASCADE, and neither can be SET NULL: the entity CHECK below requires the
  -- column to be non-null whenever entity_type names it, so SET NULL would turn a
  -- delete into a constraint violation. (Employees are only ever soft-deleted in
  -- this app, so in practice neither fires.)
  vehicle_id         UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  entity_employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,

  issuing_authority  TEXT,
  identifier         TEXT,
  issue_date         DATE,
  -- NULL means no expiry -- the USDOT number itself never lapses, only the
  -- biennial update filed against it does (which is its own item).
  expiration_date    DATE,

  -- Cadence as a NUMBER of months, not an enum of words. 12 = annual, 24 = the
  -- biennial MCS-150, 3 = quarterly IFTA. An enum would need a months lookup
  -- anyway to prefill the next expiration on renewal, and 'biennial' is exactly
  -- the word the next person retypes as 'bi-annual', which means the opposite.
  cadence_months     INTEGER CHECK (cadence_months IS NULL OR cadence_months > 0),

  -- How much runway this obligation needs, PER ITEM. Insurance wants 45 days of
  -- warning, a tag renewal 14, the MCS-150 60. One app-wide threshold makes
  -- everything alarm on the same day and the dashboard stops being read.
  lead_time_days     INTEGER NOT NULL DEFAULT 30 CHECK (lead_time_days >= 0),

  cost               DECIMAL(10,2),
  -- Who chases the renewal. SET NULL on purpose: the obligation outlives its
  -- owner leaving, and then shows up unowned -- which is the correct alarm.
  owner_employee_id  UUID REFERENCES employees(id) ON DELETE SET NULL,

  -- LIFECYCLE, not urgency. Urgency (expired / due_soon / ok) is derived from
  -- expiration_date + lead_time_days on every read and is never stored: a stored
  -- urgency is wrong the moment the clock passes midnight and nothing writes the
  -- row, which is the precise failure this module exists to prevent.
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','archived','not_applicable')),
  external_url       TEXT,
  notes              TEXT,
  -- Same flag the policies table uses: these rows were seeded from general
  -- knowledge of what a Georgia household-goods mover owes, not from GoodGuys'
  -- actual filings. It marks which ones still need a human to confirm.
  needs_review       BOOLEAN NOT NULL DEFAULT FALSE,
  created_by         UUID REFERENCES employees(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_items_entity_chk') THEN
    ALTER TABLE compliance_items ADD CONSTRAINT compliance_items_entity_chk CHECK (
      (entity_type = 'company'  AND vehicle_id IS NULL     AND entity_employee_id IS NULL)
   OR (entity_type = 'vehicle'  AND vehicle_id IS NOT NULL AND entity_employee_id IS NULL)
   OR (entity_type = 'employee' AND vehicle_id IS NULL     AND entity_employee_id IS NOT NULL)
    );
  END IF;
END $$;

-- The dashboard's only hot query is "active items, soonest expiration first".
CREATE INDEX IF NOT EXISTS idx_compliance_items_due
  ON compliance_items(expiration_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_compliance_items_owner    ON compliance_items(owner_employee_id);
CREATE INDEX IF NOT EXISTS idx_compliance_items_vehicle  ON compliance_items(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_compliance_items_employee ON compliance_items(entity_employee_id);
CREATE INDEX IF NOT EXISTS idx_compliance_items_category ON compliance_items(category);

-- === 4. Renewal history ======================================================
-- One child row per completed cycle, with compliance_items mirroring the newest
-- one -- NOT a new item row per cycle. The dashboard, the nav badge, the owner
-- assignment and the attachments all key off one stable row per obligation;
-- new-row-per-cycle turns every one of those into a DISTINCT ON window query and
-- needs an invented grouping key, which is a parent identity without a table.
-- Owner, lead time and the portal URL are properties of the obligation, not of
-- the cycle, so they would drift on every copy.
CREATE TABLE IF NOT EXISTS compliance_renewals (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id             UUID NOT NULL REFERENCES compliance_items(id) ON DELETE CASCADE,
  -- The NEW period this filing bought, not the one it replaced.
  issue_date          DATE,
  expiration_date     DATE,
  completed_on        DATE NOT NULL DEFAULT CURRENT_DATE,
  cost                DECIMAL(10,2),
  confirmation_number TEXT,
  notes               TEXT,
  completed_by        UUID REFERENCES employees(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compliance_renewals_item
  ON compliance_renewals(item_id, expiration_date DESC NULLS LAST);

-- === 5. Preventative maintenance schedules ===================================
CREATE TABLE IF NOT EXISTS vehicle_pm_schedules (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id            UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  service_type          TEXT NOT NULL DEFAULT 'other' CHECK (service_type IN (
                          'oil_change','tire_rotation','tires_replace','brake_inspection',
                          'dot_annual_inspection','transmission','coolant','air_filter',
                          'liftgate_service','pm_a','pm_b','other')),
  custom_label          TEXT,
  interval_miles        INTEGER CHECK (interval_miles IS NULL OR interval_miles > 0),
  interval_days         INTEGER CHECK (interval_days  IS NULL OR interval_days  > 0),
  last_service_date     DATE,
  last_service_odometer INTEGER,

  -- GENERATED, not maintained by app code. `date + integer` and `integer +
  -- integer` are both immutable, so STORED works -- which means next-due can
  -- never drift from the interval that produced it, and correcting a mistyped
  -- interval recomputes it for free. NULL until a baseline service exists, which
  -- is why the derived PM state has an 'unknown' case.
  next_due_date         DATE    GENERATED ALWAYS AS (last_service_date + interval_days) STORED,
  next_due_odometer     INTEGER GENERATED ALWAYS AS (last_service_odometer + interval_miles) STORED,

  -- PM's own runway. Miles needs a separate number from days because "500 miles
  -- out" is one busy Saturday, not two weeks.
  lead_time_days        INTEGER NOT NULL DEFAULT 14 CHECK (lead_time_days >= 0),
  lead_miles            INTEGER NOT NULL DEFAULT 500 CHECK (lead_miles >= 0),

  active                BOOLEAN NOT NULL DEFAULT TRUE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_pm_schedules_interval_chk') THEN
    -- A schedule with neither clock set can never come due. That is worse than
    -- not existing: it looks like coverage and provides none.
    ALTER TABLE vehicle_pm_schedules ADD CONSTRAINT vehicle_pm_schedules_interval_chk
      CHECK (interval_miles IS NOT NULL OR interval_days IS NOT NULL);
  END IF;
END $$;

-- One schedule per service type per vehicle. COALESCE on the label so two
-- differently-named 'other' schedules can coexist, but two unnamed ones cannot.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pm_schedules_unique
  ON vehicle_pm_schedules(vehicle_id, service_type, COALESCE(custom_label, ''));
CREATE INDEX IF NOT EXISTS idx_pm_schedules_due
  ON vehicle_pm_schedules(next_due_date) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_pm_schedules_vehicle ON vehicle_pm_schedules(vehicle_id);

-- === 6. Service log ==========================================================
-- The ledger of what was actually done. The schedule above is only a reminder
-- derived from the newest entry here.
--
-- pm_schedule_id is nullable and SET NULL on purpose: a roadside brake job is
-- real history belonging to the VEHICLE, and retiring a schedule must not erase
-- what was done under it.
--
-- No CHECK on service_type here, deliberately: ad-hoc repairs are the majority of
-- real entries, and an enum would either need extending constantly or get worked
-- around as 'other' plus a note, which loses the information anyway. The SCHEDULE
-- is enum-constrained because that is what the due-logic keys off.
CREATE TABLE IF NOT EXISTS vehicle_service_log (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id     UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  pm_schedule_id UUID REFERENCES vehicle_pm_schedules(id) ON DELETE SET NULL,
  service_type   TEXT NOT NULL DEFAULT 'other',
  description    TEXT,
  service_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  odometer       INTEGER,
  vendor         TEXT,
  invoice_number TEXT,
  cost           DECIMAL(10,2),
  performed_by   UUID REFERENCES employees(id),
  logged_by      UUID REFERENCES employees(id),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_log_vehicle
  ON vehicle_service_log(vehicle_id, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_service_log_schedule ON vehicle_service_log(pm_schedule_id);

-- === 7. Attachments ==========================================================
-- The FILE still lives in `documents` + Vercel Blob (private) and is still served
-- ONLY by /api/documents/[id]/download, which re-checks the caller and the
-- audience. Compliance uploads are written with audience='back_office', so crew
-- are locked out by the route that already exists -- no second download route and
-- no second auth surface to get wrong.
--
-- A join table rather than nullable item_id/renewal_id/service_log_id columns ON
-- `documents`: that table is owned by the policies module and read by the crew
-- handbook page, and pointing four compliance FKs at it couples the two modules
-- both ways. A join table keeps the dependency one-directional. It also lets one
-- certificate hang off both an item and the specific renewal that produced it,
-- which columns would force a choice between.
CREATE TABLE IF NOT EXISTS compliance_attachments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id    UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  item_id        UUID REFERENCES compliance_items(id) ON DELETE CASCADE,
  renewal_id     UUID REFERENCES compliance_renewals(id) ON DELETE CASCADE,
  service_log_id UUID REFERENCES vehicle_service_log(id) ON DELETE CASCADE,
  vehicle_id     UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  created_by     UUID REFERENCES employees(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compliance_attachments_parent_chk') THEN
    -- Exactly one parent. An attachment pointing at nothing is invisible in every
    -- UI and unreachable except by id.
    ALTER TABLE compliance_attachments ADD CONSTRAINT compliance_attachments_parent_chk CHECK (
      (item_id IS NOT NULL)::int + (renewal_id IS NOT NULL)::int
    + (service_log_id IS NOT NULL)::int + (vehicle_id IS NOT NULL)::int = 1
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comp_attach_item     ON compliance_attachments(item_id);
CREATE INDEX IF NOT EXISTS idx_comp_attach_renewal  ON compliance_attachments(renewal_id);
CREATE INDEX IF NOT EXISTS idx_comp_attach_service  ON compliance_attachments(service_log_id);
CREATE INDEX IF NOT EXISTS idx_comp_attach_vehicle  ON compliance_attachments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_comp_attach_document ON compliance_attachments(document_id);

-- Without this, every insurance certificate and registration lands in
-- /admin/documents next to the handbook and the SOPs. Additive, defaults to the
-- existing behaviour, and getDocuments() gains one WHERE clause.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'library';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_source_chk') THEN
    ALTER TABLE documents ADD CONSTRAINT documents_source_chk
      CHECK (source IN ('library','compliance'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source);

-- === 8. Seed the standing obligations ========================================
-- Dates are left blank on purpose -- nobody should guess when the policy renews.
-- These are the checklist, flagged needs_review so it is impossible to forget
-- which rows were drafted from general knowledge rather than from the filings.
-- Guarded on name so re-running this migration adds nothing.
INSERT INTO compliance_items (name, category, entity_type, issuing_authority,
                              cadence_months, lead_time_days, needs_review, notes)
SELECT v.name, v.category, 'company', v.authority, v.cadence, v.lead, TRUE, v.note
  FROM (VALUES
    ('Georgia Annual Registration', 'state_filing', 'GA Secretary of State', 12, 30,
     'Due between Jan 1 and Apr 1 each year.'),
    ('USDOT Number', 'operating_authority', 'FMCSA', NULL, 30,
     'The number itself does not expire -- the biennial MCS-150 update below is what lapses.'),
    ('MCS-150 Biennial Update', 'operating_authority', 'FMCSA', 24, 60,
     'Due by the last day of the month based on the USDOT number.'),
    ('UCR Registration', 'operating_authority', 'Unified Carrier Registration', 12, 30,
     'Registration opens in the fall for the following calendar year.'),
    ('Georgia Household Goods Mover Certificate', 'permit_license', 'GA Dept. of Public Safety', 12, 45,
     'Intrastate household goods authority. Requires proof of insurance on file with DPS.'),
    ('Commercial Auto Liability', 'insurance', NULL, 12, 45, NULL),
    ('Cargo Insurance', 'insurance', NULL, 12, 45,
     'GA DPS requires a minimum cargo limit for household goods movers.'),
    ('General Liability Insurance', 'insurance', NULL, 12, 45, NULL),
    ('Workers'' Compensation', 'insurance', NULL, 12, 45,
     'Required in Georgia at three or more employees.'),
    ('Business License', 'permit_license', 'City of Atlanta / Fulton County', 12, 30, NULL),
    ('Drug & Alcohol Testing Program', 'safety_program', 'FMCSA', 12, 30,
     'DOT-regulated consortium enrollment and the annual MIS report.')
  ) AS v(name, category, authority, cadence, lead, note)
 WHERE NOT EXISTS (SELECT 1 FROM compliance_items c WHERE c.name = v.name);
