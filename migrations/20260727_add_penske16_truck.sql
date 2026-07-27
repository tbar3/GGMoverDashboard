-- Add the "Penske 16'" truck (present in the live materials app, empty there) so
-- the truck roster matches exactly. All materials start at 0. Idempotent.

INSERT INTO trucks (name, sort_order, warehouse_id, active)
SELECT 'Penske 16''',
       COALESCE((SELECT MAX(sort_order) FROM trucks), 0) + 1,
       (SELECT id FROM warehouses ORDER BY id LIMIT 1),
       TRUE
ON CONFLICT (name) DO NOTHING;

WITH t AS (SELECT id FROM trucks WHERE name = 'Penske 16''')
INSERT INTO truck_stock (truck_id, material_id, on_hand, updated_at)
SELECT t.id, m.id, 0, NOW()
  FROM materials m CROSS JOIN t
ON CONFLICT (truck_id, material_id)
  DO UPDATE SET on_hand = 0, updated_at = NOW();
