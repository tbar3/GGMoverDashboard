import { query } from '@/lib/db';

export interface Message {
  id: string;
  author_id: string | null;
  author_name: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Message board feed — pinned first, then newest. Read by any employee (crew
 * dashboard) and by back office (manage page). Reads are safe for all
 * employees; writes are guarded in the server actions.
 */
export async function getMessages(limit?: number): Promise<Message[]> {
  const sql = `SELECT * FROM messages ORDER BY pinned DESC, created_at DESC${
    limit ? ` LIMIT ${Number(limit)}` : ''
  }`;
  return query<Message>(sql);
}
