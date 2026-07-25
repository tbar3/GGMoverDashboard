-- Add back-office roles 'admin' and 'sales', and a locations table managed from
-- the new Admin Settings tab. Crew roles stay driver/lead/helper.

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check
  CHECK (role = ANY (ARRAY['owner', 'admin', 'manager', 'sales', 'driver', 'lead', 'helper']));

CREATE TABLE IF NOT EXISTS locations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  address    TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
