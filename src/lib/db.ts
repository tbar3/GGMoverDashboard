import { Pool, types } from 'pg';

// Return NUMERIC/DECIMAL columns as JS numbers instead of pg's default strings.
// The materials module does arithmetic on quantities (counts, on-hand, par) that
// use NUMERIC to allow half units, and the rest of the app already coerces money
// columns with Number(), so parsing them up front is safe and more correct.
types.setTypeParser(types.builtins.NUMERIC, (val) =>
  val === null ? null : parseFloat(val)
);

const baseUrl = process.env.DATABASE_URL?.replace(
  'sslmode=require',
  'sslmode=verify-full'
);

const connectionString = baseUrl?.includes('?')
  ? `${baseUrl}&options=-c search_path=mover_dashboard`
  : `${baseUrl}?options=-c search_path=mover_dashboard`;

const pool = new Pool({
  connectionString,
  // Verify the server certificate (Neon is signed by a public CA in Node's trust
  // store) so the sslmode=verify-full above is actually enforced — otherwise the
  // DB connection would be open to a man-in-the-middle. Verified against the live
  // Neon endpoint before enabling.
  ssl: { rejectUnauthorized: true },
});

/**
 * A pooled client can die while idle — a Neon idle timeout, a laptop sleeping, a
 * network blip. `pg` emits 'error' on the pool for that, and with no listener
 * Node turns it into an uncaughtException that takes the whole process down.
 * Log it and let the pool discard the client; the next query opens a fresh one.
 */
pool.on('error', (err) => {
  console.error('[db] idle client error (connection discarded):', err.message);
});

export async function query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Run several statements in one transaction. The callback gets a pooled client
 * whose search_path is already the app schema (via the pool connection string).
 * Commits on success, rolls back on any thrown error. Used by the materials
 * module, whose inventory writes must be all-or-nothing.
 */
export async function withTransaction<T>(
  fn: (client: import('pg').PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export { pool };
