-- Payroll: W-2 vs 1099 classification drives which ADP output an employee lands in
-- (ADP-W2 = regular/OT hours split; ADP-1099 = comp-hours with the OT premium baked
-- in). `aliases` maps alternate report names to one employee (e.g. the sales name
-- "Cameron Woods" and the labor name "Cam Woods" are the same person).
--
-- Additive, idempotent.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS classification TEXT
  CHECK (classification IN ('W-2', '1099'));

ALTER TABLE employees ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';
