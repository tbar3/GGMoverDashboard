-- Seed the materials catalog from the live materials app
-- (gg-materials-management.vercel.app/dashboard/admin): name, par (low/top-up
-- level), reorder_threshold (Atlanta warehouse Low Level), cost_per_unit, and
-- charge_per_unit (price to the customer). Idempotent by unique name.

INSERT INTO materials (name, par, reorder_threshold, cost_per_unit, charge_per_unit, sort_order, active) VALUES
  ('Small Box (1.5)',                12,  72,  0.88,  2.35,  1, TRUE),
  ('Medium Box (3.1)',               10,  60,  1.60,  4.35,  2, TRUE),
  ('Large Box (4.5)',                 8,  48,  1.95,  5.35,  3, TRUE),
  ('Dish Pack',                       3,  18,  3.95, 15.00,  4, TRUE),
  ('Wardrobe 24"',                    5,  30,  7.10, 15.00,  5, TRUE),
  ('Mirror Slice 40x60',             20, 120,  1.07,  3.00,  6, TRUE),
  ('Paper Pads',                     10,  60,  1.27,  5.00,  7, TRUE),
  ('Plastic Mattress Bags',           3,  18,  6.59, 12.00,  8, TRUE),
  ('Packing Paper (per HALF bundle)', 2,  12,  9.38, 18.75,  9, TRUE),
  ('Shrink Wrap',                     4,  32,  6.24,  0.00, 10, TRUE),
  ('Tape',                           24, 144,  1.57,  0.00, 11, TRUE)
ON CONFLICT (name) DO UPDATE SET
  par               = EXCLUDED.par,
  reorder_threshold = EXCLUDED.reorder_threshold,
  cost_per_unit     = EXCLUDED.cost_per_unit,
  charge_per_unit   = EXCLUDED.charge_per_unit,
  sort_order        = EXCLUDED.sort_order,
  active            = TRUE,
  updated_at        = NOW();
