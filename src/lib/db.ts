import { Pool } from 'pg';

const baseUrl = process.env.DATABASE_URL?.replace(
  'sslmode=require',
  'sslmode=verify-full'
);

const connectionString = baseUrl?.includes('?')
  ? `${baseUrl}&options=-c search_path=mover_dashboard`
  : `${baseUrl}?options=-c search_path=mover_dashboard`;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

export async function query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export { pool };
