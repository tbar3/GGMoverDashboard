-- Re-add the truck_stock non-negative CHECK dropped by
-- 20260909_1130_drop_truck_stock_check_until_deploy.sql.
--
-- RUN THIS ONLY AFTER the count-wins code is deployed to production. Once it is,
-- every truck_stock write is an absolute set from a validated non-negative count,
-- a clamped offload, or a restored snapshot — so the constraint cannot fire in
-- normal use, and if it ever does it means a new write path skipped validation.
--
-- Any negatives the old code wrote during the deploy window are zeroed first and
-- logged, the same way the original reconciliation did.
INSERT INTO inventory_transactions (material_id, truck_id, type, qty_delta, note)
  SELECT material_id, truck_id, 'variance', -on_hand, 'Deploy-window reconciliation'
    FROM truck_stock WHERE on_hand < 0;
UPDATE truck_stock SET on_hand = 0, updated_at = NOW() WHERE on_hand < 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'truck_stock_non_negative'
  ) THEN
    ALTER TABLE truck_stock
      ADD CONSTRAINT truck_stock_non_negative CHECK (on_hand >= 0);
  END IF;
END $$;
