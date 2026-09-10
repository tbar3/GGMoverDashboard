-- Materials: Offload + count-wins reconciliation
--
-- Negative on-hand values came from two places:
--   1. applyJobEffect() applied the count sheet as a DELTA to truck_stock
--      instead of trusting the crew's physical Pre-Dispatch count, so any
--      divergence between ledger and reality compounded forever.
--   2. There was no truck -> warehouse path, so material loaded onto a truck
--      could never come back and the warehouse was never credited.
--
-- This migration adds what the new math needs, reconciles the existing
-- negatives to zero (logged as variance so nothing disappears silently), and
-- locks truck_stock non-negative. warehouse_stock deliberately keeps NO check:
-- a negative there is a real signal (material used that was never received)
-- and is surfaced to the back office rather than blocking a crew in the field.

-- Snapshot of truck on_hand before a job applied, so an absolute set stays
-- reversible when the back office edits a completed job.
ALTER TABLE job_counts ADD COLUMN IF NOT EXISTS truck_on_hand_before NUMERIC(10,2);

-- Group the ledger rows of one offload event so it reads (and could be undone)
-- as a single unit.
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS batch_id UUID;
CREATE INDEX IF NOT EXISTS idx_txn_batch ON inventory_transactions(batch_id);
CREATE INDEX IF NOT EXISTS idx_txn_truck_created ON inventory_transactions(truck_id, created_at);

-- createJob already catches 23505 for a duplicate sheet, but nothing enforced it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_materials_jobs_truck_date_seq
  ON materials_jobs(truck_id, job_date, sequence_no);

-- One-time reconciliation: bring every existing negative up to zero and record
-- the correction as a variance row so the history explains the jump.
INSERT INTO inventory_transactions (material_id, truck_id, type, qty_delta, note)
  SELECT material_id, truck_id, 'variance', -on_hand, 'Opening reconciliation'
    FROM truck_stock WHERE on_hand < 0;
UPDATE truck_stock SET on_hand = 0, updated_at = NOW() WHERE on_hand < 0;

INSERT INTO inventory_transactions (material_id, warehouse_id, type, qty_delta, note)
  SELECT material_id, warehouse_id, 'variance', -on_hand, 'Opening reconciliation'
    FROM warehouse_stock WHERE on_hand < 0;
UPDATE warehouse_stock SET on_hand = 0, updated_at = NOW() WHERE on_hand < 0;

-- Every truck_stock write is now either an absolute set from a validated
-- non-negative physical count, a clamped offload, or a restored snapshot.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'truck_stock_non_negative'
  ) THEN
    ALTER TABLE truck_stock
      ADD CONSTRAINT truck_stock_non_negative CHECK (on_hand >= 0);
  END IF;
END $$;
