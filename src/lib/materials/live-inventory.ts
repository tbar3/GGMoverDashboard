import { query } from '@/lib/db';

// Ported verbatim from the live materials app (gg-materials-management) so the
// hub's Materials tab matches it exactly. Same tables; `jobs` → `materials_jobs`.

export interface InvMaterial { id: number; name: string; par: number }
export interface InvWarehouseCell {
  warehouseId: number;
  name: string;
  on_hand: number;
  low_level: number;
  low: boolean;
}
export interface InvTruckCell { truckId: number; name: string; on_hand: number }
export interface InventoryRow {
  material: InvMaterial;
  warehouses: InvWarehouseCell[];
  trucks: InvTruckCell[];
  total: number;
  low: boolean;
}
export interface InvEquipment {
  id: number;
  name: string;
  par: number;
  total_on_hand: number;
}
export interface StaleOpenJob {
  id: number;
  job_date: string;
  truck_name: string;
  sequence_no: number;
  status: string;
  customer: string | null;
}

// Live inventory: per material -> each warehouse (with its Low Level), each
// (active) truck, and total. A material is "low" if ANY warehouse is at/below
// its Low Level.
export async function getInventory(): Promise<InventoryRow[]> {
  const [materials, trucks, warehouses, wh, ts] = await Promise.all([
    query<{ id: number; name: string; par: number }>(
      'SELECT id, name, par FROM materials WHERE active = TRUE ORDER BY sort_order, name'
    ),
    query<{ id: number; name: string }>(
      'SELECT id, name FROM trucks WHERE active = TRUE ORDER BY sort_order, name'
    ),
    query<{ id: number; name: string }>(
      'SELECT id, name FROM warehouses WHERE active = TRUE ORDER BY sort_order, name'
    ),
    query<{ warehouse_id: number; material_id: number; on_hand: number; low_level: number }>(
      'SELECT warehouse_id, material_id, on_hand::float8 AS on_hand, low_level FROM warehouse_stock'
    ),
    query<{ truck_id: number; material_id: number; on_hand: number }>(
      'SELECT truck_id, material_id, on_hand::float8 AS on_hand FROM truck_stock'
    ),
  ]);

  const whBy = new Map<number, Map<number, { on_hand: number; low_level: number }>>();
  for (const r of wh) {
    if (!whBy.has(r.material_id)) whBy.set(r.material_id, new Map());
    whBy.get(r.material_id)!.set(r.warehouse_id, { on_hand: Number(r.on_hand), low_level: Number(r.low_level) });
  }
  const truckBy = new Map<number, Map<number, number>>();
  for (const r of ts) {
    if (!truckBy.has(r.material_id)) truckBy.set(r.material_id, new Map());
    truckBy.get(r.material_id)!.set(r.truck_id, Number(r.on_hand));
  }

  return materials.map((m) => {
    const perWarehouse = warehouses.map((w) => {
      const cell = whBy.get(m.id)?.get(w.id);
      const on_hand = cell?.on_hand ?? 0;
      const low_level = cell?.low_level ?? 0;
      return { warehouseId: w.id, name: w.name, on_hand, low_level, low: low_level > 0 && on_hand <= low_level };
    });
    const perTruck = trucks.map((t) => ({ truckId: t.id, name: t.name, on_hand: truckBy.get(m.id)?.get(t.id) ?? 0 }));
    const total =
      perWarehouse.reduce((s, w) => s + w.on_hand, 0) + perTruck.reduce((s, t) => s + t.on_hand, 0);
    const low = perWarehouse.some((w) => w.low);
    return { material: { id: m.id, name: m.name, par: Number(m.par) }, warehouses: perWarehouse, trucks: perTruck, total, low };
  });
}

export async function getEquipmentList(): Promise<InvEquipment[]> {
  return query<InvEquipment>(
    'SELECT id, name, par, total_on_hand FROM equipment WHERE active = TRUE ORDER BY sort_order, name'
  );
}

export async function getStaleOpenJobs(today: string): Promise<StaleOpenJob[]> {
  return query<StaleOpenJob>(
    `SELECT j.id, to_char(j.job_date,'YYYY-MM-DD') AS job_date,
            t.name AS truck_name, j.sequence_no, j.status, j.customer
       FROM materials_jobs j JOIN trucks t ON t.id = j.truck_id
      WHERE j.status <> 'complete' AND j.job_date < $1
      ORDER BY j.job_date ASC, t.name`,
    [today]
  );
}

