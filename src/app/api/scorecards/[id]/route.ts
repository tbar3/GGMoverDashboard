import { queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const row = await queryOne(
    `SELECT s.*, c.name AS candidate_name, c.position AS candidate_position,
            c.phone AS candidate_phone, c.referred_by AS candidate_referred_by
     FROM interview_scorecards s
     JOIN candidates c ON c.id = s.candidate_id
     WHERE s.id = $1`,
    [id]
  );

  if (!row) return NextResponse.json({ error: 'Scorecard not found' }, { status: 404 });
  return NextResponse.json(row);
}
