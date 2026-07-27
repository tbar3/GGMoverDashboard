-- Seed the equipment catalog from the live materials app
-- (gg-materials-management.vercel.app/dashboard/admin → Equipment). Reusable gear:
-- par is per-truck; total_on_hand is the count owned. Idempotent by unique name.

INSERT INTO equipment (name, par, total_on_hand, sort_order, active) VALUES
  ('Speed Pack',      1,  13, 1, TRUE),
  ('Hand Truck',      3,  11, 2, TRUE),
  ('Four Wheeler',    3,  13, 3, TRUE),
  ('E-Track Straps',  8,  18, 4, TRUE),
  ('Tools / Toolbox', 1,   3, 5, TRUE),
  ('Floor Runners',   3,  13, 6, TRUE),
  ('Furniture Pads', 80, 372, 7, TRUE)
ON CONFLICT (name) DO UPDATE SET
  par           = EXCLUDED.par,
  total_on_hand = EXCLUDED.total_on_hand,
  sort_order    = EXCLUDED.sort_order,
  active        = TRUE,
  updated_at    = NOW();