// ── History tab ───────────────────────────────────────────────
export interface HistoryRow {
  id: number;
  job_date: string;
  truck_name: string;
  sequence_no: number;
  customer: string | null;
  status: string;
  total_used: number;
}

export async function getHistory(limit = 100): Promise<HistoryRow[]> {
  return query<HistoryRow>(
    `SELECT j.id, to_char(j.job_date,'YYYY-MM-DD') AS job_date, t.name AS truck_name,
            j.sequence_no, j.customer, j.status,
            COALESCE(SUM(c.used), 0)::float8 AS total_used
       FROM materials_jobs j
       JOIN trucks t ON t.id = j.truck_id
       LEFT JOIN job_counts c ON c.job_id = j.id
      GROUP BY j.id, t.name
      ORDER BY j.job_date DESC, t.name, j.sequence_no DESC
      LIMIT $1`,
    [limit]
  );
}

export interface AdjustmentHistRow {
  id: number;
  at: string;
  material_name: string;
  location: string;
  qty_delta: number;
  note: string | null;
  created_by: string | null;
}

export async function getAdjustments(limit = 200): Promise<AdjustmentHistRow[]> {
  return query<AdjustmentHistRow>(
    `SELECT tx.id, to_char(tx.created_at,'YYYY-MM-DD HH24:MI') AS at,
            m.name AS material_name,
            CASE WHEN tx.truck_id IS NOT NULL THEN t.name
                 WHEN tx.warehouse_id IS NOT NULL THEN wh.name
                 ELSE 'Warehouse' END AS location,
            tx.qty_delta::float8 AS qty_delta, tx.note, tx.created_by
       FROM inventory_transactions tx
       JOIN materials m ON m.id = tx.material_id
       LEFT JOIN trucks t ON t.id = tx.truck_id
       LEFT JOIN warehouses wh ON wh.id = tx.warehouse_id
      WHERE tx.type IN ('adjustment', 'adjust')
      ORDER BY tx.created_at DESC
      LIMIT $1`,
    [limit]
  );
}

// ── Reporting tab ─────────────────────────────────────────────
export interface UsageRow {
  material_id: number;
  name: string;
  total_used: number;
  cost: number;
  revenue: number;
  profit: number;
}
export async function getUsage(from: string, to: string): Promise<UsageRow[]> {
  return query<UsageRow>(
    `WITH used AS (
       SELECT material_id, COALESCE(SUM(qty_delta), 0)::int AS total_used
         FROM inventory_transactions
        WHERE type = 'use'
          AND created_at >= $1::date
          AND created_at < ($2::date + INTERVAL '1 day')
        GROUP BY material_id
     )
     SELECT m.id AS material_id, m.name,
            COALESCE(u.total_used, 0) AS total_used,
            ROUND(COALESCE(u.total_used,0) * m.cost_per_unit, 2)::float8   AS cost,
            ROUND(COALESCE(u.total_used,0) * m.charge_per_unit, 2)::float8 AS revenue,
            ROUND(COALESCE(u.total_used,0) * (m.charge_per_unit - m.cost_per_unit), 2)::float8 AS profit
       FROM materials m
       LEFT JOIN used u ON u.material_id = m.id
      WHERE m.active = TRUE
      ORDER BY m.sort_order, m.name`,
    [from, to]
  );
}

