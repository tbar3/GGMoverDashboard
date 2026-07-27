-- Add the "Trailer" truck (present in the live materials app but missing here) and
-- load its current stock so on-hand totals match the live app exactly. Its home
-- warehouse is the primary warehouse. Idempotent.

INSERT INTO trucks (name, sort_order, warehouse_id, active)
SELECT 'Trailer',
       COALESCE((SELECT MAX(sort_order) FROM trucks), 0) + 1,
       (SELECT id FROM warehouses ORDER BY id LIMIT 1),
       TRUE
ON CONFLICT (name) DO NOTHING;

WITH data(name, qty) AS (
  VALUES
    ('Small Box (1.5)',                 6),
    ('Medium Box (3.1)',                6),
    ('Large Box (4.5)',                 6),
    ('Dish Pack',                       0),
    ('Wardrobe 24"',                    3),
    ('Mirror Slice 40x60',              8),
    ('Paper Pads',                      3),
    ('Plastic Mattress Bags',           0),
    ('Packing Paper (per HALF bundle)', 0),
    ('Shrink Wrap',                     0),
    ('Tape',                           -4)
),
t AS (SELECT id FROM trucks WHERE name = 'Trailer')
INSERT INTO truck_stock (truck_id, material_id, on_hand, updated_at)
SELECT t.id, m.id, d.qty, NOW()
  FROM data d JOIN materials m ON m.name = d.name CROSS JOIN t
ON CONFLICT (truck_id, material_id)
  DO UPDATE SET on_hand = EXCLUDED.on_hand, updated_at = NOW();
