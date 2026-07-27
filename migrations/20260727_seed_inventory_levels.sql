-- Seed current on-hand inventory (warehouse + trucks) from the live materials app
-- On-Hand matrix. Warehouse = 1285 Collier Rd. Trucks matched by name:
-- OG, Bus, Trace, Penske 26', Idealease Izuzu 26' (live "Idealease 26'"),
-- Idealease Izuzu 16' (live "Idealease 16'").
--
-- The live app also has "Penske 16'" (all zeros) and "Trailer" (holds stock) —
-- those trucks don't exist in this dashboard, so their columns are NOT imported.
-- Idempotent (upsert on the stock PKs). Negative values are copied as-is to match.

-- Warehouse stock
WITH data(name, low, wh) AS (
  VALUES
    ('Small Box (1.5)',                 72, 405),
    ('Medium Box (3.1)',                60, 110),
    ('Large Box (4.5)',                 48,  40),
    ('Dish Pack',                       18,  27),
    ('Wardrobe 24"',                    30, 138),
    ('Mirror Slice 40x60',             120, 335),
    ('Paper Pads',                      60, 440),
    ('Plastic Mattress Bags',           18,  28),
    ('Packing Paper (per HALF bundle)', 12, 148),
    ('Shrink Wrap',                     32,  38),
    ('Tape',                           144, 792)
),
w AS (SELECT id FROM warehouses ORDER BY id LIMIT 1)
INSERT INTO warehouse_stock (warehouse_id, material_id, on_hand, low_level, updated_at)
SELECT w.id, m.id, d.wh, d.low, NOW()
  FROM data d JOIN materials m ON m.name = d.name CROSS JOIN w
ON CONFLICT (warehouse_id, material_id)
  DO UPDATE SET on_hand = EXCLUDED.on_hand, low_level = EXCLUDED.low_level, updated_at = NOW();

-- Truck stock (columns: OG, Bus, Trace, Penske 26', Idealease Izuzu 26', Idealease Izuzu 16')
WITH data(name, og, bus, trace, penske26, ide26, ide16) AS (
  VALUES
    ('Small Box (1.5)',                  25, 12,  0, 0, -10,  -6),
    ('Medium Box (3.1)',                 64, 10,  0, 0, -47, -13),
    ('Large Box (4.5)',                  13,  8,  0, 0,  -2,  -9),
    ('Dish Pack',                        10,  3,  0, 0,  -7, -10),
    ('Wardrobe 24"',                      0,  0,  0, 0,  -9,   0),
    ('Mirror Slice 40x60',               10, 25,  5, 0,  40,   7),
    ('Paper Pads',                        5,  0,  0, 0,  35,  -4),
    ('Plastic Mattress Bags',             5,  1,  2, 0,   3,   0),
    ('Packing Paper (per HALF bundle)',   4,  2,  4, 0,  -2,   0),
    ('Shrink Wrap',                       5,  2,  3, 0,   1,  -2),
    ('Tape',                             -3, 40, 10, 0, -14, -36)
)
INSERT INTO truck_stock (truck_id, material_id, on_hand, updated_at)
SELECT t.id, m.id,
       CASE t.name
         WHEN 'OG' THEN d.og
         WHEN 'Bus' THEN d.bus
         WHEN 'Trace' THEN d.trace
         WHEN 'Penske 26''' THEN d.penske26
         WHEN 'Idealease Izuzu 26''' THEN d.ide26
         WHEN 'Idealease Izuzu 16''' THEN d.ide16
       END,
       NOW()
  FROM data d
  JOIN materials m ON m.name = d.name
  JOIN trucks t ON t.name IN ('OG','Bus','Trace','Penske 26''','Idealease Izuzu 26''','Idealease Izuzu 16''')
ON CONFLICT (truck_id, material_id)
  DO UPDATE SET on_hand = EXCLUDED.on_hand, updated_at = NOW();