export interface LeakageMaterial {
  material_id: number;
  name: string;
  used: number | null;
  charged: number | null;
  charge_per_unit: number;
}
export interface LeakageJob {
  job_id: number;
  job_date: string;
  truck_name: string;
  sequence_no: number;
  customer: string | null;
  crew_lead: string | null;
  materials: LeakageMaterial[];
}
export async function getLeakageJobs(limit = 50): Promise<LeakageJob[]> {
  const rows = await query<{
    job_id: number;
    job_date: string;
    truck_name: string;
    sequence_no: number;
    customer: string | null;
    crew_lead: string | null;
    material_id: number;
    name: string;
    used: number | null;
    charged: number | null;
    charge_per_unit: number;
  }>(
    `SELECT j.id AS job_id, to_char(j.job_date,'YYYY-MM-DD') AS job_date,
            t.name AS truck_name, j.sequence_no, j.customer, j.crew_lead,
            c.material_id, m.name,
            c.used, c.charged, m.charge_per_unit::float8 AS charge_per_unit
       FROM materials_jobs j
       JOIN trucks t ON t.id = j.truck_id
       JOIN job_counts c ON c.job_id = j.id
       JOIN materials m ON m.id = c.material_id
      WHERE j.status = 'complete' AND COALESCE(c.used, 0) <> 0
      ORDER BY j.job_date DESC, t.name, j.sequence_no, m.sort_order
      LIMIT $1`,
    [limit * 25]
  );
  const byJob = new Map<number, LeakageJob>();
  for (const r of rows) {
    if (!byJob.has(r.job_id)) {
      byJob.set(r.job_id, {
        job_id: r.job_id,
        job_date: r.job_date,
        truck_name: r.truck_name,
        sequence_no: r.sequence_no,
        customer: r.customer,
        crew_lead: r.crew_lead,
        materials: [],
      });
    }
    byJob.get(r.job_id)!.materials.push({
      material_id: r.material_id,
      name: r.name,
      used: r.used === null ? null : Number(r.used),
      charged: r.charged === null ? null : Number(r.charged),
      charge_per_unit: Number(r.charge_per_unit),
    });
  }
  return Array.from(byJob.values()).slice(0, limit);
}

export interface Discrepancy {
  job_id: number;
  job_date: string;
  prev_date: string | null;
  truck_name: string;
  material_name: string;
  crew_lead: string | null;
  expected: number;
  counted: number;
  diff: number;
  is_overnight: boolean;
}
export async function getDiscrepancies(limit = 200): Promise<Discrepancy[]> {
  return query<Discrepancy>(
    `WITH ordered AS (
       SELECT j.id AS job_id, to_char(j.job_date,'YYYY-MM-DD') AS job_date,
              j.job_date AS d, j.truck_id, t.name AS truck_name, j.crew_lead,
              c.material_id, m.name AS material_name,
              c.pre_dispatch, c.post_job,
              LAG(c.post_job)  OVER w AS prev_post_job,
              LAG(j.job_date)  OVER w AS prev_d
         FROM materials_jobs j
         JOIN trucks t ON t.id = j.truck_id
         JOIN job_counts c ON c.job_id = j.id
         JOIN materials m ON m.id = c.material_id
        WHERE j.status = 'complete'
       WINDOW w AS (PARTITION BY j.truck_id, c.material_id
                    ORDER BY j.job_date, j.sequence_no, j.id)
     )
     SELECT job_id, job_date, to_char(prev_d,'YYYY-MM-DD') AS prev_date,
            truck_name, material_name, crew_lead,
            prev_post_job AS expected,
            pre_dispatch AS counted,
            (pre_dispatch - prev_post_job) AS diff,
            (prev_d <> d) AS is_overnight
       FROM ordered
      WHERE prev_post_job IS NOT NULL
        AND pre_dispatch IS NOT NULL
        AND pre_dispatch <> prev_post_job
      ORDER BY d DESC, truck_name, material_name
      LIMIT $1`,
    [limit]
  );
}

export interface BurnRow {
  material_id: number;
  name: string;
  threshold: number;
  used: number;
  total: number;
}
export async function getUsageRates(windowDays: number): Promise<BurnRow[]> {
  return query<BurnRow>(
    `WITH used AS (
       SELECT material_id, COALESCE(SUM(qty_delta),0)::int AS used
         FROM inventory_transactions
        WHERE type = 'use'
          AND created_at >= NOW() - ($1 * INTERVAL '1 day')
        GROUP BY material_id
     ),
     stock AS (
       SELECT m.id,
              COALESCE(w.tot,0) + COALESCE(t.tot,0) AS total,
              COALESCE(w.low,0) AS low_total
         FROM materials m
         LEFT JOIN (
           SELECT material_id, SUM(on_hand) AS tot, SUM(low_level) AS low
             FROM warehouse_stock GROUP BY material_id
         ) w ON w.material_id = m.id
         LEFT JOIN (
           SELECT material_id, SUM(on_hand) AS tot FROM truck_stock GROUP BY material_id
         ) t ON t.material_id = m.id
     )
     SELECT m.id AS material_id, m.name,
            COALESCE(s.low_total,0)::int AS threshold,
            COALESCE(u.used,0) AS used, COALESCE(s.total,0)::int AS total
       FROM materials m
       LEFT JOIN used u ON u.material_id = m.id
       LEFT JOIN stock s ON s.id = m.id
      WHERE m.active = TRUE
      ORDER BY m.sort_order, m.name`,
    [windowDays]
  );
}
