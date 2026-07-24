-- Skills / pay-scale module.
--
-- Pay scale: base rate (CONFIG.BASE_HOURLY_RATE = $18) + each earned skill's
-- raise. An employee's effective rate = COALESCE(hourly_rate override,
-- base + sum of earned skills' raise_amount). The `skills` catalog is seeded
-- from the GoodGuys pay scale (10 skills at $1 each) but is editable.
--
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS skills (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL UNIQUE,
  raise_amount  NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_skills (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  skill_id      UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  granted_by    UUID REFERENCES employees(id),
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The employee sees a celebration for a newly-granted skill until they
  -- acknowledge it on their dashboard.
  acknowledged  BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (employee_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_skills_employee ON employee_skills(employee_id);

-- Seed the pay-scale skills (idempotent by unique name; keeps existing edits).
INSERT INTO skills (name, raise_amount, sort_order) VALUES
  ('Box Mover', 1.00, 1),
  ('1 Year+ Moving Experience', 1.00, 2),
  ('Wrapping Certified', 1.00, 3),
  ('Packing Certified', 1.00, 4),
  ('Stacking Certified', 1.00, 5),
  ('Driver', 1.00, 6),
  ('Crew Lead', 1.00, 7),
  ('Bilingual', 1.00, 8),
  ('Specialty Mover (Piano/Hot Tub)', 1.00, 9),
  ('2-Truck Job Lead', 1.00, 10)
ON CONFLICT (name) DO NOTHING;
